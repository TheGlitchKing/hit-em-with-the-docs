# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] — 2026-04-18

Additive minor release. No breaking changes. Existing behavior is
preserved; the new surface is opt-in and off by default (update policy
defaults to `nudge` — one-line notification when a new version is
available, no automatic changes).

### Added
- Adopts
  [`@theglitchking/claude-plugin-runtime`](https://github.com/TheGlitchKing/claude-plugin-runtime)
  (`^0.1.0`) for standardized update management across all plugins in
  the marketplace.
- **Postinstall step** (`scripts/link-skills.js`) now runs on
  `npm install` — writes a default `.claude/hit-em-with-the-docs.json`
  with `{ "updatePolicy": "nudge" }`, and registers a SessionStart hook
  in `.claude/settings.json` if one exists (skipped when the plugin
  marketplace version is already enabled in `~/.claude/settings.json`,
  or when `HIT_EM_WITH_THE_DOCS_SKIP_HOOK_REGISTER=1` is set).
- **SessionStart hook** (`hooks/session-start.js`) checks npm for a
  newer version of `@theglitchking/hit-em-with-the-docs` at session
  start and acts per policy:
  - `off` — silent, no network call
  - `nudge` *(default)* — prints a one-liner via `additionalContext`
  - `auto` — runs `npm update` and prints an upgrade confirmation
  - 3s network budget, 6h cache, CI-skip, fail-open on any error
- **Four new subcommands** (slash + CLI parity):
  - `/hit-em-with-the-docs:update` / `hewtd update`
  - `/hit-em-with-the-docs:policy [auto|nudge|off]` / `hewtd policy`
  - `/hit-em-with-the-docs:status` / `hewtd status`
  - `/hit-em-with-the-docs:relink` / `hewtd relink`

### Fixed
- `--version` now reads dynamically from `package.json` via
  `createRequire`. Previously hardcoded at `'2.0.0'`, which drifted out
  of sync with `package.json` (caused `hewtd --version` to lie about
  the installed version for all of 2.0.1 / 2.0.2).

### Migration

No action required for existing users — the new behaviors are
conservative and on-by-default only in their minimal form (nudge-only
update check). To take advantage of the new surface:

```bash
# From anywhere in your project:

# View installed version, latest on npm, current policy, and hook state
npx --no @theglitchking/hit-em-with-the-docs status

# Opt into automatic updates on session start
npx --no @theglitchking/hit-em-with-the-docs policy auto

# Or silence the update check entirely
npx --no @theglitchking/hit-em-with-the-docs policy off
```

If you had the plugin installed via the Claude Code marketplace
(`/plugin install`), running `npm install` as a project-level dep will
detect that and skip registering the project-level hook — the
marketplace plugin handles SessionStart events on its own. No duplicate
hook firing.

**Opt-outs** (env vars):

| Variable | Effect |
|---|---|
| `HIT_EM_WITH_THE_DOCS_UPDATE_POLICY` | One-shot policy override for the current session |
| `HIT_EM_WITH_THE_DOCS_SKIP_LINK=1` | Skip skill symlinking (no-op for this plugin — ships no skills) |
| `HIT_EM_WITH_THE_DOCS_SKIP_HOOK_REGISTER=1` | Skip writing the SessionStart hook into `.claude/settings.json` |

---

## [2.0.2] and earlier

See git history:
https://github.com/TheGlitchKing/hit-em-with-the-docs/commits/main
