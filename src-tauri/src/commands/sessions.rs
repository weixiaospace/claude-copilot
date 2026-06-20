//! Project sessions: list the Claude Code transcripts for a project and open a
//! terminal to resume / start one. Terminal launch is structured (fixed tool
//! allowlist + validated session id), never a free command string.

use std::fs;
use std::time::UNIX_EPOCH;

use claude_copilot_core::projects::canonical_root;
use claude_copilot_core::sessions::{preview_from_jsonl, Session};

use super::{files, home_dir};
use crate::state;

/// List the project's sessions, newest first. Includes every slug dir whose
/// recovered cwd resolves to this project's root (a project can map to several).
#[tauri::command]
pub fn list_sessions(project_id: String) -> Result<Vec<Session>, String> {
    let projects_dir = home_dir()?.join(".claude").join("projects");
    let Ok(entries) = fs::read_dir(&projects_dir) else {
        return Ok(Vec::new());
    };
    let mut sessions = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        match state::first_cwd_in_dir(&dir) {
            Some(cwd) if canonical_root(&cwd) == project_id => {}
            _ => continue,
        }
        let Ok(files_iter) = fs::read_dir(&dir) else {
            continue;
        };
        for f in files_iter.flatten() {
            let path = f.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let id = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let modified_ms = f
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64)
                .unwrap_or(0.0);
            let preview = fs::read_to_string(&path)
                .ok()
                .and_then(|c| preview_from_jsonl(&c));
            sessions.push(Session {
                id,
                modified_ms,
                preview,
            });
        }
    }
    sessions.sort_by(|a, b| {
        b.modified_ms
            .partial_cmp(&a.modified_ms)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(sessions)
}

/// Open a terminal at the project root running `<tool>` (optionally resuming a
/// session). `tool` is allowlisted; `session_id` is validated.
#[tauri::command]
pub fn open_terminal(
    project_id: String,
    tool: String,
    session_id: Option<String>,
) -> Result<(), String> {
    files::reject_if_outside(&home_dir()?, &project_id)?;
    if tool != "claude" && tool != "happy" {
        return Err(format!("unknown tool: {tool}"));
    }
    let command = match session_id {
        Some(id) => {
            if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
                return Err("invalid session id".to_string());
            }
            format!("{tool} --resume {id}")
        }
        None => tool,
    };
    open_terminal_at(&project_id, &command)
}

#[cfg(target_os = "macos")]
fn open_terminal_at(dir: &str, command: &str) -> Result<(), String> {
    let shell = format!("cd '{}' && {}", dir.replace('\'', "'\\''"), command);
    let script = format!(
        "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
        shell.replace('\\', "\\\\").replace('"', "\\\"")
    );
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to open Terminal: {e}"))
}

#[cfg(target_os = "windows")]
fn open_terminal_at(dir: &str, command: &str) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "cmd", "/K"])
        .arg(format!("cd /d \"{dir}\" && {command}"))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to open terminal: {e}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_terminal_at(dir: &str, command: &str) -> Result<(), String> {
    let shell = format!("cd '{}' && {}; exec $SHELL", dir.replace('\'', "'\\''"), command);
    for term in ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"] {
        if std::process::Command::new(term)
            .arg("-e")
            .arg(format!("sh -c \"{}\"", shell.replace('"', "\\\"")))
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
    }
    Err("no terminal emulator found".to_string())
}
