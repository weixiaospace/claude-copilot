//! The file-backed resource shape shared by Skills, Agents, Workflows, Output
//! Styles, and Rules: a markdown file with `name`/`description` frontmatter,
//! listed per scope. Slice 8 wires Skills; the others follow in slice 5.

use std::collections::HashSet;

use serde::Serialize;
use serde_yaml::Value;
use ts_rs::TS;

use crate::frontmatter;

/// One listed resource. `path` points at the markdown file to open/edit (a
/// skill's `SKILL.md`, or the resource file itself for flat resources).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct FileResource {
    pub name: String,
    pub description: Option<String>,
    pub path: String,
}

/// Build a resource from a markdown file's content. `name`/`description` come
/// from frontmatter; `name` falls back to `fallback_name` (the dir or file
/// name) when absent.
pub fn from_markdown(path: &str, content: &str, fallback_name: &str) -> FileResource {
    let (fm, _body) = frontmatter::split(content);
    let name = fm
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| fallback_name.to_string());
    let description = fm
        .get("description")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);
    FileResource {
        name,
        description,
        path: path.to_string(),
    }
}

/// First-wins dedup by name (case-insensitive): sort by name, keep the first
/// occurrence. Implements ADR-0001's within-scope same-name policy.
pub fn dedupe_first_wins(mut items: Vec<FileResource>) -> Vec<FileResource> {
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    let mut seen = HashSet::new();
    items.retain(|r| seen.insert(r.name.to_lowercase()));
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_from_frontmatter_else_fallback() {
        let a = from_markdown("/x/SKILL.md", "---\nname: Real\n---\nbody", "dir-name");
        assert_eq!(a.name, "Real");
        let b = from_markdown("/x/SKILL.md", "no frontmatter", "dir-name");
        assert_eq!(b.name, "dir-name");
        assert_eq!(b.description, None);
    }

    #[test]
    fn description_is_extracted_and_trimmed() {
        let r = from_markdown("/x.md", "---\nname: n\ndescription:  hi  \n---\n", "x");
        assert_eq!(r.description.as_deref(), Some("hi"));
    }

    #[test]
    fn first_wins_dedup_keeps_one_per_name_sorted() {
        let items = vec![
            FileResource { name: "Beta".into(), description: None, path: "/b".into() },
            FileResource { name: "alpha".into(), description: None, path: "/a1".into() },
            FileResource { name: "Alpha".into(), description: None, path: "/a2".into() },
        ];
        let out = dedupe_first_wins(items);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].name, "alpha"); // case-insensitive sort, first kept
        assert_eq!(out[0].path, "/a1");
        assert_eq!(out[1].name, "Beta");
    }
}
