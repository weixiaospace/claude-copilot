//! MCP listing (direct JSON reads) and add/remove (delegated to the `claude mcp`
//! CLI). See the corrected MCP model in spec §0.

use std::fs;
use std::path::Path;
use std::process::Command;

use serde_json::Value;

use claude_copilot_core::mcp::{self, McpHealth, McpServer, McpSource};
use claude_copilot_core::scopes::ScopeRef;

use crate::claude_cli;
use super::home_dir;

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

/// Collect a JSON string-array field (e.g. `enabledMcpjsonServers`) into a Vec.
fn str_array(obj: Option<&Value>, key: &str) -> Vec<String> {
    obj.and_then(|o| o.get(key))
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default()
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
            let proj = claude_json
                .as_ref()
                .and_then(|d| d.get("projects"))
                .and_then(|p| p.get(&id));
            // Project `.mcp.json` servers are gated by the trust dialog; tag each
            // with its approval state from the project's enabled/disabled lists.
            let enabled = str_array(proj, "enabledMcpjsonServers");
            let disabled = str_array(proj, "disabledMcpjsonServers");
            // Project: <root>/.mcp.json (team-shared, committed).
            if let Some(servers) =
                read_json(&Path::new(&id).join(".mcp.json")).and_then(|d| d.get("mcpServers").cloned())
            {
                for mut s in mcp::parse_servers(&servers, McpSource::Project) {
                    s.approval = Some(mcp::mcpjson_approval(&s.name, &enabled, &disabled));
                    out.push(s);
                }
            }
            // Local: ~/.claude.json#projects["<abs>"].mcpServers (personal, always on).
            if let Some(servers) = proj.and_then(|p| p.get("mcpServers")) {
                out.extend(mcp::parse_servers(servers, McpSource::Local));
            }
        }
    }
    Ok(out)
}

/// Run `claude mcp …`, in the project root for project/local scope.
fn run_claude(scope: &ScopeRef, args: &[String]) -> Result<(), String> {
    let binary = claude_cli::resolve_claude_path()
        .ok_or_else(|| "Claude CLI (claude) not found on PATH. Install Claude Code to manage MCP servers.".to_string())?;
    let mut cmd = Command::new(&binary);
    cmd.arg("mcp").args(args);
    if let ScopeRef::Project { id } = scope {
        cmd.current_dir(id);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("failed to run claude ({}): {e}", binary.display()))?;
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
    layer: String,
    transport: String,
    name: String,
    target: String,
    args: Vec<String>,
    env: Vec<String>,
    headers: Vec<String>,
) -> Result<(), String> {
    // Clamp the write layer to what the scope allows: user scope can only write
    // `user`; a project scope writes `local` (personal, uncommitted — the safe
    // default for secrets) or `project` (shared, committed to `.mcp.json`).
    let layer = match scope {
        ScopeRef::User => "user",
        ScopeRef::Project { .. } => {
            if layer == "project" {
                "project"
            } else {
                "local"
            }
        }
    };
    // Arg order matters: `-e`/`-H` are *variadic* options, so `<name>` must come
    // BEFORE them or the variadic swallows it. This mirrors the CLI's own
    // examples (`mcp add <name> -e K=V -- <cmd> <args>` and
    // `mcp add --transport http <name> <url> -H "<header>"`).
    let mut a: Vec<String> = vec!["add".to_string()];
    if transport == "sse" || transport == "http" {
        a.push("--transport".to_string());
        a.push(transport.clone());
    }
    a.push("--scope".to_string());
    a.push(layer.to_string());
    a.push(name);
    if transport == "stdio" {
        for e in &env {
            a.push("-e".to_string());
            a.push(e.clone());
        }
        // `--` separates the subprocess command + its args from claude's own
        // flags, so a multi-word command is stored as command + args instead of
        // one mangled string.
        a.push("--".to_string());
        a.push(target);
        a.extend(args.iter().cloned());
    } else {
        a.push(target);
        for h in &headers {
            a.push("-H".to_string());
            a.push(h.clone());
        }
    }
    run_claude(&scope, &a)
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

/// Health-check every configured server via `claude mcp list` (which connects to
/// each one). On-demand only — it's slow, so the UI calls this from a button,
/// never on entry. Runs off the UI thread.
#[tauri::command]
pub async fn check_mcp_health(scope: ScopeRef) -> Result<Vec<McpHealth>, String> {
    tauri::async_runtime::spawn_blocking(move || health_blocking(&scope))
        .await
        .map_err(|e| e.to_string())?
}

fn health_blocking(scope: &ScopeRef) -> Result<Vec<McpHealth>, String> {
    let binary = claude_cli::resolve_claude_path().ok_or_else(|| {
        "Claude CLI (claude) not found on PATH. Install Claude Code to manage MCP servers."
            .to_string()
    })?;
    let mut cmd = Command::new(&binary);
    cmd.arg("mcp").arg("list");
    if let ScopeRef::Project { id } = scope {
        cmd.current_dir(id);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("failed to run claude ({}): {e}", binary.display()))?;
    // `claude mcp list` prints health to stdout even when some servers fail to
    // connect, so parse stdout regardless of the exit status.
    Ok(mcp::parse_mcp_health(&String::from_utf8_lossy(&output.stdout)))
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
