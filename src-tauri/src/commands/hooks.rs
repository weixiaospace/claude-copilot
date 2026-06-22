//! Read-only hooks: gather a scope's own hooks into a flat list. User scope →
//! user settings; project scope → project + local settings. Plugin-bundled
//! hooks are shown under their plugin (Plugins panel), not aggregated here —
//! ADR-0001's "no double exposure". (No in-UI editing; the UI opens the file.)

use std::fs;
use std::path::Path;

use serde_json::Value;

use claude_copilot_core::hooks::{self, HookEntry, HookSource};
use claude_copilot_core::scopes::ScopeRef;

use super::home_dir;

/// Read a file's `hooks` event-map (both settings files and plugin `hooks.json`
/// nest it under a top-level `hooks` key).
fn read_hooks_map(file: &Path) -> Option<Value> {
    let text = fs::read_to_string(file).ok()?;
    let doc: Value = serde_json::from_str(&text).ok()?;
    doc.get("hooks").cloned()
}

fn from_settings(file: &Path, source: HookSource) -> Vec<HookEntry> {
    match read_hooks_map(file) {
        Some(map) => hooks::flatten(&map, source, &file.to_string_lossy()),
        None => Vec::new(),
    }
}

#[tauri::command]
pub fn list_hooks(scope: ScopeRef) -> Result<Vec<HookEntry>, String> {
    let home = home_dir()?;
    let mut out = Vec::new();
    match scope {
        ScopeRef::User => {
            // User scope shows only the user's own settings hooks. Plugin hooks
            // live under their plugin (Plugins panel), not here (ADR-0001).
            out.extend(from_settings(
                &home.join(".claude").join("settings.json"),
                HookSource::User,
            ));
        }
        ScopeRef::Project { id } => {
            let base = Path::new(&id).join(".claude");
            out.extend(from_settings(&base.join("settings.json"), HookSource::Project));
            out.extend(from_settings(
                &base.join("settings.local.json"),
                HookSource::Local,
            ));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod smoke {
    use super::*;

    /// Diagnostic: dump real User-scope hooks (user settings only).
    /// `cargo test -p claude-copilot-desktop -- --ignored dumps_user_hooks --nocapture`
    #[test]
    #[ignore = "reads the real ~/.claude; run manually"]
    fn dumps_user_hooks() {
        let hooks = list_hooks(ScopeRef::User).unwrap();
        eprintln!("{} user-scope hooks:", hooks.len());
        for h in hooks.iter().take(12) {
            eprintln!("  [{:?}] {} {:?} -> {}", h.source, h.event, h.matcher, h.command);
        }
    }
}
