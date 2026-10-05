/**
 * C3: the roster screen (`/a/roster`), per the plan's section 3.2 and the
 * mockup's `rosterView`.
 *
 * Three deliberate departures from the mockup, all ruled by the orchestrator:
 *
 * 1. NO "mind" CLAUSE. The mockup's card reads
 *    `{species} · stage {n}, {stageName} · mind {c.mind}`, and its own fixtures
 *    make `mind` the LLM tier ('Flash', 'Flash Lite'). The plan's CHO-2047 line
 *    puts model tier and token ceilings behind O+, and a ruling in the plan
 *    outranks a fixture in the mockup. The card stops at the stage name.
 * 2. THE DENOMINATOR IS SERVED, NEVER DERIVED. The mockup's chip reads
 *    "{n} of 3 roster slots" against `DefaultMaxCompanionsPerUser`, which is
 *    the free-tier FALLBACK. C1a (`e2cbd0bd7`) now serves `roster_cap` and
 *    `cap_source` from the same call the create handler enforces with, so the
 *    chip renders the fraction when it is served and DROPS it when it is not,
 *    rather than falling back to 3.
 * 3. THE STATION LINE HAS A THIRD STATE. The mockup has copy for "stationed on
 *    a map" and "not on a map" only. The station comes from a SECOND read
 *    joined on `attachedFamiliarId`, so that read can fail, and "I could not
 *    find out" is not "it is idle". Rendering the failure as "not on a map"
 *    would tell a learner their companion is resting while it marches.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { RosterComponent } from './roster.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { environment } from '../../../../../environments/environment';

const base = environment.bffBaseUrl;
const FID = '00000000-0000-7000-8000-00000000e1a0';
const FID2 = '00000000-0000-7000-8000-00000000e1a1';

function companionRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    companionId: FID,
    tenantId: 't1',
    ownerGcid: 'g1',
    name: 'Ember',
    specialization: 'mathematics',
    subject: 'mathematics',
    evolutionTier: 'structural',
    skillSlotsUnlocked: 7,
    memoryContextCapacity: 4,
    skillGrants: [],
    configuredRules: { is_active: 'true' },
    memoryBankAppName: 'bank',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    growthState: {
      stage: 4,
      stageName: 'Structural',
      exp: 120,
      expToNextStage: 300,
      currentBreed: 'dragon',
      breedRevealedAt: '2026-08-02T00:00:00Z',
      effectiveLlmTier: 'flash',
      lastStageUpAt: '2026-08-30T00:00:00Z',
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
    },
    cosmetic: { equippedSkinId: null, shiny: false, rarity: 'rare' },
    ...over,
  };
}

function mapCard(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    goalId: 'g1',
    title: 'Fractions',
    northStarNote: '',
    kind: 'goal',
    status: 'active',
    attachedCompanionId: FID,
    conceptCount: 10,
    shakyCount: 2,
    masteredCount: 3,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [RosterComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(RosterComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return {
    fixture,
    cmp: fixture.componentInstance,
    httpMock,
    el: fixture.nativeElement as HTMLElement,
  };
}

/** Flush both reads the screen makes. `maps: null` fails the maps read. */
function flush(
  s: ReturnType<typeof setup>,
  companions: Record<string, unknown>[],
  maps: Record<string, unknown>[] | null,
): void {
  s.httpMock
    .expectOne(`${base}/api/v1/me/familiars`)
    .flush({ items: companions });
  const mapsReq = s.httpMock.expectOne(`${base}/api/v1/me/maps`);
  if (maps === null) {
    mapsReq.flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });
  } else {
    mapsReq.flush({ items: maps });
  }
  s.fixture.detectChanges();
}

/** Flush both reads with envelope fields on the companion response. */
function flushWithCap(
  s: ReturnType<typeof setup>,
  companions: Record<string, unknown>[],
  maps: Record<string, unknown>[],
  envelope: Record<string, unknown>,
): void {
  s.httpMock
    .expectOne(`${base}/api/v1/me/familiars`)
    .flush({ items: companions, ...envelope });
  s.httpMock.expectOne(`${base}/api/v1/me/maps`).flush({ items: maps });
  s.fixture.detectChanges();
}

describe('RosterComponent', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('renders one card per companion, plus the idle pod', () => {
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow(), companionRow({ companionId: FID2, name: 'Pingu' })], [mapCard()]);

    expect(s.el.querySelectorAll('[data-testid^="roster-card-"]')).toHaveLength(2);
    expect(s.el.querySelector('[data-testid="roster-idle-pod"]')).toBeTruthy();
  });

  it('renders the SERVED cap as a denominator (C1a landed)', () => {
    const s = setup();
    httpMock = s.httpMock;
    flushWithCap(
      s,
      [companionRow(), companionRow({ companionId: FID2 })],
      [mapCard()],
      { roster_cap: 3, cap_source: 'default' },
    );

    expect(s.cmp.rosterCap()).toBe(3);
    const chip = s.el.querySelector('[data-testid="roster-count"]');
    expect(chip?.textContent).toContain('familiar_roster.count_of_cap');
  });

  it('drops the denominator rather than inventing one when none is served', () => {
    // The whole point of roster_cap. An older server omits it, and the client
    // must NOT fall back to the free-tier 3: that either tells a learner they
    // cannot hold a companion they paid for, or offers one create will refuse.
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow(), companionRow({ companionId: FID2 })], [mapCard()]);

    expect(s.cmp.rosterCap()).toBeUndefined();
    const chip = s.el.querySelector('[data-testid="roster-count"]');
    expect(chip?.textContent).toContain('familiar_roster.count');
    expect(chip?.textContent).not.toContain('familiar_roster.count_of_cap');
  });

  it('never renders the model tier on a learner card', () => {
    // CHO-2047: model tier and token ceilings live behind O+. The wire carries
    // effectiveLlmTier and the mockup rendered it as "mind"; this asserts the
    // card does not, because the leak would look like a feature.
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow()], [mapCard()]);

    const card = s.el.querySelector(`[data-testid="roster-card-${FID}"]`)!;
    expect(card.textContent).not.toContain('flash');
    expect(card.textContent).not.toContain('Flash');
    expect(card.textContent).toContain('Structural');
  });

  it('stations a companion on the map it is bound to', () => {
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow()], [mapCard({ title: 'Fractions' })]);

    const station = s.el.querySelector(`[data-testid="roster-station-${FID}"]`);
    expect(station?.textContent).toContain('familiar_roster.stationed');
    expect(s.cmp.stationOf(FID)).toEqual({ kind: 'stationed', mapTitle: 'Fractions', goalId: 'g1' });
  });

  it('says a companion is on no map when the maps read SUCCEEDS and finds none', () => {
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow()], [mapCard({ attachedCompanionId: FID2 })]);

    expect(s.cmp.stationOf(FID)).toEqual({ kind: 'unstationed' });
    const station = s.el.querySelector(`[data-testid="roster-station-${FID}"]`);
    expect(station?.textContent).toContain('familiar_roster.unstationed');
  });

  it('does NOT claim a companion is idle when the maps read FAILED', () => {
    // The departure that matters. "Not on a map" and "I could not find out"
    // are different facts, and the mockup has words only for the first.
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow()], null);

    expect(s.cmp.stationOf(FID)).toEqual({ kind: 'unknown' });
    const station = s.el.querySelector(`[data-testid="roster-station-${FID}"]`);
    expect(station?.textContent).toContain('familiar_roster.station_unknown');
    expect(station?.textContent).not.toContain('familiar_roster.unstationed');
  });

  it('still renders the roster when the maps read fails', () => {
    // The station is one line on a card. Losing it must not lose the screen.
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow()], null);

    expect(s.el.querySelectorAll('[data-testid^="roster-card-"]')).toHaveLength(1);
    expect(s.el.querySelector('[data-testid="roster-error"]')).toBeNull();
  });

  it('is loud when the COMPANION read fails, with a retry', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.httpMock
      .expectOne(`${base}/api/v1/me/familiars`)
      .flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });
    s.httpMock.expectOne(`${base}/api/v1/me/maps`).flush({ items: [] });
    s.fixture.detectChanges();

    expect(s.el.querySelector('[data-testid="roster-error"]')).toBeTruthy();
    expect(s.el.querySelector('[data-testid="roster-retry"]')).toBeTruthy();
  });

  it('shows the empty state, not a bare pod, when nothing is held', () => {
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [], [mapCard()]);

    expect(s.el.querySelector('[data-testid="roster-empty"]')).toBeTruthy();
    expect(s.el.querySelectorAll('[data-testid^="roster-card-"]')).toHaveLength(0);
  });

  it('teases the next unlock by NAME when the wire reports one', () => {
    // C1a seam. The tease names the Skill through familiar_skill.{key}, which
    // is translated in all five locales as of b9e0b1dd8.
    const s = setup();
    httpMock = s.httpMock;
    flush(
      s,
      [
        companionRow({
          growthState: {
            ...(companionRow()['growthState'] as Record<string, unknown>),
            nextUnlocks: [
              { skillKey: 'kg_explore', skillKind: 'active', unlocksAtStage: 5, catalogueActive: true },
            ],
          },
        }),
      ],
      [mapCard()],
    );

    const tease = s.el.querySelector(`[data-testid="roster-tease-${FID}"]`);
    expect(tease?.textContent).toContain('familiar_skill.kg_explore');
  });

  it('marks a tease DORMANT when the Skill will arrive dark', () => {
    // catalogue_active is the field that must survive C1a. Without it the
    // tease promises a Skill the learner cannot use the moment they earn it,
    // which is the fake-usable failure the named tease exists to avoid.
    const s = setup();
    httpMock = s.httpMock;
    flush(
      s,
      [
        companionRow({
          growthState: {
            ...(companionRow()['growthState'] as Record<string, unknown>),
            nextUnlocks: [
              { skillKey: 'kg_explore', skillKind: 'active', unlocksAtStage: 5, catalogueActive: false },
            ],
          },
        }),
      ],
      [mapCard()],
    );

    const tease = s.el.querySelector(`[data-testid="roster-tease-${FID}"]`);
    expect(tease?.textContent).toContain('familiar_roster.tease_dormant');
  });

  it('renders NO tease at all while the list read omits next_unlocks', () => {
    // Absent is not []. Until C1a lands, the roster says nothing about
    // unlocks rather than implying there are none.
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow()], [mapCard()]);

    expect(s.el.querySelector(`[data-testid="roster-tease-${FID}"]`)).toBeNull();
  });

  it('carries the reserved companions-working-together note', () => {
    const s = setup();
    httpMock = s.httpMock;
    flush(s, [companionRow()], [mapCard()]);

    const note = s.el.querySelector('[data-testid="roster-reserved-note"]');
    expect(note?.textContent).toContain('familiar_roster.together_title');
  });
});
