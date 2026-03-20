//! Pilot CLI sidecar management.
//!
//! Provides 2 Tauri IPC commands for spawning and cancelling the
//! pilot-cli sidecar binary:
//! - `run_sidecar` — spawn pilot-cli with args, stream stdout/stderr
//!   via Channel, return exit code
//! - `cancel_sidecar` — kill a running sidecar process by ID
//!
//! ## Architecture
//! - Uses tauri_plugin_shell::ShellExt to spawn the sidecar binary
//!   configured in tauri.conf.json bundle.externalBin
//! - Output is streamed line-by-line to a Channel<SidecarOutput>
//! - Running processes tracked in SidecarProcesses managed state
//!   for cancellation support

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::ipc::Channel;
use tauri_plugin_shell::ShellExt;

/// Output event streamed from a sidecar process.
#[derive(serde::Serialize, Clone)]
pub struct SidecarOutput {
    pub id: String,
    /// "stdout" or "stderr"
    pub stream: String,
    pub data: String,
}

/// Result returned when a sidecar process finishes.
#[derive(serde::Serialize, Clone)]
pub struct SidecarResult {
    pub id: String,
    pub exit_code: i32,
}

/// Handle to a running sidecar child process.
struct SidecarChild {
    child: tauri_plugin_shell::process::CommandChild,
}

/// Tauri managed state holding active sidecar processes.
pub struct SidecarProcesses {
    children: Mutex<HashMap<String, SidecarChild>>,
}

impl SidecarProcesses {
    pub fn new() -> Self {
        Self {
            children: Mutex::new(HashMap::new()),
        }
    }
}

/// Spawn the pilot-cli sidecar with the given arguments.
///
/// Streams stdout and stderr line-by-line to the `on_output` Channel.
/// Returns a SidecarResult with the process exit code when complete.
///
/// # Arguments
/// - `args` — CLI arguments (e.g., ["implement", "PS-42", "--oneshot"])
/// - `cwd` — Optional working directory for the sidecar process
/// - `on_output` — Channel for streaming stdout/stderr events
///
/// # Errors
/// Returns error string if the sidecar binary cannot be found or spawned.
#[tauri::command]
pub async fn run_sidecar(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarProcesses>,
    args: Vec<String>,
    cwd: Option<String>,
    on_output: Channel<SidecarOutput>,
) -> Result<SidecarResult, String> {
    let id = uuid::Uuid::new_v4().to_string();

    // Build the sidecar command via tauri-plugin-shell
    let mut cmd = app
        .shell()
        .sidecar("pilot-cli")
        .map_err(|e| format!("Failed to create sidecar command: {e}"))?;

    // Append user-provided arguments
    cmd = cmd.args(&args);

    // Set working directory if provided
    if let Some(dir) = cwd {
        cmd = cmd.current_dir(dir);
    }

    // Spawn the sidecar — returns (receiver, child)
    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn pilot-cli sidecar: {e}"))?;

    // Store the child for cancellation
    {
        let mut children = state
            .children
            .lock()
            .map_err(|e| format!("State lock poisoned: {e}"))?;
        children.insert(id.clone(), SidecarChild { child });
    }

    let output_channel = on_output.clone();
    let process_id = id.clone();

    // Read stdout/stderr events until the process exits
    // tauri_plugin_shell::process::CommandEvent is an enum:
    //   Stdout(Vec<u8>), Stderr(Vec<u8>), Error(String), Terminated(TerminatedPayload)
    let mut exit_code: i32 = -1;

    while let Some(event) = rx.recv().await {
        use tauri_plugin_shell::process::CommandEvent;
        match event {
            CommandEvent::Stdout(bytes) => {
                let data = String::from_utf8_lossy(&bytes).into_owned();
                let _ = output_channel.send(SidecarOutput {
                    id: process_id.clone(),
                    stream: "stdout".to_string(),
                    data,
                });
            }
            CommandEvent::Stderr(bytes) => {
                let data = String::from_utf8_lossy(&bytes).into_owned();
                let _ = output_channel.send(SidecarOutput {
                    id: process_id.clone(),
                    stream: "stderr".to_string(),
                    data,
                });
            }
            CommandEvent::Error(err) => {
                let _ = output_channel.send(SidecarOutput {
                    id: process_id.clone(),
                    stream: "stderr".to_string(),
                    data: format!("Error: {err}"),
                });
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code.unwrap_or(-1);
                break;
            }
            _ => {}
        }
    }

    // Remove from tracked processes
    {
        let mut children = state
            .children
            .lock()
            .map_err(|e| format!("State lock poisoned: {e}"))?;
        children.remove(&id);
    }

    Ok(SidecarResult { id, exit_code })
}

/// Cancel a running sidecar process by its ID.
///
/// Idempotent — calling this on an already-exited process returns Ok.
#[tauri::command]
pub async fn cancel_sidecar(
    state: tauri::State<'_, SidecarProcesses>,
    id: String,
) -> Result<(), String> {
    let mut children = state
        .children
        .lock()
        .map_err(|e| format!("State lock poisoned: {e}"))?;

    if let Some(child) = children.remove(&id) {
        child
            .child
            .kill()
            .map_err(|e| format!("Failed to kill sidecar: {e}"))?;
    }
    Ok(())
}
