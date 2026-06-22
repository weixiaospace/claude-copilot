//! MCP server discovery. Servers live in three places (the corrected model,
//! spec §0): user `~/.claude.json#mcpServers`, project `<root>/.mcp.json`, and
//! local `~/.claude.json#projects["<abs>"].mcpServers`. We read these JSON files
//! directly; writes (add/remove) go through the `claude mcp` CLI.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// Which of the three MCP locations a server came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "snake_case")]
pub enum McpSource {
    User,
    Project,
    Local,
}

/// A key/value pair on an MCP server (an env var or an HTTP header).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct McpKeyVal {
    pub key: String,
    pub value: String,
}

/// One configured MCP server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct McpServer {
    pub name: String,
    /// `stdio` / `sse` / `http` / `unknown` — from `type`/`transport`, or
    /// inferred from whether a command or url is present.
    pub transport: String,
    pub url: Option<String>,
    pub command: Option<String>,
    /// stdio subprocess arguments (after the command).
    pub args: Vec<String>,
    /// stdio environment variables. Values may be secret — mask them in the UI.
    pub env: Vec<McpKeyVal>,
    /// http/sse request headers. Values may be secret — mask them in the UI.
    pub headers: Vec<McpKeyVal>,
    pub source: McpSource,
    /// Trust state of a **project** (`.mcp.json`) server: `approved` / `pending`
    /// / `rejected`, derived from the project's enabled/disabled lists in
    /// `~/.claude.json`. `None` for user/local servers, which are always active.
    pub approval: Option<String>,
}

/// Trust state of a project `.mcp.json` server given the project's
/// `enabledMcpjsonServers` / `disabledMcpjsonServers` name lists. A server the
/// user hasn't explicitly approved or rejected is `pending` — Claude Code won't
/// use it until it's approved via the trust dialog.
pub fn mcpjson_approval(name: &str, enabled: &[String], disabled: &[String]) -> String {
    if disabled.iter().any(|n| n == name) {
        "rejected".to_string()
    } else if enabled.iter().any(|n| n == name) {
        "approved".to_string()
    } else {
        "pending".to_string()
    }
}

/// Parse a `mcpServers` object (`{ name: { type?/transport?, url?, command? } }`)
/// into servers tagged with `source`, sorted by name. Tolerates odd shapes.
pub fn parse_servers(map: &Value, source: McpSource) -> Vec<McpServer> {
    let Some(obj) = map.as_object() else {
        return Vec::new();
    };
    let mut out: Vec<McpServer> = obj
        .iter()
        .map(|(name, cfg)| {
            let url = cfg.get("url").and_then(Value::as_str).map(String::from);
            let command = cfg.get("command").and_then(Value::as_str).map(String::from);
            let args = cfg
                .get("args")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            // Parse `env` / `headers` objects into key/value pairs. A non-string
            // value (rare) degrades to its JSON text rather than being dropped.
            let pairs = |field: &str| {
                cfg.get(field)
                    .and_then(Value::as_object)
                    .map(|o| {
                        o.iter()
                            .map(|(k, v)| McpKeyVal {
                                key: k.clone(),
                                value: v.as_str().map(String::from).unwrap_or_else(|| v.to_string()),
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            };
            let env = pairs("env");
            let headers = pairs("headers");
            let transport = cfg
                .get("type")
                .and_then(Value::as_str)
                .or_else(|| cfg.get("transport").and_then(Value::as_str))
                .map(String::from)
                .unwrap_or_else(|| {
                    if command.is_some() {
                        "stdio".to_string()
                    } else if url.is_some() {
                        "http".to_string()
                    } else {
                        "unknown".to_string()
                    }
                });
            McpServer {
                name: name.clone(),
                transport,
                url,
                command,
                args,
                env,
                headers,
                source,
                // Filled in by the command layer for project-source servers.
                approval: None,
            }
        })
        .collect();
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_and_infers_transport() {
        let map = json!({
            "gh": { "type": "sse", "url": "https://example/sse", "headers": { "Authorization": "Bearer t" } },
            "local": { "command": "npx", "args": ["-y", "srv"], "env": { "API_KEY": "secret" } },
            "explicit": { "transport": "http", "url": "https://x" }
        });
        let servers = parse_servers(&map, McpSource::User);
        assert_eq!(servers.len(), 3);

        let gh = servers.iter().find(|s| s.name == "gh").unwrap();
        assert_eq!(gh.transport, "sse");
        assert_eq!(gh.url.as_deref(), Some("https://example/sse"));
        assert_eq!(gh.source, McpSource::User);
        assert_eq!(gh.headers, vec![McpKeyVal { key: "Authorization".into(), value: "Bearer t".into() }]);

        let local = servers.iter().find(|s| s.name == "local").unwrap();
        assert_eq!(local.transport, "stdio"); // inferred from command
        assert_eq!(local.command.as_deref(), Some("npx"));
        assert_eq!(local.args, vec!["-y".to_string(), "srv".to_string()]);
        assert_eq!(local.env, vec![McpKeyVal { key: "API_KEY".into(), value: "secret".into() }]);

        let explicit = servers.iter().find(|s| s.name == "explicit").unwrap();
        assert_eq!(explicit.transport, "http");
    }

    #[test]
    fn non_object_yields_nothing() {
        assert!(parse_servers(&Value::Null, McpSource::Project).is_empty());
        assert!(parse_servers(&json!([]), McpSource::Local).is_empty());
    }

    #[test]
    fn approval_from_lists() {
        let enabled = vec!["ok".to_string()];
        let disabled = vec!["bad".to_string()];
        assert_eq!(mcpjson_approval("ok", &enabled, &disabled), "approved");
        assert_eq!(mcpjson_approval("bad", &enabled, &disabled), "rejected");
        assert_eq!(mcpjson_approval("unseen", &enabled, &disabled), "pending");
        // Disabled wins over enabled if a name is in both.
        let both = vec!["x".to_string()];
        assert_eq!(mcpjson_approval("x", &both, &both), "rejected");
    }
}
