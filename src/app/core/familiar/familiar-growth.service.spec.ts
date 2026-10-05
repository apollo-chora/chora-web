import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { FamiliarGrowthService } from './familiar-growth.service';
import { environment } from '../../../environments/environment';

describe('FamiliarGrowthService', () => {
  let svc: FamiliarGrowthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(FamiliarGrowthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Mock fallbacks stripped 2026-05-16 per the no-debts directive — see
  // familiar-growth.service.ts header comment. Tests below assert the new
  // fail-loud contract: BFF errors propagate; no synthesised data is emitted.
  it('propagates BFF error on getGrowth — fail-loud, no mock', () => {
    let capturedNext: unknown = null;
    let capturedError: unknown = null;
    svc.getGrowth('eira-001').subscribe({
      next: (s) => (capturedNext = s),
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/growth`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(capturedNext).toBeNull();
    expect(capturedError).not.toBeNull();
  });

  it('propagates BFF error on listMyFamiliars — fail-loud, no mock', () => {
    let capturedNext: unknown = null;
    let capturedError: unknown = null;
    svc.listMyFamiliars().subscribe({
      next: (r) => (capturedNext = r),
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(capturedNext).toBeNull();
    expect(capturedError).not.toBeNull();
  });

  it('reveal POSTs /reveal, unwraps {data:T} and returns the persisted roll (CHO-2229)', () => {
    let captured: unknown = null;
    svc.reveal('eira-001').subscribe((r) => (captured = r));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/reveal`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({
      data: {
        species: 'fox',
        shinyVariant: true,
        rarity: 'uncommon',
        rolledProbability: 12.5,
        revealedAt: '2026-07-17T03:00:00Z',
        alreadyRevealed: false,
        state: { familiarId: 'eira-001', growthStage: 0 },
      },
    });
    expect(captured).not.toBeNull();
    expect((captured as { species: string }).species).toBe('fox');
    expect((captured as { alreadyRevealed: boolean }).alreadyRevealed).toBe(false);
  });

  it('propagates BFF error on reveal — fail-loud, no mock', () => {
    let capturedNext: unknown = null;
    let capturedError: unknown = null;
    svc.reveal('eira-001').subscribe({
      next: (r) => (capturedNext = r),
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/reveal`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(capturedNext).toBeNull();
    expect(capturedError).not.toBeNull();
  });

  it('propagates BFF error on hatch — fail-loud, no mock', () => {
    let capturedNext: unknown = null;
    let capturedError: unknown = null;
    svc
      .hatch('eira-001', {
        displayName: 'Eira',
        tone: 'encouraging',
        learnerPersona: 'cert-focused',
      })
      .subscribe({
        next: (r) => (capturedNext = r),
        error: (e) => (capturedError = e),
      });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/hatch`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(capturedNext).toBeNull();
    expect(capturedError).not.toBeNull();
  });

  it('propagates BFF error on getEggCatalog — fail-loud, no mock', () => {
    let capturedNext: unknown = null;
    let capturedError: unknown = null;
    svc.getEggCatalog().subscribe({
      next: (c) => (capturedNext = c),
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/familiar-eggs/catalog`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(capturedNext).toBeNull();
    expect(capturedError).not.toBeNull();
  });

  it('propagates BFF error on getEggOdds — fail-loud, no mock', () => {
    let capturedNext: unknown = null;
    let capturedError: unknown = null;
    svc.getEggOdds('egg.standard.v1').subscribe({
      next: (o) => (capturedNext = o),
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/familiar-eggs/egg.standard.v1/odds`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(capturedNext).toBeNull();
    expect(capturedError).not.toBeNull();
  });

  it('getEggCatalog unwraps BFF envelope data successfully', () => {
    let captured: unknown = null;
    svc.getEggCatalog().subscribe((c) => (captured = c));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/familiar-eggs/catalog`)
      .flush({
        data: {
          skus: [
            {
              sku: 'egg.trial.v1',
              displayName: 'Trial',
              description: 'free',
              priceMicros: 0,
              currency: 'SGD',
            },
          ],
        },
      });
    const skus = (captured as { skus: { sku: string; priceMicros: number }[] }).skus;
    expect(skus.length).toBe(1);
    expect(skus[0].sku).toBe('egg.trial.v1');
    expect(skus[0].priceMicros).toBe(0);
  });

  it('getEggOdds unwraps BFF envelope data successfully', () => {
    let captured: unknown = null;
    svc.getEggOdds('egg.legendary.v1').subscribe((o) => (captured = o));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/familiar-eggs/egg.legendary.v1/odds`)
      .flush({
        data: {
          eggSku: 'egg.legendary.v1',
          odds: [
            { species: 'dragon', probability: 40, rarity: 'legendary' },
            { species: 'phoenix', probability: 20, rarity: 'legendary' },
          ],
          totalWeight: 60,
          distributionUpdatedAt: '2026-05-13T00:00:00Z',
        },
      });
    const odds = (captured as { odds: { species: string; probability: number }[] }).odds;
    const dragon = odds.find((o) => o.species === 'dragon')?.probability ?? 0;
    const phoenix = odds.find((o) => o.species === 'phoenix')?.probability ?? 0;
    expect(dragon + phoenix).toBeGreaterThanOrEqual(50);
  });

  it('listMyFamiliars maps enriched {items:[FamiliarInstanceWire]} → FamiliarSummary[] (B5 round-21)', () => {
    let captured: unknown = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({
        items: [
          {
            companionId: '00000000-0000-7000-8000-00000000e1a0',
            tenantId: 't-phy',
            ownerGcid: 'gcid-phy',
            name: 'Eira',
            specialization: 'curiosity',
            evolutionTier: 'apprentice',
            skillSlotsUnlocked: 1,
            memoryContextCapacity: 8000,
            skillGrants: ['cite_atom'],
            configuredRules: { is_active: 'true' },
            memoryBankAppName: 'familiar:eira-001',
            createdAt: '2026-05-13T00:00:00Z',
            updatedAt: '2026-05-16T00:00:00Z',
            growthState: {
              stage: 2,
              stageName: 'fledgling',
              exp: 200,
              expToNextStage: 200,
              currentBreed: 'dragon',
              breedRevealedAt: '2026-05-13T00:00:00Z',
              effectiveLlmTier: 'flash-lite',
              lastStageUpAt: '2026-05-13T00:00:00Z',
              resonantAtomId: 'atom-cspo-001',
              ahaMomentConsumed: false,
              ahaMomentActiveUntil: null,
            },
            cosmetic: {
              equippedSkinId: null,
              shiny: false,
              rarity: 'common',
            },
          },
        ],
      });
    const list = captured as readonly {
      familiarId: string;
      displayName: string;
      species: string;
      growthStage: number;
      shinyVariant: boolean;
      expCurrent: number;
      expNextThreshold: number;
      isActive: boolean;
    }[];
    expect(list.length).toBe(1);
    expect(list[0].familiarId).toBe('00000000-0000-7000-8000-00000000e1a0');
    expect(list[0].displayName).toBe('Eira');
    // Sourced direct from growthState.currentBreed (no JSONB derivation).
    expect(list[0].species).toBe('dragon');
    // Sourced direct from growthState.stage.
    expect(list[0].growthStage).toBe(2);
    // Sourced direct from growthState.exp.
    expect(list[0].expCurrent).toBe(200);
    // Sourced direct from growthState.expToNextStage (no STAGE_EXP_THRESHOLDS lookup).
    expect(list[0].expNextThreshold).toBe(200);
    // Sourced direct from cosmetic.shiny.
    expect(list[0].shinyVariant).toBe(false);
    expect(list[0].isActive).toBe(true);
  });

  it('listMyFamiliars passes through Phyllis non-dragon breeds (owl/fox/dragon shiny rare)', () => {
    let captured: unknown = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({
        items: [
          {
            companionId: 'f-pyth',
            tenantId: 't',
            ownerGcid: 'g',
            name: 'Pythagoras',
            specialization: 's',
            evolutionTier: 't',
            skillSlotsUnlocked: 0,
            memoryContextCapacity: 0,
            skillGrants: [],
            configuredRules: {},
            memoryBankAppName: '',
            createdAt: '',
            updatedAt: '',
            growthState: {
              stage: 1,
              stageName: 'baby',
              exp: 150,
              expToNextStage: 50,
              currentBreed: 'owl',
              breedRevealedAt: '2026-05-13T00:00:00Z',
              effectiveLlmTier: 'flash-lite',
              lastStageUpAt: null,
              resonantAtomId: '',
              ahaMomentConsumed: false,
              ahaMomentActiveUntil: null,
            },
            cosmetic: { equippedSkinId: null, shiny: false, rarity: 'common' },
          },
          {
            companionId: 'f-gal',
            tenantId: 't',
            ownerGcid: 'g',
            name: 'Galileo',
            specialization: 's',
            evolutionTier: 't',
            skillSlotsUnlocked: 0,
            memoryContextCapacity: 0,
            skillGrants: [],
            configuredRules: {},
            memoryBankAppName: '',
            createdAt: '',
            updatedAt: '',
            growthState: {
              stage: 5,
              stageName: 'teen',
              exp: 28000,
              expToNextStage: 3000,
              currentBreed: 'dragon',
              breedRevealedAt: '2026-05-13T00:00:00Z',
              effectiveLlmTier: 'flash',
              lastStageUpAt: '2026-05-15T00:00:00Z',
              resonantAtomId: '',
              ahaMomentConsumed: true,
              ahaMomentActiveUntil: null,
            },
            cosmetic: { equippedSkinId: null, shiny: true, rarity: 'rare' },
          },
        ],
      });
    const list = captured as readonly {
      displayName: string;
      species: string;
      growthStage: number;
      shinyVariant: boolean;
      expCurrent: number;
      isActive: boolean;
    }[];
    expect(list.length).toBe(2);
    // Pythagoras passes through `owl` faithfully — rendering layer handles
    // the dragon-only asset fallback (per BreedArt internal).
    expect(list[0].species).toBe('owl');
    expect(list[0].growthStage).toBe(1);
    expect(list[0].expCurrent).toBe(150);
    expect(list[0].isActive).toBe(true); // index === 0 default
    expect(list[1].species).toBe('dragon');
    expect(list[1].growthStage).toBe(5);
    expect(list[1].shinyVariant).toBe(true);
    expect(list[1].isActive).toBe(false);
  });

  it('listMyFamiliars handles pre-hatch Familiar (empty currentBreed, stage=0)', () => {
    let captured: unknown = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({
        items: [
          {
            companionId: 'f-egg',
            tenantId: 't',
            ownerGcid: 'g',
            name: 'Unhatched',
            specialization: '',
            evolutionTier: '',
            skillSlotsUnlocked: 0,
            memoryContextCapacity: 0,
            skillGrants: [],
            configuredRules: {},
            memoryBankAppName: '',
            createdAt: '',
            updatedAt: '',
            growthState: {
              stage: 0,
              stageName: 'egg',
              exp: 0,
              expToNextStage: 0,
              currentBreed: '',
              breedRevealedAt: null,
              effectiveLlmTier: '',
              lastStageUpAt: null,
              resonantAtomId: '',
              ahaMomentConsumed: false,
              ahaMomentActiveUntil: null,
            },
            cosmetic: { equippedSkinId: null, shiny: false, rarity: '' },
          },
        ],
      });
    const list = captured as readonly {
      species: string;
      growthStage: number;
      expCurrent: number;
      expNextThreshold: number;
    }[];
    // Pre-hatch passes through `''` — rendering layer applies the
    // default-dragon fallback (per BreedArt internal + breedStageLabel).
    expect(list[0].species).toBe('');
    expect(list[0].growthStage).toBe(0);
    expect(list[0].expCurrent).toBe(0);
    expect(list[0].expNextThreshold).toBe(0);
  });

  it('listMyFamiliars emits empty array when items missing', () => {
    let captured: readonly unknown[] | null = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({});
    expect(captured).toEqual([]);
  });

  it('listMyFamiliars emits empty array when items present but empty (?? present arm)', () => {
    let captured: readonly unknown[] | null = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({ items: [] });
    expect(captured).toEqual([]);
  });

  // ── clampStage out-of-range arms (n>=0 && n<=6 ? n : 0) ──

  it('listMyFamiliars clamps a negative stage to 0 (n>=0 false short-circuit)', () => {
    let captured: unknown = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({ items: [stageRow(-1)] });
    const list = captured as readonly { growthStage: number }[];
    expect(list[0].growthStage).toBe(0);
  });

  it('listMyFamiliars clamps an over-range stage to 0 (n<=6 false short-circuit)', () => {
    let captured: unknown = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({ items: [stageRow(99)] });
    const list = captured as readonly { growthStage: number }[];
    expect(list[0].growthStage).toBe(0);
  });

  it('listMyFamiliars keeps a max in-range stage of 6 (ternary truthy, both && operands true)', () => {
    let captured: unknown = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({ items: [stageRow(6)] });
    const list = captured as readonly { growthStage: number }[];
    expect(list[0].growthStage).toBe(6);
  });

  // ── wireToSummary isActive optional-chain + || arms ──

  it('listMyFamiliars: missing configuredRules at non-zero index → isActive false (?. undefined arm)', () => {
    let captured: unknown = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    const head = stageRow(2);
    const tail = stageRow(2);
    // Drop configuredRules on the second row to exercise `wire.configuredRules?.[...]`.
    delete (tail as Record<string, unknown>)['configuredRules'];
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({ items: [head, tail] });
    const list = captured as readonly { isActive: boolean }[];
    expect(list[0].isActive).toBe(true); // index === 0
    expect(list[1].isActive).toBe(false); // ?. -> undefined, index !== 0
  });

  it('listMyFamiliars: is_active="true" at non-zero index → isActive true (|| first operand true)', () => {
    let captured: unknown = null;
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    const head = stageRow(2);
    const tail = stageRow(2);
    (tail['configuredRules'] as Record<string, string>)['is_active'] = 'true';
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`)
      .flush({ items: [head, tail] });
    const list = captured as readonly { isActive: boolean }[];
    expect(list[1].isActive).toBe(true);
  });

  // ── unwrap throw path: env.data === undefined (TRUE arm) ──

  it('getGrowth throws the BFF error message when data missing + error present (?? error.message arm)', () => {
    let capturedError: unknown = null;
    svc.getGrowth('eira-001').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/growth`)
      .flush({ error: { code: 'NOT_FOUND', message: 'no such familiar' } });
    expect((capturedError as Error).message).toBe('no such familiar');
  });

  it('getGrowth throws the fallback message when data + error both missing (?? fallback arm)', () => {
    let capturedError: unknown = null;
    svc.getGrowth('eira-001').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/growth`)
      .flush({});
    expect((capturedError as Error).message).toBe(
      'familiar-growth: getGrowth missing data',
    );
  });

  it('getGrowth throws fallback when error object present but message is null (?. present, ?? fallback)', () => {
    let capturedError: unknown = null;
    svc.getGrowth('eira-001').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/growth`)
      .flush({ error: { code: 'X', message: null } });
    expect((capturedError as Error).message).toBe(
      'familiar-growth: getGrowth missing data',
    );
  });

  // ── unwrap success path (env.data !== undefined, FALSE arm) on getGrowth ──

  it('getGrowth unwraps env.data and percent-encodes the familiarId', () => {
    let captured: unknown = null;
    svc.getGrowth('fam ID/1').subscribe((s) => (captured = s));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/${encodeURIComponent(
          'fam ID/1',
        )}/growth`,
      )
      .flush({ data: growthStateStub() });
    expect((captured as { familiarId: string }).familiarId).toBe('eira-001');
  });

  // ── hatch success unwrap + body ──

  it('hatch POSTs the body and unwraps the hatch response', () => {
    let captured: unknown = null;
    svc
      .hatch('eira-001', {
        displayName: 'Eira',
        tone: 'direct',
        learnerPersona: 'cert-focused',
      })
      .subscribe((r) => (captured = r));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/hatch`,
    );
    expect(req.request.method).toBe('POST');
    expect((req.request.body as { displayName: string }).displayName).toBe(
      'Eira',
    );
    // CHO-2028: hatching without a resonant atom must not send the key at
    // all (the BE treats absent/empty as NULL; a bogus value would 422).
    expect(
      Object.prototype.hasOwnProperty.call(
        req.request.body as object,
        'resonantAtomId',
      ),
    ).toBe(false);
    req.flush({
      data: {
        state: growthStateStub(),
        species: 'owl',
        shinyVariant: false,
        rarity: 'common',
        rolledProbability: 0.42,
      },
    });
    expect((captured as { rolledProbability: number }).rolledProbability).toBe(
      0.42,
    );
  });

  // ── pickResonantConcept: R3-1 awakening pick (replaces kg-neighbors) ──

  it('pickResonantConcept POSTs conceptId to /resonance and returns nested state', () => {
    let captured: unknown = null;
    svc
      .pickResonantConcept('eira-001', 'concept-42')
      .subscribe((s) => (captured = s));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/resonance`,
    );
    expect(req.request.method).toBe('POST');
    expect((req.request.body as { conceptId: string }).conceptId).toBe(
      'concept-42',
    );
    req.flush({ data: { state: growthStateStub() } });
    expect((captured as { familiarId: string }).familiarId).toBe('eira-001');
  });

  it('pickResonantConcept throws fallback when data missing — fail-loud', () => {
    let capturedError: unknown = null;
    svc.pickResonantConcept('eira-001', 'concept-42').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/resonance`,
      )
      .flush({});
    expect((capturedError as Error).message).toBe(
      'familiar-growth: pickResonantConcept missing data',
    );
  });

  it('pickResonantConcept propagates a BFF error (e.g. 404 CONCEPT_NOT_FOUND)', () => {
    let capturedError: unknown = null;
    svc.pickResonantConcept('eira-001', 'ghost').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/resonance`,
      )
      .flush(
        { error: { code: 'CONCEPT_NOT_FOUND', message: 'no such concept' } },
        { status: 404, statusText: 'Not Found' },
      );
    expect(capturedError).not.toBeNull();
  });

  // ── loadout: GET /skills → equip/unequip PUT/DELETE ──

  it('getLoadout GETs /skills and returns the unwrapped loadout view', () => {
    let captured: unknown = null;
    svc.getLoadout('eira-001').subscribe((v) => (captured = v));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills`,
    );
    expect(req.request.method).toBe('GET');
    // The skills family is UNWRAPPED (no {data:T}) — see gateway ListFamiliarSkills.
    req.flush({
      familiarId: 'eira-001',
      skillGrants: ['progress_mirror', 'recap_scribe'],
      equippedSkills: ['progress_mirror'],
      grants: [
        {
          skillKey: 'progress_mirror',
          skillKind: 'active',
          slotCost: 1,
          equipped: true,
          unlockedVia: 'species_path',
          unlockedAtStage: 2,
        },
        {
          skillKey: 'recap_scribe',
          skillKind: 'active',
          slotCost: 1,
          equipped: false,
          unlockedVia: 'species_path',
          unlockedAtStage: 2,
        },
      ],
      skillSlotsUnlocked: 3,
      slotsUsed: 1,
      evolutionTier: 'adept',
      growthStage: 2,
    });
    const v = captured as {
      equippedSkills: string[];
      grants: { skillKey: string; equipped: boolean }[];
      slotsUsed: number;
      skillSlotsUnlocked: number;
    };
    expect(v.equippedSkills).toEqual(['progress_mirror']);
    expect(v.grants.length).toBe(2);
    expect(v.slotsUsed).toBe(1);
    expect(v.skillSlotsUnlocked).toBe(3);
  });

  it('getLoadout propagates a BFF error — fail-loud', () => {
    let capturedError: unknown = null;
    svc.getLoadout('eira-001').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(capturedError).not.toBeNull();
  });

  it('getLoadout normalises grant params_schema to paramsSchema (CHO-2362)', () => {
    let captured: unknown = null;
    svc.getLoadout('eira-001').subscribe((v) => (captured = v));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills`)
      .flush({
        familiarId: 'eira-001',
        skillGrants: ['quiz_me', 'reminder_bell'],
        equippedSkills: ['quiz_me'],
        grants: [
          {
            skillKey: 'quiz_me',
            skillKind: 'active',
            slotCost: 1,
            equipped: true,
            unlockedVia: 'species_path',
            unlockedAtStage: 4,
            catalogueActive: true,
            // Snake spelling: a non-camelising hop must still feed the editor.
            params_schema: {
              count: { type: 'int', min: 3, max: 5, default: '3' },
            },
          },
          {
            skillKey: 'reminder_bell',
            skillKind: 'active',
            slotCost: 1,
            equipped: false,
            unlockedVia: 'species_path',
            unlockedAtStage: 2,
            catalogueActive: false,
          },
        ],
        skillSlotsUnlocked: 3,
        slotsUsed: 1,
        evolutionTier: 'adept',
        growthStage: 4,
      });
    const v = captured as {
      grants: { skillKey: string; paramsSchema?: Record<string, unknown> }[];
    };
    expect(v.grants[0].paramsSchema).toEqual({
      count: { type: 'int', min: 3, max: 5, default: '3' },
    });
    expect(v.grants[1].paramsSchema).toBeUndefined();
  });

  it('equipSkill PUTs to /skills/{key}/equip and returns the new loadout', () => {
    let captured: unknown = null;
    svc.equipSkill('eira-001', 'recap_scribe').subscribe((v) => (captured = v));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/recap_scribe/equip`,
    );
    expect(req.request.method).toBe('PUT');
    req.flush({
      familiarId: 'eira-001',
      skillGrants: ['progress_mirror', 'recap_scribe'],
      equippedSkills: ['progress_mirror', 'recap_scribe'],
      grants: [],
      skillSlotsUnlocked: 3,
      slotsUsed: 2,
      evolutionTier: 'adept',
      growthStage: 2,
    });
    expect((captured as { slotsUsed: number }).slotsUsed).toBe(2);
  });

  it('equipSkill surfaces the 409 SKILL_SLOTS_FULL conflict body', () => {
    let capturedError: unknown = null;
    svc.equipSkill('eira-001', 'recap_scribe').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/recap_scribe/equip`,
      )
      .flush(
        { code: 'SKILL_SLOTS_FULL', message: 'slots full' },
        { status: 409, statusText: 'Conflict' },
      );
    expect((capturedError as { status: number }).status).toBe(409);
  });

  it('unequipSkill DELETEs /skills/{key}/equip', () => {
    let captured: unknown = null;
    svc.unequipSkill('eira-001', 'recap_scribe').subscribe((v) => (captured = v));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/recap_scribe/equip`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush({
      familiarId: 'eira-001',
      skillGrants: ['progress_mirror', 'recap_scribe'],
      equippedSkills: ['progress_mirror'],
      grants: [],
      skillSlotsUnlocked: 3,
      slotsUsed: 1,
      evolutionTier: 'adept',
      growthStage: 2,
    });
    expect((captured as { slotsUsed: number }).slotsUsed).toBe(1);
  });

  // ── invokeSkill: R4-4 single-step Skill invoke runner ──

  it('invokeSkill POSTs params to /skills/{key}/invoke and returns the reply', () => {
    let captured: unknown = null;
    svc
      .invokeSkill('eira-001', 'progress_mirror', { window: 'all' })
      .subscribe((r) => (captured = r));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/progress_mirror/invoke`,
    );
    expect(req.request.method).toBe('POST');
    expect((req.request.body as { params: { window: string } }).params.window).toBe(
      'all',
    );
    // Unwrapped skills family — the runner returns the reply object directly.
    req.flush({
      skillKey: 'progress_mirror',
      reply: 'You are doing well.',
      recorded: false,
      manaCharged: 0,
      turnId: 't-1',
    });
    const r = captured as { reply: string; manaCharged: number; recorded: boolean };
    expect(r.reply).toBe('You are doing well.');
    expect(r.manaCharged).toBe(0);
    expect(r.recorded).toBe(false);
  });

  it('invokeSkill omits params when none given (bare {})', () => {
    svc.invokeSkill('eira-001', 'recap_scribe').subscribe();
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/recap_scribe/invoke`,
    );
    expect((req.request.body as { params?: unknown }).params).toBeUndefined();
    req.flush({
      skillKey: 'recap_scribe',
      reply: 'Saved.',
      recorded: true,
      manaCharged: 5,
      turnId: 't-2',
    });
  });

  it('invokeSkill coalesces a snake_case mana_charged hop into manaCharged (CHO-2040)', () => {
    // A hop that does NOT camelise (direct consumption / a non-FamiliarBridge
    // route) delivers `mana_charged` / `turn_id` / `skill_key`. The normaliser
    // must still populate the camelCase result so the loadout mana chip renders
    // its number instead of hiding on `manaCharged === undefined`.
    let captured: unknown = null;
    svc.invokeSkill('eira-001', 'recap_scribe').subscribe((r) => (captured = r));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/recap_scribe/invoke`,
      )
      .flush({
        skill_key: 'recap_scribe',
        reply: 'Saved.',
        recorded: true,
        mana_charged: 7,
        turn_id: 't-9',
      });
    const r = captured as {
      skillKey: string;
      reply: string;
      recorded: boolean;
      manaCharged: number;
      turnId: string;
    };
    expect(r.manaCharged).toBe(7);
    expect(r.turnId).toBe('t-9');
    expect(r.skillKey).toBe('recap_scribe');
    expect(r.reply).toBe('Saved.');
    expect(r.recorded).toBe(true);
  });

  it('invokeSkill falls soft to safe defaults on an empty invoke body (CHO-2040)', () => {
    // Neither casing present → the normaliser must not throw or fabricate; it
    // returns zeroed/empty defaults so the chip simply hides.
    let captured: unknown = null;
    svc.invokeSkill('eira-001', 'recap_scribe').subscribe((r) => (captured = r));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/recap_scribe/invoke`,
      )
      .flush({});
    const r = captured as {
      skillKey: string;
      reply: string;
      recorded: boolean;
      manaCharged: number;
      turnId: string;
    };
    expect(r.manaCharged).toBe(0);
    expect(r.reply).toBe('');
    expect(r.recorded).toBe(false);
    expect(r.turnId).toBe('');
    expect(r.skillKey).toBe('');
  });

  // ── CHO-2016 answerable-pipe (quiz_me / socratic_drill) normalisation ──

  it('invokeSkill defaults resultKind to chat and items to [] (CHO-2016)', () => {
    // Every existing chat-kind skill (progress_mirror/recap_scribe/
    // explain_anew/sight) omits resultKind + items entirely — the normaliser
    // must default them so old replies keep rendering via the unchanged chat
    // path (additive contract, CHO-2016 handler comment).
    let captured: unknown = null;
    svc
      .invokeSkill('eira-001', 'progress_mirror')
      .subscribe((r) => (captured = r));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/progress_mirror/invoke`,
      )
      .flush({
        skillKey: 'progress_mirror',
        reply: 'You are doing well.',
        recorded: false,
        manaCharged: 0,
        turnId: 't-1',
      });
    const r = captured as { resultKind: string; items: readonly unknown[] };
    expect(r.resultKind).toBe('chat');
    expect(r.items).toEqual([]);
  });

  it('invokeSkill normalises a camelCase answerable reply (CHO-2016)', () => {
    let captured: unknown = null;
    svc.invokeSkill('eira-001', 'quiz_me').subscribe((r) => (captured = r));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/quiz_me/invoke`,
      )
      .flush({
        skillKey: 'quiz_me',
        reply: 'Answer these in the app.',
        recorded: false,
        manaCharged: 0,
        turnId: 't-3',
        resultKind: 'answerable',
        items: [
          {
            atomId: 'a-1',
            title: 'Long division',
            topic: 'arithmetic',
            difficulty: 2,
            reason: 'weak_spot',
          },
        ],
      });
    const r = captured as {
      resultKind: string;
      items: readonly {
        atomId: string;
        title: string;
        topic: string;
        difficulty: number;
        reason: string;
      }[];
    };
    expect(r.resultKind).toBe('answerable');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toEqual({
      atomId: 'a-1',
      title: 'Long division',
      topic: 'arithmetic',
      difficulty: 2,
      reason: 'weak_spot',
    });
  });

  it('invokeSkill coalesces a snake_case answerable hop (result_kind/atom_id) (CHO-2016)', () => {
    // Mirrors the mana_charged coalescing precedent above: a hop that does
    // NOT camelise must still populate resultKind/items so the answerable
    // widget renders instead of silently falling back to the chat path.
    let captured: unknown = null;
    svc
      .invokeSkill('eira-001', 'socratic_drill')
      .subscribe((r) => (captured = r));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/socratic_drill/invoke`,
      )
      .flush({
        skill_key: 'socratic_drill',
        reply: 'Let’s reason through this together.',
        recorded: false,
        mana_charged: 15,
        turn_id: 't-4',
        result_kind: 'answerable',
        items: [
          {
            atom_id: 'a-2',
            title: 'Base cases',
            topic: 'recursion',
            difficulty: 2,
            reason: 'concept_ref',
          },
        ],
      });
    const r = captured as {
      resultKind: string;
      manaCharged: number;
      items: readonly { atomId: string; reason: string }[];
    };
    expect(r.resultKind).toBe('answerable');
    expect(r.manaCharged).toBe(15);
    expect(r.items[0].atomId).toBe('a-2');
    expect(r.items[0].reason).toBe('concept_ref');
  });

  it('invokeSkill falls an unknown item reason back to fresh_pick — never fabricates a closed-enum value (CHO-2016)', () => {
    let captured: unknown = null;
    svc.invokeSkill('eira-001', 'quiz_me').subscribe((r) => (captured = r));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/quiz_me/invoke`,
      )
      .flush({
        resultKind: 'answerable',
        items: [
          {
            atomId: 'a-3',
            title: 'x',
            topic: 'y',
            difficulty: 1,
            reason: 'something_new_the_fe_has_never_seen',
          },
        ],
      });
    const r = captured as { items: readonly { reason: string }[] };
    expect(r.items[0].reason).toBe('fresh_pick');
  });

  it('invokeSkill drops a malformed item (no atomId in either casing) (CHO-2016)', () => {
    let captured: unknown = null;
    svc.invokeSkill('eira-001', 'quiz_me').subscribe((r) => (captured = r));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/quiz_me/invoke`,
      )
      .flush({
        resultKind: 'answerable',
        items: [{ title: 'no id here', topic: 'y', difficulty: 1, reason: 'weak_spot' }],
      });
    const r = captured as { items: readonly unknown[] };
    expect(r.items).toEqual([]);
  });

  it('invokeSkill surfaces the 402 insufficient_mana upsell body', () => {
    let capturedError: unknown = null;
    svc.invokeSkill('eira-001', 'explain_anew', { target: 'c-1' }).subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/skills/explain_anew/invoke`,
      )
      .flush(
        { error: { code: 'insufficient_mana', message: 'top-up required' } },
        { status: 402, statusText: 'Payment Required' },
      );
    expect((capturedError as { status: number }).status).toBe(402);
  });

  // ── openSourceRevelation ──

  it('openSourceRevelation POSTs an empty body and unwraps the window', () => {
    let captured: unknown = null;
    svc.openSourceRevelation('eira-001').subscribe((r) => (captured = r));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/source-revelation`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({
      data: { previewLlmTier: 'pro', windowExpiresAt: '2026-05-03T00:00:00Z' },
    });
    const res = captured as { previewLlmTier: string; windowExpiresAt: string };
    expect(res.previewLlmTier).toBe('pro');
    expect(res.windowExpiresAt).toBe('2026-05-03T00:00:00Z');
  });

  // ── getGrowthEvents pageToken ternary (both arms) ──

  it('getGrowthEvents omits the query string when no pageToken (ternary falsy)', () => {
    let captured: unknown = null;
    svc.getGrowthEvents('eira-001').subscribe((p) => (captured = p));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/growth-events`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: { events: [], nextPageToken: '' } });
    expect((captured as { events: unknown[] }).events).toEqual([]);
  });

  it('getGrowthEvents appends an encoded pageToken query (ternary truthy)', () => {
    let captured: unknown = null;
    svc
      .getGrowthEvents('eira-001', 'tok en/2')
      .subscribe((p) => (captured = p));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/growth-events?pageToken=${encodeURIComponent(
        'tok en/2',
      )}`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: { events: [], nextPageToken: 'tok en/3' } });
    expect((captured as { nextPageToken: string }).nextPageToken).toBe(
      'tok en/3',
    );
  });

  // ── getGrowthEvents wire field reconciliation (CHO-2144) ──
  // The chora-consumption HTTP handler emits exp_total_after / growth_event_id /
  // awarded_at (familiar_growth_handlers.go::eventRecordResp); the gateway
  // FamiliarBridge only camelises (classifyWithEnvelope — no semantic rename),
  // so the FE receives expTotalAfter / growthEventId / awardedAt. The model
  // reads expCumulativeAfter / eventId / occurredAt. Without a coalesce the
  // cumulative number, @for track key and timestamp all render blank/undefined.
  it('getGrowthEvents maps the wire spelling (expTotalAfter → expCumulativeAfter)', () => {
    let captured: unknown = null;
    svc.getGrowthEvents('eira-001').subscribe((p) => (captured = p));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/growth-events`,
    );
    req.flush({
      data: {
        events: [
          {
            growthEventId: 'gev-1',
            source: 'atom.completed',
            expDelta: 15,
            expTotalAfter: 806,
            dailyCapHit: false,
            triggeredStageUp: true,
            awardedAt: '2026-07-11T00:00:00Z',
          },
        ],
        nextPageToken: 'n2',
      },
    });
    const page = captured as {
      events: readonly {
        eventId: string;
        expDelta: number;
        expCumulativeAfter: number;
        occurredAt: string;
        source: string;
      }[];
      nextPageToken: string;
    };
    expect(page.events[0].expCumulativeAfter).toBe(806);
    expect(page.events[0].eventId).toBe('gev-1');
    expect(page.events[0].occurredAt).toBe('2026-07-11T00:00:00Z');
    expect(page.events[0].expDelta).toBe(15);
    expect(page.events[0].source).toBe('atom.completed');
    expect(page.nextPageToken).toBe('n2');
  });

  // Also accepts the OpenAPI/model spelling verbatim (dual-spelling defence,
  // mirrors normalizeSkillInvokeResult) so a future BE fix is a no-op here.
  it('getGrowthEvents also accepts the model spelling (expCumulativeAfter)', () => {
    let captured: unknown = null;
    svc.getGrowthEvents('eira-001').subscribe((p) => (captured = p));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/growth-events`,
      )
      .flush({
        data: {
          events: [
            {
              eventId: 'gev-2',
              source: 'daily_dose.completed',
              expDelta: 10,
              expCumulativeAfter: 42,
              dailyCapHit: false,
              occurredAt: '2026-07-11T01:00:00Z',
            },
          ],
          nextPageToken: '',
        },
      });
    const page = captured as {
      events: readonly { expCumulativeAfter: number; eventId: string }[];
    };
    expect(page.events[0].expCumulativeAfter).toBe(42);
    expect(page.events[0].eventId).toBe('gev-2');
  });

  // ── checkout ──

  it('checkout POSTs the sku and unwraps the Stripe session URL', () => {
    let captured: unknown = null;
    svc.checkout('egg.pro.v1').subscribe((r) => (captured = r));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/familiar-eggs/checkout`,
    );
    expect(req.request.method).toBe('POST');
    expect((req.request.body as { sku: string }).sku).toBe('egg.pro.v1');
    req.flush({
      data: {
        stripeCheckoutUrl: 'https://stripe.test/session',
        purchaseId: 'pur-1',
      },
    });
    const res = captured as { stripeCheckoutUrl: string; purchaseId: string };
    expect(res.stripeCheckoutUrl).toBe('https://stripe.test/session');
    expect(res.purchaseId).toBe('pur-1');
  });

  it('checkout throws fallback when data missing', () => {
    let capturedError: unknown = null;
    svc.checkout('egg.pro.v1').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/familiar-eggs/checkout`)
      .flush({});
    expect((capturedError as Error).message).toBe(
      'familiar-growth: checkout missing data',
    );
  });

  // ── retire (CHO-2033) — frees a roster slot; the FE deliberately does
  // NOT model the response body (the gateway route contract is being
  // finalised in parallel per SP1's follow-ups) — any 2xx completes. ──

  it('retire POSTs an empty body to /retire', () => {
    let completed = false;
    svc.retire('eira-001').subscribe({
      next: () => undefined,
      complete: () => {
        completed = true;
      },
    });
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/retire`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
    expect(completed).toBe(true);
  });

  it('retire percent-encodes the familiarId', () => {
    svc.retire('fam ID/1').subscribe();
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/${encodeURIComponent(
        'fam ID/1',
      )}/retire`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('retire succeeds regardless of the flushed response body shape', () => {
    let captured: unknown = 'not-called';
    svc.retire('eira-001').subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/retire`)
      // Arbitrary/unmodelled body — the gateway contract is still being
      // finalised; the FE must not depend on its shape (any 2xx is success).
      .flush({ somethingUnexpected: true });
    expect(captured).toBeUndefined();
  });

  it('propagates BFF error on retire — fail-loud, no mock', () => {
    let capturedNext: unknown = null;
    let capturedError: unknown = null;
    svc.retire('eira-001').subscribe({
      next: (r) => (capturedNext = r),
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/retire`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
    expect(capturedNext).toBeNull();
    expect(capturedError).not.toBeNull();
  });

  it('propagates a non-2xx retire response as an error (e.g. 404 already-retired)', () => {
    let capturedError: unknown = null;
    svc.retire('eira-001').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/eira-001/retire`)
      .flush(
        { error: { code: 'NOT_FOUND', message: 'already retired' } },
        { status: 404, statusText: 'Not Found' },
      );
    expect((capturedError as { status: number }).status).toBe(404);
  });

  // ── acquireFamiliar (CHO-2034) — the free-claim lane. Binds a Familiar to a
  // map's Goal WITHOUT the Stripe ceremony (mode "dev_hatched"). Like retire,
  // the response body is intentionally NOT modelled — any 2xx completes; a
  // non-2xx (409 one-per-learner / map-already-bound, 422) is surfaced. ──

  it('acquireFamiliar POSTs {goalId, mode:"dev_hatched"} to /me/familiars/acquire and completes on 2xx', () => {
    let completed = false;
    svc.acquireFamiliar('goal-1').subscribe({
      next: () => undefined,
      complete: () => {
        completed = true;
      },
    });
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/acquire`,
    );
    expect(req.request.method).toBe('POST');
    const body = req.request.body as { goalId: string; mode: string };
    expect(body.goalId).toBe('goal-1');
    // Default mode is the honest free path (no Stripe ceremony).
    expect(body.mode).toBe('dev_hatched');
    req.flush({ familiarId: 'f-new', goalId: 'goal-1', growthStage: 1 });
    expect(completed).toBe(true);
  });

  it('acquireFamiliar includes optional species/familiarName only when provided', () => {
    svc
      .acquireFamiliar('goal-1', { species: 'owl', familiarName: 'Hoot' })
      .subscribe();
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/acquire`,
    );
    const body = req.request.body as Record<string, string>;
    expect(body['species']).toBe('owl');
    expect(body['familiarName']).toBe('Hoot');
    req.flush({});
  });

  it('acquireFamiliar omits the species/familiarName keys when not provided', () => {
    svc.acquireFamiliar('goal-1').subscribe();
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/acquire`,
    );
    const body = req.request.body as object;
    expect(Object.prototype.hasOwnProperty.call(body, 'species')).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(body, 'familiarName'),
    ).toBe(false);
    req.flush({});
  });

  it('acquireFamiliar succeeds regardless of the flushed response body shape (any 2xx)', () => {
    let captured: unknown = 'not-called';
    svc.acquireFamiliar('goal-1').subscribe((r) => (captured = r));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/acquire`)
      .flush({ somethingUnexpected: true });
    expect(captured).toBeUndefined();
  });

  it('acquireFamiliar honours an explicit hatched mode override', () => {
    svc.acquireFamiliar('goal-1', { mode: 'hatched' }).subscribe();
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/me/familiars/acquire`,
    );
    expect((req.request.body as { mode: string }).mode).toBe('hatched');
    req.flush({});
  });

  it('acquireFamiliar propagates a non-2xx (409 one-per-learner / map bound) — fail-loud', () => {
    let capturedError: unknown = null;
    svc.acquireFamiliar('goal-1').subscribe({
      next: () => undefined,
      error: (e) => (capturedError = e),
    });
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars/acquire`)
      .flush(
        {
          error: {
            code: 'MAP_ALREADY_HAS_FAMILIAR',
            message: 'already bound',
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
    expect((capturedError as { status: number }).status).toBe(409);
  });
});

/** A complete /v1/me/familiars wire row with a parametrised growth stage. */
function stageRow(stage: number): Record<string, unknown> {
  return {
    familiarId: 'f-stage',
    tenantId: 't',
    ownerGcid: 'g',
    name: 'Stagey',
    specialization: 's',
    evolutionTier: 't',
    skillSlotsUnlocked: 0,
    memoryContextCapacity: 0,
    skillGrants: [],
    configuredRules: {},
    memoryBankAppName: '',
    createdAt: '',
    updatedAt: '',
    growthState: {
      stage,
      stageName: 'fledgling',
      exp: 0,
      expToNextStage: 0,
      currentBreed: 'owl',
      breedRevealedAt: null,
      effectiveLlmTier: 'flash-lite',
      lastStageUpAt: null,
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
    },
    cosmetic: { equippedSkinId: null, shiny: false, rarity: 'common' },
  };
}

/** Minimal valid FamiliarGrowthState for envelope `data` payloads. */
function growthStateStub(): Record<string, unknown> {
  return {
    familiarId: 'eira-001',
    growthStage: 3,
    stageName: 'awakened',
    species: 'owl',
    shinyVariant: false,
    rarity: 'common',
    expCurrent: 210,
    expNextThreshold: 500,
    expCumulative: 210,
    effectiveLlmTier: 'flash',
    effectiveMaxOutputTokens: 1024,
    unlockedTools: [],
    resonantAtomId: 'atom-1',
    ahaMomentConsumed: false,
    ahaMomentActiveUntil: null,
    hatchedAt: null,
    lastStageUpAt: null,
  };
}

/**
 * chora-consumption renamed Familiar to Companion on the wire (7c8a20bbd,
 * ADR-254 D9): a roster item is keyed `companionId`. The roster keeps its own
 * vocabulary, so the translation belongs in the service. Without it every
 * summon posts an undefined id and no Companion can be sent to a map.
 */
describe('FamiliarGrowthService companion wire contract', () => {
  let svc: FamiliarGrowthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(FamiliarGrowthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads companionId off a roster item', () => {
    let captured: readonly { familiarId: string; displayName: string }[] = [];
    svc.listMyFamiliars().subscribe((r) => (captured = r));
    httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/me/familiars`).flush({
      items: [
        {
          companionId: '00000000-0000-7000-8000-00000000e1a0',
          tenantId: 't-phy',
          ownerGcid: 'gcid-phy',
          name: 'Vesper',
          specialization: 'curiosity',
          evolutionTier: 'apprentice',
          skillSlotsUnlocked: 1,
          memoryContextCapacity: 8000,
          skillGrants: [],
          configuredRules: {},
          memoryBankAppName: 'companion:vesper-001',
          createdAt: '2026-08-13T00:00:00Z',
          updatedAt: '2026-08-23T00:00:00Z',
          growthState: {
            stage: 2,
            stageName: 'fledgling',
            exp: 200,
            expToNextStage: 200,
            currentBreed: 'dragon',
            breedRevealedAt: '2026-08-13T00:00:00Z',
            effectiveLlmTier: 'flash-lite',
            lastStageUpAt: '2026-08-13T00:00:00Z',
            resonantAtomId: null,
            ahaMomentConsumed: false,
            ahaMomentActiveUntil: null,
          },
          cosmetic: { equippedSkinId: null, shiny: false, rarity: 'common' },
        },
      ],
    });

    expect(captured[0].familiarId).toBe('00000000-0000-7000-8000-00000000e1a0');
    expect(captured[0].displayName).toBe('Vesper');
  });
});
