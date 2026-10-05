import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { environment } from '../../../../../environments/environment';
import { CeremonyEdgesService } from './ceremony-edges.service';
import {
  extractManaUpsell,
  mintErrorKey,
  proposeErrorKey,
  type CeremonyConfirmOutcome,
  type EdgeScoutProposal,
  type MintedLearningEdge,
} from './ceremony-edges.model';

const FAM = '00000000-0000-7000-8000-00000000fa41';
const GOAL = '00000000-0000-7000-8000-000000009a01';
const base = environment.bffBaseUrl;
const PROPOSE_URL = `${base}/api/v1/me/familiars/${FAM}/ceremony/edge-scout`;
const MINT_URL = `${base}/api/v1/me/goals/${GOAL}/learning-edges`;
const CONFIRM_URL = `${base}/api/v1/me/familiars/${FAM}/ceremony/edge-scout/confirm`;

function proposal(over: Partial<EdgeScoutProposal> = {}): EdgeScoutProposal {
  return {
    candidates: [
      {
        title: 'Cell membranes',
        intent: 'remediate',
        source: 'weakness',
        atom_refs: ['00000000-0000-7000-8000-00000000a701'],
        rationale: 'Missed twice in graded work',
      },
      { title: 'Osmosis in plants', intent: 'explore', source: 'fog' },
    ],
    fallback: false,
    mana_charged: 25,
    turn_id: 'turn-1',
    ...over,
  };
}

const minted: readonly MintedLearningEdge[] = [
  {
    conceptId: 'c-1',
    title: 'Cell membranes',
    intent: 'remediate',
    edgeId: 'e-1',
  },
];

describe('CeremonyEdgesService', () => {
  let service: CeremonyEdgesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CeremonyEdgesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('POSTs the propose body {goal_id} and returns the proposal', () => {
    let result: EdgeScoutProposal | undefined;
    service.propose(FAM, GOAL).subscribe((p) => (result = p));

    const req = httpMock.expectOne(PROPOSE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ goal_id: GOAL });
    req.flush(proposal());

    expect(result?.candidates.length).toBe(2);
    expect(result?.mana_charged).toBe(25);
  });

  it('normalizes the camelCased bridge response into canonical snake_case', () => {
    // The gateway FamiliarBridge camelises the WHOLE consumption body
    // (classify → SnakeToCamelJSON), so the FE actually receives camelCase
    // keys over the wire: mana_charged→manaCharged, first_run→firstRun,
    // turn_id→turnId, candidate.atom_refs→atomRefs. propose() must coalesce
    // them back so the panel (which reads snake_case) renders the mana chip +
    // free badge and forwards atom_refs into the mint. Single-word keys
    // (title/intent/source/rationale/fallback/candidates) are unchanged.
    let result: EdgeScoutProposal | undefined;
    service.propose(FAM, GOAL).subscribe((p) => (result = p));

    httpMock.expectOne(PROPOSE_URL).flush({
      candidates: [
        {
          title: 'Cell membranes',
          intent: 'remediate',
          source: 'weakness',
          atomRefs: ['00000000-0000-7000-8000-00000000a701'],
          rationale: 'Missed twice',
        },
      ],
      fallback: false,
      manaCharged: 25,
      firstRun: true,
      turnId: 'turn-9',
    });

    expect(result?.mana_charged).toBe(25);
    expect(result?.first_run).toBe(true);
    expect(result?.turn_id).toBe('turn-9');
    expect(result?.candidates[0].atom_refs).toEqual([
      '00000000-0000-7000-8000-00000000a701',
    ]);
  });

  it('mintEdges POSTs camelCase selections and reads the as-built learningEdges key', () => {
    let result: readonly MintedLearningEdge[] | undefined;
    service
      .mintEdges(GOAL, [
        { title: 'Cell membranes', intent: 'remediate', atomRefs: ['a-1'] },
      ])
      .subscribe((m) => (result = m));

    const req = httpMock.expectOne(MINT_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      edges: [
        { title: 'Cell membranes', intent: 'remediate', atomRefs: ['a-1'] },
      ],
    });
    req.flush({ learningEdges: minted }, { status: 201, statusText: 'Created' });

    expect(result).toEqual(minted);
  });

  it('mintEdges also accepts the brief-era `edges` response key', () => {
    let result: readonly MintedLearningEdge[] | undefined;
    service
      .mintEdges(GOAL, [{ title: 'Osmosis in plants', intent: 'explore' }])
      .subscribe((m) => (result = m));

    httpMock
      .expectOne(MINT_URL)
      .flush({ edges: minted }, { status: 201, statusText: 'Created' });
    expect(result).toEqual(minted);
  });

  it('mintEdges fails loud when the response carries neither key', () => {
    let error: unknown;
    service
      .mintEdges(GOAL, [{ title: 'Osmosis in plants', intent: 'explore' }])
      .subscribe({ error: (e: unknown) => (error = e) });

    httpMock.expectOne(MINT_URL).flush({}, { status: 201, statusText: 'Created' });
    expect(error).toBeInstanceOf(Error);
  });

  it('confirmMemory POSTs the snake_case confirm body', () => {
    let receipt: { published: number; noted: number } | undefined;
    service
      .confirmMemory(FAM, GOAL, minted)
      .subscribe((r) => (receipt = r));

    const req = httpMock.expectOne(CONFIRM_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      goal_id: GOAL,
      edges: [
        { concept_id: 'c-1', title: 'Cell membranes', intent: 'remediate' },
      ],
    });
    req.flush({ published: 1, noted: 0 });
    expect(receipt).toEqual({ published: 1, noted: 0 });
  });

  describe('confirmSelection orchestration (mint THEN memory hook)', () => {
    it('runs sequentially and resolves synced on both successes', () => {
      let outcome: CeremonyConfirmOutcome | undefined;
      service
        .confirmSelection(FAM, GOAL, [
          { title: 'Cell membranes', intent: 'remediate' },
        ])
        .subscribe((o) => (outcome = o));

      // Mint first — the confirm hook must NOT be in flight yet.
      httpMock.expectNone(CONFIRM_URL);
      httpMock
        .expectOne(MINT_URL)
        .flush({ learningEdges: minted }, { status: 201, statusText: 'Created' });

      httpMock.expectOne(CONFIRM_URL).flush({ published: 1, noted: 0 });

      expect(outcome?.minted).toEqual(minted);
      expect(outcome?.memory).toEqual({
        status: 'synced',
        receipt: { published: 1, noted: 0 },
      });
    });

    it('propagates a mint failure (nothing minted, no confirm call)', () => {
      let error: unknown;
      service
        .confirmSelection(FAM, GOAL, [
          { title: 'Cell membranes', intent: 'remediate' },
        ])
        .subscribe({ error: (e: unknown) => (error = e) });

      httpMock
        .expectOne(MINT_URL)
        .flush(
          { error: { code: 'INVALID_LEARNING_EDGES' } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      httpMock.expectNone(CONFIRM_URL);
      expect(error).toBeTruthy();
    });

    it('resolves the NON-blocking partial outcome when the hook fails after mint', () => {
      let outcome: CeremonyConfirmOutcome | undefined;
      service
        .confirmSelection(FAM, GOAL, [
          { title: 'Cell membranes', intent: 'remediate' },
        ])
        .subscribe((o) => (outcome = o));

      httpMock
        .expectOne(MINT_URL)
        .flush({ learningEdges: minted }, { status: 201, statusText: 'Created' });
      httpMock
        .expectOne(CONFIRM_URL)
        .flush(
          { error: { code: 'CONFIRM_FAILED' } },
          { status: 502, statusText: 'Bad Gateway' },
        );

      expect(outcome?.minted).toEqual(minted);
      expect(outcome?.memory).toEqual({ status: 'failed' });
    });
  });
});

describe('ceremony-edges error mapping', () => {
  it('extracts the 402 insufficient_mana upsell envelope', () => {
    const upsell = {
      required_units: 25,
      current_balance_units: 3,
      recommended_plan_code: 'familiar_basic',
    };
    expect(
      extractManaUpsell({
        status: 402,
        error: { error: { code: 'insufficient_mana', message: 'top-up required', upsell } },
      }),
    ).toEqual(upsell);
  });

  it('returns null for non-402 or upsell-less bodies', () => {
    expect(extractManaUpsell({ status: 500, error: {} })).toBeNull();
    expect(
      extractManaUpsell({ status: 402, error: { error: { code: 'insufficient_mana' } } }),
    ).toBeNull();
    expect(extractManaUpsell(null)).toBeNull();
  });

  it('maps propose statuses to the typed i18n keys', () => {
    expect(proposeErrorKey({ status: 402 })).toBe('familiar.ceremony.error_mana');
    expect(proposeErrorKey({ status: 404 })).toBe('familiar.ceremony.error_not_found');
    expect(proposeErrorKey({ status: 422 })).toBe('familiar.ceremony.error_invalid');
    expect(proposeErrorKey({ status: 503 })).toBe('familiar.ceremony.error_unavailable');
    expect(proposeErrorKey({ status: 502 })).toBe('familiar.ceremony.error_scout_failed');
    expect(proposeErrorKey({ status: 500 })).toBe('familiar.ceremony.error_upstream');
    expect(proposeErrorKey({ status: 401 })).toBe('familiar.ceremony.error_unauthorised');
    expect(proposeErrorKey({})).toBe('familiar.ceremony.error_generic');
  });

  it('maps mint statuses — 422 reads as the rootless-goal precondition', () => {
    expect(mintErrorKey({ status: 422 })).toBe('familiar.ceremony.confirm_error_invalid');
    expect(mintErrorKey({ status: 404 })).toBe('familiar.ceremony.error_not_found');
    expect(mintErrorKey({ status: 503 })).toBe('familiar.ceremony.error_unavailable');
    expect(mintErrorKey({ status: 500 })).toBe('familiar.ceremony.error_upstream');
    expect(mintErrorKey({})).toBe('familiar.ceremony.confirm_error_generic');
  });
});
