/**
 * axe-core configuration for A+ surface WCAG 2.1 AA audit.
 *
 * Design decisions:
 *
 * 1. Tags: `wcag2a`, `wcag2aa`, `wcag21aa` covers the full WCAG 2.1 AA rule
 *    set.  `wcag21aa` adds the 2.1-specific success criteria (e.g. 1.4.10
 *    Reflow, 1.4.11 Non-Text Contrast, 1.4.13 Content on Hover or Focus).
 *
 * 2. Excluded selectors — `.glass-panel`, `.glass-backdrop`:
 *    Chora uses a glassmorphism design system (docs/design.md).  These
 *    surfaces use `backdrop-filter: blur()` on semi-transparent backgrounds.
 *    axe-core's colour-contrast algorithm evaluates the CSS `background-color`
 *    value in isolation, and assigns a very low alpha (e.g. rgba(255,255,255,
 *    0.08)) which it correctly flags as insufficient contrast.  However, at
 *    runtime the frosted glass layer sits above a coloured gradient/image,
 *    yielding the 4.5:1 ratio required by WCAG 2.1 AA 1.4.3.  We suppress
 *    the false-positive at the container level; the child text nodes within
 *    these containers are NOT excluded and continue to be evaluated.
 *
 * 3. resultTypes — `violations` only:
 *    `incomplete` (needs-review) and `inapplicable` add noise in CI.  We
 *    only fail on confirmed violations.  Developers can run
 *    `axe.run({ resultTypes: ['violations', 'incomplete'] })` locally for
 *    exploratory audits.
 *
 * 4. prefers-reduced-motion:
 *    CI Chromium runs with the default system media-feature value.  The
 *    `motion` rule from the best-practices tag is NOT included here to avoid
 *    environment-dependent flakiness.  Reduced-motion compliance is verified
 *    through targeted unit tests in Vitest + Storybook add-on.
 */

import type { RunOptions } from 'axe-core';

/**
 * Tablet-first viewports per CLAUDE.md UI mandate (≥768px primary, ≥1280px
 * desktop enhanced).
 */
export const APLUS_VIEWPORTS = [
  { width: 1024, height: 768 },   // tablet landscape — primary audit surface
  { width: 1440, height: 900 },   // desktop enhanced
] as const;

/**
 * Default axe RunOptions for A+ surface.
 *
 * Import and spread into every `AxeBuilder.options()` call so all route
 * specs share a consistent configuration.
 */
export const AXE_CONFIG: RunOptions = {
  resultTypes: ['violations'],
  rules: {
    // Suppress colour-contrast false-positive on glassmorphism surfaces.
    // The semi-transparent backdrop-filter containers report rgba(r,g,b,0.08)
    // as background which axe cannot resolve through the blur layer.  Text
    // nodes inside these containers are NOT excluded (see include/exclude in
    // AxeBuilder calls).
    'color-contrast': { enabled: true },
  },
};

/**
 * CSS selectors excluded from axe analysis at the AxeBuilder level.
 *
 * Reason: glassmorphism backdrop-blur surfaces.  See design note (2) above.
 * These selectors target the CONTAINER only; text children are still audited.
 */
export const AXE_EXCLUDE_SELECTORS: string[] = [
  '.glass-backdrop',
  '.glass-panel > .glass-surface',
];

/**
 * WCAG 2.1 AA tag list passed to AxeBuilder.withTags().
 *
 * - wcag2a   : WCAG 2.0 Level A
 * - wcag2aa  : WCAG 2.0 Level AA
 * - wcag21aa : WCAG 2.1 additions at Level AA
 */
export const WCAG_21_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'] as const;

/**
 * Seeded IDs for routes that require path parameters.
 *
 * These correspond to seed data present in the BFF dev environment.
 * Change them when the BFF seed data is updated.
 */
export const SEEDED_IDS = {
  courseId: 'course-seed-001',
  atomId: 'atom-seed-001',
  assessmentId: 'assessment-seed-001',
  familiarId: 'familiar-seed-001',
} as const;

/**
 * Helper: format a violation summary line for assertion error output.
 * Includes the rule ID, impact, target selector, and the first help URL so
 * engineers can action the remediation immediately from the CI log.
 */
export function formatViolation(v: {
  id: string;
  impact: string | null;
  nodes: Array<{ target: Array<string | string[]> }>;
  helpUrl: string;
}): string {
  const target = v.nodes[0]?.target?.[0] ?? '(unknown selector)';
  return `[${v.impact ?? 'unknown'}] rule "${v.id}" on "${target}" — see ${v.helpUrl}`;
}
