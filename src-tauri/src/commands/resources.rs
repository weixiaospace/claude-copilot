//! File-backed resources: Skills, Agents, Rules (markdown) and Workflows (JS).
//! One generic scan over three discovery modes, reusing the pure helpers in
//! `claude_copilot_core::file_resource`. Harvested from the Skills slice (#8)
//! once a second instance was in hand (ADR-0001).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use claude_copilot_core::file_resource::{self, FileResource};
use claude_copilot_core::scopes::ScopeRef;

use super::{files, home_dir};

#[derive(Clone, Copy)]
enum Discovery {
    /// Each immediate subdir is one resource; metadata in `<subdir>/<file>`.
    SubdirFile(&'static str),
    /// Every `.md` file, recursively.
    MarkdownRecursive,
    /// Every `.js` file in the top directory (no frontmatter).
    JsFlat,
}

struct Kind {
    dir: &'static str,
    discovery: Discovery,
}

const SKILLS: Kind = Kind { dir: "skills", discovery: Discovery::SubdirFile("SKILL.md") };
const AGENTS: Kind = Kind { dir: "agents", discovery: Discovery::MarkdownRecursive };
const RULES: Kind = Kind { dir: "rules", discovery: Discovery::MarkdownRecursive };
const WORKFLOWS: Kind = Kind { dir: "workflows", discovery: Discovery::JsFlat };
const OUTPUT_STYLES: Kind = Kind { dir: "output-styles", discovery: Discovery::MarkdownRecursive };

fn root(scope: &ScopeRef, home: &Path, dir: &str) -> PathBuf {
    match scope {
        ScopeRef::User => home.join(".claude").join(dir),
        ScopeRef::Project { id } => Path::new(id).join(".claude").join(dir),
    }
}

fn collect_markdown(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_markdown(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            out.push(path);
        }
    }
}

fn read_resource(path: &Path, fallback: &str) -> Option<FileResource> {
    let content = fs::read_to_string(path).ok()?;
    Some(file_resource::from_markdown(
        &path.to_string_lossy(),
        &content,
        fallback,
    ))
}

fn scan(dir: &Path, discovery: Discovery) -> Vec<FileResource> {
    let mut out = Vec::new();
    match discovery {
        Discovery::SubdirFile(file) => {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let sub = entry.path();
                    if !sub.is_dir() {
                        continue;
                    }
                    let fallback = sub
                        .file_name()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    if let Some(r) = read_resource(&sub.join(file), &fallback) {
                        out.push(r);
                    }
                }
            }
        }
        Discovery::MarkdownRecursive => {
            let mut paths = Vec::new();
            collect_markdown(dir, &mut paths);
            for path in paths {
                let fallback = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if let Some(r) = read_resource(&path, &fallback) {
                    out.push(r);
                }
            }
        }
        Discovery::JsFlat => {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("js") {
                        let name = path
                            .file_stem()
                            .map(|s| s.to_string_lossy().into_owned())
                            .unwrap_or_default();
                        out.push(FileResource {
                            name,
                            description: None,
                            path: path.to_string_lossy().into_owned(),
                        });
                    }
                }
            }
        }
    }
    file_resource::dedupe_first_wins(out)
}

fn list(scope: ScopeRef, kind: &Kind) -> Result<Vec<FileResource>, String> {
    Ok(scan(&root(&scope, &home_dir()?, kind.dir), kind.discovery))
}

/// Create a single-markdown-file resource (`<dir>/<name>.md`).
fn create_markdown(scope: ScopeRef, kind: &Kind, name: &str) -> Result<FileResource, String> {
    let name = name.trim();
    if name.is_empty() || name.contains(['/', '\\']) {
        return Err("invalid name".to_string());
    }
    let dir = root(&scope, &home_dir()?, kind.dir);
    let file = dir.join(format!("{name}.md"));
    if file.exists() {
        return Err(format!("'{name}' already exists"));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create dir: {e}"))?;
    let template = format!("---\nname: {name}\ndescription: \n---\n\n# {name}\n");
    fs::write(&file, &template).map_err(|e| format!("failed to write {name}.md: {e}"))?;
    Ok(file_resource::from_markdown(
        &file.to_string_lossy(),
        &template,
        name,
    ))
}

// ── Skills (subdir + SKILL.md) ──────────────────────────────────────────────

#[tauri::command]
pub fn list_skills(scope: ScopeRef) -> Result<Vec<FileResource>, String> {
    list(scope, &SKILLS)
}

#[tauri::command]
pub fn create_skill(scope: ScopeRef, name: String) -> Result<FileResource, String> {
    let name = name.trim();
    if name.is_empty() || name.contains(['/', '\\']) {
        return Err("invalid skill name".to_string());
    }
    let dir = root(&scope, &home_dir()?, SKILLS.dir).join(name);
    let skill_md = dir.join("SKILL.md");
    if skill_md.exists() {
        return Err(format!("skill '{name}' already exists"));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create skill dir: {e}"))?;
    let template = format!("---\nname: {name}\ndescription: \n---\n\n# {name}\n");
    fs::write(&skill_md, &template).map_err(|e| format!("failed to write SKILL.md: {e}"))?;
    Ok(file_resource::from_markdown(
        &skill_md.to_string_lossy(),
        &template,
        name,
    ))
}

/// Delete a skill: `path` is its `SKILL.md`; the containing directory is removed.
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

// ── Agents / Rules (recursive markdown) ─────────────────────────────────────

#[tauri::command]
pub fn list_agents(scope: ScopeRef) -> Result<Vec<FileResource>, String> {
    list(scope, &AGENTS)
}

#[tauri::command]
pub fn create_agent(scope: ScopeRef, name: String) -> Result<FileResource, String> {
    create_markdown(scope, &AGENTS, &name)
}

#[tauri::command]
pub fn list_rules(scope: ScopeRef) -> Result<Vec<FileResource>, String> {
    list(scope, &RULES)
}

#[tauri::command]
pub fn create_rule(scope: ScopeRef, name: String) -> Result<FileResource, String> {
    create_markdown(scope, &RULES, &name)
}

// ── Workflows (flat .js, Claude-authored: list + delete only) ────────────────

#[tauri::command]
pub fn list_workflows(scope: ScopeRef) -> Result<Vec<FileResource>, String> {
    list(scope, &WORKFLOWS)
}

/// Delete a flat single-file resource (an Agent/Rule `.md` or a Workflow `.js`).
#[tauri::command]
pub fn delete_resource(path: String) -> Result<(), String> {
    files::reject_if_outside(&home_dir()?, &path)?;
    let p = Path::new(&path);
    if !p.is_file() {
        return Err("not a file".to_string());
    }
    fs::remove_file(p).map_err(|e| format!("failed to delete: {e}"))
}

// ── Output Styles (recursive markdown + active selection) ───────────────────

#[tauri::command]
pub fn list_output_styles(scope: ScopeRef) -> Result<Vec<FileResource>, String> {
    list(scope, &OUTPUT_STYLES)
}

#[tauri::command]
pub fn create_output_style(scope: ScopeRef, name: String) -> Result<FileResource, String> {
    create_markdown(scope, &OUTPUT_STYLES, &name)
}

/// The settings file holding the active `outputStyle` for a scope. User →
/// `~/.claude/settings.json`; Project → its `settings.local.json` (personal,
/// not committed) when `local`, else its committed `settings.json`.
fn settings_file(scope: &ScopeRef, home: &Path, local: bool) -> PathBuf {
    match scope {
        ScopeRef::User => home.join(".claude").join("settings.json"),
        ScopeRef::Project { id } => {
            let name = if local { "settings.local.json" } else { "settings.json" };
            Path::new(id).join(".claude").join(name)
        }
    }
}

fn read_string_key(path: &Path, key: &str) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value.get(key).and_then(Value::as_str).map(String::from)
}

fn write_string_key(path: &Path, key: &str, value: &str) -> Result<(), String> {
    let mut doc: Value = match fs::read_to_string(path) {
        Ok(text) => {
            serde_json::from_str(&text).map_err(|e| format!("parse {}: {e}", path.display()))?
        }
        Err(_) => Value::Object(Default::default()),
    };
    if !doc.is_object() {
        doc = Value::Object(Default::default());
    }
    doc.as_object_mut()
        .unwrap()
        .insert(key.to_string(), Value::String(value.to_string()));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("failed to create dir: {e}"))?;
    }
    let text = serde_json::to_string_pretty(&doc).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, text + "\n").map_err(|e| format!("write {}: {e}", path.display()))
}

/// Effective active output style for a scope: local > project > user.
#[tauri::command]
pub fn get_active_output_style(scope: ScopeRef) -> Result<Option<String>, String> {
    let home = home_dir()?;
    if let ScopeRef::Project { .. } = scope {
        if let Some(v) = read_string_key(&settings_file(&scope, &home, true), "outputStyle") {
            return Ok(Some(v));
        }
        if let Some(v) = read_string_key(&settings_file(&scope, &home, false), "outputStyle") {
            return Ok(Some(v));
        }
        return Ok(read_string_key(
            &home.join(".claude").join("settings.json"),
            "outputStyle",
        ));
    }
    Ok(read_string_key(&settings_file(&scope, &home, false), "outputStyle"))
}

/// Set the active output style. User → `settings.json`; Project → its personal
/// `settings.local.json` (never the committed `settings.json`).
#[tauri::command]
pub fn set_active_output_style(scope: ScopeRef, name: String) -> Result<(), String> {
    let home = home_dir()?;
    let local = matches!(scope, ScopeRef::Project { .. });
    write_string_key(&settings_file(&scope, &home, local), "outputStyle", &name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_output_style_prefers_local_then_project_then_user() {
        let base = std::env::temp_dir().join(format!("cc-os-test-{}", std::process::id()));
        let proj = base.join("proj");
        let claude = proj.join(".claude");
        fs::create_dir_all(&claude).unwrap();
        let scope = ScopeRef::Project { id: proj.to_string_lossy().into_owned() };

        write_string_key(&claude.join("settings.json"), "outputStyle", "team").unwrap();
        assert_eq!(get_active_for(&base, &scope), Some("team".to_string()));

        write_string_key(&claude.join("settings.local.json"), "outputStyle", "mine").unwrap();
        assert_eq!(get_active_for(&base, &scope), Some("mine".to_string()));

        fs::remove_dir_all(&base).ok();
    }

    // Mirrors get_active_output_style with an injectable home (keeps the
    // user-level fallback hermetic).
    fn get_active_for(home: &Path, scope: &ScopeRef) -> Option<String> {
        if let ScopeRef::Project { .. } = scope {
            read_string_key(&settings_file(scope, home, true), "outputStyle")
                .or_else(|| read_string_key(&settings_file(scope, home, false), "outputStyle"))
                .or_else(|| {
                    read_string_key(&home.join(".claude").join("settings.json"), "outputStyle")
                })
        } else {
            read_string_key(&settings_file(scope, home, false), "outputStyle")
        }
    }

    #[test]
    fn scans_each_discovery_mode() {
        let base = std::env::temp_dir().join(format!("cc-res-test-{}", std::process::id()));
        let mk = |rel: &str, body: &str| {
            let p = base.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, body).unwrap();
        };
        mk("skills/foo/SKILL.md", "---\nname: Foo\ndescription: a skill\n---\n");
        mk("agents/bar.md", "---\nname: Bar\n---\n");
        mk("agents/nested/baz.md", "no frontmatter");
        mk("rules/r1.md", "---\ndescription: rule one\n---\n");
        mk("workflows/w1.js", "export const meta = {}");

        let skills = scan(&base.join("skills"), Discovery::SubdirFile("SKILL.md"));
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "Foo");

        let agents = scan(&base.join("agents"), Discovery::MarkdownRecursive);
        assert_eq!(agents.len(), 2); // bar + nested/baz
        assert!(agents.iter().any(|a| a.name == "Bar"));
        assert!(agents.iter().any(|a| a.name == "baz")); // fallback to file stem

        let rules = scan(&base.join("rules"), Discovery::MarkdownRecursive);
        assert_eq!(rules[0].name, "r1"); // file stem; description from frontmatter
        assert_eq!(rules[0].description.as_deref(), Some("rule one"));

        let workflows = scan(&base.join("workflows"), Discovery::JsFlat);
        assert_eq!(workflows.len(), 1);
        assert_eq!(workflows[0].name, "w1");
        assert_eq!(workflows[0].description, None);

        fs::remove_dir_all(&base).ok();
    }
}
