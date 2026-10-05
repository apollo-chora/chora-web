/**
 * WblService — R+ /r/wbl Work-Based Learning placements admin BFF wiring
 * (real, no stubs).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService. The
 * service surfaces five operations against the chora-gateway BFF, which
 * proxies verbatim to chora-delivery's wbl_handler.go:
 *
 *   1. list(filters?)         — GET /api/v1/wbl-placements[?state=...]
 *   2. get(id)                — GET /api/v1/wbl-placements/{id}
 *   3. create(req)            — POST /api/v1/wbl-placements
 *   4. update(id, patch)      — PATCH /api/v1/wbl-placements/{id}
 *   5. withdraw(id)           — DELETE /api/v1/wbl-placements/{id}
 *                                (soft delete — backend transitions to WITHDRAWN)
 *
 * Tenant + GCID are resolved off the validated mesh claims the chora-gateway
 * BFF stamps (RequireChoraSessionJWT). Per ddd-enforcement §multi-tenant
 * the BE handler scopes the list to the caller tenant via X-Tenant-Id; no
 * explicit tenant_id param is sent on the wire.
 *
 * Per feedback_no_stubs_real_wiring an empty backend list ⇒ empty FE list
 * (component renders the empty state). No inline fixtures.
 *
 * Wave-2a gateway proxy wiring landed in chora-gateway commit `c924152e`
 * (/api/v1/wbl-placements + /api/v1/wbl-placements/ subtree both proxy
 * to chora-delivery wblRootHandler / wblSubHandler).
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import type {
  Placement,
  PlacementState,
  PlacementsList,
} from './wbl.model';

/** Snake-case backend envelope mirroring wblPlacementDTO() in
 *  services/chora-delivery/internal/adapter/http/wbl_handler.go. */
interface BackendPlacement {
  readonly id: string;
  readonly tenant_id: string;
  readonly gcid: string;
  readonly course_id: string;
  /** CHO-2335: resolved display fields, omitted by the BE when unresolved. */
  readonly learner_name?: string;
  readonly course_title?: string;
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

interface BackendPlacementsList {
  readonly items: readonly BackendPlacement[];
}

/** Filters accepted by `list()`. Mirrors the BE handler's `state` query
 *  param (default = all states except WITHDRAWN per soft-delete pattern). */
export interface PlacementsListFilters {
  readonly state?: PlacementState;
}

/** Request shape for `create()` — mirrors createWblPlacementReq in BE. */
export interface CreatePlacementRequest {
  readonly gcid: string;
  readonly courseId: string;
  readonly hostOrgName: string;
  readonly supervisorName: string;
  readonly supervisorEmail: string;
  /** ISO8601 / RFC3339 date string. */
  readonly startDate: string;
  /** ISO8601 / RFC3339 date string. */
  readonly endDate: string;
  readonly hoursRequired: number;
}

/** Patch shape for `update()` — mirrors patchWblPlacementReq in BE. Both
 *  fields are optional; only the supplied ones are forwarded. */
export interface PatchPlacementRequest {
  readonly hoursCompleted?: number;
  readonly evaluatorNotes?: string;
}

@Injectable({ providedIn: 'root' })
export class WblService {
  private readonly bff = inject(BffClientService);
  private readonly tenants = inject(TenantContextService);

  /**
   * List placements for the current tenant. Optional `state` filter
   * narrows the projection at the wire — the backend scopes the list
   * by tenant via the validated mesh claims, so no tenant param is sent.
   */
  list(filters?: PlacementsListFilters): Observable<PlacementsList> {
    let params = new HttpParams();
    if (filters?.state) {
      params = params.set('state', filters.state);
    }
    const hasParams = params.keys().length > 0;
    return this.bff
      .get<BackendPlacementsList>(
        '/api/v1/wbl-placements',
        hasParams ? params : undefined,
      )
      .pipe(
        map((resp) => ({
          tenantName: this.tenants.currentTenant()?.name ?? 'Current tenant',
          totalPlacements: resp.items.length,
          items: resp.items.map(mapBackendPlacement),
        })),
      );
  }

  /**
   * Fetch a single placement by id. The BE handler 404s when the id is
   * unknown OR when it belongs to a different tenant (cross-tenant
   * isolation). Per feedback_no_stubs_real_wiring we propagate the error
   * to the caller rather than fabricating a placeholder shape.
   */
  get(id: string): Observable<Placement> {
    return this.bff
      .get<BackendPlacement>(`/api/v1/wbl-placements/${encodeURIComponent(id)}`)
      .pipe(map(mapBackendPlacement));
  }

  /**
   * Create a new placement. The BE constructor defaults state to SCHEDULED
   * + validates every required field (returns 400 on invariant violation).
   */
  create(req: CreatePlacementRequest): Observable<Placement> {
    return this.bff
      .post<BackendPlacement>('/api/v1/wbl-placements', {
        gcid: req.gcid,
        course_id: req.courseId,
        host_org_name: req.hostOrgName,
        supervisor_name: req.supervisorName,
        supervisor_email: req.supervisorEmail,
        start_date: toRfc3339StartOfDayUtc(req.startDate),
        end_date: toRfc3339StartOfDayUtc(req.endDate),
        hours_required: req.hoursRequired,
      })
      .pipe(map(mapBackendPlacement));
  }

  /**
   * Partial update — currently scoped to hours_completed + evaluator_notes
   * (BE handler's patchWblPlacementReq shape). The BE enforces invariants:
   *   - hoursCompleted in [0, hoursRequired]
   *   - evaluatorNotes ≤ MaxEvaluatorNotesLen (4000)
   *   - placement not closed (returns 409 CONFLICT when COMPLETED/WITHDRAWN)
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
   * removed). The handler stamps `[WITHDRAWN] DELETE /api/v1/wbl-placements`
   * into evaluator_notes for audit. Returns the updated placement so the
   * caller can refresh its local view.
   */
  withdraw(id: string): Observable<Placement> {
    return this.bff
      .delete<BackendPlacement>(
        `/api/v1/wbl-placements/${encodeURIComponent(id)}`,
      )
      .pipe(map(mapBackendPlacement));
  }
}

/** Matches a bare calendar date with no time component (`YYYY-MM-DD`),
 *  exactly the value an HTML5 `<input type="date">` yields. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Widen a date value to an RFC3339 datetime the chora-delivery WBL handler
 * accepts. The handler (`wbl_handler.go` createWblPlacementReq) decodes
 * `start_date`/`end_date` into Go `time.Time`, which requires the full
 * RFC3339 layout (`2006-01-02T15:04:05Z07:00`) — a bare `YYYY-MM-DD` from
 * `<input type="date">` fails with `cannot parse "" as "T"` (HTTP 400).
 *
 * - A date-only value is widened to start-of-day UTC (`T00:00:00Z`). The
 *   domain (`wbl/placement.go` NewPlacement) only enforces
 *   `end_date >= start_date`, with no end-of-day semantics, so start-of-day
 *   is correct for BOTH endpoints.
 * - A value already carrying a time component (RFC3339) is passed through
 *   verbatim — never double-encoded.
 */
function toRfc3339StartOfDayUtc(value: string): string {
  return DATE_ONLY_RE.test(value) ? `${value}T00:00:00Z` : value;
}

/**
 * Map a snake-case backend envelope into the typed Placement model.
 * `evaluator_notes` defaults to '' when omitted by the BE (it strips
 * the field from the JSON when empty per wblPlacementDTO()).
 *
 * The wire `state` is widened to a known FSM value via narrowing; an
 * unknown value falls through as-is and the type guard in the model
 * catches it at the consumer boundary. We accept the cast here so the
 * mapper stays a pure shape translation — validation is the caller's
 * concern.
 */
function mapBackendPlacement(p: BackendPlacement): Placement {
  return {
    id: p.id,
    tenantId: p.tenant_id,
    gcid: p.gcid,
    // CHO-2335: resolved display fields ride alongside the raw ids; absent ⇒
    // undefined, so the view falls back to gcid / courseId.
    learnerName: p.learner_name,
    courseId: p.course_id,
    courseTitle: p.course_title,
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
