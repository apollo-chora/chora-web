/**
 * AccountLifecycleService — REST adapter for admin account management +
 * the account-closure saga triggers (CHO-1719, ADR-181 D5).
 *
 * Source of truth: chora-contracts/openapi/identity-admin.yaml (admin account CRUD) +
 * chora-contracts/openapi/auth-gateway.yaml v1.1 (Closure tag).
 * All HTTP calls go through BffClientService.
 *
 * Endpoints:
 *   GET    /api/v1/admin/accounts                           — list accounts
 *   POST   /api/v1/admin/accounts/{gcid}/suspend            — suspend account
 *   POST   /api/v1/admin/accounts/{gcid}/reactivate         — reactivate account
 *   POST   /api/v1/admin/accounts/{gcid}/close              — OPERATOR close (PLATFORM_OPERATOR; fast_close)
 *   GET    /api/v1/admin/accounts/{gcid}/lifecycle-events    — lifecycle event log
 *   POST   /api/v1/me/account/close                          — SELF-close (session-derived identity)
 *   POST   /api/v1/me/account/close/cancel                   — cancel own saga (grace window)
 *   GET    /api/v1/me/account/closure?closure_id={id}        — own saga status
 *
 * Self-close vs operator close: self-close MUST use the me-route — the
 * gateway derives gcid + tenant_id from the session JWT and rejects
 * fast_close. The admin route is PLATFORM_OPERATOR-only and 403s otherwise.
 * The close 202 echoes `saga_id`; persist it — the status/cancel routes are
 * closure_id-keyed (the closure orchestrator has no by-gcid lookup).
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AdminAccountListResponse,
  LifecycleEventListResponse,
  SuspendAccountRequest,
  AdminCloseAccountRequest,
  AccountState,
} from '../models/account-lifecycle.model';

const ADMIN_ACCOUNTS_PATH = '/api/v1/admin/accounts';
const ME_ACCOUNT_PATH = '/api/v1/me/account';

// ---------------------------------------------------------------------------
// Closure saga types (auth-gateway.yaml ClosureStatusResponse)
// ---------------------------------------------------------------------------

export type ClosureSagaState =
  | 'active'
  | 'closing'
  | 'suspended'
  | 'pseudonymized'
  | 'cold_archived'
  | 'crypto_shredded'
  | 'cancelled';

export interface ClosureDomainAck {
  domain: string;
  acked_at?: string;
}

export interface ClosureHistoryEntry {
  prior_state?: string;
  new_state?: string;
  reason?: string;
  actor_gcid?: string;
  transitioned_at?: string;
}

export interface ClosureStatusResponse {
  /** Persist client-side — keys the status/cancel routes. */
  saga_id: string;
  gcid: string;
  state: ClosureSagaState;
  grace_ends_at?: string;
  requested_at?: string;
  cancelled_at?: string;
  history?: ClosureHistoryEntry[];
  domain_acks?: ClosureDomainAck[];
}

@Injectable({ providedIn: 'root' })
export class AccountLifecycleService {
  private readonly bff = inject(BffClientService);

  // -------------------------------------------------------------------------
  // Account Listing
  // -------------------------------------------------------------------------

  /**
   * List tenant accounts with optional state filter and search.
   * GET /api/v1/admin/accounts?page={page}&pageSize={pageSize}&state={state}&search={search}
   */
  getAccounts(
    page = 1,
    pageSize = 25,
    state?: AccountState,
    search?: string,
  ): Observable<AdminAccountListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (state) {
      params = params.set('state', state);
    }
    if (search) {
      params = params.set('search', search);
    }

    return this.bff.get<AdminAccountListResponse>(ADMIN_ACCOUNTS_PATH, params);
  }

  // -------------------------------------------------------------------------
  // Account Actions
  // -------------------------------------------------------------------------

  /**
   * Suspend an account.
   * POST /api/v1/admin/accounts/{gcid}/suspend
   */
  suspendAccount(request: SuspendAccountRequest): Observable<void> {
    return this.bff.post<void>(
      `${ADMIN_ACCOUNTS_PATH}/${encodeURIComponent(request.gcid)}/suspend`,
      { reason: request.reason },
    );
  }

  /**
   * Reactivate a suspended account.
   * POST /api/v1/admin/accounts/{gcid}/reactivate
   */
  reactivateAccount(gcid: string): Observable<void> {
    return this.bff.post<void>(
      `${ADMIN_ACCOUNTS_PATH}/${encodeURIComponent(gcid)}/reactivate`,
      {},
    );
  }

  /**
   * OPERATOR close of an arbitrary account (with mandatory reason).
   * POST /api/v1/admin/accounts/{gcid}/close
   *
   * PLATFORM_OPERATOR-only (ADR-165) — the gateway 403s other roles.
   * `fastClose` collapses the grace window for designated TEST accounts
   * (ADR-181 D5); it is only honoured on this route, never on self-close.
   * NOT for closing your own account — use closeOwnAccount().
   */
  closeAccount(
    request: AdminCloseAccountRequest,
    options?: { fastClose?: boolean },
  ): Observable<ClosureStatusResponse> {
    const body: Record<string, unknown> = { reason: request.reason };
    if (options?.fastClose) {
      body['fast_close'] = true;
    }
    return this.bff.post<ClosureStatusResponse>(
      `${ADMIN_ACCOUNTS_PATH}/${encodeURIComponent(request.gcid)}/close`,
      body,
    );
  }

  // -------------------------------------------------------------------------
  // Self-service closure saga (me-routes — CHO-1719, ADR-181 D5)
  // -------------------------------------------------------------------------

  /**
   * Close the CALLER's own account (starts the federated closure saga:
   * grace window → pseudonymise fan-out → cold archive → crypto-shred;
   * never a hard delete).
   * POST /api/v1/me/account/close
   *
   * Identity (gcid + tenant_id) derives from the session JWT at the
   * gateway — never sent in the body. The 202 echoes `saga_id`: persist it
   * for cancelOwnClosure / getOwnClosureStatus.
   */
  closeOwnAccount(reason?: string): Observable<ClosureStatusResponse> {
    const body: Record<string, unknown> = {};
    if (reason !== undefined) {
      body['reason'] = reason;
    }
    return this.bff.post<ClosureStatusResponse>(
      `${ME_ACCOUNT_PATH}/close`,
      body,
    );
  }

  /**
   * Cancel the caller's own closure saga during the grace window.
   * POST /api/v1/me/account/close/cancel
   *
   * 404 when the closure_id is unknown OR belongs to another account
   * (no existence oracle); 409 once past the grace window
   * (CLOSURE_CANCEL_TOO_LATE).
   */
  cancelOwnClosure(
    closureId: string,
    reason?: string,
  ): Observable<ClosureStatusResponse> {
    const body: Record<string, unknown> = { closure_id: closureId };
    if (reason !== undefined) {
      body['reason'] = reason;
    }
    return this.bff.post<ClosureStatusResponse>(
      `${ME_ACCOUNT_PATH}/close/cancel`,
      body,
    );
  }

  /**
   * Read the caller's own closure saga status.
   * GET /api/v1/me/account/closure?closure_id={id}
   */
  getOwnClosureStatus(closureId: string): Observable<ClosureStatusResponse> {
    const params = new HttpParams().set('closure_id', closureId);
    return this.bff.get<ClosureStatusResponse>(
      `${ME_ACCOUNT_PATH}/closure`,
      params,
    );
  }

  // -------------------------------------------------------------------------
  // Lifecycle Events
  // -------------------------------------------------------------------------

  /**
   * Get lifecycle event log for a specific account.
   * GET /api/v1/admin/accounts/{gcid}/lifecycle-events?page={page}&pageSize={pageSize}
   */
  getLifecycleEvents(
    gcid: string,
    page = 1,
    pageSize = 50,
  ): Observable<LifecycleEventListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    return this.bff.get<LifecycleEventListResponse>(
      `${ADMIN_ACCOUNTS_PATH}/${encodeURIComponent(gcid)}/lifecycle-events`,
      params,
    );
  }
}
