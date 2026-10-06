/**
 * ApplicationsAdminDetailService — R+ Wave-5 drill-down BFF wiring.
 *
 * Real BFF wiring (per `feedback_no_stubs_real_wiring`) for the admin-
 * side Course Application detail:
 *
 *   - get(id) — GET /api/v1/applications/{id}
 *
 * The downstream handler
 * (`chora-delivery/.../applications_admin_handler.go::handleApplicationsAdminDetail`)
 * is GET-only — the queue surface is read-only. Approve/Reject/Offer
 * transitions live on the learner-side `/v1/me/applications/{id}/*`
 * endpoints and are NOT exposed here.
 *
 * On 4xx/5xx the Observable errors propagate to the component — per
 * feedback_no_stubs_real_wiring we never fabricate a placeholder detail.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  type ApplicationDetail,
  type ApplicationFundingLine,
  type ApplicationHistoryEntry,
  normaliseApplicationStatus,
} from './applications-admin-detail.model';

/**
 * Mirror of the canonical backend applicationDetailDTO emitted by
 * `services/chora-delivery/internal/adapter/http/applications.go`.
 * Optional fields stay optional — the backend omits them when the
 * underlying domain field is the zero value.
 */
interface BackendApplicationDetail {
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
  readonly history?: readonly {
    readonly from: string;
    readonly to: string;
    readonly at: string;
    readonly reason?: string;
  }[];
  readonly funding_lines?: readonly {
    readonly source: string;
    readonly amount_sgd_cents: number;
    readonly reference?: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class ApplicationsAdminDetailService {
  private readonly bff = inject(BffClientService);

  /**
   * Fetch a single application's full admin-view detail (incl. history
   * + optional funding_lines). Cross-tenant ids return 404 — propagated
   * unchanged so the component can render fail-loud with a Retry CTA.
   */
  get(applicationId: string): Observable<ApplicationDetail> {
    return this.bff
      .get<BackendApplicationDetail>(
        `/api/v1/applications/${encodeURIComponent(applicationId)}`,
      )
      .pipe(map(mapBackendDetail));
  }
}

function mapBackendDetail(
  row: BackendApplicationDetail,
): ApplicationDetail {
  const history: readonly ApplicationHistoryEntry[] = (row.history ?? []).map(
    (h) => ({
      from: h.from,
      to: h.to,
      at: h.at,
      reason: h.reason ?? null,
    }),
  );
  const fundingLines: readonly ApplicationFundingLine[] = (
    row.funding_lines ?? []
  ).map((f) => ({
    source: f.source,
    amountSgdCents: f.amount_sgd_cents,
    reference: f.reference ?? null,
  }));
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
    history,
    fundingLines,
  };
}
