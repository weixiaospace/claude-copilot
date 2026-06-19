//! Provider profile CRUD. Profiles live in the desktop's own
//! `~/.claude/claude-copilot/profiles.json`; secrets live in the OS keychain.
//! v0.1 does not touch the VSCode extension's `providers.json` (ADR-0001).

use std::fs;
use std::path::{Path, PathBuf};

use claude_copilot_core::providers::{secret_field, Profile, ProfileInput, ProfilesFile};

use super::home_dir;
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
    fs::write(&path, text + "\n").map_err(|e| format!("failed to write {}: {e}", path.display()))
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
