/**
 * A2AService — manages A2A partner administration via BFF.
 *
 * Admin-facing CRUD uses REST via BffClientService (ADR-025).
 *
 * @see docs/design/ux_a2a_protocol.md
 * @see .claude/skills/coding-angular/SKILL.md (HTTP & API Client Patterns)
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  A2APartner,
  PartnerRegistration,
  PartnerSuspension,
  SuspensionHistoryEntry,
  SuspensionImpact,
  AsyncState,
} from '../models/a2a.model';

@Injectable({ providedIn: 'root' })
export class A2AService {
  private readonly bff = inject(BffClientService);

  // ---------------------------------------------------------------------------
  // State signals
  // ---------------------------------------------------------------------------

  /** Partner list state */
  readonly partnersState = signal<AsyncState<A2APartner[]>>({ status: 'loading' });

  /** Single partner detail state */
  readonly partnerDetailState = signal<AsyncState<A2APartner>>({ status: 'loading' });

  /** DNS verification polling state */
  readonly dnsVerificationState = signal<AsyncState<{ verified: boolean }>>({ status: 'loading' });

  /** Suspension impact preview */
  readonly suspensionImpactState = signal<AsyncState<SuspensionImpact>>({ status: 'loading' });

  /** Suspension history */
  readonly suspensionHistoryState = signal<AsyncState<SuspensionHistoryEntry[]>>({ status: 'loading' });

  /** Submitting state for forms */
  readonly isSubmitting = signal(false);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  readonly partners = computed(() => {
    const s = this.partnersState();
    return s.status === 'success' ? s.data : [];
  });

  readonly partnerDetail = computed(() => {
    const s = this.partnerDetailState();
    return s.status === 'success' ? s.data : null;
  });

  // ---------------------------------------------------------------------------
  // Partner CRUD
  // ---------------------------------------------------------------------------

  getPartners(): Observable<A2APartner[]> {
    this.partnersState.set({ status: 'loading' });
    return this.bff.get<A2APartner[]>('/api/v1/a2a/partners').pipe(
      tap((data) => this.partnersState.set({ status: 'success', data })),
      catchError((err: Error) => {
        this.partnersState.set({ status: 'error', error: err.message });
        return of([]);
      }),
    );
  }

  getPartnerDetail(partnerId: string): Observable<A2APartner | null> {
    this.partnerDetailState.set({ status: 'loading' });
    return this.bff.get<A2APartner>(`/api/v1/a2a/partners/${partnerId}`).pipe(
      tap((data) => this.partnerDetailState.set({ status: 'success', data })),
      catchError((err: Error) => {
        this.partnerDetailState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  registerPartner(registration: PartnerRegistration): Observable<A2APartner | null> {
    this.isSubmitting.set(true);
    return this.bff.post<A2APartner>('/api/v1/a2a/partners', registration).pipe(
      tap((partner) => {
        this.isSubmitting.set(false);
        const current = this.partnersState();
        if (current.status === 'success') {
          this.partnersState.set({ status: 'success', data: [...current.data, partner] });
        }
      }),
      catchError((err: Error) => {
        this.isSubmitting.set(false);
        this.partnersState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // DNS Verification
  // ---------------------------------------------------------------------------

  checkDnsVerification(partnerId: string): Observable<{ verified: boolean } | null> {
    this.dnsVerificationState.set({ status: 'loading' });
    return this.bff.get<{ verified: boolean }>(`/api/v1/a2a/partners/${partnerId}/verify-dns`).pipe(
      tap((data) => this.dnsVerificationState.set({ status: 'success', data })),
      catchError((err: Error) => {
        this.dnsVerificationState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Suspension
  // ---------------------------------------------------------------------------

  getSuspensionImpact(partnerId: string): Observable<SuspensionImpact | null> {
    this.suspensionImpactState.set({ status: 'loading' });
    return this.bff.get<SuspensionImpact>(`/api/v1/a2a/partners/${partnerId}/suspension-impact`).pipe(
      tap((data) => this.suspensionImpactState.set({ status: 'success', data })),
      catchError((err: Error) => {
        this.suspensionImpactState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  suspendPartner(partnerId: string, suspension: PartnerSuspension): Observable<A2APartner | null> {
    this.isSubmitting.set(true);
    return this.bff.post<A2APartner>(`/api/v1/a2a/partners/${partnerId}/suspend`, suspension).pipe(
      tap((partner) => {
        this.isSubmitting.set(false);
        this.partnerDetailState.set({ status: 'success', data: partner });
        this.updatePartnerInList(partner);
      }),
      catchError((_err: Error) => {
        this.isSubmitting.set(false);
        return of(null);
      }),
    );
  }

  restorePartner(partnerId: string): Observable<A2APartner | null> {
    this.isSubmitting.set(true);
    return this.bff.post<A2APartner>(`/api/v1/a2a/partners/${partnerId}/restore`, {}).pipe(
      tap((partner) => {
        this.isSubmitting.set(false);
        this.partnerDetailState.set({ status: 'success', data: partner });
        this.updatePartnerInList(partner);
      }),
      catchError((_err: Error) => {
        this.isSubmitting.set(false);
        return of(null);
      }),
    );
  }

  getSuspensionHistory(partnerId: string): Observable<SuspensionHistoryEntry[]> {
    this.suspensionHistoryState.set({ status: 'loading' });
    return this.bff.get<SuspensionHistoryEntry[]>(`/api/v1/a2a/partners/${partnerId}/suspension-history`).pipe(
      tap((data) => this.suspensionHistoryState.set({ status: 'success', data })),
      catchError((err: Error) => {
        this.suspensionHistoryState.set({ status: 'error', error: err.message });
        return of([]);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private updatePartnerInList(updated: A2APartner): void {
    const current = this.partnersState();
    if (current.status === 'success') {
      this.partnersState.set({
        status: 'success',
        data: current.data.map((p) => (p.id === updated.id ? updated : p)),
      });
    }
  }
}
