/**
 * WBL Placement model — R+ M13 Work-Based Learning placement admin.
 *
 * Maps the chora-delivery `/api/v1/wbl-placements` wire envelope (per
 * services/chora-delivery/internal/adapter/http/wbl_handler.go::wblPlacementDTO)
 * into the typed FE model the R+ /r/wbl screen renders.
 *
 * Backend response shape (list — GET /api/v1/wbl-placements):
 *
 *  {
 *    items: [
 *      {
 *        id: string (UUIDv7),
 *        tenant_id: string,
 *        gcid: string (learner identity),
 *        course_id: string,
 *        host_org_name: string,
 *        supervisor_name: string,
 *        supervisor_email: string,
 *        start_date: ISO8601 string (RFC3339),
 *        end_date: ISO8601 string (RFC3339),
 *        hours_required: number,
 *        hours_completed: number,
 *        state: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'WITHDRAWN',
 *        evaluator_notes?: string (omitted when empty),
 *        created_at: ISO8601 string,
 *        updated_at: ISO8601 string,
 *      }, ...
 *    ]
 *  }
 *
 * The WblPlacement aggregate is owned by Content Delivery (per
 * .claude/rules/ddd-enforcement.md §3 + the wbl package docstring).
 * Soft delete = state transition to WITHDRAWN (NOT a deleted_at flag);
 * the DELETE verb on the REST endpoint maps to `Withdraw()` on the
 * aggregate.
 */

/**
 * PlacementState — the WBL FSM, exactly as defined in
 * services/chora-delivery/internal/domain/wbl/placement.go.
 */
export type PlacementState =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'WITHDRAWN';

export interface Placement {
  /** Placement UUIDv7 — opaque stable id. */
  readonly id: string;
  /** Owning tenant id (always = current tenant — RLS-enforced). */
  readonly tenantId: string;
  /** Learner GCID the placement is for. */
  readonly gcid: string;
  /**
   * Resolved learner display name (chora_delivery.user_directory projection,
   * CHO-2335). Optional: omitted by the BE when unresolved, so the view falls
   * back to the raw `gcid`.
   */
  readonly learnerName?: string;
  /** Source course id this placement is part of. */
  readonly courseId: string;
  /**
   * Resolved course title (chora_delivery courses, CHO-2335). Optional:
   * omitted by the BE when unresolved, so the view falls back to `courseId`.
   */
  readonly courseTitle?: string;
  /** Host organisation display name (e.g., `Acme Pte Ltd`). */
  readonly hostOrgName: string;
  /** Onsite supervisor name. */
  readonly supervisorName: string;
  /** Onsite supervisor email (for bounce / contact). */
  readonly supervisorEmail: string;
  /** Placement start date — RFC3339 string. */
  readonly startDate: string;
  /** Placement end date — RFC3339 string. */
  readonly endDate: string;
  /** Required onsite hours for completion. */
  readonly hoursRequired: number;
  /** Hours accrued so far (0 ≤ hoursCompleted ≤ hoursRequired). */
  readonly hoursCompleted: number;
  /** FSM state. */
  readonly state: PlacementState;
  /** Append-only evaluator notes (carries [WITHDRAWN] reason when withdrawn). */
  readonly evaluatorNotes: string;
  /** Created-at timestamp — RFC3339 string. */
  readonly createdAt: string;
  /** Updated-at timestamp — RFC3339 string. */
  readonly updatedAt: string;
}

export interface PlacementsList {
  /** Tenant display name (header pill — pulled from TenantContextService). */
  readonly tenantName: string;
  /** Total count for the header badge. */
  readonly totalPlacements: number;
  /** Placement rows for the list. */
  readonly items: readonly Placement[];
}

/**
 * Returns the badge variant class for the given state. Glassmorphism
 * design system slot:
 *   - SCHEDULED   → badge-info
 *   - IN_PROGRESS → badge-success
 *   - COMPLETED   → badge-success
 *   - WITHDRAWN   → badge-neutral
 */
export function stateBadgeVariant(
  state: PlacementState,
): 'badge-info' | 'badge-success' | 'badge-warning' | 'badge-neutral' {
  switch (state) {
    case 'SCHEDULED':
      return 'badge-info';
    case 'IN_PROGRESS':
      return 'badge-success';
    case 'COMPLETED':
      return 'badge-success';
    case 'WITHDRAWN':
      return 'badge-neutral';
  }
}

/**
 * Compute completion percentage [0..100], clamped on either side. Zero
 * required hours collapses to 0% rather than throwing — matches the
 * backend's RecordHours invariant that hoursRequired > 0 (so the 0 case
 * only fires on a corrupt payload).
 */
export function completionPercent(
  hoursCompleted: number,
  hoursRequired: number,
): number {
  if (hoursRequired <= 0) {
    return 0;
  }
  const raw = (hoursCompleted / hoursRequired) * 100;
  if (raw < 0) {
    return 0;
  }
  if (raw > 100) {
    return 100;
  }
  return Math.round(raw);
}

/**
 * Type guard — narrow an unknown to a `Placement`. Used at the network
 * boundary to confirm the wire envelope is structurally sound before
 * the mapper trusts the snake-case → camelCase shape. Defensive against
 * BFF schema drift per feedback_no_stubs_real_wiring (we fail-loud
 * rather than render a partial fixture).
 */
export function isPlacement(value: unknown): value is Placement {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const p = value as Record<string, unknown>;
  return (
    typeof p['id'] === 'string' &&
    typeof p['tenantId'] === 'string' &&
    typeof p['gcid'] === 'string' &&
    typeof p['courseId'] === 'string' &&
    typeof p['hostOrgName'] === 'string' &&
    typeof p['supervisorName'] === 'string' &&
    typeof p['supervisorEmail'] === 'string' &&
    typeof p['startDate'] === 'string' &&
    typeof p['endDate'] === 'string' &&
    typeof p['hoursRequired'] === 'number' &&
    typeof p['hoursCompleted'] === 'number' &&
    typeof p['state'] === 'string' &&
    typeof p['evaluatorNotes'] === 'string' &&
    typeof p['createdAt'] === 'string' &&
    typeof p['updatedAt'] === 'string' &&
    isPlacementState(p['state'])
  );
}

/**
 * Type guard for PlacementState — narrow an unknown string to a valid
 * FSM value. Mirrors the `PlacementState.IsValid()` helper on the
 * Go domain.
 */
export function isPlacementState(value: unknown): value is PlacementState {
  return (
    value === 'SCHEDULED' ||
    value === 'IN_PROGRESS' ||
    value === 'COMPLETED' ||
    value === 'WITHDRAWN'
  );
}
