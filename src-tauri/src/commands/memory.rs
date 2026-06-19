//! Project auto-memory: list/create/delete markdown files in the resolved
//! memory directory, plus `memory_info` for the dual-path display. The memory
//! dir is a layer-2 auto-trusted location (derived from `autoMemoryDirectory`
//! settings), so list/create/delete operate on it directly, validating that
//! targets stay inside it.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use claude_copilot_core::file_resource::{self, FileResource};
use claude_copilot_core::memory::{self, MemoryInfo};

use super::home_dir;

/// Read `autoMemoryDirectory` from the project's settings layers, in precedence
/// order: project `settings.local.json` → project `settings.json` → user
/// `~/.claude/settings.json`.
fn read_auto_memory_dir(home: &Path, project_root: &str) -> Option<String> {
    let candidates = [
        Path::new(project_root)
            .join(".claude")
            .join("settings.local.json"),
        Path::new(project_root).join(".claude").join("settings.json"),
        home.join(".claude").join("settings.json"),
    ];
    for path in candidates {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                if let Some(dir) = value.get("autoMemoryDirectory").and_then(Value::as_str) {
                    if !dir.trim().is_empty() {
                        return Some(dir.to_string());
                    }
                }
            }
        }
    }
    None
}

fn resolve_info(home: &Path, project_id: &str) -> MemoryInfo {
    let override_dir = read_auto_memory_dir(home, project_id);
    memory::resolve(home, project_id, override_dir.as_deref())
}

#[tauri::command]
pub fn memory_info(project_id: String) -> Result<MemoryInfo, String> {
    Ok(resolve_info(&home_dir()?, &project_id))
}

#[tauri::command]
pub fn list_memories(project_id: String) -> Result<Vec<FileResource>, String> {
    let dir = PathBuf::from(resolve_info(&home_dir()?, &project_id).effective);
    Ok(scan(&dir))
}

fn scan(dir: &Path) -> Vec<FileResource> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let fallback = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        if let Ok(content) = fs::read_to_string(&path) {
            out.push(file_resource::from_markdown(
                &path.to_string_lossy(),
                &content,
                &fallback,
            ));
        }
    }
    file_resource::dedupe_first_wins(out)
}

#[tauri::command]
pub fn create_memory(project_id: String, name: String) -> Result<FileResource, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '\\']) {
        return Err("invalid memory name".to_string());
    }
    let stem = trimmed.strip_suffix(".md").unwrap_or(trimmed);
    let dir = PathBuf::from(resolve_info(&home_dir()?, &project_id).effective);
    let file = dir.join(format!("{stem}.md"));
    if file.exists() {
        return Err(format!("memory '{stem}' already exists"));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create memory dir: {e}"))?;
    let template = format!("---\nname: {stem}\n---\n\n# {stem}\n");
    fs::write(&file, &template).map_err(|e| format!("failed to write memory: {e}"))?;
    Ok(file_resource::from_markdown(
        &file.to_string_lossy(),
        &template,
        stem,
    ))
}

#[tauri::command]
pub fn delete_memory(project_id: String, path: String) -> Result<(), String> {
    let dir = PathBuf::from(resolve_info(&home_dir()?, &project_id).effective);
    let canon_dir = dir
        .canonicalize()
        .map_err(|e| format!("memory dir: {e}"))?;
    let canon_file = Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("{path}: {e}"))?;
    if !canon_file.starts_with(&canon_dir) {
        return Err("file is outside the memory directory".to_string());
    }
    if canon_file.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("not a markdown file".to_string());
    }
    fs::remove_file(&canon_file).map_err(|e| format!("failed to delete memory: {e}"))
}
