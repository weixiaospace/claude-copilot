//! Read-only hooks: merge the relevant sources for a scope into a flat list.
//! User scope → user settings + installed-plugin hooks; project scope → project
//! + local settings. (No in-UI editing; the UI opens the source file instead.)

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

/// Hooks shipped by installed plugins: each entry's `installPath/hooks/hooks.json`.
fn from_plugins(home: &Path) -> Vec<HookEntry> {
    let installed = home
        .join(".claude")
        .join("plugins")
        .join("installed_plugins.json");
    let Ok(text) = fs::read_to_string(&installed) else {
        return Vec::new();
    };
    let Ok(doc) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    let Some(plugins) = doc.get("plugins").and_then(Value::as_object) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for installs in plugins.values() {
        let Some(installs) = installs.as_array() else {
            continue;
        };
        for install in installs {
            if let Some(path) = install.get("installPath").and_then(Value::as_str) {
                let hooks_json = Path::new(path).join("hooks").join("hooks.json");
                if let Some(map) = read_hooks_map(&hooks_json) {
                    out.extend(hooks::flatten(
                        &map,
                        HookSource::Plugin,
                        &hooks_json.to_string_lossy(),
                    ));
                }
            }
        }
    }
    out
}

#[tauri::command]
pub fn list_hooks(scope: ScopeRef) -> Result<Vec<HookEntry>, String> {
    let home = home_dir()?;
    let mut out = Vec::new();
    match scope {
        ScopeRef::User => {
            out.extend(from_settings(
                &home.join(".claude").join("settings.json"),
                HookSource::User,
            ));
            out.extend(from_plugins(&home));
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

    /// Diagnostic: dump real User-scope hooks (incl. installed-plugin hooks).
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
