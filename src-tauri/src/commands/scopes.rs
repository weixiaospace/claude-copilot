use claude_copilot_core::scopes::{self, Scope};

/// Returns the scopes for the sidebar. Thin wrapper over the core logic so the
/// command layer stays free of business logic.
#[tauri::command]
pub fn list_scopes() -> Vec<Scope> {
    scopes::list_scopes()
}
