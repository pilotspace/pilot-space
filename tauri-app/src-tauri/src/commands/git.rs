use std::cell::Cell;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use git2::{
    build::{CheckoutBuilder, RepoBuilder},
    BranchType, Cred, CredentialType, FetchOptions, MergeOptions, PushOptions, RemoteCallbacks,
    Repository, StatusOptions,
};
use tauri::ipc::Channel;
use tauri_plugin_store::StoreExt;

use crate::commands::workspace::ProjectEntry;

const KEYCHAIN_SERVICE: &str = "io.pilotspace.app";
const KEYCHAIN_GIT_ACCOUNT: &str = "git_pat";
const KEYCHAIN_GIT_USERNAME: &str = "git_username";
const WORKSPACE_STORE: &str = "workspace-config.json";

/// Progress event sent to the frontend via Channel during a git operation.
#[derive(serde::Serialize, Clone)]
pub struct GitProgress {
    pub pct: u32,
    pub message: String,
}

/// Information about stored git credentials — never returns the PAT value to the frontend.
#[derive(serde::Serialize, Clone)]
pub struct GitCredentialInfo {
    pub username: String,
    pub has_pat: bool,
}

/// Result of a `git_pull` operation.
#[derive(serde::Serialize, Clone)]
pub struct GitPullResult {
    /// `true` if any commits were merged; `false` if already up to date.
    pub updated: bool,
    /// Paths of conflicted files relative to repo root (empty if no conflicts).
    pub conflicts: Vec<String>,
}

/// Status of a single file in the working tree / index.
#[derive(serde::Serialize, Clone)]
pub struct FileStatus {
    pub path: String,
    /// One of: "modified", "added", "deleted", "renamed", "untracked", "conflicted"
    pub status: String,
    /// `true` if the change is in the index (staged).
    pub staged: bool,
}

/// Overall status of a git repository.
#[derive(serde::Serialize, Clone)]
pub struct GitRepoStatus {
    pub files: Vec<FileStatus>,
    /// Current branch name, or `"HEAD (detached)"` for detached HEAD state.
    pub branch: String,
    /// Number of commits ahead of the upstream tracking branch.
    pub ahead: u32,
    /// Number of commits behind the upstream tracking branch.
    pub behind: u32,
}

/// Summary of a single branch.
#[derive(serde::Serialize, Clone)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    /// Upstream tracking branch name, e.g. `"origin/main"`.
    pub upstream: Option<String>,
}

/// Module-level cancel flag; reset to `false` at the start of each new clone.
static CLONE_CANCEL: std::sync::OnceLock<Arc<AtomicBool>> = std::sync::OnceLock::new();

fn get_cancel_flag() -> Arc<AtomicBool> {
    CLONE_CANCEL
        .get_or_init(|| Arc::new(AtomicBool::new(false)))
        .clone()
}

// ── Credential helper ────────────────────────────────────────────────────────

/// Build a `RemoteCallbacks` with the keychain credential callback and an optional transfer
/// progress handler that sends `GitProgress` events over `channel`.
///
/// The attempt counter is capped at 3 to avoid infinite credential loops.
///
/// `progress_scale` maps the raw `received_objects/total_objects` 0–100 range into the
/// caller-supplied `[progress_offset, progress_offset + progress_range]` range so that pull
/// can emit 0–50 for the fetch phase.  Pass `(0, 100)` for a full-range progress.
fn build_callbacks(
    channel: Option<&Channel<GitProgress>>,
    progress_offset: u32,
    progress_range: u32,
) -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();

    if let Some(ch) = channel {
        let ch = ch.clone();
        let last_pct: Cell<u32> = Cell::new(0);

        callbacks.transfer_progress(move |stats| {
            if stats.total_objects() > 0 {
                let raw = (stats.received_objects() * 100 / stats.total_objects().max(1)) as u32;
                let pct = progress_offset + raw * progress_range / 100;

                if pct >= last_pct.get() + 2 || pct == progress_offset + progress_range {
                    last_pct.set(pct);
                    let _ = ch.send(GitProgress {
                        pct,
                        message: format!(
                            "{}/{} objects",
                            stats.received_objects(),
                            stats.total_objects()
                        ),
                    });
                }
            }
            true
        });
    }

    let attempt_count: Cell<u32> = Cell::new(0);

    callbacks.credentials(move |_url, username_from_url, allowed_types| {
        let attempt = attempt_count.get();
        if attempt >= 3 {
            return Err(git2::Error::from_str(
                "Authentication failed after 3 attempts — check credentials via set_git_credentials",
            ));
        }
        attempt_count.set(attempt + 1);

        if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
            let pat = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_ACCOUNT)
                .and_then(|e| e.get_password())
                .ok();

            let username = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_USERNAME)
                .and_then(|e| e.get_password())
                .ok()
                .or_else(|| username_from_url.map(String::from))
                .unwrap_or_else(|| "git".to_string());

            match pat {
                Some(p) => Cred::userpass_plaintext(&username, &p),
                None => Err(git2::Error::from_str(
                    "No git credentials configured — use set_git_credentials first",
                )),
            }
        } else {
            Err(git2::Error::from_str(
                "Only HTTPS PAT authentication is supported",
            ))
        }
    });

    callbacks
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// Clone a git repository from `url` into `target_dir`, streaming progress to `on_progress`.
///
/// - Progress events are throttled to 2% increments to avoid flooding the WebView.
/// - The operation can be cancelled mid-way via `cancel_clone`.
/// - HTTPS credentials are read from the OS keychain (PAT set via `set_git_credentials`).
/// - The cloned repo is automatically added to the managed projects list.
///
/// IMPORTANT: All git2 operations run in `spawn_blocking` because `Repository` is NOT `Send`.
#[tauri::command]
pub async fn git_clone(
    app: tauri::AppHandle,
    url: String,
    target_dir: String,
    on_progress: Channel<GitProgress>,
) -> Result<(), String> {
    // Reset cancel flag for this new clone operation
    get_cancel_flag().store(false, Ordering::Relaxed);

    let cancel_flag = get_cancel_flag();
    let url_clone = url.clone();
    let target_path = PathBuf::from(&target_dir);
    let on_progress_clone = on_progress.clone();

    // Run all git2 operations on a blocking thread — Repository is NOT Send
    let result = tauri::async_runtime::spawn_blocking(move || {
        let cancel = cancel_flag;
        let prog = on_progress_clone;

        let mut callbacks = RemoteCallbacks::new();

        // Track last sent percentage to implement 2% throttle
        let last_pct: Cell<u32> = Cell::new(0);

        callbacks.transfer_progress(move |stats| {
            // Check for cancellation on each progress tick
            if cancel.load(Ordering::Relaxed) {
                return false; // Returning false aborts the transfer
            }

            if stats.total_objects() > 0 {
                let pct =
                    (stats.received_objects() * 100 / stats.total_objects().max(1)) as u32;

                // Throttle: only send when pct changes by >= 2, or at 100%
                if pct >= last_pct.get() + 2 || pct == 100 {
                    last_pct.set(pct);
                    let _ = prog.send(GitProgress {
                        pct,
                        message: format!(
                            "{}/{} objects",
                            stats.received_objects(),
                            stats.total_objects()
                        ),
                    });
                }
            }

            true
        });

        // Credential callback with loop detection (max 3 attempts)
        let attempt_count: Cell<u32> = Cell::new(0);

        callbacks.credentials(move |_url, username_from_url, allowed_types| {
            let attempt = attempt_count.get();
            if attempt >= 3 {
                return Err(git2::Error::from_str(
                    "Authentication failed after 3 attempts — check credentials via set_git_credentials",
                ));
            }
            attempt_count.set(attempt + 1);

            if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
                // Read PAT from OS keychain
                let pat = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_ACCOUNT)
                    .and_then(|e| e.get_password())
                    .ok();

                let username = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_USERNAME)
                    .and_then(|e| e.get_password())
                    .ok()
                    .or_else(|| username_from_url.map(String::from))
                    .unwrap_or_else(|| "git".to_string());

                match pat {
                    Some(p) => Cred::userpass_plaintext(&username, &p),
                    None => Err(git2::Error::from_str(
                        "No git credentials configured — use set_git_credentials first",
                    )),
                }
            } else {
                Err(git2::Error::from_str(
                    "Only HTTPS PAT authentication is supported",
                ))
            }
        });

        let mut fo = FetchOptions::new();
        fo.remote_callbacks(callbacks);

        RepoBuilder::new()
            .fetch_options(fo)
            .clone(&url_clone, &target_path)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    // Send 100% completion event
    let _ = on_progress.send(GitProgress {
        pct: 100,
        message: "Clone complete".to_string(),
    });

    // Add the cloned repo to the managed projects list in workspace-config.json
    let target_path = PathBuf::from(&target_dir);
    let name = target_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".to_string());

    // Extract remote URL from the cloned repo's .git/config
    let remote_url = extract_remote_url_from_path(&target_path);

    let entry = ProjectEntry {
        name,
        path: target_path.to_string_lossy().into_owned(),
        remote_url,
        linked: false,
        added_at: chrono::Utc::now().to_rfc3339(),
    };

    // Append to projects array in Store (non-fatal if Store write fails)
    let _ = append_project_to_store(&app, entry);

    let _ = result; // result is () — satisfying the lint

    Ok(())
}

/// Sets the cancellation flag so the in-progress clone will abort on the next progress tick.
#[tauri::command]
pub fn cancel_clone() -> Result<(), String> {
    get_cancel_flag().store(true, Ordering::Relaxed);
    Ok(())
}

/// Stores a GitHub/GitLab PAT and username in the OS keychain for use in git clone.
///
/// The PAT is never returned to the frontend — use `get_git_credentials` to check status.
#[tauri::command]
pub async fn set_git_credentials(username: String, pat: String) -> Result<(), String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_ACCOUNT)
        .map_err(|e| e.to_string())?
        .set_password(&pat)
        .map_err(|e| e.to_string())?;

    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_USERNAME)
        .map_err(|e| e.to_string())?
        .set_password(&username)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Returns the stored git username and whether a PAT is configured.
///
/// The actual PAT value is NEVER returned — only `has_pat: bool`.
#[tauri::command]
pub async fn get_git_credentials() -> Result<Option<GitCredentialInfo>, String> {
    let username = match keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_USERNAME)
        .and_then(|e| e.get_password())
    {
        Ok(u) => u,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(_) => return Ok(None),
    };

    let has_pat = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_ACCOUNT)
        .and_then(|e| e.get_password())
        .is_ok();

    Ok(Some(GitCredentialInfo { username, has_pat }))
}

/// Fetches from `origin` and fast-forward merges (or detects conflicts for normal merges).
///
/// Returns `GitPullResult`:
/// - `updated: false` + empty conflicts → already up to date
/// - `updated: true` + empty conflicts → merge succeeded
/// - `updated: true` + non-empty conflicts → merge has conflicts; user must resolve
///
/// IMPORTANT: All git2 operations run in `spawn_blocking` because `Repository` is NOT `Send`.
#[tauri::command]
pub async fn git_pull(
    repo_path: String,
    on_progress: Channel<GitProgress>,
) -> Result<GitPullResult, String> {
    let on_progress_clone = on_progress.clone();

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<GitPullResult, String> {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;

        // ── Step 1: Fetch ────────────────────────────────────────────────────
        let mut remote = repo.find_remote("origin").map_err(|e| {
            format!("No remote 'origin' found: {e}")
        })?;

        let callbacks = build_callbacks(Some(&on_progress_clone), 0, 50);
        let mut fo = FetchOptions::new();
        fo.remote_callbacks(callbacks);

        remote
            .fetch(
                &["refs/heads/*:refs/remotes/origin/*"],
                Some(&mut fo),
                None,
            )
            .map_err(|e| e.to_string())?;

        let _ = on_progress_clone.send(GitProgress {
            pct: 50,
            message: "Fetch complete, merging...".to_string(),
        });

        // ── Step 2: Determine branch and upstream ref ────────────────────────
        let head = repo.head().map_err(|e| e.to_string())?;
        let branch_name = head
            .shorthand()
            .ok_or_else(|| "HEAD is detached — cannot pull into detached HEAD state".to_string())?
            .to_string();

        let upstream_ref_name = format!("refs/remotes/origin/{}", branch_name);
        let upstream_ref = repo
            .find_reference(&upstream_ref_name)
            .map_err(|e| format!("Upstream ref '{upstream_ref_name}' not found: {e}"))?;

        let annotated_commit = repo
            .reference_to_annotated_commit(&upstream_ref)
            .map_err(|e| e.to_string())?;

        // ── Step 3: Merge analysis ───────────────────────────────────────────
        let (analysis, _preference) = repo
            .merge_analysis(&[&annotated_commit])
            .map_err(|e| e.to_string())?;

        if analysis.is_up_to_date() {
            let _ = on_progress_clone.send(GitProgress {
                pct: 100,
                message: "Already up to date".to_string(),
            });
            return Ok(GitPullResult {
                updated: false,
                conflicts: vec![],
            });
        }

        if analysis.is_fast_forward() {
            // Fast-forward: move the branch ref to the fetched commit
            let refname = format!("refs/heads/{}", branch_name);
            let mut reference = repo.find_reference(&refname).map_err(|e| e.to_string())?;
            reference
                .set_target(annotated_commit.id(), "fast-forward pull")
                .map_err(|e| e.to_string())?;
            repo.set_head(&refname).map_err(|e| e.to_string())?;
            repo.checkout_head(Some(CheckoutBuilder::default().force()))
                .map_err(|e| e.to_string())?;

            let _ = on_progress_clone.send(GitProgress {
                pct: 100,
                message: "Pull complete (fast-forward)".to_string(),
            });
            return Ok(GitPullResult {
                updated: true,
                conflicts: vec![],
            });
        }

        if analysis.is_normal() {
            // Normal (non-fast-forward) merge
            repo.merge(&[&annotated_commit], Some(&mut MergeOptions::new()), None)
                .map_err(|e| e.to_string())?;

            // Collect any conflicted files
            let statuses = repo.statuses(None).map_err(|e| e.to_string())?;
            let conflicts: Vec<String> = statuses
                .iter()
                .filter(|e| e.status().is_conflicted())
                .filter_map(|e| e.path().map(String::from))
                .collect();

            if !conflicts.is_empty() {
                // Do NOT auto-commit — return conflicts for user to resolve
                let _ = on_progress_clone.send(GitProgress {
                    pct: 100,
                    message: format!("{} conflict(s) require manual resolution", conflicts.len()),
                });
                return Ok(GitPullResult {
                    updated: true,
                    conflicts,
                });
            }

            // No conflicts — create a merge commit
            let sig = repo.signature().map_err(|e| e.to_string())?;
            let head_commit = repo
                .head()
                .map_err(|e| e.to_string())?
                .peel_to_commit()
                .map_err(|e| e.to_string())?;
            let upstream_commit = repo
                .find_commit(annotated_commit.id())
                .map_err(|e| e.to_string())?;

            let tree_oid = repo
                .index()
                .map_err(|e| e.to_string())?
                .write_tree()
                .map_err(|e| e.to_string())?;
            let tree = repo.find_tree(tree_oid).map_err(|e| e.to_string())?;

            repo.commit(
                Some("HEAD"),
                &sig,
                &sig,
                "Merge remote-tracking branch",
                &tree,
                &[&head_commit, &upstream_commit],
            )
            .map_err(|e| e.to_string())?;

            repo.cleanup_state().map_err(|e| e.to_string())?;

            let _ = on_progress_clone.send(GitProgress {
                pct: 100,
                message: "Pull complete (merge commit)".to_string(),
            });
            return Ok(GitPullResult {
                updated: true,
                conflicts: vec![],
            });
        }

        Err("Unexpected merge analysis result".to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))??;

    Ok(result)
}

/// Pushes the current branch's commits to `origin`, streaming progress to `on_progress`.
///
/// - Refuses to push from a detached HEAD.
/// - Uses the same keychain credential pattern as `git_clone` and `git_pull`.
///
/// IMPORTANT: All git2 operations run in `spawn_blocking` because `Repository` is NOT `Send`.
#[tauri::command]
pub async fn git_push(
    repo_path: String,
    on_progress: Channel<GitProgress>,
) -> Result<(), String> {
    let on_progress_clone = on_progress.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;

        // Get the current branch name — error if detached
        let head = repo.head().map_err(|e| e.to_string())?;
        let branch_name = head
            .shorthand()
            .ok_or_else(|| "HEAD is detached — cannot push from detached HEAD state".to_string())?
            .to_string();

        let mut remote = repo.find_remote("origin").map_err(|e| {
            format!("No remote 'origin' found: {e}")
        })?;

        let mut callbacks = RemoteCallbacks::new();

        // Push progress: throttle by 2%
        let prog = on_progress_clone.clone();
        let last_pct: Cell<u32> = Cell::new(0);
        callbacks.push_transfer_progress(move |current, total, _bytes| {
            if total > 0 {
                let pct = (current * 100 / total.max(1)) as u32;
                if pct >= last_pct.get() + 2 || pct == 100 {
                    last_pct.set(pct);
                    let _ = prog.send(GitProgress {
                        pct,
                        message: format!("{current}/{total} objects"),
                    });
                }
            }
        });

        // Credential callback (identical to git_clone / git_pull pattern)
        let attempt_count: Cell<u32> = Cell::new(0);
        callbacks.credentials(move |_url, username_from_url, allowed_types| {
            let attempt = attempt_count.get();
            if attempt >= 3 {
                return Err(git2::Error::from_str(
                    "Authentication failed after 3 attempts — check credentials via set_git_credentials",
                ));
            }
            attempt_count.set(attempt + 1);

            if allowed_types.contains(CredentialType::USER_PASS_PLAINTEXT) {
                let pat = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_ACCOUNT)
                    .and_then(|e| e.get_password())
                    .ok();

                let username = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_GIT_USERNAME)
                    .and_then(|e| e.get_password())
                    .ok()
                    .or_else(|| username_from_url.map(String::from))
                    .unwrap_or_else(|| "git".to_string());

                match pat {
                    Some(p) => Cred::userpass_plaintext(&username, &p),
                    None => Err(git2::Error::from_str(
                        "No git credentials configured — use set_git_credentials first",
                    )),
                }
            } else {
                Err(git2::Error::from_str(
                    "Only HTTPS PAT authentication is supported",
                ))
            }
        });

        let mut push_opts = PushOptions::new();
        push_opts.remote_callbacks(callbacks);

        let refspec = format!("refs/heads/{0}:refs/heads/{0}", branch_name);
        remote
            .push(&[&refspec], Some(&mut push_opts))
            .map_err(|e| e.to_string())?;

        let _ = on_progress_clone.send(GitProgress {
            pct: 100,
            message: "Push complete".to_string(),
        });

        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Returns the working tree + index status for the repository at `repo_path`.
///
/// Each changed file appears once per state combination (staged + unstaged can produce two entries).
///
/// IMPORTANT: All git2 operations run in `spawn_blocking` because `Repository` is NOT `Send`.
#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitRepoStatus, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<GitRepoStatus, String> {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;

        // ── Current branch ───────────────────────────────────────────────────
        let branch = match repo.head() {
            Ok(head) => head
                .shorthand()
                .map(String::from)
                .unwrap_or_else(|| "HEAD (detached)".to_string()),
            Err(_) => "HEAD (detached)".to_string(),
        };

        // ── Ahead / behind upstream ──────────────────────────────────────────
        let (ahead, behind) = compute_ahead_behind(&repo, &branch);

        // ── File statuses ────────────────────────────────────────────────────
        let mut status_opts = StatusOptions::new();
        status_opts
            .include_untracked(true)
            .recurse_untracked_dirs(true);

        let statuses = repo
            .statuses(Some(&mut status_opts))
            .map_err(|e| e.to_string())?;

        let mut files: Vec<FileStatus> = Vec::new();

        for entry in statuses.iter() {
            let path = entry
                .path()
                .map(String::from)
                .unwrap_or_else(|| "<unknown>".to_string());
            let s = entry.status();

            // Conflicted (both index and worktree)
            if s.is_conflicted() {
                files.push(FileStatus {
                    path,
                    status: "conflicted".to_string(),
                    staged: false,
                });
                continue;
            }

            // Index (staged) changes
            if s.contains(git2::Status::INDEX_NEW) {
                files.push(FileStatus {
                    path: path.clone(),
                    status: "added".to_string(),
                    staged: true,
                });
            }
            if s.contains(git2::Status::INDEX_MODIFIED) {
                files.push(FileStatus {
                    path: path.clone(),
                    status: "modified".to_string(),
                    staged: true,
                });
            }
            if s.contains(git2::Status::INDEX_DELETED) {
                files.push(FileStatus {
                    path: path.clone(),
                    status: "deleted".to_string(),
                    staged: true,
                });
            }
            if s.contains(git2::Status::INDEX_RENAMED) {
                files.push(FileStatus {
                    path: path.clone(),
                    status: "renamed".to_string(),
                    staged: true,
                });
            }

            // Worktree (unstaged) changes
            if s.contains(git2::Status::WT_MODIFIED) {
                files.push(FileStatus {
                    path: path.clone(),
                    status: "modified".to_string(),
                    staged: false,
                });
            }
            if s.contains(git2::Status::WT_NEW) {
                files.push(FileStatus {
                    path: path.clone(),
                    status: "untracked".to_string(),
                    staged: false,
                });
            }
            if s.contains(git2::Status::WT_DELETED) {
                files.push(FileStatus {
                    path: path.clone(),
                    status: "deleted".to_string(),
                    staged: false,
                });
            }
            if s.contains(git2::Status::WT_RENAMED) {
                files.push(FileStatus {
                    path,
                    status: "renamed".to_string(),
                    staged: false,
                });
            }
        }

        Ok(GitRepoStatus {
            files,
            branch,
            ahead,
            behind,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Returns all local and remote branches for the repository at `repo_path`.
///
/// Sorted: current branch first, then local alphabetically, then remote alphabetically.
///
/// IMPORTANT: All git2 operations run in `spawn_blocking` because `Repository` is NOT `Send`.
#[tauri::command]
pub async fn git_branch_list(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<BranchInfo>, String> {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;

        let current = repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(String::from));

        let mut local_branches: Vec<BranchInfo> = Vec::new();
        let mut remote_branches: Vec<BranchInfo> = Vec::new();

        // Local branches
        for branch_result in repo
            .branches(Some(BranchType::Local))
            .map_err(|e| e.to_string())?
        {
            let (branch, _) = branch_result.map_err(|e| e.to_string())?;
            let name = branch
                .name()
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Branch name is not valid UTF-8".to_string())?
                .to_string();

            let is_current = current.as_deref() == Some(name.as_str());

            let upstream = branch
                .upstream()
                .ok()
                .and_then(|u| u.name().ok().flatten().map(String::from));

            local_branches.push(BranchInfo {
                name,
                is_current,
                is_remote: false,
                upstream,
            });
        }

        // Remote branches
        for branch_result in repo
            .branches(Some(BranchType::Remote))
            .map_err(|e| e.to_string())?
        {
            let (branch, _) = branch_result.map_err(|e| e.to_string())?;
            let name = branch
                .name()
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Branch name is not valid UTF-8".to_string())?
                .to_string();

            remote_branches.push(BranchInfo {
                name,
                is_current: false,
                is_remote: true,
                upstream: None,
            });
        }

        // Sort: current first, then local alpha, then remote alpha
        local_branches.sort_by(|a, b| match (a.is_current, b.is_current) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        });
        remote_branches.sort_by(|a, b| a.name.cmp(&b.name));

        local_branches.extend(remote_branches);
        Ok(local_branches)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Creates a new branch named `name` from the current HEAD commit.
///
/// Errors if a branch with that name already exists.
///
/// IMPORTANT: All git2 operations run in `spawn_blocking` because `Repository` is NOT `Send`.
#[tauri::command]
pub async fn git_branch_create(repo_path: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
        let head_commit = repo
            .head()
            .map_err(|e| e.to_string())?
            .peel_to_commit()
            .map_err(|e| e.to_string())?;
        // force = false → error if branch already exists
        repo.branch(&name, &head_commit, false)
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Switches to the branch named `name` using a safe checkout.
///
/// Safe checkout refuses to overwrite uncommitted changes that would be lost.
///
/// IMPORTANT: All git2 operations run in `spawn_blocking` because `Repository` is NOT `Send`.
#[tauri::command]
pub async fn git_branch_switch(repo_path: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;
        let refname = format!("refs/heads/{}", name);
        repo.set_head(&refname).map_err(|e| e.to_string())?;
        repo.checkout_head(Some(CheckoutBuilder::default().safe()))
            .map_err(|e| {
                format!(
                    "Cannot switch branch — uncommitted changes would be overwritten: {e}"
                )
            })?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Deletes the local branch named `name`.
///
/// Refuses to delete the currently checked-out branch.
/// Propagates git2's error if the branch has unmerged commits.
///
/// IMPORTANT: All git2 operations run in `spawn_blocking` because `Repository` is NOT `Send`.
#[tauri::command]
pub async fn git_branch_delete(repo_path: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let repo = Repository::open(&repo_path).map_err(|e| e.to_string())?;

        // Refuse to delete the current branch
        let current = repo
            .head()
            .ok()
            .and_then(|h| h.shorthand().map(String::from));
        if current.as_deref() == Some(name.as_str()) {
            return Err(
                "Cannot delete the currently checked out branch".to_string(),
            );
        }

        let mut branch = repo
            .find_branch(&name, BranchType::Local)
            .map_err(|e| format!("Branch '{name}' not found: {e}"))?;

        branch.delete().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Parse the origin remote URL from `.git/config` in a cloned repository.
fn extract_remote_url_from_path(repo_path: &PathBuf) -> String {
    let config_path = repo_path.join(".git").join("config");
    let content = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    let mut in_origin_remote = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == r#"[remote "origin"]"# {
            in_origin_remote = true;
            continue;
        }
        if in_origin_remote && trimmed.starts_with('[') {
            break;
        }
        if in_origin_remote {
            if let Some(rest) = trimmed.strip_prefix("url = ") {
                return rest.trim().to_string();
            }
        }
    }
    String::new()
}

/// Appends a `ProjectEntry` to the "projects" array in `workspace-config.json` Store.
/// Non-fatal — Store write failures are silently ignored (the clone itself succeeded).
fn append_project_to_store(app: &tauri::AppHandle, entry: ProjectEntry) -> Result<(), String> {
    let store = app.store(WORKSPACE_STORE).map_err(|e| e.to_string())?;
    let mut projects: Vec<serde_json::Value> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let entry_json = serde_json::to_value(&entry).map_err(|e| e.to_string())?;
    projects.push(entry_json);

    store.set(
        "projects",
        serde_json::to_value(&projects).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Compute ahead/behind counts relative to the upstream tracking branch.
/// Returns `(0, 0)` if there is no upstream or any lookup fails.
fn compute_ahead_behind(repo: &Repository, branch_name: &str) -> (u32, u32) {
    let local_ref_name = format!("refs/heads/{}", branch_name);
    let local_oid = match repo
        .find_reference(&local_ref_name)
        .and_then(|r| r.peel_to_commit())
    {
        Ok(c) => c.id(),
        Err(_) => return (0, 0),
    };

    // Get the upstream tracking ref name (e.g., "refs/remotes/origin/main")
    let upstream_buf = match repo.branch_upstream_name(&local_ref_name) {
        Ok(b) => b,
        Err(_) => return (0, 0),
    };
    let upstream_name = match upstream_buf.as_str() {
        Some(s) => s.to_string(),
        None => return (0, 0),
    };

    let upstream_oid = match repo
        .find_reference(&upstream_name)
        .and_then(|r| r.peel_to_commit())
    {
        Ok(c) => c.id(),
        Err(_) => return (0, 0),
    };

    match repo.graph_ahead_behind(local_oid, upstream_oid) {
        Ok((ahead, behind)) => (ahead as u32, behind as u32),
        Err(_) => (0, 0),
    }
}
