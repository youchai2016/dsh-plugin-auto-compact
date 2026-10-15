# Changelog

## 1.0.0

- First release. Contributes five rows to a DSH profile: the plugin's own host
  row, the host-plane `compaction-basic` (enabled, `thresholdRatio: 0.5`), and a
  full-declaration override of the `standard`, `cordis`, and `ptc` presets so
  their isolated per-session compaction engines use the same threshold.
- Ships `tools/regen-preset-overrides.mjs` (keeps the copied preset declarations
  in sync with a local DSH installation) and `tools/preflight.mjs` (composes the
  profile with DSH's own loader before a restart).
