mod commands;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::scopes::list_scopes,
            commands::scopes::add_project,
            commands::scopes::remove_manual_project,
            commands::ui::get_locale,
            commands::ui::set_locale,
            commands::files::read_file,
            commands::files::write_file,
            commands::files::open_in_editor,
            commands::resources::list_skills,
            commands::resources::create_skill,
            commands::resources::delete_skill,
            commands::resources::list_agents,
            commands::resources::create_agent,
            commands::resources::list_rules,
            commands::resources::create_rule,
            commands::resources::list_workflows,
            commands::resources::delete_resource,
            commands::hooks::list_hooks,
            commands::memory::memory_info,
            commands::memory::list_memories,
            commands::memory::create_memory,
            commands::memory::delete_memory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
