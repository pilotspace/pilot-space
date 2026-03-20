use std::cell::Cell;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use git2::{build::RepoBuilder, Cred, CredentialType, FetchOptions, RemoteCallbacks};
use tauri::ipc::Channel;
use tauri_plugin_store::StoreExt;

use crate::commands::workspace::ProjectEntry;

const KEYCHAIN_SERVICE: &str = "io.pilotspace.app";
const KEYCHAIN_GIT_ACCOUNT: &str = "git_pat";
const KEYCHAIN_GIT_USERNAME: &str = "git_username";
const WORKSPACE_STORE: &str = "workspace-config.json";

/// Progress event sent to the frontend via Channel during a git clone operation.
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

/// Module-level cancel flag; reset to `false` at the start of each new clone.
static CLONE_CANCEL: std::sync::OnceLock<Arc<AtomicBool>> = std::sync::OnceLock::new();

fn get_cancel_flag() -> Arc<AtomicBool> {
    CLONE_CANCEL
        .get_or_init(|| Arc::new(AtomicBool::new(false)))
        .clone()
}

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
