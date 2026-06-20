//! Usage dashboard: aggregate token usage from session JSONL under
//! `~/.claude/projects/<slug>/`. User scope spans all projects; a project scope
//! spans every slug dir whose recorded `cwd` resolves to that repo root.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

use serde_json::Value;

use claude_copilot_core::projects;
use claude_copilot_core::scopes::ScopeRef;
use claude_copilot_core::usage::{self, Granularity, UsageRecord, UsageResult};

use super::home_dir;

/// First `cwd` recorded in a session dir (bounded scan), used to decide which
/// slug dirs belong to a project.
fn dir_cwd(dir: &Path) -> Option<String> {
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(file) = fs::File::open(&path) else {
            continue;
        };
        for line in BufReader::new(file).lines().take(200).map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                if let Some(cwd) = v.get("cwd").and_then(Value::as_str) {
                    return Some(cwd.to_string());
                }
            }
        }
    }
    None
}

/// Append every usage record from a session dir's jsonl files; returns the
/// number of session files read.
fn records_in_dir(dir: &Path, out: &mut Vec<UsageRecord>) -> u32 {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut sessions = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(file) = fs::File::open(&path) else {
            continue;
        };
        sessions += 1;
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            // Cheap pre-filter: only lines carrying a token `usage` block can
            // yield a record. Skips the JSON parse for the bulk of the transcript
            // (user/summary/tool lines) — the dominant cost on large histories.
            if !line.contains("\"usage\"") {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                if let Some(r) = usage::extract_record(&v) {
                    out.push(r);
                }
            }
        }
    }
    sessions
}

#[tauri::command]
pub fn query_usage(scope: ScopeRef, granularity: Granularity) -> Result<UsageResult, String> {
    let home = home_dir()?;
    let projects_dir = home.join(".claude").join("projects");
    let project_root = match &scope {
        ScopeRef::User => None,
        ScopeRef::Project { id } => Some(id.clone()),
    };

    let mut records = Vec::new();
    let mut sessions = 0u32;
    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            // Project scope: include only slug dirs whose cwd resolves to this root.
            if let Some(root) = &project_root {
                match dir_cwd(&dir) {
                    Some(cwd) if &projects::canonical_root(&cwd) == root => {}
                    _ => continue,
                }
            }
            sessions += records_in_dir(&dir, &mut records);
        }
    }
    Ok(usage::aggregate(&records, granularity, sessions))
}
