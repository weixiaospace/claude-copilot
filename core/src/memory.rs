//! Auto-memory directory resolution for a project.
//!
//! Memory lives at `~/.claude/projects/<slug>/memory/` unless an
//! `autoMemoryDirectory` setting overrides it (see
//! `docs/claude-code-upstream/en/memory.md`). Memory is project-scoped only.

use std::path::{Path, PathBuf};

use serde::Serialize;
use ts_rs::TS;

/// Claude Code's lossy project-dir encoding: `/`, `.`, and spaces become `-`.
/// Best-effort — it matches observed `~/.claude/projects/<slug>` names, but the
/// mapping is lossy (several characters collapse to `-`).
pub fn project_slug(project_root: &str) -> String {
    project_root
        .chars()
        .map(|c| match c {
            '/' | '.' | ' ' => '-',
            other => other,
        })
        .collect()
}

/// The resolved memory directory, with enough context for a dual-path display.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct MemoryInfo {
    /// The directory memory is actually read from / written to.
    pub effective: String,
    /// The default `~/.claude/projects/<slug>/memory` location.
    pub default: String,
    /// True when an `autoMemoryDirectory` override is in effect.
    pub overridden: bool,
}

fn expand_tilde(home: &Path, value: &str) -> PathBuf {
    if let Some(rest) = value.strip_prefix("~/") {
        home.join(rest)
    } else if value == "~" {
        home.to_path_buf()
    } else {
        PathBuf::from(value)
    }
}

/// Resolve the memory dir. `override_dir` is the `autoMemoryDirectory` value (if
/// set in any settings layer); when present it replaces the default location.
pub fn resolve(home: &Path, project_root: &str, override_dir: Option<&str>) -> MemoryInfo {
    let default = home
        .join(".claude")
        .join("projects")
        .join(project_slug(project_root))
        .join("memory");
    let default_str = default.to_string_lossy().into_owned();

    match override_dir.map(str::trim).filter(|s| !s.is_empty()) {
        Some(value) => MemoryInfo {
            effective: expand_tilde(home, value).to_string_lossy().into_owned(),
            default: default_str,
            overridden: true,
        },
        None => MemoryInfo {
            effective: default_str.clone(),
            default: default_str,
            overridden: false,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_collapses_slash_dot_space() {
        assert_eq!(
            project_slug("/Volumes/YUZI/Projects/claude-copilot"),
            "-Volumes-YUZI-Projects-claude-copilot"
        );
        assert_eq!(project_slug("/Users/me/.config dir"), "-Users-me--config-dir");
    }

    #[test]
    fn resolve_default_location() {
        let info = resolve(Path::new("/home/u"), "/p/repo", None);
        assert!(!info.overridden);
        assert_eq!(info.effective, "/home/u/.claude/projects/-p-repo/memory");
        assert_eq!(info.effective, info.default);
    }

    #[test]
    fn resolve_override_wins_and_expands_tilde() {
        let info = resolve(Path::new("/home/u"), "/p/repo", Some("~/mem"));
        assert!(info.overridden);
        assert_eq!(info.effective, "/home/u/mem");
        assert_eq!(info.default, "/home/u/.claude/projects/-p-repo/memory");
    }

    #[test]
    fn resolve_override_absolute() {
        let info = resolve(Path::new("/home/u"), "/p/repo", Some("/abs/mem"));
        assert_eq!(info.effective, "/abs/mem");
        assert!(info.overridden);
    }

    #[test]
    fn blank_override_is_ignored() {
        let info = resolve(Path::new("/home/u"), "/p/repo", Some("   "));
        assert!(!info.overridden);
    }
}
