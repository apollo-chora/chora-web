/**
 * Text token contrast guard (WCAG 2.1 AA, chora-web/CLAUDE.md section 10: 4.5:1).
 *
 * WHY THIS EXISTS
 * The reported symptom: a panel sub-label painted `rgba(255,255,255,0.7)` on a
 * light surface at roughly 1.1:1, i.e. invisible text shipped to users. The
 * cause was NOT a bad colour choice. It was a `var(--chora-color-text-muted,
 * rgba(255,255,255,0.7))` reference to a token that was never defined, so the
 * dark-theme fallback painted. See `token-contract.spec.ts` for the drift guard.
 *
 * WHAT THIS ASSERTS
 * This resolves the `var()` chain exactly as CSS does (defined token wins, else
 * the fallback, else invalid-at-computed-value) and checks the colour that will
 * ACTUALLY paint. It is codebase-wide rather than pinned to one component, so it
 * keeps working as components come and go: the originally reported panel is
 * scheduled for deletion in a separate workstream, and a test pinned there would
 * die with it.
 *
 * jsdom cannot help here. It does not perform `var()` substitution in
 * `getComputedStyle`, so a runtime computed-style test would assert nothing.
 * Static resolution is the honest way to see the painted colour.
 *
 * THE SURFACE ASSUMPTION + THE STATIC-BOUND CAVEAT (CHO-1602)
 * chora-web has no dark surface: zero `prefers-color-scheme`, no ThemeService,
 * no `[data-theme]`. The only two genuinely dark blocks (atom-editor-split-pane
 * `__code-block` #1e293b, restricted-nav `__tooltip` #1f2937) hard-code their
 * own colour pairs and consume no text token. So every text colour lands on one
 * of the three defined light surfaces, and the worst case is the DARKEST one:
 * `--chora-color-surface-2` (#f5f5f5) yields a lower ratio for dark/mid text
 * than `--chora-color-surface-1` (#ffffff). We therefore check BOTH and take the
 * min: white catches genuinely light (near-invisible) text, #f5f5f5 catches
 * mid-grey text like #64748b that clears 4.5:1 on pure white (4.76:1) but fails
 * on the off-white card (4.37:1).
 *
 * This is a STATIC, worst-case-surface bound. It cannot see composited
 * glassmorphism (rgba over a blurred gradient), nor can it classify large text
 * (>=24px, or >=18.66px bold), which WCAG lets pass at 3:1. A `--primary`
 * heading at 3rem is legitimately fine yet trips this bound, so such sites land
 * in PRE_EXISTING_CONTRAST_DEBT rather than being force-migrated. The browser
 * axe recipe (`e2e/accessibility/aplus-a11y-cdp-guard.md`) is the arbiter for
 * those; this spec is the drift net that runs in CI.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const AA_NORMAL_TEXT = 4.5;

/**
 * WCAG 2.1 SC 1.4.3 exempts text in an inactive/disabled UI component from any
 * contrast requirement, so `--chora-color-text-disabled` (#9e9e9e, ~2.7:1) is
 * excluded here. It is deliberately NOT an alias target for any other text
 * token: aliasing a live text token onto it would fail this spec, which is the
 * point.
 */
const CONTRAST_EXEMPT_TOKEN = '--chora-color-text-disabled';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

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
    `text-token-contrast.spec: could not locate src/styles/_tokens.scss from ${process.cwd()}`,
  );
}

const SRC_ROOT = findSrcRoot();

function walkScss(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkScss(full, out);
    } else if (full.endsWith('.scss')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Parse `--custom-property: value;` declarations. The pattern is deliberately
 * broader than `--chora-*`: the legacy polyglass layer (`_polyglass-tokens.scss`)
 * defines `--text-muted`, `--primary`, `--danger`, `--info` etc., and ~830 live
 * `color:` sites still resolve through those names. Parsing them is what lets
 * this spec see the colour a legacy site actually paints.
 */
function parseTokenFile(path: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of readFileSync(path, 'utf8').matchAll(
    /^[ \t]*(--[a-z][a-z0-9-]*)\s*:\s*([^;]+);/gm,
  )) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/** Content between the parens of a leading `var(`. */
function varInner(expression: string): string {
  const start = expression.indexOf('(');
  let depth = 0;
  for (let i = start; i < expression.length; i++) {
    if (expression[i] === '(') depth++;
    else if (expression[i] === ')') {
      depth--;
      if (depth === 0) return expression.slice(start + 1, i);
    }
  }
  throw new Error(`unbalanced var(): ${expression}`);
}

/** Split `--name, fallback` on the first top-level comma. */
function splitOnFallback(inner: string): [string, string | undefined] {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
  }
  return [inner.trim(), undefined];
}

/**
 * Resolve a CSS value the way the cascade does.
 * Returns null for invalid-at-computed-value: an undefined token with no
 * fallback, where the declaration is dropped and the colour silently inherits.
 */
function resolveCssValue(expression: string, tokens: Map<string, string>, depth = 0): string | null {
  const trimmed = expression.trim();
  if (depth > 10) throw new Error(`var() nested too deep: ${expression}`);
  if (!trimmed.startsWith('var(')) return trimmed;

  const [name, fallback] = splitOnFallback(varInner(trimmed));
  const defined = tokens.get(name);
  if (defined !== undefined) return resolveCssValue(defined, tokens, depth + 1);
  if (fallback === undefined) return null;
  return resolveCssValue(fallback, tokens, depth + 1);
}

/**
 * The outermost `var(--X, ...)` token name, or null if the expression is not a
 * `var()` reference. Used to distinguish "resolves through a defined token"
 * (checked here) from "falls back to a raw hex because the token is undefined"
 * (that is a token-contract / legacy-color-ban concern, not this one).
 */
function outerVarToken(expression: string): string | null {
  const t = expression.trim();
  if (!t.startsWith('var(')) return null;
  return splitOnFallback(varInner(t))[0];
}

function parseColor(value: string): Rgba | null {
  const v = value.trim().toLowerCase();

  const short = /^#([0-9a-f]{3})$/.exec(v);
  if (short) {
    const [r, g, b] = [...short[1]].map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  const long = /^#([0-9a-f]{6})$/.exec(v);
  if (long) {
    return {
      r: parseInt(long[1].slice(0, 2), 16),
      g: parseInt(long[1].slice(2, 4), 16),
      b: parseInt(long[1].slice(4, 6), 16),
      a: 1,
    };
  }
  const functional = /^rgba?\(([^)]*)\)$/.exec(v);
  if (functional) {
    const parts = functional[1].split(',').map((p) => Number.parseFloat(p.trim()));
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  return null;
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Composite a possibly translucent foreground over an opaque background. */
function flatten(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function contrastRatio(fg: Rgba, bg: Rgba): number {
  const l1 = relativeLuminance(flatten(fg, bg));
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * TOKENS spans both stylesheet layers: the canonical `_tokens.scss` and the
 * legacy `_polyglass-tokens.scss` loaded additively beside it. There are no
 * name collisions between the two (polyglass owns `--text-*`/`--primary`/…,
 * chora owns `--chora-*`), so merge order is immaterial.
 */
const TOKENS = new Map<string, string>([
  ...parseTokenFile(join(SRC_ROOT, 'styles', '_tokens.scss')),
  ...parseTokenFile(join(SRC_ROOT, 'styles', '_polyglass-tokens.scss')),
]);
const SCSS_FILES = walkScss(SRC_ROOT);

/** A `color:` declaration, but never `background-color:` (the `-` blocks it). */
const COLOR_DECLARATION = /(?:^|\s)color:\s*([^;]+);/gm;

interface ColorSite {
  file: string;
  expression: string;
  resolved: string | null;
  /** Does the outermost var() reference resolve through a DEFINED token? */
  viaToken: boolean;
}

const colorSites: ColorSite[] = [];
for (const file of SCSS_FILES) {
  for (const match of readFileSync(file, 'utf8').matchAll(COLOR_DECLARATION)) {
    const expression = match[1].trim();
    if (!expression.startsWith('var(')) continue; // raw literals are legacy-color-ban's job
    if (expression.includes(CONTRAST_EXEMPT_TOKEN)) continue;
    const outer = outerVarToken(expression);
    colorSites.push({
      file: relative(SRC_ROOT, file),
      expression,
      resolved: resolveCssValue(expression, TOKENS),
      viaToken: outer !== null && TOKENS.has(outer),
    });
  }
}

/** The text-namespace subset drives the original invalid/determinate guards. */
const textColorSites = colorSites.filter((s) => s.expression.includes('--chora-color-text'));

/**
 * Sites whose colour is determined by a DEFINED token (legacy polyglass or
 * canonical chora): these are the ones whose painted colour is known and can be
 * held to AA. A `var(--undefined, #hex)` site resolves to its raw-hex fallback
 * instead; that is drift owned by token-contract.spec.ts (define the token) and
 * legacy-color-ban.spec.ts (ban the raw hex), not a determinate-colour failure.
 */
const tokenResolvedSites = colorSites.filter(
  (s) => s.viaToken && s.resolved !== null && parseColor(s.resolved) !== null,
);

/**
 * Pre-existing contrast debt, discovered BY this guard and explicitly NOT
 * endorsed. Each entry is a `${file} :: ${color-expression}` that paints below
 * B1 (2026-09-02) RENAMED nine keys rather than adding any. Each was
 * `var(--primary, <retired violet>)`; the re-token rewrote the stale fallback
 * to `#1976d2`, which is the colour that ALREADY painted, because `--primary`
 * is defined and wins. The key is the whole expression, so the entry moved
 * while the measured ratio stayed 4.22:1. No new debt was taken on.
 *
 * WCAG AA 4.5:1 on the worst-case surface today. The overwhelming majority are
 * legacy `var(--text-muted, #64748b)` sites (#64748b = 4.37:1 on #f5f5f5), which
 * a separate workstream will migrate to `--chora-color-text-muted`; a handful
 * are `--primary`/`--secondary` brand colours used as large text, legitimate in
 * the browser (>=3:1) but tripping this static normal-text bound.
 *
 * This list is a strict ratchet (see the two ratchet tests below): a NEW failing
 * site not on the list fails this spec, and an allowlisted site that STOPS
 * failing must be removed. It may only shrink. It is NOT a licence to add sites:
 * new code must clear AA or use a defined AA-safe token.
 *
 * Seeded mechanically from the scan on 2026-07-17 (CHO-1602). The 7
 * `var(--text-muted, #64748b)` sites in wallet.component.scss are deliberately
 * ABSENT: they are migrated in the same change, so they go red here without the
 * seed and green once migrated — the RED->GREEN proof for this guard.
 */
const PRE_EXISTING_CONTRAST_DEBT: string[] = [
  'app/features/admin/a2a/components/a2a-activation/a2a-activation.component.scss :: var(--chora-color-primary)',
  'app/features/admin/a2a/components/a2a-activation/a2a-activation.component.scss :: var(--chora-color-warning)',
  'app/features/admin/a2a/components/partner-registration/partner-registration.component.scss :: var(--chora-color-primary)',
  'app/features/admin/a2a/components/partner-registration/partner-registration.component.scss :: var(--chora-color-warning)',
  'app/features/admin/a2a/components/partner-suspension/partner-suspension.component.scss :: var(--chora-color-warning)',
  'app/features/admin/account-lifecycle/components/lifecycle-event-log/lifecycle-event-log.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/admissions/components/decision-panel/decision-panel.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/admissions/components/decision-panel/decision-panel.component.scss :: var(--chora-color-warning, #d97706)',
  'app/features/admin/agent-monitoring/components/agent-metric-card/agent-metric-card.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/communication/components/email-template-editor/email-template-editor.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/communication/components/trigger-rule-manager/trigger-rule-manager.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/components/compliance-dashboard/compliance-dashboard.component.scss :: var(--chora-color-warning, #856404)',
  'app/features/admin/components/live-session-dashboard/live-session-dashboard.component.scss :: var(--chora-color-warning, #856404)',
  'app/features/admin/content-authoring/components/assessment-builder/assessment-builder.component.scss :: var(--chora-color-primary)',
  'app/features/admin/content-authoring/components/atom-editor/atom-editor.component.scss :: var(--chora-color-primary)',
  'app/features/admin/content-authoring/components/atom-editor/atom-editor.component.scss :: var(--chora-color-warning)',
  'app/features/admin/content-authoring/components/atom-list/atom-list.component.scss :: var(--chora-color-primary)',
  'app/features/admin/content-authoring/components/atom-list/atom-list.component.scss :: var(--chora-color-warning)',
  'app/features/admin/content-authoring/components/path-builder/path-builder.component.scss :: var(--chora-color-primary)',
  'app/features/admin/content-authoring/components/topic-tree/topic-tree.component.scss :: var(--chora-color-primary)',
  'app/features/admin/developer/components/api-inspector/api-inspector.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/developer/components/developer-console/developer-console.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/developer/components/event-bus-monitor/event-bus-monitor.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/developer/components/feature-flag-override/feature-flag-override.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/developer/components/rls-context-viewer/rls-context-viewer.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/economy/components/economy-dashboard/economy-dashboard.component.scss :: var(--chora-color-primary, #3b82f6)',
  'app/features/admin/investigation/components/alert-threshold-editor/alert-threshold-editor.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/investigation/components/circuit-breaker-controls/circuit-breaker-controls.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/investigation/components/incident-dashboard/incident-dashboard.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/moderation/components/moderation-queue/moderation-queue.component.scss :: var(--chora-color-primary)',
  'app/features/admin/moderation/components/moderation-queue/moderation-queue.component.scss :: var(--chora-color-warning, #f9a825)',
  'app/features/admin/onboarding/components/cohort-progress/cohort-progress.component.scss :: var(--chora-color-warning, #d97706)',
  'app/features/admin/rbac/components/user-access-matrix/user-access-matrix.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/tenant-admin/components/account-deletion/account-deletion.component.scss :: var(--chora-color-primary)',
  'app/features/admin/tenant-admin/components/account-deletion/account-deletion.component.scss :: var(--chora-color-warning, #f9a825)',
  'app/features/admin/tenant-admin/components/content-transfer/content-transfer.component.scss :: var(--chora-color-primary)',
  'app/features/admin/tenant-admin/components/content-transfer/content-transfer.component.scss :: var(--chora-color-warning, #f9a825)',
  'app/features/admin/tenant-admin/components/go-live-checklist/go-live-checklist.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admin/training/components/compliance-dashboard/compliance-dashboard.component.scss :: var(--chora-color-warning, #856404)',
  'app/features/admin/training/components/live-session-dashboard/live-session-dashboard.component.scss :: var(--chora-color-warning, #856404)',
  'app/features/admissions/components/application-start/application-start.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admissions/components/application-start/application-start.component.scss :: var(--chora-color-warning, #d97706)',
  'app/features/admissions/components/decision-notification/decision-notification.component.scss :: var(--chora-color-warning, #d97706)',
  'app/features/admissions/components/stage-completion/stage-completion.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/admissions/components/stage-completion/stage-completion.component.scss :: var(--chora-color-warning, #d97706)',
  'app/features/atomic/components/atom-list/atom-list.component.scss :: var(--chora-color-primary)',
  'app/features/atomic/components/atom-player/atom-player.component.scss :: var(--chora-color-primary)',
  'app/features/atomic/components/daily-dose/daily-dose.component.scss :: var(--chora-color-primary)',
  'app/features/atomic/components/topic-explorer/topic-explorer.component.scss :: var(--chora-color-primary)',
  'app/features/billing/components/marketplace-detail/marketplace-detail.component.scss :: var(--chora-color-border, #ccc)',
  'app/features/choraverse/components/a2a-activity-indicator/a2a-activity-indicator.component.scss :: var(--chora-color-surface-0)',
  'app/features/choraverse/components/a2a-consent-dialog/a2a-consent-dialog.component.scss :: var(--chora-color-warning)',
  'app/features/choraverse/components/evolution-timeline/evolution-timeline.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/choraverse/components/familiar-chat/familiar-chat.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/choraverse/components/familiar-persona-card/familiar-persona-card.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/choraverse/components/first-interaction-tutorial/first-interaction-tutorial.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/choraverse/components/reward-store/reward-store.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/choraverse/components/stat-allocation/stat-allocation.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/community/components/ai-extraction/ai-extraction.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/community/components/community-atom-editor/community-atom-editor.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/community/components/contributor-profile/contributor-profile.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/engagement/components/dashboard/dashboard.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/engagement/components/exam-coaching-widget/exam-coaching-widget.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/engagement/components/exam-summary-widget/exam-summary-widget.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/engagement/components/exam-summary-widget/exam-summary-widget.component.scss :: var(--chora-color-warning, #ff9800)',
  'app/features/engagement/components/leaderboard-widget/leaderboard-widget.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/engagement/components/nudge-preview/nudge-preview.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/engagement/components/path-progress-widget/path-progress-widget.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/engagement/components/recommendation-widget/recommendation-widget.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/engagement/components/retention-alert/retention-alert.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/engagement/components/study-plan-dashboard/study-plan-dashboard.component.scss :: var(--chora-color-warning, #856404)',
  'app/features/engagement/components/weakness-drill-launcher/weakness-drill-launcher.component.scss :: var(--chora-color-warning, #e67700) !important',
  'app/features/engagement/components/xp-widget/xp-widget.component.scss :: var(--chora-color-primary, #1976d2)',
  // auth-callback/merge-conflict, identity/login and onboarding/register
  // were removed with the Firebase extraction — their contrast debt is gone.
  'app/features/identity/portability/components/portable-data-dashboard/portable-data-dashboard.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/identity/settings/a2a-connections/a2a-connections.component.scss :: var(--chora-color-primary)',
  'app/features/identity/settings/appeal-timeline/appeal-timeline.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/identity/settings/appeal/appeal.component.scss :: var(--chora-color-primary)',
  'app/features/identity/settings/appeal/appeal.component.scss :: var(--chora-color-warning, #f9a825)',
  'app/features/identity/settings/merge-request/merge-request.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/identity/settings/notification-archive/notification-archive.component.scss :: var(--chora-color-primary)',
  'app/features/identity/settings/referrals/referrals.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/identity/suspension/suspension-page.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/learning/components/training-enrollment/training-enrollment.component.scss :: var(--chora-color-primary)',
  'app/features/learning/components/training-enrollment/training-enrollment.component.scss :: var(--chora-color-warning, #f57f17)',
  'app/features/learning/components/training-enrollment/training-session-detail-modal.component.scss :: var(--chora-color-warning, #f57f17)',
  'app/features/onboarding/components/checklist-view/checklist-view.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/onboarding/components/checklist-view/checklist-view.component.scss :: var(--chora-color-warning, #d97706)',
  'app/features/onboarding/cross-tenant-enrollment/cross-tenant-enrollment.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/onboarding/select-tenant/select-tenant.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/public/pricing/pricing-page.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/search/components/search-filters/search-filters.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/search/components/search-page/search-page.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/support/components/faq-browser/faq-browser.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/support/components/ticket-detail/ticket-detail.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss :: var(--chora-color-primary, #2e7ddc)',
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss :: var(--info, #3b82f6)',
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss :: var(--success)',
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss :: var(--success, #16a34a)',
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss :: var(--warning)',
  'app/features/surfaces/aplus/atom-authoring/atom-authoring.component.scss :: var(--warning, #f59e0b)',
  'app/features/surfaces/aplus/atom-authoring/mcq-fields/mcq-fields.component.scss :: var(--chora-color-primary)',
  'app/features/surfaces/aplus/atom-authoring/oe-fields/oe-fields.component.scss :: var(--chora-color-primary)',
  'app/features/surfaces/aplus/atom-authoring/question-type-picker/question-type-picker.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/atom-authoring/question-type-picker/question-type-picker.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/atom-authoring/unified/unified-atom-authoring.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/atom-authoring/unified/unified-atom-authoring.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/atom-authoring/unified/unified-review-list.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/atom-authoring/unified/unified-review-list.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/atom-authoring/widget/trace-widget.component.scss :: var(--dim-2, #3b82f6)',
  'app/features/surfaces/aplus/atom-authoring/widget/trace-widget.component.scss :: var(--info)',
  'app/features/surfaces/aplus/atom-authoring/widget/trace-widget.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/atom-authoring/widget/trace-widget.component.scss :: var(--success)',
  'app/features/surfaces/aplus/atom-authoring/widget/trace-widget.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/atom-authoring/widget/trace-widget.component.scss :: var(--warning)',
  'app/features/surfaces/aplus/atom-revisions/atom-revisions.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/atom-revisions/atom-revisions.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/aplus/atom-revisions/atom-revisions.component.scss :: var(--text-muted, #64748b)',
  'app/features/surfaces/aplus/atom-revisions/atom-revisions.component.scss :: var(--warning, #f59e0b)',
  'app/features/surfaces/aplus/atomic-session/atomic-session.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/atomic-session/atomic-session.component.scss :: var(--success, #0f766e)',
  'app/features/surfaces/aplus/atomic-session/atomic-session.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/aplus/atomic-session/atomic-session.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/atomic-session/atomic-session.component.scss :: var(--warning, #f59e0b)',
  'app/features/surfaces/aplus/catalog/catalog.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/catalog/catalog.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/collections/collections-detail/collections-detail.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/collections/collections-detail/collections-detail.component.scss :: var(--success)',
  'app/features/surfaces/aplus/collections/collections-detail/collections-detail.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/collections/collections-detail/collections-detail.component.scss :: var(--warning)',
  'app/features/surfaces/aplus/collections/collections-edit/collections-edit.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/collections/collections-edit/collections-edit.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/collections/collections-list/collections-list.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/collections/collections-list/collections-list.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/course-detail/course-detail.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/surfaces/aplus/course-detail/course-detail.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/course-detail/course-detail.component.scss :: var(--success)',
  'app/features/surfaces/aplus/course-detail/course-detail.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/course-detail/course-detail.component.scss :: var(--text-muted, #64748b)',
  'app/features/surfaces/aplus/course-enrolment-success/course-enrolment-success.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/surfaces/aplus/course-enrolment-success/course-enrolment-success.component.scss :: var(--chora-color-warning, #f0a23a)',
  'app/features/surfaces/aplus/course-enrolment-success/course-enrolment-success.component.scss :: var(--text-muted, #64748b)',
  'app/features/surfaces/aplus/course-enrolment-success/course-enrolment-success.component.scss :: var(--text-muted, #94a3b8)',
  'app/features/surfaces/aplus/course-learn/course-curriculum/course-curriculum.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/surfaces/aplus/course-learn/course-curriculum/course-curriculum.component.scss :: var(--chora-color-warning, #f0a23a)',
  'app/features/surfaces/aplus/course-learn/course-curriculum/course-curriculum.component.scss :: var(--text-muted, #64748b)',
  'app/features/surfaces/aplus/course-learn/course-curriculum/course-curriculum.component.scss :: var(--text-muted, #94a3b8)',
  'app/features/surfaces/aplus/course-learn/course-learn.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/surfaces/aplus/course-learn/course-learn.component.scss :: var(--chora-color-warning, #f0a23a)',
  'app/features/surfaces/aplus/course-learn/course-learn.component.scss :: var(--text-muted, #64748b)',
  'app/features/surfaces/aplus/course-learn/course-learn.component.scss :: var(--text-muted, #94a3b8)',
  'app/features/surfaces/aplus/daily-dose/campaign-practice/campaign-practice.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/daily-dose/campaign-practice/campaign-practice.component.scss :: var(--success)',
  'app/features/surfaces/aplus/daily-dose/campaign-practice/campaign-practice.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/daily-dose/campaign-practice/campaign-practice.component.scss :: var(--warning)',
  'app/features/surfaces/aplus/daily-dose/daily-dose.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/daily-dose/daily-dose.component.scss :: var(--success)',
  'app/features/surfaces/aplus/daily-dose/daily-dose.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/daily-dose/daily-dose.component.scss :: var(--warning)',
  'app/features/surfaces/aplus/dashboard/cast-card/cast-card.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/dashboard/cast-card/cast-card.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/dashboard/cast-card/summon-wizard.component.scss :: var(--chora-color-warning, #d97706)',
  'app/features/surfaces/aplus/dashboard/cast-card/summon-wizard.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/dashboard/cast-card/summon-wizard.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/dashboard/continue-learning-card/continue-learning-card.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/dashboard/continue-learning-card/continue-learning-card.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/dashboard/dashboard.component.scss :: var(--info)',
  'app/features/surfaces/aplus/dashboard/dashboard.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/dashboard/dashboard.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/dashboard/dashboard.component.scss :: var(--warning, #d97706)',
  'app/features/surfaces/aplus/dashboard/goal/goal-picker.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/dashboard/header-goal-control/header-goal-control.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/dashboard/header-goal-control/header-goal-control.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/dashboard/map-preview-card/map-preview-card.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/dashboard/map-preview-card/map-preview-card.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/dashboard/notifications-ticker/notifications-ticker.component.scss :: var(--chora-color-warning, #f59e0b)',
  'app/features/surfaces/aplus/dashboard/notifications-ticker/notifications-ticker.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/dashboard/notifications-ticker/notifications-ticker.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/discovery-graph/concept-hex-map/concept-hex-map.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/discovery-graph/concept-hex-map/concept-hex-map.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/discovery-graph/familiar-map/familiar-map-memory-panel.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/discovery-graph/familiar-map/familiar-map-memory-panel.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/discovery-graph/familiar-map/familiar-map.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/discovery-graph/familiar-map/familiar-map.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-ceremony/ceremony-edges-panel.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-ceremony/familiar-binding-ceremony.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-chat/familiar-chat.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-chat/familiar-chat.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-checkout-result/familiar-checkout-result.component.scss :: var(--chora-color-warning, #fbbf24)',
  'app/features/surfaces/aplus/familiar-design/grimoire-design.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/familiar-design/persona/persona-tab.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/familiar-design/routines/routines-tab.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/familiar-egg/familiar-egg.component.scss :: var(--chora-color-primary, #4a67d8)',
  'app/features/surfaces/aplus/familiar-egg/familiar-egg.component.scss :: var(--info)',
  'app/features/surfaces/aplus/familiar-egg/familiar-egg.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-egg/familiar-egg.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-growth-log/familiar-growth-log.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-growth-log/familiar-growth-log.component.scss :: var(--success)',
  'app/features/surfaces/aplus/familiar-growth-log/familiar-growth-log.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-growth-log/familiar-growth-log.component.scss :: var(--warning)',
  'app/features/surfaces/aplus/familiar-hatching/familiar-hatching.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-hatching/familiar-hatching.component.scss :: var(--success)',
  'app/features/surfaces/aplus/familiar-hatching/familiar-hatching.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-incubation/incubation-card.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-incubation/incubation-card.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-marketplace/egg-card/egg-card.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-marketplace/egg-card/egg-card.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-marketplace/egg-odds-table/egg-odds-table.component.scss :: var(--info)',
  'app/features/surfaces/aplus/familiar-marketplace/egg-odds-table/egg-odds-table.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-marketplace/egg-odds-table/egg-odds-table.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-marketplace/familiar-marketplace.component.scss :: var(--info)',
  'app/features/surfaces/aplus/familiar-marketplace/familiar-marketplace.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-marketplace/familiar-marketplace.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-source-revelation/familiar-source-revelation-overlay.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-source-revelation/familiar-source-revelation.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-stage-up/familiar-stage-up-overlay.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/familiar-stage-up/familiar-stage-up-overlay.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar-stage-up/familiar-stage-up.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar-stage-up/familiar-stage-up.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar/familiar.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/familiar/familiar.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/familiar/familiar.component.scss :: var(--warning, #f59e0b)',
  'app/features/surfaces/aplus/far-sight/far-sight.component.scss :: var(--chora-color-primary, #7c9cff)',
  'app/features/surfaces/aplus/login/aplus-login.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/login/aplus-login.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/me-assessments/me-assessment-result/me-assessment-result.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/me-assessments/me-assessment-result/me-assessment-result.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/me-assessments/me-assessment-result/me-assessment-result.component.scss :: var(--success, #0f766e)',
  'app/features/surfaces/aplus/me-assessments/me-assessment-result/me-assessment-result.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/me-assessments/me-assessment-result/me-assessment-result.component.scss :: var(--warning, #f59e0b)',
  'app/features/surfaces/aplus/me-assessments/me-assessment/me-assessment.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/me-assessments/me-assessment/me-assessment.component.scss :: var(--success, #0f766e)',
  'app/features/surfaces/aplus/me-assessments/me-assessment/me-assessment.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/me-assessments/me-assessments-list/me-assessments-list.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/me-assessments/me-assessments-list/me-assessments-list.component.scss :: var(--success, #0f766e)',
  'app/features/surfaces/aplus/me-assessments/me-assessments-list/me-assessments-list.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/me-assessments/me-assessments-list/me-assessments-list.component.scss :: var(--warning, #f59e0b)',
  'app/features/surfaces/aplus/me-transcript/me-transcript.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/me-transcript/me-transcript.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/my-knowledge/concept-lens-map/concept-lens-map.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/my-knowledge/concept-lens-map/concept-lens-map.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/my-knowledge/map-canvas/map-canvas.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/my-knowledge/map-canvas/map-canvas.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/my-knowledge/map-canvas/map-canvas.component.scss :: var(--text-muted, #6b7280)',
  'app/features/surfaces/aplus/my-knowledge/map-familiar/map-familiar-panel.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/my-knowledge/map-familiar/map-familiar-panel.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/my-knowledge/my-knowledge.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/my-knowledge/my-knowledge.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/question-banks/question-bank-workbench-detail.component.scss :: var(--info, #3b82f6)',
  'app/features/surfaces/aplus/question-banks/question-bank-workbench-detail.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/question-banks/question-bank-workbench-list.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/search/search.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/search/search.component.scss :: var(--success)',
  'app/features/surfaces/aplus/search/search.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/studio/studio-atoms.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/studio/studio-home.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/studio/studio-sub-nav.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/study/study-lists/study-lists.component.scss :: var(--primary)',
  'app/features/surfaces/aplus/study/study-lists/study-lists.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/study/study-sub-nav/study-sub-nav.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/test-set-editor/test-set-editor.component.scss :: var(--text-muted)',
  'app/features/surfaces/aplus/wallet/wallet.component.scss :: var(--info, #3b82f6)',
  'app/features/surfaces/aplus/wallet/wallet.component.scss :: var(--primary, #1976d2)',
  'app/features/surfaces/aplus/wallet/wallet.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/aplus/wallet/wallet.component.scss :: var(--warning, #f59e0b)',
  'app/features/surfaces/cplus/components/bounties/cplus-bounties.component.scss :: var(--primary)',
  'app/features/surfaces/cplus/components/bounties/cplus-bounties.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/addons/addon-change-tier.component.scss :: var(--chora-color-primary, #2a7)',
  'app/features/surfaces/hplus/addons/addon-change-tier.component.scss :: var(--chora-color-warning, #c77800)',
  'app/features/surfaces/hplus/addons/addon-management.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/addons/addon-management.component.scss :: var(--primary, #5b8def)',
  'app/features/surfaces/hplus/addons/addon-management.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/addons/addon-management.component.scss :: var(--warning, #d97706)',
  'app/features/surfaces/hplus/addons/addon-marketplace-detail.component.scss :: var(--primary, #5b8def)',
  'app/features/surfaces/hplus/addons/addon-marketplace-detail.component.scss :: var(--warning, #d97706)',
  'app/features/surfaces/hplus/addons/addon-usage.component.scss :: var(--chora-color-primary, #2a7)',
  'app/features/surfaces/hplus/billing/billing.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/billing/billing.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/branding/branding-configuration.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/branding/branding-configuration.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/external-egress/hplus-external-egress.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/hplus/external-egress/hplus-external-egress.component.scss :: var(--text-muted, #64748b)',
  'app/features/surfaces/hplus/familiar-eggs-edit/familiar-eggs-edit.component.scss :: var(--info)',
  'app/features/surfaces/hplus/familiar-eggs-edit/familiar-eggs-edit.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/familiar-eggs-edit/familiar-eggs-edit.component.scss :: var(--success)',
  'app/features/surfaces/hplus/familiar-eggs-edit/familiar-eggs-edit.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/familiar-eggs/familiar-eggs.component.scss :: var(--info)',
  'app/features/surfaces/hplus/familiar-eggs/familiar-eggs.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/familiar-eggs/familiar-eggs.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/idp/idp-federation.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/idp/idp-federation.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/kg-config/hplus-kg-config.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/kg-config/hplus-kg-config.component.scss :: var(--success)',
  'app/features/surfaces/hplus/kg-config/hplus-kg-config.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/mana/mana-pool.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/mana/mana-pool.component.scss :: var(--success, #16a34a)',
  'app/features/surfaces/hplus/mana/mana-pool.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/marketplace/addon-marketplace-catalog-detail.component.scss :: var(--primary, #5b8def)',
  'app/features/surfaces/hplus/marketplace/addon-marketplace-catalog-detail.component.scss :: var(--warning, #d97706)',
  'app/features/surfaces/hplus/marketplace/addon-marketplace.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/marketplace/addon-marketplace.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/members/members.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/members/members.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/tenant-overview/tenant-overview.component.scss :: var(--text-muted)',
  'app/features/surfaces/hplus/transactions/transactions.component.scss :: var(--primary)',
  'app/features/surfaces/hplus/transactions/transactions.component.scss :: var(--text-muted)',
  'app/features/surfaces/oplus/components/a2a-console/oplus-a2a-console.component.scss :: var(--primary)',
  'app/features/surfaces/oplus/components/a2a-console/oplus-a2a-console.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/oplus/components/a2a-console/oplus-a2a-console.component.scss :: var(--text-muted)',
  'app/features/surfaces/oplus/components/agent-eval/oplus-agent-eval.component.scss :: var(--primary)',
  'app/features/surfaces/oplus/components/agent-eval/oplus-agent-eval.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/oplus/components/agent-eval/oplus-agent-eval.component.scss :: var(--text-muted)',
  'app/features/surfaces/oplus/components/agents/oplus-agents.component.scss :: var(--primary)',
  'app/features/surfaces/oplus/components/agents/oplus-agents.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/oplus/components/agents/oplus-agents.component.scss :: var(--text-muted)',
  'app/features/surfaces/oplus/components/costs/oplus-costs.component.scss :: var(--primary)',
  'app/features/surfaces/oplus/components/costs/oplus-costs.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/oplus/components/costs/oplus-costs.component.scss :: var(--text-muted)',
  'app/features/surfaces/oplus/components/dashboard/oplus-dashboard.component.scss :: var(--primary)',
  'app/features/surfaces/oplus/components/dashboard/oplus-dashboard.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/oplus/components/dashboard/oplus-dashboard.component.scss :: var(--text-muted)',
  'app/features/surfaces/oplus/components/egress-kill-switch/oplus-egress-kill-switch.component.scss :: var(--text-muted, #64748b)',
  'app/features/surfaces/oplus/components/governance/oplus-governance.component.scss :: var(--primary)',
  'app/features/surfaces/oplus/components/governance/oplus-governance.component.scss :: var(--success, #10b981)',
  'app/features/surfaces/oplus/components/governance/oplus-governance.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/applications-admin-detail/applications-admin-detail.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/applications-admin-detail/applications-admin-detail.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/assessment-monitor/assessment-monitor/assessment-monitor.component.scss :: var(--chora-color-primary, #5b7fff)',
  'app/features/surfaces/rplus/assessment-monitor/assessment-monitor/assessment-monitor.component.scss :: var(--chora-color-warning, #b45309)',
  'app/features/surfaces/rplus/assessments/assessment-instantiation/assessment-instantiation.component.scss :: var(--chora-color-primary, #5b7fff)',
  'app/features/surfaces/rplus/campusops/campusops.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/catalog/catalog.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/certifications/certifications.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/class-roster/class-roster.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/class-roster/class-roster.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/classroom/classroom.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/course-content-editor/course-content-editor.component.scss :: var(--chora-color-primary, #b45309)',
  'app/features/surfaces/rplus/course-content-editor/course-content-editor.component.scss :: var(--text-muted, #64748b)',
  'app/features/surfaces/rplus/course-content-editor/course-content-editor.component.scss :: var(--text-muted, #94a3b8)',
  'app/features/surfaces/rplus/course-detail-admin/course-detail-admin.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/exams/exam-workspace.component.scss :: var(--chora-color-primary)',
  'app/features/surfaces/rplus/exams/exams.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/exams/exams.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/grading-queue/grading-queue.component.scss :: var(--chora-color-primary, #5b7fff)',
  'app/features/surfaces/rplus/grading-queue/submission-grading-detail.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/features/surfaces/rplus/grading-queue/submission-grading-detail.component.scss :: var(--chora-color-warning, #b45309)',
  'app/features/surfaces/rplus/live-classroom-play/live-classroom-play.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/live-poll-play/live-poll-play.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/offerings/offering-create.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/offerings/offering-workspace.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/offerings/offering-workspace.component.scss :: var(--success)',
  'app/features/surfaces/rplus/project-group-detail/project-group-detail.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/project-groups/project-groups.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/question-banks/question-bank-detail.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/question-banks/question-bank-list.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/quiz-builder/quiz-builder.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/roster-by-course/roster-by-course.component.scss :: var(--text-muted)',
  // rostering.component.scss deleted in R4 (CHO-2269): its --text-muted debt
  // site is gone with the file (dashboard absorbed into the finder header).
  'app/features/surfaces/rplus/scheduling/scheduling.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/skillsfutures-claim-detail/skillsfutures-claim-detail.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/skillsfutures-claim-detail/skillsfutures-claim-detail.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/skillsfutures-claims/skillsfutures-claims.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/skillsfutures-claims/skillsfutures-claims.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/surveys/surveys.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/wbl-detail/wbl-detail.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/wbl-detail/wbl-detail.component.scss :: var(--text-muted)',
  'app/features/surfaces/rplus/wbl/wbl.component.scss :: var(--primary)',
  'app/features/surfaces/rplus/wbl/wbl.component.scss :: var(--text-muted)',
  'app/features/survey/components/survey-form/survey-form.component.scss :: var(--chora-color-primary, #2563eb)',
  'app/layouts/auth-layout/auth-layout.component.scss :: var(--chora-color-primary)',
  'app/layouts/main-layout/top-nav/top-nav.component.scss :: var(--chora-color-primary)',
  'app/layouts/public-layout/public-layout.component.scss :: var(--chora-color-primary)',
  'app/shared/components/access-denied/access-denied.component.scss :: var(--chora-color-primary)',
  'app/shared/components/access-denied/access-denied.component.scss :: var(--chora-color-warning, #e65100)',
  'app/shared/components/ai-companion-badge/ai-companion-badge.component.scss :: var(--chora-color-primary, #1976d2)',
  'app/shared/components/atom-card/atom-card.component.scss :: var(--chora-color-primary)',
  'app/shared/components/atom-card/atom-card.component.scss :: var(--chora-color-warning)',
  'app/shared/components/chora-collection-view/chora-collection-view.component.scss :: var(--chora-color-primary)',
  'app/shared/components/chora-empty-state/chora-empty-state.component.scss :: var(--primary)',
  'app/shared/components/chora-empty-state/chora-empty-state.component.scss :: var(--text-muted)',
  'app/shared/components/chora-empty-state/chora-empty-state.component.scss :: var(--warning, #f59e0b)',
  'app/shared/components/chora-file-dropzone/chora-file-dropzone.component.scss :: var(--primary)',
  'app/shared/components/chora-file-dropzone/chora-file-dropzone.component.scss :: var(--text-muted)',
  'app/shared/components/chora-mcq-option/chora-mcq-option.component.scss :: var(--primary)',
  'app/shared/components/chora-mcq-option/chora-mcq-option.component.scss :: var(--success, #0f766e)',
  'app/shared/components/chora-mcq-option/chora-mcq-option.component.scss :: var(--text-muted)',
  'app/shared/components/chora-question-editor/chora-question-editor.component.scss :: var(--text-muted, #64748b)',
  'app/shared/components/chora-question-image/chora-question-image.component.scss :: var(--text-muted, #64748b)',
  'app/shared/components/chora-question-review/chora-question-review.component.scss :: var(--primary)',
  'app/shared/components/chora-question-review/chora-question-review.component.scss :: var(--text-muted)',
  'app/shared/components/chora-stat-card/chora-stat-card.component.scss :: var(--primary)',
  'app/shared/components/chora-stat-card/chora-stat-card.component.scss :: var(--success, #0f766e)',
  'app/shared/components/chora-stat-card/chora-stat-card.component.scss :: var(--text-muted)',
  'app/shared/components/chora-stat-card/chora-stat-card.component.scss :: var(--warning, #f59e0b)',
  'app/shared/components/error-retry/error-retry.component.scss :: var(--chora-color-primary, #0d6efd)',
  'app/shared/components/familiar-answerable-widget/familiar-answerable-widget.component.scss :: var(--text-muted)',
  'app/shared/components/familiar-loadout/familiar-loadout.component.scss :: var(--text-muted)',
  'app/shared/components/goal-graduated-celebration/goal-graduated-celebration.component.scss :: var(--chora-color-warning, #f9a825)',
  'app/shared/components/grew-edge-celebration/grew-edge-celebration.component.scss :: var(--success, #10b981)',
  'app/shared/components/grew-edge-celebration/grew-edge-celebration.component.scss :: var(--text-muted, #64748b)',
  'app/shared/components/grounded-attribution/grounded-attribution.component.scss :: var(--chora-color-primary, #7c9cff)',
  'app/shared/components/mana-topup-modal/mana-topup-modal.component.scss :: var(--chora-color-primary)',
  'app/shared/components/mana-topup-modal/mana-topup-modal.component.scss :: var(--chora-color-warning, #ff9800)',
  'app/shared/components/notification-center/notification-center.component.scss :: var(--chora-color-primary)',
  'app/shared/components/notification-center/notification-center.component.scss :: var(--chora-color-warning)',
  'app/shared/components/qr-attendance/qr-attendance.component.scss :: var(--chora-color-primary)',
  'app/shared/components/qr-attendance/qr-attendance.component.scss :: var(--chora-color-warning, #e67700)',
  'app/shared/components/transaction-history/transaction-history.component.scss :: var(--success)',
  'app/shared/components/transaction-history/transaction-history.component.scss :: var(--text-muted)',
  'app/shared/tooltip/chora-tooltip.component.scss :: var(--text-muted, #64748b)',
  'styles/_imda-accents.scss :: var(--dim-1)',
  'styles/_imda-accents.scss :: var(--dim-2)',
  'styles/_imda-accents.scss :: var(--dim-3)',
  'styles/_imda-accents.scss :: var(--dim-4)',
  'styles/_polyglass-components.scss :: var(--primary)',
  'styles/_polyglass-components.scss :: var(--success)',
  'styles/_polyglass-components.scss :: var(--text-muted)',
  'styles/_polyglass-components.scss :: var(--tool-promptfoo-text)',
  'styles/_tooltip.scss :: var(--info, #3b82f6)',
  'styles/_tooltip.scss :: var(--primary, #1976d2)',
];

const CONTRAST_DEBT = new Set(PRE_EXISTING_CONTRAST_DEBT);

/** Stable key for the debt allowlist + the failing-site diff. */
function debtKey(site: { file: string; expression: string }): string {
  return `${site.file} :: ${site.expression}`;
}

/** The `{ ... }` body of the first rule whose selector matches. Fails loud. */
function ruleBody(scss: string, selector: string): string {
  const at = scss.indexOf(selector);
  if (at === -1) throw new Error(`selector "${selector}" not found`);
  const open = scss.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < scss.length; i++) {
    if (scss[i] === '{') depth++;
    else if (scss[i] === '}') {
      depth--;
      if (depth === 0) return scss.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced block for "${selector}"`);
}

function surfaceColor(token: string): Rgba {
  const value = TOKENS.get(token);
  if (!value) throw new Error(`text-token-contrast.spec: ${token} is not defined`);
  const color = parseColor(value);
  if (!color) throw new Error(`text-token-contrast.spec: cannot parse ${token} = ${value}`);
  return color;
}

/** Worst-case (lowest) contrast a colour paints at across both light surfaces. */
function worstCaseRatio(color: Rgba): number {
  return Math.min(
    contrastRatio(color, surfaceColor('--chora-color-surface-1')),
    contrastRatio(color, surfaceColor('--chora-color-surface-2')),
  );
}

describe('text token contrast', () => {
  /**
   * Self-check. The assertions below are absence assertions and would pass
   * vacuously if the scanner stopped finding declarations. These floors, plus
   * the positive/negative controls, make a broken scan loud instead of green.
   */
  it('scans a plausible amount of source (guards against a vacuous pass)', () => {
    expect(SCSS_FILES.length).toBeGreaterThan(100);
    expect(textColorSites.length).toBeGreaterThan(200);
    expect(colorSites.length).toBeGreaterThan(500);
    expect(tokenResolvedSites.length).toBeGreaterThan(500);
    expect(TOKENS.get('--chora-color-surface-1')).toBe('#ffffff');
    expect(TOKENS.get('--chora-color-surface-2')).toBe('#f5f5f5');
    // Polyglass was actually parsed (D1a): without this the ~830 legacy
    // --text-muted sites would resolve to null and the whole check go vacuous.
    expect(TOKENS.get('--text-muted')).toBe('#64748b');
  });

  it('has a working contrast check (positive + negative control)', () => {
    // Negative control: the legacy muted grey is a real failure on #f5f5f5.
    expect(worstCaseRatio(parseColor('#64748b')!)).toBeLessThan(AA_NORMAL_TEXT);
    // Positive control: the canonical replacement clears AA on both surfaces.
    expect(worstCaseRatio(parseColor('#616161')!)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('never leaves a text colour invalid-at-computed-value', () => {
    const invalid = textColorSites.filter((site) => site.resolved === null);
    const detail = invalid.map((s) => `  ${s.file}: color: ${s.expression}`).join('\n');
    expect(
      invalid.map((s) => `${s.file}: ${s.expression}`),
      `These declarations reference an undefined token with NO fallback. The\n` +
        `declaration is dropped at computed-value time and the colour silently\n` +
        `inherits from the parent, so the rendered colour is whatever happens to\n` +
        `cascade in:\n${detail}`,
    ).toEqual([]);
  });

  it('resolves every text colour to a determinate colour', () => {
    const indeterminate = textColorSites.filter(
      (site) => site.resolved !== null && parseColor(site.resolved) === null,
    );
    const detail = indeterminate
      .map((s) => `  ${s.file}: color: ${s.expression} resolves to "${s.resolved}"`)
      .join('\n');
    expect(
      indeterminate.map((s) => `${s.file}: ${s.expression}`),
      `These text colours do not resolve to an actual colour, so what paints\n` +
        `depends on the cascade rather than the token:\n${detail}`,
    ).toEqual([]);
  });

  it('paints every token-resolved text colour at AA on both light surfaces', () => {
    const failures = tokenResolvedSites
      .map((site) => {
        const color = parseColor(site.resolved!)!;
        const ratio = worstCaseRatio(color);
        return ratio < AA_NORMAL_TEXT ? { ...site, ratio } : null;
      })
      .filter((f): f is ColorSite & { ratio: number } => f !== null)
      .filter((f) => !CONTRAST_DEBT.has(debtKey(f)));

    const detail = failures
      .map((f) => `  ${f.ratio.toFixed(2)}:1  ${debtKey(f)}  ->  paints ${f.resolved}`)
      .join('\n');

    expect(
      failures.map((f) => debtKey(f)),
      `These text colours fail WCAG AA (${AA_NORMAL_TEXT}:1) on the worst-case\n` +
        `surface (min over #ffffff and #f5f5f5). Fix them by pointing at a defined\n` +
        `AA-safe token, or — only if the site is genuinely large text (>=3:1) —\n` +
        `add its key to PRE_EXISTING_CONTRAST_DEBT with justification. Do NOT add\n` +
        `normal-text failures to the debt list:\n${detail}`,
    ).toEqual([]);
  });

  it('keeps the contrast-debt allowlist shrinking (a fixed site must be removed)', () => {
    const stillFailing = new Set(
      tokenResolvedSites
        .filter((s) => worstCaseRatio(parseColor(s.resolved!)!) < AA_NORMAL_TEXT)
        .map((s) => debtKey(s)),
    );
    const stale = [...CONTRAST_DEBT].filter((key) => !stillFailing.has(key)).sort();
    expect(
      stale,
      `These entries are on PRE_EXISTING_CONTRAST_DEBT but no longer fail (they\n` +
        `were fixed, moved, or the surface set changed). Remove them so the debt\n` +
        `list can only shrink, never rot:`,
    ).toEqual([]);
  });

  /**
   * The originally reported symptom, pinned to a component that survives.
   *
   * The bug was first reported on `authored-courses-panel__sub`, which was
   * deleted on 2026-07-16 by a separate workstream. This is the same bug in a
   * live shared component: the entity-picker dropdown is authored against a
   * dark theme, so its option sublabel falls back to `rgba(255,255,255,0.6)`.
   * Its surfaces come from `--chora-color-surface-1`/`-2`, which ARE defined and
   * are `#ffffff`/`#f5f5f5`, so the dark fallbacks were always dead code and the
   * sublabel painted white-on-white at 1.00:1. Invisible, and shipping.
   *
   * The assertion composites the alpha over the surface rather than checking the
   * declared colour, because `rgba(255,255,255,0.6)` only reveals itself as
   * unreadable once flattened onto what is behind it. That is the thing a user
   * notices.
   */
  it('paints the entity-picker option sublabel at AA over its own surface', () => {
    const componentScss = join(
      SRC_ROOT,
      'app/shared/components/chora-entity-picker/entity-picker.component.scss',
    );
    const declared = /(?:^|\s)color:\s*([^;]+);/.exec(
      ruleBody(readFileSync(componentScss, 'utf8'), '&__option-sublabel'),
    );
    expect(declared, 'entity-picker __option-sublabel declares no color').not.toBeNull();

    const painted = resolveCssValue(declared![1].trim(), TOKENS);
    expect(painted, 'the sublabel colour is invalid-at-computed-value').not.toBeNull();

    const color = parseColor(painted!);
    expect(color, `the sublabel colour "${painted}" is not a colour`).not.toBeNull();

    // The dropdown panel paints --chora-color-surface-1.
    const surface = surfaceColor('--chora-color-surface-1');
    const ratio = contrastRatio(color!, surface);
    expect(
      ratio,
      `entity-picker __option-sublabel declares "${declared![1].trim()}", which paints\n` +
        `${painted} and composites to ${ratio.toFixed(2)}:1 over ${TOKENS.get('--chora-color-surface-1')}.\n` +
        `Below ${AA_NORMAL_TEXT}:1 this sublabel is unreadable, and at ~1:1 it is invisible.`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('keeps every defined text token AA on every defined surface', () => {
    const textTokens = [...TOKENS.keys()].filter(
      (t) => t.startsWith('--chora-color-text') && t !== CONTRAST_EXEMPT_TOKEN,
    );
    const surfaces = [...TOKENS.keys()].filter((t) => /^--chora-color-surface-\d+$/.test(t));

    expect(textTokens.length).toBeGreaterThan(0);
    expect(surfaces.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const textToken of textTokens) {
      const color = parseColor(TOKENS.get(textToken) ?? '');
      if (!color) {
        failures.push(`${textToken} does not parse as a colour`);
        continue;
      }
      for (const surfaceToken of surfaces) {
        const ratio = contrastRatio(color, surfaceColor(surfaceToken));
        if (ratio < AA_NORMAL_TEXT) {
          failures.push(
            `${textToken} (${TOKENS.get(textToken)}) on ${surfaceToken} ` +
              `(${TOKENS.get(surfaceToken)}) is ${ratio.toFixed(2)}:1`,
          );
        }
      }
    }

    expect(
      failures,
      `Every text token must be readable on every surface token. If this fires\n` +
        `after an alias change, the alias target is too light: do NOT point a live\n` +
        `text token at ${CONTRAST_EXEMPT_TOKEN}, which is WCAG-exempt only because\n` +
        `it styles inactive controls.`,
    ).toEqual([]);
  });
});
