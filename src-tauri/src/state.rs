//! The desktop's own state file at `~/.claude/claude-copilot/state.json`, plus
//! readers for Claude Code's project list. All filesystem I/O for scopes lives
//! here; the pure logic is in `claude_copilot_core::projects`.

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use claude_copilot_core::projects::ManualProject;
use claude_copilot_core::scopes::ScopeRef;

/// Slice 2 only needs `manual_projects`; `ui` is preserved opaquely so later
/// slices (i18n, window state) can own it without clobbering this one.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct State {
    #[serde(default)]
    pub manual_projects: Vec<ManualProject>,
    /// Paths the user granted access to via the native permission prompt
    /// (layer 3 of the fs permission model). Canonicalized.
    #[serde(default)]
    pub granted_paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui: Option<Value>,
    /// Scope → active profile id cache. Avoids reading the OS keychain on every
    /// startup just to derive which profile is active for a scope (ADR-0001).
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub active_providers: HashMap<String, String>,
}

fn state_path(home: &Path) -> PathBuf {
    home.join(".claude").join("claude-copilot").join("state.json")
}

pub fn load(home: &Path) -> Result<State, String> {
    let path = state_path(home);
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|e| format!("failed to parse {}: {e}", path.display())),
        Err(_) => Ok(State::default()),
    }
}

pub fn save(home: &Path, state: &State) -> Result<(), String> {
    let path = state_path(home);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
    }
    let text =
        serde_json::to_string_pretty(state).map_err(|e| format!("failed to serialize state: {e}"))?;
    fs::write(&path, text + "\n").map_err(|e| format!("failed to write {}: {e}", path.display()))
}

/// Read `ui.locale`, or `None` if unset.
pub fn get_locale(home: &Path) -> Result<Option<String>, String> {
    let st = load(home)?;
    Ok(st
        .ui
        .as_ref()
        .and_then(|ui| ui.get("locale"))
        .and_then(Value::as_str)
        .map(String::from))
}

/// Set `ui.locale`, preserving any other `ui` fields.
pub fn set_locale(home: &Path, locale: &str) -> Result<(), String> {
    let mut st = load(home)?;
    let ui = st.ui.get_or_insert_with(|| Value::Object(Default::default()));
    match ui.as_object_mut() {
        Some(obj) => {
            obj.insert("locale".to_string(), Value::String(locale.to_string()));
        }
        None => return Err("state.json#ui is not an object".to_string()),
    }
    save(home, &st)
}

/// Whether the first-run welcome has already been shown (`ui.seenWelcome`).
pub fn get_welcome_seen(home: &Path) -> Result<bool, String> {
    let st = load(home)?;
    Ok(st
        .ui
        .as_ref()
        .and_then(|ui| ui.get("seenWelcome"))
        .and_then(Value::as_bool)
        .unwrap_or(false))
}

/// Mark the first-run welcome as shown, preserving other `ui` fields.
pub fn set_welcome_seen(home: &Path) -> Result<(), String> {
    let mut st = load(home)?;
    let ui = st.ui.get_or_insert_with(|| Value::Object(Default::default()));
    match ui.as_object_mut() {
        Some(obj) => {
            obj.insert("seenWelcome".to_string(), Value::Bool(true));
        }
        None => return Err("state.json#ui is not an object".to_string()),
    }
    save(home, &st)
}

/// Insert/replace a single `ui` field, preserving the rest. Shared by the
/// per-key UI setters below.
fn set_ui_field(home: &Path, key: &str, value: Value) -> Result<(), String> {
    let mut st = load(home)?;
    let ui = st.ui.get_or_insert_with(|| Value::Object(Default::default()));
    match ui.as_object_mut() {
        Some(obj) => {
            obj.insert(key.to_string(), value);
        }
        None => return Err("state.json#ui is not an object".to_string()),
    }
    save(home, &st)
}

/// Read `ui.theme` ("system" | "light" | "dark"), or `None` if unset.
pub fn get_theme(home: &Path) -> Result<Option<String>, String> {
    let st = load(home)?;
    Ok(st
        .ui
        .as_ref()
        .and_then(|ui| ui.get("theme"))
        .and_then(Value::as_str)
        .map(String::from))
}

/// Set `ui.theme`, preserving any other `ui` fields.
pub fn set_theme(home: &Path, theme: &str) -> Result<(), String> {
    set_ui_field(home, "theme", Value::String(theme.to_string()))
}

/// Read `ui.sidebarWidth` (px), or `None` if unset.
pub fn get_sidebar_width(home: &Path) -> Result<Option<f64>, String> {
    let st = load(home)?;
    Ok(st
        .ui
        .as_ref()
        .and_then(|ui| ui.get("sidebarWidth"))
        .and_then(Value::as_f64))
}

/// Set `ui.sidebarWidth` (px), preserving any other `ui` fields.
pub fn set_sidebar_width(home: &Path, width: f64) -> Result<(), String> {
    set_ui_field(home, "sidebarWidth", serde_json::json!(width))
}

fn scope_key(scope: &ScopeRef) -> String {
    match scope {
        ScopeRef::User => "user".to_string(),
        ScopeRef::Project { id } => id.clone(),
    }
}

/// Read the cached active profile id for a scope, if any.
pub fn get_active_provider_id(home: &Path, scope: &ScopeRef) -> Result<Option<String>, String> {
    let st = load(home)?;
    Ok(st.active_providers.get(&scope_key(scope)).cloned())
}

/// Cache the active profile id for a scope so startup can avoid keychain reads.
pub fn set_active_provider_id(home: &Path, scope: &ScopeRef, profile_id: &str) -> Result<(), String> {
    let mut st = load(home)?;
    st.active_providers.insert(scope_key(scope), profile_id.to_string());
    save(home, &st)
}

/// Remove the cached active profile id for a scope (e.g., on deactivation).
pub fn clear_active_provider_id(home: &Path, scope: &ScopeRef) -> Result<(), String> {
    let mut st = load(home)?;
    st.active_providers.remove(&scope_key(scope));
    save(home, &st)
}

/// Absolute project paths Claude Code already tracks: the keys of
/// `~/.claude.json#projects`. We never reverse-decode the lossy slug dirs.
pub fn claude_known_paths(home: &Path) -> Vec<String> {
    let path = home.join(".claude.json");
    let Ok(text) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    value
        .get("projects")
        .and_then(Value::as_object)
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default()
}

/// Fallback discovery: the real `cwd` recorded inside each session directory
/// under `~/.claude/projects/`. Covers *live* projects that have session history
/// but are absent from `~/.claude.json`. Only paths that still exist are
/// returned — dead session dirs (ephemeral agent sandboxes, moved trees) are
/// pure noise, and `~/.claude.json` is the authoritative source for tracked
/// projects (including stale ones, shown greyed). Dedup by canonical root merges
/// any overlap with [`claude_known_paths`].
pub fn scan_session_cwds(home: &Path) -> Vec<String> {
    let projects_dir = home.join(".claude").join("projects");
    let Ok(entries) = fs::read_dir(&projects_dir) else {
        return Vec::new();
    };
    let mut cwds = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if dir.is_dir() {
            if let Some(cwd) = first_cwd_in_dir(&dir) {
                if Path::new(&cwd).exists() {
                    cwds.push(cwd);
                }
            }
        }
    }
    cwds
}

pub(crate) fn first_cwd_in_dir(dir: &Path) -> Option<String> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            if let Some(cwd) = first_cwd_in_file(&path) {
                return Some(cwd);
            }
        }
    }
    None
}

fn first_cwd_in_file(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    // The session-start record is a summary without `cwd`; the field appears on
    // the first message record. Scan a bounded prefix to find it.
    for line in BufReader::new(file)
        .lines()
        .take(200)
        .map_while(Result::ok)
    {
        if let Ok(value) = serde_json::from_str::<Value>(&line) {
            if let Some(cwd) = value.get("cwd").and_then(Value::as_str) {
                return Some(cwd.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locale_roundtrips_and_preserves_other_ui_fields() {
        let home = std::env::temp_dir().join(format!("cc-state-test-{}", std::process::id()));
        let dir = home.join(".claude").join("claude-copilot");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("state.json"),
            r#"{"manual_projects":[],"ui":{"theme":"dark"}}"#,
        )
        .unwrap();

        assert_eq!(get_locale(&home).unwrap(), None);
        set_locale(&home, "en").unwrap();
        assert_eq!(get_locale(&home).unwrap(), Some("en".to_string()));

        // An unrelated ui field must survive the locale write.
        let ui = load(&home).unwrap().ui.unwrap();
        assert_eq!(ui.get("theme").and_then(Value::as_str), Some("dark"));

        std::fs::remove_dir_all(&home).ok();
    }
}
