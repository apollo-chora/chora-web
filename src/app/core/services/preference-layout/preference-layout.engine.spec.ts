import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Observable, of } from 'rxjs';
import type { DestroyRef } from '@angular/core';

import { PreferenceLayoutEngine } from './preference-layout.engine';
import type { PreferenceLayoutToast } from './preference-layout.engine';
import type {
  PreferenceLayout,
  PreferenceLayoutPort,
  PreferenceLayoutSyncQueue,
  PreferenceFetchResult,
  PreferenceSaveResult,
} from './preference-layout.model';

/**
 * Engine spec for the GENERIC, reconcile-injected layout backbone (ADR-240 D3).
 *
 * This drives the backbone with a SUBSET-PRESERVING reconcile (the /home
 * flavour: drop unknown ids, preserve the curated subset, NEVER auto-add a
 * known-but-absent id, and treat empty as a legitimate empty layout). That
 * reconcile is deliberately DIFFERENT from the A+ reconcileOrder (which is
 * total over its known set and refills empty with DEFAULT_ORDER): if the engine
 * reproduces the subset semantics faithfully, it proves the backbone bakes no
 * reconcileOrder assumptions, which is exactly what D3 requires ("two reconcile
 * functions over one shared port, not one parametrised function").
 *
 * The engine is a plain class (no @Injectable, no TestBed), constructed with a
 * config, so this spec stays TestBed-free like the model spec.
 */

type Item = 'a' | 'b' | 'c' | 'd';
const KNOWN = new Set<Item>(['a', 'b', 'c', 'd']);
const DEFAULTS: Item[] = ['a', 'b', 'c'];
const STORAGE_KEY = 'chora.test-layout.gcid-1';

/** The /home-flavour reconcile: drop unknown, dedupe, preserve subset, never auto-add, empty stays empty. */
function subsetReconcile(candidate: readonly Item[] | null | undefined): Item[] {
  const seen = new Set<Item>();
  const out: Item[] = [];
  for (const k of Array.isArray(candidate) ? candidate : []) {
    if (KNOWN.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

class FakePort implements PreferenceLayoutPort<Item> {
  fetchResult: PreferenceFetchResult<Item> = { ok: true, layout: null };
  saveResult: PreferenceSaveResult = { ok: true };
  saved: PreferenceLayout<Item>[] = [];

  fetch(): Observable<PreferenceFetchResult<Item>> {
    return of(this.fetchResult);
  }
  save(layout: PreferenceLayout<Item>): Observable<PreferenceSaveResult> {
    this.saved.push(layout);
    return of(this.saveResult);
  }
}

// A DestroyRef stub: takeUntilDestroyed(destroyRef) only needs onDestroy(), and
// a notifier that never fires is fine for a synchronous spec.
const STUB_DESTROY_REF = {
  onDestroy: () => () => undefined,
} as unknown as DestroyRef;

describe('PreferenceLayoutEngine', () => {
  let port: FakePort;
  let now: string;
  let online: boolean;
  let queue: { enqueue: ReturnType<typeof vi.fn> } | null;
  let toast: { show: ReturnType<typeof vi.fn> };
  let errorSpy: ReturnType<typeof vi.spyOn>;

  function make(): PreferenceLayoutEngine<Item> {
    return new PreferenceLayoutEngine<Item>({
      port,
      clock: () => now,
      online: () => online,
      // Cast the vi.fn mocks to their engine seams: the loose local types keep
      // `.mock` access for assertions, while the config demands the interfaces.
      queue: queue as PreferenceLayoutSyncQueue<Item> | null,
      toast: toast as PreferenceLayoutToast,
      destroyRef: STUB_DESTROY_REF,
      storageKey: () => STORAGE_KEY,
      reconcile: subsetReconcile,
      defaultOrder: () => [...DEFAULTS],
      logLabel: 'test-layout',
      toastKey: 'test.sync_failed',
    });
  }

  beforeEach(() => {
    localStorage.clear();
    port = new FakePort();
    now = '2026-07-18T12:00:00.000Z';
    online = true;
    queue = null;
    toast = { show: vi.fn() };
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    errorSpy.mockRestore();
  });

  // ── init (instant, local-first render) ─────────────────────────────────────
  it('initialises order to the injected default when there is no local value', () => {
    expect(make().order()).toEqual([...DEFAULTS]);
  });

  it('initialises order from a valid local value, reconciled by the injected reconcile', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: ['c', 'a'], updatedAt: now }));
    // subsetReconcile preserves order + subset and does NOT auto-add b/d.
    expect(make().order()).toEqual(['c', 'a']);
  });

  it('AGNOSTIC: an explicitly-empty stored order stays empty (never refilled with the default)', () => {
    // reconcileOrder would turn [] into DEFAULT_ORDER; the injected subset
    // reconcile must be honoured so an intentionally empty layout survives (D7).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: [], updatedAt: now }));
    expect(make().order()).toEqual([]);
  });

  it('AGNOSTIC: an all-unknown stored order reconciles to empty, not to the default', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: ['x', 'y'], updatedAt: now }));
    expect(make().order()).toEqual([]);
  });

  it('falls back to the default on corrupt JSON without throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(make().order()).toEqual([...DEFAULTS]);
  });

  it('starts in a healthy sync state', () => {
    expect(make().syncState()).toEqual({ status: 'ok' });
  });

  // ── reorder ────────────────────────────────────────────────────────────────
  it('reorder updates the signal and writes local with a fresh updatedAt', () => {
    const engine = make();
    now = '2026-07-18T13:00:00.000Z';
    engine.reorder(['b', 'a']);
    expect(engine.order()).toEqual(['b', 'a']);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
      order: Item[];
      updatedAt: string;
    };
    expect(stored.order).toEqual(['b', 'a']);
    expect(stored.updatedAt).toBe('2026-07-18T13:00:00.000Z');
  });

  it('AGNOSTIC: reorder honours the injected reconcile (drops unknown, never auto-adds)', () => {
    const engine = make();
    engine.reorder(['b', 'zzz', 'a'] as Item[]);
    expect(engine.order()).toEqual(['b', 'a']);
  });

  it('reorder debounces port.save to a single call for a burst (last wins)', () => {
    vi.useFakeTimers();
    const engine = make();
    engine.reorder(['a']);
    engine.reorder(['b']);
    engine.reorder(['c', 'a']);
    expect(port.saved.length).toBe(0);
    vi.advanceTimersByTime(600);
    expect(port.saved.length).toBe(1);
    expect(port.saved[0].order).toEqual(['c', 'a']);
  });

  it('reorder online does NOT enqueue on the sync queue', () => {
    vi.useFakeTimers();
    queue = { enqueue: vi.fn() };
    const engine = make();
    engine.reorder(['b', 'a']);
    vi.advanceTimersByTime(600);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(port.saved.length).toBe(1);
  });

  it('reorder offline enqueues on the sync queue and skips port.save', () => {
    vi.useFakeTimers();
    online = false;
    queue = { enqueue: vi.fn() };
    const engine = make();
    engine.reorder(['b', 'a']);
    vi.advanceTimersByTime(600);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect((queue.enqueue.mock.calls[0][0] as PreferenceLayout<Item>).order).toEqual(['b', 'a']);
    expect(port.saved.length).toBe(0);
  });

  it('reorder offline without a queue still persists locally and never throws', () => {
    vi.useFakeTimers();
    online = false;
    queue = null;
    const engine = make();
    expect(() => {
      engine.reorder(['b', 'a']);
      vi.advanceTimersByTime(600);
    }).not.toThrow();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as { order: Item[] };
    expect(stored.order).toEqual(['b', 'a']);
    expect(port.saved.length).toBe(0);
  });

  it('an offline reorder is NOT a failure: going offline must not raise the alarm', () => {
    vi.useFakeTimers();
    online = false;
    queue = { enqueue: vi.fn() };
    const engine = make();
    engine.reorder(['b', 'a']);
    vi.advanceTimersByTime(600);
    expect(engine.syncState()).toEqual({ status: 'ok' });
    expect(toast.show).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // ── honest failure (CHO-2190 contract, inherited whole) ─────────────────────
  it('a failed save marks syncState degraded with the kind + status (never silent)', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const engine = make();
    engine.reorder(['b', 'a']);
    vi.advanceTimersByTime(600);
    expect(engine.syncState()).toEqual({
      status: 'degraded',
      kind: 'rejected',
      httpStatus: 403,
      consecutiveFailures: 1,
    });
  });

  it('a failed save console.errors with the configured log label + status', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const engine = make();
    engine.reorder(['b', 'a']);
    vi.advanceTimersByTime(600);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String(errorSpy.mock.calls[0][0]);
    expect(logged).toContain('test-layout');
    expect(logged).toContain('403');
  });

  it('a failed save raises a non-blocking toast with the configured key', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'unavailable', status: 500 } };
    const engine = make();
    engine.reorder(['b', 'a']);
    vi.advanceTimersByTime(600);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('test.sync_failed', 'error');
  });

  it('toasts ONCE per outage, not once per drag (edge-triggered), counting every failure', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const engine = make();
    for (const next of [['a'], ['b'], ['c'], ['a', 'b'], ['b', 'c']] as Item[][]) {
      engine.reorder(next);
      vi.advanceTimersByTime(600);
    }
    expect(port.saved.length).toBe(5);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(engine.syncState()).toEqual({
      status: 'degraded',
      kind: 'rejected',
      httpStatus: 403,
      consecutiveFailures: 5,
    });
  });

  it('a later successful save clears the degraded state and re-arms the alarm', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'unavailable', status: 503 } };
    const engine = make();
    engine.reorder(['b', 'a']);
    vi.advanceTimersByTime(600);
    expect(engine.syncState().status).toBe('degraded');

    port.saveResult = { ok: true };
    engine.reorder(['c', 'a']);
    vi.advanceTimersByTime(600);
    expect(engine.syncState()).toEqual({ status: 'ok' });

    port.saveResult = { ok: false, failure: { kind: 'unavailable', status: 503 } };
    engine.reorder(['a', 'b']);
    vi.advanceTimersByTime(600);
    expect(toast.show).toHaveBeenCalledTimes(2);
  });

  it('the render path survives a 100%-down server (degrade, never break)', () => {
    vi.useFakeTimers();
    port.fetchResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const engine = make();
    expect(() => {
      engine.load();
      engine.reorder(['b', 'a']);
      vi.advanceTimersByTime(600);
    }).not.toThrow();
    expect(engine.order()).toEqual(['b', 'a']);
    expect((JSON.parse(localStorage.getItem(STORAGE_KEY)!) as { order: Item[] }).order).toEqual([
      'b',
      'a',
    ]);
  });

  // ── load / LWW server sync ──────────────────────────────────────────────────
  it('load adopts a strictly-newer server value and persists it locally', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['a', 'b'], updatedAt: '2026-07-18T10:00:00.000Z' }),
    );
    port.fetchResult = { ok: true, layout: { order: ['c', 'a'], updatedAt: '2026-07-18T11:00:00.000Z' } };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual(['c', 'a']);
    expect(port.saved.length).toBe(0);
    expect((JSON.parse(localStorage.getItem(STORAGE_KEY)!) as { order: Item[] }).order).toEqual([
      'c',
      'a',
    ]);
  });

  it('load keeps a strictly-newer local value and pushes it to the server', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['c', 'a'], updatedAt: '2026-07-18T11:00:00.000Z' }),
    );
    port.fetchResult = { ok: true, layout: { order: ['a', 'b'], updatedAt: '2026-07-18T10:00:00.000Z' } };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual(['c', 'a']);
    expect(port.saved.length).toBe(1);
    expect(port.saved[0].order).toEqual(['c', 'a']);
  });

  it('load adopts the server value when there is no local value', () => {
    port.fetchResult = { ok: true, layout: { order: ['b', 'c'], updatedAt: '2026-07-18T11:00:00.000Z' } };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual(['b', 'c']);
    expect(port.saved.length).toBe(0);
  });

  it('load keeps + seeds local when the server GENUINELY has no value', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['c', 'a'], updatedAt: '2026-07-18T11:00:00.000Z' }),
    );
    port.fetchResult = { ok: true, layout: null };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual(['c', 'a']);
    expect(port.saved.length).toBe(1);
    expect(port.saved[0].order).toEqual(['c', 'a']);
    expect(engine.syncState()).toEqual({ status: 'ok' });
  });

  it('load does NOT mistake a FAILED fetch for "the server has no value"', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['c', 'a'], updatedAt: '2026-07-18T11:00:00.000Z' }),
    );
    port.fetchResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual(['c', 'a']);
    expect(port.saved.length).toBe(0); // never seed a server we did not reach
    expect(engine.syncState()).toEqual({
      status: 'degraded',
      kind: 'rejected',
      httpStatus: 403,
      consecutiveFailures: 1,
    });
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('load falls back to the default when the fetch fails and there is no local', () => {
    port.fetchResult = { ok: false, failure: { kind: 'unavailable', status: 0 } };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual([...DEFAULTS]);
    expect(port.saved.length).toBe(0);
    expect(engine.syncState().status).toBe('degraded');
  });

  it('load does not save when local and server orders already match', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['a', 'b'], updatedAt: '2026-07-18T11:00:00.000Z' }),
    );
    port.fetchResult = { ok: true, layout: { order: ['a', 'b'], updatedAt: '2026-07-18T10:00:00.000Z' } };
    const engine = make();
    engine.load();
    expect(port.saved.length).toBe(0);
  });

  it('load leaves the default when neither local nor server has a value', () => {
    port.fetchResult = { ok: true, layout: null };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual([...DEFAULTS]);
    expect(port.saved.length).toBe(0);
  });

  it('load treats a local value with an unparseable updatedAt as older (adopts server)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: ['c', 'a'], updatedAt: '' }));
    port.fetchResult = { ok: true, layout: { order: ['a', 'b'], updatedAt: '2026-07-18T11:00:00.000Z' } };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual(['a', 'b']);
    expect(port.saved.length).toBe(0);
  });

  it('load keeps local when the server updatedAt is unparseable', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['c', 'a'], updatedAt: '2026-07-18T11:00:00.000Z' }),
    );
    port.fetchResult = { ok: true, layout: { order: ['a', 'b'], updatedAt: 'not-a-date' } };
    const engine = make();
    engine.load();
    expect(engine.order()).toEqual(['c', 'a']);
    expect(port.saved.length).toBe(1);
  });

  it('a failed SEED save on load is surfaced too (the push-back leg is not exempt)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: ['c', 'a'], updatedAt: '2026-07-18T11:00:00.000Z' }),
    );
    port.fetchResult = { ok: true, layout: null };
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const engine = make();
    engine.load();
    expect(port.saved.length).toBe(1);
    expect(engine.syncState()).toEqual({
      status: 'degraded',
      kind: 'rejected',
      httpStatus: 403,
      consecutiveFailures: 1,
    });
    expect(toast.show).toHaveBeenCalledTimes(1);
  });
});
