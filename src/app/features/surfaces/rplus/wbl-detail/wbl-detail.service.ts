/**
 * WblDetailService — R+ Wave-5 drill-down BFF wiring (real, no stubs).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService. The
 * service surfaces the GET-by-id call against the chora-gateway BFF, which
 * proxies verbatim to chora-delivery's wbl_handler.go::handleWblGet:
 *
 *   - get(id)            — GET   /api/v1/wbl-placements/{id}
 *   - update(id, patch)  — PATCH /api/v1/wbl-placements/{id}
 *                           (hours_completed / evaluator_notes; BE enforces
 *                            0 ≤ hoursCompleted ≤ hoursRequired, notes ≤ 4000,
 *                            and 409 CONFLICT on a closed/terminal placement)
 *   - withdraw(id)       — DELETE /api/v1/wbl-placements/{id}
 *                           (soft-delete; backend transitions to WITHDRAWN
 *                            and stamps `[WITHDRAWN] DELETE /api/v1/wbl-
 *                            placements` into evaluator_notes for audit)
 *
 * Tenant + GCID are resolved off the validated mesh claims the chora-
 * gateway BFF stamps (RequireChoraSessionJWT); the downstream chora-
 * delivery handler scopes by tenant via X-Tenant-Id. Cross-tenant ids
 * return 404 — per feedback_no_stubs_real_wiring we propagate the error
 * rather than fabricating a placeholder shape.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type { Placement, PlacementState } from './wbl-detail.model';

/** Snake-case backend envelope mirroring wblPlacementDTO() in
 *  services/chora-delivery/internal/adapter/http/wbl_handler.go. */
interface BackendPlacement {
  readonly id: string;
  readonly tenant_id: string;
  readonly gcid: string;
  readonly course_id: string;
  readonly host_org_name: string;
  readonly supervisor_name: string;
  readonly supervisor_email: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly hours_required: number;
  readonly hours_completed: number;
  readonly state: string;
  /** Omitted by BE when empty — defaults to '' on the FE model. */
  readonly evaluator_notes?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Patch shape for `update()` — mirrors patchWblPlacementReq in
 * wbl_handler.go. Both fields are optional; only the supplied ones are
 * forwarded so an empty patch is a no-op-shaped (but still valid) PATCH.
 */
export interface PatchPlacementRequest {
  readonly hoursCompleted?: number;
  readonly evaluatorNotes?: string;
}

@Injectable({ providedIn: 'root' })
export class WblDetailService {
  private readonly bff = inject(BffClientService);

  /**
   * Fetch a single placement by id. The BE handler 404s when the id is
   * unknown OR when it belongs to a different tenant (cross-tenant
   * isolation). 4xx/5xx propagate to the caller so the component can
   * render a fail-loud error state with retry — per
   * feedback_no_stubs_real_wiring.
   */
  get(id: string): Observable<Placement> {
    return this.bff
      .get<BackendPlacement>(
        `/api/v1/wbl-placements/${encodeURIComponent(id)}`,
      )
      .pipe(map(mapBackendPlacement));
  }

  /**
   * Partial update — scoped to hours_completed + evaluator_notes (the BE
   * handler's patchWblPlacementReq shape). Only the supplied fields are
   * forwarded on the wire (the snake-case keys are omitted otherwise so
   * the BE's `*int` / `*string` pointers stay nil). The BE enforces:
   *   - hoursCompleted in [0, hoursRequired]   (409 ErrHoursExceedsRequired)
   *   - evaluatorNotes ≤ MaxEvaluatorNotesLen (4000)  (400)
   *   - placement not closed                    (409 ErrPlacementClosed)
   * Returns the updated placement so the caller can refresh in-place.
   */
  update(id: string, patch: PatchPlacementRequest): Observable<Placement> {
    const body: Record<string, unknown> = {};
    if (patch.hoursCompleted !== undefined) {
      body['hours_completed'] = patch.hoursCompleted;
    }
    if (patch.evaluatorNotes !== undefined) {
      body['evaluator_notes'] = patch.evaluatorNotes;
    }
    return this.bff
      .patch<BackendPlacement>(
        `/api/v1/wbl-placements/${encodeURIComponent(id)}`,
        body,
      )
      .pipe(map(mapBackendPlacement));
  }

  /**
   * Soft-delete a placement. The BE handler maps DELETE → `Withdraw()`
   * on the aggregate (state transitions to WITHDRAWN; the row is NOT
   * removed). Returns the updated placement so the caller can refresh
   * its local view.
   */
  withdraw(id: string): Observable<Placement> {
    return this.bff
      .delete<BackendPlacement>(
        `/api/v1/wbl-placements/${encodeURIComponent(id)}`,
      )
      .pipe(map(mapBackendPlacement));
  }
}

function mapBackendPlacement(p: BackendPlacement): Placement {
  return {
    id: p.id,
    tenantId: p.tenant_id,
    gcid: p.gcid,
    courseId: p.course_id,
    hostOrgName: p.host_org_name,
    supervisorName: p.supervisor_name,
    supervisorEmail: p.supervisor_email,
    startDate: p.start_date,
    endDate: p.end_date,
    hoursRequired: p.hours_required,
    hoursCompleted: p.hours_completed,
    state: p.state as PlacementState,
    evaluatorNotes: p.evaluator_notes ?? '',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}
