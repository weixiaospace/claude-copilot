# Claude Copilot Desktop — Conventions

See `CONTEXT.md` for the domain glossary and `docs/adr/` for architecture decisions.

## Security

**Filesystem access (`read_file` / `write_file` IPC).** The frontend never gets raw fs; all path access goes through Rust commands that enforce a three-layer permission model:

1. **Static allowlist** — `~/.claude/` and the known/added project directories. Day-to-day operations stay inside this, with no prompt.
2. **Auto-trusted derived paths** — locations the app reads out of *trusted config inside the allowlist*: an `autoMemoryDirectory` override, or the resolved symlink target of an allowlisted resource dir. Trusted automatically, no prompt (avoids prompt fatigue on legitimate external paths).
3. **Anything else** — a **native** Tauri/OS permission dialog. Never a renderer-drawn dialog: a compromised renderer must not be able to self-approve. On approval the grant is persisted to `state.json` so it is not asked again.

**Markdown rendering.** Resource `.md` shown in the detail dialog is rendered with `marked`, but plugin-shipped `.md` is *third-party content*. Always sanitize the rendered output (DOMPurify or a safe `marked` configuration). Never inject raw HTML.
