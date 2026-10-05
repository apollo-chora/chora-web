/**
 * Legacy colour ban: a shrinking ratchet against two named anti-patterns in
 * shipped `color:` declarations (CHO-1602).
 *
 * WHY THIS EXISTS
 * `text-token-contrast.spec.ts` resolves `var()` chains and proves the PAINTED
 * colour clears AA. It is the arbiter of "is this readable". This spec is the
 * cheaper, lexical partner that stops the two specific bad habits from spreading
 * BEFORE they need a contrast computation to catch:
 *
 *   1. `color: var(--text-muted, …)` — the legacy polyglass token. It resolves
 *      to #64748b, which fails AA on #f5f5f5 (4.37:1). The canonical, AA-safe
 *      replacement is `--chora-color-text-muted` (#616161). ~830 sites still use
 *      the legacy name; this ratchet freezes that count so it can only fall.
 *   2. `color: <raw failing hex>` — a hard-coded #64748b / #ef4444 / #3b82f6 /
 *      #10b981 / #f59e0b as the literal text colour. Each is a known live AA
 *      failure. A raw hex behind a defined token fallback
 *      (`var(--danger, #ef4444)`) is NOT banned: it is dead code the token
 *      overrides, already covered by token-contract + the contrast spec. Only a
 *      hex that actually paints — i.e. is the direct value — is a violation here.
 *
 * SCOPE
 * Scans the same source set as token-contract.spec.ts (.scss/.css/.html/.ts,
 * excluding tests + stories). Token DEFINITIONS are untouched: the ban is
 * anchored to the `color:` property, so `--text-muted: #64748b;` in the token
 * file and `var(--danger, #ef4444)` fallbacks are both left alone.
 *
 * RATCHET SHAPE
 * File-level ceilings. For each allowlisted file the current violation count must
 * EQUAL its ceiling: above it means new debt was added (fix it), below it means
 * debt was paid down (lower the ceiling in the same change). A file not on the
 * list must have zero violations. The list may only shrink. wallet.component.scss
 * is deliberately absent — its 7 legacy `--text-muted` sites are migrated in this
 * same change, so it is red here without an entry and green once migrated.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Files whose `color:` declarations count as shipped style. */
const SOURCE_EXTENSIONS = ['.scss', '.css', '.html', '.ts'];
/** Tests and stories are not shipped styles (and contain these hexes as data). */
const NON_SHIPPED_SUFFIXES = ['.spec.ts', '.stories.ts'];

/** The legacy muted token that must give way to `--chora-color-text-muted`. */
const BANNED_TOKEN = '--text-muted';

/**
 * Raw hexes that are live WCAG AA failures as normal text (measured worst-case
 * over #ffffff / #f5f5f5). Banned only as a DIRECT `color:` value, never as a
 * var() fallback. Case-insensitive.
 */
const BANNED_HEXES = ['#64748b', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

/**
 * A `color:` property, not `background-color:`/`accent-color:`/`caret-color:`
 * (the lookbehind rejects a preceding `-` or word char) and not the
 * `--chora-color-…` token name (same reason). Captures the value up to `;`/`}`.
 */
const COLOR_DECLARATION = /(?<![-\w])color:\s*([^;{}]+)/g;

function findSrcRoot(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    try {
      statSync(join(dir, 'src', 'styles', '_tokens.scss'));
      return join(dir, 'src');
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(
    `legacy-color-ban.spec: could not locate src/styles/_tokens.scss from ${process.cwd()}`,
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** True if this `color:` value is one of the two banned anti-patterns. */
function isViolation(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.includes(`var(${BANNED_TOKEN}`)) return true; // legacy muted token, any fallback
  return BANNED_HEXES.some((hex) => v.startsWith(hex)); // raw hex as the direct colour
}

const SRC_ROOT = findSrcRoot();
const SOURCE_FILES = walk(SRC_ROOT).filter(
  (f) =>
    SOURCE_EXTENSIONS.some((ext) => f.endsWith(ext)) &&
    !NON_SHIPPED_SUFFIXES.some((suffix) => f.endsWith(suffix)),
);

/** relative file path -> number of banned `color:` declarations in it. */
const violationsByFile = new Map<string, number>();
for (const file of SOURCE_FILES) {
  let count = 0;
  for (const match of readFileSync(file, 'utf8').matchAll(COLOR_DECLARATION)) {
    if (isViolation(match[1])) count++;
  }
  if (count > 0) violationsByFile.set(relative(SRC_ROOT, file), count);
}

/**
 * Pre-existing legacy-colour debt, seeded mechanically 2026-07-17 (CHO-1602):
 * every file with a banned `color:` today, with its exact count as the ceiling.
 * Named debt, NOT endorsed — the ceilings may only fall. wallet.component.scss is
 * intentionally NOT here; D4 migrates its 7 `--text-muted` sites in this change.
 */
const PRE_EXISTING_LEGACY_DEBT: Record<string, number> = {
  'app/features/admin/analytics-insights/components/insight-narrative/insight-narrative.component.scss': 1,
  'app/features/admin/analytics-insights/components/trend-explanation/trend-explanation.component.scss': 1,
  'app/features/billing/components/marketplace-detail/marketplace-detail.component.scss': 1,
  'app/features/support/components/ticket-detail/ticket-detail.component.scss': 1,
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss': 18,
  'app/features/surfaces/aplus/atom-authoring/question-type-picker/question-type-picker.component.scss': 4,
  'app/features/surfaces/aplus/atom-authoring/unified/unified-atom-authoring.component.scss': 9,
  'app/features/surfaces/aplus/atom-authoring/unified/unified-review-list.component.scss': 7,
  'app/features/surfaces/aplus/atom-authoring/widget/trace-widget.component.scss': 9,
  'app/features/surfaces/aplus/atom-revisions/atom-revisions.component.scss': 7,
  'app/features/surfaces/aplus/atomic-session/atomic-session.component.scss': 12,
  'app/features/surfaces/aplus/catalog/catalog.component.scss': 9,
  'app/features/surfaces/aplus/collections/collections-detail/collections-detail.component.scss': 13,
  'app/features/surfaces/aplus/collections/collections-edit/collections-edit.component.scss': 5,
  'app/features/surfaces/aplus/collections/collections-list/collections-list.component.scss': 7,
  'app/features/surfaces/aplus/course-detail/course-detail.component.scss': 8,
  'app/features/surfaces/aplus/course-enrolment-success/course-enrolment-success.component.scss': 3,
  'app/features/surfaces/aplus/course-learn/course-curriculum/course-curriculum.component.scss': 4,
  'app/features/surfaces/aplus/course-learn/course-learn.component.scss': 8,
  'app/features/surfaces/aplus/daily-dose/campaign-practice/campaign-practice.component.scss': 6,
  // Held at 11 through a brief deferral: daa7e4610 (ADR-242 D2) had pushed
  // this to 12 via `.dose-scope`, and the one-token swap repaints #64748b ->
  // #616161 inside a Chromatic story glob, so it waited until the CHO-2403
  // Companion captures were taken rather than polluting that build's diff.
  // Captures done 2026-08-20; the swap landed and the count is back at 11.
  // Raising the ceiling to 12 was considered and rejected - a debt cap is not
  // a budget to spend.
  'app/features/surfaces/aplus/daily-dose/daily-dose.component.scss': 11,
  'app/features/surfaces/aplus/dashboard/cast-card/cast-card.component.scss': 2,
  'app/features/surfaces/aplus/dashboard/cast-card/summon-wizard.component.scss': 5,
  'app/features/surfaces/aplus/dashboard/continue-learning-card/continue-learning-card.component.scss': 5,
  'app/features/surfaces/aplus/dashboard/dashboard.component.scss': 12,
  'app/features/surfaces/aplus/dashboard/goal/goal-picker.component.scss': 2,
  'app/features/surfaces/aplus/dashboard/header-goal-control/header-goal-control.component.scss': 8,
  'app/features/surfaces/aplus/dashboard/map-preview-card/map-preview-card.component.scss': 3,
  'app/features/surfaces/aplus/dashboard/notifications-ticker/notifications-ticker.component.scss': 3,
  'app/features/surfaces/aplus/discovery-graph/concept-hex-map/concept-hex-map.component.scss': 3,
  'app/features/surfaces/aplus/discovery-graph/familiar-map/familiar-map-memory-panel.component.scss': 13,
  'app/features/surfaces/aplus/discovery-graph/familiar-map/familiar-map.component.scss': 5,
  'app/features/surfaces/aplus/familiar-ceremony/ceremony-edges-panel.component.scss': 12,
  'app/features/surfaces/aplus/familiar-ceremony/familiar-binding-ceremony.component.scss': 5,
  'app/features/surfaces/aplus/familiar-chat/familiar-chat.component.scss': 1,
  'app/features/surfaces/aplus/familiar-design/grimoire-design.component.scss': 3,
  'app/features/surfaces/aplus/familiar-design/persona/persona-tab.component.scss': 5,
  'app/features/surfaces/aplus/familiar-design/routines/routines-tab.component.scss': 9,
  'app/features/surfaces/aplus/familiar-egg/familiar-egg.component.scss': 4,
  'app/features/surfaces/aplus/familiar-growth-log/familiar-growth-log.component.scss': 8,
  'app/features/surfaces/aplus/familiar-hatching/familiar-hatching.component.scss': 12,
  'app/features/surfaces/aplus/familiar-incubation/incubation-card.component.scss': 5,
  'app/features/surfaces/aplus/familiar-marketplace/egg-card/egg-card.component.scss': 3,
  'app/features/surfaces/aplus/familiar-marketplace/egg-odds-table/egg-odds-table.component.scss': 4,
  'app/features/surfaces/aplus/familiar-marketplace/familiar-marketplace.component.scss': 3,
  'app/features/surfaces/aplus/familiar-source-revelation/familiar-source-revelation-overlay.component.scss': 1,
  'app/features/surfaces/aplus/familiar-source-revelation/familiar-source-revelation.component.scss': 1,
  'app/features/surfaces/aplus/familiar-stage-up/familiar-stage-up-overlay.component.scss': 6,
  'app/features/surfaces/aplus/familiar-stage-up/familiar-stage-up.component.scss': 6,
  'app/features/surfaces/aplus/familiar/familiar.component.scss': 8,
  'app/features/surfaces/aplus/login/aplus-login.component.scss': 8,
  'app/features/surfaces/aplus/me-assessments/me-assessment-result/me-assessment-result.component.scss': 10,
  'app/features/surfaces/aplus/me-assessments/me-assessment/me-assessment.component.scss': 5,
  'app/features/surfaces/aplus/me-assessments/me-assessments-list/me-assessments-list.component.scss': 5,
  'app/features/surfaces/aplus/me-transcript/me-transcript.component.scss': 3,
  'app/features/surfaces/aplus/my-knowledge/concept-lens-map/concept-lens-map.component.scss': 2,
  'app/features/surfaces/aplus/my-knowledge/map-canvas/map-canvas.component.scss': 28,
  'app/features/surfaces/aplus/my-knowledge/map-familiar/map-familiar-panel.component.scss': 5,
  'app/features/surfaces/aplus/my-knowledge/my-knowledge.component.scss': 8,
  'app/features/surfaces/aplus/search/search.component.scss': 15,
  'app/features/surfaces/aplus/studio/studio-sub-nav.component.scss': 1,
  'app/features/surfaces/aplus/study/study-lists/study-lists.component.scss': 5,
  'app/features/surfaces/aplus/study/study-sub-nav/study-sub-nav.component.scss': 1,
  'app/features/surfaces/aplus/test-set-editor/test-set-editor.component.scss': 1,
  'app/features/surfaces/cplus/components/bounties/cplus-bounties.component.scss': 8,
  'app/features/surfaces/hplus/addons/addon-management.component.scss': 5,
  'app/features/surfaces/hplus/billing/billing.component.scss': 9,
  'app/features/surfaces/hplus/branding/branding-configuration.component.scss': 8,
  'app/features/surfaces/hplus/external-egress/hplus-external-egress.component.scss': 4,
  'app/features/surfaces/hplus/familiar-eggs-edit/familiar-eggs-edit.component.scss': 7,
  'app/features/surfaces/hplus/familiar-eggs/familiar-eggs.component.scss': 5,
  'app/features/surfaces/hplus/idp/idp-federation.component.scss': 5,
  'app/features/surfaces/hplus/kg-config/hplus-kg-config.component.scss': 5,
  'app/features/surfaces/hplus/mana/mana-pool.component.scss': 13,
  'app/features/surfaces/hplus/marketplace/addon-marketplace.component.scss': 4,
  'app/features/surfaces/hplus/members/members.component.scss': 12,
  'app/features/surfaces/hplus/tenant-overview/tenant-overview.component.scss': 5,
  'app/features/surfaces/hplus/transactions/transactions.component.scss': 2,
  'app/features/surfaces/oplus/components/a2a-console/oplus-a2a-console.component.scss': 12,
  'app/features/surfaces/oplus/components/agent-eval/oplus-agent-eval.component.scss': 12,
  'app/features/surfaces/oplus/components/agents/oplus-agents.component.scss': 8,
  'app/features/surfaces/oplus/components/costs/oplus-costs.component.scss': 9,
  'app/features/surfaces/oplus/components/dashboard/oplus-dashboard.component.scss': 13,
  'app/features/surfaces/oplus/components/egress-kill-switch/oplus-egress-kill-switch.component.scss': 3,
  'app/features/surfaces/oplus/components/governance/oplus-governance.component.scss': 13,
  'app/features/surfaces/oplus/components/placeholder/oplus-placeholder.component.ts': 1,
  'app/features/surfaces/rplus/applications-admin-detail/applications-admin-detail.component.scss': 11,
  'app/features/surfaces/rplus/campusops/campusops.component.scss': 9,
  'app/features/surfaces/rplus/catalog/catalog.component.scss': 10,
  'app/features/surfaces/rplus/cert-preview-modal/cert-preview-modal.component.ts': 6,
  'app/features/surfaces/rplus/certifications/certifications.component.scss': 10,
  'app/features/surfaces/rplus/class-roster/class-roster.component.scss': 7,
  'app/features/surfaces/rplus/classroom/classroom.component.scss': 9,
  'app/features/surfaces/rplus/course-content-editor/course-content-editor.component.scss': 9,
  'app/features/surfaces/rplus/course-detail-admin/course-detail-admin.component.scss': 16,
  'app/features/surfaces/rplus/exams/exams.component.scss': 6,
  'app/features/surfaces/rplus/live-classroom-play/live-classroom-play.component.scss': 3,
  'app/features/surfaces/rplus/live-poll-play/live-poll-play.component.scss': 3,
  'app/features/surfaces/rplus/project-group-detail/project-group-detail.component.scss': 11,
  'app/features/surfaces/rplus/project-groups/project-groups.component.scss': 11,
  'app/features/surfaces/rplus/quiz-builder/quiz-builder.component.scss': 13,
  'app/features/surfaces/rplus/roster-by-course/roster-by-course.component.scss': 7,
  // rostering.component.scss deleted in R4 (CHO-2269): dashboard absorbed into
  // the Offerings finder header; its legacy-colour debt goes with it.
  'app/features/surfaces/rplus/scheduling/scheduling.component.scss': 5,
  'app/features/surfaces/rplus/skillsfutures-claim-detail/skillsfutures-claim-detail.component.scss': 7,
  'app/features/surfaces/rplus/skillsfutures-claims/skillsfutures-claims.component.scss': 9,
  'app/features/surfaces/rplus/surveys/surveys.component.scss': 19,
  'app/features/surfaces/rplus/wbl-detail/wbl-detail.component.scss': 11,
  'app/features/surfaces/rplus/wbl/wbl.component.scss': 13,
  'app/features/surfaces/surface-landing.component.ts': 2,
  'app/features/survey/components/survey-form/survey-form.component.scss': 2,
  'app/shared/components/chora-empty-state/chora-empty-state.component.scss': 2,
  'app/shared/components/chora-file-dropzone/chora-file-dropzone.component.scss': 2,
  'app/shared/components/chora-mcq-option/chora-mcq-option.component.scss': 1,
  'app/shared/components/chora-question-editor/chora-question-editor.component.scss': 4,
  'app/shared/components/chora-question-image/chora-question-image.component.scss': 3,
  'app/shared/components/chora-question-review/chora-question-review.component.scss': 3,
  'app/shared/components/chora-stat-card/chora-stat-card.component.scss': 3,
  'app/shared/components/familiar-answerable-widget/familiar-answerable-widget.component.scss': 5,
  'app/shared/components/familiar-loadout/familiar-loadout.component.scss': 7,
  'app/shared/components/grew-edge-celebration/grew-edge-celebration.component.scss': 1,
  'app/shared/components/transaction-history/transaction-history.component.scss': 6,
  'app/shared/tooltip/chora-tooltip.component.scss': 1,
  'styles/_polyglass-components.scss': 8,
};

describe('legacy colour ban', () => {
  /**
   * Self-check: absence assertions pass vacuously if the scan silently finds
   * nothing. These floors + the control make a broken scan loud.
   */
  it('scans a plausible amount of source (guards against a vacuous pass)', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(500);
    // The legacy token is pervasive today; if the scan sees none, it is broken.
    expect(violationsByFile.size).toBeGreaterThan(50);
  });

  it('recognises both banned patterns and clears the safe ones (control)', () => {
    expect(isViolation('var(--text-muted, #64748b)')).toBe(true);
    expect(isViolation('#ef4444')).toBe(true);
    expect(isViolation('#EF4444 !important')).toBe(true);
    // A defined-token fallback with a banned hex is dead code, NOT a violation.
    expect(isViolation('var(--danger, #ef4444)')).toBe(false);
    // The canonical replacement and a normal hex are fine.
    expect(isViolation('var(--chora-color-text-muted)')).toBe(false);
    expect(isViolation('#616161')).toBe(false);
  });

  it('adds no banned colour to a file that had none', () => {
    const offenders = [...violationsByFile.keys()]
      .filter((file) => !(file in PRE_EXISTING_LEGACY_DEBT))
      .sort();
    const detail = offenders
      .map((f) => `  ${f} (${violationsByFile.get(f)} banned color: decls)`)
      .join('\n');
    expect(
      offenders,
      `These files introduce a banned colour (legacy var(${BANNED_TOKEN}, …) or a\n` +
        `raw failing hex as a direct color:). Use --chora-color-text-muted or a\n` +
        `defined AA-safe token instead:\n${detail}`,
    ).toEqual([]);
  });

  it('never lets an allowlisted file exceed its ceiling', () => {
    const grown = Object.entries(PRE_EXISTING_LEGACY_DEBT)
      .filter(([file, ceiling]) => (violationsByFile.get(file) ?? 0) > ceiling)
      .map(([file, ceiling]) => `  ${file}: ${violationsByFile.get(file)} > ceiling ${ceiling}`)
      .sort();
    expect(
      grown,
      `These allowlisted files gained banned colours. The ceiling is a debt cap,\n` +
        `not a budget to spend:`,
    ).toEqual([]);
  });

  it('forces a lowered ceiling once debt is paid down (strict ratchet)', () => {
    const slack = Object.entries(PRE_EXISTING_LEGACY_DEBT)
      .filter(([file, ceiling]) => (violationsByFile.get(file) ?? 0) < ceiling)
      .map(([file, ceiling]) => `  ${file}: now ${violationsByFile.get(file) ?? 0}, lower ceiling from ${ceiling}`)
      .sort();
    expect(
      slack,
      `These files have FEWER banned colours than their ceiling — good, but the\n` +
        `ceiling must be lowered to lock the win in (or removed if now zero):`,
    ).toEqual([]);
  });
});
