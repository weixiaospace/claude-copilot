//! Claude subscription quota types shared between core and the desktop command layer.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Status of the locally stored Claude OAuth credentials.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "snake_case")]
pub enum CredentialStatus {
    Valid,
    Expired,
    NotFound,
    ParseError,
}

/// One rate-limit window returned by Anthropic's OAuth usage endpoint.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct RateLimitTier {
    /// Window identifier, e.g. `five_hour`, `seven_day`, `seven_day_opus`.
    pub window: String,
    /// Utilization ratio in the range 0.0–1.0.
    pub utilization: f64,
    /// Unix timestamp in seconds when the window resets, if known.
    #[ts(type = "number | null")]
    pub resets_at: Option<i64>,
}

/// Optional "extra usage" / overage information.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct ExtraUsage {
    pub is_enabled: bool,
    pub monthly_limit: Option<f64>,
    pub used_credits: Option<f64>,
    pub utilization: Option<f64>,
    pub currency: Option<String>,
}

/// Result of querying the Anthropic OAuth subscription quota endpoint.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
pub struct ClaudeSubscriptionQuota {
    /// Whether the credentials file contains any OAuth token at all.
    pub logged_in: bool,
    /// Status of the credentials / API request.
    pub credential_status: CredentialStatus,
    /// Per-window utilization, ordered by the caller.
    pub tiers: Vec<RateLimitTier>,
    pub extra_usage: Option<ExtraUsage>,
    pub error: Option<String>,
}
