use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Whether a scope is the user's global config or a single project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "snake_case")]
pub enum ScopeKind {
    User,
    Project,
}

/// A reference to a scope, used as a command argument.
///
/// `User` is the global `~/.claude/` scope; `Project` carries the project id
/// (see [`Scope::id`]).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ScopeRef {
    User,
    Project { id: String },
}

/// A sidebar entry the user can select. In slice 1 only the User scope exists;
/// project enumeration arrives in slice 2.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct Scope {
    /// Stable identity: `"user"` for the user scope, or the project's id.
    pub id: String,
    pub kind: ScopeKind,
    /// Human-readable label shown in the sidebar.
    pub label: String,
}

/// The scopes to show in the sidebar.
///
/// Slice 1: just the User scope. Project enumeration (git-root identity,
/// `~/.claude.json#projects`, manual projects) lands in slice 2 (issue #2).
pub fn list_scopes() -> Vec<Scope> {
    vec![Scope {
        id: "user".to_string(),
        kind: ScopeKind::User,
        label: "User".to_string(),
    }]
}
