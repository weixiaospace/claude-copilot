# 0001 — Provider profiles live in the desktop's own file, independent of the VSCode extension

## Status
accepted (2026-06-19)

## Context
Provider profiles (named API-access configs whose secrets the app stores) are the one desktop surface that is *not* a view over Claude Code's own config — they are our own credential feature. The original design (spec §10/§14) shared a single `~/.claude/claude-copilot/providers.json` read and written by both this app and the `vscode-claude-copilot` extension, with a frozen schema and mtime-based write-conflict checks. That coupling forced awkward constraints: a schema we couldn't extend, cross-app "visible-but-credential-missing" profiles (the extension keeps its secrets in VSCode SecretStorage, which we cannot read), and inferring the active profile from the env signature.

## Decision
The desktop owns its own `~/.claude/claude-copilot/profiles.json` — a pure profile store (`version` + `profiles`) — plus its own OS-keychain entries. In v0.1 it does **not** read, write, or import the extension's legacy `providers.json`: mutual non-interference. Intended end state: a future VSCode release deprecates its `providers.json` and adopts this file, converging on the desktop's format as the single source of truth.

Activation writes the profile's plaintext token into the target scope's settings — `~/.claude/settings.json` for **User**, and `<repo>/.claude/settings.local.json` (the gitignored **Local** layer) for a **Project**, so a personal token is never committed. That is how Claude Code actually consumes credentials, so the keychain's role is "profile vault + future cross-app sharing," not "keep the active secret off disk."

The app stores **no** activation state of its own. "Which profile is active in a scope" is **derived** on read by matching that scope's `env` token against each profile's keychain secret; no-secret providers (e.g. Vertex) fall back to env-signature matching. A token that matches no profile is an *Unmanaged provider config*; no provider env is *None / subscription*.

## Considered options
- **Shared `providers.json` (original spec §10/§14).** Rejected: frozen-schema constraint, cross-app credential-missing profiles, and write-conflict races — all to share a file the extension will eventually abandon anyway.
- **Store the per-scope active profile (in `state.json` or `profiles.json`) and reconcile against settings.** Rejected: a second copy of the truth that can drift. `settings.json` is what CC actually uses, so derive from it directly — there is nothing to reconcile.
- **Identify the active profile by env signature (the extension's `matchProfileIdByEnv`).** Rejected: the signature is kind + authMode + baseUrl, which cannot tell apart same-signature profiles (the user has three KIMI configs identical but for the token). Matching the token *value* can.

## Consequences
- `profiles.json` schema is ours to evolve; `state.json` stays pure UI state.
- Deriving the active profile reads the keychain for each profile on load (cache in-session).
- v0.1 users with profiles configured in VSCode must re-create them in the desktop; there is no import. Document in CLAUDE.md and first-run.
- Spec §10, §11, and §14 are superseded by this ADR and need rewriting to match.
