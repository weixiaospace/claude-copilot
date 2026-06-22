//! Helpers for locating and invoking the Claude Code CLI.
//!
//! GUI apps on macOS do not inherit the user's shell PATH (e.g. `~/.zshrc`),
//! so every command that shells out to `claude` must resolve the binary
//! through an explicit lookup instead of relying on `Command::new("claude")`.

use std::env;
use std::path::PathBuf;

/// Resolve the `claude` executable, first via `PATH` and then a set of common
/// absolute install locations.
pub fn resolve_claude_path() -> Option<PathBuf> {
    let name = if cfg!(windows) { "claude.exe" } else { "claude" };

    if let Ok(path) = env::var("PATH") {
        for dir in env::split_paths(&path) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    // Fallback to common absolute paths. GUI-launched apps on macOS often miss
    // user shell PATH additions (Homebrew, npm/pnpm global, cargo, pipx, etc.).
    let home = dirs::home_dir().unwrap_or_default();
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/opt/homebrew/bin").join(name));
        candidates.push(PathBuf::from("/usr/local/bin").join(name));
        candidates.push(PathBuf::from("/opt/local/bin").join(name));
        candidates.push(home.join(".cargo").join("bin").join(name));
        candidates.push(home.join(".local").join("bin").join(name));
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/local/bin").join(name));
        candidates.push(PathBuf::from("/usr/bin").join(name));
        candidates.push(home.join(".cargo").join("bin").join(name));
        candidates.push(home.join(".local").join("bin").join(name));
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            candidates.push(PathBuf::from(&local_app_data).join("Programs").join("Claude").join(name));
        }
        candidates.push(home.join(".local").join("bin").join(name));
    }

    candidates.into_iter().find(|p| p.is_file())
}

/// Convert a repository home-page URL into a raw marketplace manifest URL that
/// `claude plugin marketplace add` can consume directly. Without this, the CLI
/// fetches the HTML page and fails schema validation.
pub fn normalize_marketplace_source(source: &str) -> String {
    let trimmed = source.trim();

    // Already a direct manifest URL or shorthand like "owner/repo" / "github:owner/repo".
    if trimmed.ends_with("marketplace.json")
        || !trimmed.starts_with("http")
        || trimmed.contains(' ')
    {
        return trimmed.to_string();
    }

    let manifest_path = "/.claude-plugin/marketplace.json";

    // CNB: https://cnb.cool/owner/repo → https://cnb.cool/owner/repo/-/git/raw/main/.claude-plugin/marketplace.json
    if let Some(rest) = trimmed.strip_prefix("https://cnb.cool/") {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() >= 2 {
            let owner = parts[0];
            let repo = parts[1];
            let branch = parts.get(3).copied().unwrap_or("main");
            return format!("https://cnb.cool/{owner}/{repo}/-/git/raw/{branch}{manifest_path}");
        }
    }

    // GitHub: https://github.com/owner/repo[/tree/branch/path]
    if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        let path = rest.split('?').next().unwrap_or(rest);
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if segments.len() >= 2 {
            let owner = segments[0];
            let repo = segments[1];
            let (branch, extra_path) = if segments.len() >= 4 && segments[2] == "tree" {
                (segments[3], segments[4..].join("/"))
            } else {
                ("main", String::new())
            };
            let suffix = if extra_path.is_empty() {
                manifest_path.to_string()
            } else {
                format!("/{extra_path}{manifest_path}")
            };
            return format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}{suffix}");
        }
    }

    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_cnb_repo_url() {
        assert_eq!(
            normalize_marketplace_source("https://cnb.cool/dachengzhihui/dacheng-marketplace"),
            "https://cnb.cool/dachengzhihui/dacheng-marketplace/-/git/raw/main/.claude-plugin/marketplace.json"
        );
    }

    #[test]
    fn normalizes_github_repo_url() {
        assert_eq!(
            normalize_marketplace_source("https://github.com/anthropics/claude-plugins-official"),
            "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json"
        );
    }

    #[test]
    fn preserves_raw_url() {
        let raw = "https://cnb.cool/dachengzhihui/dacheng-marketplace/-/git/raw/main/.claude-plugin/marketplace.json";
        assert_eq!(normalize_marketplace_source(raw), raw);
    }

    #[test]
    fn preserves_shorthand() {
        assert_eq!(
            normalize_marketplace_source("anthropics/claude-plugins-official"),
            "anthropics/claude-plugins-official"
        );
    }

    #[test]
    #[ignore = "requires locally installed Claude CLI; run manually"]
    fn resolves_local_claude_cli() {
        let path = resolve_claude_path().expect("claude CLI should be resolvable");
        assert!(path.is_file(), "resolved path should exist: {path:?}");
    }
}
