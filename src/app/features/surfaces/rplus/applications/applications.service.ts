/**
 * ApplicationsService — R+ Stage 3 wave 4 (M14 R+ buildout).
 *
 * Real BFF wiring for the training-admin Course Application review
 * queue. Per chora-web/CLAUDE.md §3 all HTTP goes through
 * BffClientService. Calls `GET /api/v1/applications?state=` on
 * chora-gateway which proxies to chora-delivery's
 * `applicationsAdminHandler` (training-admin RBAC enforced
 * downstream via the `x-mesh-user-roles` mesh claim).
 *
 * Backend response shapes:
 *
 *   list  → { items: BackendApplicationRow[], total: number }
 *   detail → BackendApplicationDetail (single row + history[])
 *
 * The downstream filters by the current tenant via the validated
 * mesh claims chora-gateway stamps, so the FE never sends an
 * explicit tenant_id query param. Empty list renders an empty-state
 * in the component.
 *
 * Per feedback_no_stubs_real_wiring: this is real wiring — no
 * fixtures, no in-memory fakes, no demo placeholders. The empty
 * list path is genuine "no applications yet" rather than a faked
 * row.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  type ApplicationQueue,
  type ApplicationRow,
  type ApplicationStateFilter,
  normaliseApplicationStatus,
} from './applications.model';

/**
 * Mirror of the canonical backend applicationDTO emitted by
 * `services/chora-delivery/internal/adapter/http/applications.go`.
 * Optional fields stay optional — the backend omits them when the
 * underlying domain field is the zero value.
 */
interface BackendApplicationRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly course_id: string;
  readonly class_id?: string;
  readonly gcid: string;
  readonly status: string; // lowercase domain form: normalised below
  readonly created_at: string;
  readonly updated_at: string;
  readonly offer_expires_at?: string;
  readonly stripe_payment_intent_id?: string;
  readonly invoice_id?: string;
  readonly rejected_reason?: string;
  readonly withdrawn_reason?: string;
}

interface BackendApplicationList {
  readonly items: readonly BackendApplicationRow[];
  readonly total: number;
}

@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private readonly bff = inject(BffClientService);

  /**
   * Fetch the admin review queue, optionally scoped to a single
   * state. The `ALL` sentinel omits the query param entirely (the
   * backend interprets "no ?state=" as "no filter").
   *
   * Backend route: `GET /api/v1/applications[?state=<wire-form>]`.
   */
  getQueue(filter: ApplicationStateFilter = 'ALL'): Observable<ApplicationQueue> {
    let params: HttpParams | undefined;
    if (filter !== 'ALL') {
      params = new HttpParams().set('state', filter);
    }
    return this.bff
      .get<BackendApplicationList>('/api/v1/applications', params)
      .pipe(
        map((resp) => ({
          filter,
          total: resp.total,
          applications: resp.items.map(mapBackendRow),
        })),
      );
  }

  /**
   * Fetch a single application's full detail (incl. history).
   * Backend route: `GET /api/v1/applications/{id}`.
   *
   * Kept here for the queue drill-down even though the component
   * in this wave doesn't navigate to a detail screen yet — wave 5
   * adds the drawer. Pre-exposing the method keeps the service
   * stable so a follow-on PR ONLY touches the component.
   */
  getDetail(applicationId: string): Observable<ApplicationRow> {
    return this.bff
      .get<BackendApplicationRow>(`/api/v1/applications/${applicationId}`)
      .pipe(map(mapBackendRow));
  }
}

function mapBackendRow(row: BackendApplicationRow): ApplicationRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    courseId: row.course_id,
    classId: row.class_id ?? null,
    gcid: row.gcid,
    state: normaliseApplicationStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    offerExpiresAt: row.offer_expires_at ?? null,
    stripePaymentIntentId: row.stripe_payment_intent_id ?? null,
    invoiceId: row.invoice_id ?? null,
    rejectedReason: row.rejected_reason ?? null,
    withdrawnReason: row.withdrawn_reason ?? null,
  };
}
