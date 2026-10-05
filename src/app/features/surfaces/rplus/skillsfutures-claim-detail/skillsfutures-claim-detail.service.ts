/**
 * SkillsFuturesClaimDetailService — R+ Wave-5 drill-down BFF wiring.
 *
 * Real BFF wiring (per `feedback_no_stubs_real_wiring`) for the SSG
 * funding-claim detail view:
 *
 *   - get(id)              — GET  /api/v1/skillsfutures-claims/{id}
 *   - approve(id, amount)  — POST /api/v1/skillsfutures-claims/{id}/approve
 *   - reject(id, reason)   — POST /api/v1/skillsfutures-claims/{id}/reject
 *
 * Tenant + GCID are resolved off the validated mesh claims the chora-
 * gateway BFF stamps (RequireChoraSessionJWT); the downstream chora-
 * delivery handler scopes by tenant + gcid via X-Tenant-Id + gcid.
 * Cross-tenant / cross-learner ids return 404 — per
 * feedback_no_stubs_real_wiring we propagate the error rather than
 * fabricating a placeholder shape.
 *
 * Approve/Reject endpoints require training-admin / admin role (403
 * otherwise); the FE surfaces these as a fail-loud i18n message.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  SkillsFuturesClaim,
  SkillsFuturesClaimState,
} from './skillsfutures-claim-detail.model';

/**
 * BackendSkillsFuturesClaim mirrors the snake_case wire envelope emitted
 * by services/chora-delivery/internal/adapter/http/skillsfutures_handler.go
 * ::skillsFuturesClaimDTO. Optional fields land only after the
 * corresponding lifecycle transition.
 */
interface BackendSkillsFuturesClaim {
  readonly id: string;
  readonly tenant_id: string;
  readonly gcid: string;
  readonly course_id: string;
  readonly nric_hash: string;
  readonly requested_amount_sgd_cents: number;
  readonly approved_amount_sgd_cents: number;
  readonly state: SkillsFuturesClaimState;
  readonly submitted_at: string;
  readonly decided_at?: string;
  readonly decided_by_gcid?: string;
  readonly rejection_reason?: string;
}

@Injectable({ providedIn: 'root' })
export class SkillsFuturesClaimDetailService {
  private readonly bff = inject(BffClientService);

  /**
   * Fetch a single SkillsFutures claim by id. Returns 404 when the id
   * is unknown OR belongs to a different tenant / different learner
   * (without admin role). Errors propagate to the component.
   */
  get(claimId: string): Observable<SkillsFuturesClaim> {
    return this.bff
      .get<BackendSkillsFuturesClaim>(
        `/api/v1/skillsfutures-claims/${encodeURIComponent(claimId)}`,
      )
      .pipe(map(mapBackendClaim));
  }

  /**
   * Training-admin decision: APPROVE the given claim with the explicit
   * `approvedAmountSGDCents` (must be in `[0, requested_amount]`).
   * Mirrors the list-service `approve()` shape so the BE contract stays
   * stable across list + detail callers.
   */
  approve(
    claimId: string,
    approvedAmountSGDCents: number,
  ): Observable<SkillsFuturesClaim> {
    return this.bff
      .post<BackendSkillsFuturesClaim>(
        `/api/v1/skillsfutures-claims/${encodeURIComponent(claimId)}/approve`,
        { approved_amount_sgd_cents: approvedAmountSGDCents },
      )
      .pipe(map(mapBackendClaim));
  }

  /**
   * Training-admin decision: REJECT the given claim with an actionable
   * rejection_reason (must be non-empty after trim).
   */
  reject(
    claimId: string,
    rejectionReason: string,
  ): Observable<SkillsFuturesClaim> {
    return this.bff
      .post<BackendSkillsFuturesClaim>(
        `/api/v1/skillsfutures-claims/${encodeURIComponent(claimId)}/reject`,
        { rejection_reason: rejectionReason },
      )
      .pipe(map(mapBackendClaim));
  }
}

function mapBackendClaim(c: BackendSkillsFuturesClaim): SkillsFuturesClaim {
  return {
    id: c.id,
    tenantId: c.tenant_id,
    gcid: c.gcid,
    courseId: c.course_id,
    nricHash: c.nric_hash,
    requestedAmountSGDCents: c.requested_amount_sgd_cents,
    approvedAmountSGDCents: c.approved_amount_sgd_cents,
    state: c.state,
    submittedAt: c.submitted_at,
    decidedAt: c.decided_at ?? null,
    decidedByGCID: c.decided_by_gcid ?? null,
    rejectionReason: c.rejection_reason ?? null,
  };
}
