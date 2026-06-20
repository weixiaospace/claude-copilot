//! Settings read/write across the user / project / local layers. The panel is
//! the "residue" after dedicated modules (provider/auth → Providers; hooks,
//! output-style, mcp have their own panels). Settings minimization (CONTEXT).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use claude_copilot_core::scopes::ScopeRef;

use super::home_dir;

/// Resolve the settings file for a (scope, layer) pair.
/// - User scope: `layer = "user"` → `~/.claude/settings.json`
/// - Project scope: `"project"` → `<root>/.claude/settings.json`,
///   `"local"` → `<root>/.claude/settings.local.json`
fn settings_path(scope: &ScopeRef, layer: &str, home: &Path) -> Result<PathBuf, String> {
    let base = match scope {
        ScopeRef::User => home.join(".claude"),
        ScopeRef::Project { id } => Path::new(id).join(".claude"),
    };
    let file = match (scope, layer) {
        (ScopeRef::User, "user") => "settings.json",
        (ScopeRef::Project { .. }, "project") => "settings.json",
        (ScopeRef::Project { .. }, "local") => "settings.local.json",
        _ => return Err(format!("invalid settings layer '{layer}' for this scope")),
    };
    Ok(base.join(file))
}

/// Read a layer's settings doc (the whole JSON object), or `{}` if absent.
#[tauri::command]
pub fn read_settings(scope: ScopeRef, layer: String) -> Result<Value, String> {
    let path = settings_path(&scope, &layer, &home_dir()?)?;
    match fs::read_to_string(&path) {
        Ok(text) => {
            serde_json::from_str(&text).map_err(|e| format!("failed to parse {}: {e}", path.display()))
        }
        Err(_) => Ok(Value::Object(Default::default())),
    }
}

/// Write a layer's settings doc (replaces the file with the given object). The
/// frontend round-trips the whole doc, so unmanaged keys are preserved.
#[tauri::command]
pub fn write_settings(scope: ScopeRef, layer: String, value: Value) -> Result<(), String> {
    if !value.is_object() {
        return Err("settings must be a JSON object".to_string());
    }
    let path = settings_path(&scope, &layer, &home_dir()?)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
    }
    let text = serde_json::to_string_pretty(&value).map_err(|e| format!("failed to serialize: {e}"))?;
    fs::write(&path, text + "\n").map_err(|e| format!("failed to write {}: {e}", path.display()))
}
