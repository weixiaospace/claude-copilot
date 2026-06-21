//! Thin OS-keychain wrapper. The service + account convention matches the
//! VSCode extension's `secretKey()` (`claude-copilot.provider.<id>.<field>`) so
//! the eventual shared keychain lines up (ADR-0001).
//!
//! Reads are cached in-memory for the app session. This avoids repeated macOS
//! keychain password prompts when the UI re-checks provider profiles on every
//! scope/provider change.

use std::collections::HashMap;
use std::sync::Mutex;

use keyring::Entry;

const SERVICE: &str = "claude-copilot";

fn account(profile_id: &str, field: &str) -> String {
    format!("claude-copilot.provider.{profile_id}.{field}")
}

type Cache = HashMap<(String, String), Option<String>>;

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

fn with_cache<T>(f: impl FnOnce(&mut Cache) -> T) -> T {
    let mut guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    f(guard.get_or_insert_with(HashMap::new))
}

fn cache_key(profile_id: &str, field: &str) -> (String, String) {
    (profile_id.to_string(), field.to_string())
}

pub fn set_secret(profile_id: &str, field: &str, secret: &str) -> Result<(), String> {
    Entry::new(SERVICE, &account(profile_id, field))
        .and_then(|e| e.set_password(secret))
        .map_err(|e| format!("keychain write failed: {e}"))?;
    with_cache(|cache| {
        cache.insert(cache_key(profile_id, field), Some(secret.to_string()));
    });
    Ok(())
}

pub fn has_secret(profile_id: &str, field: &str) -> bool {
    get_secret(profile_id, field).is_some()
}

pub fn get_secret(profile_id: &str, field: &str) -> Option<String> {
    let key = cache_key(profile_id, field);
    with_cache(|cache| {
        if let Some(cached) = cache.get(&key) {
            return cached.clone();
        }
        let value = Entry::new(SERVICE, &account(profile_id, field))
            .and_then(|e| e.get_password())
            .ok();
        cache.insert(key, value.clone());
        value
    })
}

/// Strict variant of [`get_secret`] for operations that must know whether a
/// secret exists. Use this when a missing or inaccessible secret should abort a
/// side-effect such as activating a provider profile.
///
/// - `Ok(Some)` – the entry exists and was read successfully.
/// - `Ok(None)` – the entry genuinely does not exist.
/// - `Err` – the keychain is inaccessible or the user denied access. This must
///   **not** be treated as "no secret"; the caller must fail the operation.
pub fn get_secret_strict(profile_id: &str, field: &str) -> Result<Option<String>, String> {
    let key = cache_key(profile_id, field);
    with_cache(|cache| {
        if let Some(cached) = cache.get(&key) {
            return Ok(cached.clone());
        }
        let result = Entry::new(SERVICE, &account(profile_id, field))
            .and_then(|e| e.get_password());
        match result {
            Ok(value) => {
                cache.insert(key, Some(value.clone()));
                Ok(Some(value))
            }
            Err(keyring::Error::NoEntry) => {
                cache.insert(key, None);
                Ok(None)
            }
            Err(e) => Err(format!("keychain read failed: {e}")),
        }
    })
}

pub fn delete_secret(profile_id: &str, field: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &account(profile_id, field))
        .map_err(|e| format!("keychain access failed: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {
            with_cache(|cache| {
                cache.insert(cache_key(profile_id, field), None);
            });
            Ok(())
        }
        Err(e) => Err(format!("keychain delete failed: {e}")),
    }
}

/// Clear the in-memory keychain read cache. Useful in tests or after external
/// keychain changes that the app cannot detect.
#[allow(dead_code)]
pub fn clear_cache() {
    with_cache(|cache| cache.clear());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strict_roundtrip_and_missing_and_delete() {
        let profile = format!("strict-test-{}", std::process::id());
        clear_cache();

        // Missing entry is Ok(None), not an error.
        assert_eq!(get_secret_strict(&profile, "apiKey").unwrap(), None);

        // After set, strict read returns the value.
        set_secret(&profile, "apiKey", "sekrit").unwrap();
        assert_eq!(
            get_secret_strict(&profile, "apiKey").unwrap(),
            Some("sekrit".to_string())
        );

        // Cache hit path returns the same value.
        assert_eq!(
            get_secret_strict(&profile, "apiKey").unwrap(),
            Some("sekrit".to_string())
        );

        // After delete, strict read returns Ok(None) again.
        delete_secret(&profile, "apiKey").unwrap();
        assert_eq!(get_secret_strict(&profile, "apiKey").unwrap(), None);
    }
}
