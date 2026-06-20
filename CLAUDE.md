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
- To avoid prompting on every startup, `state.json#active_providers` keeps a transient cache of which profile is active per scope. It is updated on activation/deactivation and is only a performance optimization — `settings.json#env` remains the source of truth.
- The "Claude 订阅" card in the Connections page reads `~/.claude/.credentials.json` (inside the static allowlist) to detect OAuth login status. The login button opens a system terminal and runs `claude auth login --claudeai` so the official CLI handles the OAuth flow. When logged in, the card can query Anthropic's `api/oauth/usage` endpoint (using the stored access token) to display subscription quota windows such as `five_hour` and `seven_day`. It does not access the keychain.
