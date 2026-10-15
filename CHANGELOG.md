# Changelog

## Unreleased

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
