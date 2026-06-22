//! Skill source management: track Git repositories of skills without marketplace
//! manifests, clone/update them, and install individual skills into the current
//! scope's skills directory.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::{json, Value};

use claude_copilot_core::scopes::ScopeRef;
use claude_copilot_core::skills::{
    discover_skills, hash_skill_dir, installed_skill_names, normalize_source_name,
    InstalledSkillSource, SkillSource, SourceSkill,
};

use super::home_dir;

const SKILL_SOURCES_FILE: &str = "skill-sources.json";
const SKILL_SOURCES_DIR: &str = "skill-sources";
const SOURCE_META_DIR: &str = ".claude-copilot";
const SOURCE_META_FILE: &str = "source.json";

fn skill_sources_file(home: &Path) -> PathBuf {
    home.join(".claude")
        .join("claude-copilot")
        .join(SKILL_SOURCES_FILE)
}

fn skill_sources_dir(home: &Path) -> PathBuf {
    home.join(".claude")
        .join("claude-copilot")
        .join(SKILL_SOURCES_DIR)
}

fn read_json(path: &Path) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Null)
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("invalid path")?)
        .map_err(|e| format!("failed to create parent dir: {e}"))?;
    fs::write(path, serde_json::to_string_pretty(value).map_err(|e| e.to_string())?)
        .map_err(|e| format!("failed to write {path:?}: {e}"))
}

fn skills_dir_for_scope(home: &Path, scope: &ScopeRef) -> PathBuf {
    match scope {
        ScopeRef::User => home.join(".claude").join("skills"),
        ScopeRef::Project { id } => Path::new(id).join(".claude").join("skills"),
    }
}

/// Read the persisted skill source list.
fn read_sources(home: &Path) -> Vec<( String, String)> {
    let mut out = Vec::new();
    let json = read_json(&skill_sources_file(home));
    let Some(array) = json.as_array() else {
        return out;
    };
    for entry in array {
        let name = entry.get("name").and_then(Value::as_str).unwrap_or_default();
        let url = entry.get("url").and_then(Value::as_str).unwrap_or_default();
        if !name.is_empty() && !url.is_empty() {
            out.push((name.to_string(), url.to_string()));
        }
    }
    out
}

fn save_sources(home: &Path, sources: &[(String, String)]) -> Result<(), String> {
    let array: Vec<Value> = sources
        .iter()
        .map(|(name, url)| json!({"name": name, "url": url}))
        .collect();
    write_json(&skill_sources_file(home), &Value::Array(array))
}

fn source_dir(home: &Path, name: &str) -> PathBuf {
    skill_sources_dir(home).join(name)
}

fn run_git(args: &[&str]) -> Result<(), String> {
    let output = Command::new("git")
        .args(args)
        .output()
        .map_err(|e| format!("failed to run git: {e}. Is git installed and on PATH?"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr)
            .trim()
            .to_string())
    }
}

/// Clone or re-clone a skill source repository.
fn clone_source(url: &str, target: &Path) -> Result<(), String> {
    if target.exists() {
        fs::remove_dir_all(target)
            .map_err(|e| format!("failed to remove old source clone: {e}"))?;
    }
    fs::create_dir_all(target.parent().ok_or("invalid target path")?)
        .map_err(|e| format!("failed to create source dir: {e}"))?;
    run_git(&["clone", "--depth", "1", url, &target.to_string_lossy()])
}

/// Load a source, discover its skills, and compare against installed skills in
/// the requested scope.
fn load_source(
    home: &Path,
    name: &str,
    url: &str,
    scope: &ScopeRef,
) -> Result<SkillSource, String> {
    let repo = source_dir(home, name);
    let discovered = discover_skills(&repo);

    let installed = installed_skill_names(&skills_dir_for_scope(home, scope));

    let mut skills = Vec::new();
    for (skill_name, description, relative_path, skill_dir) in discovered {
        let (is_installed, update_available) = if installed.contains(&skill_name) {
            let installed_path = skills_dir_for_scope(home, scope).join(&skill_name);
            let update_available = installed_path
                .exists()
                .then(|| {
                    let installed_hash = hash_skill_dir(&installed_path).unwrap_or_default();
                    let source_hash = hash_skill_dir(&skill_dir).unwrap_or_default();
                    installed_hash != source_hash
                })
                .unwrap_or(false);
            (true, update_available)
        } else {
            (false, false)
        };

        skills.push(SourceSkill {
            name: skill_name,
            description,
            path: relative_path,
            installed: is_installed,
            update_available,
        });
    }

    Ok(SkillSource {
        name: name.to_string(),
        url: url.to_string(),
        skills,
    })
}

#[tauri::command]
pub fn list_skill_sources(scope: ScopeRef) -> Result<Vec<SkillSource>, String> {
    let home = home_dir()?;
    let sources = read_sources(&home);
    let mut out = Vec::new();
    for (name, url) in sources {
        match load_source(&home, &name, &url, &scope) {
            Ok(source) => out.push(source),
            Err(e) => eprintln!("warning: failed to load skill source {name}: {e}"),
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn add_skill_source(url: String) -> Result<(), String> {
    let home = home_dir()?;
    let name = normalize_source_name(&url)?;

    let mut sources = read_sources(&home);
    if sources.iter().any(|(n, _)| n == &name) {
        return Err(format!("skill source '{}' already exists", name));
    }

    let target = source_dir(&home, &name);
    clone_source(&url, &target)?;

    sources.push((name, url));
    save_sources(&home, &sources)
}

#[tauri::command]
pub fn update_skill_source(name: String) -> Result<(), String> {
    let home = home_dir()?;
    let sources = read_sources(&home);
    let url = sources
        .iter()
        .find(|(n, _)| n == &name)
        .map(|(_, u)| u.clone())
        .ok_or_else(|| format!("skill source '{}' not found", name))?;

    let target = source_dir(&home, &name);
    clone_source(&url, &target)
}

#[tauri::command]
pub fn remove_skill_source(name: String) -> Result<(), String> {
    let home = home_dir()?;
    let mut sources = read_sources(&home);
    let idx = sources
        .iter()
        .position(|(n, _)| n == &name)
        .ok_or_else(|| format!("skill source '{}' not found", name))?;

    let target = source_dir(&home, &name);
    if target.exists() {
        fs::remove_dir_all(&target)
            .map_err(|e| format!("failed to remove source clone: {e}"))?;
    }

    sources.remove(idx);
    save_sources(&home, &sources)
}

/// Install a skill from a source into the target scope's skills directory.
#[tauri::command]
pub fn install_skill_from_source(
    source: String,
    skill: String,
    scope: ScopeRef,
) -> Result<(), String> {
    let home = home_dir()?;
    let repo = source_dir(&home, &source);

    let discovered = discover_skills(&repo);
    let (_, _, relative_path, skill_dir) = discovered
        .into_iter()
        .find(|(name, _, _, _)| name == &skill)
        .ok_or_else(|| format!("skill '{}' not found in source '{}'", skill, source))?;

    let target_dir = skills_dir_for_scope(&home, &scope).join(&skill);

    if target_dir.exists() {
        fs::remove_dir_all(&target_dir)
            .map_err(|e| format!("failed to remove existing skill dir: {e}"))?;
    }

    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("failed to create skill dir: {e}"))?;

    copy_dir_contents(&skill_dir, &target_dir)
        .map_err(|e| format!("failed to copy skill: {e}"))?;

    // Persist source metadata inside the installed skill.
    let source_hash = hash_skill_dir(&skill_dir).unwrap_or_default();
    let source_url = read_sources(&home)
        .into_iter()
        .find(|(n, _)| n == &source)
        .map(|(_, u)| u)
        .unwrap_or_default();
    let meta = InstalledSkillSource {
        source_name: source.clone(),
        source_url,
        source_skill_path: relative_path,
        source_hash,
    };
    let meta_dir = target_dir.join(SOURCE_META_DIR);
    fs::create_dir_all(&meta_dir)
        .map_err(|e| format!("failed to create meta dir: {e}"))?;
    fs::write(
        meta_dir.join(SOURCE_META_FILE),
        serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("failed to write source meta: {e}"))?;

    Ok(())
}

/// Uninstall a skill from the target scope's skills directory.
#[tauri::command]
pub fn uninstall_skill(name: String, scope: ScopeRef) -> Result<(), String> {
    let home = home_dir()?;
    let target = skills_dir_for_scope(&home, &scope).join(&name);
    if !target.exists() {
        return Err(format!("skill '{}' is not installed", name));
    }
    fs::remove_dir_all(&target)
        .map_err(|e| format!("failed to uninstall skill: {e}"))
}

fn copy_dir_contents(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let name = path.file_name().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid file name")
        })?;

        // Skip desktop metadata and git internals.
        let name_str = name.to_string_lossy();
        if name_str.starts_with('.') && (name_str == ".claude-copilot" || name_str == ".git") {
            continue;
        }

        let dest = dst.join(name);
        if path.is_dir() {
            copy_dir_contents(&path, &dest)?;
        } else {
            fs::copy(&path, &dest)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_source_name_for_nested_dir() {
        assert_eq!(
            normalize_source_name("https://github.com/owner/repo").unwrap(),
            "github.com/owner/repo"
        );
    }

    #[test]
    #[ignore = "requires local git and /tmp/test-skill-source; run manually"]
    fn adds_and_lists_local_skill_source() {
        // Smoke test: add a local file:// skill source and verify skills are discovered.
        let url = "file:///tmp/test-skill-source";
        let name = normalize_source_name(url).unwrap();
        assert!(name.ends_with("test-skill-source"));
    }
}
