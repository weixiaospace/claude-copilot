//! Claude subscription auth status, login helpers, and OAuth quota query.
//!
//! Reads the Claude Code CLI session file at `~/.claude/.credentials.json` and
//! reports whether the user has a stored OAuth session. Presence of an
//! `accessToken` (or `refreshToken`) is treated as logged-in: Claude Code
//! refreshes access tokens automatically, so an expired `expiresAt` does not
//! mean the session is dead.
//!
//! The login command opens a system terminal running `claude auth login
//! --claudeai`, which is the same flow used by Claude Code itself and writes
//! the new tokens back to the credentials file.
//!
//! Quota is fetched from Anthropic's OAuth usage endpoint
//! (`api.anthropic.com/api/oauth/usage`) using the stored access token, matching
//! the behaviour of `cc-switch`.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use claude_copilot_core::auth::AuthStatus;
use claude_copilot_core::subscription::{
    ClaudeSubscriptionQuota, CredentialStatus, ExtraUsage, RateLimitTier,
};

use super::{home_dir, sessions};

const ANTHROPIC_OAUTH_USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const ANTHROPIC_OAUTH_BETA: &str = "oauth-2025-04-20";
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

fn read_credentials(path: &Path) -> Result<CredentialsFile, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("failed to read credentials: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("failed to parse credentials: {e}"))
}

fn status_from_file(path: &Path) -> Result<AuthStatus, String> {
    let creds = read_credentials(path)?;
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

    let logged_in = non_empty(&oauth.access_token) || non_empty(&oauth.refresh_token);

    Ok(AuthStatus {
        logged_in,
        subscription_type: oauth.subscription_type,
        rate_limit_tier: oauth.rate_limit_tier,
        expires_at: oauth.expires_at,
    })
}

/// Check whether the user has a stored Claude subscription OAuth session.
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

/// Resolve the `claude` executable on PATH, falling back to a few common
/// absolute locations on macOS.
fn resolve_claude_path() -> Option<PathBuf> {
    let name = if cfg!(windows) { "claude.exe" } else { "claude" };

    if let Ok(path) = env::var("PATH") {
        for dir in env::split_paths(&path) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        for dir in ["/opt/homebrew/bin", "/usr/local/bin", "~/.cargo/bin"] {
            let candidate = PathBuf::from(dir).join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
}

/// Open a system terminal running `claude auth login --claudeai` so the user
/// can sign in through the official Claude Code OAuth flow.
#[tauri::command]
pub fn claude_auth_login() -> Result<(), String> {
    let claude = resolve_claude_path()
        .ok_or_else(|| "Claude CLI (claude) not found on PATH. Please install Claude Code.".to_string())?;

    let home = home_dir()?;
    let command = format!(
        "{} auth login --claudeai",
        claude.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"")
    );

    sessions::open_terminal_at(
        &home.to_string_lossy(),
        &command,
    )
}

/// Read the stored OAuth access token, if any.
fn read_access_token() -> Result<Option<String>, String> {
    let home = home_dir()?;
    let path = home.join(".claude").join(CREDENTIALS_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let creds = read_credentials(&path)?;
    Ok(creds.claude_ai_oauth.and_then(|o| o.access_token).filter(|t| !t.is_empty()))
}

#[derive(Debug, Deserialize)]
struct ApiUsageWindow {
    utilization: Option<f64>,
    resets_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiExtraUsage {
    is_enabled: Option<bool>,
    monthly_limit: Option<f64>,
    used_credits: Option<f64>,
    utilization: Option<f64>,
    currency: Option<String>,
}

fn parse_iso_to_seconds(ts: &str) -> Option<i64> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts) {
        return Some(dt.timestamp());
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(dt.and_utc().timestamp());
    }
    None
}

fn not_found_quota() -> ClaudeSubscriptionQuota {
    ClaudeSubscriptionQuota {
        logged_in: false,
        credential_status: CredentialStatus::NotFound,
        tiers: vec![],
        extra_usage: None,
        error: None,
    }
}

fn error_quota(status: CredentialStatus, message: String) -> ClaudeSubscriptionQuota {
    ClaudeSubscriptionQuota {
        logged_in: status != CredentialStatus::NotFound,
        credential_status: status,
        tiers: vec![],
        extra_usage: None,
        error: Some(message),
    }
}

/// Query the Anthropic OAuth subscription quota endpoint using the stored
/// access token. Returns per-window utilization and reset times.
#[tauri::command]
pub async fn get_claude_subscription_quota() -> Result<ClaudeSubscriptionQuota, String> {
    let token = match read_access_token() {
        Ok(Some(t)) => t,
        Ok(None) => return Ok(not_found_quota()),
        Err(e) => return Ok(error_quota(CredentialStatus::ParseError, e)),
    };

    let client = reqwest::Client::new();
    let resp = client
        .get(ANTHROPIC_OAUTH_USAGE_URL)
        .header("Authorization", format!("Bearer {token}"))
        .header("anthropic-beta", ANTHROPIC_OAUTH_BETA)
        .header("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Ok(error_quota(
            CredentialStatus::Expired,
            format!("Authentication failed (HTTP {status}). Please log in again."),
        ));
    }
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Ok(error_quota(
            CredentialStatus::Valid,
            format!("API error (HTTP {status}): {body}"),
        ));
    }

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let mut tiers = Vec::new();
    if let Some(obj) = body.as_object() {
        for (key, value) in obj {
            if key == "extra_usage" {
                continue;
            }
            if let Ok(window) = serde_json::from_value::<ApiUsageWindow>(value.clone()) {
                if let Some(util) = window.utilization {
                    tiers.push(RateLimitTier {
                        window: key.clone(),
                        utilization: util.clamp(0.0, 1.0),
                        resets_at: window.resets_at.as_deref().and_then(parse_iso_to_seconds),
                    });
                }
            }
        }
    }

    // Prefer a stable display order for known windows, keeping any unknown ones at the end.
    let order = |w: &str| match w {
        "five_hour" => 0,
        "seven_day" => 1,
        "seven_day_opus" => 2,
        "seven_day_sonnet" => 3,
        "overage" => 4,
        _ => 5,
    };
    tiers.sort_by(|a, b| order(&a.window).cmp(&order(&b.window)));

    let extra_usage = body.get("extra_usage").and_then(|v| {
        serde_json::from_value::<ApiExtraUsage>(v.clone())
            .ok()
            .map(|e| ExtraUsage {
                is_enabled: e.is_enabled.unwrap_or(false),
                monthly_limit: e.monthly_limit,
                used_credits: e.used_credits,
                utilization: e.utilization,
                currency: e.currency,
            })
    });

    Ok(ClaudeSubscriptionQuota {
        logged_in: true,
        credential_status: CredentialStatus::Valid,
        tiers,
        extra_usage,
        error: None,
    })
}
