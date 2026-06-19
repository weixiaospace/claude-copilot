mod commands;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::scopes::list_scopes,
            commands::scopes::add_project,
            commands::scopes::remove_manual_project,
            commands::ui::get_locale,
            commands::ui::set_locale,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
