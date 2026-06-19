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
    pub source: McpSource,
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
                source,
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
            "gh": { "type": "sse", "url": "https://example/sse" },
            "local": { "command": "npx", "args": ["-y", "srv"] },
            "explicit": { "transport": "http", "url": "https://x" }
        });
        let servers = parse_servers(&map, McpSource::User);
        assert_eq!(servers.len(), 3);

        let gh = servers.iter().find(|s| s.name == "gh").unwrap();
        assert_eq!(gh.transport, "sse");
        assert_eq!(gh.url.as_deref(), Some("https://example/sse"));
        assert_eq!(gh.source, McpSource::User);

        let local = servers.iter().find(|s| s.name == "local").unwrap();
        assert_eq!(local.transport, "stdio"); // inferred from command
        assert_eq!(local.command.as_deref(), Some("npx"));

        let explicit = servers.iter().find(|s| s.name == "explicit").unwrap();
        assert_eq!(explicit.transport, "http");
    }

    #[test]
    fn non_object_yields_nothing() {
        assert!(parse_servers(&Value::Null, McpSource::Project).is_empty());
        assert!(parse_servers(&json!([]), McpSource::Local).is_empty());
    }
}
