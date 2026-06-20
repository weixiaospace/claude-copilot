//! Provider profile CRUD. Profiles live in the desktop's own
//! `~/.claude/claude-copilot/profiles.json`; secrets live in the OS keychain.
//! v0.1 does not touch the VSCode extension's `providers.json` (ADR-0001).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use claude_copilot_core::providers::{
    self, secret_field, ActiveProvider, Profile, ProfileInput, ProfilesFile,
};
use claude_copilot_core::scopes::ScopeRef;

use super::{home_dir, settings};
use crate::secrets;

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

#[tauri::command]
pub fn list_profiles() -> Result<Vec<Profile>, String> {
    let file = load(&home_dir()?)?;
    Ok(file
        .profiles
        .into_iter()
        .map(with_live_secret_flag)
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
    let secret = secret_field(profile.kind, profile.auth_mode).and_then(|f| secrets::get_secret(&id, f));
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
    Ok(ActiveProvider::Subscription)
}

/// Derive which profile is active in a scope from its effective env (ADR-0001:
/// not stored). Token-value match disambiguates same-signature profiles;
/// no-secret providers fall back to kind + base-url signature.
#[tauri::command]
pub fn get_active_profile(scope: ScopeRef) -> Result<ActiveProvider, String> {
    let home = home_dir()?;
    let env = effective_env(&scope, &home)?;
    if !providers::env_has_provider(&env) {
        return Ok(ActiveProvider::Subscription);
    }
    let file = load(&home)?;
    if let Some(token) = providers::env_token(&env) {
        for p in &file.profiles {
            if let Some(field) = secret_field(p.kind, p.auth_mode) {
                if secrets::get_secret(&p.id, field).as_deref() == Some(token.as_str()) {
                    return Ok(ActiveProvider::Profile { id: p.id.clone() });
                }
            }
        }
    } else if let Some(kind) = providers::env_kind(&env) {
        let base = env.get("ANTHROPIC_VERTEX_BASE_URL").and_then(Value::as_str);
        for p in &file.profiles {
            if p.kind == kind && p.base_url.as_deref() == base {
                return Ok(ActiveProvider::Profile { id: p.id.clone() });
            }
        }
    }
    Ok(ActiveProvider::Unmanaged)
}
