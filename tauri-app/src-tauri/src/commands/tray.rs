use tauri::{
    AppHandle, Manager,
    menu::{MenuBuilder, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_notification::NotificationExt;

/// Set up the system tray icon with a context menu (Show Window + Quit).
///
/// Called once during app setup via Builder::setup. The tray icon reuses
/// the app's default window icon so no extra icon asset is required.
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&quit_item)
        .build()?;

    let app_handle_for_click = app.clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().expect("no app icon"))
        .tooltip("Pilot Space")
        .menu(&menu)
        // Left-click shows window directly; right-click shows the menu
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = app_handle_for_click.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

/// Wire the window's close button to hide-to-tray instead of quitting.
///
/// Called once during app setup. Intercepts the CloseRequested event on the
/// main window, prevents the actual close, and hides the window to the tray.
pub fn setup_close_to_tray(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window_clone.hide();
            }
        });
    }
}

/// Send a native OS notification.
///
/// Invocable from the frontend via `invoke('send_notification', { title, body })`.
/// No-op guard is on the frontend side (`isTauri()` check in tauri.ts wrapper).
#[tauri::command]
pub async fn send_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| format!("Notification failed: {e}"))?;
    Ok(())
}
