//! Provider profiles — the app's own credential feature (ADR-0001). Profiles
//! live in the desktop's own `profiles.json`; secrets live in the OS keychain.
//! This module is the pure type + field-mapping layer; IO is in the app crate.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    Anthropic,
    Bedrock,
    Vertex,
    Foundry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "camelCase")]
pub enum AuthMode {
    ApiKey,
    AuthToken,
    Subscription,
    Helper,
}

/// A stored profile. The secret itself never lives here — only a flag saying
/// whether one is present in the keychain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_mode: Option<AuthMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// Whether a secret for this profile exists in the keychain.
    #[serde(default)]
    pub has_secret: bool,
}

/// The fields a caller supplies to create/update a profile (no id, no
/// has_secret — those are managed by the app).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub name: String,
    pub kind: ProviderKind,
    #[serde(default)]
    pub auth_mode: Option<AuthMode>,
    #[serde(default)]
    pub base_url: Option<String>,
}

/// The desktop's own profile store at `~/.claude/claude-copilot/profiles.json`.
/// Schema is ours to evolve (ADR-0001); a future VSCode release adopts it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfilesFile {
    pub version: u32,
    #[serde(default)]
    pub profiles: Vec<Profile>,
}

impl Default for ProfilesFile {
    fn default() -> Self {
        Self {
            version: 1,
            profiles: Vec::new(),
        }
    }
}

/// The keychain field that holds a profile's secret, or `None` for kinds that
/// use ambient auth (Vertex) or modes that store no secret (subscription /
/// helper). Field names match the VSCode extension's `secretKey()` convention so
/// the eventual shared keychain lines up.
pub fn secret_field(kind: ProviderKind, auth_mode: Option<AuthMode>) -> Option<&'static str> {
    match kind {
        ProviderKind::Anthropic => match auth_mode {
            Some(AuthMode::ApiKey) => Some("apiKey"),
            Some(AuthMode::AuthToken) => Some("authToken"),
            _ => None,
        },
        ProviderKind::Bedrock => Some("bedrockToken"),
        ProviderKind::Foundry => Some("foundryApiKey"),
        ProviderKind::Vertex => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthropic_secret_field_depends_on_auth_mode() {
        assert_eq!(
            secret_field(ProviderKind::Anthropic, Some(AuthMode::ApiKey)),
            Some("apiKey")
        );
        assert_eq!(
            secret_field(ProviderKind::Anthropic, Some(AuthMode::AuthToken)),
            Some("authToken")
        );
        assert_eq!(
            secret_field(ProviderKind::Anthropic, Some(AuthMode::Subscription)),
            None
        );
        assert_eq!(secret_field(ProviderKind::Anthropic, None), None);
    }

    #[test]
    fn other_kinds_have_fixed_or_no_secret_fields() {
        assert_eq!(secret_field(ProviderKind::Bedrock, None), Some("bedrockToken"));
        assert_eq!(
            secret_field(ProviderKind::Foundry, None),
            Some("foundryApiKey")
        );
        assert_eq!(secret_field(ProviderKind::Vertex, None), None);
    }
}
