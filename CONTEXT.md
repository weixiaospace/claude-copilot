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

**Claude subscription**:
The Claude Pro/Max/Team OAuth login that Claude Code itself uses. The desktop does not manage its own subscription; it reads the active session from Claude Code's storage (macOS keychain entry `Claude Code-credentials`, or `~/.claude/.credentials.json` on other platforms) and can query Anthropic's `api/oauth/usage` endpoint for quota windows. Treating this as "no managed provider env" means the scope falls back to Claude's default subscription authentication.
_Avoid_: account, login state

**Provider profile**:
A named API-access configuration (Anthropic / Bedrock / Vertex / Foundry) that the desktop stores, with its secret kept in the OS keychain. The **one** surface in the app that is *not* a view over Claude Code's own config — it is the app's own credential store. Profiles are global and live in the desktop's **own** profiles file, which it fully owns; in v0.1 the desktop does not read or write the VSCode extension's legacy `providers.json` (mutual non-interference). Activating a profile writes the matching `env` into the chosen scope (into the **Local** layer for a Project, so the secret is never committed; into `~/.claude/settings.json` for User). Each scope can have its own active profile. The app does not treat activation as persistent state, but it keeps a transient `active_providers` cache in `state.json` to avoid keychain prompts on startup. On read, it first checks that cache; if missing or stale, it derives the active profile by matching that scope's `env` token against each profile's keychain secret.
_Avoid_: account, credential, API config

**Unmanaged provider config**:
A scope whose Claude `env`/auth is set to something that matches **none** of the app's profiles — set outside the app, by hand, by the `claude` CLI, or another tool. One of the three per-scope activation states, alongside "a known profile is active" and "no provider env (subscription / default)". The app surfaces it as-is; it does not try to claim or rewrite it.
_Avoid_: unknown, broken, invalid, orphan

**Marketplace**:
A Claude Code plugin registry: a Git repository that ships `.claude-plugin/marketplace.json`, listing one or more plugins. The desktop's Plugins panel can add a marketplace by URL; plugins from that marketplace then appear under the "Available" tab.
_Avoid_: store, catalog, plugin list

**Plugin**:
A Claude Code extension unit distributed through a marketplace and installed via `claude plugin install`. A plugin bundles skills, agents, commands, hooks, MCP servers, or other Claude Code customization surfaces. The desktop delegates plugin install/uninstall/enable/disable to the `claude` CLI.
_Avoid_: extension, add-on, package

**Skill**:
A single Claude Code customization consisting of a directory containing a `SKILL.md` file with frontmatter (`name`, `description`). Skills are invoked via `/skill-name` and live in `~/.claude/skills/` (User scope) or `<repo>/.claude/skills/` (Project scope). The desktop's Skills panel manages them as file resources.
_Avoid_: prompt, command, capability

**Skill source**:
A Git repository that contains one or more skills but has **no** `.claude-plugin/marketplace.json`. The desktop's Skills panel can track a skill source, clone it, and expose its skills for selective installation into the current scope's skills directory. Skill sources are managed separately from marketplaces.
_Avoid_: marketplace (it is not one), skills-only marketplace, skill pack

**Skills-only repository** (raw skills repo):
Synonym for **skill source**. A Git repository of skills without a marketplace manifest.
_Avoid_: marketplace (when it has no manifest), skill pack

**Project slug**:
Claude Code's lossy directory name for a Project under `~/.claude/projects/`, derived from the Project's path by collapsing `/`, `.`, and similar characters to `-`. The mapping is **one-way**: a slug cannot be reversed back to a real path (you can't tell which `-` was a `/`). To recover a Project's real path from a slug, read the `cwd` field of a session record inside that slug's directory.
_Avoid_: project id, project key, encoded path
