import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FamiliarService } from './familiar.service';
import { FamiliarSpecies, type PersonalityTraits, type FamiliarProfile } from '../models/familiar.model';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders (GraphQL camelCase wire format)
// ---------------------------------------------------------------------------

function buildFamiliarResponse() {
  return {
    data: {
      myCompanion: {
        id: 'fam-001',
        gcid: 'gcid-learner',
        name: 'Spark',
        species: 'fox',
        personality: 'curious',
        level: 5,
        xp: 1200,
        mood: 'happy',
        avatarUrl: 'https://example.com/spark.png',
        createdAt: '2026-01-15T00:00:00Z',
        updatedAt: '2026-03-16T10:00:00Z',
      },
    },
  };
}

function buildFamiliarStatsResponse() {
  return {
    data: {
      myFamiliarStats: {
        familiarId: 'fam-001',
        totalInteractions: 150,
        encouragementsGiven: 45,
        questsCompleted: 12,
        streakAssists: 7,
        moodHistory: [
          { mood: 'happy', recordedAt: '2026-03-16T10:00:00Z' },
          { mood: 'excited', recordedAt: '2026-03-15T10:00:00Z' },
        ],
      },
    },
  };
}

/** REST mutation response (FamiliarProfile domain shape, returned by BFF). */
function buildFamiliarProfile(overrides: Partial<FamiliarProfile> = {}): FamiliarProfile {
  return {
    id: 'fam-001',
    gcid: 'gcid-learner',
    tenantId: 'tenant-001',
    displayName: 'Spark',
    speciesType: FamiliarSpecies.Fox,
    personalityTraits: {
      curiosity: 6,
      encouragement: 4,
      humor: 4,
      detail: 3,
      formality: 3,
    },
    evolutionLevel: 1,
    currentSkinId: null,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

const TRAITS: PersonalityTraits = {
  curiosity: 7,
  encouragement: 5,
  humor: 4,
  detail: 3,
  formality: 2,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FamiliarService', () => {
  let service: FamiliarService;
  let httpMock: HttpTestingController;
  const graphqlUrl = `${environment.bffBaseUrl}/api/v1/graphql`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        FamiliarService,
      ],
    });
    service = TestBed.inject(FamiliarService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with loading state', () => {
    expect(service.state().status).toBe('loading');
    expect(service.isSummoned()).toBe(false);
    expect(service.evolutionLevel()).toBe(0);
  });

  it('starts with idle stats state', () => {
    expect(service.statsState().status).toBe('idle');
    expect(service.stats()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // loadProfile
  // -----------------------------------------------------------------------

  describe('loadProfile', () => {
    it('sends GraphQL query for myCompanion', () => {
      service.loadProfile().subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.query).toContain('myCompanion');

      req.flush(buildFamiliarResponse());
    });

    it('maps familiar profile on success', () => {
      service.loadProfile().subscribe();
      httpMock.expectOne(graphqlUrl).flush(buildFamiliarResponse());

      expect(service.state().status).toBe('success');
      expect(service.isSummoned()).toBe(true);
      expect(service.evolutionLevel()).toBe(5);

      const s = service.state();
      if (s.status === 'success') {
        expect(s.profile.id).toBe('fam-001');
        expect(s.profile.displayName).toBe('Spark');
        expect(s.profile.speciesType).toBe('fox');
        expect(s.profile.evolutionLevel).toBe(5);
      }
    });

    it('sets not_summoned when familiar is null', () => {
      service.loadProfile().subscribe();
      httpMock.expectOne(graphqlUrl).flush({
        data: { myCompanion: null },
      });

      expect(service.state().status).toBe('not_summoned');
      expect(service.isSummoned()).toBe(false);
    });

    it('sets error state on GraphQL failure', () => {
      service.loadProfile().subscribe();
      httpMock.expectOne(graphqlUrl).flush({
        data: null,
        errors: [{ message: 'Not authorized' }],
      });

      expect(service.state().status).toBe('error');
    });

    it('sets error state on network failure', () => {
      service.loadProfile().subscribe();
      httpMock.expectOne(graphqlUrl).error(new ProgressEvent('error'));

      expect(service.state().status).toBe('error');
    });
  });

  // -----------------------------------------------------------------------
  // loadStats
  // -----------------------------------------------------------------------

  describe('loadStats', () => {
    it('sends GraphQL query for myFamiliarStats', () => {
      service.loadStats().subscribe();

      const req = httpMock.expectOne(graphqlUrl);
      expect(req.request.body.query).toContain('myFamiliarStats');

      req.flush(buildFamiliarStatsResponse());
    });

    it('maps familiar stats on success', () => {
      service.loadStats().subscribe();
      httpMock.expectOne(graphqlUrl).flush(buildFamiliarStatsResponse());

      expect(service.statsState().status).toBe('success');
      const stats = service.stats();
      expect(stats).toBeTruthy();
      expect(stats?.familiar_id).toBe('fam-001');
      expect(stats?.total_interactions).toBe(150);
      expect(stats?.encouragements_given).toBe(45);
      expect(stats?.quests_completed).toBe(12);
      expect(stats?.streak_assists).toBe(7);
      expect(stats?.mood_history).toHaveLength(2);
      expect(stats?.mood_history[0].mood).toBe('happy');
      expect(stats?.mood_history[0].recorded_at).toBe('2026-03-16T10:00:00Z');
    });

    it('sets error state on failure', () => {
      service.loadStats().subscribe();
      httpMock.expectOne(graphqlUrl).flush({
        data: null,
        errors: [{ message: 'Stats not available' }],
      });

      expect(service.statsState().status).toBe('error');
    });

    it('sets error state on network failure', () => {
      service.loadStats().subscribe();
      httpMock.expectOne(graphqlUrl).error(new ProgressEvent('error'));

      expect(service.statsState().status).toBe('error');
    });

    it('keeps stats null and does not enter success when myFamiliarStats is null', () => {
      service.loadStats().subscribe();
      httpMock.expectOne(graphqlUrl).flush({
        data: { myFamiliarStats: null },
      });

      // null stats short-circuits the success branch — state stays loading
      expect(service.statsState().status).toBe('loading');
      expect(service.stats()).toBeNull();
    });

    it('maps an empty mood_history array', () => {
      service.loadStats().subscribe();
      httpMock.expectOne(graphqlUrl).flush({
        data: {
          myFamiliarStats: {
            familiarId: 'fam-002',
            totalInteractions: 0,
            encouragementsGiven: 0,
            questsCompleted: 0,
            streakAssists: 0,
            moodHistory: [],
          },
        },
      });

      expect(service.statsState().status).toBe('success');
      expect(service.stats()?.familiar_id).toBe('fam-002');
      expect(service.stats()?.mood_history).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // loadProfile — additional emission semantics
  // -----------------------------------------------------------------------

  describe('loadProfile emissions', () => {
    it('emits the mapped profile to subscribers on success', () => {
      let emitted: FamiliarProfile | null = 'pending' as unknown as FamiliarProfile | null;
      service.loadProfile().subscribe((p) => {
        emitted = p;
      });
      httpMock.expectOne(graphqlUrl).flush(buildFamiliarResponse());

      expect(emitted).not.toBeNull();
      expect(emitted!.id).toBe('fam-001');
      expect(emitted!.tenantId).toBe('');
      // GraphQL profile maps personality traits to zeroed defaults
      expect(emitted!.personalityTraits).toEqual({
        curiosity: 0,
        encouragement: 0,
        humor: 0,
        detail: 0,
        formality: 0,
      });
      expect(emitted!.currentSkinId).toBeNull();
    });

    it('emits null and stays not_summoned when myCompanion is null', () => {
      let emitted: FamiliarProfile | null = 'pending' as unknown as FamiliarProfile | null;
      service.loadProfile().subscribe((p) => {
        emitted = p;
      });
      httpMock.expectOne(graphqlUrl).flush({ data: { myCompanion: null } });

      expect(emitted).toBeNull();
      expect(service.state().status).toBe('not_summoned');
    });

    it('emits null (swallowed error) and records error code on failure', () => {
      let emitted: FamiliarProfile | null = 'pending' as unknown as FamiliarProfile | null;
      service.loadProfile().subscribe((p) => {
        emitted = p;
      });
      httpMock.expectOne(graphqlUrl).error(new ProgressEvent('boom'));

      expect(emitted).toBeNull();
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('FAMILIAR_LOAD_FAILED');
      }
    });
  });

  // -----------------------------------------------------------------------
  // summonFamiliar (REST POST)
  // -----------------------------------------------------------------------

  describe('summonFamiliar', () => {
    const summonUrl = `${environment.bffBaseUrl}/api/v1/familiar`;

    it('sets summoningState to submitting before the request resolves', () => {
      service.summonFamiliar(FamiliarSpecies.Fox, 'Spark', TRAITS).subscribe();

      expect(service.summoningState().status).toBe('submitting');

      httpMock.expectOne(summonUrl).flush(buildFamiliarProfile());
    });

    it('POSTs the species/displayName/traits payload to /api/v1/familiar', () => {
      service.summonFamiliar(FamiliarSpecies.Owl, 'Hoot', TRAITS).subscribe();

      const req = httpMock.expectOne(summonUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        species_type: FamiliarSpecies.Owl,
        display_name: 'Hoot',
        personality_traits: TRAITS,
      });
      req.flush(buildFamiliarProfile({ speciesType: FamiliarSpecies.Owl, displayName: 'Hoot' }));
    });

    it('on success: sets summoningState + state to success and flags justSummoned', () => {
      let emitted: FamiliarProfile | null = 'pending' as unknown as FamiliarProfile | null;
      service
        .summonFamiliar(FamiliarSpecies.Dragon, 'Ember', TRAITS)
        .subscribe((p) => {
          emitted = p;
        });

      const profile = buildFamiliarProfile({
        speciesType: FamiliarSpecies.Dragon,
        displayName: 'Ember',
        evolutionLevel: 1,
      });
      httpMock.expectOne(summonUrl).flush(profile);

      expect(emitted).toEqual(profile);
      expect(service.summoningState().status).toBe('success');
      expect(service.state().status).toBe('success');
      expect(service.isSummoned()).toBe(true);
      expect(service.evolutionLevel()).toBe(1);
      expect(service.justSummoned()).toBe(true);

      const ss = service.summoningState();
      if (ss.status === 'success') {
        expect(ss.profile.displayName).toBe('Ember');
      }
    });

    it('on error: emits null, sets summoningState error with SUMMON_FAILED, leaves state untouched', () => {
      let emitted: FamiliarProfile | null = 'pending' as unknown as FamiliarProfile | null;
      service
        .summonFamiliar(FamiliarSpecies.Cat, 'Whiskers', TRAITS)
        .subscribe((p) => {
          emitted = p;
        });

      httpMock
        .expectOne(summonUrl)
        .flush({ message: 'over capacity' }, { status: 500, statusText: 'Server Error' });

      expect(emitted).toBeNull();
      const ss = service.summoningState();
      expect(ss.status).toBe('error');
      if (ss.status === 'error') {
        expect(ss.error.code).toBe('SUMMON_FAILED');
      }
      // profile state never moved off the initial loading status
      expect(service.state().status).toBe('loading');
      expect(service.justSummoned()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // updatePersonality (REST PUT)
  // -----------------------------------------------------------------------

  describe('updatePersonality', () => {
    const personalityUrl = (id: string) =>
      `${environment.bffBaseUrl}/api/v1/familiar/${id}/personality`;

    it('PUTs the traits payload to /api/v1/familiar/{id}/personality', () => {
      service.updatePersonality('fam-001', TRAITS).subscribe();

      const req = httpMock.expectOne(personalityUrl('fam-001'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ personality_traits: TRAITS });
      req.flush(buildFamiliarProfile());
    });

    it('on success: updates profile state with the returned profile', () => {
      let emitted: FamiliarProfile | null = 'pending' as unknown as FamiliarProfile | null;
      const updated = buildFamiliarProfile({
        personalityTraits: TRAITS,
        evolutionLevel: 9,
      });
      service.updatePersonality('fam-001', TRAITS).subscribe((p) => {
        emitted = p;
      });
      httpMock.expectOne(personalityUrl('fam-001')).flush(updated);

      expect(emitted).toEqual(updated);
      expect(service.state().status).toBe('success');
      expect(service.evolutionLevel()).toBe(9);
      const s = service.state();
      if (s.status === 'success') {
        expect(s.profile.personalityTraits).toEqual(TRAITS);
      }
    });

    it('on error: emits null and sets state error with PERSONALITY_UPDATE_FAILED', () => {
      let emitted: FamiliarProfile | null = 'pending' as unknown as FamiliarProfile | null;
      service.updatePersonality('fam-001', TRAITS).subscribe((p) => {
        emitted = p;
      });
      httpMock
        .expectOne(personalityUrl('fam-001'))
        .flush({ message: 'nope' }, { status: 422, statusText: 'Unprocessable Entity' });

      expect(emitted).toBeNull();
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('PERSONALITY_UPDATE_FAILED');
      }
    });

    it('encodes the familiar id into the URL path verbatim', () => {
      service.updatePersonality('fam-xyz-123', TRAITS).subscribe();
      const req = httpMock.expectOne(personalityUrl('fam-xyz-123'));
      expect(req.request.method).toBe('PUT');
      req.flush(buildFamiliarProfile({ id: 'fam-xyz-123' }));
    });
  });

  // -----------------------------------------------------------------------
  // summoning / signals reset coverage
  // -----------------------------------------------------------------------

  describe('resetState clears summoning + justSummoned', () => {
    it('resets summoningState to idle and justSummoned to false', () => {
      const summonUrl = `${environment.bffBaseUrl}/api/v1/familiar`;
      service.summonFamiliar(FamiliarSpecies.Phoenix, 'Blaze', TRAITS).subscribe();
      httpMock.expectOne(summonUrl).flush(buildFamiliarProfile({ displayName: 'Blaze' }));

      expect(service.summoningState().status).toBe('success');
      expect(service.justSummoned()).toBe(true);

      service.resetState();

      expect(service.summoningState().status).toBe('idle');
      expect(service.justSummoned()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // State reset
  // -----------------------------------------------------------------------

  describe('resetState', () => {
    it('resets all state', () => {
      service.loadProfile().subscribe();
      httpMock.expectOne(graphqlUrl).flush(buildFamiliarResponse());

      service.loadStats().subscribe();
      httpMock.expectOne(graphqlUrl).flush(buildFamiliarStatsResponse());

      expect(service.isSummoned()).toBe(true);
      expect(service.stats()).toBeTruthy();

      service.resetState();

      expect(service.state().status).toBe('loading');
      expect(service.statsState().status).toBe('idle');
      expect(service.messages()).toEqual([]);
      expect(service.skins()).toEqual([]);
      expect(service.milestones()).toEqual([]);
    });
  });
});
