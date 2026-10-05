/**
 * FamiliarService — A+ Familiar profile provider (F5 un-mock 2026-06-02).
 *
 * Wired through `BffClientService` per chora-web/CLAUDE.md §3. The wave-3
 * Phyllis/Eira fixture (`EIRA_PROFILE`) is DELETED — no stubs, no
 * synthesized data (per [[no-stubs-real-wiring]]).
 *
 * `loadProfile(familiarId)` calls the real BFF route
 *   GET /api/v1/me/familiars/{id}
 * which the chora-gateway maps to chora-consumption's
 * `getFamiliarInstance` (`GET /v1/me/familiars/{id}` —
 * `services/chora-consumption/internal/adapter/http/
 * familiar_instance_handlers.go`). That handler returns the UNWRAPPED
 * `FamiliarInstanceResponse` (NOT the `{data:T}` BFF envelope the
 * ADR-149 growth subpaths use — confirmed: `writeJSON(w, ...,
 * toInstanceResp(inst))`), so we read the raw camelCased shape directly.
 *
 * Identity fields are always present; `growthState` / `cosmetic` /
 * `memorySummary` are OPTIONAL enrichment (a parallel BE round adds them
 * to the per-instance GET — they're already documented optional on the
 * `FamiliarInstanceResponse` schema). Absent enrichment is NOT an error;
 * the component renders graceful empty states. Transport / 4xx / 5xx ARE
 * fail-loud — surfaced via a `FamiliarProfileState.error` i18n key.
 *
 * `getMyFamiliars()` (roster list/picker) still delegates to the
 * canonical `FamiliarGrowthService.listMyFamiliars()` single source of
 * truth — unchanged.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import type { FamiliarSummary } from '../../../../core/familiar/familiar-growth.model';
import type {
  FamiliarProfile,
  FamiliarProfileState,
} from './familiar.model';

@Injectable({ providedIn: 'root' })
export class FamiliarService {
  private readonly bff = inject(BffClientService);
  private readonly growth = inject(FamiliarGrowthService);

  private readonly _state = signal<FamiliarProfileState>({ status: 'loading' });
  /** Fail-loud discriminated-union state for the profile view. */
  readonly state = this._state.asReadonly();

  /** Convenience selector: the loaded profile when success, else undefined. */
  readonly profile = computed<FamiliarProfile | undefined>(() => {
    const s = this._state();
    return s.status === 'success' ? s.profile : undefined;
  });

  /**
   * Fetch one Familiar instance and publish to `state`. Called by the
   * component (route param) + the retry CTA. Idempotent — safe to call
   * repeatedly; each call resets to `loading` first.
   */
  loadProfile(familiarId: string): void {
    this._state.set({ status: 'loading' });
    this.bff
      .get<FamiliarProfile>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}`,
      )
      .pipe(
        take(1),
        map(
          (profile): FamiliarProfileState => ({
            status: 'success',
            // The wire is keyed `companionId` (ADR-254 D9); the profile
            // model keeps `familiarId`. Meet them here, falling back to the
            // id we asked for, so the Grimoire loadout binding never
            // receives '' and parks in `loading` without ever calling.
            profile: {
              ...profile,
              familiarId: profile.familiarId || profile.companionId || familiarId,
            },
          }),
        ),
        catchError((err: unknown) =>
          of<FamiliarProfileState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._state.set(s));
  }

  /**
   * Phase N — Familiar roster list/picker. Delegates to the canonical
   * `FamiliarGrowthService.listMyFamiliars()` which consumes the real
   * `GET /api/v1/me/familiars` envelope `{items: [FamiliarInstanceWire]}`
   * and maps wire fields → FamiliarSummary. Single source of truth so the
   * dashboard mascot strip (via ActiveFamiliarService) and this landing
   * view see the same data.
   */
  getMyFamiliars(): Observable<readonly FamiliarSummary[]> {
    return this.growth.listMyFamiliars();
  }

  /** Translate an HTTP failure into an i18n error key (never a raw body). */
  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.familiar.error_not_found';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.familiar.error_unauthorised';
      }
      if (e.status >= 500) return 'aplus.familiar.error_upstream';
    }
    return 'aplus.familiar.error_generic';
  }
}
