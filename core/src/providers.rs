//! Provider profiles — the app's own credential feature (ADR-0001). Profiles
//! live in the desktop's own `profiles.json`; secrets live in the OS keychain.
//! This module is the pure type + field-mapping layer; IO is in the app crate.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
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
    #[serde(default)]
    pub auth_mode: Option<AuthMode>,
    #[serde(default)]
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

/// Where a scope's active provider points. Derived from the scope's `env`, not
/// stored (ADR-0001): a known profile, an env set outside the app, or none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../src/types/")]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ActiveProvider {
    Profile { id: String },
    Unmanaged,
    Subscription,
}

/// Every env key the app sets when activating a provider — cleared on switch so
/// a stale provider never lingers. Mirrors the VSCode extension's list.
pub const MANAGED_ENV_KEYS: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
    "AWS_BEARER_TOKEN_BEDROCK",
    "ANTHROPIC_BEDROCK_BASE_URL",
    "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
    "CLAUDE_CODE_USE_VERTEX",
    "ANTHROPIC_VERTEX_PROJECT_ID",
    "ANTHROPIC_VERTEX_BASE_URL",
    "CLAUDE_CODE_SKIP_VERTEX_AUTH",
    "CLAUDE_CODE_USE_FOUNDRY",
    "ANTHROPIC_FOUNDRY_API_KEY",
    "ANTHROPIC_FOUNDRY_RESOURCE",
    "ANTHROPIC_FOUNDRY_BASE_URL",
    "CLAUDE_CODE_SKIP_FOUNDRY_AUTH",
];

/// The `env` pairs to write for a profile (with its keychain `secret`, if any).
pub fn build_env(profile: &Profile, secret: Option<&str>) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = Vec::new();
    let mut set = |k: &str, v: &str| env.push((k.to_string(), v.to_string()));
    match profile.kind {
        ProviderKind::Anthropic => {
            if let Some(b) = &profile.base_url {
                set("ANTHROPIC_BASE_URL", b);
            }
            match (profile.auth_mode, secret) {
                (Some(AuthMode::ApiKey), Some(s)) => set("ANTHROPIC_API_KEY", s),
                (Some(AuthMode::AuthToken), Some(s)) => set("ANTHROPIC_AUTH_TOKEN", s),
                _ => {}
            }
        }
        ProviderKind::Bedrock => {
            set("CLAUDE_CODE_USE_BEDROCK", "1");
            if let Some(b) = &profile.base_url {
                set("ANTHROPIC_BEDROCK_BASE_URL", b);
            }
            if let Some(s) = secret {
                set("AWS_BEARER_TOKEN_BEDROCK", s);
            }
        }
        ProviderKind::Vertex => {
            set("CLAUDE_CODE_USE_VERTEX", "1");
            if let Some(b) = &profile.base_url {
                set("ANTHROPIC_VERTEX_BASE_URL", b);
            }
        }
        ProviderKind::Foundry => {
            set("CLAUDE_CODE_USE_FOUNDRY", "1");
            if let Some(b) = &profile.base_url {
                set("ANTHROPIC_FOUNDRY_BASE_URL", b);
            }
            if let Some(s) = secret {
                set("ANTHROPIC_FOUNDRY_API_KEY", s);
            }
        }
    }
    env
}

/// Does this `env` carry any provider markers (vs. subscription/none)?
pub fn env_has_provider(env: &Map<String, Value>) -> bool {
    MANAGED_ENV_KEYS.iter().any(|k| env.contains_key(*k))
}

/// The plaintext secret token present in `env`, if any (used to match a profile
/// by exact value — disambiguates same-signature profiles).
pub fn env_token(env: &Map<String, Value>) -> Option<String> {
    for k in [
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "AWS_BEARER_TOKEN_BEDROCK",
        "ANTHROPIC_FOUNDRY_API_KEY",
    ] {
        if let Some(v) = env.get(k).and_then(Value::as_str) {
            return Some(v.to_string());
        }
    }
    None
}

/// The provider kind implied by `env` markers (for no-secret signature match).
pub fn env_kind(env: &Map<String, Value>) -> Option<ProviderKind> {
    if env.contains_key("CLAUDE_CODE_USE_BEDROCK") {
        Some(ProviderKind::Bedrock)
    } else if env.contains_key("CLAUDE_CODE_USE_VERTEX") {
        Some(ProviderKind::Vertex)
    } else if env.contains_key("CLAUDE_CODE_USE_FOUNDRY") {
        Some(ProviderKind::Foundry)
    } else if env.contains_key("ANTHROPIC_API_KEY")
        || env.contains_key("ANTHROPIC_AUTH_TOKEN")
        || env.contains_key("ANTHROPIC_BASE_URL")
    {
        Some(ProviderKind::Anthropic)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env_of(pairs: &[(&str, &str)]) -> Map<String, Value> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), Value::String(v.to_string())))
            .collect()
    }

    #[test]
    fn build_env_for_anthropic_auth_token() {
        let p = Profile {
            id: "1".into(),
            name: "x".into(),
            kind: ProviderKind::Anthropic,
            auth_mode: Some(AuthMode::AuthToken),
            base_url: Some("https://api.example/".into()),
            has_secret: true,
        };
        let env = build_env(&p, Some("tok"));
        assert!(env.contains(&("ANTHROPIC_AUTH_TOKEN".into(), "tok".into())));
        assert!(env.contains(&("ANTHROPIC_BASE_URL".into(), "https://api.example/".into())));
        assert!(!env.iter().any(|(k, _)| k == "ANTHROPIC_API_KEY"));
    }

    #[test]
    fn build_env_for_bedrock_sets_marker_and_token() {
        let p = Profile {
            id: "1".into(),
            name: "b".into(),
            kind: ProviderKind::Bedrock,
            auth_mode: None,
            base_url: None,
            has_secret: true,
        };
        let env = build_env(&p, Some("aws"));
        assert!(env.contains(&("CLAUDE_CODE_USE_BEDROCK".into(), "1".into())));
        assert!(env.contains(&("AWS_BEARER_TOKEN_BEDROCK".into(), "aws".into())));
    }

    #[test]
    fn env_detection_helpers() {
        let none = env_of(&[]);
        assert!(!env_has_provider(&none));
        assert_eq!(env_kind(&none), None);

        let anth = env_of(&[("ANTHROPIC_AUTH_TOKEN", "secret-1")]);
        assert!(env_has_provider(&anth));
        assert_eq!(env_token(&anth).as_deref(), Some("secret-1"));
        assert_eq!(env_kind(&anth), Some(ProviderKind::Anthropic));

        let vertex = env_of(&[("CLAUDE_CODE_USE_VERTEX", "1")]);
        assert_eq!(env_kind(&vertex), Some(ProviderKind::Vertex));
        assert_eq!(env_token(&vertex), None); // no secret in env
    }

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
