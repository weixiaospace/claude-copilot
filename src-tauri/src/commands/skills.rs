//! Skills: the first file-backed resource. Each skill is a subdirectory of a
//! scope's `skills/` dir containing a `SKILL.md`. (Agents/Workflows/Rules
//! follow the same pattern in slice 5.)

use std::fs;
use std::path::{Path, PathBuf};

use claude_copilot_core::file_resource::{self, FileResource};
use claude_copilot_core::scopes::ScopeRef;

use super::{files, home_dir};

fn skills_dir(scope: &ScopeRef, home: &Path) -> PathBuf {
    match scope {
        ScopeRef::User => home.join(".claude").join("skills"),
        ScopeRef::Project { id } => Path::new(id).join(".claude").join("skills"),
    }
}

fn scan(dir: &Path) -> Vec<FileResource> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let sub = entry.path();
        if !sub.is_dir() {
            continue;
        }
        let skill_md = sub.join("SKILL.md");
        let fallback = sub
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        if let Ok(content) = fs::read_to_string(&skill_md) {
            out.push(file_resource::from_markdown(
                &skill_md.to_string_lossy(),
                &content,
                &fallback,
            ));
        }
    }
    file_resource::dedupe_first_wins(out)
}

#[tauri::command]
pub fn list_skills(scope: ScopeRef) -> Result<Vec<FileResource>, String> {
    Ok(scan(&skills_dir(&scope, &home_dir()?)))
}

#[tauri::command]
pub fn create_skill(scope: ScopeRef, name: String) -> Result<FileResource, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '\\']) {
        return Err("invalid skill name".to_string());
    }
    let dir = skills_dir(&scope, &home_dir()?).join(trimmed);
    let skill_md = dir.join("SKILL.md");
    if skill_md.exists() {
        return Err(format!("skill '{trimmed}' already exists"));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create skill dir: {e}"))?;
    let template = format!("---\nname: {trimmed}\ndescription: \n---\n\n# {trimmed}\n");
    fs::write(&skill_md, &template).map_err(|e| format!("failed to write SKILL.md: {e}"))?;
    Ok(file_resource::from_markdown(
        &skill_md.to_string_lossy(),
        &template,
        trimmed,
    ))
}

#[tauri::command]
pub fn delete_skill(path: String) -> Result<(), String> {
    let skill_md = Path::new(&path);
    if skill_md.file_name().and_then(|s| s.to_str()) != Some("SKILL.md") {
        return Err("not a SKILL.md path".to_string());
    }
    let dir = skill_md.parent().ok_or("invalid skill path")?;
    files::reject_if_outside(&home_dir()?, &dir.to_string_lossy())?;
    fs::remove_dir_all(dir).map_err(|e| format!("failed to delete skill: {e}"))
}

#[cfg(test)]
mod smoke {
    use super::*;
    use claude_copilot_core::scopes::ScopeRef;

    /// Diagnostic: list the real user skills. Run with
    /// `cargo test -p claude-copilot-desktop --ignored -- --nocapture`.
    #[test]
    #[ignore = "reads the real ~/.claude/skills; run manually"]
    fn dumps_user_skills() {
        let skills = list_skills(ScopeRef::User).unwrap();
        eprintln!("{} user skills:", skills.len());
        for s in skills.iter().take(15) {
            eprintln!("  {:<24} {:?}", s.name, s.description);
        }
        assert!(!skills.is_empty());
    }
}
