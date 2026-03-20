use tauri_plugin_store::StoreExt;

/// Read the cached Supabase access token from Tauri Store (pilot-auth.json).
/// Returns None if no token is stored (user not logged in or store empty).
#[tauri::command]
pub async fn get_auth_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app.store("pilot-auth.json").map_err(|e| e.to_string())?;
    let token = store
        .get("access_token")
        .and_then(|v| v.as_str().map(String::from));
    Ok(token)
}

/// Write or clear auth tokens in Tauri Store (pilot-auth.json).
/// Pass None for access_token to clear all stored tokens (sign-out case).
#[tauri::command]
pub async fn set_auth_token(
    app: tauri::AppHandle,
    access_token: Option<String>,
    refresh_token: Option<String>,
) -> Result<(), String> {
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
