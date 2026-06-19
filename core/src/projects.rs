//! Project enumeration and identity.
//!
//! A project's canonical identity is its **git repository root** (a non-git
//! folder is its own root). Candidate paths come from two sources — the keys of
//! `~/.claude.json#projects` (Claude-known) and the user's manually-added
//! folders — and are unioned, deduped by root, and labelled. See `CONTEXT.md`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::scopes::{Scope, ScopeKind, ScopeSource};

/// A folder the user added by hand, persisted in `state.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManualProject {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Walk up from `start` looking for a `.git` entry, returning the repo root, or
/// `start` itself if none is found. Pure core for [`git_root`]; the predicate
/// decides whether a directory holds a `.git`.
fn git_root_with<F: Fn(&Path) -> bool>(start: &Path, has_git: F) -> PathBuf {
    let mut cur = Some(start);
    while let Some(dir) = cur {
        if has_git(dir) {
            return dir.to_path_buf();
        }
        cur = dir.parent();
    }
    start.to_path_buf()
}

/// Resolve a path to its git repository root, or the path itself if it is not
/// inside a repo. Only meaningful for paths that exist.
pub fn git_root(start: &Path) -> PathBuf {
    git_root_with(start, |dir| dir.join(".git").exists())
}

/// A project candidate already resolved to its canonical root.
pub struct Resolved {
    pub root: String,
    pub stale: bool,
    pub source: ScopeSource,
}

fn merge_source(a: ScopeSource, b: ScopeSource) -> ScopeSource {
    if a == b {
        a
    } else {
        ScopeSource::Both
    }
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

fn parent_basename(path: &str) -> Option<String> {
    Path::new(path)
        .parent()
        .and_then(|p| p.file_name())
        .map(|s| s.to_string_lossy().into_owned())
}

/// Dedupe resolved candidates by root (merging their source and OR-ing
/// staleness), assign labels (basename, prefixed with the parent dir when two
/// roots share a basename), and sort by label.
pub fn finalize(candidates: Vec<Resolved>) -> Vec<Scope> {
    let mut by_root: BTreeMap<String, (bool, ScopeSource)> = BTreeMap::new();
    for c in candidates {
        by_root
            .entry(c.root)
            .and_modify(|e| {
                e.0 = e.0 || c.stale;
                e.1 = merge_source(e.1, c.source);
            })
            .or_insert((c.stale, c.source));
    }

    let mut base_count: BTreeMap<String, usize> = BTreeMap::new();
    for root in by_root.keys() {
        *base_count.entry(basename(root)).or_insert(0) += 1;
    }

    let mut scopes: Vec<Scope> = by_root
        .into_iter()
        .map(|(root, (stale, source))| {
            let base = basename(&root);
            let collides = base_count.get(&base).copied().unwrap_or(0) > 1;
            let label = match (collides, parent_basename(&root)) {
                (true, Some(parent)) => format!("{parent}/{base}"),
                _ => base,
            };
            Scope {
                id: root.clone(),
                kind: ScopeKind::Project,
                label,
                path: Some(root),
                stale,
                source: Some(source),
            }
        })
        .collect();
    scopes.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    scopes
}

/// The canonical identity of a path: its git root if the path exists, otherwise
/// the path kept as-is (a missing path can't be walked up). Used both to build
/// scopes and to match a manual entry for removal.
pub fn canonical_root(path: &str) -> String {
    let p = Path::new(path);
    if p.exists() {
        git_root(p).to_string_lossy().into_owned()
    } else {
        path.trim_end_matches('/').to_string()
    }
}

/// Resolve one raw path to a candidate, marking it stale when it is missing.
fn resolve(path: &str, source: ScopeSource) -> Resolved {
    Resolved {
        root: canonical_root(path),
        stale: !Path::new(path).exists(),
        source,
    }
}

/// Build the project scopes from the Claude-known paths (keys of
/// `~/.claude.json#projects`) and the manually-added projects.
pub fn list_project_scopes(claude_paths: &[String], manual: &[ManualProject]) -> Vec<Scope> {
    let mut candidates = Vec::with_capacity(claude_paths.len() + manual.len());
    for p in claude_paths {
        candidates.push(resolve(p, ScopeSource::Claude));
    }
    for m in manual {
        candidates.push(resolve(&m.path, ScopeSource::Manual));
    }
    finalize(candidates)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(root: &str, stale: bool, source: ScopeSource) -> Resolved {
        Resolved {
            root: root.to_string(),
            stale,
            source,
        }
    }

    #[test]
    fn git_root_walks_up_to_the_repo() {
        // .git lives at /a/b; a cwd of /a/b/c/d resolves to /a/b.
        let root = git_root_with(Path::new("/a/b/c/d"), |dir| dir == Path::new("/a/b"));
        assert_eq!(root, PathBuf::from("/a/b"));
    }

    #[test]
    fn git_root_falls_back_to_self_outside_a_repo() {
        let root = git_root_with(Path::new("/a/b/c"), |_| false);
        assert_eq!(root, PathBuf::from("/a/b/c"));
    }

    #[test]
    fn dedupes_by_root_and_merges_source() {
        // Same repo known to Claude and added manually -> one scope, Both.
        let scopes = finalize(vec![
            r("/repo", false, ScopeSource::Claude),
            r("/repo", false, ScopeSource::Manual),
        ]);
        assert_eq!(scopes.len(), 1);
        assert_eq!(scopes[0].id, "/repo");
        assert_eq!(scopes[0].source, Some(ScopeSource::Both));
    }

    #[test]
    fn collapses_subdirs_of_one_repo() {
        // Two launch dirs resolving to the same root collapse to one row.
        let scopes = finalize(vec![
            r("/repo", false, ScopeSource::Claude),
            r("/repo", false, ScopeSource::Claude),
        ]);
        assert_eq!(scopes.len(), 1);
    }

    #[test]
    fn disambiguates_colliding_basenames_with_parent() {
        let scopes = finalize(vec![
            r("/work/web", false, ScopeSource::Manual),
            r("/play/web", false, ScopeSource::Manual),
            r("/solo/api", false, ScopeSource::Manual),
        ]);
        let label = |id: &str| {
            scopes
                .iter()
                .find(|s| s.id == id)
                .map(|s| s.label.clone())
                .unwrap()
        };
        assert_eq!(label("/work/web"), "work/web");
        assert_eq!(label("/play/web"), "play/web");
        assert_eq!(label("/solo/api"), "api"); // unique basename stays plain
    }

    #[test]
    fn stale_propagates_when_any_candidate_is_stale() {
        let scopes = finalize(vec![
            r("/gone", false, ScopeSource::Claude),
            r("/gone", true, ScopeSource::Manual),
        ]);
        assert_eq!(scopes.len(), 1);
        assert!(scopes[0].stale);
    }

    #[test]
    fn sorts_by_label_case_insensitively() {
        let scopes = finalize(vec![
            r("/x/Zebra", false, ScopeSource::Manual),
            r("/x/apple", false, ScopeSource::Manual),
        ]);
        assert_eq!(scopes[0].label, "apple");
        assert_eq!(scopes[1].label, "Zebra");
    }
}
