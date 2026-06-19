//! Pure-Rust domain layer for Claude Copilot Desktop.
//!
//! No Tauri dependency lives here so that `cargo test -p claude-copilot-core`
//! can regenerate the TypeScript type contract (`src/types/`) without compiling
//! the app's `generate_context!`, which would require a built frontend.

pub mod scopes;
