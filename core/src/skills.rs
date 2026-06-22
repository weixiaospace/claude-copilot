//! Skill source discovery and metadata parsing.
//!
//! A skill source is a Git repository of skills without a marketplace manifest.
//! The desktop tracks skill sources separately from plugin marketplaces and lets
//! users install individual skills into the current scope's skills directory.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::file_resource;

/// A tracked Git repository that ships skills.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct SkillSource {
    /// Canonical nested directory name derived from the normalized URL,
    /// e.g. `github.com/owner/repo`.
    pub name: String,
    /// Original URL as entered by the user.
    pub url: String,
    /// Skills discovered in this source.
    pub skills: Vec<SourceSkill>,
}

/// A skill offered by a skill source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct SourceSkill {
    pub name: String,
    pub description: String,
    /// Relative path from the source root to the skill directory.
    pub path: String,
    /// Whether this skill is already installed in the target scope.
    pub installed: bool,
    /// Whether the installed copy differs from the source copy.
    pub update_available: bool,
}

/// Metadata persisted inside an installed skill's `.claude-copilot/source.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledSkillSource {
    pub source_name: String,
    pub source_url: String,
    pub source_skill_path: String,
    pub source_hash: String,
}

/// Normalize a Git URL into a unique nested directory name.
///
/// Examples:
/// - `https://github.com/owner/repo` → `github.com/owner/repo`
/// - `https://github.com/owner/repo.git` → `github.com/owner/repo`
/// - `git@github.com:owner/repo.git` → `github.com/owner/repo`
/// - `https://cnb.cool/owner/repo` → `cnb.cool/owner/repo`
pub fn normalize_source_name(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("empty URL".to_string());
    }

    // Strip scheme.
    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);

    // Handle SSH form git@host:path
    let without_scheme = if let Some(rest) = without_scheme.strip_prefix("git@") {
        rest.replacen(':', "/", 1)
    } else {
        without_scheme.to_string()
    };

    // Drop .git suffix, query, fragment.
    let mut path = without_scheme
        .split_once('?')
        .map(|(p, _)| p)
        .unwrap_or(&without_scheme)
        .split_once('#')
        .map(|(p, _)| p)
        .unwrap_or(&without_scheme)
        .to_string();

    if path.ends_with(".git") {
        path.truncate(path.len() - 4);
    }

    // Trim trailing slashes.
    path = path.trim_end_matches('/').to_string();

    if path.is_empty() {
        return Err(format!("could not normalize URL: {url}"));
    }
    Ok(path)
}

/// Extract the display name for a source based on de-duplication rules.
///
/// Rules:
/// 1. Default to repo name (last segment).
/// 2. If duplicated, include the owner (second-to-last/segment before repo).
/// 3. If still duplicated, include the full host path.
pub fn display_name(name: &str, all_names: &[String]) -> String {
    let parts: Vec<&str> = name.split('/').collect();
    let repo = parts.last().copied().unwrap_or(name);

    let is_unique = |candidate: &str| {
        all_names
            .iter()
            .filter(|n| display_name_internal(n, candidate))
            .count()
            <= 1
    };

    // Helper: whether `name` would produce `candidate` as its display name.
    fn display_name_internal(name: &str, candidate: &str) -> bool {
        let parts: Vec<&str> = name.split('/').collect();
        if parts.len() >= 1 && *parts.last().unwrap() == candidate {
            return true;
        }
        if parts.len() >= 2 {
            let owner_repo = format!("{}/{}", parts[parts.len() - 2], parts.last().unwrap());
            if owner_repo == candidate {
                return true;
            }
        }
        name == candidate
    }

    if is_unique(repo) {
        return repo.to_string();
    }

    if parts.len() >= 2 {
        let owner_repo = format!("{}/{}", parts[parts.len() - 2], parts.last().unwrap());
        if is_unique(&owner_repo) {
            return owner_repo;
        }
    }

    name.to_string()
}

/// Discover all skills inside a cloned source repository.
///
/// A skill is a directory (or the repo root) containing a `SKILL.md` file.
/// The skill name is read from the SKILL.md frontmatter when available,
/// otherwise the directory name is used.
pub fn discover_skills(repo: &Path) -> Vec<(String, String, String, PathBuf)> {
    let mut out = Vec::new();
    let skill_files = find_skill_files(repo);

    for skill_md in skill_files {
        let skill_dir = if skill_md.parent() == Some(repo) {
            repo.to_path_buf()
        } else {
            skill_md.parent().unwrap_or(repo).to_path_buf()
        };

        let fallback = if skill_dir == repo {
            repo.file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "unnamed".to_string())
        } else {
            skill_dir
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "unnamed".to_string())
        };

        let name = read_skill_name(&skill_md).unwrap_or(fallback);
        let description = read_skill_description(&skill_md).unwrap_or_default();
        let relative = skill_dir
            .strip_prefix(repo)
            .unwrap_or(Path::new(""))
            .to_string_lossy()
            .into_owned();

        out.push((name, description, relative, skill_dir));
    }

    out.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    out
}

fn find_skill_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let _ = walk_skill_files(root, &mut out);
    out
}

fn walk_skill_files(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            // Skip hidden dirs and the desktop's own metadata dir.
            let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if name.starts_with('.') {
                continue;
            }
            walk_skill_files(&path, out)?;
        } else if path.file_name().and_then(|s| s.to_str()) == Some("SKILL.md") {
            out.push(path);
        }
    }
    Ok(())
}

fn read_skill_name(skill_md: &Path) -> Option<String> {
    let content = fs::read_to_string(skill_md).ok()?;
    let resource = file_resource::from_markdown(&skill_md.to_string_lossy(), &content, "");
    if resource.name.is_empty() {
        None
    } else {
        Some(resource.name)
    }
}

fn read_skill_description(skill_md: &Path) -> Option<String> {
    let content = fs::read_to_string(skill_md).ok()?;
    let resource = file_resource::from_markdown(&skill_md.to_string_lossy(), &content, "");
    resource.description
}

/// Compute a simple content hash for a skill directory by hashing all files
/// under it (except `.claude-copilot/` metadata).
pub fn hash_skill_dir(skill_dir: &Path) -> Result<String, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::Hasher;

    let mut hasher = DefaultHasher::new();
    hash_dir(skill_dir, skill_dir, &mut hasher)?;
    Ok(format!("{:016x}", hasher.finish()))
}

fn hash_dir(
    root: &Path,
    dir: &Path,
    hasher: &mut std::collections::hash_map::DefaultHasher,
) -> Result<(), String> {
    use std::hash::Hash;

    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("failed to read dir {}: {e}", dir.display()))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .collect();
    entries.sort();

    for path in entries {
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        // Skip desktop metadata and git internals.
        if name.starts_with('.') && (name == ".claude-copilot" || name == ".git") {
            continue;
        }

        if path.is_dir() {
            hash_dir(root, &path, hasher)?;
        } else {
            let rel = path
                .strip_prefix(root)
                .map_err(|_| format!("path not under root: {}", path.display()))?
                .to_string_lossy();
            rel.hash(hasher);
            let content = fs::read(&path).map_err(|e| format!("failed to read {}: {e}", path.display()))?;
            content.hash(hasher);
        }
    }
    Ok(())
}

/// Build the set of installed skill names in a scope's skills directory.
pub fn installed_skill_names(skills_dir: &Path) -> HashSet<String> {
    let mut out = HashSet::new();
    let Ok(entries) = fs::read_dir(skills_dir) else {
        return out;
    };
    for e in entries.flatten() {
        let path = e.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if !skill_md.is_file() {
            continue;
        }
        let name = read_skill_name(&skill_md)
            .or_else(|| {
                path.file_name()
                    .map(|s| s.to_string_lossy().into_owned())
            })
            .unwrap_or_default();
        if !name.is_empty() {
            out.insert(name);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_https_url() {
        assert_eq!(
            normalize_source_name("https://github.com/owner/repo").unwrap(),
            "github.com/owner/repo"
        );
    }

    #[test]
    fn normalizes_url_with_git_suffix() {
        assert_eq!(
            normalize_source_name("https://github.com/owner/repo.git").unwrap(),
            "github.com/owner/repo"
        );
    }

    #[test]
    fn normalizes_ssh_url() {
        assert_eq!(
            normalize_source_name("git@github.com:owner/repo.git").unwrap(),
            "github.com/owner/repo"
        );
    }

    #[test]
    fn normalizes_cnb_url() {
        assert_eq!(
            normalize_source_name("https://cnb.cool/owner/repo").unwrap(),
            "cnb.cool/owner/repo"
        );
    }

    #[test]
    fn display_name_defaults_to_repo() {
        assert_eq!(
            display_name("github.com/owner/repo", &["github.com/owner/repo".to_string()]),
            "repo"
        );
    }

    #[test]
    fn display_name_includes_owner_when_repo_conflicts() {
        let names = vec![
            "github.com/owner/repo".to_string(),
            "github.com/other/repo".to_string(),
        ];
        assert_eq!(display_name("github.com/owner/repo", &names), "owner/repo");
    }

    #[test]
    fn display_name_uses_full_when_still_conflicts() {
        let names = vec![
            "github.com/owner/repo".to_string(),
            "cnb.cool/owner/repo".to_string(),
        ];
        assert_eq!(
            display_name("github.com/owner/repo", &names),
            "github.com/owner/repo"
        );
    }

    #[test]
    fn discovers_nested_skills() {
        use std::io::Write;

        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        let skill_a = root.join("skills").join("alpha");
        fs::create_dir_all(&skill_a).unwrap();
        let mut f = fs::File::create(skill_a.join("SKILL.md")).unwrap();
        writeln!(f, "---\nname: alpha-skill\ndescription: Alpha desc\n---").unwrap();

        let skill_b = root.join("skills").join("beta");
        fs::create_dir_all(&skill_b).unwrap();
        let mut f = fs::File::create(skill_b.join("SKILL.md")).unwrap();
        writeln!(f, "---\nname: beta-skill\ndescription: Beta desc\n---").unwrap();

        let found = discover_skills(root);
        assert_eq!(found.len(), 2);

        let names: Vec<_> = found.iter().map(|(n, _, _, _)| n.clone()).collect();
        assert!(names.contains(&"alpha-skill".to_string()));
        assert!(names.contains(&"beta-skill".to_string()));
    }

    #[test]
    fn discovers_root_skill() {
        use std::io::Write;

        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let mut f = fs::File::create(root.join("SKILL.md")).unwrap();
        writeln!(f, "---\nname: root-skill\ndescription: Root desc\n---").unwrap();

        let found = discover_skills(root);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, "root-skill");
    }
}
