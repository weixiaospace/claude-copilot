# Claude Copilot Desktop — Context

A Tauri desktop client for visualizing and managing Claude Code's `~/.claude/` configuration, with a scope-first information architecture. Spiritual sibling of the `vscode-claude-copilot` extension; cooperates with it only through file conventions.

## Language

**Project**:
A unit shown in the sidebar that project-scoped resources belong to. Identified canonically by its **git repository root** — matching how Claude Code keys auto memory. A folder not under git is its own Project, identified by its own path (Claude Code's "outside a git repo, the project root is used instead" rule). All worktrees and subdirectories of one repository are the **same** Project.
_Avoid_: workspace, folder, directory (when you mean the canonical project)

**Scope**:
Which config layer owns a thing. Claude Code recognizes `user` (all my projects, personal), `project` (this project, shared with the team via version control), `local` (this project, personal, not committed), `plugin` (shipped inside an installed plugin), and `managed` (org-pushed). The desktop's sidebar surfaces only **User** and **Project** as navigable rows; `local` and `plugin` are shown nested inside those, and `managed` is deferred.
_Avoid_: panel, section, tab

**Local**:
The "just me, just here" config layer — applies to one project, belongs to one person, and is never committed to version control. Sits between User (all projects, personal) and Project (this project, team-shared), and overrides Project on that machine. Claude Code writes here automatically (e.g. in-session permission approvals).
_Avoid_: personal settings, overrides (when you mean this specific layer)

**Provider profile**:
A named API-access configuration (Anthropic / Bedrock / Vertex / Foundry) that the desktop stores, with its secret kept in the OS keychain. The **one** surface in the app that is *not* a view over Claude Code's own config — it is the app's own credential store. Profiles are global and live in the desktop's **own** profiles file, which it fully owns; in v0.1 the desktop does not read or write the VSCode extension's legacy `providers.json` (mutual non-interference). Activating a profile writes the matching `env` into the chosen scope (into the **Local** layer for a Project, so the secret is never committed; into `~/.claude/settings.json` for User). Each scope can have its own active profile, but the app stores no activation state of its own — "which profile is active in a scope" is **derived** on read by matching that scope's `env` token against each profile's keychain secret.
_Avoid_: account, credential, API config

**Unmanaged provider config**:
A scope whose Claude `env`/auth is set to something that matches **none** of the app's profiles — set outside the app, by hand, by the `claude` CLI, or another tool. One of the three per-scope activation states, alongside "a known profile is active" and "no provider env (subscription / default)". The app surfaces it as-is; it does not try to claim or rewrite it.
_Avoid_: unknown, broken, invalid, orphan

**Project slug**:
Claude Code's lossy directory name for a Project under `~/.claude/projects/`, derived from the Project's path by collapsing `/`, `.`, and similar characters to `-`. The mapping is **one-way**: a slug cannot be reversed back to a real path (you can't tell which `-` was a `/`). To recover a Project's real path from a slug, read the `cwd` field of a session record inside that slug's directory.
_Avoid_: project id, project key, encoded path
