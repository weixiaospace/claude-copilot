use std::path::PathBuf;

pub mod auth;
pub mod files;
pub mod hooks;
pub mod mcp;
pub mod memory;
pub mod plugins;
pub mod providers;
pub mod resources;
pub mod scopes;
pub mod sessions;
pub mod settings;
pub mod ui;
pub mod usage;

/// Resolve the user's home directory, shared by command modules.
pub(crate) fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "could not resolve the home directory".to_string())
}
