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
