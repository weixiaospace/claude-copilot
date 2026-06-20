use super::home_dir;
use crate::state;

/// The persisted UI locale (`state.json#ui.locale`), or `None` if unset.
#[tauri::command]
pub fn get_locale() -> Result<Option<String>, String> {
    state::get_locale(&home_dir()?)
}

/// Persist the chosen UI locale to `state.json#ui.locale`.
#[tauri::command]
pub fn set_locale(locale: String) -> Result<(), String> {
    state::set_locale(&home_dir()?, &locale)
}

/// The persisted UI theme (`state.json#ui.theme`), or `None` if unset.
#[tauri::command]
pub fn get_theme() -> Result<Option<String>, String> {
    state::get_theme(&home_dir()?)
}

/// Persist the chosen UI theme to `state.json#ui.theme`.
#[tauri::command]
pub fn set_theme(theme: String) -> Result<(), String> {
    state::set_theme(&home_dir()?, &theme)
}

/// The persisted sidebar width in px (`state.json#ui.sidebarWidth`), or `None`.
#[tauri::command]
pub fn get_sidebar_width() -> Result<Option<f64>, String> {
    state::get_sidebar_width(&home_dir()?)
}

/// Persist the sidebar width in px to `state.json#ui.sidebarWidth`.
#[tauri::command]
pub fn set_sidebar_width(width: f64) -> Result<(), String> {
    state::set_sidebar_width(&home_dir()?, width)
}

/// Whether the first-run welcome has already been shown.
#[tauri::command]
pub fn get_welcome_seen() -> Result<bool, String> {
    state::get_welcome_seen(&home_dir()?)
}

/// Mark the first-run welcome as shown.
#[tauri::command]
pub fn mark_welcome_seen() -> Result<(), String> {
    state::set_welcome_seen(&home_dir()?)
}
