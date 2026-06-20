//! Plugin metadata parsing. Pure helpers over the JSON Claude Code maintains
//! under `~/.claude/plugins/` and the `enabledPlugins` map in settings; all
//! filesystem IO and the `claude plugin` CLI live in the command layer.

use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

/// An installed plugin (from `installed_plugins.json` + `settings#enabledPlugins`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct InstalledPlugin {
    /// Full identifier, `name@marketplace`.
    pub id: String,
    pub name: String,
    pub marketplace: String,
    pub enabled: bool,
    pub version: String,
    pub install_path: String,
    pub scope: String,
}

/// A configured marketplace (from `known_marketplaces.json`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct Marketplace {
    pub name: String,
    pub source: String,
    pub install_location: String,
}

/// Kind of a plugin-bundled resource.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "snake_case")]
pub enum BundledKind {
    Skill,
    Agent,
    Command,
    Hook,
}

/// A resource shipped inside a plugin (shown read-only under its row, never in
/// the top-level resource tabs — ADR-0001).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct BundledResource {
    pub kind: BundledKind,
    pub name: String,
    pub path: String,
}

/// A plugin offered by a marketplace (from the catalog cache). The description /
/// version / author are best-effort — empty when the catalog entry omits them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct AvailablePlugin {
    pub id: String,
    pub name: String,
    pub marketplace: String,
    pub installed: bool,
    pub description: String,
    pub version: String,
    pub author: String,
}

fn split_id(id: &str) -> (String, String) {
    match id.split_once('@') {
        Some((name, market)) => (name.to_string(), market.to_string()),
        None => (id.to_string(), String::new()),
    }
}

/// Parse `installed_plugins.json` (`plugins` map) joined with the
/// `enabledPlugins` map from settings.
pub fn parse_installed(installed: &Value, enabled: &Value) -> Vec<InstalledPlugin> {
    let mut out = Vec::new();
    let Some(map) = installed.get("plugins").and_then(Value::as_object) else {
        return out;
    };
    for (id, installs) in map {
        let (name, marketplace) = split_id(id);
        let first = installs.as_array().and_then(|a| a.first());
        let get = |k: &str| {
            first
                .and_then(|x| x.get(k))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        out.push(InstalledPlugin {
            id: id.clone(),
            name,
            marketplace,
            enabled: enabled.get(id).and_then(Value::as_bool).unwrap_or(false),
            version: {
                let v = get("version");
                if v.is_empty() { "unknown".to_string() } else { v }
            },
            install_path: get("installPath"),
            scope: {
                let s = get("scope");
                if s.is_empty() { "user".to_string() } else { s }
            },
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// Parse `known_marketplaces.json`.
pub fn parse_marketplaces(json: &Value) -> Vec<Marketplace> {
    let mut out = Vec::new();
    let Some(obj) = json.as_object() else {
        return out;
    };
    for (name, m) in obj {
        let source = match m.get("source") {
            Some(s) => {
                let kind = s.get("source").and_then(Value::as_str).unwrap_or_default();
                let repo = s
                    .get("repo")
                    .and_then(Value::as_str)
                    .or_else(|| s.get("url").and_then(Value::as_str))
                    .unwrap_or_default();
                if repo.is_empty() {
                    kind.to_string()
                } else {
                    format!("{kind}:{repo}")
                }
            }
            None => String::new(),
        };
        out.push(Marketplace {
            name: name.clone(),
            source,
            install_location: m
                .get("installLocation")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// Parse the catalog cache (`catalog.plugins`) into available plugins, marking
/// those already installed.
pub fn parse_catalog(catalog: &Value, installed_ids: &[String]) -> Vec<AvailablePlugin> {
    let mut out = Vec::new();
    let Some(map) = catalog
        .get("catalog")
        .and_then(|c| c.get("plugins"))
        .and_then(Value::as_object)
    else {
        return out;
    };
    for (id, entry) in map {
        let (name, marketplace) = split_id(id);
        let s = |k: &str| entry.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
        // `author` may be a string or an object like `{ "name": "…" }`.
        let author = entry
            .get("author")
            .and_then(|a| {
                a.as_str()
                    .map(String::from)
                    .or_else(|| a.get("name").and_then(Value::as_str).map(String::from))
            })
            .unwrap_or_default();
        out.push(AvailablePlugin {
            id: id.clone(),
            name,
            marketplace,
            installed: installed_ids.iter().any(|x| x == id),
            description: s("description"),
            version: s("version"),
            author,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_installed_with_enabled_state() {
        let installed = json!({
            "version": 2,
            "plugins": {
                "alpha@official": [{"scope":"user","installPath":"/p/alpha","version":"1.0"}],
                "beta@official": [{"scope":"user","installPath":"/p/beta"}]
            }
        });
        let enabled = json!({ "alpha@official": true });
        let got = parse_installed(&installed, &enabled);
        assert_eq!(got.len(), 2);
        let alpha = got.iter().find(|p| p.name == "alpha").unwrap();
        assert!(alpha.enabled);
        assert_eq!(alpha.marketplace, "official");
        assert_eq!(alpha.version, "1.0");
        let beta = got.iter().find(|p| p.name == "beta").unwrap();
        assert!(!beta.enabled); // absent from enabled map -> false
        assert_eq!(beta.version, "unknown");
    }

    #[test]
    fn parses_marketplaces() {
        let json = json!({
            "official": {
                "source": { "source": "github", "repo": "anthropics/claude-plugins-official" },
                "installLocation": "/m/official"
            }
        });
        let got = parse_marketplaces(&json);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].source, "github:anthropics/claude-plugins-official");
        assert_eq!(got[0].install_location, "/m/official");
    }

    #[test]
    fn parses_catalog_marks_installed() {
        let catalog = json!({ "catalog": { "plugins": {
            "alpha@official": {}, "gamma@official": {}
        }}});
        let got = parse_catalog(&catalog, &["alpha@official".to_string()]);
        assert_eq!(got.len(), 2);
        assert!(got.iter().find(|p| p.name == "alpha").unwrap().installed);
        assert!(!got.iter().find(|p| p.name == "gamma").unwrap().installed);
    }

    #[test]
    fn parses_catalog_metadata_best_effort() {
        let catalog = json!({ "catalog": { "plugins": {
            "alpha@official": {
                "description": "Reviews your changes",
                "version": "2.1.0",
                "author": { "name": "Acme" }
            },
            "gamma@official": {}
        }}});
        let got = parse_catalog(&catalog, &[]);
        let alpha = got.iter().find(|p| p.name == "alpha").unwrap();
        assert_eq!(alpha.description, "Reviews your changes");
        assert_eq!(alpha.version, "2.1.0");
        assert_eq!(alpha.author, "Acme");
        // Missing metadata degrades to empty strings, never panics.
        let gamma = got.iter().find(|p| p.name == "gamma").unwrap();
        assert_eq!(gamma.description, "");
        assert_eq!(gamma.author, "");
    }
}
