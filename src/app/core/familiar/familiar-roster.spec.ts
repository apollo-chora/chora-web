/**
 * C3: the roster projection.
 *
 * ⚠ THE FINDING THIS FIXES. The list read is ALREADY the enriched
 * `ListRosterByOwner` projection that killed the per-companion growth N+1 under
 * debt #44: `instanceResp` carries `subject`, `evolution_tier`,
 * `skill_slots_unlocked`, a `cosmetic` block and an inline `growth_state` with
 * the stage name, the breed, the LLM tier and `last_stage_up_at`. The SPA then
 * threw almost all of it away, mapping every row through `wireToSummary` into
 * eight fields. So the roster screen's data was never a backend ask; it was
 * already on the wire and being discarded one function later.
 *
 * The added fields are OPTIONAL, deliberately. Eleven components already
 * consume `FamiliarSummary`, and widening it with required fields would break
 * every one of them for a screen none of them render.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { FamiliarGrowthService } from './familiar-growth.service';
import { environment } from '../../../environments/environment';

const url = `${environment.bffBaseUrl}/api/v1/me/familiars`;

/** One roster row in the shape `listCompanionInstances` actually serves. */
function wireRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    companionId: '00000000-0000-7000-8000-00000000e1a0',
    tenantId: 't1',
    ownerGcid: 'g1',
    name: 'Ari',
    specialization: 'mathematics',
    subject: 'mathematics',
    evolutionTier: 'structural',
    skillSlotsUnlocked: 7,
    memoryContextCapacity: 4,
    skillGrants: ['progress_mirror'],
    configuredRules: { is_active: 'true' },
    memoryBankAppName: 'bank',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    growthState: {
      stage: 4,
      stageName: 'Structural',
      exp: 120,
      expToNextStage: 300,
      currentBreed: 'sylph',
      breedRevealedAt: '2026-08-02T00:00:00Z',
      effectiveLlmTier: 'flash',
      lastStageUpAt: '2026-08-30T00:00:00Z',
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
    },
    cosmetic: { equippedSkinId: null, shiny: true, rarity: 'rare' },
    ...over,
  };
}

describe('roster projection keeps what the wire already sends', () => {
  let svc: FamiliarGrowthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        FamiliarGrowthService,
      ],
    });
    svc = TestBed.inject(FamiliarGrowthService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  function listOne(over: Record<string, unknown> = {}) {
    let rows: readonly unknown[] = [];
    svc.listMyFamiliars().subscribe((r) => (rows = r));
    httpMock.expectOne(url).flush({ items: [wireRow(over)] });
    return rows[0] as Record<string, unknown>;
  }

  it('carries the station fields the roster screen renders', () => {
    const row = listOne();
    expect(row['subject']).toBe('mathematics');
    expect(row['evolutionTier']).toBe('structural');
    expect(row['stageName']).toBe('Structural');
    expect(row['skillSlotsUnlocked']).toBe(7);
  });

  it('carries the march fields, including when the last stage-up happened', () => {
    // The stage-up moment is what the tease hangs off, so the roster needs to
    // know it without a second read per companion.
    const row = listOne();
    expect(row['lastStageUpAt']).toBe('2026-08-30T00:00:00Z');
    expect(row['rarity']).toBe('rare');
  });

  it('keeps every field the eight-field summary already had', () => {
    // The widening is ADDITIVE. Eleven components read this shape and none of
    // them render the roster, so a rename or a drop here breaks screens that
    // have nothing to do with C3.
    const row = listOne();
    expect(row['familiarId']).toBe('00000000-0000-7000-8000-00000000e1a0');
    expect(row['displayName']).toBe('Ari');
    expect(row['species']).toBe('sylph');
    expect(row['growthStage']).toBe(4);
    expect(row['shinyVariant']).toBe(true);
    expect(row['expCurrent']).toBe(120);
    expect(row['expNextThreshold']).toBe(300);
    expect(row['isActive']).toBe(true);
  });

  it('reads next_unlocks when the list read carries it (C1a seam)', () => {
    // ⚠ The list read does NOT carry this today: next_unlocks is served only by
    // handleGetGrowth, and that handler's own comment says the embedded
    // stateResp omits it. subagent5 is widening it in C1a. Reading it here
    // rather than later means C1a drops in with no FE change, and the tease
    // renders the moment the field appears.
    const row = listOne({
      growthState: {
        ...(wireRow()['growthState'] as Record<string, unknown>),
        nextUnlocks: [
          {
            skillKey: 'kg_explore',
            skillKind: 'active',
            unlocksAtStage: 5,
            catalogueActive: false,
          },
        ],
      },
    });
    expect(row['nextUnlocks']).toEqual([
      {
        skillKey: 'kg_explore',
        skillKind: 'active',
        unlocksAtStage: 5,
        catalogueActive: false,
      },
    ]);
  });

  it('leaves nextUnlocks ABSENT when the wire omits it, never an empty list', () => {
    // Absent means "this read does not report unlocks"; [] means "reported,
    // and there are none", which is what the top stage looks like. Collapsing
    // them would render a top-stage companion and an un-widened wire
    // identically, and the tease strip could not tell them apart.
    const row = listOne();
    expect(row['nextUnlocks']).toBeUndefined();
  });

  it('drops a rarity it does not recognise rather than casting it through', () => {
    // ⚠ Written AFTER the narrowing, so this is a pin, not a RED, and a
    // negative control was run against it: removing the guard makes it fail.
    // It matters because the roster paints by rarity, and a cast would let a
    // rarity this SPA has never heard of through as though it were understood.
    // Absent renders as no rarity treatment; a wrong one renders as a lie.
    const row = listOne({
      cosmetic: { equippedSkinId: null, shiny: false, rarity: 'mythic' },
    });
    expect(row['rarity']).toBeUndefined();
  });

  it('keeps every rarity it DOES recognise, including the empty one', () => {
    // '' is a real member of the set (pre-hatch), not a missing value, so it
    // must survive rather than being swept up with the unknowns.
    for (const r of ['', 'common', 'uncommon', 'rare', 'legendary']) {
      const row = listOne({
        cosmetic: { equippedSkinId: null, shiny: false, rarity: r },
      });
      expect(row['rarity']).toBe(r);
    }
  });

  it('does not throw when a row arrives without growth_state or cosmetic', () => {
    // Those blocks are `omitempty` pointers and are populated only on the LIST
    // response; the create and per-instance reads return the base shape. The
    // current mapper dereferences both unguarded, so a base-shape row reaching
    // it throws rather than degrading.
    let rows: readonly unknown[] = [];
    let err: unknown = null;
    svc.listMyFamiliars().subscribe({
      next: (r) => (rows = r),
      error: (e) => (err = e),
    });
    const bare = wireRow();
    delete bare['growthState'];
    delete bare['cosmetic'];
    httpMock.expectOne(url).flush({ items: [bare] });

    expect(err).toBeNull();
    const row = rows[0] as Record<string, unknown>;
    expect(row['familiarId']).toBe('00000000-0000-7000-8000-00000000e1a0');
    expect(row['growthStage']).toBe(0);
  });
});

/**
 * The envelope fields (C1a, `e2cbd0bd7`).
 *
 * `roster_cap` and `cap_source` sit on the ENVELOPE, not on an item, and
 * `listMyFamiliars` maps `items` and throws the envelope away. `listRoster`
 * keeps it, and `listMyFamiliars` now delegates so there is one read and one
 * mapping rather than two that can drift.
 */
describe('listRoster keeps the envelope the array read discards', () => {
  let svc: FamiliarGrowthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        FamiliarGrowthService,
      ],
    });
    svc = TestBed.inject(FamiliarGrowthService);
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  it('returns the cap and its source alongside the companions', () => {
    let got: Record<string, unknown> | null = null;
    svc.listRoster().subscribe((r) => (got = r as never));
    httpMock
      .expectOne(url)
      .flush({ items: [wireRow()], roster_cap: 3, cap_source: 'default' });

    expect(got!['rosterCap']).toBe(3);
    expect(got!['capSource']).toBe('default');
    expect((got!['companions'] as readonly unknown[]).length).toBe(1);
  });

  it('reads the camelCase spelling too, since the bridge may camelise', () => {
    // The skills family arrives already camelised through the FamiliarBridge
    // while other reads do not, and this envelope is new enough that which hop
    // it takes is not yet settled. Accepting both costs one line and removes a
    // class of silent zero.
    let got: Record<string, unknown> | null = null;
    svc.listRoster().subscribe((r) => (got = r as never));
    httpMock
      .expectOne(url)
      .flush({ items: [], rosterCap: 5, capSource: 'entitlement' });

    expect(got!['rosterCap']).toBe(5);
    expect(got!['capSource']).toBe('entitlement');
  });

  it('reports the cap as UNKNOWN when the server does not send one', () => {
    // An older server omits it. Rendering "1 of 0" would be nonsense and
    // rendering "1 of 3" would re-invent the denominator this field exists to
    // stop the client inventing, so absent stays absent.
    let got: Record<string, unknown> | null = null;
    svc.listRoster().subscribe((r) => (got = r as never));
    httpMock.expectOne(url).flush({ items: [wireRow()] });

    expect(got!['rosterCap']).toBeUndefined();
  });

  it('treats a non-positive cap as unknown rather than as a real zero', () => {
    // A cap of 0 would mean "you may hold no companions", which the create
    // handler never enforces; far likelier is a serialisation miss.
    let got: Record<string, unknown> | null = null;
    svc.listRoster().subscribe((r) => (got = r as never));
    httpMock.expectOne(url).flush({ items: [], roster_cap: 0, cap_source: 'default' });

    expect(got!['rosterCap']).toBeUndefined();
  });

  it('leaves listMyFamiliars returning the bare array for its 11 callers', () => {
    let rows: readonly unknown[] = [];
    svc.listMyFamiliars().subscribe((r) => (rows = r));
    httpMock
      .expectOne(url)
      .flush({ items: [wireRow()], roster_cap: 3, cap_source: 'default' });

    expect(Array.isArray(rows)).toBe(true);
    expect((rows[0] as Record<string, unknown>)['displayName']).toBe('Ari');
  });
});
