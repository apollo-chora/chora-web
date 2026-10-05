/**
 * A2AConsentService — manages learner A2A consent grants via BFF.
 *
 * Handles consent lifecycle: granting, revoking, modifying scope,
 * and fetching activity logs.
 *
 * @see docs/design/ux_a2a_protocol.md
 * @see .claude/skills/coding-angular/SKILL.md (HTTP & API Client Patterns)
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import {
  A2AConsent,
  A2AActivityEntry,
  A2ATask,
  ConsentGrantRequest,
  ConsentScopeModification,
  AsyncState,
} from '../../admin/a2a/models/a2a.model';

@Injectable({ providedIn: 'root' })
export class A2AConsentService {
  private readonly bff = inject(BffClientService);

  // ---------------------------------------------------------------------------
  // State signals
  // ---------------------------------------------------------------------------

  /** Active grants state */
  readonly grantsState = signal<AsyncState<A2AConsent[]>>({ status: 'loading' });

  /** Activity log for a specific grant */
  readonly activityLogState = signal<AsyncState<A2AActivityEntry[]>>({ status: 'loading' });

  /** Active A2A tasks (for activity indicator) */
  readonly activeTasksState = signal<AsyncState<A2ATask[]>>({ status: 'loading' });

  /** Submitting state for consent operations */
  readonly isSubmitting = signal(false);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  readonly grants = computed(() => {
    const s = this.grantsState();
    return s.status === 'success' ? s.data : [];
  });

  readonly activeGrants = computed(() =>
    this.grants().filter((g) => g.revokedAt === null),
  );

  readonly activeTasks = computed(() => {
    const s = this.activeTasksState();
    return s.status === 'success' ? s.data.filter((t) => t.status === 'active') : [];
  });

  readonly hasActiveA2ASession = computed(() => this.activeTasks().length > 0);

  readonly activityLog = computed(() => {
    const s = this.activityLogState();
    return s.status === 'success' ? s.data : [];
  });

  // ---------------------------------------------------------------------------
  // Grant management
  // ---------------------------------------------------------------------------

  getActiveGrants(): Observable<A2AConsent[]> {
    this.grantsState.set({ status: 'loading' });
    return this.bff.get<A2AConsent[]>('/api/v1/a2a/consents').pipe(
      tap((data) => this.grantsState.set({ status: 'success', data })),
      catchError((err: Error) => {
        this.grantsState.set({ status: 'error', error: err.message });
        return of([]);
      }),
    );
  }

  grantConsent(request: ConsentGrantRequest): Observable<A2AConsent | null> {
    this.isSubmitting.set(true);
    return this.bff.post<A2AConsent>('/api/v1/a2a/consents', request).pipe(
      tap((consent) => {
        this.isSubmitting.set(false);
        const current = this.grantsState();
        if (current.status === 'success') {
          this.grantsState.set({ status: 'success', data: [...current.data, consent] });
        }
      }),
      catchError((_err: Error) => {
        this.isSubmitting.set(false);
        return of(null);
      }),
    );
  }

  revokeConsent(consentId: string): Observable<A2AConsent | null> {
    this.isSubmitting.set(true);
    return this.bff.post<A2AConsent>(`/api/v1/a2a/consents/${consentId}/revoke`, {}).pipe(
      tap((consent) => {
        this.isSubmitting.set(false);
        this.updateConsentInList(consent);
      }),
      catchError((_err: Error) => {
        this.isSubmitting.set(false);
        return of(null);
      }),
    );
  }

  modifyScope(modification: ConsentScopeModification): Observable<A2AConsent | null> {
    this.isSubmitting.set(true);
    return this.bff.put<A2AConsent>(
      `/api/v1/a2a/consents/${modification.consentId}/scope`,
      modification,
    ).pipe(
      tap((consent) => {
        this.isSubmitting.set(false);
        this.updateConsentInList(consent);
      }),
      catchError((_err: Error) => {
        this.isSubmitting.set(false);
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Activity log
  // ---------------------------------------------------------------------------

  getActivityLog(consentId: string): Observable<A2AActivityEntry[]> {
    this.activityLogState.set({ status: 'loading' });
    return this.bff.get<A2AActivityEntry[]>(`/api/v1/a2a/consents/${consentId}/activity`).pipe(
      tap((data) => this.activityLogState.set({ status: 'success', data })),
      catchError((err: Error) => {
        this.activityLogState.set({ status: 'error', error: err.message });
        return of([]);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Active tasks (for activity indicator)
  // ---------------------------------------------------------------------------

  getActiveTasks(): Observable<A2ATask[]> {
    this.activeTasksState.set({ status: 'loading' });
    return this.bff.get<A2ATask[]>('/api/v1/a2a/tasks/active').pipe(
      tap((data) => this.activeTasksState.set({ status: 'success', data })),
      catchError((err: Error) => {
        this.activeTasksState.set({ status: 'error', error: err.message });
        return of([]);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private updateConsentInList(updated: A2AConsent): void {
    const current = this.grantsState();
    if (current.status === 'success') {
      this.grantsState.set({
        status: 'success',
        data: current.data.map((c) => (c.id === updated.id ? updated : c)),
      });
    }
  }
}
