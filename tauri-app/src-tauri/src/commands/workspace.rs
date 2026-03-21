use std::path::PathBuf;
use tauri_plugin_store::StoreExt;

use super::WORKSPACE_STORE;

/// A project managed by Pilot Space — either cloned by the app or linked by the user.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProjectEntry {
    pub name: String,
    pub path: String,
    pub remote_url: String,
    pub linked: bool,  // true = user linked existing repo, false = cloned by app
    pub added_at: String,  // ISO 8601 timestamp
}

/// Returns the current base projects directory path as a String.
///
/// Priority:
/// 1. Persisted value in `workspace-config.json` Tauri Store ("projects_dir" key)
/// 2. Default: `~/PilotSpace/projects/` — created if absent.
#[tauri::command]
pub async fn get_projects_dir(app: tauri::AppHandle) -> Result<String, String> {
    let store = app.store(WORKSPACE_STORE).map_err(|e| e.to_string())?;

    if let Some(val) = store.get("projects_dir") {
        if let Some(path_str) = val.as_str() {
            let path = PathBuf::from(path_str);
            // Create the directory if it was deleted since last save
            std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            return Ok(path.to_string_lossy().into_owned());
        }
    }

    // Default: ~/PilotSpace/projects/
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    let default_path = home.join("PilotSpace").join("projects");
    std::fs::create_dir_all(&default_path).map_err(|e| e.to_string())?;
    Ok(default_path.to_string_lossy().into_owned())
}

/// Accepts a path string, validates it is a directory, and persists it to `workspace-config.json`.
#[tauri::command]
pub async fn set_projects_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir_path = PathBuf::from(&path);
    if !dir_path.is_dir() {
        return Err("Path does not exist or is not a directory".to_string());
    }

    let store = app.store(WORKSPACE_STORE).map_err(|e| e.to_string())?;
    store.set("projects_dir", serde_json::Value::String(path));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Resets the projects directory to the default ~/PilotSpace/projects/ by
/// deleting the persisted "projects_dir" key from the Store.
/// The next call to get_projects_dir will fall through to the default path.
#[tauri::command]
pub async fn reset_projects_dir(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store(WORKSPACE_STORE).map_err(|e| e.to_string())?;
    store.delete("projects_dir");
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Opens a native folder picker dialog and returns the selected path, or None if cancelled.
///
/// Uses `spawn_blocking` to avoid blocking the async Tokio runtime since the
/// dialog call blocks the calling thread until the user makes a selection.
#[tauri::command]
pub async fn open_folder_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // Spawn a blocking thread for the blocking dialog call
    let result = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.map(|p| p.to_string()))
}

/// Accepts a path to an existing local git repository, validates it, and adds it to the
/// managed projects list in `workspace-config.json`.
///
/// Returns the created `ProjectEntry` as a JSON string.
#[tauri::command]
pub async fn link_repo(app: tauri::AppHandle, path: String) -> Result<ProjectEntry, String> {
    let repo_path = PathBuf::from(&path);

    // Verify it is a git repository
    if !repo_path.join(".git").is_dir() {
        return Err("Not a git repository".to_string());
    }

    // Extract the repository name from the last path component
    let name = repo_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".to_string());

    // Extract remote URL from .git/config
    let remote_url = extract_remote_url(&repo_path);

    let entry = ProjectEntry {
        name,
        path: repo_path.to_string_lossy().into_owned(),
        remote_url,
        linked: true,
        added_at: chrono::Utc::now().to_rfc3339(),
    };

    // Append to the projects array in the Store
    append_project_to_store(&app, &entry)?;

    Ok(entry)
}

/// Returns all managed projects from `workspace-config.json`.
#[tauri::command]
pub async fn list_projects(app: tauri::AppHandle) -> Result<Vec<ProjectEntry>, String> {
    let store = app.store(WORKSPACE_STORE).map_err(|e| e.to_string())?;
    let projects: Vec<ProjectEntry> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(projects)
}

/// Appends a `ProjectEntry` to the "projects" array in `workspace-config.json` Store.
pub(crate) fn append_project_to_store(
    app: &tauri::AppHandle,
    entry: &ProjectEntry,
) -> Result<(), String> {
    let store = app.store(WORKSPACE_STORE).map_err(|e| e.to_string())?;
    let mut projects: Vec<serde_json::Value> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let entry_json = serde_json::to_value(entry).map_err(|e| e.to_string())?;

    // Deduplicate: if a project with the same path already exists, update it in-place
    if let Some(pos) = projects.iter().position(|p| {
        p.get("path").and_then(|v| v.as_str()) == Some(&entry.path)
    }) {
        projects[pos] = entry_json;
    } else {
        projects.push(entry_json);
    }

    store.set(
        "projects",
        serde_json::to_value(&projects).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Parse the origin remote URL from `.git/config` by reading the config file directly.
/// Returns an empty string if no `[remote "origin"]` section is found.
pub(crate) fn extract_remote_url(repo_path: &PathBuf) -> String {
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
        // Stop at the next section header
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn make_git_config(dir: &PathBuf, content: &str) {
        let git_dir = dir.join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(git_dir.join("config"), content).unwrap();
    }

    #[test]
    fn test_extract_remote_url_with_origin() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_path_buf();
        make_git_config(
            &dir_path,
            "[core]\n\trepositoryformatversion = 0\n[remote \"origin\"]\n\turl = git@github.com:pilotspace/pilot-space.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n",
        );
        let url = extract_remote_url(&dir_path);
        assert_eq!(url, "git@github.com:pilotspace/pilot-space.git");
    }

    #[test]
    fn test_extract_remote_url_no_origin_section() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_path_buf();
        make_git_config(
            &dir_path,
            "[core]\n\trepositoryformatversion = 0\n[branch \"main\"]\n\trebase = false\n",
        );
        let url = extract_remote_url(&dir_path);
        assert_eq!(url, "");
    }

    #[test]
    fn test_extract_remote_url_missing_git_config() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path().to_path_buf();
        // No .git/config created — should return empty string
        let url = extract_remote_url(&dir_path);
        assert_eq!(url, "");
    }
}
