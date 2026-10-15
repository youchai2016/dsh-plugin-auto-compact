# Changelog

## Unreleased

- README rewritten to stay **concise**: it now answers exactly three questions — what the
  plugin does, why it exists (the pain point), and how to use it. The deeper notes
  (why a plugin is required, the five contributed rows, source-level compaction details,
  manual profile registration, sharing/installing for others, post-upgrade flow,
  compatibility, tooling) moved to [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).
  A test keeps the README under 120 lines and keeps the three headings present.
- README: a **痛点 / pain point** section stating the problem this plugin answers —
  a session filling up *before* compaction runs (the automatic check only happens at
  step boundaries, so one heavy step can consume the headroom mid-step), which forces
  a fresh session that lost all context and re-bills every repeated input and tool
  call as uncached work.
- README: how to install this plugin **for someone else** — repo URL via *Add plugin*
  vs. clone + local path, the caveat that the dialog's China mirror only switches the
  npm registry, and the version-compatibility self-check
  (`npm test` → `npm run regen` → `npm run preflight`) before restarting.

## 1.0.0

- First release. Contributes five rows to a DSH profile: the plugin's own host
  row, the host-plane `compaction-basic` (enabled, `thresholdRatio: 0.5`), and a
  full-declaration override of the `standard`, `cordis`, and `ptc` presets so
  their isolated per-session compaction engines use the same threshold.
- Ships `tools/regen-preset-overrides.mjs` (keeps the copied preset declarations
  in sync with a local DSH installation) and `tools/preflight.mjs` (composes the
  profile with DSH's own loader before a restart).
