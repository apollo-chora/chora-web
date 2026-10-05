/**
 * TenantMembersService — R+ Phase X.4 member picker (ADR-155 D9).
 *
 * Sole provider for the member-picker chip-input search-as-you-type.
 * Calls the real BFF route `/api/v1/admin/tenant-members?q=…` per
 * `chora-contracts/openapi/identity-admin.yaml#searchTenantMembers`.
 *
 * The service stays strict on the 3-char minimum: anything shorter
 * rolls state back to idle and emits NO HTTP call. Debounce lives in
 * the component (a 300ms RxJS pipe per X.4 brief).
 *
 * Fail-loud per memory `feedback_no_stubs_real_wiring` — error states
 * surface via the discriminated AsyncState union; the component
 * renders the i18n `rplus.member_picker.error` banner with retry CTA.
 */
import { Injectable, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../../core/services/bff-client.service';
import type {
  MemberSearchState,
  TenantMemberSearchResponse,
} from './assessment-instantiation.model';

/** Minimum query length per X.4 brief (≥3 chars triggers search). */
const MIN_QUERY_CHARS = 3;

@Injectable({ providedIn: 'root' })
export class TenantMembersService {
  private readonly bff = inject(BffClientService);

  private readonly _searchState = signal<MemberSearchState>({ status: 'idle' });
  readonly searchState = this._searchState.asReadonly();

  /**
   * Search active tenant members by free-text query. ≥3 chars required
   * (sub-min queries reset to idle, no HTTP call). Idempotent — repeat
   * calls override in-flight state.
   */
  search(query: string): void {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_CHARS) {
      this._searchState.set({ status: 'idle' });
      return;
    }
    this._searchState.set({ status: 'loading' });
    const params = new HttpParams().set('q', trimmed);
    this.bff
      .get<TenantMemberSearchResponse>(
        '/api/v1/admin/tenant-members',
        params,
      )
      .pipe(
        take(1),
        map(
          (body): MemberSearchState => ({
            status: 'success',
            items: body.items,
          }),
        ),
        catchError(() =>
          of<MemberSearchState>({
            status: 'error',
            error: 'rplus.member_picker.error',
          }),
        ),
      )
      .subscribe((s) => this._searchState.set(s));
  }

  /** Reset to idle — collapses the dropdown without an in-flight call. */
  clear(): void {
    this._searchState.set({ status: 'idle' });
  }
}
