//! Subscription auth status shared between core and the desktop command layer.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Result of checking whether the user has a Claude subscription OAuth session
/// in `~/.claude/.credentials.json`. `logged_in` is true when the file contains
/// a stored access or refresh token; `expires_at` is kept for display only,
/// because Claude Code refreshes access tokens automatically.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct AuthStatus {
    pub logged_in: bool,
    pub subscription_type: Option<String>,
    pub rate_limit_tier: Option<String>,
    /// Unix timestamp in milliseconds when the access token expires, if known.
    #[ts(type = "number | null")]
    pub expires_at: Option<i64>,
}
