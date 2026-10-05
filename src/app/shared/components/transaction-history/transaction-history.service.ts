/**
 * TransactionHistoryService — scope-aware read client for the unified
 * transaction ledger (ADR-205 / CHO-1935 contracts). Wraps BffClientService
 * and derives the REST surface from the explicit scope:
 *   - learner → `/api/v1/me/transactions*`
 *   - tenant / master → `/api/v1/admin/transactions*`
 *
 * The caller's binding identity (learner_gcid / tenant_id) is resolved
 * server-side from the ChoraSession; only the deliberate operator/admin
 * choices (managed_tenant_id, learner_gcid drill) travel as query params.
 *
 * Until the BFF routes land (Wave B / B4) these calls 404 live; the
 * component is exercised against HttpTestingController mocks meanwhile.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, from, map, of, switchMap } from 'rxjs';

import { BffClientService } from '../../../core/services/bff-client.service';
import {
  type ExportJob,
  type ExportResult,
  type ListTransactionsResponse,
  type TransactionDetailResponse,
  type TransactionFilters,
  type TransactionScope,
  type TransactionSummary,
} from './transaction-history.model';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_DETAIL_PAGE_SIZE = 50;

@Injectable({ providedIn: 'root' })
export class TransactionHistoryService {
  private readonly bff = inject(BffClientService);

  /** Base REST path for a scope. Learner gets the self-service surface. */
  private base(scope: TransactionScope): string {
    return scope === 'learner'
      ? '/api/v1/me/transactions'
      : '/api/v1/admin/transactions';
  }

  list(
    scope: TransactionScope,
    filters: TransactionFilters,
    pageToken: string | null,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Observable<ListTransactionsResponse> {
    let params = new HttpParams().set('page_size', String(pageSize));
    if (pageToken) params = params.set('page_token', pageToken);
    params = this.applyFilterParams(params, scope, filters);
    return this.bff.get<ListTransactionsResponse>(this.base(scope), params);
  }

  summary(
    scope: TransactionScope,
    filters: TransactionFilters,
  ): Observable<TransactionSummary> {
    const params = this.applyFilterParams(new HttpParams(), scope, filters);
    return this.bff.get<TransactionSummary>(
      `${this.base(scope)}/summary`,
      params,
    );
  }

  detail(
    scope: TransactionScope,
    ledgerId: string,
    pageToken: string | null = null,
    managedTenantId?: string,
  ): Observable<TransactionDetailResponse> {
    let params = new HttpParams().set(
      'page_size',
      String(DEFAULT_DETAIL_PAGE_SIZE),
    );
    if (pageToken) params = params.set('page_token', pageToken);
    if (scope === 'master' && managedTenantId) {
      params = params.set('managed_tenant_id', managedTenantId);
    }
    return this.bff.get<TransactionDetailResponse>(
      `${this.base(scope)}/${encodeURIComponent(ledgerId)}`,
      params,
    );
  }

  /**
   * Export the filtered set (ADR-205 D5.6). Small/filtered sets stream
   * synchronously (200 → `{ kind:'sync', blob }`, downloaded immediately);
   * large sets are accepted as an async job (202 → `{ kind:'async', job }`)
   * that the caller polls via `exportJobStatus` until `ready` for the signed
   * link. Routed through `getBlobResponse` so authInterceptor attaches the
   * Bearer (ADR-205 D6 — never an anchor href for the BFF call). The 202 body
   * is JSON carried as a Blob; we read + parse it.
   */
  export(
    scope: TransactionScope,
    filters: TransactionFilters,
    format: 'csv' | 'json',
  ): Observable<ExportResult> {
    let params = new HttpParams().set('format', format);
    params = this.applyFilterParams(params, scope, filters);
    return this.bff
      .getBlobResponse(`${this.base(scope)}/export`, params)
      .pipe(
        switchMap((response) => {
          if (response.status === 202) {
            const body = response.body;
            return (body ? from(body.text()) : of('{}')).pipe(
              map((text) => ({
                kind: 'async' as const,
                job: JSON.parse(text) as ExportJob,
              })),
            );
          }
          return of({ kind: 'sync' as const, blob: response.body as Blob });
        }),
      );
  }

  /**
   * Poll an async export job for its terminal status + signed download URL
   * (ADR-205 D5.6 — `GET {base}/export/jobs/{job_id}`). Authorised to the
   * caller's own jobs (operator may poll any franchisee's job at admin scope).
   */
  exportJobStatus(
    scope: TransactionScope,
    jobId: string,
  ): Observable<ExportJob> {
    return this.bff.get<ExportJob>(
      `${this.base(scope)}/export/jobs/${encodeURIComponent(jobId)}`,
    );
  }

  /** Shared filter → query-param mapping, scope-gated. */
  private applyFilterParams(
    params: HttpParams,
    scope: TransactionScope,
    f: TransactionFilters,
  ): HttpParams {
    let out = params;
    if (f.kind) out = out.set('kind', f.kind);
    if (f.status && f.status !== 'all') out = out.set('status', f.status);
    if (f.from) out = out.set('from', f.from);
    if (f.to) out = out.set('to', f.to);
    if (f.sort) out = out.set('sort', f.sort);
    // Franchisee selector is a MASTER-only narrowing — one repeated
    // `managed_tenant_id` param per selected id (multiple values = OR;
    // a single value stays back-compatible with the old single-select wire).
    if (scope === 'master' && f.managed_tenant_ids?.length) {
      for (const id of f.managed_tenant_ids) {
        out = out.append('managed_tenant_id', id);
      }
    }
    // Learner drill is admin-only (learner scope is already one learner) — one
    // repeated `learner_gcid` param per selected id.
    if (scope !== 'learner' && f.learner_gcids?.length) {
      for (const id of f.learner_gcids) {
        out = out.append('learner_gcid', id);
      }
    }
    return out;
  }
}
