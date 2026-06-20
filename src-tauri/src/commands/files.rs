//! Filesystem IPC with the three-layer permission model (see `CLAUDE.md`):
//! a static allowlist (`~/.claude` + project roots), persisted grants, and a
//! native OS prompt for anything else. The frontend never gets raw fs.

use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

use claude_copilot_core::projects;

use super::home_dir;
use crate::state;

/// Canonicalize a path: an existing file directly, or (for a not-yet-created
/// file) its parent plus the file name. Resolves `..` and symlinks so the
/// containment check cannot be tricked.
fn canonical(path: &Path) -> Option<PathBuf> {
    if let Ok(c) = path.canonicalize() {
        return Some(c);
    }
    let parent = path.parent()?;
    let name = path.file_name()?;
    Some(parent.canonicalize().ok()?.join(name))
}

/// Layer 1 + persisted grants: `~/.claude`, every known/added project root, and
/// any granted path. (Layer 2 derived-trust paths arrive in later slices.)
fn allowed_roots(home: &Path) -> Vec<PathBuf> {
    let mut roots = vec![home.join(".claude")];
    let st = state::load(home).unwrap_or_default();

    let mut raw = state::claude_known_paths(home);
    raw.extend(state::scan_session_cwds(home));
    raw.extend(st.manual_projects.iter().map(|m| m.path.clone()));
    roots.extend(raw.iter().map(|p| PathBuf::from(projects::canonical_root(p))));
    roots.extend(st.granted_paths.iter().map(PathBuf::from));

    roots
        .into_iter()
        .map(|r| r.canonicalize().unwrap_or(r))
        .collect()
}

fn is_allowed(home: &Path, path: &str) -> bool {
    match canonical(Path::new(path)) {
        Some(target) => allowed_roots(home).iter().any(|root| target.starts_with(root)),
        None => false,
    }
}

/// Reject (no prompt) a path outside the allowlist. For destructive or
/// non-essential operations where a prompt would be inappropriate.
pub(crate) fn reject_if_outside(home: &Path, path: &str) -> Result<(), String> {
    if is_allowed(home, path) {
        Ok(())
    } else {
        Err(format!("{path} is outside the allowed locations"))
    }
}

/// Layer 3: a path outside the allowlist gets a **native** OS prompt; on
/// approval the grant is persisted so it is not asked again.
fn ensure_allowed(app: &AppHandle, home: &Path, path: &str) -> Result<(), String> {
    if is_allowed(home, path) {
        return Ok(());
    }
    let approved = app
        .dialog()
        .message(format!(
            "Claude Copilot wants to access a file outside its managed folders:\n\n{path}"
        ))
        .title("Allow filesystem access?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Allow".to_string(),
            "Deny".to_string(),
        ))
        .blocking_show();
    if !approved {
        return Err(format!("access to {path} was denied"));
    }

    let mut st = state::load(home)?;
    let canon = canonical(Path::new(path))
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());
    if !st.granted_paths.contains(&canon) {
        st.granted_paths.push(canon);
        state::save(home, &st)?;
    }
    Ok(())
}

#[tauri::command]
pub fn read_file(app: AppHandle, path: String) -> Result<String, String> {
    let home = home_dir()?;
    ensure_allowed(&app, &home, &path)?;
    std::fs::read_to_string(&path).map_err(|e| format!("failed to read {path}: {e}"))
}

#[tauri::command]
pub fn write_file(app: AppHandle, path: String, content: String) -> Result<(), String> {
    let home = home_dir()?;
    ensure_allowed(&app, &home, &path)?;
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("failed to create dir: {e}"))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("failed to write {path}: {e}"))?;
    crate::watchers::note_write();
    Ok(())
}

#[tauri::command]
pub fn open_in_editor(app: AppHandle, path: String) -> Result<(), String> {
    reject_if_outside(&home_dir()?, &path)?;
    app.opener()
        .open_path(path.clone(), None::<&str>)
        .map_err(|e| format!("failed to open {path}: {e}"))
}
