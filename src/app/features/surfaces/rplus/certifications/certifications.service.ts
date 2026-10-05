/**
 * CertificationsService — R+ /r/certifications BFF wiring (real, no stubs).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService. The
 * service surfaces three operations:
 *
 *   1. list(filters?)       — GET /api/v1/certifications[?learner_gcid=...&course_id=...]
 *   2. issue(req)           — POST /api/certifications (LEGACY path — orchestrator
 *                              wires the v1/ POST route in a later iteration)
 *   3. revoke(certId)       — DELETE /api/certifications/{id}
 *
 * Tenant + GCID are resolved off the validated mesh claims the chora-gateway
 * BFF stamps (RequireChoraSessionJWT). The downstream chora-delivery
 * handler scopes the list to the tenant via X-Tenant-Id; no explicit
 * tenant_id param is sent on the wire.
 *
 * NOTE: the revoke method is provided so the FE button has a real callable
 * — the orchestrator may add a backend DELETE handler in a follow-on iter.
 * Until then the call will 404/405; per feedback_no_stubs_real_wiring we
 * fail-loud rather than fake an in-memory revoke.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import type {
  Certification,
  CertificationList,
  CertificationStatus,
} from './certifications.model';

interface BackendCertification {
  readonly id: string;
  readonly tenant_id: string;
  readonly learner_gcid: string;
  readonly course_id: string;
  readonly accomplishments?: readonly string[];
  readonly hash: string;
  readonly issued_at: string;
  /** Future-proof — backend may add `revoked_at` later (DDD-aggregate skill §11
   *  AtomRevision append-only — revoke = state flag, not row delete). */
  readonly revoked_at?: string | null;
}

interface BackendCertificationList {
  readonly items: readonly BackendCertification[];
}

export interface CertificationsListFilters {
  readonly learnerGcid?: string;
  readonly courseId?: string;
}

export interface IssueCertificationRequest {
  readonly learnerGcid: string;
  readonly courseId: string;
  readonly accomplishments: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class CertificationsService {
  private readonly bff = inject(BffClientService);
  private readonly tenants = inject(TenantContextService);

  /**
   * List issued certifications for the current tenant. Optional filters
   * narrow the projection at the wire — the backend already scopes the
   * list by tenant via the validated mesh claims (X-Tenant-Id), so no
   * tenant param is sent.
   */
  list(filters?: CertificationsListFilters): Observable<CertificationList> {
    let params = new HttpParams();
    if (filters?.learnerGcid) {
      params = params.set('learner_gcid', filters.learnerGcid);
    }
    if (filters?.courseId) {
      params = params.set('course_id', filters.courseId);
    }
    const hasParams = params.keys().length > 0;
    return this.bff
      .get<BackendCertificationList>(
        '/api/v1/certifications',
        hasParams ? params : undefined,
      )
      .pipe(
        map((resp) => ({
          tenantName:
            this.tenants.currentTenant()?.name ?? 'Current tenant',
          totalCertifications: resp.items.length,
          items: resp.items.map(mapBackendCertification),
        })),
      );
  }

  /**
   * Issue a new certification. The legacy POST /api/certifications endpoint
   * (chora-delivery handlers.go::certificationsHandler) accepts the snake-
   * case `issueCertReq` payload + emits chora.delivery.certification.issued.v1.
   */
  issue(req: IssueCertificationRequest): Observable<Certification> {
    return this.bff
      .post<BackendCertification>('/api/certifications', {
        learner_gcid: req.learnerGcid,
        course_id: req.courseId,
        accomplishments: req.accomplishments,
      })
      .pipe(map(mapBackendCertification));
  }

  /**
   * Revoke a certification. Per .claude/rules/ddd-enforcement.md §4
   * Certifications are append-only — the backend handler implements
   * revoke as a soft state-flag write, NOT a hard delete. The HTTP verb
   * stays DELETE for REST conformance (the response shape is empty).
   *
   * If the backend hasn't shipped the DELETE handler yet the call will
   * 404/405 — per feedback_no_stubs_real_wiring we fail-loud here rather
   * than fake an in-memory revoke.
   */
  revoke(certId: string): Observable<void> {
    return this.bff
      .delete<void>(`/api/certifications/${encodeURIComponent(certId)}`)
      .pipe(map(() => undefined));
  }
}

function mapBackendCertification(c: BackendCertification): Certification {
  const status: CertificationStatus = c.revoked_at ? 'Revoked' : 'Active';
  return {
    id: c.id,
    tenantId: c.tenant_id,
    learnerGcid: c.learner_gcid,
    courseId: c.course_id,
    accomplishments: c.accomplishments ?? [],
    hash: c.hash,
    issuedAt: c.issued_at,
    status,
  };
}
