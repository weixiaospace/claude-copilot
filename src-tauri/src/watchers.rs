//! `notify`-based filesystem watcher. Emits `resource-changed` /
//! `providers-changed` to the frontend for live reload, with a throttle and
//! self-write suppression so the app's own writes don't cause reload churn.

use std::path::Path;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::mpsc;
use std::time::{SystemTime, UNIX_EPOCH};

use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

static SUPPRESS_UNTIL_MS: AtomicI64 = AtomicI64::new(0);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Briefly suppress watcher-driven reloads after an app write, so our own edit
/// does not bounce back as an external change (and clobber an open edit).
pub fn note_write() {
    SUPPRESS_UNTIL_MS.store(now_ms() + 1500, Ordering::Relaxed);
}

fn suppressed() -> bool {
    now_ms() < SUPPRESS_UNTIL_MS.load(Ordering::Relaxed)
}

/// Watch `~/.claude` and emit reload events. Spawns a background thread; errors
/// (e.g. the dir not existing yet) just disable watching silently.
pub fn start(app: AppHandle, home: &Path) {
    let claude_dir = home.join(".claude");
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(_) => return,
        };
        if watcher.watch(&claude_dir, RecursiveMode::Recursive).is_err() {
            return;
        }

        let mut last_emit = 0i64;
        for res in rx {
            let Ok(event) = res else { continue };
            if suppressed() {
                continue;
            }
            // Ignore session-transcript churn (huge + constant during CC use).
            let relevant: Vec<_> = event
                .paths
                .iter()
                .filter(|p| p.extension().and_then(|e| e.to_str()) != Some("jsonl"))
                .collect();
            if relevant.is_empty() {
                continue;
            }

            // profiles.json changes (e.g. a future VSCode) → providers reload.
            if relevant
                .iter()
                .any(|p| p.file_name().and_then(|n| n.to_str()) == Some("profiles.json"))
            {
                let _ = app.emit("providers-changed", ());
            }

            // Throttle the broad resource-changed signal.
            let now = now_ms();
            if now - last_emit >= 300 {
                last_emit = now;
                let _ = app.emit("resource-changed", ());
            }
        }
    });
}
