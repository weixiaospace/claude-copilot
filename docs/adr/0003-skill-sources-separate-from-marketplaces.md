# 0003 — Skill sources are a Skills-panel feature, separate from plugin marketplaces

## Status
accepted (2026-06-22)

## Context
Claude Code's plugin system is built around **marketplaces**: a Git repository that ships `.claude-plugin/marketplace.json` listing one or more **plugins**, installed via `claude plugin install`. The desktop's Plugins panel is a thin view over that CLI flow.

In the wild, many useful repositories are just a collection of **skills** (`<dir>/SKILL.md`) with **no** marketplace manifest. Users wanted to add such a repository, see what skills it contains, and install individual skills — not the whole repo. The first instinct was to make these "skills-only marketplaces" and surface them in the Plugins panel alongside real marketplaces (with a kind badge to tell them apart). That conflates two different Claude Code concepts: a manifest-less skills repo is not a marketplace, and a skill is not a plugin. Plugin-bundled skills also never appear in the top-level Skills panel (ADR-0001's "no double exposure"), so mixing imported skills into the Plugins panel would have been doubly confusing.

## Decision
The Plugins panel stays **strictly standard marketplaces** (manifest required). A manifest-less skills repository is a distinct concept — a **skill source** — managed in the **Skills panel** under its own "Sources" tab, parallel to the panel's "Installed" tab.

- Skill sources are tracked in the desktop's own `~/.claude/claude-copilot/skill-sources.json` (not in Claude CLI's `known_marketplaces.json`, which the CLI owns).
- Each source is cloned to a **URL-derived nested directory** under `~/.claude/claude-copilot/skill-sources/` (e.g. `github.com/owner/repo`), so two repos can never collide and the same URL is detected as already-present. The displayed name de-duplicates progressively: repo → `owner/repo` → full host path.
- Installing a skill copies that one skill's directory into the **current scope's** skills dir (`~/.claude/skills/` for User, `<repo>/.claude/skills/` for Project), and records provenance in the installed skill's `.claude-copilot/source.json` (source name/url + a content hash of the source skill).
- "Update available" is detected per-skill by comparing the installed copy's content hash against the source copy; updating a source re-clones (`git clone --depth 1`) but never auto-overwrites installed skills. Removing a source deletes only the clone, never installed skills.

## Considered options
- **Skills-only marketplaces in the Plugins panel (kind badge).** Rejected mid-design: it overloads "marketplace"/"plugin" with things that are neither, and `claude plugin install` does not handle manifest-less repos — install would have to be custom anyway, so the marketplace framing bought nothing but confusion.
- **One flat install-everything import.** Rejected: users explicitly wanted per-skill selection, and bulk-copying a repo's skills pollutes the scope.
- **Track sources inside `known_marketplaces.json` with a custom flag.** Rejected: that file is Claude CLI's; the CLI may rewrite/prune unknown fields on `marketplace update`. The desktop owns its own `skill-sources.json` instead (mirrors ADR-0001's "own your own file" stance).

## Consequences
- Two parallel install surfaces — Plugins (marketplace → plugin, via CLI) and Skills/Sources (skill source → skill, via clone+copy) — each matching the underlying Claude Code concept, with no cross-contamination.
- The desktop now shells out to `git` directly for skill sources; absence of `git` surfaces as a clear error. This is a new external dependency beyond the `claude` CLI.
- New `core` types `SkillSource` / `SourceSkill` and commands (`list/add/update/remove_skill_source`, `install_skill_from_source`, `uninstall_skill`) in `src-tauri/src/commands/skills.rs`.
- Skill discovery handles both layouts: `SKILL.md` in a subdirectory (the dir is the skill) and `SKILL.md` at the repo root (the whole repo is one skill, named after the repo).
