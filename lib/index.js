// Host half of dsh-plugin-auto-compact.
//
// This plugin deliberately implements no compaction logic: the engine is DSH's
// own `@deepseek-ai/dsh-compaction-basic`. What this package owns is *how that
// engine is configured* — see cordis.patch.yml, which enables the host-plane
// engine at thresholdRatio 0.5 and restates the standard/cordis/ptc preset
// declarations with the same threshold so per-session engines agree.
export const name = 'autoCompact';
export const inject = [];

/** Report the effective threshold once, so a boot log proves the layer loaded. */
export function apply(ctx) {
  try {
    ctx.logger.info(
      'auto-compact: compacting at 50% context usage (thresholdRatio=0.5, retainRatio=0.16, headroomTokens=65536)',
    );
  } catch {
    /* logging must never keep the host from booting */
  }
}
