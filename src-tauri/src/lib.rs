mod commands;
mod secrets;
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
            commands::resources::list_output_styles,
            commands::resources::create_output_style,
            commands::resources::get_active_output_style,
            commands::resources::set_active_output_style,
            commands::hooks::list_hooks,
            commands::mcp::list_mcp,
            commands::mcp::add_mcp,
            commands::mcp::remove_mcp,
            commands::memory::memory_info,
            commands::memory::list_memories,
            commands::memory::create_memory,
            commands::memory::delete_memory,
            commands::plugins::list_plugins,
            commands::plugins::list_marketplaces,
            commands::plugins::list_available_plugins,
            commands::plugins::list_bundled_resources,
            commands::plugins::install_plugin,
            commands::plugins::uninstall_plugin,
            commands::plugins::toggle_plugin,
            commands::plugins::add_marketplace,
            commands::plugins::remove_marketplace,
            commands::plugins::update_marketplace,
            commands::providers::list_profiles,
            commands::providers::create_profile,
            commands::providers::update_profile,
            commands::providers::delete_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
