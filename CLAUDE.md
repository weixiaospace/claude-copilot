# Claude Copilot Desktop — Conventions

See `CONTEXT.md` for the domain glossary and `docs/adr/` for architecture decisions.

## Security

**Filesystem access (`read_file` / `write_file` IPC).** The frontend never gets raw fs; all path access goes through Rust commands that enforce a three-layer permission model:

1. **Static allowlist** — `~/.claude/` and the known/added project directories. Day-to-day operations stay inside this, with no prompt.
2. **Auto-trusted derived paths** — locations the app reads out of *trusted config inside the allowlist*: an `autoMemoryDirectory` override, or the resolved symlink target of an allowlisted resource dir. Trusted automatically, no prompt (avoids prompt fatigue on legitimate external paths).
3. **Anything else** — a **native** Tauri/OS permission dialog. Never a renderer-drawn dialog: a compromised renderer must not be able to self-approve. On approval the grant is persisted to `state.json` so it is not asked again.

**Markdown rendering.** Resource `.md` shown in the detail dialog is rendered with `marked`, but plugin-shipped `.md` is *third-party content*. Always sanitize the rendered output (DOMPurify or a safe `marked` configuration). Never inject raw HTML.

## Provider credentials and keychain

Provider secrets live in the OS keychain (`claude-copilot` service), and profile metadata lives in the app's own `profiles.json`. The frontend never reads the secret; all keychain access happens in Rust.

- `src-tauri/src/secrets.rs` caches keychain reads in-memory for the app session. This prevents repeated OS password prompts when the UI re-checks profiles, but it also means a running process holds the plaintext secret in memory.
- **Keychain access is timed to actual use, never to navigation.** The app's own keychain (`claude-copilot` service) is read only when a provider profile is *activated* — the Connections page lists profiles with `check_secrets:false` (the stored `has_secret` flag drives the "credential missing" badge), so entering the page touches no secrets. The release packages are ad-hoc signed (no Apple Developer ID), so on macOS each new version's changed code signature means the OS *will* prompt the first time it reads a secret it stored under a prior version; that prompt is accepted as a known trade-off and must not be "fixed" by re-probing secrets on page load. Do not re-introduce `check_secrets:true` on entry.
- To avoid prompting on every startup, `state.json#active_providers` keeps a transient cache of which profile is active per scope. It is updated on activation/deactivation and is only a performance optimization — `settings.json#env` remains the source of truth.
- The "Claude 订阅" card in the Connections page shows a login **badge** and, on demand, **quota**, on deliberately different read paths so that *entering the page never touches the keychain or the network*:
  - **Badge (local login status)** — computed on page entry. `get_claude_auth_status` reads the credentials *file* (`~/.claude/.credentials.json`) only. The file can be stale (old `expiresAt`), but token presence is enough to show "logged in / not". No keychain, no API, no prompt.
  - **Quota** — fetched only on an **explicit refresh** (not on page entry). `get_claude_subscription_quota` reads the *live* OAuth token (on macOS, the `Claude Code-credentials` login-keychain item first — where `claude auth login` actually stores it — falling back to the file; on Windows/Linux the file) and calls Anthropic's `api/oauth/usage` endpoint for windows such as `five_hour` and `seven_day`. This is the only path that reads that keychain item, and the badge reconciles to this keychain truth once a refresh returns. Auto-fetching quota on entry previously caused `429` rate-limit errors.
  - The login button opens a system terminal and runs `claude auth login --claudeai`. None of this accesses the app's *own* keychain entries.
