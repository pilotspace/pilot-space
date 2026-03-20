use tauri_plugin_store::StoreExt;

const KEYCHAIN_SERVICE: &str = "io.pilotspace.app";
const KEYCHAIN_ACCOUNT_ACCESS: &str = "access_token";
const KEYCHAIN_ACCOUNT_REFRESH: &str = "refresh_token";

/// Read the Supabase access token from the OS keychain.
/// Falls back to Tauri Store (pilot-auth.json) if keychain is unavailable
/// or the token has not yet been migrated to keychain.
#[tauri::command]
pub async fn get_auth_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    // Try OS keychain first (primary secure storage)
    match keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_ACCESS) {
        Ok(entry) => match entry.get_password() {
            Ok(token) => return Ok(Some(token)),
            Err(keyring::Error::NoEntry) => {} // Not in keychain yet; fall through
            Err(_) => {}                        // Keychain unavailable; fall through
        },
        Err(_) => {}
    }

    // Fallback: read from Tauri Store (pre-migration or keychain unavailable)
    let store = app.store("pilot-auth.json").map_err(|e| e.to_string())?;
    let token = store
        .get("access_token")
        .and_then(|v| v.as_str().map(String::from));
    Ok(token)
}

/// Write auth tokens to the OS keychain and to Tauri Store as a fallback.
///
/// Keychain is the secure source of truth for Rust-side access.
/// Tauri Store remains as a sync channel so the WebView (Supabase JS client)
/// can still read tokens via @tauri-apps/plugin-store without going through IPC.
///
/// Pass `access_token: None` to clear all stored tokens (sign-out case).
#[tauri::command]
pub async fn set_auth_token(
    app: tauri::AppHandle,
    access_token: Option<String>,
    refresh_token: Option<String>,
) -> Result<(), String> {
    // Write to / clear OS keychain
    match &access_token {
        Some(token) => {
            if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_ACCESS) {
                let _ = entry.set_password(token);
            }
            if let Some(rt) = &refresh_token {
                if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_REFRESH) {
                    let _ = entry.set_password(rt);
                }
            }
        }
        None => {
            // Clear keychain entries on sign-out
            if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_ACCESS) {
                let _ = entry.delete_credential();
            }
            if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_REFRESH) {
                let _ = entry.delete_credential();
            }
        }
    }

    // Also write to Tauri Store as fallback for WebView reads
    let store = app.store("pilot-auth.json").map_err(|e| e.to_string())?;
    match &access_token {
        Some(token) => {
            store.set("access_token", serde_json::Value::String(token.clone()));
            if let Some(rt) = &refresh_token {
                store.set("refresh_token", serde_json::Value::String(rt.clone()));
            }
        }
        None => {
            store.delete("access_token");
            store.delete("refresh_token");
        }
    }
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// One-time migration: copy tokens from Tauri Store to OS keychain on app startup.
///
/// Handles upgrading users who were on Plan 31-01 (Store-only) to Plan 31-02
/// (keychain as primary). Returns `true` if migration was performed, `false`
/// if keychain already has a token (already migrated) or no tokens exist.
///
/// Note: tokens are NOT deleted from Store after migration — the Store remains
/// a sync channel for WebView reads. Keychain becomes the Rust-side source of truth.
#[tauri::command]
pub async fn migrate_tokens_to_keychain(app: tauri::AppHandle) -> Result<bool, String> {
    let store = app.store("pilot-auth.json").map_err(|e| e.to_string())?;

    let access = store
        .get("access_token")
        .and_then(|v| v.as_str().map(String::from));
    let refresh = store
        .get("refresh_token")
        .and_then(|v| v.as_str().map(String::from));

    if let Some(token) = &access {
        // Check if keychain already has a value (migration already done)
        let already_migrated = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_ACCESS)
            .and_then(|e| e.get_password())
            .is_ok();

        if !already_migrated {
            if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_ACCESS) {
                entry.set_password(token).map_err(|e| e.to_string())?;
            }
            if let Some(rt) = &refresh {
                if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_REFRESH)
                {
                    entry.set_password(rt).map_err(|e| e.to_string())?;
                }
            }
            // Do NOT delete from Store — WebView still reads from Store for its
            // own Supabase client. Store remains a sync channel.
            return Ok(true); // Migration performed
        }
    }

    Ok(false) // No migration needed (already migrated or no tokens stored)
}
