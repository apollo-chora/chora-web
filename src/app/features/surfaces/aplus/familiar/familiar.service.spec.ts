import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { FamiliarService } from './familiar.service';
import type { FamiliarProfile } from './familiar.model';

/**
 * FamiliarService spec — A+ F5 un-mock (2026-06-02).
 *
 * The wave-3 Eira/Phyllis fixture (`EIRA_PROFILE`) is GONE. These tests
 * flush the REAL wire shape returned by chora-consumption
 * `getFamiliarInstance` (`GET /v1/me/familiars/{id}`, exposed at the BFF
 * as `/api/v1/me/familiars/{id}`) through HttpTestingController and assert
 * the fail-loud `FamiliarProfileState` discriminated union.
 *
 * Per chora-web CLAUDE.md §6 — `httpMock.verify()` in afterEach.
 */

const FAMILIAR_ID = '00000000-0000-7000-8000-00000000e1a0';

/** Minimal real wire row (camelCased post-gateway) — base identity only,
 *  no optional growth/cosmetic/memory enrichment. */
function baseWire(): Record<string, unknown> {
  return {
    familiarId: FAMILIAR_ID,
    tenantId: '00000000-0000-7000-8000-0000000000a1',
    ownerGcid: '00000000-0000-7000-8000-0000000000b2',
    name: 'Eira',
    specialization: 'cspo',
    evolutionTier: 'apprentice',
    skillSlotsUnlocked: 1,
    memoryContextCapacity: 1000,
    skillGrants: [],
    configuredRules: { max_hint_count: '3' },
    memoryBankAppName: `familiar:${FAMILIAR_ID}`,
    createdAt: '2026-05-13T00:00:00.000000Z',
    updatedAt: '2026-05-14T00:00:00.000000Z',
  };
}

function setup(): { service: FamiliarService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(FamiliarService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('FamiliarService (F5 — real BFF wiring)', () => {
  let service: FamiliarService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const result = setup();
    service = result.service;
    httpMock = result.httpMock;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('issues GET /api/v1/me/familiars/{id} on loadProfile()', () => {
    service.loadProfile(FAMILIAR_ID);
    const req = httpMock.expectOne((r) =>
      r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toBe(
      `https://api.chora.site/api/v1/me/familiars/${FAMILIAR_ID}`,
    );
    req.flush(baseWire());
  });

  it('URL-encodes the familiar id', () => {
    service.loadProfile('a b/c');
    const req = httpMock.expectOne((r) =>
      r.url.includes('/api/v1/me/familiars/a%20b%2Fc'),
    );
    expect(req.request.method).toBe('GET');
    req.flush(baseWire());
  });

  it('starts in the loading state and stays loading until flush', () => {
    expect(service.state().status).toBe('loading');
    service.loadProfile(FAMILIAR_ID);
    expect(service.state().status).toBe('loading');
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(baseWire());
  });

  it('transitions to success with the real base identity shape', () => {
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(baseWire());

    const state = service.state();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.profile.familiarId).toBe(FAMILIAR_ID);
      expect(state.profile.name).toBe('Eira');
      expect(state.profile.specialization).toBe('cspo');
      expect(state.profile.memoryBankAppName).toBe(`familiar:${FAMILIAR_ID}`);
      // Optional enrichment absent on the base shape — must not be faked.
      expect(state.profile.growthState).toBeUndefined();
      expect(state.profile.cosmetic).toBeUndefined();
      expect(state.profile.memorySummary).toBeUndefined();
    }
  });

  it('passes through the OPTIONAL growth_state + cosmetic enrichment when present', () => {
    const enriched: Record<string, unknown> = {
      ...baseWire(),
      growthState: {
        stage: 2,
        stageName: 'fledgling',
        exp: 12,
        expToNextStage: 200,
        currentBreed: 'dragon',
        breedRevealedAt: '2026-05-13T00:00:00.000000Z',
        effectiveLlmTier: 'flash-lite',
        lastStageUpAt: null,
        resonantAtomId: '',
        ahaMomentConsumed: false,
        ahaMomentActiveUntil: null,
      },
      cosmetic: { equippedSkinId: null, shiny: false, rarity: 'common' },
    };
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(enriched);

    const state = service.state();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.profile.growthState?.stage).toBe(2);
      expect(state.profile.growthState?.currentBreed).toBe('dragon');
      expect(state.profile.cosmetic?.rarity).toBe('common');
    }
  });

  it('passes through the OPTIONAL memory_summary enrichment when present', () => {
    const withMemory: Record<string, unknown> = {
      ...baseWire(),
      memorySummary: 'Helped you nail the CSPO atom with 98% retention.',
    };
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(withMemory);

    const state = service.state();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.profile.memorySummary).toContain('CSPO atom');
    }
  });

  it('profile() selector exposes the loaded profile, else undefined', () => {
    expect(service.profile()).toBeUndefined();
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(baseWire());
    const p = service.profile() as FamiliarProfile;
    expect(p?.familiarId).toBe(FAMILIAR_ID);
  });

  it('maps a 5xx to error_upstream', () => {
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.familiar.error_upstream');
    }
  });

  it('maps a 404 to error_not_found', () => {
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(null, { status: 404, statusText: 'Not Found' });

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.familiar.error_not_found');
    }
  });

  it('maps 401 / 403 to error_unauthorised', () => {
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(null, { status: 403, statusText: 'Forbidden' });

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.familiar.error_unauthorised');
    }
  });

  it('maps a network error (status 0) to error_generic', () => {
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .error(new ProgressEvent('error'));

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.familiar.error_generic');
    }
  });

  it('loadProfile() is idempotent — recovers on a second call', () => {
    service.loadProfile(FAMILIAR_ID);
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    expect(service.state().status).toBe('error');

    service.loadProfile(FAMILIAR_ID);
    expect(service.state().status).toBe('loading');
    httpMock
      .expectOne((r) => r.url.endsWith(`/api/v1/me/familiars/${FAMILIAR_ID}`))
      .flush(baseWire());
    expect(service.state().status).toBe('success');
  });

  it('getMyFamiliars() still delegates to the real roster endpoint', () => {
    let count = -1;
    service.getMyFamiliars().subscribe((items) => {
      count = items.length;
    });
    // FamiliarGrowthService.listMyFamiliars hits /api/v1/me/familiars.
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/familiars'))
      .flush({ items: [] });
    expect(count).toBe(0);
  });
});
