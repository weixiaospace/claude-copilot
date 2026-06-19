use std::path::{Path, PathBuf};

use claude_copilot_core::projects::{self, ManualProject};
use claude_copilot_core::scopes::Scope;

use crate::state;

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "could not resolve the home directory".to_string())
}

/// Build the full sidebar: the User scope followed by the deduped, labelled
/// project scopes (Claude-known ∪ manually-added).
fn assemble(home: &Path) -> Result<Vec<Scope>, String> {
    let st = state::load(home)?;
    let mut claude_paths = state::claude_known_paths(home);
    claude_paths.extend(state::scan_session_cwds(home));

    let mut scopes = vec![Scope::user()];
    scopes.extend(projects::list_project_scopes(&claude_paths, &st.manual_projects));
    Ok(scopes)
}

#[tauri::command]
pub fn list_scopes() -> Result<Vec<Scope>, String> {
    assemble(&home_dir()?)
}

/// Add a manually-picked folder, then return the refreshed scope list. The
/// folder is stored verbatim; its canonical root (and any dedup against an
/// already-tracked project) is resolved at assembly time.
#[tauri::command]
pub fn add_project(path: String) -> Result<Vec<Scope>, String> {
    let home = home_dir()?;
    let mut st = state::load(&home)?;
    if !st.manual_projects.iter().any(|m| m.path == path) {
        st.manual_projects.push(ManualProject { path, label: None });
        state::save(&home, &st)?;
    }
    assemble(&home)
}

/// Remove every manually-added entry whose canonical root matches `id` (the
/// scope's id), then return the refreshed list. Claude-known projects are not
/// stored here, so they are unaffected.
#[tauri::command]
pub fn remove_manual_project(id: String) -> Result<Vec<Scope>, String> {
    let home = home_dir()?;
    let mut st = state::load(&home)?;
    let before = st.manual_projects.len();
    st.manual_projects
        .retain(|m| projects::canonical_root(&m.path) != id);
    if st.manual_projects.len() != before {
        state::save(&home, &st)?;
    }
    assemble(&home)
}

#[cfg(test)]
mod smoke {
    use super::*;

    /// Diagnostic: dump the scopes assembled from the real home directory.
    /// Ignored by default (non-hermetic); run with
    /// `cargo test -p claude-copilot-desktop --ignored -- --nocapture`.
    #[test]
    #[ignore = "reads the real ~/.claude; run manually"]
    fn dumps_real_scopes() {
        let scopes = assemble(&home_dir().unwrap()).unwrap();
        eprintln!("assembled {} scopes:", scopes.len());
        for s in &scopes {
            eprintln!(
                "  [{:?}] {:<28} stale={} source={:?} path={:?}",
                s.kind, s.label, s.stale, s.source, s.path
            );
        }
        assert!(!scopes.is_empty());
    }
}
