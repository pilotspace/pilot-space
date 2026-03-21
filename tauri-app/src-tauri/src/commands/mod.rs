pub mod auth;
pub mod workspace;
pub mod git;
pub mod terminal;
pub mod sidecar;
pub mod tray;

/// Keychain service identifier — must be consistent across auth and git modules.
pub const KEYCHAIN_SERVICE: &str = "io.pilotspace.app";

/// Tauri Store filename for workspace configuration (managed projects, settings).
pub const WORKSPACE_STORE: &str = "workspace-config.json";
