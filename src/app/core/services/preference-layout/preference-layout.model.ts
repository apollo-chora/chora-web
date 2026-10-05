/**
 * Generic local-first layout-persistence backbone (ADR-240 D3, Track B H1).
 *
 * This is the surface-agnostic core promoted out of the A+ dashboard's
 * DashboardLayoutService (SP2.1 / CHO-2190). A "layout" is an ordered list of
 * items plus an ISO-8601 `updatedAt` Last-Write-Wins key. The backbone owns
 * local-first render, debounced save, connectivity-evaluated-at-dispatch
 * dispatch, LWW reconcile, a typed honest-failure port, and edge-triggered
 * failure reporting (see `preference-layout.engine.ts`).
 *
 * What it deliberately does NOT own is the reconcile guard. Per ADR-240 D3 the
 * A+ reconcile (reconcileOrder: total over a fixed key set, refills empty with a
 * default) and the future /home reconcile (reconcilePins: a curated subset where
 * empty is a legitimate empty home) cannot share one function, so reconcile is
 * INJECTED per consumer and the engine bakes no reconcile semantics.
 *
 * `order` is the generic field name for "the ordered list this preference
 * stores": for A+ it is the wrapper order, for /home it will be the pinned entry
 * ids. Wire-level field naming (e.g. `pins` for /home per ADR-240 D2) lives in
 * each consumer's port adapter, not here.
 */
import { retry, throwError, timer } from 'rxjs';
import type { MonoTypeOperatorFunction, Observable } from 'rxjs';

import { httpErrorView } from '../../interceptors/api-error.model';

/**
 * The persisted unit. `updatedAt` (ISO-8601) is the Last-Write-Wins conflict
 * key: the newer `updatedAt` between local and server wins on load.
 */
export interface PreferenceLayout<TItem> {
  readonly order: readonly TItem[];
  readonly updatedAt: string;
}

/**
 * Why a failure is TYPED rather than swallowed (CHO-2190, root cause of CHO-2176).
 *
 * The original A+ port could not express failure at all: `fetch` returned a
 * value-or-null and `save` returned void, so a 403 became "the server has no
 * value" on the read leg and SUCCESS on the write leg. A mesh 403 therefore made
 * every server save fail 100% of the time for two months while looking healthy.
 * A signature that cannot say "I broke" forces its adapter to lie. So a read has
 * three outcomes (found, genuinely absent, I broke) and a write has two (saved,
 * I broke), and the port models exactly that.
 *
 * `rejected`    is a 4xx (understood and refused: 403 mesh/RBAC, 401, 404). NOT
 *               transient, never retried, loud immediately.
 * `unavailable` is a 5xx or a network/offline error (status 0). Transient,
 *               retried with bounded backoff, loud only once retries are spent.
 */
export type LayoutFailureKind = 'rejected' | 'unavailable';

export interface LayoutFailure {
  readonly kind: LayoutFailureKind;
  /** HTTP status; 0 when the request never reached a server. */
  readonly status: number;
}

/** found (`layout`), genuinely absent (`layout: null`), or I broke (`ok: false`). */
export type PreferenceFetchResult<TItem> =
  | { readonly ok: true; readonly layout: PreferenceLayout<TItem> | null }
  | { readonly ok: false; readonly failure: LayoutFailure };

/** saved, or I broke. A failed save can never be reported as a bare void. */
export type PreferenceSaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: LayoutFailure };

/**
 * Port seam (implemented by each consumer's HTTP adapter). Neither call throws:
 * each emits exactly one outcome and completes, so a degraded prefs upstream
 * still cannot break the render.
 */
export interface PreferenceLayoutPort<TItem> {
  fetch(): Observable<PreferenceFetchResult<TItem>>;
  save(layout: PreferenceLayout<TItem>): Observable<PreferenceSaveResult>;
}

/** Best-effort offline enqueue seam; the config carries null when none is wired. */
export interface PreferenceLayoutSyncQueue<TItem> {
  enqueue(layout: PreferenceLayout<TItem>): void;
}

/**
 * Whether the SERVER copy is in sync. This never gates the render (the layout
 * draws from the local-first signal regardless); it exists so a 100%-failing
 * preferences endpoint is visible rather than silent. `consecutiveFailures`
 * separates a persistent outage from a single blip.
 */
export type LayoutSyncState =
  | { readonly status: 'ok' }
  | {
      readonly status: 'degraded';
      readonly kind: LayoutFailureKind;
      readonly httpStatus: number;
      readonly consecutiveFailures: number;
    };

/** Bounded transient-retry defaults: 3 retries at 400, 800, 1600 ms. */
export const DEFAULT_SYNC_RETRIES = 3;
export const DEFAULT_SYNC_BACKOFF_MS = 400;

/**
 * A 4xx is a REJECTION (the server understood us and said no): never retried,
 * surfaced now. Everything else (a 5xx, or status 0 when the request never
 * reached a server) is transient.
 */
export function isRejection(status: number): boolean {
  return status >= 400 && status < 500;
}

/** Map an unknown thrown value to a typed LayoutFailure. */
export function classify(err: unknown): LayoutFailure {
  const status = httpErrorView(err)?.status ?? 0;
  const kind: LayoutFailureKind = isRejection(status) ? 'rejected' : 'unavailable';
  return { kind, status };
}

/**
 * Retry TRANSIENT failures with exponential backoff; re-throw a 4xx immediately.
 * BOUNDED, so a persistent outage still terminates and gets reported rather than
 * spinning forever.
 */
export function retryTransient<T>(
  count: number = DEFAULT_SYNC_RETRIES,
  backoffMs: number = DEFAULT_SYNC_BACKOFF_MS,
): MonoTypeOperatorFunction<T> {
  return retry<T>({
    count,
    delay: (err, attempt) => {
      if (isRejection(httpErrorView(err)?.status ?? 0)) {
        return throwError(() => err);
      }
      return timer(backoffMs * 2 ** (attempt - 1));
    },
  });
}
