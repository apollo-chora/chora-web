/**
 * assessment-authoring.component.spec.ts — CHO-2122 (FE-1, ADR-232).
 *
 * The R+ assessment-authoring entry is RE-HOMED onto the shared unified compose
 * canvas: it reuses the SHARED review+accept units (chora-unified-review-list +
 * buildAcceptRequest + previewAcceptMana + the manual-row helpers + the
 * UnifiedReviewItem/UnifiedTestSetConfig models) instead of a bespoke
 * poll/review/accept state-machine, and it drops the source-file-only
 * limitation — gaining prompt-only (ai_draft) + by-hand (manual) parity with A+.
 *
 * R+ KEEPS: its route + `assessment:author` gate (route config, untouched here)
 * and — critically — its `test_set`-on-accept assemble step, so chora-delivery
 * still assembles a DRAFT TestSet referencing the authored atoms by UUID.
 *
 * These tests assert the NEW behavior:
 *   • prompt-only authoring works (createAtom → ai_draft, NO source file);
 *   • source-file authoring still works (createAtom → batch_source_material);
 *   • by-hand authoring works (createAtom → createManualJob → accept, inline);
 *   • the accept carries a test_set block (assemble preserved);
 *   • the bespoke review UI is replaced by the shared chora-unified-review-list
 *     and the accept body is built by the shared buildAcceptRequest.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { RPlusAssessmentAuthoringComponent } from './assessment-authoring.component';
import { AtomAuthoringService } from '../../aplus/atom-authoring/atom-authoring.service';
import type {
  AcceptGenerationJobRequest,
  AcceptGenerationJobResponse,
  GenerateQuestionJobRequest,
  ProposedTestSet,
  QuestionDraftCandidate,
  QuestionGenerationJob,
} from '../../aplus/atom-authoring/atom-authoring.model';
import type { QuestionBatchPlan } from '../../../../shared/components/question-batch-generator/question-batch-generator.model';
import type { EditableQuestion } from '../../../../shared/components/chora-question-editor/chora-question-editor.model';
import type { UnifiedReviewItem } from '../../aplus/atom-authoring/unified/unified-review.model';

const ATOM_ID = '01970000-1111-7000-a000-000000000001';
const JOB_ID = '01970000-2222-7000-a000-000000000002';

/** A single-type plan (the prompt-only ai_draft path can dispatch one type). */
function singlePlan(valid = true, count = 2): QuestionBatchPlan {
  return {
    type_plan: [{ question_type: 'mcq', count, max_images: 0 }],
    total: count,
    allow_images: false,
    valid,
  };
}

/** A mixed plan (needs source material — the no-files ai_draft path refuses it). */
function mixedPlan(valid = true): QuestionBatchPlan {
  return {
    type_plan: [
      { question_type: 'mcq', count: 4, max_images: 0 },
      { question_type: 'oe', count: 1, max_images: 0 },
    ],
    total: 5,
    allow_images: false,
    valid,
  };
}

function job(
  status: QuestionGenerationJob['status'],
  drafts?: readonly QuestionDraftCandidate[],
  extra: Partial<QuestionGenerationJob> = {},
): QuestionGenerationJob {
  return {
    job_id: JOB_ID,
    atom_id: ATOM_ID,
    job_type: 'ai_draft',
    status,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    candidate_questions: drafts,
    ...extra,
  };
}

function mcqDraft(id: string): QuestionDraftCandidate {
  return {
    draft_id: id,
    type: 'mcq',
    prompt: `Q ${id}?`,
    mcq_payload: {
      options: [
        { option_id: '1', label: 'A', is_correct: true, explainer: 'e' },
        { option_id: '2', label: 'B', is_correct: false, explainer: 'e' },
      ],
    },
  };
}

function mcqDraftWithImage(id: string, url: string): QuestionDraftCandidate {
  return { ...mcqDraft(id), image_url: url };
}

function validMcqEdit(): EditableQuestion {
  return {
    question_type: 'mcq',
    prompt: 'Hand-authored stem?',
    options: [
      { option_id: null, label: 'Alpha', is_correct: true, explainer: '' },
      { option_id: null, label: 'Beta', is_correct: false, explainer: '' },
    ],
    model_answer: '',
  };
}

function pdf(name = 'photosynthesis.pdf'): File {
  return new File([new Uint8Array(64)], name, { type: 'application/pdf' });
}

interface SvcOpts {
  createAtomId?: string;
  createError?: unknown;
  generate?: QuestionGenerationJob;
  generateError?: unknown;
  polls?: QuestionGenerationJob[];
  pollError?: unknown;
  manualJob?: QuestionGenerationJob;
  manualError?: unknown;
  accept?: AcceptGenerationJobResponse;
  acceptError?: unknown;
  regenStart?: QuestionGenerationJob;
  regenError?: unknown;
}

function makeSvc(opts: SvcOpts = {}) {
  let i = 0;
  const polls = opts.polls ?? [];
  return {
    createAtom: vi.fn((_req: unknown) =>
      opts.createError
        ? throwError(() => opts.createError)
        : of({ atomId: opts.createAtomId ?? ATOM_ID }),
    ),
    generateQuestionJob: vi.fn(
      (_atomId: string, _req: GenerateQuestionJobRequest, _idem: string) =>
        opts.generateError
          ? throwError(() => opts.generateError)
          : of(opts.generate ?? job('running')),
    ),
    pollGenerationJob: vi.fn((_atomId: string, _jobId: string) => {
      if (opts.pollError) return throwError(() => opts.pollError);
      const next = polls[Math.min(i, polls.length - 1)];
      i += 1;
      return of(next);
    }),
    createManualJob: vi.fn((_atomId: string) =>
      opts.manualError
        ? throwError(() => opts.manualError)
        : of(opts.manualJob ?? job('succeeded', [])),
    ),
    acceptGenerationJob: vi.fn(
      (_atomId: string, _jobId: string, _req: AcceptGenerationJobRequest) =>
        opts.acceptError
          ? throwError(() => opts.acceptError)
          : of(opts.accept ?? ({ mana_debited: 0 } as AcceptGenerationJobResponse)),
    ),
    regenerateImage: vi.fn(
      (_atomId: string, _parentJobId: string, _req: unknown, _idem: string) =>
        opts.regenError
          ? throwError(() => opts.regenError)
          : of(opts.regenStart ?? job('requested')),
    ),
  };
}

async function setup(opts: SvcOpts = {}): Promise<{
  fixture: ComponentFixture<RPlusAssessmentAuthoringComponent>;
  component: RPlusAssessmentAuthoringComponent;
  svc: ReturnType<typeof makeSvc>;
}> {
  const svc = makeSvc(opts);
  await TestBed.configureTestingModule({
    imports: [RPlusAssessmentAuthoringComponent],
    providers: [{ provide: AtomAuthoringService, useValue: svc }],
  }).compileComponents();
  const fixture = TestBed.createComponent(RPlusAssessmentAuthoringComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, svc };
}

/** Drive an AI compose → poll → review, returning the harness in review. */
async function intoReview(
  drafts: readonly QuestionDraftCandidate[],
  opts: SvcOpts = {},
  plan: QuestionBatchPlan = singlePlan(true, drafts.length || 1),
): Promise<Awaited<ReturnType<typeof setup>>> {
  const { polls: extra = [], ...rest } = opts;
  const h = await setup({
    generate: job('running'),
    polls: [job('succeeded', drafts), ...extra],
    ...rest,
  });
  h.component.onTopicInput('Photosynthesis');
  h.component.onBatchPlanChange(plan);
  h.component.start();
  await vi.advanceTimersByTimeAsync(2000); // poll → succeeded → review
  expect(h.component.composeState().status).toBe('review');
  return h;
}

function firstReq(svc: ReturnType<typeof makeSvc>): GenerateQuestionJobRequest {
  return svc.generateQuestionJob.mock.calls[0][1];
}

function acceptReq(svc: ReturnType<typeof makeSvc>): AcceptGenerationJobRequest {
  return svc.acceptGenerationJob.mock.calls[0][2];
}

describe('RPlusAssessmentAuthoringComponent (CHO-2122 / ADR-232)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── Shell + shared-canvas reuse ───────────────────────────────────
  it('renders the R+ shell + the shared composer (idle/compose)', async () => {
    const { fixture } = await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="rplus-assessment-authoring"]')).toBeTruthy();
    expect(el.querySelector('chora-question-batch-generator')).toBeTruthy();
  });

  it('offers an AI/By-hand mode toggle and defaults to AI', async () => {
    const { fixture, component } = await setup();
    expect(component.mode()).toBe('ai');
    expect(
      fixture.nativeElement.querySelector('[data-testid="rplus-mode-manual"]'),
    ).toBeTruthy();
  });

  it('exposes a source-material dropzone in AI mode (source-file parity kept)', async () => {
    const { fixture } = await setup();
    expect(fixture.nativeElement.querySelector('chora-file-dropzone')).toBeTruthy();
  });

  // ── Prompt-only authoring (NEW — the source-file-only limit is gone) ──
  it('enables start with a topic + valid plan and NO source file (prompt-only)', async () => {
    const { component } = await setup();
    expect(component.canStart()).toBe(false);
    component.onTopicInput('Photosynthesis');
    component.onBatchPlanChange(singlePlan(true));
    expect(component.canStart()).toBe(true); // no file required anymore
  });

  it('requires a topic to start (empty topic gates start off)', async () => {
    const { component } = await setup();
    component.onBatchPlanChange(singlePlan(true));
    expect(component.canStart()).toBe(false);
    component.onTopicInput('Cells');
    expect(component.canStart()).toBe(true);
  });

  it('dispatches prompt-only via createAtom → generateQuestionJob(ai_draft), no file', async () => {
    const { component, svc } = await setup({ generate: job('running'), polls: [job('running')] });
    component.onTopicInput('Photosynthesis');
    component.onBatchPlanChange(singlePlan(true, 3));
    component.start();
    expect(svc.createAtom).toHaveBeenCalledTimes(1);
    expect(svc.generateQuestionJob).toHaveBeenCalledTimes(1);
    const req = firstReq(svc);
    expect(req.job_type).toBe('ai_draft');
    if (req.job_type === 'ai_draft') {
      expect(req.prompt).toContain('Photosynthesis');
      expect(req.count).toBe(3);
      expect(req.difficulty).toBe(3);
    }
    expect(component.isWorking()).toBe(true);
  });

  it('refuses a mixed-type plan with NO source material (ai_draft is single-type)', async () => {
    const { component, svc } = await setup();
    component.onTopicInput('Biology');
    component.onBatchPlanChange(mixedPlan(true));
    component.start();
    expect(svc.createAtom).not.toHaveBeenCalled();
    expect(component.composeState().status).toBe('error');
    expect(component.errorMessage()).toBeTruthy();
  });

  // ── Source-file authoring still works ─────────────────────────────
  it('dispatches source-file authoring via generateQuestionJob(batch_source_material)', async () => {
    const { component, svc } = await setup({ generate: job('running'), polls: [job('running')] });
    component.onTopicInput('Photosynthesis');
    component.onBatchPlanChange(mixedPlan(true));
    component.onSourceFilesAdded([pdf()]);
    component.start();
    expect(svc.generateQuestionJob).toHaveBeenCalledTimes(1);
    const req = firstReq(svc);
    expect(req.job_type).toBe('batch_source_material');
    if (req.job_type === 'batch_source_material') {
      expect(req.type_plan).toEqual(mixedPlan(true).type_plan);
      expect(req.grounding_mode).toBe('starting_point');
      expect(req.file ?? req.files?.[0]).toBeInstanceOf(File);
    }
  });

  // ── Poll → review renders the SHARED review list ──────────────────
  it('polls to succeeded and renders the shared chora-unified-review-list', async () => {
    const { fixture, component } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')]);
    fixture.detectChanges();
    expect(component.reviewItems().length).toBe(2);
    expect(
      fixture.nativeElement.querySelector('chora-unified-review-list'),
    ).toBeTruthy();
    // The bespoke review UI is GONE — the old per-component title field lived at
    // [data-testid="rplus-assessment-title"]; the shared review list owns the
    // test-set title now, so the bespoke field must be absent.
    expect(
      fixture.nativeElement.querySelector('[data-testid="rplus-assessment-title"]'),
    ).toBeFalsy();
  });

  it('surfaces a failed job as an error state', async () => {
    const { component } = await setup({ generate: job('running'), polls: [job('failed')] });
    component.onTopicInput('X');
    component.onBatchPlanChange(singlePlan(true));
    component.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.composeState().status).toBe('error');
    expect(component.errorMessage()).toBeTruthy();
  });

  it('maps a createAtom 402 to the insufficient-mana error', async () => {
    const { component } = await setup({ createError: { status: 402 } });
    component.onTopicInput('X');
    component.onBatchPlanChange(singlePlan(true));
    component.start();
    expect(component.composeState().status).toBe('error');
    expect(component.errorMessage()).toBe('rplus.assessment_authoring.error_insufficient_mana');
  });

  // ── test_set-on-accept assemble (CRITICAL — must be preserved) ─────
  it('seeds an ENABLED test_set (title from the topic) for a ≥2-question review', async () => {
    const { component } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')]);
    expect(component.testSetConfig().enabled).toBe(true);
    expect(component.testSetConfig().title.trim().length).toBeGreaterThan(0);
  });

  it('accept carries a test_set block referencing the kept atoms by draft_id', async () => {
    const { component, svc } = await intoReview(
      [mcqDraft('d-1'), mcqDraft('d-2')],
      { accept: { mana_debited: 20 } },
    );
    component.onAccept();
    expect(svc.acceptGenerationJob).toHaveBeenCalledTimes(1);
    const req = acceptReq(svc);
    expect(req.test_set).toBeTruthy();
    expect(req.test_set?.title.trim().length).toBeGreaterThan(0);
    expect(req.test_set?.items?.map((i) => i.draft_id)).toEqual(['d-1', 'd-2']);
    expect(req.test_set?.items?.[0].display_order).toBe(1);
    expect(req.test_set?.items?.[0].points).toBeGreaterThan(0);
    expect(req.accepted_candidates.map((c) => c.draft_id)).toEqual(['d-1', 'd-2']);
  });

  it('honours an LLM proposed_test_set (title + order) when present', async () => {
    const proposal: ProposedTestSet = {
      title: 'Week 3 — Photosynthesis',
      order: ['d-2', 'd-1'],
      points: { 'd-1': 5, 'd-2': 7 },
    };
    const succeeded = job(
      'succeeded',
      [mcqDraft('d-1'), mcqDraft('d-2')],
      { proposed_test_set: proposal },
    );
    const { component, svc } = await setup({
      generate: job('running'),
      polls: [succeeded],
      accept: {},
    });
    component.onTopicInput('Photosynthesis');
    component.onBatchPlanChange(singlePlan(true, 2));
    component.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.composeState().status).toBe('review');
    // Title comes from the proposal; order is proposal-first (d-2 then d-1).
    expect(component.testSetConfig().title).toBe('Week 3 — Photosynthesis');
    expect(component.reviewItems().map((i) => (i.kind === 'ai' ? i.draftId : ''))).toEqual([
      'd-2',
      'd-1',
    ]);
    component.onAccept();
    const req = acceptReq(svc);
    expect(req.test_set?.items?.map((i) => i.draft_id)).toEqual(['d-2', 'd-1']);
  });

  it('the test_set reflects only the kept (selected) subset (≥2 kept)', async () => {
    const { component, svc } = await intoReview(
      [mcqDraft('d-1'), mcqDraft('d-2'), mcqDraft('d-3')],
      { accept: {} },
    );
    component.onToggleSelect('d-3'); // drop d-3, two remain
    component.onAccept();
    const req = acceptReq(svc);
    expect(req.test_set?.items?.map((i) => i.draft_id)).toEqual(['d-1', 'd-2']);
    expect(req.accepted_candidates.map((c) => c.draft_id)).toEqual(['d-1', 'd-2']);
  });

  it('builds the accept body via the shared builder — an untouched AI row is just {draft_id}', async () => {
    const { component, svc } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')], {
      accept: {},
    });
    component.onSetTestSetEnabled(false); // isolate the candidate shape
    component.onAccept();
    const req = acceptReq(svc);
    expect(req.accepted_candidates[0]).toEqual({ draft_id: 'd-1' });
    expect(req.test_set).toBeUndefined();
  });

  it('carries an inline edit as an accept override (shared builder)', async () => {
    const { component, svc } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')], {
      accept: {},
    });
    const edit: EditableQuestion = { ...validMcqEdit(), prompt: 'Edited stem?' };
    component.onEditItem({ key: 'd-1', edit });
    component.onAccept();
    const req = acceptReq(svc);
    expect(req.accepted_candidates[0].prompt_override).toBe('Edited stem?');
  });

  // ── By-hand authoring (NEW parity) ────────────────────────────────
  it('drops into a manual review list in By-hand mode', async () => {
    const { fixture, component } = await setup();
    component.onModeChange('manual');
    fixture.detectChanges();
    expect(component.mode()).toBe('manual');
    expect(
      fixture.nativeElement.querySelector('chora-unified-review-list'),
    ).toBeTruthy();
  });

  it('appends a hand-authored row and commits it via createManualJob → accept (inline, no test_set)', async () => {
    const { component, svc } = await setup({ accept: { mana_debited: 0 } });
    component.onModeChange('manual');
    component.onAddManual('mcq');
    const row = component.reviewItems()[0] as Extract<UnifiedReviewItem, { kind: 'manual' }>;
    expect(row.kind).toBe('manual');
    component.onEditItem({ key: row.tempId, edit: validMcqEdit() });
    expect(component.canAcceptManual()).toBe(true);

    component.onManualAccept();
    expect(svc.createAtom).toHaveBeenCalledTimes(1);
    expect(svc.createManualJob).toHaveBeenCalledTimes(1);
    expect(svc.acceptGenerationJob).toHaveBeenCalledTimes(1);
    const req = acceptReq(svc);
    expect(req.accepted_candidates[0].type).toBe('mcq');
    expect(req.accepted_candidates[0].prompt_override).toBe('Hand-authored stem?');
    expect(req.accepted_candidates[0].draft_id).toBeUndefined();
    expect(req.test_set).toBeUndefined();
  });

  // ── Accept done + fix-and-retry error handling ────────────────────
  it('reaches a done confirmation after a successful accept', async () => {
    const { fixture, component } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')], {
      accept: { persisted: [{}, {}] as never },
    });
    component.onAccept();
    fixture.detectChanges();
    expect(component.composeState().status).toBe('done');
    expect(component.createdCount()).toBe(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="rplus-assessment-done"]'),
    ).toBeTruthy();
  });

  it('preserves the review (fix-and-retry) on an accept 500 — no data loss', async () => {
    const { component } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')], {
      acceptError: { status: 500 },
    });
    component.onAccept();
    expect(component.composeState().status).toBe('review'); // NOT flipped to error
    expect(component.acceptError()).toBe('rplus.assessment_authoring.error_upstream');
    expect(component.reviewItems().length).toBe(2); // candidates kept
  });

  it('does not accept when nothing is selected', async () => {
    const { component, svc } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')]);
    component.onToggleSelect('d-1');
    component.onToggleSelect('d-2');
    component.onAccept();
    expect(svc.acceptGenerationJob).not.toHaveBeenCalled();
  });

  it('reset() returns to the compose form', async () => {
    const { component } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')]);
    component.reset();
    expect(component.composeState().status).toBe('idle');
    expect(component.reviewItems().length).toBe(0);
  });

  // ── Image regenerate parity (shared review list + service) ────────
  it('regenerates a candidate image via the service and swaps it in place', async () => {
    const { component, svc } = await intoReview(
      [mcqDraftWithImage('d-1', 'https://cdn/old.png'), mcqDraft('d-2')],
      {
        polls: [
          job('succeeded', [
            {
              draft_id: 'd-1',
              type: 'mcq',
              prompt: '',
              image_url: 'https://cdn/new.png',
            } as QuestionDraftCandidate,
          ]),
        ],
      },
    );
    component.onRegenImage({ draftId: 'd-1', placement: 'stem', prompt: 'clearer diagram' });
    expect(svc.regenerateImage).toHaveBeenCalledTimes(1);
    expect(component.regenState()['d-1|stem']?.regenerating).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.regenState()['d-1|stem']?.regenerating).toBe(false);
    const row = component
      .reviewItems()
      .find((i) => i.kind === 'ai' && i.draftId === 'd-1') as Extract<
      UnifiedReviewItem,
      { kind: 'ai' }
    >;
    expect(row.candidate.image_url).toBe('https://cdn/new.png');
  });

  // ── Compose-form setters + guards ─────────────────────────────────
  it('updates compose-form signals via setters and ignores invalid input', async () => {
    const { component } = await setup();
    component.onContextBodyInput('use the diagram');
    component.onCognitiveLevelChange('analyzing');
    component.onDifficultyChange('5');
    component.setGroundingMode('strict');
    expect(component.contextBody()).toBe('use the diagram');
    expect(component.cognitiveLevel()).toBe('analyzing');
    expect(component.difficulty()).toBe(5);
    expect(component.groundingMode()).toBe('strict');
    component.onCognitiveLevelChange('bogus'); // ignored
    component.onDifficultyChange('9'); // out of range, ignored
    expect(component.cognitiveLevel()).toBe('analyzing');
    expect(component.difficulty()).toBe(5);
  });

  it('rejects too many source files with an inline error (fail-loud)', async () => {
    const { component } = await setup();
    component.onSourceFilesAdded(Array.from({ length: 6 }, (_u, i) => pdf(`f${i}.pdf`)));
    expect(component.fileError()).toBeTruthy();
    expect(component.sourceFiles().length).toBe(0);
  });

  it('rejects an unsupported source type', async () => {
    const { component } = await setup();
    component.onSourceFilesAdded([new File([new Uint8Array(8)], 'malware.exe')]);
    expect(component.fileError()).toBeTruthy();
    expect(component.sourceFiles().length).toBe(0);
  });

  it('adds then removes a source file, clearing the error', async () => {
    const { component } = await setup();
    component.onSourceFilesAdded([pdf('a.pdf')]);
    expect(component.sourceFiles().length).toBe(1);
    component.onSourceFilesAdded([]); // empty add is a no-op
    expect(component.sourceFiles().length).toBe(1);
    component.removeSourceFile(0);
    expect(component.sourceFiles().length).toBe(0);
    expect(component.fileError()).toBeNull();
  });

  it('dispatches multiple source files via the files[] batch part', async () => {
    const { component, svc } = await setup({ generate: job('running'), polls: [job('running')] });
    component.onTopicInput('Biology');
    component.onBatchPlanChange(mixedPlan(true));
    component.onSourceFilesAdded([pdf('a.pdf'), pdf('b.pdf')]);
    component.start();
    const req = firstReq(svc);
    expect(req.job_type).toBe('batch_source_material');
    if (req.job_type === 'batch_source_material') {
      expect(req.files?.length).toBe(2);
      expect(req.file).toBeUndefined();
    }
  });

  it('surfaces a poll transport error as an error state', async () => {
    const { component } = await setup({ generate: job('running'), pollError: { status: 503 } });
    component.onTopicInput('X');
    component.onBatchPlanChange(singlePlan(true));
    component.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.composeState().status).toBe('error');
    expect(component.errorMessage()).toBe('rplus.assessment_authoring.error_upstream');
  });

  // ── Review-list mutations (shared component outputs) ──────────────
  it('supports review mutations: title, toggle-all, reorder, points, description', async () => {
    const { component } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')], { accept: {} });
    component.onTitleChange({ key: 'd-1', title: 'Renamed atom' });
    const r1 = component.reviewItems().find(
      (i): i is Extract<UnifiedReviewItem, { kind: 'ai' }> =>
        i.kind === 'ai' && i.draftId === 'd-1',
    );
    expect(r1?.titleOverride).toBe('Renamed atom');

    component.onToggleAll();
    expect(component.reviewItems().every((i) => !i.selected)).toBe(true);
    component.onToggleAll();
    expect(component.reviewItems().every((i) => i.selected)).toBe(true);

    component.onReorder({ from: 0, to: 1 });
    expect(
      component.reviewItems().map((i) => (i.kind === 'ai' ? i.draftId : '')),
    ).toEqual(['d-2', 'd-1']);
    component.onReorder({ from: 0, to: 0 }); // no-op
    component.onReorder({ from: 9, to: 0 }); // out-of-bounds no-op
    expect(
      component.reviewItems().map((i) => (i.kind === 'ai' ? i.draftId : '')),
    ).toEqual(['d-2', 'd-1']);

    component.onPointsChange({ key: 'd-2', points: 999 });
    expect(component.pointsByKey()['d-2']).toBe(100); // clamped to max
    component.onPointsChange({ key: 'd-2', points: Number.NaN });
    expect(component.pointsByKey()['d-2']).toBe(1); // non-finite → min

    component.onSetTestSetDescription('Two-question quiz');
    expect(component.testSetConfig().description).toBe('Two-question quiz');
  });

  it('appends and removes a manual row in the AI review (interleaving)', async () => {
    const { component } = await intoReview([mcqDraft('d-1'), mcqDraft('d-2')]);
    component.onAddManual('oe');
    const manual = component.reviewItems().find(
      (i): i is Extract<UnifiedReviewItem, { kind: 'manual' }> => i.kind === 'manual',
    );
    expect(manual).toBeTruthy();
    component.onRemoveManual(manual!.tempId);
    expect(component.reviewItems().some((i) => i.kind === 'manual')).toBe(false);
  });

  it('preserves manual rows + surfaces the error on a manual accept 422', async () => {
    const { component } = await setup({ acceptError: { status: 422 } });
    component.onModeChange('manual');
    component.onAddManual('mcq');
    const row = component.reviewItems()[0] as Extract<UnifiedReviewItem, { kind: 'manual' }>;
    component.onEditItem({ key: row.tempId, edit: validMcqEdit() });
    component.onManualAccept();
    expect(component.composeState().status).toBe('idle'); // authoring surface kept
    expect(component.acceptError()).toBe('rplus.assessment_authoring.error_validation');
    expect(component.reviewItems().length).toBe(1); // row not discarded
  });

  it('surfaces an image-regen failure inline and keeps the original image', async () => {
    const { component } = await intoReview(
      [mcqDraftWithImage('d-1', 'https://cdn/old.png'), mcqDraft('d-2')],
      { polls: [job('failed')] },
    );
    component.onRegenImage({ draftId: 'd-1', placement: 'stem', prompt: 'retry' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.regenState()['d-1|stem']?.error).toBeTruthy();
    const row = component.reviewItems().find(
      (i): i is Extract<UnifiedReviewItem, { kind: 'ai' }> =>
        i.kind === 'ai' && i.draftId === 'd-1',
    );
    expect(row?.candidate.image_url).toBe('https://cdn/old.png'); // unchanged
  });

  // ── Accessibility ─────────────────────────────────────────────────
  it('has no critical/serious axe violations on the compose form', async () => {
    const { fixture, component } = await setup();
    component.onTopicInput('Photosynthesis');
    component.onBatchPlanChange(singlePlan(true));
    fixture.detectChanges();
    vi.useRealTimers();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious).toEqual([]);
  });
});
