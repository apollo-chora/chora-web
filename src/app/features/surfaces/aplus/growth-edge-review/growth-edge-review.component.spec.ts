import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { GrowthEdgeReviewComponent } from './growth-edge-review.component';
import { WeaknessReviewService } from './weakness-review.service';
import { PendingReviewStore } from './pending-review.store';
import {
  WeaknessReviewDecision,
  WeaknessUploadJob,
} from './weakness-review.models';
import { TranslateService } from '../../../../core/services/translate.service';
import { MeManaService } from '../../../../core/services/me-mana.service';

class StubTranslateService {
  instant(key: string): string {
    return key;
  }
}

function reviewJob(over: Partial<WeaknessUploadJob> = {}): WeaknessUploadJob {
  return {
    upload_id: 'u1',
    status: 'AWAITING_REVIEW',
    review: {
      familiar: { familiar_id: 'f1', name: 'Ignis', species: 'dragon' },
      proposed_edges: [
        {
          proposed_edge_id: 'p1',
          concept_label: 'Improper Fractions',
          summary: 'Converting improper fractions to mixed numbers is shaky.',
          suggested_angles: ['Draw the wholes first'],
          strength: 0.7,
          suggested_difficulty: 'standard',
        },
        {
          proposed_edge_id: 'p2',
          concept_label: 'Equivalent Fractions',
          summary: 'Spotting equivalent fractions needs practice.',
          strength: 0.5,
          suggested_difficulty: 'easier',
        },
      ],
      candidate_struggles: [
        { concept_key: 'decimals', concept_label: 'Decimals' },
        { concept_key: 'percentages', concept_label: 'Percentages' },
      ],
      available_outputs: [
        { kind: 'focused_dose', mana_price: 0, default_selected: true },
        { kind: 'familiar_coaching', mana_price: 10 },
        { kind: 'practice_test', mana_price: 30 },
        { kind: 'study_aids', mana_price: 20 },
      ],
    },
    ...over,
  };
}

function makeServiceMock(opts: {
  poll$?: Observable<WeaknessUploadJob>;
  resume$?: Observable<WeaknessUploadJob>;
} = {}) {
  return {
    pollUpload: vi.fn(() => opts.poll$ ?? of(reviewJob())),
    // Typed to the real WeaknessReviewService.resume signature so that
    // `.mock.calls[0]` carries the [uploadId, decision] tuple (an untyped
    // `vi.fn()` infers a zero-arg call → `[]`, which `tsc -b` rejects).
    resume: vi.fn<
      (
        uploadId: string,
        decision: WeaknessReviewDecision,
      ) => Observable<WeaknessUploadJob>
    >(() => opts.resume$ ?? of(reviewJob({ status: 'COMPLETED', upserted_growth_edge_ids: ['e1'] }))),
    upload: vi.fn(),
  };
}

function makeManaMock(balance = 500) {
  return { balanceUnits: () => balance, load: vi.fn() };
}

function makeStoreMock() {
  return {
    set: vi.fn<(uploadId: string) => void>(),
    get: vi.fn<() => string | null>(() => null),
    clear: vi.fn<() => void>(),
  };
}

async function mount(
  opts: Parameters<typeof makeServiceMock>[0] & { balance?: number } = {},
): Promise<{
  fixture: ComponentFixture<GrowthEdgeReviewComponent>;
  component: GrowthEdgeReviewComponent;
  svc: ReturnType<typeof makeServiceMock>;
  store: ReturnType<typeof makeStoreMock>;
}> {
  const svc = makeServiceMock(opts);
  const mana = makeManaMock(opts.balance);
  const store = makeStoreMock();
  await TestBed.configureTestingModule({
    imports: [GrowthEdgeReviewComponent],
    providers: [
      provideRouter([]),
      { provide: WeaknessReviewService, useValue: svc },
      { provide: MeManaService, useValue: mana },
      { provide: TranslateService, useClass: StubTranslateService },
      { provide: PendingReviewStore, useValue: store },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GrowthEdgeReviewComponent);
  fixture.componentRef.setInput('uploadId', 'u1');
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, svc, store };
}

describe('GrowthEdgeReviewComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('loads the review panel on init and defaults every edge to accept', async () => {
    const { component, svc } = await mount();
    expect(svc.pollUpload).toHaveBeenCalledWith('u1');
    expect(component.state()).toBe('review');
    expect(component.panel()?.proposed_edges.length).toBe(2);
    expect(component.decisionFor('p1')?.decision).toBe('accept');
    expect(component.decisionFor('p1')?.difficulty).toBe('standard');
    expect(component.acceptedCount()).toBe(2);
  });

  it('is Familiar-fronted — shows the Familiar name presenting the diagnosis', async () => {
    const { fixture } = await mount();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ignis');
  });

  it('never renders any free-form text field (bounded controls only)', async () => {
    const { fixture } = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('textarea').length).toBe(0);
    expect(host.querySelectorAll('input[type="text"]').length).toBe(0);
    expect(host.querySelectorAll('input:not([type])').length).toBe(0);
  });

  it('reject lowers the accepted count; difficulty is bounded per edge', async () => {
    const { component } = await mount();
    component.setDecision('p1', 'reject');
    expect(component.decisionFor('p1')?.decision).toBe('reject');
    expect(component.acceptedCount()).toBe(1);
    component.setDifficulty('p2', 'harder');
    expect(component.decisionFor('p2')?.difficulty).toBe('harder');
  });

  it('merge records the merge target on the edge decision', async () => {
    const { component } = await mount();
    component.setDecision('p2', 'merge');
    component.setMergeTarget('p2', 'p1');
    expect(component.decisionFor('p2')?.decision).toBe('merge');
    expect(component.decisionFor('p2')?.merge_into_id).toBe('p1');
  });

  it('add-a-struggle is a bounded toggle over server candidates', async () => {
    const { component } = await mount();
    component.toggleStruggle('decimals');
    expect(component.isStruggleAdded('decimals')).toBe(true);
    component.toggleStruggle('decimals');
    expect(component.isStruggleAdded('decimals')).toBe(false);
  });

  it('output chooser drives the mana running total vs the wallet', async () => {
    const { component } = await mount({ balance: 25 });
    // focused_dose default-selected (0). Add practice_test (30) → total 30 > 25.
    expect(component.manaTotal()).toBe(0);
    component.toggleOutput('practice_test');
    expect(component.manaTotal()).toBe(30);
    expect(component.walletBalance()).toBe(25);
    expect(component.affordable()).toBe(false);
    // Drop it again → affordable.
    component.toggleOutput('practice_test');
    expect(component.affordable()).toBe(true);
  });

  it('confirm builds the bounded decision and resumes with action=confirm', async () => {
    const { component, svc } = await mount({ balance: 500 });
    component.setDecision('p2', 'merge');
    component.setMergeTarget('p2', 'p1');
    component.toggleStruggle('decimals');
    component.toggleOutput('study_aids'); // +20
    component.confirm();

    expect(svc.resume).toHaveBeenCalledTimes(1);
    const [uploadId, decision] = svc.resume.mock.calls[0] as [
      string,
      WeaknessReviewDecision,
    ];
    expect(uploadId).toBe('u1');
    expect(decision.action).toBe('confirm');
    expect(decision.edges).toContainEqual({
      proposed_edge_id: 'p1',
      decision: 'accept',
      difficulty: 'standard',
    });
    expect(decision.edges).toContainEqual({
      proposed_edge_id: 'p2',
      decision: 'merge',
      merge_into_id: 'p1',
      difficulty: 'easier',
    });
    expect(decision.added_struggles).toEqual(['decimals']);
    expect(decision.selected_outputs).toEqual(
      expect.arrayContaining(['focused_dose', 'study_aids']),
    );
    expect(component.submitState()).toBe('done');
  });

  it('does not resume when the chosen outputs exceed the wallet', async () => {
    const { component, svc } = await mount({ balance: 5 });
    component.toggleOutput('practice_test'); // 30 > 5
    component.confirm();
    expect(svc.resume).not.toHaveBeenCalled();
    expect(component.submitState()).toBe('idle');
  });

  it('reiterate resumes with action=reiterate and re-enters loading', async () => {
    const { component, svc } = await mount();
    component.setDecision('p1', 'reject');
    component.reiterate();
    const [, decision] = svc.resume.mock.calls[0] as [string, WeaknessReviewDecision];
    expect(decision.action).toBe('reiterate');
    // After a reiterate that returns ANALYZING, the panel re-polls.
    expect(svc.resume).toHaveBeenCalledTimes(1);
  });

  it('fail-loud: a poll error surfaces the error state with a retry path', async () => {
    const { component } = await mount({
      poll$: throwError(() => ({ status: 500 })),
    });
    expect(component.state()).toBe('error');
  });

  it('fail-loud: a FAILED job surfaces the failed state (non-leaky)', async () => {
    const { component } = await mount({
      poll$: of({ upload_id: 'u1', status: 'FAILED', failure_reason: 'screened' } as WeaknessUploadJob),
    });
    expect(component.state()).toBe('failed');
  });

  it('a COMPLETED job (already reviewed) shows the completed state', async () => {
    const { component } = await mount({
      poll$: of({ upload_id: 'u1', status: 'COMPLETED', upserted_growth_edge_ids: ['e1'] } as WeaknessUploadJob),
    });
    expect(component.state()).toBe('completed');
  });

  it('surfaces a resume error as a fail-loud submit error (no silent swallow)', async () => {
    const { component } = await mount({
      resume$: throwError(() => ({ status: 503 })),
      balance: 500,
    });
    component.confirm();
    expect(component.submitState()).toBe('error');
  });

  it('retry re-polls the upload', async () => {
    const { component, svc } = await mount();
    expect(svc.pollUpload).toHaveBeenCalledTimes(1);
    component.retry();
    expect(svc.pollUpload).toHaveBeenCalledTimes(2);
  });

  it('mergeTargetsFor lists the OTHER edges (bounded merge targets)', async () => {
    const { component } = await mount();
    const targets = component.mergeTargetsFor('p1');
    expect(targets.map((t) => t.proposed_edge_id)).toEqual(['p2']);
  });

  it('isOutputSelected reflects the server default selection', async () => {
    const { component } = await mount();
    expect(component.isOutputSelected('focused_dose')).toBe(true);
    expect(component.isOutputSelected('practice_test')).toBe(false);
  });

  it('mutating an unknown edge id is a safe no-op', async () => {
    const { component } = await mount();
    component.setDecision('ghost', 'reject');
    component.setDifficulty('ghost', 'harder');
    component.setMergeTarget('ghost', 'p1');
    expect(component.decisionFor('ghost')).toBeUndefined();
    expect(component.acceptedCount()).toBe(2);
  });

  it('polls while analyzing, then shows the review once the interrupt lands', async () => {
    vi.useFakeTimers();
    const poll = vi
      .fn()
      .mockReturnValueOnce(of({ upload_id: 'u1', status: 'ANALYZING' } as WeaknessUploadJob))
      .mockReturnValueOnce(of(reviewJob()));
    const svc = { pollUpload: poll, resume: vi.fn(), upload: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [GrowthEdgeReviewComponent],
      providers: [
        provideRouter([]),
        { provide: WeaknessReviewService, useValue: svc },
        { provide: MeManaService, useValue: { balanceUnits: () => 500, load: vi.fn() } },
        { provide: TranslateService, useClass: StubTranslateService },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GrowthEdgeReviewComponent);
    fixture.componentRef.setInput('uploadId', 'u1');
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('analyzing');
    await vi.advanceTimersByTimeAsync(2100);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.state()).toBe('review');
  });

  it('reiterate routes the re-diagnosed panel back through the review', async () => {
    const { component } = await mount({
      resume$: of(reviewJob({ upload_id: 'u1' })),
    });
    component.reiterate();
    // The crew re-ran and returned a fresh AWAITING_REVIEW panel.
    expect(component.state()).toBe('review');
    expect(component.submitState()).toBe('idle');
  });

  it('fail-loud: an AWAITING_REVIEW job with no panel surfaces the error state', async () => {
    const { component } = await mount({
      poll$: of({ upload_id: 'u1', status: 'AWAITING_REVIEW' } as WeaknessUploadJob),
    });
    expect(component.state()).toBe('error');
  });

  it('clears the pending-review store when a confirm resume completes (CHO-2337)', async () => {
    // Resuming resolves the parked review, so the /a/knowledge banner must not
    // linger. The confirm branch does not re-poll, so the clear lives there.
    const { component, store } = await mount({ balance: 500 });
    component.confirm();
    expect(component.submitState()).toBe('done');
    expect(store.clear).toHaveBeenCalled();
  });

  it('clears the pending-review store when the loaded upload is already reviewed (CHO-2337)', async () => {
    // Land on the review URL for an upload that already COMPLETED elsewhere →
    // the banner must self-heal, never point at a resolved review.
    const { store } = await mount({
      poll$: of({
        upload_id: 'u1',
        status: 'COMPLETED',
        upserted_growth_edge_ids: ['e1'],
      } as WeaknessUploadJob),
    });
    expect(store.clear).toHaveBeenCalled();
  });

  it('does not clear the store while the review is still AWAITING_REVIEW (banner stays)', async () => {
    const { store } = await mount(); // default poll → AWAITING_REVIEW
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('confirm omits merge_into_id when no merge target was chosen', async () => {
    const { component, svc } = await mount({ balance: 500 });
    component.setDecision('p2', 'merge'); // merge selected but no target set
    component.confirm();
    const [, decision] = svc.resume.mock.calls[0] as [string, WeaknessReviewDecision];
    const p2 = decision.edges.find((e) => e.proposed_edge_id === 'p2');
    expect(p2?.decision).toBe('merge');
    expect(p2?.merge_into_id).toBeUndefined();
  });
});
