//! MCP listing (direct JSON reads) and add/remove (delegated to the `claude mcp`
//! CLI). See the corrected MCP model in spec §0.

use std::fs;
use std::path::Path;
use std::process::Command;

use serde_json::Value;

use claude_copilot_core::mcp::{self, McpServer, McpSource};
use claude_copilot_core::scopes::ScopeRef;

use super::home_dir;

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

#[tauri::command]
pub fn list_mcp(scope: ScopeRef) -> Result<Vec<McpServer>, String> {
    let home = home_dir()?;
    let claude_json = read_json(&home.join(".claude.json"));
    let mut out = Vec::new();

    match scope {
        ScopeRef::User => {
            if let Some(servers) = claude_json.as_ref().and_then(|d| d.get("mcpServers")) {
                out.extend(mcp::parse_servers(servers, McpSource::User));
            }
        }
        ScopeRef::Project { id } => {
            // Project: <root>/.mcp.json (team-shared, committed).
            if let Some(servers) =
                read_json(&Path::new(&id).join(".mcp.json")).and_then(|d| d.get("mcpServers").cloned())
            {
                out.extend(mcp::parse_servers(&servers, McpSource::Project));
            }
            // Local: ~/.claude.json#projects["<abs>"].mcpServers (personal).
            if let Some(servers) = claude_json
                .as_ref()
                .and_then(|d| d.get("projects"))
                .and_then(|p| p.get(&id))
                .and_then(|p| p.get("mcpServers"))
            {
                out.extend(mcp::parse_servers(servers, McpSource::Local));
            }
        }
    }
    Ok(out)
}

/// Run `claude mcp …`, in the project root for project/local scope.
fn run_claude(scope: &ScopeRef, args: &[String]) -> Result<(), String> {
    let mut cmd = Command::new("claude");
    cmd.arg("mcp").args(args);
    if let ScopeRef::Project { id } = scope {
        cmd.current_dir(id);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("failed to run `claude` (is it on PATH?): {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn source_flag(source: McpSource) -> &'static str {
    match source {
        McpSource::User => "user",
        McpSource::Project => "project",
        McpSource::Local => "local",
    }
}

#[tauri::command]
pub fn add_mcp(
    scope: ScopeRef,
    name: String,
    transport: String,
    target: String,
) -> Result<(), String> {
    let write_scope = match scope {
        ScopeRef::User => "user",
        ScopeRef::Project { .. } => "project",
    };
    let mut args = vec!["add".to_string()];
    if transport == "sse" || transport == "http" {
        args.push("--transport".to_string());
        args.push(transport);
    }
    args.push("--scope".to_string());
    args.push(write_scope.to_string());
    args.push(name);
    args.push(target);
    run_claude(&scope, &args)
}

#[tauri::command]
pub fn remove_mcp(scope: ScopeRef, name: String, source: McpSource) -> Result<(), String> {
    run_claude(
        &scope,
        &[
            "remove".to_string(),
            name,
            "--scope".to_string(),
            source_flag(source).to_string(),
        ],
    )
}

#[cfg(test)]
mod smoke {
    use super::*;

    /// Diagnostic: dump real user-scope MCP servers.
    /// `cargo test -p claude-copilot-desktop -- --ignored dumps_user_mcp --nocapture`
    #[test]
    #[ignore = "reads the real ~/.claude.json; run manually"]
    fn dumps_user_mcp() {
        let servers = list_mcp(ScopeRef::User).unwrap();
        eprintln!("{} user MCP servers:", servers.len());
        for s in &servers {
            eprintln!("  {} [{}] {:?}{:?}", s.name, s.transport, s.url, s.command);
        }
    }
}
