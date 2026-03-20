mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            commands::auth::get_auth_token,
            commands::auth::set_auth_token,
            commands::auth::migrate_tokens_to_keychain,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
