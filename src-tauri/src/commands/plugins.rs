//! Plugins: the one tree-shaped panel. Reads plugin/marketplace metadata
//! directly from `~/.claude/plugins/` (offline) and delegates mutations to the
//! `claude plugin` CLI. Bundled resources are listed read-only (ADR-0001).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

use claude_copilot_core::file_resource::{self, FileResource};
use claude_copilot_core::plugins::{
    self, AvailablePlugin, BundledKind, BundledResource, InstalledPlugin, Marketplace,
};

use super::home_dir;

fn read_json(path: &Path) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Null)
}

fn plugins_dir(home: &Path) -> PathBuf {
    home.join(".claude").join("plugins")
}

fn enabled_map(home: &Path) -> Value {
    read_json(&home.join(".claude").join("settings.json"))
        .get("enabledPlugins")
        .cloned()
        .unwrap_or(Value::Null)
}

#[tauri::command]
pub fn list_plugins() -> Result<Vec<InstalledPlugin>, String> {
    let home = home_dir()?;
    let installed = read_json(&plugins_dir(&home).join("installed_plugins.json"));
    Ok(plugins::parse_installed(&installed, &enabled_map(&home)))
}

#[tauri::command]
pub fn list_marketplaces() -> Result<Vec<Marketplace>, String> {
    let home = home_dir()?;
    Ok(plugins::parse_marketplaces(&read_json(
        &plugins_dir(&home).join("known_marketplaces.json"),
    )))
}

#[tauri::command]
pub fn list_available_plugins() -> Result<Vec<AvailablePlugin>, String> {
    let home = home_dir()?;
    let installed = plugins::parse_installed(
        &read_json(&plugins_dir(&home).join("installed_plugins.json")),
        &enabled_map(&home),
    );
    let ids: Vec<String> = installed.into_iter().map(|p| p.id).collect();
    let catalog = read_json(&plugins_dir(&home).join("plugin-catalog-cache.json"));
    Ok(plugins::parse_catalog(&catalog, &ids))
}

/// List the resources a plugin ships, scanning its install dir read-only.
#[tauri::command]
pub fn list_bundled_resources(install_path: String) -> Result<Vec<BundledResource>, String> {
    let root = Path::new(&install_path);
    let mut out = Vec::new();

    // Skills: subdir/SKILL.md
    let skills = root.join("skills");
    if let Ok(entries) = fs::read_dir(&skills) {
        for e in entries.flatten() {
            let dir = e.path();
            let skill_md = dir.join("SKILL.md");
            if skill_md.is_file() {
                let fallback = dir
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let name = fs::read_to_string(&skill_md)
                    .map(|c| file_resource::from_markdown(&skill_md.to_string_lossy(), &c, &fallback).name)
                    .unwrap_or(fallback);
                out.push(BundledResource {
                    kind: BundledKind::Skill,
                    name,
                    path: skill_md.to_string_lossy().into_owned(),
                });
            }
        }
    }

    // Agents / Commands: recursive .md
    for (kind, sub) in [(BundledKind::Agent, "agents"), (BundledKind::Command, "commands")] {
        collect_markdown(&root.join(sub), kind, &mut out);
    }

    // Hooks: hooks/hooks.json
    let hooks_json = root.join("hooks").join("hooks.json");
    if hooks_json.is_file() {
        out.push(BundledResource {
            kind: BundledKind::Hook,
            name: "hooks.json".to_string(),
            path: hooks_json.to_string_lossy().into_owned(),
        });
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn collect_markdown(dir: &Path, kind: BundledKind, out: &mut Vec<BundledResource>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect_markdown(&p, kind, out);
        } else if p.extension().and_then(|x| x.to_str()) == Some("md") {
            let fallback = p
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let res: FileResource = fs::read_to_string(&p)
                .map(|c| file_resource::from_markdown(&p.to_string_lossy(), &c, &fallback))
                .unwrap_or(FileResource {
                    name: fallback,
                    description: None,
                    path: p.to_string_lossy().into_owned(),
                });
            out.push(BundledResource {
                kind,
                name: res.name,
                path: res.path,
            });
        }
    }
}

/// Run a `claude plugin …` subcommand, mapping a missing binary to a clear error.
fn run_claude(args: &[&str]) -> Result<String, String> {
    let output = Command::new("claude").args(args).output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Claude CLI not found on PATH. Install Claude Code to manage plugins.".to_string()
        } else {
            format!("failed to run claude: {e}")
        }
    })?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr)
            .trim()
            .to_string())
    }
}

#[tauri::command]
pub fn install_plugin(name: String) -> Result<(), String> {
    run_claude(&["plugin", "install", &name]).map(|_| ())
}

#[tauri::command]
pub fn uninstall_plugin(name: String) -> Result<(), String> {
    run_claude(&["plugin", "uninstall", &name]).map(|_| ())
}

#[tauri::command]
pub fn toggle_plugin(name: String, enable: bool) -> Result<(), String> {
    let action = if enable { "enable" } else { "disable" };
    run_claude(&["plugin", action, &name]).map(|_| ())
}

#[tauri::command]
pub fn add_marketplace(source: String) -> Result<(), String> {
    run_claude(&["plugin", "marketplace", "add", &source]).map(|_| ())
}

#[tauri::command]
pub fn remove_marketplace(name: String) -> Result<(), String> {
    run_claude(&["plugin", "marketplace", "remove", &name]).map(|_| ())
}

#[tauri::command]
pub fn update_marketplace(name: Option<String>) -> Result<(), String> {
    match name {
        Some(n) => run_claude(&["plugin", "marketplace", "update", &n]).map(|_| ()),
        None => run_claude(&["plugin", "marketplace", "update"]).map(|_| ()),
    }
}
