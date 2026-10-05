/**
 * SkillsFuturesClaimsService — R+ /r/skillsfutures-claims BFF wiring
 * (real, no stubs per feedback_no_stubs_real_wiring).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService. The
 * service surfaces four operations:
 *
 *   1. list(filters?)       — GET /api/v1/skillsfutures-claims[?state=PENDING|...]
 *   2. submit(req)          — POST /api/v1/skillsfutures-claims (learner files
 *                              a PENDING claim; the BFF stamps the gcid header
 *                              from the validated mesh claims)
 *   3. approve(id, cents)   — POST /api/v1/skillsfutures-claims/{id}/approve
 *   4. reject(id, reason)   — POST /api/v1/skillsfutures-claims/{id}/reject
 *
 * Tenant + GCID are resolved off the validated mesh claims the chora-gateway
 * BFF stamps (RequireChoraSessionJWT). The downstream chora-delivery handler
 * scopes the list to the tenant via X-Tenant-Id; no explicit tenant_id is
 * sent on the wire.
 *
 * If the BFF/backend hasn't yet wired the route the call will 404/5xx —
 * per feedback_no_stubs_real_wiring we fail-loud here rather than fake
 * an in-memory result.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import type {
  SkillsFuturesClaim,
  SkillsFuturesClaimList,
  SkillsFuturesClaimState,
} from './skillsfutures-claims.model';

/**
 * BackendSkillsFuturesClaim mirrors the snake_case wire envelope emitted
 * by services/chora-delivery/internal/adapter/http/skillsfutures_handler.go
 * ::skillsFuturesClaimDTO. Optional fields land only after the corresponding
 * lifecycle transition.
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

interface BackendSkillsFuturesClaimList {
  readonly items: readonly BackendSkillsFuturesClaim[];
}

export interface SkillsFuturesClaimsListFilters {
  readonly state?: SkillsFuturesClaimState;
}

export interface SubmitSkillsFuturesClaimRequest {
  readonly courseId: string;
  /** SHA-256 hash of NRIC — caller is responsible for hashing; raw NRIC
   *  is NEVER allowed on the wire. */
  readonly nricHash: string;
  readonly requestedAmountSGDCents: number;
}

@Injectable({ providedIn: 'root' })
export class SkillsFuturesClaimsService {
  private readonly bff = inject(BffClientService);
  private readonly tenants = inject(TenantContextService);

  /**
   * List claims for the current tenant. The optional `state` filter narrows
   * the projection at the wire — the backend already scopes the list by
   * tenant via the validated mesh claims (X-Tenant-Id), so no tenant_id
   * param is sent.
   */
  list(filters?: SkillsFuturesClaimsListFilters): Observable<SkillsFuturesClaimList> {
    let params = new HttpParams();
    if (filters?.state) {
      params = params.set('state', filters.state);
    }
    const hasParams = params.keys().length > 0;
    return this.bff
      .get<BackendSkillsFuturesClaimList>(
        '/api/v1/skillsfutures-claims',
        hasParams ? params : undefined,
      )
      .pipe(
        map((resp) => ({
          tenantName: this.tenants.currentTenant()?.name ?? 'Current tenant',
          totalClaims: resp.items.length,
          items: resp.items.map(mapBackendClaim),
        })),
      );
  }

  /**
   * Submit a fresh PENDING claim. The BFF stamps the learner gcid header
   * from the validated mesh claims — the FE only forwards the body.
   */
  submit(req: SubmitSkillsFuturesClaimRequest): Observable<SkillsFuturesClaim> {
    return this.bff
      .post<BackendSkillsFuturesClaim>('/api/v1/skillsfutures-claims', {
        course_id: req.courseId,
        nric_hash: req.nricHash,
        requested_amount_sgd_cents: req.requestedAmountSGDCents,
      })
      .pipe(map(mapBackendClaim));
  }

  /**
   * Training-admin decision: APPROVE the given claim with the explicit
   * `approvedAmountSGDCents` (must be in `[0, requested_amount]`).
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
