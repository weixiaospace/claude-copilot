//! Provider profile CRUD. Profiles live in the desktop's own
//! `~/.claude/claude-copilot/profiles.json`; secrets live in the OS keychain.
//! v0.1 does not touch the VSCode extension's `providers.json` (ADR-0001).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use claude_copilot_core::providers::{
    self, secret_field, ActiveProvider, Profile, ProfileInput, ProfilesFile, ProviderKind,
};
use claude_copilot_core::scopes::ScopeRef;

use super::{home_dir, settings};
use crate::secrets;
use crate::state;

fn profiles_path(home: &Path) -> PathBuf {
    home.join(".claude")
        .join("claude-copilot")
        .join("profiles.json")
}

fn load(home: &Path) -> Result<ProfilesFile, String> {
    let path = profiles_path(home);
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|e| format!("failed to parse {}: {e}", path.display())),
        Err(_) => Ok(ProfilesFile::default()),
    }
}

fn save(home: &Path, file: &ProfilesFile) -> Result<(), String> {
    let path = profiles_path(home);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
    }
    let text =
        serde_json::to_string_pretty(file).map_err(|e| format!("failed to serialize: {e}"))?;
    fs::write(&path, text + "\n").map_err(|e| format!("failed to write {}: {e}", path.display()))?;
    crate::watchers::note_write();
    Ok(())
}

/// Recompute `has_secret` from the keychain for accurate display.
fn with_live_secret_flag(mut p: Profile) -> Profile {
    p.has_secret = match secret_field(p.kind, p.auth_mode) {
        Some(field) => secrets::has_secret(&p.id, field),
        None => false,
    };
    p
}

#[derive(Debug, serde::Deserialize)]
pub struct ListProfilesInput {
    check_secrets: Option<bool>,
}

#[tauri::command]
pub fn list_profiles(input: ListProfilesInput) -> Result<Vec<Profile>, String> {
    let file = load(&home_dir()?)?;
    let check = input.check_secrets.unwrap_or(true);
    Ok(file
        .profiles
        .into_iter()
        .map(|p| if check { with_live_secret_flag(p) } else { p })
        .collect())
}

#[tauri::command]
pub fn create_profile(input: ProfileInput, secret: Option<String>) -> Result<Profile, String> {
    let home = home_dir()?;
    let mut file = load(&home)?;
    let id = uuid::Uuid::new_v4().to_string();
    let mut profile = Profile {
        id: id.clone(),
        name: input.name,
        kind: input.kind,
        auth_mode: input.auth_mode,
        base_url: input.base_url,
        has_secret: false,
    };
    if let Some(field) = secret_field(profile.kind, profile.auth_mode) {
        if let Some(sec) = secret.as_deref().filter(|s| !s.is_empty()) {
            secrets::set_secret(&id, field, sec)?;
            profile.has_secret = true;
        }
    }
    file.profiles.push(profile.clone());
    save(&home, &file)?;
    Ok(profile)
}

#[tauri::command]
pub fn update_profile(
    id: String,
    input: ProfileInput,
    secret: Option<String>,
) -> Result<Profile, String> {
    let home = home_dir()?;
    let mut file = load(&home)?;
    let idx = file
        .profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| format!("profile {id} not found"))?;

    // Clear the old secret if the kind/auth-mode change moves it to a different
    // (or no) field — credentials auto-clear on provider/mode switch.
    let old = &file.profiles[idx];
    if let Some(old_field) = secret_field(old.kind, old.auth_mode) {
        if secret_field(input.kind, input.auth_mode) != Some(old_field) {
            secrets::delete_secret(&id, old_field)?;
        }
    }

    let mut profile = Profile {
        id: id.clone(),
        name: input.name,
        kind: input.kind,
        auth_mode: input.auth_mode,
        base_url: input.base_url,
        has_secret: false,
    };
    if let Some(field) = secret_field(profile.kind, profile.auth_mode) {
        if let Some(sec) = secret.as_deref().filter(|s| !s.is_empty()) {
            secrets::set_secret(&id, field, sec)?;
        }
        profile.has_secret = secrets::has_secret(&id, field);
    }
    file.profiles[idx] = profile.clone();
    save(&home, &file)?;
    Ok(profile)
}

#[tauri::command]
pub fn delete_profile(id: String) -> Result<(), String> {
    let home = home_dir()?;
    let mut file = load(&home)?;
    if let Some(p) = file.profiles.iter().find(|p| p.id == id) {
        if let Some(field) = secret_field(p.kind, p.auth_mode) {
            secrets::delete_secret(&id, field)?;
        }
    }
    file.profiles.retain(|p| p.id != id);
    save(&home, &file)
}

// ---- Per-scope activation (writes the env block) -------------------------

/// Activation writes into the User scope's `settings.json`, or a Project's
/// `settings.local.json` (the Local layer — a personal token is never committed).
fn activation_layer(scope: &ScopeRef) -> &'static str {
    match scope {
        ScopeRef::User => "user",
        ScopeRef::Project { .. } => "local",
    }
}

fn env_object(doc: &Value) -> Map<String, Value> {
    doc.get("env")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

/// The effective provider env for a scope: User → settings.json; Project →
/// settings.json merged with settings.local.json (local wins).
fn effective_env(scope: &ScopeRef, home: &Path) -> Result<Map<String, Value>, String> {
    match scope {
        ScopeRef::User => {
            let doc = settings::read_doc(&settings::settings_path(scope, "user", home)?)?;
            Ok(env_object(&doc))
        }
        ScopeRef::Project { .. } => {
            let proj = settings::read_doc(&settings::settings_path(scope, "project", home)?)?;
            let local = settings::read_doc(&settings::settings_path(scope, "local", home)?)?;
            let mut env = env_object(&proj);
            for (k, v) in env_object(&local) {
                env.insert(k, v); // local overrides project
            }
            Ok(env)
        }
    }
}

#[tauri::command]
pub fn activate_profile(id: String, scope: ScopeRef) -> Result<ActiveProvider, String> {
    let home = home_dir()?;
    let file = load(&home)?;
    let profile = file
        .profiles
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or_else(|| format!("profile {id} not found"))?;
    let secret = match secret_field(profile.kind, profile.auth_mode) {
        Some(field) => {
            // Activation is a side-effect: if the profile requires a secret, we
            // must read it strictly. A denied keychain prompt or an I/O error
            // must abort the operation, not write an empty env block.
            match secrets::get_secret_strict(&id, field)? {
                Some(value) if !value.is_empty() => Some(value),
                _ => return Err(format!("profile {} has no stored secret", profile.name)),
            }
        }
        None => None,
    };
    let pairs = providers::build_env(&profile, secret.as_deref());

    let path = settings::settings_path(&scope, activation_layer(&scope), &home)?;
    let mut doc = settings::read_doc(&path)?;
    let mut env = env_object(&doc);
    for k in providers::MANAGED_ENV_KEYS {
        env.remove(*k);
    }
    for (k, v) in pairs {
        env.insert(k, Value::String(v));
    }
    let obj = doc
        .as_object_mut()
        .ok_or("settings file is not a JSON object")?;
    obj.insert("env".to_string(), Value::Object(env));
    settings::write_doc(&path, &doc)?;
    state::set_active_provider_id(&home, &scope, &id)?;
    Ok(ActiveProvider::Profile { id })
}

/// Clear the managed provider env from a scope (→ subscription / default auth).
#[tauri::command]
pub fn deactivate_provider(scope: ScopeRef) -> Result<ActiveProvider, String> {
    let home = home_dir()?;
    let path = settings::settings_path(&scope, activation_layer(&scope), &home)?;
    let mut doc = settings::read_doc(&path)?;
    if let Some(env) = doc.get_mut("env").and_then(Value::as_object_mut) {
        for k in providers::MANAGED_ENV_KEYS {
            env.remove(*k);
        }
    }
    settings::write_doc(&path, &doc)?;
    state::clear_active_provider_id(&home, &scope)?;
    Ok(ActiveProvider::Subscription)
}

/// Derive which profile is active in a scope from its effective env (ADR-0001:
/// not stored). First checks a lightweight in-app cache so startup does not
/// repeatedly prompt for OS-keychain access. Falls back to token-value match
/// (which reads the keychain) to disambiguate same-signature profiles, and to
/// kind + base-url signature for no-secret providers.
fn derive_active(
    scope: &ScopeRef,
    file: &ProfilesFile,
    home: &Path,
) -> Result<ActiveProvider, String> {
    let env = effective_env(scope, home)?;
    if !providers::env_has_provider(&env) {
        return Ok(ActiveProvider::Subscription);
    }

    // Fast path: if we have cached this scope's active profile and the profile
    // still exists, skip the keychain read. The cache is updated on every
    // activation/deactivation, so it stays accurate for normal use.
    if let Some(cached_id) = state::get_active_provider_id(home, scope)? {
        if let Some(p) = file.profiles.iter().find(|p| p.id == cached_id) {
            if profile_signature_matches_env(p, &env) {
                return Ok(ActiveProvider::Profile { id: cached_id });
            }
        }
    }

    if let Some(token) = providers::env_token(&env) {
        for p in &file.profiles {
            if let Some(field) = secret_field(p.kind, p.auth_mode) {
                if secrets::get_secret(&p.id, field).as_deref() == Some(token.as_str()) {
                    let _ = state::set_active_provider_id(home, scope, &p.id);
                    return Ok(ActiveProvider::Profile { id: p.id.clone() });
                }
            }
        }
    } else if let Some(kind) = providers::env_kind(&env) {
        let base = env.get("ANTHROPIC_VERTEX_BASE_URL").and_then(Value::as_str);
        for p in &file.profiles {
            if p.kind == kind && p.base_url.as_deref() == base {
                let _ = state::set_active_provider_id(home, scope, &p.id);
                return Ok(ActiveProvider::Profile { id: p.id.clone() });
            }
        }
    }
    Ok(ActiveProvider::Unmanaged)
}

/// Does a profile's kind + base_url line up with the provider markers in `env`?
fn profile_signature_matches_env(p: &Profile, env: &Map<String, Value>) -> bool {
    let Some(env_kind) = providers::env_kind(env) else {
        return false;
    };
    if p.kind != env_kind {
        return false;
    }
    let base_key = match p.kind {
        ProviderKind::Anthropic => "ANTHROPIC_BASE_URL",
        ProviderKind::Bedrock => "ANTHROPIC_BEDROCK_BASE_URL",
        ProviderKind::Vertex => "ANTHROPIC_VERTEX_BASE_URL",
        ProviderKind::Foundry => "ANTHROPIC_FOUNDRY_BASE_URL",
    };
    let env_base = env.get(base_key).and_then(Value::as_str);
    p.base_url.as_deref() == env_base
}

#[tauri::command]
pub fn get_active_profile(scope: ScopeRef) -> Result<ActiveProvider, String> {
    let home = home_dir()?;
    let file = load(&home)?;
    derive_active(&scope, &file, &home)
}

/// Batch [`get_active_profile`] for the whole sidebar: load profiles once and
/// derive each scope's active provider, aligned with the input order.
#[tauri::command]
pub fn list_active_profiles(scopes: Vec<ScopeRef>) -> Result<Vec<ActiveProvider>, String> {
    let home = home_dir()?;
    let file = load(&home)?;
    scopes
        .iter()
        .map(|scope| derive_active(scope, &file, &home))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use claude_copilot_core::providers::{AuthMode, ProviderKind};
    use claude_copilot_core::scopes::ScopeRef;
    use std::io::Write;

    fn temp_home() -> PathBuf {
        let home = std::env::temp_dir().join(format!(
            "cc-providers-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&home).unwrap();
        home
    }

    fn write_profiles(home: &Path, file: &ProfilesFile) {
        let dir = home.join(".claude").join("claude-copilot");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("profiles.json");
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(serde_json::to_string_pretty(file).unwrap().as_bytes())
            .unwrap();
        f.write_all(b"\n").unwrap();
    }

    fn write_user_settings(home: &Path) {
        let dir = home.join(".claude");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, "{}\n").unwrap();
    }

    #[test]
    fn activate_profile_fails_when_secret_missing() {
        let home = temp_home();
        write_user_settings(&home);

        let mut file = ProfilesFile::default();
        let profile = Profile {
            id: "p1".into(),
            name: "needs-key".into(),
            kind: ProviderKind::Anthropic,
            auth_mode: Some(AuthMode::ApiKey),
            base_url: None,
            has_secret: false, // key not actually stored
        };
        file.profiles.push(profile);
        write_profiles(&home, &file);

        let result = activate_profile_with_home("p1".into(), ScopeRef::User, &home);
        assert!(
            result.is_err(),
            "activating a profile that requires a missing secret must fail"
        );
        let err = result.unwrap_err();
        assert!(
            err.contains("no stored secret"),
            "error should tell the user the secret is missing: {err}"
        );

        // The settings file must not have been polluted with an empty API key.
        let settings_path = home.join(".claude").join("settings.json");
        let text = std::fs::read_to_string(&settings_path).unwrap();
        assert!(!text.contains("ANTHROPIC_API_KEY"));
    }

    fn activate_profile_with_home(
        id: String,
        scope: ScopeRef,
        home: &Path,
    ) -> Result<ActiveProvider, String> {
        // Re-bind the helpers to the temp home for the test.
        let file = load(home)?;
        let profile = file
            .profiles
            .into_iter()
            .find(|p| p.id == id)
            .ok_or_else(|| format!("profile {id} not found"))?;
        let secret = match secret_field(profile.kind, profile.auth_mode) {
            Some(field) => match crate::secrets::get_secret_strict(&id, field)? {
                Some(value) if !value.is_empty() => Some(value),
                _ => return Err(format!("profile {} has no stored secret", profile.name)),
            },
            None => None,
        };
        let pairs = providers::build_env(&profile, secret.as_deref());

        let path = settings::settings_path(&scope, activation_layer(&scope), home)?;
        let mut doc = settings::read_doc(&path)?;
        let mut env = env_object(&doc);
        for k in providers::MANAGED_ENV_KEYS {
            env.remove(*k);
        }
        for (k, v) in pairs {
            env.insert(k, Value::String(v));
        }
        let obj = doc
            .as_object_mut()
            .ok_or("settings file is not a JSON object")?;
        obj.insert("env".to_string(), Value::Object(env));
        settings::write_doc(&path, &doc)?;
        state::set_active_provider_id(home, &scope, &id)?;
        Ok(ActiveProvider::Profile { id })
    }
}
