import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { CeremonyEdgesPanelComponent } from './ceremony-edges-panel.component';
import { TranslateService } from '../../../../core/services/translate.service';
import type { EdgeScoutCandidate, EdgeScoutProposal } from './ceremony-edges.model';

const FAM = '00000000-0000-7000-8000-00000000fa41';
const GOAL = '00000000-0000-7000-8000-000000009a01';
const base = environment.bffBaseUrl;
const PROPOSE_URL = `${base}/api/v1/me/familiars/${FAM}/ceremony/edge-scout`;
const MINT_URL = `${base}/api/v1/me/goals/${GOAL}/learning-edges`;
const CONFIRM_URL = `${base}/api/v1/me/familiars/${FAM}/ceremony/edge-scout/confirm`;

function candidate(i: number, over: Partial<EdgeScoutCandidate> = {}): EdgeScoutCandidate {
  return {
    title: `Concept ${i}`,
    intent: i % 2 === 0 ? 'remediate' : 'explore',
    source: i % 2 === 0 ? 'weakness' : 'fog',
    ...over,
  };
}

function proposal(over: Partial<EdgeScoutProposal> = {}): EdgeScoutProposal {
  return {
    candidates: [
      candidate(0, {
        atom_refs: ['a-1', 'a-2'],
        rationale: 'Missed twice in graded work',
      }),
      candidate(1),
      candidate(2),
    ],
    fallback: false,
    mana_charged: 25,
    turn_id: 'turn-1',
    ...over,
  };
}

describe('CeremonyEdgesPanelComponent', () => {
  let fixture: ComponentFixture<CeremonyEdgesPanelComponent>;
  let el: HTMLElement;
  let httpMock: HttpTestingController;

  function setup(): void {
    TestBed.configureTestingModule({
      imports: [CeremonyEdgesPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        TranslateService,
      ],
    });
    fixture = TestBed.createComponent(CeremonyEdgesPanelComponent);
    fixture.componentRef.setInput('familiarId', FAM);
    fixture.componentRef.setInput('goalId', GOAL);
    el = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  }

  function flushPropose(body: EdgeScoutProposal = proposal()): void {
    const req = httpMock.expectOne(PROPOSE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ goal_id: GOAL });
    req.flush(body);
    fixture.detectChanges();
  }

  function tick(index: number): void {
    const box = el.querySelector<HTMLInputElement>(
      `[data-testid="ceremony-edges-checkbox-${index}"]`,
    );
    expect(box).not.toBeNull();
    box?.click();
    fixture.detectChanges();
  }

  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('auto-proposes on reveal and renders the skeleton while loading', () => {
    setup();
    fixture.detectChanges(); // effect fires the propose

    expect(el.querySelector('[data-testid="ceremony-edges-loading"]')).not.toBeNull();
    flushPropose();
    expect(el.querySelector('[data-testid="ceremony-edges-loading"]')).toBeNull();
  });

  it('renders REMEDIATE and EXPLORE sections, source badges, atom-ref chips and rationale — nothing pre-ticked', () => {
    setup();
    fixture.detectChanges();
    flushPropose();

    expect(el.querySelector('[data-testid="ceremony-edges-panel"]')).not.toBeNull();
    const remediate = el.querySelector('[data-testid="ceremony-edges-section-remediate"]');
    const explore = el.querySelector('[data-testid="ceremony-edges-section-explore"]');
    expect(remediate).not.toBeNull();
    expect(explore).not.toBeNull();
    // Split by intent: candidates 0/2 remediate, 1 explore.
    expect(remediate?.querySelectorAll('.ceremony-edges__candidate').length).toBe(2);
    expect(explore?.querySelectorAll('.ceremony-edges__candidate').length).toBe(1);
    // Source badge + atoms chip + rationale on candidate 0.
    expect(
      remediate?.querySelector('.ceremony-edges__source-badge[data-source="weakness"]'),
    ).not.toBeNull();
    expect(remediate?.textContent).toContain('2');
    expect(remediate?.textContent).toContain('Missed twice in graded work');
    // Learner sovereignty — no checkbox is pre-ticked.
    const ticked = el.querySelectorAll<HTMLInputElement>('.ceremony-edges__tick:checked');
    expect(ticked.length).toBe(0);
    // Confirm is disabled until something is ticked.
    const confirm = el.querySelector<HTMLButtonElement>('[data-testid="ceremony-edges-confirm"]');
    expect(confirm?.disabled).toBe(true);
  });

  it('shows the mana chip with the charged amount (not first run)', () => {
    setup();
    fixture.detectChanges();
    flushPropose(proposal({ mana_charged: 25, first_run: false }));

    const chip = el.querySelector('[data-testid="ceremony-edges-mana-chip"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('25');
    expect(chip?.textContent).not.toContain('first_scout_free');
  });

  it('shows the "first scout: free" chip when first_run=true', () => {
    setup();
    fixture.detectChanges();
    flushPropose(proposal({ first_run: true, mana_charged: 0 }));

    const chip = el.querySelector('[data-testid="ceremony-edges-mana-chip"]');
    // Dev-mode instant() renders the raw key — asserting the key proves the branch.
    expect(chip?.textContent).toContain('familiar.ceremony.first_scout_free');
  });

  it('renders the fallback "starting fresh" banner with an explore-only list', () => {
    setup();
    fixture.detectChanges();
    flushPropose(
      proposal({
        fallback: true,
        mana_charged: 0,
        turn_id: undefined,
        candidates: [candidate(1, { source: 'goal' }), candidate(3, { source: 'fog' })],
      }),
    );

    expect(el.querySelector('[data-testid="ceremony-edges-fallback"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ceremony-edges-section-remediate"]')).toBeNull();
    expect(el.querySelector('[data-testid="ceremony-edges-section-explore"]')).not.toBeNull();
  });

  it('renders the encouraging empty state (re-scout stays available)', () => {
    setup();
    fixture.detectChanges();
    flushPropose(proposal({ candidates: [], fallback: true, mana_charged: 0 }));

    expect(el.querySelector('[data-testid="ceremony-edges-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ceremony-edges-rescout"]')).not.toBeNull();
  });

  it('surfaces a typed error with retry; retry re-proposes', () => {
    setup();
    fixture.detectChanges();
    httpMock
      .expectOne(PROPOSE_URL)
      .flush(
        { error: { code: 'EDGE_SCOUT_NOT_WIRED' } },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();

    const error = el.querySelector('[data-testid="ceremony-edges-error"]');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('familiar.ceremony.error_unavailable');

    el.querySelector<HTMLButtonElement>('[data-testid="ceremony-edges-retry"]')?.click();
    fixture.detectChanges();
    flushPropose();
    expect(el.querySelector('[data-testid="ceremony-edges-section-remediate"]')).not.toBeNull();
  });

  it('opens the mana top-up modal on a 402 upsell envelope', () => {
    setup();
    fixture.detectChanges();
    httpMock.expectOne(PROPOSE_URL).flush(
      {
        error: {
          code: 'insufficient_mana',
          message: 'top-up required',
          upsell: {
            required_units: 25,
            current_balance_units: 3,
            recommended_plan_code: 'familiar_basic',
          },
        },
      },
      { status: 402, statusText: 'Payment Required' },
    );
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="ceremony-edges-topup-modal"]')).not.toBeNull();
    // The panel behind stays on the honest mana error state.
    expect(el.querySelector('[data-testid="ceremony-edges-error"]')?.textContent).toContain(
      'familiar.ceremony.error_mana',
    );
  });

  it('caps the selection at 8 ticks and shows the hint; unticking re-enables', () => {
    setup();
    fixture.detectChanges();
    flushPropose(
      proposal({
        candidates: Array.from({ length: 10 }, (_, i) => candidate(i)),
      }),
    );

    for (let i = 0; i < 8; i++) tick(i);
    expect(fixture.componentInstance.selectedCount()).toBe(8);
    expect(el.querySelector('[data-testid="ceremony-edges-cap-hint"]')).not.toBeNull();

    // The 9th checkbox is disabled — and a defensive toggle is a no-op.
    const ninth = el.querySelector<HTMLInputElement>('[data-testid="ceremony-edges-checkbox-8"]');
    expect(ninth?.disabled).toBe(true);
    fixture.componentInstance.toggle(8);
    expect(fixture.componentInstance.selectedCount()).toBe(8);

    // Untick one — the cap hint clears and the 9th re-enables.
    tick(0);
    expect(fixture.componentInstance.selectedCount()).toBe(7);
    expect(el.querySelector('[data-testid="ceremony-edges-cap-hint"]')).toBeNull();
    expect(
      el.querySelector<HTMLInputElement>('[data-testid="ceremony-edges-checkbox-8"]')?.disabled,
    ).toBe(false);
  });

  it('confirm mints then feeds memory; success beat carries the map deep-link', () => {
    setup();
    fixture.detectChanges();
    flushPropose();

    tick(0);
    tick(1);
    el.querySelector<HTMLButtonElement>('[data-testid="ceremony-edges-confirm"]')?.click();
    fixture.detectChanges();

    const mintReq = httpMock.expectOne(MINT_URL);
    // Ticked candidates travel as {title,intent,atomRefs?} — atom_refs mapped.
    expect(mintReq.request.body).toEqual({
      edges: [
        { title: 'Concept 0', intent: 'remediate', atomRefs: ['a-1', 'a-2'] },
        { title: 'Concept 1', intent: 'explore' },
      ],
    });
    mintReq.flush(
      {
        learningEdges: [
          { conceptId: 'c-0', title: 'Concept 0', intent: 'remediate', edgeId: 'e-0' },
          { conceptId: 'c-1', title: 'Concept 1', intent: 'explore', edgeId: 'e-1' },
        ],
      },
      { status: 201, statusText: 'Created' },
    );
    fixture.detectChanges();

    const confirmReq = httpMock.expectOne(CONFIRM_URL);
    expect(confirmReq.request.body).toEqual({
      goal_id: GOAL,
      edges: [
        { concept_id: 'c-0', title: 'Concept 0', intent: 'remediate' },
        { concept_id: 'c-1', title: 'Concept 1', intent: 'explore' },
      ],
    });
    confirmReq.flush({ published: 1, noted: 1 });
    fixture.detectChanges();

    const success = el.querySelector('[data-testid="ceremony-edges-success"]');
    expect(success).not.toBeNull();
    expect(success?.textContent).toContain('2');
    const link = el.querySelector<HTMLAnchorElement>('[data-testid="ceremony-edges-map-link"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(`/a/knowledge/${GOAL}`);
    expect(el.querySelector('[data-testid="ceremony-edges-memory-warn"]')).toBeNull();
  });

  it('shows the NON-blocking memory-sync warning on hook failure and retries the hook only', () => {
    setup();
    fixture.detectChanges();
    flushPropose();

    tick(0);
    el.querySelector<HTMLButtonElement>('[data-testid="ceremony-edges-confirm"]')?.click();
    fixture.detectChanges();

    httpMock.expectOne(MINT_URL).flush(
      {
        learningEdges: [
          { conceptId: 'c-0', title: 'Concept 0', intent: 'remediate', edgeId: 'e-0' },
        ],
      },
      { status: 201, statusText: 'Created' },
    );
    fixture.detectChanges();
    httpMock
      .expectOne(CONFIRM_URL)
      .flush({ error: { code: 'CONFIRM_FAILED' } }, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();

    // Success beat renders (the edges ARE minted) + the warning + retry.
    expect(el.querySelector('[data-testid="ceremony-edges-success"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ceremony-edges-memory-warn"]')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="ceremony-edges-memory-retry"]')?.click();
    fixture.detectChanges();

    // Retry hits ONLY the confirm hook (no re-mint).
    httpMock.expectNone(MINT_URL);
    httpMock.expectOne(CONFIRM_URL).flush({ published: 1, noted: 0 });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="ceremony-edges-memory-warn"]')).toBeNull();
    expect(el.querySelector('[data-testid="ceremony-edges-success"]')).not.toBeNull();
  });

  it('keeps the list and shows an inline error when the mint itself fails (nothing written)', () => {
    setup();
    fixture.detectChanges();
    flushPropose();

    tick(0);
    el.querySelector<HTMLButtonElement>('[data-testid="ceremony-edges-confirm"]')?.click();
    fixture.detectChanges();

    httpMock
      .expectOne(MINT_URL)
      .flush(
        { error: { code: 'INVALID_LEARNING_EDGES' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    fixture.detectChanges();

    httpMock.expectNone(CONFIRM_URL);
    expect(el.querySelector('[data-testid="ceremony-edges-confirm-error"]')?.textContent).toContain(
      'familiar.ceremony.confirm_error_invalid',
    );
    // The list is still there for a corrected retry.
    expect(el.querySelector('[data-testid="ceremony-edges-section-remediate"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ceremony-edges-success"]')).toBeNull();
  });

  it('re-scout re-runs propose and clears the previous selection', () => {
    setup();
    fixture.detectChanges();
    flushPropose();

    tick(0);
    expect(fixture.componentInstance.selectedCount()).toBe(1);

    el.querySelector<HTMLButtonElement>('[data-testid="ceremony-edges-rescout"]')?.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="ceremony-edges-loading"]')).not.toBeNull();
    flushPropose();
    expect(fixture.componentInstance.selectedCount()).toBe(0);
  });

  it('has no critical or serious accessibility violations (proposed state)', async () => {
    setup();
    fixture.detectChanges();
    flushPropose();

    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
