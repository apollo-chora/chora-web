/**
 * ParentService — REST adapter for guardian links, parent dashboards,
 * activity digests, digest preferences, and progress alerts.
 *
 * Source of truth: chora-contracts/openapi/parent.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  GuardianLink,
  GuardianLinkList,
  CreateGuardianLinkRequest,
  ParentDashboard,
  ActivityDigestList,
  DigestPreference,
  UpdateDigestPreferencesRequest,
  ProgressAlertList,
  GuardianLinkListState,
  ParentDashboardState,
  ActivityDigestListState,
  DigestPreferenceState,
  ProgressAlertListState,
} from '../models/parent.model';

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const LINKS_PATH = '/api/v1/parent/links';
const DASHBOARD_PATH = '/api/v1/parent/dashboard';
const DIGESTS_PATH = '/api/v1/parent/digests';
const DIGEST_PREFERENCES_PATH = '/api/v1/parent/digests/preferences';
const ALERTS_PATH = '/api/v1/parent/alerts';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class ParentService {
  private readonly bff = inject(BffClientService);

  // --- Signal state (private + readonly) ---
  private readonly _linkState = signal<GuardianLinkListState>({ status: 'idle' });
  readonly linkState = this._linkState.asReadonly();

  private readonly _dashboardState = signal<ParentDashboardState>({ status: 'idle' });
  readonly dashboardState = this._dashboardState.asReadonly();

  private readonly _digestState = signal<ActivityDigestListState>({ status: 'idle' });
  readonly digestState = this._digestState.asReadonly();

  private readonly _preferenceState = signal<DigestPreferenceState>({ status: 'idle' });
  readonly preferenceState = this._preferenceState.asReadonly();

  private readonly _alertState = signal<ProgressAlertListState>({ status: 'idle' });
  readonly alertState = this._alertState.asReadonly();

  // --- Computed ---
  readonly guardianLinks = computed(() => {
    const s = this._linkState();
    return s.status === 'success' ? s.links : [];
  });

  readonly activeLinks = computed(() =>
    this.guardianLinks().filter((link) => link.status === 'active'),
  );

  readonly pendingLinks = computed(() =>
    this.guardianLinks().filter((link) => link.status === 'pending'),
  );

  readonly dashboard = computed(() => {
    const s = this._dashboardState();
    return s.status === 'success' ? s.data : null;
  });

  readonly digests = computed(() => {
    const s = this._digestState();
    return s.status === 'success' ? s.digests : [];
  });

  readonly preference = computed(() => {
    const s = this._preferenceState();
    return s.status === 'success' ? s.data : null;
  });

  readonly alerts = computed(() => {
    const s = this._alertState();
    return s.status === 'success' ? s.alerts : [];
  });

  readonly unresolvedAlerts = computed(() =>
    this.alerts().filter((alert) => alert.acknowledged_at === null),
  );

  // -------------------------------------------------------------------------
  // Guardian Link methods
  // -------------------------------------------------------------------------

  loadGuardianLinks(): Observable<GuardianLinkList | null> {
    this._linkState.set({ status: 'loading' });

    return this.bff.get<GuardianLinkList>(LINKS_PATH).pipe(
      tap((result) => {
        this._linkState.set({ status: 'success', links: result.data });
      }),
      catchError((err: Error) => {
        this._linkState.set({
          status: 'error',
          error: { code: 'LINKS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  createGuardianLink(request: CreateGuardianLinkRequest): Observable<GuardianLink | null> {
    return this.bff.post<GuardianLink>(LINKS_PATH, request).pipe(
      tap((created) => {
        const current = this._linkState();
        if (current.status === 'success') {
          this._linkState.set({
            ...current,
            links: [...current.links, created],
          });
        }
      }),
      catchError((err: Error) => {
        this._linkState.set({
          status: 'error',
          error: { code: 'LINK_CREATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  revokeGuardianLink(linkId: string): Observable<void | null> {
    return this.bff.delete<void>(
      `${LINKS_PATH}/${encodeURIComponent(linkId)}`,
    ).pipe(
      tap(() => {
        const current = this._linkState();
        if (current.status === 'success') {
          this._linkState.set({
            ...current,
            links: current.links.filter((link) => link.id !== linkId),
          });
        }
      }),
      catchError((err: Error) => {
        this._linkState.set({
          status: 'error',
          error: { code: 'LINK_REVOKE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Dashboard methods
  // -------------------------------------------------------------------------

  loadDashboard(learnerId: string): Observable<ParentDashboard | null> {
    this._dashboardState.set({ status: 'loading' });

    return this.bff.get<ParentDashboard>(
      `${DASHBOARD_PATH}/${encodeURIComponent(learnerId)}`,
    ).pipe(
      tap((data) => {
        this._dashboardState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._dashboardState.set({
          status: 'error',
          error: { code: 'DASHBOARD_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Activity Digest methods
  // -------------------------------------------------------------------------

  loadDigests(): Observable<ActivityDigestList | null> {
    this._digestState.set({ status: 'loading' });

    return this.bff.get<ActivityDigestList>(DIGESTS_PATH).pipe(
      tap((result) => {
        this._digestState.set({ status: 'success', digests: result.data });
      }),
      catchError((err: Error) => {
        this._digestState.set({
          status: 'error',
          error: { code: 'DIGESTS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Digest Preference methods
  // -------------------------------------------------------------------------

  updateDigestPreferences(
    request: UpdateDigestPreferencesRequest,
  ): Observable<DigestPreference | null> {
    this._preferenceState.set({ status: 'loading' });

    return this.bff.put<DigestPreference>(DIGEST_PREFERENCES_PATH, request).pipe(
      tap((data) => {
        this._preferenceState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._preferenceState.set({
          status: 'error',
          error: { code: 'PREFERENCES_UPDATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Progress Alert methods
  // -------------------------------------------------------------------------

  loadAlerts(): Observable<ProgressAlertList | null> {
    this._alertState.set({ status: 'loading' });

    return this.bff.get<ProgressAlertList>(ALERTS_PATH).pipe(
      tap((result) => {
        this._alertState.set({ status: 'success', alerts: result.data });
      }),
      catchError((err: Error) => {
        this._alertState.set({
          status: 'error',
          error: { code: 'ALERTS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  resetState(): void {
    this._linkState.set({ status: 'idle' });
    this._dashboardState.set({ status: 'idle' });
    this._digestState.set({ status: 'idle' });
    this._preferenceState.set({ status: 'idle' });
    this._alertState.set({ status: 'idle' });
  }
}
