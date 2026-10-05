/**
 * DashboardLayoutService - the A+ "My Knowledge" dashboard's consumer of the
 * surface-agnostic PreferenceLayoutEngine (core/services/preference-layout),
 * promoted in Track B H1 (ADR-240 D3).
 *
 * This file owns only the A+ specifics:
 *   - HttpDashboardLayoutPort: the BFF adapter for the `dashboard_layout` key
 *     (GET /api/me/preferences, PUT /api/me/preferences/dashboard-layout), with
 *     the snake_case <-> camelCase wire mapping and the shared retry/classify.
 *   - The DASHBOARD_LAYOUT_* injection seams (port, clock, online, sync queue).
 *   - DashboardLayoutService: wires the engine with the GCID-scoped storage key,
 *     the total `reconcileOrder` guard + DEFAULT_ORDER, the 'dashboard-layout'
 *     forensic log label, and the LAYOUT_SYNC_FAILED_KEY toast.
 *
 * The local-first render, debounced save, connectivity-at-dispatch dispatch, LWW
 * reconcile, typed honest-failure handling (CHO-2190), syncState, and edge-
 * triggered toast are ALL inherited from the engine, unchanged in behaviour.
 *
 * NOTE (open question, unchanged from SP2): the offline path references a future
 * `SyncQueueService` that does not exist yet. Rather than ship a stub, the
 * offline enqueue is an OPTIONAL injected seam (DASHBOARD_LAYOUT_SYNC_QUEUE,
 * default null). Absent a queue, offline durability is still guaranteed by the
 * local-first write + LWW-on-next-load.
 */
import { DestroyRef, Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PreferenceLayoutEngine } from '../../../../core/services/preference-layout/preference-layout.engine';
import {
  classify,
  retryTransient,
  type LayoutSyncState,
  type PreferenceLayoutSyncQueue,
} from '../../../../core/services/preference-layout/preference-layout.model';
import {
  DEFAULT_ORDER,
  reconcileOrder,
  type DashboardLayout,
  type DashboardLayoutPort,
  type LayoutFetchResult,
  type LayoutSaveResult,
  type WrapperKey,
} from './dashboard-layout.model';

// Re-export so existing consumers keep importing LayoutSyncState from here.
export type { LayoutSyncState };

/** localStorage key prefix - one entry per GCID (or "anon" when signed out). */
const STORAGE_PREFIX = 'chora.dashboard-layout.';

/** i18n key for the non-blocking "your layout is on this device only" toast. */
export const LAYOUT_SYNC_FAILED_KEY = 'aplus.dashboard.layout_sync_failed';

/** A+ offline enqueue seam (WrapperKey specialisation of the generic queue). */
export type DashboardLayoutSyncQueue = PreferenceLayoutSyncQueue<WrapperKey>;

interface MePreferencesResponse {
  dashboard_layout?: { order?: unknown; updated_at?: unknown } | null;
}

/**
 * Default HTTP adapter for the layout port. Reads/writes the GCID-scoped UI
 * preference via the BFF. Neither call throws into the render path, and neither
 * lies: a failure comes back as an explicit `{ ok: false, failure }` outcome
 * instead of as null (read leg) or undefined (write leg). See the port doc in
 * `core/services/preference-layout/preference-layout.model.ts` for why the
 * SHAPE, not the adapter, was the CHO-2176 bug.
 */
@Injectable({ providedIn: 'root' })
export class HttpDashboardLayoutPort implements DashboardLayoutPort {
  private readonly bff = inject(BffClientService);
  private static readonly PREFS_PATH = '/api/me/preferences';
  private static readonly SAVE_PATH = '/api/me/preferences/dashboard-layout';

  fetch(): Observable<LayoutFetchResult> {
    return this.bff
      .get<MePreferencesResponse>(HttpDashboardLayoutPort.PREFS_PATH)
      .pipe(
        retryTransient(),
        map((res): LayoutFetchResult => {
          const dl = res?.dashboard_layout;
          if (!dl || !Array.isArray(dl.order)) {
            // We reached the server and it genuinely holds no layout. That is an
            // UNSET preference, not a failure.
            return { ok: true, layout: null };
          }
          return {
            ok: true,
            layout: {
              order: dl.order as WrapperKey[],
              updatedAt: typeof dl.updated_at === 'string' ? dl.updated_at : '',
            },
          };
        }),
        catchError((err: unknown) =>
          of<LayoutFetchResult>({ ok: false, failure: classify(err) }),
        ),
      );
  }

  save(layout: DashboardLayout): Observable<LayoutSaveResult> {
    return this.bff
      .put<void>(HttpDashboardLayoutPort.SAVE_PATH, {
        order: layout.order,
        updated_at: layout.updatedAt,
      })
      .pipe(
        retryTransient(),
        map((): LayoutSaveResult => ({ ok: true })),
        catchError((err: unknown) =>
          of<LayoutSaveResult>({ ok: false, failure: classify(err) }),
        ),
      );
  }
}

/** The layout port - defaults to the HTTP adapter; overridable in specs. */
export const DASHBOARD_LAYOUT_PORT = new InjectionToken<DashboardLayoutPort>(
  'DASHBOARD_LAYOUT_PORT',
  { providedIn: 'root', factory: () => inject(HttpDashboardLayoutPort) },
);

/** ISO-8601 clock - injected so specs are deterministic. */
export const DASHBOARD_LAYOUT_CLOCK = new InjectionToken<() => string>(
  'DASHBOARD_LAYOUT_CLOCK',
  { providedIn: 'root', factory: () => (): string => new Date().toISOString() },
);

/** Connectivity probe - injected so specs can force the offline branch. */
export const DASHBOARD_LAYOUT_ONLINE = new InjectionToken<() => boolean>(
  'DASHBOARD_LAYOUT_ONLINE',
  {
    providedIn: 'root',
    factory:
      () =>
      (): boolean =>
        typeof navigator !== 'undefined' ? navigator.onLine : true,
  },
);

/** Optional offline enqueue seam - default null (no queue wired yet). */
export const DASHBOARD_LAYOUT_SYNC_QUEUE =
  new InjectionToken<DashboardLayoutSyncQueue | null>(
    'DASHBOARD_LAYOUT_SYNC_QUEUE',
    { providedIn: 'root', factory: () => null },
  );

/**
 * A+ dashboard layout service: a thin consumer of the surface-agnostic
 * PreferenceLayoutEngine. It wires the A+ specifics and re-exposes the engine's
 * signals; all behaviour is inherited from the engine (ADR-240 D3, Track B H1).
 */
@Injectable({ providedIn: 'root' })
export class DashboardLayoutService {
  private readonly auth = inject(AuthService);

  private readonly engine = new PreferenceLayoutEngine<WrapperKey>({
    port: inject(DASHBOARD_LAYOUT_PORT),
    clock: inject(DASHBOARD_LAYOUT_CLOCK),
    online: inject(DASHBOARD_LAYOUT_ONLINE),
    queue: inject(DASHBOARD_LAYOUT_SYNC_QUEUE),
    toast: inject(ToastService),
    destroyRef: inject(DestroyRef),
    storageKey: () => STORAGE_PREFIX + (this.auth.gcid() ?? 'anon'),
    reconcile: (candidate) => reconcileOrder(candidate),
    defaultOrder: () => [...DEFAULT_ORDER],
    logLabel: 'dashboard-layout',
    toastKey: LAYOUT_SYNC_FAILED_KEY,
  });

  /** Instant, local-first order - reconciled against DEFAULT_ORDER on init. */
  readonly order = this.engine.order;

  /** Server-sync health. Observability only; it never gates the render. */
  readonly syncState = this.engine.syncState;

  /**
   * Apply a drag reorder: reconciled, persisted local-first with a fresh
   * `updatedAt`, and a debounced best-effort server save whose failure is
   * reported (not swallowed).
   */
  reorder(next: readonly WrapperKey[]): void {
    this.engine.reorder(next);
  }

  /** Reconcile the local order against the server copy, Last-Write-Wins. */
  load(): void {
    this.engine.load();
  }
}
