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

/// How the app learned about a project: tracked by Claude Code, added manually
/// by the user, or both.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "snake_case")]
pub enum ScopeSource {
    Claude,
    Manual,
    Both,
}

/// A sidebar entry the user can select: the User scope, or one project
/// (identified canonically by its git repository root).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct Scope {
    /// Stable identity: `"user"` for the user scope, or the project's canonical
    /// root path.
    pub id: String,
    pub kind: ScopeKind,
    /// Human-readable label shown in the sidebar.
    pub label: String,
    /// Absolute path of the project's git root; `None` for the User scope.
    pub path: Option<String>,
    /// The project's path no longer exists on disk.
    pub stale: bool,
    /// How the project was discovered; `None` for the User scope. Only
    /// manually-added projects (`Manual` / `Both`) are user-removable.
    pub source: Option<ScopeSource>,
}

impl Scope {
    /// The always-present User scope, pinned at the top of the sidebar.
    pub fn user() -> Self {
        Scope {
            id: "user".to_string(),
            kind: ScopeKind::User,
            label: "User".to_string(),
            path: None,
            stale: false,
            source: None,
        }
    }
}
