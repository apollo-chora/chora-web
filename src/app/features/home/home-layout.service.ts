/**
 * HomeLayoutService - the shell /home launcher's consumer of the surface-agnostic
 * PreferenceLayoutEngine (core/services/preference-layout), ADR-240 Track B H3.
 *
 * A thin consumer, exactly parallel to the A+ DashboardLayoutService, over the
 * SAME backbone but the home's own seams:
 *   - key + path: the `home_layout` preference (D2), a SEPARATE key from
 *     `dashboard_layout` (never overloaded). GET /api/me/preferences (shared),
 *     PUT /api/me/preferences/home-layout (new). The wire field is `pins`
 *     (D2); the engine's generic field is `order`, so HttpHomeLayoutPort maps
 *     `pins` <-> `order` on both legs.
 *   - reconcile: `reconcilePins` keyed on HOME_PIN_IDS (D3), the curated-subset
 *     guard (drop unknown, preserve subset, never auto-add, empty stays empty),
 *     NOT the A+ total reconcileOrder.
 *   - default: `defaultPins` derived from the LIVE session (D7), so first run is
 *     never blank. Read at dispatch, never persisted.
 *
 * All persistence behaviour (local-first render, debounced save, LWW, the typed
 * honest-failure port, syncState, edge-triggered toast, retry) is inherited from
 * the engine. Pin ids are add-on / capability filtered at RENDER by the
 * HomeComponent via `home-pin.filter`, never here and never at reconcile, so a
 * lost capability hides a pin but never deletes it from the persisted layout (D4).
 */
import { DestroyRef, Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { BffClientService } from '../../core/services/bff-client.service';
import { AuthService } from '../../core/auth/auth.service';
import { TenantContextService } from '../../core/auth/tenant-context.service';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { RbacService } from '../../core/services/rbac.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { PreferenceLayoutEngine } from '../../core/services/preference-layout/preference-layout.engine';
import {
  classify,
  retryTransient,
  type LayoutSyncState,
  type PreferenceFetchResult,
  type PreferenceLayout,
  type PreferenceLayoutPort,
  type PreferenceLayoutSyncQueue,
  type PreferenceSaveResult,
} from '../../core/services/preference-layout/preference-layout.model';
import { HOME_PIN_IDS, type HomePin } from './home-pin.registry';
import { reconcilePins } from './home-pin.reconcile';
import { defaultPins, type HomePinFilterInputs } from './home-pin.filter';

// Re-export so consumers keep one import site.
export type { LayoutSyncState };

/** localStorage key prefix - one entry per GCID (or "anon" when signed out). */
const STORAGE_PREFIX = 'chora.home-layout.';

/** i18n key for the non-blocking "your home is on this device only" toast. */
export const HOME_LAYOUT_SYNC_FAILED_KEY = 'home.layout_sync_failed';

/** Home offline enqueue seam (HomePin specialisation of the generic queue). */
export type HomeLayoutSyncQueue = PreferenceLayoutSyncQueue<HomePin>;

interface MePreferencesResponse {
  home_layout?: { pins?: unknown; updated_at?: unknown } | null;
}

/**
 * Default HTTP adapter for the home layout port. Reads/writes the GCID-scoped
 * `home_layout` UI preference via the BFF. Neither call throws into the render
 * path; a failure comes back as an explicit `{ ok: false, failure }` outcome
 * (CHO-2190). The wire carries `pins` (D2); the engine domain carries `order`,
 * so this adapter is the only place the two names meet.
 */
@Injectable({ providedIn: 'root' })
export class HttpHomeLayoutPort implements PreferenceLayoutPort<HomePin> {
  private readonly bff = inject(BffClientService);
  private static readonly PREFS_PATH = '/api/me/preferences';
  private static readonly SAVE_PATH = '/api/me/preferences/home-layout';

  fetch(): Observable<PreferenceFetchResult<HomePin>> {
    return this.bff
      .get<MePreferencesResponse>(HttpHomeLayoutPort.PREFS_PATH)
      .pipe(
        retryTransient(),
        map((res): PreferenceFetchResult<HomePin> => {
          const hl = res?.home_layout;
          if (!hl || !Array.isArray(hl.pins)) {
            // Reached the server and it genuinely holds no home layout: UNSET,
            // not a failure.
            return { ok: true, layout: null };
          }
          return {
            ok: true,
            layout: {
              order: hl.pins as HomePin[],
              updatedAt: typeof hl.updated_at === 'string' ? hl.updated_at : '',
            },
          };
        }),
        catchError((err: unknown) =>
          of<PreferenceFetchResult<HomePin>>({ ok: false, failure: classify(err) }),
        ),
      );
  }

  save(layout: PreferenceLayout<HomePin>): Observable<PreferenceSaveResult> {
    return this.bff
      .put<void>(HttpHomeLayoutPort.SAVE_PATH, {
        pins: layout.order,
        updated_at: layout.updatedAt,
      })
      .pipe(
        retryTransient(),
        map((): PreferenceSaveResult => ({ ok: true })),
        catchError((err: unknown) =>
          of<PreferenceSaveResult>({ ok: false, failure: classify(err) }),
        ),
      );
  }
}

/** The home layout port - defaults to the HTTP adapter; overridable in specs. */
export const HOME_LAYOUT_PORT = new InjectionToken<PreferenceLayoutPort<HomePin>>(
  'HOME_LAYOUT_PORT',
  { providedIn: 'root', factory: () => inject(HttpHomeLayoutPort) },
);

/** ISO-8601 clock - injected so specs are deterministic. */
export const HOME_LAYOUT_CLOCK = new InjectionToken<() => string>(
  'HOME_LAYOUT_CLOCK',
  { providedIn: 'root', factory: () => (): string => new Date().toISOString() },
);

/** Connectivity probe - injected so specs can force the offline branch. */
export const HOME_LAYOUT_ONLINE = new InjectionToken<() => boolean>(
  'HOME_LAYOUT_ONLINE',
  {
    providedIn: 'root',
    factory:
      () =>
      (): boolean =>
        typeof navigator !== 'undefined' ? navigator.onLine : true,
  },
);

/** Optional offline enqueue seam - default null (no queue wired yet). */
export const HOME_LAYOUT_SYNC_QUEUE = new InjectionToken<HomeLayoutSyncQueue | null>(
  'HOME_LAYOUT_SYNC_QUEUE',
  { providedIn: 'root', factory: () => null },
);

/**
 * The shell /home launcher layout service: a thin consumer of the shared
 * PreferenceLayoutEngine that re-exposes the engine's signals and adds the
 * home's pin/unpin affordances. All persistence behaviour is inherited from the
 * engine (ADR-240 D3, Track B H3).
 */
@Injectable({ providedIn: 'root' })
export class HomeLayoutService {
  private readonly auth = inject(AuthService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly flags = inject(FeatureFlagService);
  private readonly rbac = inject(RbacService);

  private readonly engine = new PreferenceLayoutEngine<HomePin>({
    port: inject(HOME_LAYOUT_PORT),
    clock: inject(HOME_LAYOUT_CLOCK),
    online: inject(HOME_LAYOUT_ONLINE),
    queue: inject(HOME_LAYOUT_SYNC_QUEUE),
    toast: inject(ToastService),
    destroyRef: inject(DestroyRef),
    storageKey: () => STORAGE_PREFIX + (this.auth.gcid() ?? 'anon'),
    reconcile: (candidate) => reconcilePins(candidate, HOME_PIN_IDS),
    defaultOrder: () => defaultPins(this.filterInputs()),
    logLabel: 'home-layout',
    toastKey: HOME_LAYOUT_SYNC_FAILED_KEY,
  });

  /** Instant, local-first pinned set (reconciled + seeded with defaults on init). */
  readonly pins = this.engine.order;

  /** Server-sync health. Observability only; it never gates the render. */
  readonly syncState = this.engine.syncState;

  /** Reconcile the local home against the server copy, Last-Write-Wins. */
  load(): void {
    this.engine.load();
  }

  /** Persist a reordered pin list (a drag settled). */
  reorder(next: readonly HomePin[]): void {
    this.engine.reorder(next);
  }

  /**
   * Pin a registry entry by id. Idempotent: an already-pinned id is a no-op (the
   * reconcile also dedupes, but skipping the write avoids a pointless save).
   */
  pin(id: string): void {
    if (this.pins().some((p) => p.id === id)) {
      return;
    }
    this.engine.reorder([...this.pins(), { id }]);
  }

  /** Unpin by id. Removing the last pin is a legitimate empty home (D7). */
  unpin(id: string): void {
    this.engine.reorder(this.pins().filter((p) => p.id !== id));
  }

  /**
   * The live session inputs for the pin filter + defaults. `onEmpty: 'open-all'`
   * because /home is pure navigation like the surface rail: a session with no
   * usable `surfaces[]` still sees pins (then add-on / capability filtered),
   * rather than being stranded, which D1 forbids for the launcher.
   */
  filterInputs(): HomePinFilterInputs {
    return {
      active: this.tenantContext.currentTenant(),
      memberships: this.tenantContext.availableTenants(),
      flags: this.flags,
      rbac: this.rbac,
      onEmpty: 'open-all',
    };
  }
}
