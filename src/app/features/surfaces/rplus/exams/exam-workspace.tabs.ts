/**
 * Object-derived EXAM workspace tab resolver (W4 Exam BC — R+ Four-Mode).
 *
 * Exam is a SEPARATE bounded context from Offerings (see
 * offering-workspace.tabs.ts:22 — `OfferingDeliveryType` is graduate|short|async
 * only, exam is deliberately excluded). This is the exam parallel: its tab set
 * is derived from the VIEWER's role, not a delivery_type, per ADR-141
 * (integrative UI, no toggle) + ADR-190/191.
 *
 * Two viewer classes:
 *   - Exam admin (instructor / admin / training_admin / tenant_admin / owner /
 *     platform_operator — mirrors chora-delivery `hasExamAdminRole`): sees the
 *     FULL set including CONTENT (form/items) + results.
 *   - PROCTOR (ADR-191 content-embargo — logistics-only): sees the people, not
 *     the paper. Candidates + Proctors/sittings + Incidents + Overview, but
 *     NEVER the exam Form/items (content embargo) nor Results (grading).
 *
 * Kept pure (no Angular, no I/O) so the matrix is exhaustively unit-testable.
 */

/** Stable tab identifiers — the `?tab=` query-param value + ARIA ids. */
export type ExamTabId =
  | 'overview'
  | 'form'
  | 'candidates'
  | 'proctors'
  | 'incidents'
  | 'results';

/** One workspace tab: id, its i18n label key, and whether real content renders. */
export interface ExamTab {
  readonly id: ExamTabId;
  readonly labelKey: string;
  /** `true` when the panel renders real content; `false` = "coming soon". */
  readonly available: boolean;
}

/** The two viewer capabilities that shape the exam tab set. */
export interface ExamViewerRoles {
  /** instructor / admin / training_admin / tenant_admin / owner / platform_operator. */
  readonly isExamAdmin: boolean;
  /** PROCTOR — logistics-only, content-embargoed (ADR-191). */
  readonly isProctor: boolean;
}

/** i18n key for a tab label (shared by the tab button + the panel heading). */
export function examTabLabelKey(id: ExamTabId): string {
  return `rplus.exams.workspace.tab.${id}`;
}

/** Every tab now renders real content (W4 FE slice 2 landed Proctors/Incidents/Results). */
const AVAILABLE_TABS: ReadonlySet<ExamTabId> = new Set<ExamTabId>([
  'overview',
  'form',
  'candidates',
  'proctors',
  'incidents',
  'results',
]);

/** Full ordered tab set for an exam admin — order drives visual + tab traversal. */
const ADMIN_TAB_ORDER: readonly ExamTabId[] = [
  'overview',
  'form',
  'candidates',
  'proctors',
  'incidents',
  'results',
];

/**
 * PROCTOR logistics subset (ADR-191 embargo): NO `form` (exam content) and NO
 * `results` (grading) — "sees the people, not the paper".
 */
const PROCTOR_TAB_ORDER: readonly ExamTabId[] = [
  'overview',
  'candidates',
  'proctors',
  'incidents',
];

function tab(id: ExamTabId): ExamTab {
  return { id, labelKey: examTabLabelKey(id), available: AVAILABLE_TABS.has(id) };
}

/**
 * Resolve the ordered tab set for a viewer (object-derived, no toggle). Exam
 * admin wins over proctor when both are held (sees the full set). A viewer with
 * neither capability gets an EMPTY set — the workspace renders an unauthorized
 * state rather than leaking candidate/roster data.
 */
export function examWorkspaceTabs(roles: ExamViewerRoles): readonly ExamTab[] {
  if (roles.isExamAdmin) return ADMIN_TAB_ORDER.map(tab);
  if (roles.isProctor) return PROCTOR_TAB_ORDER.map(tab);
  return [];
}
