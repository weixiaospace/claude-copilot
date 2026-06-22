mod claude_cli;
mod commands;
mod secrets;
mod state;
mod watchers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Restores + persists window size/position across launches.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Auto-update (desktop only); manifest + pubkey in tauri.conf.json.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // Live-reload watcher over ~/.claude (best-effort).
            if let Some(home) = dirs::home_dir() {
                watchers::start(app.handle().clone(), &home);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scopes::list_scopes,
            commands::scopes::add_project,
            commands::scopes::remove_manual_project,
            commands::ui::get_locale,
            commands::ui::set_locale,
            commands::ui::get_theme,
            commands::ui::set_theme,
            commands::ui::get_sidebar_width,
            commands::ui::set_sidebar_width,
            commands::ui::get_welcome_seen,
            commands::ui::mark_welcome_seen,
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
            commands::resources::create_workflow,
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
            commands::skills::list_skill_sources,
            commands::skills::add_skill_source,
            commands::skills::update_skill_source,
            commands::skills::remove_skill_source,
            commands::skills::install_skill_from_source,
            commands::skills::uninstall_skill,
            commands::providers::list_profiles,
            commands::providers::create_profile,
            commands::providers::update_profile,
            commands::providers::delete_profile,
            commands::providers::activate_profile,
            commands::providers::deactivate_provider,
            commands::providers::get_active_profile,
            commands::providers::list_active_profiles,
            commands::auth::get_claude_auth_status,
            commands::auth::claude_auth_login,
            commands::auth::get_claude_subscription_quota,
            commands::usage::query_usage,
            commands::settings::read_settings,
            commands::settings::write_settings,
            commands::sessions::list_sessions,
            commands::sessions::open_terminal,
            commands::sessions::open_in_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
