use std::path::PathBuf;

pub mod files;
pub mod hooks;
pub mod mcp;
pub mod memory;
pub mod plugins;
pub mod resources;
pub mod scopes;
pub mod ui;

/// Resolve the user's home directory, shared by command modules.
pub(crate) fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "could not resolve the home directory".to_string())
}
