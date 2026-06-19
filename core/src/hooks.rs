//! Read-only hook discovery. Hooks come from four sources (user/project/local
//! settings + installed plugins) and are flattened into a uniform list for
//! display. The event map has the same shape everywhere: `settings.json#hooks`
//! and a plugin's `hooks/hooks.json#hooks` both hold
//! `{ Event: [ { matcher?, hooks: [ { type, command } ] } ] }`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// Where a hook came from. `user`/`plugin` show under the User panel;
/// `project`/`local` under the Project panel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "snake_case")]
pub enum HookSource {
    User,
    Project,
    Local,
    Plugin,
}

/// One flattened hook: a command bound to an event (optionally gated by a
/// matcher), tagged with its source and the file it lives in (for "open file").
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct HookEntry {
    pub event: String,
    pub matcher: Option<String>,
    pub command: String,
    pub source: HookSource,
    /// The file this hook was read from (a settings file or a plugin's
    /// `hooks.json`), used by the "open file" action.
    pub source_path: Option<String>,
}

/// Flatten a `{ Event: [ { matcher?, hooks: [ { command } ] } ] }` map into
/// entries. Tolerates missing/odd shapes by skipping them.
pub fn flatten(hooks_map: &Value, source: HookSource, source_path: &str) -> Vec<HookEntry> {
    let mut out = Vec::new();
    let Some(events) = hooks_map.as_object() else {
        return out;
    };
    for (event, groups) in events {
        let Some(groups) = groups.as_array() else {
            continue;
        };
        for group in groups {
            let matcher = group
                .get("matcher")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(String::from);
            let Some(hooks) = group.get("hooks").and_then(Value::as_array) else {
                continue;
            };
            for hook in hooks {
                if let Some(command) = hook.get("command").and_then(Value::as_str) {
                    out.push(HookEntry {
                        event: event.clone(),
                        matcher: matcher.clone(),
                        command: command.to_string(),
                        source,
                        source_path: Some(source_path.to_string()),
                    });
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn flattens_events_matchers_and_commands() {
        let map = json!({
            "PreToolUse": [
                { "matcher": "Edit|Write", "hooks": [
                    { "type": "command", "command": "fmt" },
                    { "type": "command", "command": "lint" }
                ] }
            ],
            "Stop": [
                { "hooks": [ { "type": "command", "command": "notify" } ] }
            ]
        });
        let mut out = flatten(&map, HookSource::Project, "/p/.claude/settings.json");
        out.sort_by(|a, b| a.command.cmp(&b.command));

        assert_eq!(out.len(), 3);
        let fmt = out.iter().find(|h| h.command == "fmt").unwrap();
        assert_eq!(fmt.event, "PreToolUse");
        assert_eq!(fmt.matcher.as_deref(), Some("Edit|Write"));
        assert_eq!(fmt.source, HookSource::Project);

        let notify = out.iter().find(|h| h.command == "notify").unwrap();
        assert_eq!(notify.matcher, None); // no matcher -> None
        assert_eq!(notify.event, "Stop");
    }

    #[test]
    fn non_object_map_yields_nothing() {
        assert!(flatten(&Value::Null, HookSource::User, "/x").is_empty());
        assert!(flatten(&json!([]), HookSource::User, "/x").is_empty());
    }
}
