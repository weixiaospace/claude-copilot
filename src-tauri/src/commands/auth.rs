//! Claude subscription auth status and login helpers.
//!
//! Reads the Claude Code CLI session file at `~/.claude/.credentials.json` and
//! reports whether the user has a stored OAuth session. Presence of an
//! `accessToken` (or `refreshToken`) is treated as logged-in: Claude Code
//! refreshes access tokens automatically, so an expired `expiresAt` does not
//! mean the session is dead. The login command simply opens the Claude login
//! page in the system browser; a real OAuth callback/token exchange is out of
//! scope here.

use std::fs;
use std::path::Path;

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use claude_copilot_core::auth::AuthStatus;

use super::home_dir;

const LOGIN_URL: &str = "https://claude.ai/login";
const CREDENTIALS_FILE: &str = ".credentials.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialsFile {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<ClaudeAiOauth>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeAiOauth {
    access_token: Option<String>,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_at: Option<i64>,
    #[serde(default)]
    subscription_type: Option<String>,
    #[serde(default)]
    rate_limit_tier: Option<String>,
}

fn non_empty(token: &Option<String>) -> bool {
    token.as_deref().map(|t| !t.is_empty()).unwrap_or(false)
}

fn status_from_file(path: &Path) -> Result<AuthStatus, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("failed to read credentials: {e}"))?;
    let creds: CredentialsFile =
        serde_json::from_str(&text).map_err(|e| format!("failed to parse credentials: {e}"))?;

    let oauth = match creds.claude_ai_oauth {
        Some(o) => o,
        None => {
            return Ok(AuthStatus {
                logged_in: false,
                subscription_type: None,
                rate_limit_tier: None,
                expires_at: None,
            })
        }
    };

    // A stored access or refresh token means the user has gone through Claude
    // OAuth. Claude Code refreshes access tokens automatically, so we do not
    // treat a past expiresAt as logged-out.
    let logged_in = non_empty(&oauth.access_token) || non_empty(&oauth.refresh_token);

    Ok(AuthStatus {
        logged_in,
        subscription_type: oauth.subscription_type,
        rate_limit_tier: oauth.rate_limit_tier,
        expires_at: oauth.expires_at,
    })
}

/// Check whether the user has a valid Claude subscription OAuth session.
#[tauri::command]
pub fn get_claude_auth_status() -> Result<AuthStatus, String> {
    let home = home_dir()?;
    let path = home.join(".claude").join(CREDENTIALS_FILE);

    if !path.exists() {
        return Ok(AuthStatus {
            logged_in: false,
            subscription_type: None,
            rate_limit_tier: None,
            expires_at: None,
        });
    }

    status_from_file(&path)
}

/// Open the Claude login page in the system default browser.
#[tauri::command]
pub fn open_claude_login(app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(LOGIN_URL, None::<&str>)
        .map_err(|e| format!("failed to open browser: {e}"))
}
