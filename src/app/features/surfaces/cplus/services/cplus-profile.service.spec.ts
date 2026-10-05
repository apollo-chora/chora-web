import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
  TestRequest,
} from '@angular/common/http/testing';

import { CPlusProfileService } from './cplus-profile.service';
import { CPlusProfile } from '../models/cplus-profile.model';

/**
 * Wire shape of `GET /v1/me/social` (chora-gateway SocialHandler fanning
 * to chora-sharing `/v1/connections`).
 */
const WIRE_SOCIAL = {
  gcid: 'gcid-019700aa-abc',
  display_name: 'Phyllis Tan',
  avatar_url: 'https://cdn.chora.site/phyllis.png',
  atom_count: 42,
  follower_count: 12,
  following_count: 7,
  digital_skins: [],
};

describe('CPlusProfileService', () => {
  let service: CPlusProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        CPlusProfileService,
      ],
    });
    service = TestBed.inject(CPlusProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function expectSocialGet(): TestRequest {
    return httpMock.expectOne((r) =>
      r.method === 'GET' && r.url.endsWith('/v1/me/social'),
    );
  }

  describe('loadProfile (GET /v1/me/social)', () => {
    it('emits idle initially', () => {
      expect(service.profileState().status).toBe('idle');
    });

    it('maps the wire DTO to the C+ profile (view_mode=own, is_following null)', async () => {
      const promise = service.loadProfile();
      const req = expectSocialGet();
      expect(service.profileState().status).toBe('loading');
      req.flush(WIRE_SOCIAL);

      const profile = await promise;
      const state = service.profileState();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.profile).toBe(profile);
      }

      expect(profile.gcid).toBe(WIRE_SOCIAL.gcid);
      expect(profile.display_name).toBe(WIRE_SOCIAL.display_name);
      expect(profile.view_mode).toBe('own');
      expect(profile.is_following).toBeNull();
      // Wire counts map onto the view-model counters.
      expect(profile.followers_count).toBe(12);
      expect(profile.connections_count).toBe(7);
      expect(profile.contributions_count).toBe(42);
      // Mock-shape scaffolding fields remain at their zero values.
      expect(profile.tenants).toEqual([]);
      expect(profile.level).toBe(0);
      expect(profile.duel_record).toBeNull();
      expect(profile.quality_score).toBe(0);
    });

    it('loads as peer view mode (is_following=false) when viewMode=peer', async () => {
      const promise = service.loadProfile('peer');
      const req = expectSocialGet();
      req.flush(WIRE_SOCIAL);

      const profile = await promise;
      expect(profile.view_mode).toBe('peer');
      expect(profile.is_following).toBe(false);
      expect(profile.followers_count).toBe(12);
    });

    it('500 → error state with the upstream key and rethrows', async () => {
      const promise = service.loadProfile();
      expectSocialGet().flush({}, { status: 500, statusText: 'Server Error' });

      await expect(promise).rejects.toBeTruthy();
      const state = service.profileState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.code).toBe('PROFILE_LOAD_FAILED');
        expect(state.error.message).toBe('cplus.profile.error_upstream');
      }
    });

    it('401 → the not-authenticated key, and rethrows', async () => {
      const promise = service.loadProfile();
      expectSocialGet().flush({}, { status: 401, statusText: 'Unauthorized' });

      await expect(promise).rejects.toBeTruthy();
      const state = service.profileState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.profile.error_unauthenticated');
      }
    });

    it('403 → the forbidden key, and rethrows', async () => {
      const promise = service.loadProfile();
      expectSocialGet().flush({}, { status: 403, statusText: 'Forbidden' });

      await expect(promise).rejects.toBeTruthy();
      const state = service.profileState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.profile.error_forbidden');
      }
    });

    it('network error (no status) → error state with the generic key and rethrows', async () => {
      const promise = service.loadProfile();
      expectSocialGet().error(new ProgressEvent('network error'));

      await expect(promise).rejects.toBeTruthy();
      const state = service.profileState();
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.profile.error_generic');
      }
    });
  });

  describe('setViewMode', () => {
    it('triggers a reload via loadProfile with the given view mode', async () => {
      const loadSpy = vi.spyOn(service, 'loadProfile').mockResolvedValue({
        gcid: 'gcid-x',
        display_name: 'X',
        tenants: [],
        level: 0,
        is_following: null,
        view_mode: 'peer',
        familiar: { name: '', level: 0, bond_meter_percent: 0, tagline: '' },
        currency: {
          xp: 0, xp_delta_week: 0, coins: 0, coins_delta_week: 0,
          reputation: 0, reputation_tier: 'bronze', reputation_tier_progress_percent: 0,
        },
        reputation: { authoring: 0, review: 0, mentorship: 0 },
        recent_completions: [],
        contributed_atoms: [],
        duel_record: null,
        followers_count: 0,
        connections_count: 0,
        duel_score: 0,
        contributions_count: 0,
        quality_score: 0,
      } satisfies CPlusProfile);

      service.setViewMode('peer');
      expect(loadSpy).toHaveBeenCalledWith('peer');
    });

    it('defers to the BFF (real round-trip) when not spied', async () => {
      // `void this.loadProfile(viewMode)` — fire-and-forget: flush the GET
      // so the re-fetch completes cleanly and seeds success state.
      service.setViewMode('own');
      const req = expectSocialGet();
      req.flush(WIRE_SOCIAL);
      // Let the fire-and-forget promise settle.
      await Promise.resolve();
      await Promise.resolve();
      expect(service.profileState().status).toBe('success');
    });
  });
});