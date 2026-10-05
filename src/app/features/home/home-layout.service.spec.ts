import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Observable, of } from 'rxjs';

import {
  HomeLayoutService,
  HttpHomeLayoutPort,
  HOME_LAYOUT_PORT,
  HOME_LAYOUT_CLOCK,
  HOME_LAYOUT_ONLINE,
  HOME_LAYOUT_SYNC_FAILED_KEY,
} from './home-layout.service';
import type { HomePin } from './home-pin.registry';
import type {
  PreferenceLayout,
  PreferenceLayoutPort,
  PreferenceFetchResult,
  PreferenceSaveResult,
} from '../../core/services/preference-layout/preference-layout.model';
import { AuthService } from '../../core/auth/auth.service';
import { TenantContextService } from '../../core/auth/tenant-context.service';
import { FeatureFlagService } from '../../core/services/feature-flag.service';
import { RbacService } from '../../core/services/rbac.service';
import { ToastService } from '../../shared/components/toast/toast.service';

/** Deterministic in-memory port (models a FAILED save, per CHO-2190). */
class FakePort implements PreferenceLayoutPort<HomePin> {
  fetchResult: PreferenceFetchResult<HomePin> = { ok: true, layout: null };
  saveResult: PreferenceSaveResult = { ok: true };
  saved: PreferenceLayout<HomePin>[] = [];

  fetch(): Observable<PreferenceFetchResult<HomePin>> {
    return of(this.fetchResult);
  }
  save(layout: PreferenceLayout<HomePin>): Observable<PreferenceSaveResult> {
    this.saved.push(layout);
    return of(this.saveResult);
  }
}

const KEY = (gcid: string) => `chora.home-layout.${gcid}`;
const ids = (pins: readonly HomePin[]) => pins.map((p) => p.id);

describe('HomeLayoutService', () => {
  let port: FakePort;
  let now: string;
  let online: boolean;
  let gcid: string | null;
  // Session doubles: a full-access owner sees all surfaces.
  let currentTenant: { id: string; surfaces?: readonly string[] } | null;
  let memberships: { id: string; surfaces?: readonly string[] }[];
  let enabled: Set<string>;
  let roles: Set<string>;
  let capabilities: Set<string>;
  let toast: { show: ReturnType<typeof vi.fn> };
  let errorSpy: ReturnType<typeof vi.spyOn>;

  function make(): HomeLayoutService {
    TestBed.configureTestingModule({
      providers: [
        HomeLayoutService,
        { provide: HOME_LAYOUT_PORT, useValue: port },
        { provide: HOME_LAYOUT_CLOCK, useValue: () => now },
        { provide: HOME_LAYOUT_ONLINE, useValue: () => online },
        { provide: AuthService, useValue: { gcid: () => gcid } },
        {
          provide: TenantContextService,
          useValue: {
            currentTenant: () => currentTenant,
            availableTenants: () => memberships,
          },
        },
        { provide: FeatureFlagService, useValue: { isEnabled: (c: string) => enabled.has(c) } },
        {
          provide: RbacService,
          useValue: {
            hasRole: (r: string) => roles.has(r),
            hasCapability: (c: string) => capabilities.has(c),
          },
        },
        { provide: ToastService, useValue: toast },
      ],
    });
    return TestBed.inject(HomeLayoutService);
  }

  beforeEach(() => {
    localStorage.clear();
    port = new FakePort();
    now = '2026-07-18T12:00:00.000Z';
    online = true;
    gcid = 'gcid-1';
    // Full-access session: all 5 surfaces, cplus_social on, all capabilities.
    currentTenant = { id: 't1', surfaces: ['aplus', 'cplus', 'hplus', 'oplus', 'rplus'] };
    memberships = [currentTenant];
    enabled = new Set(['cplus_social']);
    roles = new Set<string>();
    capabilities = new Set(['assessment:author', 'delivery:ops']);
    toast = { show: vi.fn() };
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    errorSpy.mockRestore();
    TestBed.resetTestingModule();
  });

  // ── first-run default set (D7) ────────────────────────────────────────────
  it('seeds the first-run default pin set when there is no local value', () => {
    const svc = make();
    // defaultPins = first reachable pin per accessible surface (5 surfaces).
    expect(ids(svc.pins())).toEqual([
      'aplus-learning',
      'cplus-feed',
      'hplus-tenant',
      'oplus-dashboard',
      'rplus-offerings',
    ]);
  });

  it('initialises pins from a valid per-GCID local value (instant render)', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({ order: [{ id: 'aplus-wallet' }, { id: 'cplus-feed' }], updatedAt: now }),
    );
    expect(ids(make().pins())).toEqual(['aplus-wallet', 'cplus-feed']);
  });

  it('AGNOSTIC: an intentionally empty local home stays empty (no default refill)', () => {
    localStorage.setItem(KEY('gcid-1'), JSON.stringify({ order: [], updatedAt: now }));
    expect(make().pins()).toEqual([]);
  });

  it('drops an unknown pin id on read (reconcilePins keyed on HOME_PIN_IDS)', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({ order: [{ id: 'aplus-wallet' }, { id: 'ghost-pin' }], updatedAt: now }),
    );
    expect(ids(make().pins())).toEqual(['aplus-wallet']);
  });

  // ── pin / unpin / reorder ─────────────────────────────────────────────────
  it('pin(id) appends a registry pin and persists it', () => {
    localStorage.setItem(KEY('gcid-1'), JSON.stringify({ order: [{ id: 'aplus-learning' }], updatedAt: now }));
    const svc = make();
    svc.pin('aplus-wallet');
    expect(ids(svc.pins())).toEqual(['aplus-learning', 'aplus-wallet']);
  });

  it('pin(id) is idempotent (never duplicates an already-pinned id)', () => {
    localStorage.setItem(KEY('gcid-1'), JSON.stringify({ order: [{ id: 'aplus-learning' }], updatedAt: now }));
    const svc = make();
    svc.pin('aplus-learning');
    expect(ids(svc.pins())).toEqual(['aplus-learning']);
  });

  it('unpin(id) removes a pin and persists the removal', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({ order: [{ id: 'aplus-learning' }, { id: 'aplus-wallet' }], updatedAt: now }),
    );
    const svc = make();
    svc.unpin('aplus-learning');
    expect(ids(svc.pins())).toEqual(['aplus-wallet']);
  });

  it('unpin(id) can empty the home, and the empty state persists locally (not refilled)', () => {
    localStorage.setItem(KEY('gcid-1'), JSON.stringify({ order: [{ id: 'aplus-wallet' }], updatedAt: now }));
    const svc = make();
    svc.unpin('aplus-wallet');
    expect(svc.pins()).toEqual([]);
    // The empty home is written to localStorage as [] (never the default set):
    // reconcilePins keeps an empty candidate empty on the next read, proven in
    // home-pin.reconcile.spec + preference-layout.engine.spec.
    const stored = JSON.parse(localStorage.getItem(KEY('gcid-1'))!) as { order: HomePin[] };
    expect(stored.order).toEqual([]);
  });

  it('reorder persists a new order', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({ order: [{ id: 'aplus-learning' }, { id: 'aplus-wallet' }], updatedAt: now }),
    );
    const svc = make();
    svc.reorder([{ id: 'aplus-wallet' }, { id: 'aplus-learning' }]);
    expect(ids(svc.pins())).toEqual(['aplus-wallet', 'aplus-learning']);
  });

  // ── filter inputs (wiring to the shipped predicates) ──────────────────────
  it('exposes filterInputs with onEmpty open-all (home is pure navigation)', () => {
    const svc = make();
    expect(svc.filterInputs().onEmpty).toBe('open-all');
  });

  // ── load / failure surfacing (inherited from the engine) ──────────────────
  it('load adopts a strictly-newer server value', () => {
    localStorage.setItem(
      KEY('gcid-1'),
      JSON.stringify({ order: [{ id: 'aplus-learning' }], updatedAt: '2026-07-18T10:00:00.000Z' }),
    );
    port.fetchResult = {
      ok: true,
      layout: { order: [{ id: 'cplus-feed' }], updatedAt: '2026-07-18T11:00:00.000Z' },
    };
    const svc = make();
    svc.load();
    expect(ids(svc.pins())).toEqual(['cplus-feed']);
  });

  it('a failed save is surfaced (degraded syncState + toast), never swallowed', () => {
    vi.useFakeTimers();
    port.saveResult = { ok: false, failure: { kind: 'rejected', status: 403 } };
    localStorage.setItem(KEY('gcid-1'), JSON.stringify({ order: [{ id: 'aplus-learning' }], updatedAt: now }));
    const svc = make();
    svc.pin('aplus-wallet');
    vi.advanceTimersByTime(600);
    expect(svc.syncState().status).toBe('degraded');
    expect(toast.show).toHaveBeenCalledWith(HOME_LAYOUT_SYNC_FAILED_KEY, 'error');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// HTTP adapter: the wire mapping pins <-> order + the home-layout path (D2/D11)
// ═════════════════════════════════════════════════════════════════════════
describe('HttpHomeLayoutPort', () => {
  let adapter: HttpHomeLayoutPort;
  let httpMock: HttpTestingController;
  const PREFS = 'https://api.chora.site/api/me/preferences';
  const SAVE = 'https://api.chora.site/api/me/preferences/home-layout';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpHomeLayoutPort],
    });
    adapter = TestBed.inject(HttpHomeLayoutPort);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('fetch maps snake_case home_layout.pins -> the engine order', () => {
    let result: PreferenceFetchResult<HomePin> | undefined;
    adapter.fetch().subscribe((v) => (result = v));
    httpMock.expectOne((r) => r.url === PREFS && r.method === 'GET').flush({
      home_layout: { pins: [{ id: 'aplus-wallet' }], updated_at: '2026-07-18T00:00:00.000Z' },
    });
    expect(result).toEqual({
      ok: true,
      layout: { order: [{ id: 'aplus-wallet' }], updatedAt: '2026-07-18T00:00:00.000Z' },
    });
  });

  it('fetch reports ok+null when home_layout is absent (an UNSET pref is not an error)', () => {
    let result: PreferenceFetchResult<HomePin> | undefined;
    adapter.fetch().subscribe((v) => (result = v));
    httpMock.expectOne(PREFS).flush({ dashboard_layout: { order: ['map'] } });
    expect(result).toEqual({ ok: true, layout: null });
  });

  it('fetch reports a REJECTION on 403 without retrying', () => {
    vi.useFakeTimers();
    let result: PreferenceFetchResult<HomePin> | undefined;
    adapter.fetch().subscribe((v) => (result = v));
    httpMock.expectOne(PREFS).flush('denied', { status: 403, statusText: 'Forbidden' });
    expect(result).toEqual({ ok: false, failure: { kind: 'rejected', status: 403 } });
    vi.advanceTimersByTime(10_000);
    httpMock.expectNone(PREFS);
  });

  it('save PUTs the snake_case {pins, updated_at} body to the home-layout path', () => {
    let result: PreferenceSaveResult | undefined;
    adapter
      .save({ order: [{ id: 'aplus-wallet' }, { id: 'cplus-feed' }], updatedAt: '2026-07-18T00:00:00.000Z' })
      .subscribe((v) => (result = v));
    const req = httpMock.expectOne((r) => r.url === SAVE && r.method === 'PUT');
    expect(req.request.body).toEqual({
      pins: [{ id: 'aplus-wallet' }, { id: 'cplus-feed' }],
      updated_at: '2026-07-18T00:00:00.000Z',
    });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(result).toEqual({ ok: true });
  });

  it('save retries a transient 500 then succeeds (a blip stays quiet)', () => {
    vi.useFakeTimers();
    let result: PreferenceSaveResult | undefined;
    adapter.save({ order: [{ id: 'aplus-wallet' }], updatedAt: 'x' }).subscribe((v) => (result = v));
    httpMock.expectOne(SAVE).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(result).toBeUndefined();
    vi.advanceTimersByTime(400);
    httpMock.expectOne(SAVE).flush(null, { status: 204, statusText: 'No Content' });
    expect(result).toEqual({ ok: true });
  });
});
