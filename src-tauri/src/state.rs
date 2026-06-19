//! The desktop's own state file at `~/.claude/claude-copilot/state.json`, plus
//! readers for Claude Code's project list. All filesystem I/O for scopes lives
//! here; the pure logic is in `claude_copilot_core::projects`.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use claude_copilot_core::projects::ManualProject;

/// Slice 2 only needs `manual_projects`; `ui` is preserved opaquely so later
/// slices (i18n, window state) can own it without clobbering this one.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct State {
    #[serde(default)]
    pub manual_projects: Vec<ManualProject>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui: Option<Value>,
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

fn first_cwd_in_dir(dir: &Path) -> Option<String> {
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
