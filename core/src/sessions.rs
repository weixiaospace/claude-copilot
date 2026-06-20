//! Claude Code session listing for a project. Sessions are the `*.jsonl`
//! transcripts under `~/.claude/projects/<slug>/`; this module is the pure
//! preview-extraction layer (the scan + file IO live in the app crate).

use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

/// A session shown in the list. `id` is the transcript filename stem (the
/// session id Claude Code resumes by).
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct Session {
    pub id: String,
    /// Last-modified time, epoch milliseconds.
    pub modified_ms: f64,
    /// First user prompt, truncated — `None` if not found.
    pub preview: Option<String>,
}

/// Extract a list preview (first user message, truncated) from a session
/// transcript. Scans a bounded prefix.
pub fn preview_from_jsonl(content: &str) -> Option<String> {
    for line in content.lines().take(400) {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if v.get("type").and_then(Value::as_str) != Some("user") {
            continue;
        }
        let content = v.get("message").and_then(|m| m.get("content"));
        let text = match content {
            Some(Value::String(s)) => Some(s.clone()),
            Some(Value::Array(blocks)) => blocks
                .iter()
                .find_map(|b| b.get("text").and_then(Value::as_str).map(str::to_string)),
            _ => None,
        };
        if let Some(t) = text {
            let trimmed = t.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.chars().take(100).collect());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_picks_first_user_text_string() {
        let jsonl = concat!(
            "{\"type\":\"summary\",\"sessionId\":\"s1\"}\n",
            "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"  hello there  \"}}\n",
            "{\"type\":\"assistant\",\"message\":{\"content\":\"hi\"}}\n"
        );
        assert_eq!(preview_from_jsonl(jsonl).as_deref(), Some("hello there"));
    }

    #[test]
    fn preview_handles_content_blocks_and_missing() {
        let blocks = "{\"type\":\"user\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"block text\"}]}}\n";
        assert_eq!(preview_from_jsonl(blocks).as_deref(), Some("block text"));
        assert_eq!(preview_from_jsonl("{\"type\":\"system\"}\n"), None);
    }
}
