/**
 * Growth-Edge mastery presentation helpers (ADR-196 B2).
 *
 * The meter is re-based on MASTERY = (1 − shakiness): a full/green bar means
 * "grown", matching every other progress/XP bar in the product (full = good).
 * Previously the bar rendered raw `strength`, so a full bar meant *shakiest*
 * (worst) — the inverted-meter debt the anchor-UX review flagged.
 *
 * Pure functions, shared by the A+ Growth-Edges page + the dashboard panel
 * (was duplicated `shakyPercent`/`shakyKey` in both).
 */

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Mastery percent (0–100) for the meter fill width. strength 0 → 100% mastered
 * (full bar), strength 1 → 0% (empty). Inputs outside [0,1] are clamped.
 */
export function masteryPercent(strength: number): number {
  return Math.round((1 - clamp01(strength)) * 100);
}

/**
 * Learner-friendly i18n key for the progress-toward-grown label, bucketing the
 * 0–1 shakiness. The existing copy already reads as a mastery gradient
 * ("Very shaky" → "Getting there" → "Almost grown"), so it pairs correctly
 * with the mastery bar (low shakiness ⇒ "Almost grown" ⇒ nearly-full bar).
 */
export function masteryLabelKey(strength: number): string {
  if (strength >= 0.75) {
    return 'aplus.growth_edges.shaky_high';
  }
  if (strength >= 0.4) {
    return 'aplus.growth_edges.shaky_mid';
  }
  return 'aplus.growth_edges.shaky_low';
}
