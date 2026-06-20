//! Thin OS-keychain wrapper. The service + account convention matches the
//! VSCode extension's `secretKey()` (`claude-copilot.provider.<id>.<field>`) so
//! the eventual shared keychain lines up (ADR-0001).

use keyring::Entry;

const SERVICE: &str = "claude-copilot";

fn account(profile_id: &str, field: &str) -> String {
    format!("claude-copilot.provider.{profile_id}.{field}")
}

pub fn set_secret(profile_id: &str, field: &str, secret: &str) -> Result<(), String> {
    Entry::new(SERVICE, &account(profile_id, field))
        .and_then(|e| e.set_password(secret))
        .map_err(|e| format!("keychain write failed: {e}"))
}

pub fn has_secret(profile_id: &str, field: &str) -> bool {
    get_secret(profile_id, field).is_some()
}

pub fn get_secret(profile_id: &str, field: &str) -> Option<String> {
    Entry::new(SERVICE, &account(profile_id, field))
        .and_then(|e| e.get_password())
        .ok()
}

pub fn delete_secret(profile_id: &str, field: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &account(profile_id, field))
        .map_err(|e| format!("keychain access failed: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete failed: {e}")),
    }
}
