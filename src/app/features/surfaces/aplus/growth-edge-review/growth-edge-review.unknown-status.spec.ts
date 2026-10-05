/**
 * RED spec: an upload status this build does not know must not be silently
 * dropped (C4 frontend slice 2, the defect found while grounding item 2).
 *
 * `handleJob` switches over five statuses and had NO default arm, so an
 * unrecognised one changed nothing: no state, no poll, no error, no message.
 * The screen simply sat in whatever state it was already in.
 *
 * It is reachable because the RESUME result is fed back through that same
 * handler, and `normaliseResumeResponse` deliberately CASTS whatever the
 * orchestrator sent (`weakness-review.service.ts:121-133`) rather than
 * defaulting it, on the stated grounds that "a default arm here would turn an
 * unknown orchestrator state into a plausible lie about a run the learner paid
 * for". That is the right call, and it hands the decision to the component. The
 * component then dropped it on the floor. Deliberate non-defaulting upstream
 * plus a non-total switch downstream is a silent no-op.
 *
 * The same file already records fixing this failure once, for the CASING half:
 * "a reiterate therefore fell through every case in the component's switch and
 * did nothing at all, with no error to show for it". The totality half is this.
 *
 * The fix must NAME what arrived, never pick a plausible state, and must not
 * clear the pending-review banner: an unknown status is not evidence that the
 * review resolved, and clearing it would strand the learner with no way back.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';

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
          summary: 'Converting improper fractions is shaky.',
          strength: 0.7,
          suggested_difficulty: 'standard',
        },
      ],
      candidate_struggles: [],
      available_outputs: [
        { kind: 'focused_dose', mana_price: 0, default_selected: true },
      ],
    },
    ...over,
  };
}

/** A status no build knows: exactly what the cast lets through. */
const UNKNOWN = 'SOMETHING_THE_ORCHESTRATOR_INVENTED';

async function mount(resume$: Observable<WeaknessUploadJob>): Promise<{
  fixture: ComponentFixture<GrowthEdgeReviewComponent>;
  component: GrowthEdgeReviewComponent;
  store: { clear: ReturnType<typeof vi.fn> };
}> {
  const svc = {
    pollUpload: vi.fn(() => of(reviewJob())),
    resume: vi.fn<
      (
        uploadId: string,
        decision: WeaknessReviewDecision,
      ) => Observable<WeaknessUploadJob>
    >(() => resume$),
    upload: vi.fn(),
  };
  const store = {
    set: vi.fn<(uploadId: string) => void>(),
    get: vi.fn<() => string | null>(() => null),
    clear: vi.fn<() => void>(),
  };
  await TestBed.configureTestingModule({
    imports: [GrowthEdgeReviewComponent],
    providers: [
      provideRouter([]),
      { provide: WeaknessReviewService, useValue: svc },
      { provide: MeManaService, useValue: { balanceUnits: () => 500, load: vi.fn() } },
      { provide: TranslateService, useClass: StubTranslateService },
      { provide: PendingReviewStore, useValue: store },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(GrowthEdgeReviewComponent);
  fixture.componentRef.setInput('uploadId', 'u1');
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, store };
}

describe('GrowthEdgeReviewComponent, unknown upload status', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('reaches an error state instead of doing nothing at all', async () => {
    const { fixture, component } = await mount(
      of(reviewJob({ status: UNKNOWN as WeaknessUploadJob['status'] })),
    );

    component.reiterate();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
  });

  it('NAMES the status that arrived rather than picking a plausible one', async () => {
    const { fixture, component } = await mount(
      of(reviewJob({ status: UNKNOWN as WeaknessUploadJob['status'] })),
    );

    component.reiterate();
    fixture.detectChanges();

    expect(component.unknownStatus()).toBe(UNKNOWN);
    // Never "analysing": that would tell the learner a run is progressing when
    // nothing knows that it is.
    expect(component.state()).not.toBe('analyzing');
  });

  it('does NOT clear the pending-review banner on an unknown status', async () => {
    // An unknown status is not evidence the review resolved. COMPLETED and
    // FAILED clear it because both are terminal and known; this is neither, and
    // clearing would strand the learner with no route back to the review.
    const { fixture, component, store } = await mount(
      of(reviewJob({ status: UNKNOWN as WeaknessUploadJob['status'] })),
    );

    component.reiterate();
    fixture.detectChanges();

    expect(store.clear).not.toHaveBeenCalled();
  });

  it('still handles the known statuses it always did', async () => {
    // The default arm must not swallow the cases that already worked.
    const { fixture, component, store } = await mount(
      of(reviewJob({ status: 'COMPLETED', upserted_growth_edge_ids: ['e1'] })),
    );

    component.reiterate();
    fixture.detectChanges();

    expect(component.state()).toBe('completed');
    expect(store.clear).toHaveBeenCalled();
    expect(component.unknownStatus()).toBeNull();
  });
});
