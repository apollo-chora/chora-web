import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Observable, of } from 'rxjs';

import {
  DashboardLayoutService,
  HttpDashboardLayoutPort,
  DASHBOARD_LAYOUT_PORT,
  DASHBOARD_LAYOUT_CLOCK,
  DASHBOARD_LAYOUT_ONLINE,
  DASHBOARD_LAYOUT_SYNC_QUEUE,
  LAYOUT_SYNC_FAILED_KEY,
} from './dashboard-layout.service';
import {
  DEFAULT_ORDER,
  type DashboardLayout,
  type DashboardLayoutPort,
  type LayoutFetchResult,
  type LayoutSaveResult,
  type WrapperKey,
} from './dashboard-layout.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

/**
 * Deterministic in-memory port — records saves, serves a scripted fetch/save
 * OUTCOME.
 *
 * NB (reusable_gotcha_absence_assertion_can_encode_the_bug): this fake MUST be
 * able to model a FAILED save. The pre-CHO-2190 fake could only ever return
 * `of(void 0)` — it was structurally incapable of reproducing the very defect
 * that killed this feature in prod for two months. A test double that cannot
 * express the real adapter's failure mode silently certifies the bug.
 */
class FakePort implements DashboardLayoutPort {
  fetchResult: LayoutFetchResult = { ok: true, layout: null };
  saveResult: LayoutSaveResult = { ok: true };
  saved: DashboardLayout[] = [];

  fetch(): Observable<LayoutFetchResult> {
    return of(this.fetchResult);
  }
  save(layout: DashboardLayout): Observable<LayoutSaveResult> {
    this.saved.push(layout);
    return of(this.saveResult);
  }
}

const KEY = (gcid: string) => `chora.dashboard-layout.${gcid}`;

describe('DashboardLayoutService', () => {
  let port: FakePort;
  let now: string;
  let online: boolean;
  let gcid: string | null;
  let queue: { enqueue: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let errorSpy: ReturnType<typeof vi.spyOn>;

  function make(withQueue = false): DashboardLayoutService {
    TestBed.configureTestingModule({
      providers: [
        DashboardLayoutService,
        { provide: DASHBOARD_LAYOUT_PORT, useValue: port },
        { provide: DASHBOARD_LAYOUT_CLOCK, useValue: () => now },
        { provide: DASHBOARD_LAYOUT_ONLINE, useValue: () => online },
        { provide: AuthService, useValue: { gcid: () => gcid } },
        { provide: ToastService, useValue: toast },
        ...(withQueue
          ? [{ provide: DASHBOARD_LAYOUT_SYNC_QUEUE, useValue: queue }]
          : []),
      ],
    });
    return TestBed.inject(DashboardLayoutService);
  }

  beforeEach(() => {
    localStorage.clear();
    port = new FakePort();
    now = '2026-07-06T12:00:00.000Z';
    online = true;
    gcid = 'gcid-1';
    queue = { enqueue: vi.fn() };
    toast = { show: vi.fn() };
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    errorSpy.mockRestore();
    TestBed.resetTestingModule();
  });

  // ── Signal init (instant, local-first render) ────────────────────────────
  it('initialises order to DEFAULT_ORDER when there is no local value', () => {
    const svc = make();
    expect(svc.order()).toEqual([...DEFAULT_ORDER]);
  });

  it('initialises order from a valid per-GCID local value (instant render)', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({ order: ['cast', 'map', 'courses', 'study'], updatedAt: now }),
    );
    const svc = make();
    expect(svc.order()).toEqual(['cast', 'map', 'courses', 'study', 'transcript']);
  });

  it('reconciles a corrupt-order local value on read', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({ order: ['cast', 'zzz'], updatedAt: now }),
    );
    const svc = make();
    expect(svc.order()).toEqual(['cast', 'map', 'courses', 'study', 'transcript']);
  });

  it('falls back to DEFAULT_ORDER on corrupt JSON without throwing', () => {
    localStorage.setItem(KEY('gcid-1'), '{not valid json');
    const svc = make();
    expect(svc.order()).toEqual([...DEFAULT_ORDER]);
  });

  it('scopes the local key per GCID and uses "anon" when signed out', () => {
    gcid = null;
    localStorage.setItem(
      KEY('anon'),
      JSON.stringify({ order: ['courses', 'cast', 'map', 'study'], updatedAt: now }),
    );
    const svc = make();
    expect(svc.order()).toEqual(['courses', 'cast', 'map', 'study', 'transcript']);
  });

  it('starts in a healthy sync state', () => {
    const svc = make();
    expect(svc.syncState()).toEqual({ status: 'ok' });
  });

  // ── reorder (drag) ───────────────────────────────────────────────────────
  it('reorder updates the signal and writes local with a fresh updatedAt', () => {
    const svc = make();
    now = '2026-07-06T13:00:00.000Z';
    svc.reorder(['cast', 'map', 'courses', 'study']);
    expect(svc.order()).toEqual(['cast', 'map', 'courses', 'study', 'transcript']);
    const stored = JSON.parse(localStorage.getItem(KEY('gcid-1'))!) as {
      order: WrapperKey[];
      updatedAt: string;
    };
    expect(stored.order).toEqual(['cast', 'map', 'courses', 'study', 'transcript']);
    expect(stored.updatedAt).toBe('2026-07-06T13:00:00.000Z');
  });

  it('reorder sanitises an invalid next order before persisting', () => {
    const svc = make();
    svc.reorder(['cast', 'zzz'] as WrapperKey[]);
    expect(svc.order()).toEqual(['cast', 'map', 'courses', 'study', 'transcript']);
  });

  it('reorder debounces port.save to a single call for a burst (last wins)', () => {
    vi.useFakeTimers();
    const svc = make();
    svc.reorder(['cast', 'map', 'courses', 'study']);
    svc.reorder(['courses', 'cast', 'map', 'study']);
    svc.reorder(['map', 'courses', 'cast', 'study']);
    expect(port.saved.length).toBe(0); // nothing before the debounce window elapses
    vi.advanceTimersByTime(600);
    expect(port.saved.length).toBe(1);
    expect(port.saved[0].order).toEqual(['map', 'courses', 'cast', 'study', 'transcript']);
  });

  it('reorder online does NOT enqueue on the sync queue', () => {
    vi.useFakeTimers();
    const svc = make(true);
    svc.reorder(['cast', 'map', 'courses', 'study']);
    vi.advanceTimersByTime(600);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(port.saved.length).toBe(1);
  });

  it('reorder offline enqueues on the sync queue and skips port.save', () => {
    vi.useFakeTimers();
    online = false;
    const svc = make(true);
    svc.reorder(['cast', 'map', 'courses', 'study']);
    vi.advanceTimersByTime(600);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect((queue.enqueue.mock.calls[0][0] as DashboardLayout).order).toEqual([
      'cast',
      'map',
      'courses',
      'study',
      'transcript',
    ]);
    expect(port.saved.length).toBe(0);
  });

  it('reorder offline without a queue still persists locally and never throws', () => {
    vi.useFakeTimers();
    online = false;
    const svc = make(); // no queue provided (default null)
    expect(() => {
      svc.reorder(['cast', 'map', 'courses', 'study']);
      vi.advanceTimersByTime(600);
    }).not.toThrow();
    const stored = JSON.parse(localStorage.getItem(KEY('gcid-1'))!) as {
      order: WrapperKey[];
    };
    expect(stored.order).toEqual(['cast', 'map', 'courses', 'study', 'transcript']);
    expect(port.saved.length).toBe(0);
  });

  it('an offline reorder is NOT a failure — going offline must not raise the alarm', () => {
    vi.useFakeTimers();
    online = false;
    const svc = make(true);
    svc.reorder(['cast', 'map', 'courses', 'study']);
    vi.advanceTimersByTime(600);
    expect(svc.syncState()).toEqual({ status: 'ok' });
    expect(toast.show).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // ── CHO-2190: a failed save is LOUD (it used to read as success) ─────────
  it('a failed save marks syncState degraded with the kind + status (never silent)', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const svc = make();
    svc.reorder(['cast', 'map', 'courses', 'study']);
    vi.advanceTimersByTime(600);

    expect(svc.syncState()).toEqual({
      status: 'degraded',
      kind: 'rejected',
      httpStatus: 403,
      consecutiveFailures: 1,
    });
  });

  it('a failed save console.errors with the status (prod-forensics leg)', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const svc = make();
    svc.reorder(['cast', 'map', 'courses', 'study']);
    vi.advanceTimersByTime(600);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = String(errorSpy.mock.calls[0][0]);
    expect(logged).toContain('dashboard-layout');
    expect(logged).toContain('403');
  });

  it('a failed save raises a non-blocking toast for the learner', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'unavailable', status: 500 } };
    const svc = make();
    svc.reorder(['cast', 'map', 'courses', 'study']);
    vi.advanceTimersByTime(600);

    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith(LAYOUT_SYNC_FAILED_KEY, 'error');
  });

  it('toasts ONCE per outage, not once per drag (edge-triggered, not spam)', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const svc = make();

    const drags: WrapperKey[][] = [
      ['cast', 'map', 'courses', 'study'],
      ['courses', 'cast', 'map', 'study'],
      ['map', 'courses', 'cast', 'study'],
      ['cast', 'courses', 'map', 'study'],
      ['courses', 'map', 'cast', 'study'],
    ];
    for (const order of drags) {
      svc.reorder(order);
      vi.advanceTimersByTime(600);
    }

    expect(port.saved.length).toBe(5); // every drag really did try to save
    expect(toast.show).toHaveBeenCalledTimes(1); // …but the learner is told once
    expect(svc.syncState()).toEqual({
      status: 'degraded',
      kind: 'rejected',
      httpStatus: 403,
      consecutiveFailures: 5, // …and the COUNT still records every one of them
    });
  });

  it('a later successful save clears the degraded state (re-arms the alarm)', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'unavailable', status: 503 } };
    const svc = make();
    svc.reorder(['cast', 'map', 'courses', 'study']);
    vi.advanceTimersByTime(600);
    expect(svc.syncState().status).toBe('degraded');

    port.saveResult = { ok: true };
    svc.reorder(['courses', 'cast', 'map', 'study']);
    vi.advanceTimersByTime(600);
    expect(svc.syncState()).toEqual({ status: 'ok' });

    // …and a NEW outage surfaces again rather than being masked by the old one.
    port.saveResult = { ok: false, failure: { kind: 'unavailable', status: 503 } };
    svc.reorder(['map', 'courses', 'cast', 'study']);
    vi.advanceTimersByTime(600);
    expect(toast.show).toHaveBeenCalledTimes(2);
  });

  it('the render path survives a 100%-down server (degrade, never break)', () => {
    vi.useFakeTimers();
    port.fetchResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const svc = make();

    expect(() => {
      svc.load();
      svc.reorder(['cast', 'map', 'courses', 'study']);
      vi.advanceTimersByTime(600);
    }).not.toThrow();

    // The signal still moved and localStorage still holds the truth.
    expect(svc.order()).toEqual(['cast', 'map', 'courses', 'study', 'transcript']);
    expect(
      (JSON.parse(localStorage.getItem(KEY('gcid-1'))!) as { order: WrapperKey[] })
        .order,
    ).toEqual(['cast', 'map', 'courses', 'study', 'transcript']);
  });

  // ── load / LWW server sync ───────────────────────────────────────────────
  it('load adopts a strictly-newer server value and persists it locally', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({
        order: ['map', 'cast', 'courses', 'study'],
        updatedAt: '2026-07-06T10:00:00.000Z',
      }),
    );
    port.fetchResult = {
      ok: true,
      layout: {
        order: ['courses', 'cast', 'map', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      },
    };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual(['courses', 'cast', 'map', 'study', 'transcript']);
    expect(port.saved.length).toBe(0); // adopting server → no push back
    expect(
      (JSON.parse(localStorage.getItem(KEY('gcid-1'))!) as { order: WrapperKey[] })
        .order,
    ).toEqual(['courses', 'cast', 'map', 'study', 'transcript']);
  });

  it('load keeps a strictly-newer local value and pushes it to the server', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({
        order: ['courses', 'cast', 'map', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      }),
    );
    port.fetchResult = {
      ok: true,
      layout: {
        order: ['map', 'cast', 'courses', 'study'],
        updatedAt: '2026-07-06T10:00:00.000Z',
      },
    };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual(['courses', 'cast', 'map', 'study', 'transcript']);
    expect(port.saved.length).toBe(1);
    expect(port.saved[0].order).toEqual(['courses', 'cast', 'map', 'study', 'transcript']);
  });

  it('load adopts the server value when there is no local value', () => {
    port.fetchResult = {
      ok: true,
      layout: {
        order: ['cast', 'courses', 'map', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      },
    };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual(['cast', 'courses', 'map', 'study', 'transcript']);
    expect(port.saved.length).toBe(0);
  });

  it('load keeps + seeds local when the server GENUINELY has no value', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({
        order: ['courses', 'cast', 'map', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      }),
    );
    port.fetchResult = { ok: true, layout: null };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual(['courses', 'cast', 'map', 'study', 'transcript']);
    expect(port.saved.length).toBe(1); // seed the empty server
    expect(port.saved[0].order).toEqual(['courses', 'cast', 'map', 'study', 'transcript']);
    expect(svc.syncState()).toEqual({ status: 'ok' }); // an unset pref is NOT a failure
  });

  // ── CHO-2190: "the server has no value" ≠ "I could not ask the server" ───
  it('load does NOT mistake a FAILED fetch for "the server has no value"', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({
        order: ['courses', 'cast', 'map', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      }),
    );
    port.fetchResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const svc = make();
    svc.load();

    // Local still renders — the degradation is preserved…
    expect(svc.order()).toEqual(['courses', 'cast', 'map', 'study', 'transcript']);
    // …but we must NOT seed a server we never actually reached. That blind push
    // is what turned one silent READ failure into a silent WRITE failure too.
    expect(port.saved.length).toBe(0);
    // …and the failure is surfaced, not swallowed.
    expect(svc.syncState()).toEqual({
      status: 'degraded',
      kind: 'rejected',
      httpStatus: 403,
      consecutiveFailures: 1,
    });
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('load falls back to DEFAULT_ORDER when the fetch fails and there is no local', () => {
    port.fetchResult = { ok: false, failure: { kind: 'unavailable', status: 0 } };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual([...DEFAULT_ORDER]);
    expect(port.saved.length).toBe(0);
    expect(svc.syncState().status).toBe('degraded');
  });

  it('load does not save when local and server orders already match', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({
        order: ['map', 'cast', 'courses', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      }),
    );
    port.fetchResult = {
      ok: true,
      layout: {
        order: ['map', 'cast', 'courses', 'study'],
        updatedAt: '2026-07-06T10:00:00.000Z',
      },
    };
    const svc = make();
    svc.load();
    expect(port.saved.length).toBe(0);
  });

  it('load leaves DEFAULT_ORDER when neither local nor server has a value', () => {
    port.fetchResult = { ok: true, layout: null };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual([...DEFAULT_ORDER]);
    expect(port.saved.length).toBe(0);
  });

  it('load reconciles a corrupt server order before adopting it', () => {
    port.fetchResult = {
      ok: true,
      layout: {
        order: ['courses', 'zzz'] as WrapperKey[],
        updatedAt: '2026-07-06T11:00:00.000Z',
      },
    };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual(['courses', 'map', 'cast', 'study', 'transcript']);
  });

  it('load treats a local value with an unparseable updatedAt as older (adopts server)', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({ order: ['courses', 'cast', 'map', 'study'], updatedAt: '' }),
    );
    port.fetchResult = {
      ok: true,
      layout: {
        order: ['map', 'cast', 'courses', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      },
    };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual(['map', 'cast', 'courses', 'study', 'transcript']); // server adopted
    expect(port.saved.length).toBe(0);
  });

  it('load keeps local when the server updatedAt is unparseable', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({
        order: ['courses', 'cast', 'map', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      }),
    );
    port.fetchResult = {
      ok: true,
      layout: { order: ['map', 'cast', 'courses', 'study'], updatedAt: 'not-a-date' },
    };
    const svc = make();
    svc.load();
    expect(svc.order()).toEqual(['courses', 'cast', 'map', 'study', 'transcript']); // local kept
    expect(port.saved.length).toBe(1); // differ → push local
  });

  it('a failed SEED save on load is surfaced too (the push-back leg is not exempt)', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({
        order: ['courses', 'cast', 'map', 'study'],
        updatedAt: '2026-07-06T11:00:00.000Z',
      }),
    );
    port.fetchResult = { ok: true, layout: null }; // reachable, genuinely empty
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    const svc = make();
    svc.load();

    expect(port.saved.length).toBe(1);
    expect(svc.syncState()).toEqual({
      status: 'degraded',
      kind: 'rejected',
      httpStatus: 403,
      consecutiveFailures: 1,
    });
    expect(toast.show).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// HTTP adapter — the leg that swallowed a mesh 403 for two months (CHO-2176)
// ═════════════════════════════════════════════════════════════════════════
describe('HttpDashboardLayoutPort', () => {
  let adapter: HttpDashboardLayoutPort;
  let httpMock: HttpTestingController;
  const PREFS = 'https://api.chora.site/api/me/preferences';
  const SAVE = 'https://api.chora.site/api/me/preferences/dashboard-layout';
  const LAYOUT: DashboardLayout = {
    order: ['map', 'cast', 'courses', 'study'],
    updatedAt: '2026-07-06T00:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        HttpDashboardLayoutPort,
      ],
    });
    adapter = TestBed.inject(HttpDashboardLayoutPort);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  // ── fetch ────────────────────────────────────────────────────────────────
  it('fetch maps snake_case dashboard_layout → camelCase DashboardLayout', () => {
    let result: LayoutFetchResult | undefined;
    adapter.fetch().subscribe((v) => (result = v));
    const req = httpMock.expectOne((r) => r.url === PREFS && r.method === 'GET');
    req.flush({
      dashboard_layout: {
        order: ['cast', 'map', 'courses', 'study'],
        updated_at: '2026-07-06T00:00:00.000Z',
      },
    });
    expect(result).toEqual({
      ok: true,
      layout: {
        order: ['cast', 'map', 'courses', 'study'],
        updatedAt: '2026-07-06T00:00:00.000Z',
      },
    });
  });

  it('fetch reports ok+null when dashboard_layout is absent (an UNSET pref is not an error)', () => {
    let result: LayoutFetchResult | undefined;
    adapter.fetch().subscribe((v) => (result = v));
    httpMock.expectOne(PREFS).flush({ some_other_pref: true });
    expect(result).toEqual({ ok: true, layout: null });
  });

  it('fetch reports a REJECTION on 403 — it must never read as "no server value"', () => {
    vi.useFakeTimers();
    let result: LayoutFetchResult | undefined;
    let errored = false;
    adapter.fetch().subscribe({
      next: (v) => (result = v),
      error: () => (errored = true),
    });
    httpMock
      .expectOne(PREFS)
      .flush('RBAC: access denied', { status: 403, statusText: 'Forbidden' });

    // Still no throw into the render path — the degradation is preserved…
    expect(errored).toBe(false);
    // …but the outcome now SAYS it failed instead of impersonating an empty server.
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'rejected', status: 403 },
    });
    // A 4xx is a definitive answer, not a blip: it is NOT retried.
    vi.advanceTimersByTime(10_000);
    httpMock.expectNone(PREFS);
  });

  it('fetch reports a REJECTION on 404 (the pre-SP2.9 case) without retrying', () => {
    vi.useFakeTimers();
    let result: LayoutFetchResult | undefined;
    adapter.fetch().subscribe((v) => (result = v));
    httpMock
      .expectOne(PREFS)
      .flush('nope', { status: 404, statusText: 'Not Found' });
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'rejected', status: 404 },
    });
    vi.advanceTimersByTime(10_000);
    httpMock.expectNone(PREFS);
  });

  it('fetch retries a transient 500 with backoff and then succeeds (a blip stays quiet)', () => {
    vi.useFakeTimers();
    let result: LayoutFetchResult | undefined;
    adapter.fetch().subscribe((v) => (result = v));

    httpMock
      .expectOne(PREFS)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    expect(result).toBeUndefined(); // not settled — a blip must be retried, not reported

    vi.advanceTimersByTime(400);
    httpMock.expectOne(PREFS).flush({
      dashboard_layout: { order: ['cast', 'map', 'courses', 'study'], updated_at: 'x' },
    });

    expect(result).toEqual({
      ok: true,
      layout: { order: ['cast', 'map', 'courses', 'study'], updatedAt: 'x' },
    });
  });

  // ── save ─────────────────────────────────────────────────────────────────
  it('save PUTs the snake_case body to the dashboard-layout path', () => {
    let result: LayoutSaveResult | undefined;
    adapter.save(LAYOUT).subscribe((v) => (result = v));
    const req = httpMock.expectOne((r) => r.url === SAVE && r.method === 'PUT');
    expect(req.request.body).toEqual({
      order: ['map', 'cast', 'courses', 'study'],
      updated_at: '2026-07-06T00:00:00.000Z',
    });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(result).toEqual({ ok: true });
  });

  it('save reports a REJECTION on 403 — THE two-month bug: it used to read as SUCCESS', () => {
    vi.useFakeTimers();
    let result: LayoutSaveResult | undefined;
    let errored = false;
    adapter.save(LAYOUT).subscribe({
      next: (v) => (result = v),
      error: () => (errored = true),
    });
    httpMock
      .expectOne(SAVE)
      .flush('RBAC: access denied', { status: 403, statusText: 'Forbidden' });

    expect(errored).toBe(false); // still never throws into the render path
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'rejected', status: 403 },
    });
    // A 403 is a misconfiguration, not a blip — spinning against it only delays the truth.
    vi.advanceTimersByTime(10_000);
    httpMock.expectNone(SAVE);
  });

  it('save retries a transient 500 with backoff and then succeeds', () => {
    vi.useFakeTimers();
    let result: LayoutSaveResult | undefined;
    adapter.save(LAYOUT).subscribe((v) => (result = v));

    httpMock
      .expectOne(SAVE)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    expect(result).toBeUndefined();

    vi.advanceTimersByTime(400);
    httpMock.expectOne(SAVE).flush(null, { status: 204, statusText: 'No Content' });

    expect(result).toEqual({ ok: true });
  });

  it('save gives up after BOUNDED retries and reports unavailable (persistent = loud)', () => {
    vi.useFakeTimers();
    let result: LayoutSaveResult | undefined;
    adapter.save(LAYOUT).subscribe((v) => (result = v));

    // 4 attempts total: the initial call + 3 retries at 400 / 800 / 1600 ms.
    for (const backoff of [0, 400, 800, 1600]) {
      if (backoff) vi.advanceTimersByTime(backoff);
      httpMock
        .expectOne(SAVE)
        .flush('boom', { status: 500, statusText: 'Server Error' });
    }

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'unavailable', status: 500 },
    });
    // Bounded — it does NOT spin forever.
    vi.advanceTimersByTime(60_000);
    httpMock.expectNone(SAVE);
  });

  it('save classifies a network error (status 0) as unavailable and retries it', () => {
    vi.useFakeTimers();
    let result: LayoutSaveResult | undefined;
    adapter.save(LAYOUT).subscribe((v) => (result = v));

    for (const backoff of [0, 400, 800, 1600]) {
      if (backoff) vi.advanceTimersByTime(backoff);
      httpMock.expectOne(SAVE).error(new ProgressEvent('network'));
    }

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'unavailable', status: 0 },
    });
  });
});
