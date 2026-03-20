//! Embedded terminal PTY backend.
//!
//! Provides 4 Tauri IPC commands for managing PTY sessions:
//! - `create_terminal` — spawn a shell in a new PTY, stream output via Channel
//! - `write_terminal` — write keystrokes to a PTY session's stdin
//! - `resize_terminal` — resize PTY dimensions (sends SIGWINCH to child)
//! - `close_terminal` — kill child process and free all session resources
//!
//! ## Output batching (Pitfall 7 mitigation)
//! Output is accumulated in a buffer and flushed every 16ms via a
//! `std::thread::spawn` reader loop. This prevents the confirmed Tauri IPC
//! memory leak (issues #12724 and #13133) caused by emitting thousands of
//! tiny per-byte events.
//!
//! ## Architecture
//! - PTY master is wrapped in `Arc<Mutex<Box<dyn MasterPty + Send>>>` so the
//!   reader thread and `write_terminal` command can coexist safely.
//! - Child process handle is stored for `kill()` on `close_terminal`.
//! - Reader thread exits naturally when the PTY master is dropped (read → EOF).
//! - Sessions are managed in a `Mutex<HashMap<String, TerminalSession>>`.
//!   Mutex (not RwLock) is used because write operations (keystrokes) are
//!   extremely frequent and lock contention is negligible compared to I/O.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::Channel;

/// Output event streamed to the frontend from a PTY session.
/// Batched at 16ms intervals — never sent per-byte.
#[derive(serde::Serialize, Clone)]
pub struct TerminalOutput {
    pub session_id: String,
    pub data: String,
}

/// Returned to the frontend when a new PTY session is created.
#[derive(serde::Serialize, Clone)]
pub struct TerminalSessionInfo {
    pub session_id: String,
}

/// Internal representation of a live PTY session.
struct TerminalSession {
    /// Writer end of the PTY master — wrapped in Arc<Mutex> so it can be
    /// shared between `write_terminal` calls while the reader thread holds
    /// its own clone reference.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// PTY master handle — held here so it lives as long as the session.
    /// Dropping this sends EOF to the reader thread, causing it to exit.
    _master: Box<dyn portable_pty::MasterPty + Send>,
    /// Child process handle — used to kill the shell on `close_terminal`.
    child: Box<dyn portable_pty::Child + Send>,
}

/// Tauri managed state holding all active PTY sessions.
pub struct TerminalSessions {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

impl TerminalSessions {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

/// Create a new PTY terminal session, spawning the user's default shell.
///
/// Returns a `TerminalSessionInfo` with a unique `session_id` that must be
/// used for all subsequent `write_terminal`, `resize_terminal`, and
/// `close_terminal` calls.
///
/// Output from the shell is streamed to `on_output` in batched chunks
/// flushed every 16ms (never per-byte) to prevent IPC memory leaks.
///
/// # Platform defaults
/// - macOS / Linux: `$SHELL` env var, fallback to `/bin/bash`
/// - Windows: `%COMSPEC%` env var, fallback to `cmd.exe`
#[tauri::command]
pub async fn create_terminal(
    state: tauri::State<'_, TerminalSessions>,
    on_output: Channel<TerminalOutput>,
    rows: u16,
    cols: u16,
) -> Result<TerminalSessionInfo, String> {
    let session_id = uuid::Uuid::new_v4().to_string();

    // Detect the user's default shell
    let shell = detect_default_shell();

    // Build the PTY system and open a master PTY pair
    let pty_system = native_pty_system();
    let pty_size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(pty_size)
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    // Spawn the shell inside the PTY
    let mut cmd = CommandBuilder::new(&shell);
    // Ensure the shell knows it is interactive
    cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell '{shell}': {e}"))?;

    // Obtain writer end of the PTY master — wrapped in Arc<Mutex> for sharing
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;
    let writer = Arc::new(Mutex::new(writer));

    // Obtain reader end — consumed entirely by the background reader thread
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

    // Spawn the batched output reader thread.
    // Using std::thread (NOT tokio::spawn) because PTY reads are blocking I/O
    // and do not implement Future. tokio::task::spawn_blocking would also work
    // but we need no result back, so a raw thread is simpler.
    let channel = on_output.clone();
    let sid = session_id.clone();

    std::thread::spawn(move || {
        // Heap-allocated read buffer — avoids per-read allocation in the hot loop
        let mut read_buf = [0u8; 4096];
        // Accumulation buffer flushed every 16ms
        let mut batch: Vec<u8> = Vec::with_capacity(4096);
        let mut last_flush = Instant::now();
        let flush_interval = Duration::from_millis(16);

        loop {
            // Non-blocking read is not available on all PTY implementations, so
            // we use a blocking read but keep the buffer small enough that the
            // loop is responsive to the 16ms flush deadline.
            //
            // The actual flow:
            //   1. Block on read() until at least 1 byte arrives (or EOF/error)
            //   2. Append the bytes to `batch`
            //   3. If 16ms has elapsed since last flush, flush `batch` to channel
            match reader.read(&mut read_buf) {
                Ok(0) => {
                    // EOF — shell exited or PTY master was dropped
                    if !batch.is_empty() {
                        let data = String::from_utf8_lossy(&batch).into_owned();
                        let _ = channel.send(TerminalOutput {
                            session_id: sid.clone(),
                            data,
                        });
                    }
                    break;
                }
                Ok(n) => {
                    batch.extend_from_slice(&read_buf[..n]);

                    let now = Instant::now();
                    if now.duration_since(last_flush) >= flush_interval && !batch.is_empty() {
                        let data = String::from_utf8_lossy(&batch).into_owned();
                        let _ = channel.send(TerminalOutput {
                            session_id: sid.clone(),
                            data,
                        });
                        batch.clear();
                        last_flush = now;
                    }
                }
                Err(_) => {
                    // Read error — PTY closed or other I/O error, flush and exit
                    if !batch.is_empty() {
                        let data = String::from_utf8_lossy(&batch).into_owned();
                        let _ = channel.send(TerminalOutput {
                            session_id: sid.clone(),
                            data,
                        });
                    }
                    break;
                }
            }
        }
    });

    // Store the session in managed state
    let session = TerminalSession {
        writer,
        _master: pair.master,
        child,
    };

    state
        .sessions
        .lock()
        .map_err(|e| format!("State lock poisoned: {e}"))?
        .insert(session_id.clone(), session);

    Ok(TerminalSessionInfo { session_id })
}

/// Write data (keystrokes) to a terminal session's PTY stdin.
///
/// The data string is written as raw bytes — callers should send individual
/// characters or escape sequences (e.g., "\r" for Enter, "\x03" for Ctrl-C).
#[tauri::command]
pub async fn write_terminal(
    state: tauri::State<'_, TerminalSessions>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("State lock poisoned: {e}"))?;

    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Terminal session '{session_id}' not found"))?;

    session
        .writer
        .lock()
        .map_err(|e| format!("Writer lock poisoned: {e}"))?
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to terminal: {e}"))?;

    Ok(())
}

/// Resize a terminal session's PTY to new dimensions.
///
/// Sends SIGWINCH to the child process so interactive programs like vim,
/// htop, and bash itself can re-render to fit the new viewport.
#[tauri::command]
pub async fn resize_terminal(
    state: tauri::State<'_, TerminalSessions>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("State lock poisoned: {e}"))?;

    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Terminal session '{session_id}' not found"))?;

    session
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize terminal: {e}"))?;

    Ok(())
}

/// Close a terminal session, killing the child process and freeing resources.
///
/// Idempotent — calling this on an already-closed session returns `Ok(())`.
///
/// After removal from the session map, the `TerminalSession` struct is
/// dropped, which:
/// 1. Drops the PTY master — causes the reader thread to get EOF and exit
/// 2. Kills the child process via the `child` handle
#[tauri::command]
pub async fn close_terminal(
    state: tauri::State<'_, TerminalSessions>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("State lock poisoned: {e}"))?;

    if let Some(mut session) = sessions.remove(&session_id) {
        // Best-effort kill — child may have already exited naturally
        let _ = session.child.kill();
        // Dropping `session` here drops the PTY master (sends EOF to reader thread)
        // and the child handle.
        drop(session);
    }
    // Idempotent: if session was not found, return Ok
    Ok(())
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Detect the user's default interactive shell.
///
/// - macOS / Linux: reads `$SHELL`, falls back to `/bin/bash`
/// - Windows: reads `%COMSPEC%`, falls back to `cmd.exe`
fn detect_default_shell() -> String {
    #[cfg(unix)]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }
}
