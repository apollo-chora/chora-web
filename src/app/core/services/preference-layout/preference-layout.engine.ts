/**
 * PreferenceLayoutEngine - the generic local-first persistence backbone behind a
 * drag-reorderable, GCID-scoped UI-preference layout (ADR-240 D3, Track B H1).
 *
 * Promoted verbatim in behaviour out of the A+ DashboardLayoutService so the
 * shell /home launcher can reuse it without duplicating it. Design:
 *   - `order` signal renders INSTANTLY from a per-GCID localStorage value,
 *     reconciled through the INJECTED reconcile.
 *   - `reorder()` mutates the signal, writes local with a fresh `updatedAt`, and
 *     dispatches a debounced server save. Connectivity is evaluated AT DISPATCH:
 *     online goes to `port.save`; offline enqueues to the optional sync queue
 *     (falls back to local-first + LWW-on-next-load when no queue is wired).
 *   - `load()` reconciles local vs server Last-Write-Wins by `updatedAt`.
 *
 * Local read/write are try/catch-guarded so corrupt or unavailable storage
 * degrades to "no local" and never throws into the render path.
 *
 * Local-first is NOT the same as silent (CHO-2190; root cause of CHO-2176). The
 * graceful degradation is preserved exactly, but a failed server save is now
 * observable on three levels: TYPED (the port outcome), STATE (`syncState` with a
 * consecutive-failure count), and SURFACE (a `console.error` on every terminal
 * failure plus ONE edge-triggered toast per outage). A 4xx is never retried; a
 * 5xx or status 0 is retried with bounded backoff (in the consumer's adapter).
 *
 * This is a plain class (no @Injectable, no TestBed): the consumer service
 * constructs it with a config and re-exposes its signals. The reconcile guard is
 * INJECTED, not baked (D3): the A+ consumer passes reconcileOrder, and a later
 * /home consumer will pass reconcilePins (curated subset, empty stays empty).
 */
import { signal } from '@angular/core';
import type { DestroyRef, Signal } from '@angular/core';
import { Subject, take } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import type {
  LayoutFailure,
  LayoutSyncState,
  PreferenceFetchResult,
  PreferenceLayout,
  PreferenceLayoutPort,
  PreferenceLayoutSyncQueue,
  PreferenceSaveResult,
} from './preference-layout.model';

/** i18n-key toast seam (structurally satisfied by the app ToastService). */
export interface PreferenceLayoutToast {
  show(key: string, level: 'error'): void;
}

/** Everything a consumer injects to configure the backbone. */
export interface PreferenceLayoutConfig<TItem> {
  readonly port: PreferenceLayoutPort<TItem>;
  /** ISO-8601 clock, injected so specs are deterministic. */
  readonly clock: () => string;
  /** Connectivity probe, evaluated at dispatch time. */
  readonly online: () => boolean;
  /** Optional offline enqueue; null relies on local-first + LWW-on-next-load. */
  readonly queue: PreferenceLayoutSyncQueue<TItem> | null;
  readonly toast: PreferenceLayoutToast;
  /** Ties the debounce subscription lifetime to the consumer service. */
  readonly destroyRef: DestroyRef;
  /** The full per-GCID localStorage key (the consumer owns prefix + scoping). */
  readonly storageKey: () => string;
  /** Injected reconcile (D3): the engine bakes no reconcile semantics. */
  readonly reconcile: (candidate: readonly TItem[] | null | undefined) => TItem[];
  /** The order to fall back to when neither local nor server holds a value. */
  readonly defaultOrder: () => TItem[];
  /** console.error label for prod forensics, e.g. 'dashboard-layout'. */
  readonly logLabel: string;
  /** i18n key for the "saved on this device only" toast. */
  readonly toastKey: string;
  /** Debounce window for coalescing a burst of reorders. Default 600ms. */
  readonly debounceMs?: number;
}

/** Default debounce for coalescing a burst of drag reorders into one save. */
const DEFAULT_DEBOUNCE_MS = 600;

export class PreferenceLayoutEngine<TItem> {
  private readonly cfg: PreferenceLayoutConfig<TItem>;

  /** Fires on every reorder; debounced into a single server dispatch. */
  private readonly saveSignal$ = new Subject<void>();
  /** The latest layout awaiting a debounced dispatch. */
  private pending: PreferenceLayout<TItem> | null = null;

  /** Instant, local-first order, reconciled on init. */
  private readonly _order = signal<readonly TItem[]>([]);
  readonly order: Signal<readonly TItem[]> = this._order.asReadonly();

  /** Server-sync health. Observability only; it never gates the render. */
  private readonly _syncState = signal<LayoutSyncState>({ status: 'ok' });
  readonly syncState: Signal<LayoutSyncState> = this._syncState.asReadonly();

  constructor(config: PreferenceLayoutConfig<TItem>) {
    this.cfg = config;
    this._order.set(this.initOrder());
    this.saveSignal$
      .pipe(
        debounceTime(config.debounceMs ?? DEFAULT_DEBOUNCE_MS),
        takeUntilDestroyed(config.destroyRef),
      )
      .subscribe(() => this.dispatch());
  }

  /**
   * Apply a reorder: reconcile, update the signal, persist local with a fresh
   * `updatedAt`, dispatch a debounced server save. Local-first: the UI and
   * localStorage update synchronously and the server is best-effort, but a
   * failed server save is REPORTED (see `reportFailure`), not swallowed.
   */
  reorder(next: readonly TItem[]): void {
    const order = this.cfg.reconcile(next);
    const layout: PreferenceLayout<TItem> = { order, updatedAt: this.cfg.clock() };
    this._order.set(order);
    this.pending = layout;
    this.writeLocal(layout);
    this.saveSignal$.next();
  }

  /**
   * Reconcile the local order against the server copy, Last-Write-Wins by
   * `updatedAt`. Server strictly-newer (or no local) adopts server; else keep
   * local and, when the two differ, push local back to seed/overwrite the server.
   */
  load(): void {
    this.cfg.port
      .fetch()
      .pipe(take(1))
      .subscribe((res) => this.applyFetch(res));
  }

  private applyFetch(res: PreferenceFetchResult<TItem>): void {
    if (!res.ok) {
      // We could not ASK the server. That is NOT "the server has no value":
      // conflating the two is exactly what let CHO-2176 hide (a swallowed 403
      // read became a blind push that ALSO 403'd and was ALSO swallowed). So
      // keep local, do not push into a server we never reached, and say so.
      this.reportFailure('fetch', res.failure);
      const local = this.readLocal();
      if (local) {
        this._order.set(local.order);
        this.writeLocal(local); // persist any reconcile-heal
      } else {
        this._order.set(this.cfg.defaultOrder());
      }
      return;
    }

    // The read leg reached the server. Clear the alarm BEFORE applyServer: its
    // seed/push save reports its own outcome, which must not be overwritten.
    this.reportSuccess();
    this.applyServer(res.layout);
  }

  private applyServer(serverRaw: PreferenceLayout<TItem> | null): void {
    const local = this.readLocal();
    const server: PreferenceLayout<TItem> | null = serverRaw
      ? {
          order: this.cfg.reconcile(serverRaw.order),
          updatedAt:
            typeof serverRaw.updatedAt === 'string' ? serverRaw.updatedAt : '',
        }
      : null;

    if (server && (!local || this.isNewer(server, local))) {
      // Server wins, adopt and persist locally.
      this._order.set(server.order);
      this.writeLocal(server);
      return;
    }

    if (local) {
      // Local wins, keep it (persist any reconcile-heal); push if they differ.
      this._order.set(local.order);
      this.writeLocal(local);
      if (!server || !this.sameOrder(local.order, server.order)) {
        this.cfg.port
          .save(local)
          .pipe(take(1))
          .subscribe((r) => this.applySave(r));
      }
      return;
    }

    // Neither side has a value, stay on the default.
    this._order.set(this.cfg.defaultOrder());
  }

  /** Dispatch the pending layout: online saves; offline enqueues (if wired). */
  private dispatch(): void {
    const layout = this.pending;
    if (!layout) {
      return;
    }
    if (this.cfg.online()) {
      this.cfg.port
        .save(layout)
        .pipe(take(1))
        .subscribe((r) => this.applySave(r));
    } else if (this.cfg.queue) {
      this.cfg.queue.enqueue(layout);
    }
    // Offline + no queue: local-first + LWW-on-next-load already guarantee the
    // change is not lost. Being offline is a KNOWN state, not a failure, so it
    // does not raise the alarm.
  }

  private applySave(res: PreferenceSaveResult): void {
    if (res.ok) {
      this.reportSuccess();
      return;
    }
    this.reportFailure('save', res.failure);
  }

  /**
   * A TERMINAL failure: the adapter has exhausted its retries, or the status was
   * a 4xx (never retried). Something the user did was not persisted to the
   * server. `console.error` fires EVERY time (each is a genuinely lost save, and
   * the running count tells an operator this is a persistent outage). The toast
   * is edge-triggered (raised once on entering the degraded state) so a dead
   * server cannot spam a user who reorders several cards in a row.
   */
  private reportFailure(leg: 'fetch' | 'save', failure: LayoutFailure): void {
    const previous = this._syncState();
    const consecutiveFailures =
      previous.status === 'degraded' ? previous.consecutiveFailures + 1 : 1;

    this._syncState.set({
      status: 'degraded',
      kind: failure.kind,
      httpStatus: failure.status,
      consecutiveFailures,
    });

    console.error(
      `[${this.cfg.logLabel}] ${leg} failed (HTTP ${failure.status}, ${failure.kind}; ` +
        `${consecutiveFailures} consecutive), the server copy is NOT in sync; ` +
        `this layout is saved on this device only.`,
    );

    if (previous.status === 'ok') {
      this.cfg.toast.show(this.cfg.toastKey, 'error');
    }
  }

  /** Recovery re-arms the alarm so a NEW outage surfaces instead of being masked. */
  private reportSuccess(): void {
    if (this._syncState().status !== 'ok') {
      this._syncState.set({ status: 'ok' });
    }
  }

  private initOrder(): TItem[] {
    const local = this.readLocal();
    return local ? local.order.slice() : this.cfg.defaultOrder();
  }

  private readLocal(): PreferenceLayout<TItem> | null {
    try {
      const raw = localStorage.getItem(this.cfg.storageKey());
      if (raw === null) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }
      const record = parsed as { order?: unknown; updatedAt?: unknown };
      const order = this.cfg.reconcile(
        Array.isArray(record.order) ? (record.order as readonly TItem[]) : [],
      );
      const updatedAt =
        typeof record.updatedAt === 'string' ? record.updatedAt : '';
      return { order, updatedAt };
    } catch {
      // Storage unavailable or corrupt, degrade to "no local", never throw.
      return null;
    }
  }

  private writeLocal(layout: PreferenceLayout<TItem>): void {
    try {
      localStorage.setItem(
        this.cfg.storageKey(),
        JSON.stringify({ order: layout.order, updatedAt: layout.updatedAt }),
      );
    } catch {
      /* storage full or private mode, best-effort; in-memory signal still holds */
    }
  }

  /** `a` is strictly newer than `b` by `updatedAt` (unparseable local counts as newer). */
  private isNewer(a: PreferenceLayout<TItem>, b: PreferenceLayout<TItem>): boolean {
    const ta = Date.parse(a.updatedAt);
    const tb = Date.parse(b.updatedAt);
    if (Number.isNaN(ta)) {
      return false;
    }
    if (Number.isNaN(tb)) {
      return true;
    }
    return ta > tb;
  }

  private sameOrder(a: readonly TItem[], b: readonly TItem[]): boolean {
    return a.length === b.length && a.every((k, i) => k === b[i]);
  }
}
