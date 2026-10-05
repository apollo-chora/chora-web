/**
 * Object-derived workspace tab resolver (R+ Four-Mode refactor W2.D).
 *
 * The offering workspace is INTEGRATIVE per ADR-141 — there is NO mode
 * toggle. The set of tabs is derived purely from `offering.deliveryType`
 * (the plan §4 matrix); the user never switches it. This module is the
 * single source of truth for that matrix, kept pure (no Angular, no I/O)
 * so it is exhaustively unit-testable in isolation.
 *
 * Scope: every tab is now `available` (renders real content) as of W6 —
 * `transcript` (the per-offering gradebook join) was the last remaining
 * "coming soon" placeholder. The generic placeholder branch in the workspace
 * template stays wired as a defensive fallback for any FUTURE tab id added to
 * this matrix ahead of its panel implementation, but no currently-listed tab
 * id resolves to it anymore.
 *
 * `prerequisites` (ADR-226) is a course-level structured DAG, not a
 * delivery-type-specific concept — the BE walks `offering.CourseIDs`
 * regardless of `delivery_type` — so it is present + available in ALL THREE
 * matrices (unlike `curriculum`, which is graduate-only).
 *
 * Exam is a SEPARATE bounded context (plan §2 #1) — `OfferingDeliveryType`
 * is only graduate|short|async, so exam tabs are intentionally absent here.
 */
import type { OfferingDeliveryType } from './offerings.model';

/** Stable tab identifiers used as the `?tab=` query-param value + ARIA ids. */
export type OfferingTabId =
  | 'overview'
  | 'curriculum'
  | 'prerequisites'
  | 'sections'
  | 'roster'
  | 'assessments'
  | 'certification'
  | 'transcript'
  | 'schedule'
  | 'attendance'
  | 'publish'
  | 'analytics';

/** One workspace tab: its id, its i18n label key, and whether P0 renders it. */
export interface OfferingTab {
  readonly id: OfferingTabId;
  readonly labelKey: string;
  /** `true` only for `overview` in P0 — every other tab is a placeholder. */
  readonly available: boolean;
}

/** i18n key for a tab label (shared by the tab button + the panel heading). */
export function offeringTabLabelKey(id: OfferingTabId): string {
  return `rplus.offerings.workspace.tab.${id}`;
}

/**
 * Tabs whose real panel content is wired (ALL of them, as of W6): overview
 * (W2.D) + curriculum (W2.D) + sections (W7, graduate-only intra-cohort
 * sub-groups) + roster (W7, read-only per-course learner roster, graduate +
 * short) + assessments (W3.A) + certification (W2.D, read-only
 * attached-course cert config) + transcript (W6, per-offering gradebook join
 * of the offering's assessments + roster + chora-consumption
 * `StudentTranscript` results) + analytics (W7, read-only delivery-local
 * roll-up for async self-paced offerings) + schedule (CHO-1985, short-course
 * delivery sessions; list + create) + attendance (CHO-1986, session-scoped
 * attendance mark + list) + publish (CHO-1987, async catalog handoff; read +
 * publish action) + prerequisites (ADR-226, structured course→course DAG
 * authoring + free-text notes).
 */
const AVAILABLE_TABS: ReadonlySet<OfferingTabId> = new Set<OfferingTabId>([
  'overview',
  'curriculum',
  'prerequisites',
  'sections',
  'roster',
  'assessments',
  'certification',
  'transcript',
  'analytics',
  'schedule',
  'attendance',
  'publish',
]);

/** Build one tab descriptor; `available` marks tabs with real panel content. */
function tab(id: OfferingTabId): OfferingTab {
  return { id, labelKey: offeringTabLabelKey(id), available: AVAILABLE_TABS.has(id) };
}

/**
 * The plan §4 tab matrix, keyed by delivery_type. Order is meaningful —
 * it drives both the visual order and the roving-tabindex traversal order.
 */
const TAB_MATRIX: Readonly<Record<OfferingDeliveryType, readonly OfferingTabId[]>> = {
  graduate: [
    'overview',
    'curriculum',
    'prerequisites',
    'sections',
    'roster',
    'assessments',
    'certification',
    'transcript',
  ],
  short: [
    'overview',
    'prerequisites',
    'schedule',
    'roster',
    'attendance',
    'assessments',
    'certification',
  ],
  async: ['overview', 'prerequisites', 'publish', 'analytics'],
};

/**
 * Resolve the ordered tab set for a delivery_type (object-derived, no
 * toggle). Always non-empty and always leads with `overview`.
 */
export function offeringTabs(deliveryType: OfferingDeliveryType): readonly OfferingTab[] {
  return (TAB_MATRIX[deliveryType] ?? TAB_MATRIX.async).map(tab);
}
