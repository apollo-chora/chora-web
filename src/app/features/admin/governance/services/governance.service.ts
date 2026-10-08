/**
 * GovernanceService — REST adapter for the governance admin workspace.
 *
 * Source of truth: chora-contracts/openapi/governance-admin.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  Restriction,
  Appeal,
  KYCVerification,
  ContentModerationAction,
  RestrictionTier,
  RestrictionListState,
  AppealListState,
  KYCListState,
  ModerationLogState,
} from '../models/governance.model';

// ---------------------------------------------------------------------------
// Endpoint Paths
// ---------------------------------------------------------------------------

const RESTRICTIONS_PATH = '/api/v1/governance/restrictions';
const APPEALS_PATH = '/api/v1/governance/appeals';
const KYC_PATH = '/api/v1/governance/kyc';
const MODERATION_PATH = '/api/v1/governance/moderation';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class GovernanceService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _restrictionState = signal<RestrictionListState>({ status: 'idle' });
  readonly restrictionState = this._restrictionState.asReadonly();

  private readonly _appealState = signal<AppealListState>({ status: 'idle' });
  readonly appealState = this._appealState.asReadonly();

  private readonly _kycState = signal<KYCListState>({ status: 'idle' });
  readonly kycState = this._kycState.asReadonly();

  private readonly _moderationState = signal<ModerationLogState>({ status: 'idle' });
  readonly moderationState = this._moderationState.asReadonly();

  // --- Computed ---
  readonly restrictions = computed(() => {
    const s = this._restrictionState();
    return s.status === 'success' ? s.data : [];
  });

  readonly appeals = computed(() => {
    const s = this._appealState();
    return s.status === 'success' ? s.data : [];
  });

  readonly pendingAppeals = computed(() =>
    this.appeals().filter((a) => a.status === 'pending'),
  );

  readonly kycVerifications = computed(() => {
    const s = this._kycState();
    return s.status === 'success' ? s.data : [];
  });

  readonly moderationActions = computed(() => {
    const s = this._moderationState();
    return s.status === 'success' ? s.data : [];
  });

  // ---------------------------------------------------------------------------
  // Restrictions
  // ---------------------------------------------------------------------------

  loadRestrictions(): Observable<Restriction[] | null> {
    this._restrictionState.set({ status: 'loading' });

    return this.bff.get<Restriction[]>(RESTRICTIONS_PATH).pipe(
      tap((data) => {
        this._restrictionState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._restrictionState.set({
          status: 'error',
          error: { code: 'RESTRICTIONS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  applyRestriction(data: {
    target_gcid: string;
    tier: RestrictionTier;
    reason: string;
  }): Observable<Restriction | null> {
    return this.bff.post<Restriction>(RESTRICTIONS_PATH, data).pipe(
      tap(() => {
        // Reload restrictions to get updated list
        this.loadRestrictions().subscribe();
      }),
      catchError((_err: Error) => {
        return of(null);
      }),
    );
  }

  liftRestriction(id: string): Observable<void | null> {
    return this.bff.delete<void>(`${RESTRICTIONS_PATH}/${encodeURIComponent(id)}`).pipe(
      tap(() => {
        this.loadRestrictions().subscribe();
      }),
      catchError((_err: Error) => {
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Appeals
  // ---------------------------------------------------------------------------

  loadAppeals(): Observable<Appeal[] | null> {
    this._appealState.set({ status: 'loading' });

    return this.bff.get<Appeal[]>(APPEALS_PATH).pipe(
      tap((data) => {
        this._appealState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._appealState.set({
          status: 'error',
          error: { code: 'APPEALS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  reviewAppeal(
    id: string,
    decision: { status: 'approved' | 'denied'; reviewer_notes: string },
  ): Observable<Appeal | null> {
    return this.bff.put<Appeal>(
      `${APPEALS_PATH}/${encodeURIComponent(id)}`,
      decision,
    ).pipe(
      tap(() => {
        this.loadAppeals().subscribe();
      }),
      catchError((_err: Error) => {
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // KYC Verifications
  // ---------------------------------------------------------------------------

  loadKYCVerifications(): Observable<KYCVerification[] | null> {
    this._kycState.set({ status: 'loading' });

    return this.bff.get<KYCVerification[]>(KYC_PATH).pipe(
      tap((data) => {
        this._kycState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._kycState.set({
          status: 'error',
          error: { code: 'KYC_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  reviewKYC(
    id: string,
    decision: { status: 'verified' | 'failed' },
  ): Observable<KYCVerification | null> {
    return this.bff.put<KYCVerification>(
      `${KYC_PATH}/${encodeURIComponent(id)}`,
      decision,
    ).pipe(
      tap(() => {
        this.loadKYCVerifications().subscribe();
      }),
      catchError((_err: Error) => {
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Moderation Log
  // ---------------------------------------------------------------------------

  loadModerationLog(): Observable<ContentModerationAction[] | null> {
    this._moderationState.set({ status: 'loading' });

    return this.bff.get<ContentModerationAction[]>(MODERATION_PATH).pipe(
      tap((data) => {
        this._moderationState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._moderationState.set({
          status: 'error',
          error: { code: 'MODERATION_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }
}
