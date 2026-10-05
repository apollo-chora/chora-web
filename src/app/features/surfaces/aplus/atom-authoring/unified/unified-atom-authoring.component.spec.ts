/**
 * UnifiedAtomAuthoringComponent spec — A+ unified authoring canvas (CHO-1826 U4.2).
 *
 * Exercises the COMPOSE phase + state machine + job-dispatch wiring on the
 * `/a/atoms/compose` parallel route:
 *   createAtom (host) → (manual createManualJob | ai_draft | batch_source_material)
 *   → poll (2s/4s/8s/16s or poll_after_ms) → MINIMAL review placeholder.
 *
 * The AtomAuthoringService is mocked at the method boundary (vi.fn →
 * Observable) so the spec drives the component's orchestration + state machine
 * directly (mirrors batch-authoring.component.spec.ts). Poll timers run via
 * vi.useFakeTimers().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';

import { UnifiedAtomAuthoringComponent } from './unified-atom-authoring.component';
import { AtomAuthoringService } from '../atom-authoring.service';
import {
  AI_ASSIST_POLL_ERROR_BUDGET,
  POLL_TRANSPORT_ERROR_KEY,
} from '../ai-assist-job-registry.service';
import { AtomQuestionPickerService } from '../../atom-question-picker/atom-question-picker.service';
import { TestSetService } from '../../test-set-editor/test-set.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type {
  AcceptGenerationJobRequest,
  AcceptGenerationJobResponse,
  GenerateAiDraftRequest,
  GenerateBatchRequest,
  GenerateQuestionJobRequest,
  GenerationSummary,
  QuestionDraftCandidate,
  QuestionGenerationJob,
  QuestionTypeOption,
  RegenerateImageRequest,
} from '../atom-authoring.model';
import { toDifficultyBucket, toWireCognitiveLevel } from '../atom-authoring.model';

// ── Fixtures ────────────────────────────────────────────────────────
const HOST_ATOM_ID = '01970000-1111-7000-a000-000000000001';
const JOB_ID = '01970000-2222-7000-a000-000000000002';

function job(
  status: QuestionGenerationJob['status'],
  candidates?: QuestionGenerationJob['candidate_questions'],
  extra?: Partial<QuestionGenerationJob>,
): QuestionGenerationJob {
  return {
    job_id: JOB_ID,
    atom_id: HOST_ATOM_ID,
    job_type: 'ai_draft',
    status,
    created_at: '2026-06-22T00:00:00Z',
    updated_at: '2026-06-22T00:00:00Z',
    candidate_questions: candidates,
    ...extra,
  };
}

function draft(id: string, prompt: string): QuestionDraftCandidate {
  return {
    draft_id: id,
    type: 'mcq',
    prompt,
    mcq_payload: {
      options: [
        { option_id: '0', label: 'A', is_correct: true, explainer: '' },
        { option_id: '1', label: 'B', is_correct: false, explainer: '' },
      ],
    },
  };
}

const THREE_CANDIDATES: readonly QuestionDraftCandidate[] = [
  draft('d-1', 'What is photosynthesis?'),
  draft('d-2', 'Where does it occur?'),
  draft('d-3', 'What is the output?'),
];

function pdfFile(name = 'material.pdf', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

function sized(file: File, bytes: number): File {
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

// ── Service mock ────────────────────────────────────────────────────
interface ServiceMockOpts {
  /** Route query params for the deep-link re-attach path (CHO-2387). */
  queryParams?: Record<string, string>;
  createAtomId?: string;
  createAtomError?: unknown;
  manualJob?: QuestionGenerationJob;
  generate?: QuestionGenerationJob;
  generateError?: unknown;
  polls?: QuestionGenerationJob[];
  pollError?: unknown;
  acceptResponse?: AcceptGenerationJobResponse;
  acceptError?: unknown;
  /** U4.3c: the job `regenerateImage` resolves to (default `running`). The
   *  image_regen patch is then served by the shared `polls` sequence. */
  regenJob?: QuestionGenerationJob;
  /** U5 Group D (#14): test-sets returned by TestSetService.listTestSets discovery. */
  testSetItems?: { test_set_id: string }[];
  /** U5 Group E (#15): the question-type registry feeding the reserved teaser. */
  questionTypes?: QuestionTypeOption[];
  questionTypesError?: unknown;
}

/** U5 Group E: a registry entry (string `code` cast to the 16-enum). */
function qtype(code: string, label_en: string, enabled: boolean): QuestionTypeOption {
  return {
    code,
    label_en,
    enabled,
    scope: enabled ? 'phyllis' : 'reserved',
  } as unknown as QuestionTypeOption;
}

function makeTestSetServiceMock(opts: ServiceMockOpts) {
  return {
    listTestSets: vi.fn((_q: { source_job_id?: string }) =>
      of({ items: opts.testSetItems ?? [] }),
    ),
  };
}

function makeServiceMock(opts: ServiceMockOpts = {}) {
  let pollIdx = 0;
  const polls = opts.polls ?? [];
  // Typed params so `mock.calls[0][0]` resolves to a real tuple element
  // (an untyped `vi.fn(() => …)` makes mock.calls a `[]`-tuple → TS2493
  // under `tsc -b` which type-checks specs).
  return {
    createAtom: vi.fn(
      (_req: Parameters<AtomAuthoringService['createAtom']>[0]) =>
        opts.createAtomError
          ? throwError(() => opts.createAtomError)
          : of({ atomId: opts.createAtomId ?? HOST_ATOM_ID }),
    ),
    createManualJob: vi.fn((_atomId: string) =>
      of(opts.manualJob ?? job('succeeded')),
    ),
    generateQuestionJob: vi.fn(
      (_atomId: string, _req: GenerateQuestionJobRequest, _idem: string) =>
        opts.generateError
          ? throwError(() => opts.generateError)
          : of(opts.generate ?? job('running')),
    ),
    pollGenerationJob: vi.fn((_atomId: string, _jobId: string) => {
      if (opts.pollError) return throwError(() => opts.pollError);
      const next = polls[Math.min(pollIdx, polls.length - 1)];
      pollIdx += 1;
      return of(next);
    }),
    acceptGenerationJob: vi.fn(
      (_atomId: string, _jobId: string, _req: AcceptGenerationJobRequest) =>
        opts.acceptError
          ? throwError(() => opts.acceptError)
          : of(opts.acceptResponse ?? { persisted: [], mana_debited: 0 }),
    ),
    regenerateImage: vi.fn(
      (
        _atomId: string,
        _parentJobId: string,
        _req: RegenerateImageRequest,
        _idem: string,
      ) => of(opts.regenJob ?? job('running')),
    ),
    loadQuestionTypes: vi.fn(() =>
      opts.questionTypesError
        ? throwError(() => opts.questionTypesError)
        : of(opts.questionTypes ?? []),
    ),
  };
}

/**
 * Picker-service mock. The canvas used to bolt an atom INVENTORY onto its own
 * footer (`loadMyAtoms` → AtomQuestionPickerService.search). That inventory is
 * now its own surface at `/a/studio/atoms`, and the canvas is purely creative.
 *
 * The mock returns a NON-EMPTY page on purpose: the footer list was rendered
 * behind `@if (myAtoms().length > 0)`, so a removal test run against an EMPTY
 * result would pass identically before and after the change — certifying
 * nothing. Handing the canvas atoms it could render is what makes the absence
 * assertion fail for the right reason while the list still exists.
 */
function makePickerMock(): { search: ReturnType<typeof vi.fn> } {
  return {
    search: vi.fn(() =>
      of({
        items: [
          {
            id: '01970000-3333-7000-a000-000000000003',
            title: 'Photosynthesis basics',
            stem: 'Which pigment drives the light reaction?',
            question_type: 'mcq',
            tenant_id: '01970000-4444-7000-a000-000000000004',
            author_gcid: '01970000-5555-7000-a000-000000000005',
            created_at: '2026-06-22T00:00:00Z',
            updated_at: '2026-06-22T00:00:00Z',
          },
        ],
        page: 1,
        per: 20,
        total: 1,
      }),
    ),
  };
}

async function setup(opts: ServiceMockOpts = {}): Promise<{
  fixture: ComponentFixture<UnifiedAtomAuthoringComponent>;
  component: UnifiedAtomAuthoringComponent;
  svc: ReturnType<typeof makeServiceMock>;
  tsSvc: ReturnType<typeof makeTestSetServiceMock>;
  picker: ReturnType<typeof makePickerMock>;
}> {
  const svc = makeServiceMock(opts);
  const tsSvc = makeTestSetServiceMock(opts);
  const picker = makePickerMock();
  await TestBed.configureTestingModule({
    imports: [UnifiedAtomAuthoringComponent],
    providers: [
      provideRouter([]),
      ...(opts.queryParams
        ? [
            {
              provide: ActivatedRoute,
              useValue: {
                snapshot: { queryParamMap: convertToParamMap(opts.queryParams) },
              },
            },
          ]
        : []),
      { provide: AtomAuthoringService, useValue: svc },
      { provide: TestSetService, useValue: tsSvc },
      { provide: AtomQuestionPickerService, useValue: picker },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(UnifiedAtomAuthoringComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  // The embedded shared composer emits a valid (mcq, 5) plan on init; seed it
  // deterministically so canStart()/start() aren't coupled to the child
  // effect's timing. Plan-specific tests override below.
  component.onBatchPlanChange({
    type_plan: [{ question_type: 'mcq', count: 3, max_images: 0 }],
    total: 3,
    allow_images: false,
    valid: true,
  });
  return { fixture, component, svc, tsSvc, picker };
}

function selectFile(component: UnifiedAtomAuthoringComponent, file: File): void {
  component.onSourceFilesAdded([file]);
}

describe('UnifiedAtomAuthoringComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The AI-assist job registry persists tracked jobs to sessionStorage so an
    // in-flight generation survives a reload. Clear it between cases or one
    // test's dispatched job resumes polling inside the next one.
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  // ── The canvas is a CREATION surface, not an inventory (CHO-2215) ──
  // The atom list that used to hang off this canvas's footer is now the Studio
  // inventory at `/a/studio/atoms`, where it gets search, filters, real paging
  // and a real total. The canvas keeps exactly one job: composing a new atom.
  describe('carries no atom inventory (moved to /a/studio/atoms)', () => {
    it('renders no my-atoms list even when the author HAS atoms to list', async () => {
      const { fixture } = await setup();
      const el: HTMLElement = fixture.nativeElement;
      // The picker mock hands back a real atom, so a surviving footer list has
      // everything it needs to render. Absence here is therefore removal, not
      // an empty-state passing itself off as one.
      expect(
        el.querySelector('[data-testid="unified-authoring-my-atoms"]'),
        'the canvas must not bolt an inventory onto its footer',
      ).toBeNull();
    });

    it('issues no inventory search on mount', async () => {
      const { picker } = await setup();
      expect(
        picker.search,
        'composing a new atom must not fetch a list of existing ones',
      ).not.toHaveBeenCalled();
    });
  });

  // ── Initial render ────────────────────────────────────────────────
  it('surfaces the Studio sub-nav with a Test sets tab to the standalone builder (CHO-1980)', async () => {
    const { fixture } = await setup();
    const el: HTMLElement = fixture.nativeElement;
    // The sub-nav dropped by a07ea5b99 is re-introduced so the orphaned
    // test-set builder is reachable from the canvas again. Its tabs now point
    // at Studio; test sets no longer live under a segment called `new`.
    expect(el.querySelector('[data-testid="studio-sub-nav"]')).not.toBeNull();
    const tab = el.querySelector<HTMLAnchorElement>(
      '[data-testid="studio-sub-nav-test-sets"]',
    );
    expect(tab).not.toBeNull();
    expect(tab?.getAttribute('href')).toBe('/a/studio/test-sets');
  });

  it('renders the compose canvas with the start CTA disabled before a topic', async () => {
    const { fixture, component } = await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="unified-authoring"]')).toBeTruthy();
    expect(component.canStart()).toBe(false);
    const btn = el.querySelector<HTMLButtonElement>(
      '[data-testid="unified-authoring-start"]',
    );
    expect(btn?.disabled).toBe(true);
  });

  it('defaults mode to ai, grounding to starting_point, difficulty to 3, cognitive to applying', async () => {
    const { component } = await setup();
    expect(component.mode()).toBe('ai');
    expect(component.groundingMode()).toBe('starting_point');
    expect(component.difficulty()).toBe(3);
    expect(component.cognitiveLevel()).toBe('applying');
  });

  it('shows ZONE 2 (source upload) only in ai mode', async () => {
    const { fixture, component } = await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="unified-zone2"]')).toBeTruthy();
    component.onModeChange('manual');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="unified-zone2"]')).toBeNull();
  });

  // ── canStart gating ───────────────────────────────────────────────
  it('canStart is false when the topic is empty', async () => {
    const { component } = await setup();
    expect(component.topic()).toBe('');
    expect(component.canStart()).toBe(false);
  });

  it('canStart is false when the plan is invalid', async () => {
    const { component } = await setup();
    component.onTopicInput('Photosynthesis');
    component.onBatchPlanChange({
      type_plan: [{ question_type: 'mcq', count: 0, max_images: 0 }],
      total: 0,
      allow_images: false,
      valid: false,
    });
    expect(component.canStart()).toBe(false);
  });

  it('canStart is true once topic + a valid plan are set', async () => {
    const { component } = await setup();
    component.onTopicInput('Photosynthesis');
    expect(component.canStart()).toBe(true);
  });

  it('canStart is false while a file error is present (even in ai mode)', async () => {
    const { component } = await setup();
    component.onTopicInput('Photosynthesis');
    selectFile(
      component,
      new File([new Uint8Array(8)], 'evil.exe', {
        type: 'application/x-msdownload',
      }),
    );
    expect(component.fileError()).toContain('unsupported');
    expect(component.canStart()).toBe(false);
  });

  // ── ZONE-1 handlers ───────────────────────────────────────────────
  it('toggles mode, grounding, difficulty and guards cognitive-level input', async () => {
    const { component } = await setup();
    component.onModeChange('manual');
    expect(component.mode()).toBe('manual');
    component.setGroundingMode('strict');
    expect(component.groundingMode()).toBe('strict');

    component.onDifficultyChange('5');
    expect(component.difficulty()).toBe(5);
    component.onDifficultyChange('9'); // out of range → ignored
    expect(component.difficulty()).toBe(5);

    component.onCognitiveLevelChange('creating');
    expect(component.cognitiveLevel()).toBe('creating');
    component.onCognitiveLevelChange('bogus'); // not a level → ignored
    expect(component.cognitiveLevel()).toBe('creating');
  });

  // ── File validation (reuses batch constraints) ────────────────────
  it('rejects an unsupported file extension with an i18n error', async () => {
    const { component } = await setup();
    selectFile(
      component,
      new File([new Uint8Array(8)], 'evil.exe', {
        type: 'application/x-msdownload',
      }),
    );
    expect(component.sourceFiles().length).toBe(0);
    expect(component.fileError()).toContain('unsupported');
  });

  it('rejects more than 5 source files and keeps the prior selection', async () => {
    const { component } = await setup();
    component.onSourceFilesAdded(
      [1, 2, 3, 4, 5].map((i) => pdfFile(`p${i}.pdf`)),
    );
    expect(component.sourceFiles().length).toBe(5);
    selectFile(component, pdfFile('sixth.pdf'));
    expect(component.sourceFiles().length).toBe(5);
    expect(component.fileError()).toContain('too_many_files');
  });

  it('rejects a file over the 32MB cap', async () => {
    const { component } = await setup();
    selectFile(component, sized(pdfFile('big.pdf'), 33 * 1024 * 1024));
    expect(component.sourceFiles().length).toBe(0);
    expect(component.fileError()).toContain('too_large');
  });

  it('removes a single source file by index', async () => {
    const { component } = await setup();
    component.onSourceFilesAdded([pdfFile('a.pdf'), pdfFile('b.pdf')]);
    component.removeSourceFile(0);
    expect(component.sourceFiles().map((f) => f.name)).toEqual(['b.pdf']);
  });

  // ── MANUAL flow (CHO-1826 review B — "By hand" jumps straight to authoring) ─
  /** A valid MCQ edit (2 options, exactly one correct, labels + explainers). */
  const validMcqEdit = () => ({
    question_type: 'mcq' as const,
    prompt: 'What is 2 + 2?',
    options: [
      { option_id: null, label: '4', is_correct: true, explainer: 'correct' },
      { option_id: null, label: '5', is_correct: false, explainer: 'wrong' },
    ],
    model_answer: '',
  });
  const firstManualTempId = (component: UnifiedAtomAuthoringComponent): string => {
    const row = component.reviewItems()[0];
    return row?.kind === 'manual' ? row.tempId : '';
  };

  it('manual mode authors in idle — no atom is minted, start()/generate never run', async () => {
    const { component, svc } = await setup();
    component.onModeChange('manual');
    // Still idle — the hand-authoring surface renders in place, no AI job.
    expect(component.composeState().status).toBe('idle');
    component.onAddManual('mcq');
    expect(component.reviewItems().length).toBe(1);
    expect(component.reviewItems()[0].kind).toBe('manual');
    // Nothing is created server-side until Accept.
    expect(svc.createAtom).not.toHaveBeenCalled();
    expect(svc.createManualJob).not.toHaveBeenCalled();
    expect(svc.generateQuestionJob).not.toHaveBeenCalled();
  });

  it('canAcceptManual needs ≥1 valid selected row (no session name required)', async () => {
    const { component } = await setup();
    component.onModeChange('manual');
    expect(component.canAcceptManual()).toBe(false); // no rows
    component.onAddManual('mcq');
    expect(component.canAcceptManual()).toBe(false); // blank row is invalid
    component.onEditItem({ key: firstManualTempId(component), edit: validMcqEdit() });
    expect(component.canAcceptManual()).toBe(true); // valid row → ready, no name
  });

  it('onManualAccept chains createAtom → createManualJob → acceptGenerationJob → done', async () => {
    const { component, svc } = await setup();
    component.onModeChange('manual');
    component.onDifficultyChange('4');
    component.onCognitiveLevelChange('analyzing'); // wire → 'analysis'
    component.onAddManual('mcq');
    component.onEditItem({ key: firstManualTempId(component), edit: validMcqEdit() });

    component.onManualAccept();

    expect(svc.createAtom).toHaveBeenCalledTimes(1);
    const atomArg = svc.createAtom.mock.calls[0][0];
    expect(atomArg.atom_type).toBe('MULTIPLE_CHOICE'); // derived from the first row
    expect(atomArg.cognitive_level).toBe('analysis');
    expect(atomArg.difficulty).toBe(4);
    // No session name — the host atom title/stem comes from the first prompt.
    expect(atomArg.stem).toBe('What is 2 + 2?');
    expect(atomArg.title).toBe('What is 2 + 2?');

    expect(svc.createManualJob).toHaveBeenCalledTimes(1);
    expect(svc.createManualJob.mock.calls[0][0]).toBe(HOST_ATOM_ID);

    expect(svc.acceptGenerationJob).toHaveBeenCalledTimes(1);
    const [atomId, jobId, req] = svc.acceptGenerationJob.mock.calls[0];
    expect(atomId).toBe(HOST_ATOM_ID);
    expect(jobId).toBe(JOB_ID);
    // Inline manual candidate: carries its own type, no draft_id, no test_set.
    expect(req.accepted_candidates).toHaveLength(1);
    expect(req.accepted_candidates[0].type).toBe('mcq');
    expect(req.accepted_candidates[0].draft_id).toBeUndefined();
    expect(req.test_set).toBeUndefined();
    expect(svc.generateQuestionJob).not.toHaveBeenCalled();

    // No dead-end "done" screen — returns to a fresh by-hand canvas with the
    // mode toggle intact for the next round (CHO-1826 review).
    expect(component.composeState().status).toBe('idle');
    expect(component.reviewItems()).toEqual([]);
    expect(component.mode()).toBe('manual');
  });

  it('a successful manual accept shows a success toast (singular vs plural)', async () => {
    const { component } = await setup();
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');
    component.onModeChange('manual');
    component.onAddManual('mcq');
    component.onEditItem({ key: firstManualTempId(component), edit: validMcqEdit() });
    component.onManualAccept();
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(showSpy.mock.calls[0][1]).toBe('success');
  });

  it('an OE-first manual session derives a SHORT_ANSWER host atom', async () => {
    const { component, svc } = await setup();
    component.onModeChange('manual');
    component.onAddManual('oe');
    component.onEditItem({
      key: firstManualTempId(component),
      edit: {
        question_type: 'oe',
        prompt: 'Explain photosynthesis.',
        options: [],
        model_answer: 'Light → glucose.',
      },
    });
    component.onManualAccept();
    expect(svc.createAtom.mock.calls[0][0].atom_type).toBe('SHORT_ANSWER');
  });

  it('a manual accept failure returns to idle with rows + error preserved (no review loss)', async () => {
    const { component, svc } = await setup({ acceptError: { status: 402 } });
    component.onModeChange('manual');
    component.onAddManual('mcq');
    component.onEditItem({ key: firstManualTempId(component), edit: validMcqEdit() });
    component.onManualAccept();
    expect(svc.createAtom).toHaveBeenCalledTimes(1);
    expect(component.composeState().status).toBe('idle');
    expect(component.acceptError()).toBe(
      'aplus.unified_authoring.error_insufficient_mana',
    );
    expect(component.reviewItems().length).toBe(1); // rows preserved
  });

  // ── AI no-files start ─────────────────────────────────────────────
  it('ai start with no files dispatches an ai_draft job (count clamped 1..5) → poll → review manual:false', async () => {
    const { component, svc } = await setup({
      generate: job('running'),
      polls: [job('succeeded', THREE_CANDIDATES)],
    });
    component.onTopicInput('Photosynthesis');
    // count 9 ⇒ clamped to 5 on the ai_draft path.
    component.onBatchPlanChange({
      type_plan: [{ question_type: 'mcq', count: 9, max_images: 0 }],
      total: 9,
      allow_images: false,
      valid: true,
    });

    component.start();

    expect(svc.createAtom).toHaveBeenCalledTimes(1);
    expect(svc.generateQuestionJob).toHaveBeenCalledTimes(1);
    const [atomId, req, idem] = svc.generateQuestionJob.mock.calls[0];
    const ai = req as GenerateAiDraftRequest;
    expect(atomId).toBe(HOST_ATOM_ID);
    expect(ai.job_type).toBe('ai_draft');
    expect(ai.question_type).toBe('mcq');
    expect(ai.prompt).toBe('Photosynthesis');
    expect(ai.count).toBe(5);
    expect(ai.difficulty).toBe(3);
    expect(typeof idem).toBe('string');
    expect(component.composeState().status).toBe('polling');

    await vi.advanceTimersByTimeAsync(2000);
    expect(component.composeState().status).toBe('review');
    expect(component.reviewManual()).toBe(false);
    expect(component.reviewCandidateCount()).toBe(3);
  });

  // CHO-1657 regression guard — the author's Subject (topic) / Cognitive Level /
  // Difficulty must ride the ai_draft request as the `metadata` hint map. The
  // CHO-1826 unify dropped it, so Cognitive Level became a silent no-op and O+
  // Decision Traces lost subject/cognitive/difficulty prompt_conditions.
  it('ai_draft dispatch forwards the author metadata hints (subject / cognitive_level / difficulty)', async () => {
    const { component, svc } = await setup({
      generate: job('running'),
      polls: [job('succeeded', THREE_CANDIDATES)],
    });
    component.onTopicInput('Photosynthesis');
    component.onCognitiveLevelChange('analyzing');
    component.onDifficultyChange('4');
    component.onBatchPlanChange({
      type_plan: [{ question_type: 'mcq', count: 1, max_images: 0 }],
      total: 1,
      allow_images: false,
      valid: true,
    });

    component.start();

    expect(svc.generateQuestionJob).toHaveBeenCalledTimes(1);
    const ai = svc.generateQuestionJob.mock.calls[0][1] as GenerateAiDraftRequest;
    expect(ai.metadata).toEqual({
      subject: 'Photosynthesis',
      cognitive_level: toWireCognitiveLevel('analyzing'),
      difficulty: toDifficultyBucket(4),
    });
  });

  it('streams the LIVE pipeline trace during generation instead of a please-wait spinner (CR Phase 2)', async () => {
    const livePartial = [
      { name: 'validate_input', status: 'ACCEPTED', completed_at: '2026-06-22T00:00:00Z' },
      { name: 'guardrail_pre', status: 'ACCEPTED', completed_at: '2026-06-22T00:00:01Z' },
    ] as QuestionGenerationJob['pipeline_trace'];
    const fullTrace = [
      ...(livePartial ?? []),
      { name: 'generate', status: 'COMPLETED', completed_at: '2026-06-22T00:00:02Z' },
      { name: 'publish_completed', status: 'COMPLETED', completed_at: '2026-06-22T00:00:03Z' },
    ] as QuestionGenerationJob['pipeline_trace'];
    const { fixture, component } = await setup({
      generate: job('running', undefined, { pipeline_trace: livePartial }),
      polls: [job('succeeded', THREE_CANDIDATES, { pipeline_trace: fullTrace })],
    });
    component.onTopicInput('Newton');
    component.start();
    fixture.detectChanges();

    // Still polling — the live trace (not the spinner) is on screen.
    expect(component.composeState().status).toBe('polling');
    expect(component.isGenerating()).toBe(true);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="unified-authoring-generating"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="aplus-trace-widget"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="aplus-trace-live-pill"]')).toBeTruthy();
    // Spinner fallback is NOT shown once a partial trace exists.
    expect(el.querySelector('[data-testid="unified-authoring-working"]')).toBeNull();

    // On completion the trace pins to the TOP of the review as a collapsed accordion.
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
    expect(component.composeState().status).toBe('review');
    expect(component.isGenerating()).toBe(false);
    const review = el.querySelector('[data-testid="unified-authoring-review"]');
    const widget = review?.querySelector('[data-testid="aplus-trace-widget"]');
    expect(widget).toBeTruthy();
    // Accordion starts collapsed on review (live pill gone).
    expect(widget?.querySelector('.trace-widget__body.is-collapsed')).toBeTruthy();
    expect(el.querySelector('[data-testid="aplus-trace-live-pill"]')).toBeNull();
  });

  it('ai start with no files forwards the composer forced-image opt-in into the ai_draft request (CHO-1826 Gap #4)', async () => {
    const { component, svc } = await setup({
      generate: job('running'),
      polls: [job('succeeded', THREE_CANDIDATES)],
    });
    component.onTopicInput('Photosynthesis');
    component.onBatchPlanChange({
      type_plan: [
        {
          question_type: 'mcq',
          count: 1,
          max_images: 0,
          image_for_stem: true,
          image_for_answer: true,
        },
      ],
      total: 1,
      allow_images: true,
      valid: true,
    });

    component.start();

    expect(svc.generateQuestionJob).toHaveBeenCalledTimes(1);
    const ai = svc.generateQuestionJob.mock.calls[0][1] as GenerateAiDraftRequest;
    expect(ai.job_type).toBe('ai_draft');
    expect(ai.image_for_stem).toBe(true);
    expect(ai.image_for_answer).toBe(true);
  });

  it('omits image flags from the ai_draft request when the author did not opt in', async () => {
    const { component, svc } = await setup({
      generate: job('running'),
      polls: [job('succeeded', THREE_CANDIDATES)],
    });
    component.onTopicInput('Photosynthesis');
    // setup()'s default plan carries no image flags.
    component.start();

    const ai = svc.generateQuestionJob.mock.calls[0][1] as GenerateAiDraftRequest;
    expect(ai.image_for_stem).toBeFalsy();
    expect(ai.image_for_answer).toBeFalsy();
  });

  it('honours poll_after_ms server hint over the default backoff', async () => {
    const { component, svc } = await setup({
      generate: job('running', undefined, { poll_after_ms: 500 }),
      polls: [job('succeeded', THREE_CANDIDATES)],
    });
    component.onTopicInput('Photosynthesis');
    component.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(svc.pollGenerationJob).toHaveBeenCalledTimes(1);
    expect(component.composeState().status).toBe('review');
  });

  // ── AI with-files start ───────────────────────────────────────────
  it('ai start with one file dispatches a batch_source_material job (type_plan + grounding + file)', async () => {
    const { component, svc } = await setup({ generate: job('running') });
    component.onTopicInput('Mitochondria');
    component.onBatchPlanChange({
      type_plan: [{ question_type: 'mcq', count: 5, max_images: 0 }],
      total: 5,
      allow_images: false,
      valid: true,
    });
    component.setGroundingMode('strict');
    selectFile(component, pdfFile());

    component.start();

    const [atomId, req] = svc.generateQuestionJob.mock.calls[0];
    const batch = req as GenerateBatchRequest;
    expect(atomId).toBe(HOST_ATOM_ID);
    expect(batch.job_type).toBe('batch_source_material');
    expect(batch.type_plan?.length).toBe(1);
    expect(batch.type_plan?.[0].question_type).toBe('mcq');
    expect(batch.question_count).toBe(5);
    expect(batch.grounding_mode).toBe('strict');
    expect(batch.context).toBe('Mitochondria');
    expect(batch.file).toBeInstanceOf(File);
    expect(batch.files).toBeUndefined();
    expect(component.composeState().status).toBe('polling');
  });

  it('sends files[] for a multi-file source selection', async () => {
    const { component, svc } = await setup({ generate: job('running') });
    component.onTopicInput('Mitochondria');
    component.onSourceFilesAdded([pdfFile('a.pdf'), pdfFile('b.pdf')]);
    component.start();
    const req = svc.generateQuestionJob.mock.calls[0][1] as GenerateBatchRequest;
    expect(req.files?.length).toBe(2);
    expect(req.file).toBeUndefined();
  });

  it('maps an OE-first plan to a SHORT_ANSWER host atom', async () => {
    const { component, svc } = await setup({ generate: job('running') });
    component.onTopicInput('Essay practice');
    component.onBatchPlanChange({
      type_plan: [{ question_type: 'oe', count: 2, max_images: 0 }],
      total: 2,
      allow_images: false,
      valid: true,
    });
    component.start();
    expect(svc.createAtom.mock.calls[0][0].atom_type).toBe('SHORT_ANSWER');
  });

  // ── cognitive-level wire mapping ──────────────────────────────────
  it('maps the FE cognitive level to the BE wire enum in the createAtom body', async () => {
    const { component, svc } = await setup();
    component.onTopicInput('X');
    component.onCognitiveLevelChange('creating'); // revised-Bloom → wire 'synthesis'
    component.start();
    expect(svc.createAtom.mock.calls[0][0].cognitive_level).toBe('synthesis');
  });

  // ── Guards + terminal/error paths ─────────────────────────────────
  it('does nothing when start() is invoked while canStart is false', async () => {
    const { component, svc } = await setup();
    // topic empty ⇒ canStart false
    component.start();
    expect(svc.createAtom).not.toHaveBeenCalled();
    expect(component.composeState().status).toBe('idle');
  });

  it('surfaces a createAtom error as the error state', async () => {
    const { component } = await setup({ createAtomError: { status: 500 } });
    component.onTopicInput('X');
    component.start();
    expect(component.composeState().status).toBe('error');
    expect(component.errorMessage()).toBe('aplus.unified_authoring.error_upstream');
  });

  it('maps a 402 to the insufficient-mana error key', async () => {
    const { component } = await setup({ generateError: { status: 402 } });
    component.onTopicInput('X');
    component.start();
    expect(component.errorMessage()).toBe(
      'aplus.unified_authoring.error_insufficient_mana',
    );
  });

  it('surfaces a failed generation job as an error', async () => {
    const { component } = await setup({
      generate: job('running'),
      polls: [job('failed')],
    });
    component.onTopicInput('X');
    component.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.composeState().status).toBe('error');
    expect(component.errorMessage()).toBe('aplus.unified_authoring.error_failed');
  });

  it('treats an AI job that succeeds with no candidates as an error', async () => {
    const { component } = await setup({
      generate: job('running'),
      polls: [job('succeeded', [])],
    });
    component.onTopicInput('X');
    component.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.errorMessage()).toBe(
      'aplus.unified_authoring.error_no_candidates',
    );
  });

  it('surfaces a cancelled generation job as an error', async () => {
    const { component } = await setup({
      generate: job('running'),
      polls: [job('cancelled')],
    });
    component.onTopicInput('X');
    component.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.composeState().status).toBe('error');
  });

  it('reviews immediately when the AI job is already terminal on dispatch (no poll)', async () => {
    const { component, svc } = await setup({
      generate: job('succeeded', THREE_CANDIDATES),
    });
    component.onTopicInput('X');
    component.start();
    // No timer advance — startPolling sees a terminal job and reviews at once.
    expect(component.composeState().status).toBe('review');
    expect(component.reviewCandidateCount()).toBe(3);
    expect(svc.pollGenerationJob).not.toHaveBeenCalled();
  });

  it('reads the legacy drafts alias for the AI candidate count', async () => {
    const { component } = await setup({
      generate: job('succeeded', undefined, { drafts: THREE_CANDIDATES }),
    });
    component.onTopicInput('X');
    component.start();
    expect(component.composeState().status).toBe('review');
    expect(component.reviewCandidateCount()).toBe(3);
  });

  it('rides out a single transport blip instead of killing the batch', async () => {
    // Contract change (2026-08-14): one 504/503 through the gateway is routine
    // on a long generation and used to throw away a batch the backend was
    // still working on. The registry now retries under a bounded budget.
    const { component } = await setup({
      generate: job('running'),
      pollError: { status: 503 },
    });
    component.onTopicInput('X');
    component.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(component.composeState().status).toBe('polling');
  });

  it('surfaces a persistent transport failure as an error, not an endless poll', async () => {
    const { component } = await setup({
      generate: job('running'),
      pollError: { status: 503 },
    });
    component.onTopicInput('X');
    component.start();
    // Exhaust AI_ASSIST_POLL_ERROR_BUDGET consecutive failures.
    for (let i = 0; i < AI_ASSIST_POLL_ERROR_BUDGET; i++) {
      await vi.advanceTimersByTimeAsync(20000);
    }
    expect(component.composeState().status).toBe('error');
    expect(component.errorMessage()).toBe(POLL_TRANSPORT_ERROR_KEY);
  });


  // ── Leave-and-return (the owner's litmus test, 2026-08-14) ─────────
  //
  // Start batch A with image generation, walk off the route, start batch B,
  // come back to A. Before this the compose state lived only on the component
  // and its poll was takeUntilDestroyed, so leaving orphaned the job for good.
  describe('leave and return to an in-flight generation', () => {
    it('keeps generating after the screen is destroyed, and re-attaches on return', async () => {
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('running', undefined, { job_id: 'job-A' })],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      expect(first.component.composeState().status).toBe('polling');

      // The author navigates away.
      first.fixture.destroy();
      await vi.advanceTimersByTimeAsync(6000);

      // ... and comes back to a brand new instance of the screen.
      const back = TestBed.createComponent(UnifiedAtomAuthoringComponent);
      back.detectChanges();
      expect(back.componentInstance.composeState().status).toBe('polling');
      back.destroy();
    });

    it('shows the finished result to an author who returns after completion', async () => {
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('succeeded', THREE_CANDIDATES, { job_id: 'job-A' })],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      first.fixture.destroy();

      // It finishes while the author is on another screen.
      await vi.advanceTimersByTimeAsync(4000);

      const back = TestBed.createComponent(UnifiedAtomAuthoringComponent);
      back.detectChanges();
      expect(back.componentInstance.composeState().status).toBe('review');
      expect(back.componentInstance.reviewItems().length).toBe(
        THREE_CANDIDATES.length,
      );
      back.destroy();
    });

    it('shows an explicit error to an author who returns after a failure', async () => {
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('failed', undefined, { job_id: 'job-A' })],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      first.fixture.destroy();
      await vi.advanceTimersByTimeAsync(4000);

      const back = TestBed.createComponent(UnifiedAtomAuthoringComponent);
      back.detectChanges();
      expect(back.componentInstance.composeState().status).toBe('error');
      back.destroy();
    });

    it('still streams the live trace on the job the author returns to', async () => {
      const trace = [
        { name: 'generate', status: 'COMPLETED' },
        { name: 'critique', status: 'ACCEPTED' },
      ] as unknown as QuestionGenerationJob['pipeline_trace'];
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [
          job('running', undefined, { job_id: 'job-A', pipeline_trace: trace }),
        ],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      first.fixture.destroy();
      await vi.advanceTimersByTimeAsync(4000);

      const back = TestBed.createComponent(UnifiedAtomAuthoringComponent);
      back.detectChanges();
      expect(back.componentInstance.pipelineTrace()?.length).toBe(2);
      expect(back.componentInstance.isGenerating()).toBe(true);
      back.destroy();
    });


    it('start another leaves the batch running and returns an empty form', async () => {
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('running', undefined, { job_id: 'job-A' })],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      expect(first.component.composeState().status).toBe('polling');

      first.component.startAnother();

      // Empty form back, and the batch is STILL tracked (not cancelled).
      expect(first.component.composeState().status).toBe('idle');
      expect(
        first.component.resumableJobs().map((j) => j.jobId),
      ).toContain('job-A');
      first.fixture.destroy();
    });

    it('offers the abandoned batch in the resume list and re-opens it', async () => {
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('running', undefined, { job_id: 'job-A' })],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      first.component.startAnother();
      first.fixture.detectChanges();

      const row = first.fixture.nativeElement.querySelector(
        '[data-testid="unified-authoring-resume-job-A"]',
      );
      expect(row).toBeTruthy();

      first.component.resumeJob('job-A');
      expect(first.component.composeState().status).toBe('polling');
      first.fixture.destroy();
    });

    it('dismiss drops the batch from the resume list', async () => {
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('running', undefined, { job_id: 'job-A' })],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      first.component.startAnother();

      first.component.dismissJob('job-A');
      expect(first.component.resumableJobs().length).toBe(0);
      first.fixture.destroy();
    });

    it('labels a resumable batch by what the author will find', async () => {
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('succeeded', THREE_CANDIDATES, { job_id: 'job-A' })],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      first.component.startAnother();
      await vi.advanceTimersByTimeAsync(4000);

      const entry = first.component.resumableJobs()[0];
      expect(entry.phase).toBe('done');
      expect(first.component.resumableStatusKey(entry)).toBe(
        'aplus.unified_authoring.resume_ready',
      );
      first.fixture.destroy();
    });


    it('warns loudly when a requested illustration never rendered', async () => {
      // The live shape from job 68d0ba74 on 2026-08-14: 1 of 3 scene renders
      // survived vendor throttling and the batch still shipped "succeeded".
      const trace = [
        { name: 'quality_gate', status: 'ACCEPTED', notes: 'all 3 accepted' },
        {
          name: 'render_image',
          status: 'DEGRADED',
          notes: 'rendered 1/3 image(s); 2 failed (fail-soft)',
        },
      ] as unknown as QuestionGenerationJob['pipeline_trace'];
      const { component, fixture } = await setup({
        generate: job('running'),
        polls: [job('succeeded', THREE_CANDIDATES, { pipeline_trace: trace })],
      });
      component.onTopicInput('Road cycle safety');
      component.start();
      await vi.advanceTimersByTimeAsync(2000);
      fixture.detectChanges();

      expect(component.imageRenderWarning()).toEqual({ rendered: 1, total: 3 });
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="unified-authoring-image-warning"]',
        ),
      ).toBeTruthy();
    });

    it('stays quiet when every requested illustration rendered', async () => {
      const trace = [
        {
          name: 'render_image',
          status: 'COMPLETED',
          notes: 'rendered 3/3 image(s)',
        },
      ] as unknown as QuestionGenerationJob['pipeline_trace'];
      const { component, fixture } = await setup({
        generate: job('running'),
        polls: [job('succeeded', THREE_CANDIDATES, { pipeline_trace: trace })],
      });
      component.onTopicInput('Road cycle safety');
      component.start();
      await vi.advanceTimersByTimeAsync(2000);
      fixture.detectChanges();

      expect(component.imageRenderWarning()).toBeNull();
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="unified-authoring-image-warning"]',
        ),
      ).toBeNull();
    });

    it('stays quiet on an imageless batch', async () => {
      const { component } = await setup({
        generate: job('running'),
        polls: [job('succeeded', THREE_CANDIDATES)],
      });
      component.onTopicInput('X');
      component.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(component.imageRenderWarning()).toBeNull();
    });

    it('reset releases the batch so a blank form is reachable again', async () => {
      const { component } = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('succeeded', THREE_CANDIDATES, { job_id: 'job-A' })],
      });
      component.onTopicInput('Road cycle safety');
      component.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(component.composeState().status).toBe('review');

      component.reset();

      expect(component.composeState().status).toBe('idle');
      expect(component.resumableJobs().length).toBe(0);
    });


    it('adopts a job from a deep link this session never tracked', async () => {
      // The hand-recovered job case: an author is handed a link to a
      // generation that finished before this browser session existed. `?job=`
      // alone cannot resolve it (the status endpoint is nested under the
      // atom), so `?atom=` rides along and the registry adopts it.
      const { component } = await setup({
        queryParams: { job: 'job-recovered', atom: 'atom-recovered' },
        polls: [
          job('succeeded', THREE_CANDIDATES, { job_id: 'job-recovered' }),
        ],
      });
      await vi.advanceTimersByTimeAsync(2000);

      expect(component.composeState().status).toBe('review');
      expect(component.reviewItems().length).toBe(THREE_CANDIDATES.length);
    });

    it('ignores a deep link with no atom, rather than showing a dead screen', async () => {
      const { component } = await setup({ queryParams: { job: 'job-orphan' } });
      await vi.advanceTimersByTimeAsync(2000);
      // No atom id means the job is unresolvable; fall back to a usable form.
      expect(component.composeState().status).toBe('idle');
    });

    it('cancel abandons the job so a later visit does not re-attach', async () => {
      const first = await setup({
        generate: job('running', undefined, { job_id: 'job-A' }),
        polls: [job('running', undefined, { job_id: 'job-A' })],
      });
      first.component.onTopicInput('Road cycle safety');
      first.component.start();
      first.component.cancelDispatch();
      first.fixture.destroy();
      await vi.advanceTimersByTimeAsync(6000);

      const back = TestBed.createComponent(UnifiedAtomAuthoringComponent);
      back.detectChanges();
      expect(back.componentInstance.composeState().status).toBe('idle');
      back.destroy();
    });
  });

  // ── reset ─────────────────────────────────────────────────────────
  it('reset() returns to idle and clears source files', async () => {
    const { component } = await setup({ createAtomError: { status: 500 } });
    component.onTopicInput('X');
    selectFile(component, pdfFile());
    component.start();
    expect(component.composeState().status).toBe('error');
    component.reset();
    expect(component.composeState().status).toBe('idle');
    expect(component.sourceFiles().length).toBe(0);
    expect(component.fileError()).toBeNull();
  });

  // ── U4.3 — interleaved review + accept ─────────────────────────────
  describe('U4.3 review + accept', () => {
    function vdraft(id: string): QuestionDraftCandidate {
      return {
        draft_id: id,
        type: 'mcq',
        prompt: `Prompt ${id}`,
        mcq_payload: {
          options: [
            { option_id: '0', label: 'A', is_correct: true, explainer: 'because A' },
            { option_id: '1', label: 'B', is_correct: false, explainer: 'not B' },
          ],
        },
      };
    }
    const VALID: readonly QuestionDraftCandidate[] = [
      vdraft('d-1'),
      vdraft('d-2'),
      vdraft('d-3'),
    ];

    async function reachAiReview(extra: ServiceMockOpts = {}) {
      const ctx = await setup({
        generate: job('running'),
        polls: [job('succeeded', VALID)],
        ...extra,
      });
      ctx.component.onTopicInput('Photosynthesis');
      ctx.component.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(ctx.component.composeState().status).toBe('review');
      return ctx;
    }

    it('seeds selected AI rows, canAccept true, mana = text tier', async () => {
      const { component } = await reachAiReview();
      expect(component.reviewItems().length).toBe(3);
      expect(component.reviewItems().every((i) => i.selected)).toBe(true);
      expect(component.canAccept()).toBe(true);
      expect(component.manaPreview()).toEqual({
        textCount: 3,
        imageCount: 0,
        manualCount: 0,
        total: 30,
      });
    });

    it('onToggleSelect deselects a row → excluded from mana tally', async () => {
      const { component } = await reachAiReview();
      component.onToggleSelect('d-2');
      const d2 = component
        .reviewItems()
        .find((i) => i.kind === 'ai' && i.draftId === 'd-2');
      expect(d2?.selected).toBe(false);
      expect(component.manaPreview().textCount).toBe(2);
    });

    it('deselecting every row drops canAccept to false', async () => {
      const { component } = await reachAiReview();
      for (const k of ['d-1', 'd-2', 'd-3']) component.onToggleSelect(k);
      expect(component.canAccept()).toBe(false);
    });

    it('onAddManual appends a blank manual row to the AI review (invalid until edited)', async () => {
      const { component } = await reachAiReview();
      const before = component.reviewItems().length;
      component.onAddManual('mcq');
      const items = component.reviewItems();
      expect(items.length).toBe(before + 1);
      expect(items[items.length - 1].kind).toBe('manual');
      expect(component.canAccept()).toBe(false); // blank manual row invalidates accept
    });

    it('onAccept (untouched AI) → acceptGenerationJob with 3 {draft_id} → done', async () => {
      const { component, svc } = await reachAiReview();
      component.onAccept();
      expect(svc.acceptGenerationJob).toHaveBeenCalledTimes(1);
      const [atomId, jobId, req] = svc.acceptGenerationJob.mock.calls[0];
      expect(atomId).toBe(HOST_ATOM_ID);
      expect(jobId).toBe(JOB_ID);
      expect(req.accepted_candidates.map((c) => c.draft_id)).toEqual([
        'd-1',
        'd-2',
        'd-3',
      ]);
      expect(Object.keys(req.accepted_candidates[0])).toEqual(['draft_id']);
      // No "done" screen — resets to the compose form after a success toast.
      expect(component.composeState().status).toBe('idle');
    });

    it('onEditItem marks an AI row edited → accept emits overrides for it', async () => {
      const { component, svc } = await reachAiReview();
      component.onEditItem({
        key: 'd-1',
        edit: {
          question_type: 'mcq',
          prompt: 'Edited prompt',
          options: [
            { option_id: '0', label: 'A', is_correct: true, explainer: 'because A' },
            { option_id: '1', label: 'B', is_correct: false, explainer: 'not B' },
          ],
          model_answer: '',
        },
      });
      component.onAccept();
      const req = svc.acceptGenerationJob.mock.calls[0][2];
      const d1 = req.accepted_candidates.find((c) => c.draft_id === 'd-1');
      expect(d1?.prompt_override).toBe('Edited prompt');
      expect(d1?.mcq_payload_override).toBeDefined();
    });

    it('manual interleave: an edited manual row commits inline (no draft_id)', async () => {
      const { component, svc } = await reachAiReview();
      component.onAddManual('oe');
      const items = component.reviewItems();
      const last = items[items.length - 1];
      expect(last.kind).toBe('manual');
      const tempId = last.kind === 'manual' ? last.tempId : '';
      component.onEditItem({
        key: tempId,
        edit: {
          question_type: 'oe',
          prompt: 'Explain X',
          options: [],
          model_answer: 'Because Y',
        },
      });
      component.onAccept();
      const req = svc.acceptGenerationJob.mock.calls[0][2];
      const inline = req.accepted_candidates.find((c) => c.draft_id === undefined);
      expect(inline).toBeDefined();
      expect(inline?.type).toBe('oe');
      expect(inline?.prompt_override).toBe('Explain X');
      expect(inline?.oe_payload_override).toEqual({ model_answer: 'Because Y' });
    });

    // FE-1 (#3): a 4xx/5xx accept failure PRESERVES the generated review so the
    // author can fix + retry — it does NOT flip to the compose form (which would
    // discard every candidate, forcing a re-generate + re-pay of accept-time
    // mana). Inverts the prior bug-encoding spec ("surfaces a failure as error").
    describe('onAccept failure preserves the review (FE-1 #3)', () => {
      const CASES: readonly [string, number, string][] = [
        ['400 validation', 400, 'aplus.unified_authoring.error_validation'],
        ['422 validation', 422, 'aplus.unified_authoring.error_validation'],
        ['402 mana', 402, 'aplus.unified_authoring.error_insufficient_mana'],
        ['500 upstream', 500, 'aplus.unified_authoring.error_upstream'],
      ];
      for (const [label, status, key] of CASES) {
        it(`keeps the review (not error) + sets acceptError on a ${label} failure`, async () => {
          const { component } = await reachAiReview({ acceptError: { status } });
          const before = component.reviewItems().length;
          component.onAccept();
          expect(component.composeState().status).toBe('review');
          expect(component.acceptError()).toBe(key);
          expect(component.reviewItems().length).toBe(before);
        });
      }

      it('renders the accept-error alert in the review on a failed accept', async () => {
        const { component, fixture } = await reachAiReview({
          acceptError: { status: 402 },
        });
        component.onAccept();
        fixture.detectChanges();
        const alert = (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="unified-review-accept-error"]',
        );
        expect(alert).toBeTruthy();
        expect(alert?.getAttribute('role')).toBe('alert');
      });

      it('clears acceptError on edit/toggle so a retry starts clean, then re-accepts', async () => {
        const { component, svc } = await reachAiReview({
          acceptError: { status: 500 },
        });
        component.onAccept();
        expect(component.composeState().status).toBe('review');
        expect(component.acceptError()).not.toBeNull();

        // The author starts fixing → the stale alert clears at once.
        component.onToggleSelect('d-1');
        expect(component.acceptError()).toBeNull();
        component.onToggleSelect('d-1'); // re-select to accept all three

        // The retry now succeeds → done, with no lingering acceptError.
        svc.acceptGenerationJob.mockReturnValue(
          of({ persisted: [], mana_debited: 0 }),
        );
        component.onAccept();
        expect(component.composeState().status).toBe('idle');
        expect(component.acceptError()).toBeNull();
      });

      it('clears acceptError when an AI row is edited', async () => {
        const { component } = await reachAiReview({ acceptError: { status: 422 } });
        component.onAccept();
        expect(component.acceptError()).not.toBeNull();
        component.onEditItem({
          key: 'd-1',
          edit: {
            question_type: 'mcq',
            prompt: 'Fixed prompt',
            options: [
              { option_id: '0', label: 'A', is_correct: true, explainer: '' },
              { option_id: '1', label: 'B', is_correct: false, explainer: '' },
            ],
            model_answer: '',
          },
        });
        expect(component.acceptError()).toBeNull();
      });
    });

    // FE-2 (#2): a topic test set needs ≥2 questions (ADR-195 D4). Only AI rows
    // carry a draft_id, so only selected AI candidates can populate a test set.
    describe('test-set gate to ≥2 selected AI candidates (FE-2 #2)', () => {
      it('canAssembleTestSet is true with ≥2 selected AI rows, false below 2', async () => {
        const { component } = await reachAiReview();
        expect(component.canAssembleTestSet()).toBe(true);
        component.onToggleSelect('d-2');
        component.onToggleSelect('d-3');
        expect(component.canAssembleTestSet()).toBe(false);
      });

      it('canAccept is false when the test set is on with <2 selected', async () => {
        const { component } = await reachAiReview();
        component.onToggleSelect('d-2');
        component.onToggleSelect('d-3'); // one AI row selected
        component.onSetTestSetEnabled(true);
        component.onSetTestSetTitle('Quiz');
        expect(component.canAssembleTestSet()).toBe(false);
        expect(component.canAccept()).toBe(false);
      });

      it('canAccept is true when the test set is on with ≥2 selected + a title', async () => {
        const { component } = await reachAiReview();
        component.onSetTestSetEnabled(true);
        component.onSetTestSetTitle('Quiz');
        expect(component.canAccept()).toBe(true);
      });
    });

    it('reset() from review clears the review items + test-set', async () => {
      const { component } = await reachAiReview();
      component.onSetTestSetEnabled(true);
      component.onSetTestSetTitle('My set');
      component.reset();
      expect(component.composeState().status).toBe('idle');
      expect(component.reviewItems().length).toBe(0);
      expect(component.testSetEnabled()).toBe(false);
      expect(component.testSetTitle()).toBe('');
    });

    // ── U4.3c per-image regenerate ──────────────────────────────────
    it('onRegenImage sets regenerating, then swaps the AI row stem image after the poll patch', async () => {
      const patch = job('succeeded', [
        { draft_id: 'd-1', type: 'mcq', prompt: '', image_url: 'https://img/new.png' },
      ]);
      const { component, svc } = await reachAiReview({
        // poll[0] resolves the generation → review; poll[1] is the regen patch.
        polls: [job('succeeded', VALID), patch],
      });

      component.onRegenImage({
        draftId: 'd-1',
        placement: 'stem',
        prompt: 'make it blue',
      });

      expect(svc.regenerateImage).toHaveBeenCalledTimes(1);
      const [atomId, parentJobId, req, idem] = svc.regenerateImage.mock.calls[0];
      expect(atomId).toBe(HOST_ATOM_ID);
      expect(parentJobId).toBe(JOB_ID);
      expect(req).toEqual({
        draft_id: 'd-1',
        placement: 'stem',
        prompt: 'make it blue',
      });
      expect(typeof idem).toBe('string');
      // Spinner is on while the regen poll is in flight.
      expect(component.regenState()['d-1|stem'].regenerating).toBe(true);

      await vi.advanceTimersByTimeAsync(2000);

      const row = component
        .reviewItems()
        .find((i) => i.kind === 'ai' && i.draftId === 'd-1');
      const swapped = row && row.kind === 'ai' ? row.candidate.image_url : null;
      expect(swapped).toBe('https://img/new.png');
      expect(component.regenState()['d-1|stem']).toEqual({
        regenerating: false,
        error: null,
      });
    });

    it('onRegenImage swaps the answer image for an answer-placement regen', async () => {
      const patch = job('succeeded', [
        { draft_id: 'd-2', type: 'mcq', prompt: '', image_url: 'https://img/ans.png' },
      ]);
      const { component } = await reachAiReview({
        polls: [job('succeeded', VALID), patch],
      });

      component.onRegenImage({
        draftId: 'd-2',
        placement: 'answer',
        prompt: 'diagram of the cycle',
      });
      await vi.advanceTimersByTimeAsync(2000);

      const row = component
        .reviewItems()
        .find((i) => i.kind === 'ai' && i.draftId === 'd-2');
      const answer = row && row.kind === 'ai' ? row.candidate.answer_image_url : null;
      const stem = row && row.kind === 'ai' ? row.candidate.image_url : 'unset';
      expect(answer).toBe('https://img/ans.png');
      // The stem image stays untouched (the patch url lands on answer only).
      expect(stem).toBeUndefined();
    });

    it('onRegenImage is a no-op with an empty (whitespace) prompt', async () => {
      const { component, svc } = await reachAiReview();
      component.onRegenImage({ draftId: 'd-1', placement: 'stem', prompt: '   ' });
      expect(svc.regenerateImage).not.toHaveBeenCalled();
      expect(component.regenState()['d-1|stem']).toBeUndefined();
    });

    it('onRegenImage surfaces a failed regen job as an inline per-image error', async () => {
      const { component } = await reachAiReview({
        polls: [job('succeeded', VALID), job('failed')],
      });
      component.onRegenImage({
        draftId: 'd-1',
        placement: 'stem',
        prompt: 'make it blue',
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(component.regenState()['d-1|stem'].regenerating).toBe(false);
      expect(component.regenState()['d-1|stem'].error).toBe(
        'aplus.unified_authoring.error_failed',
      );
    });

    // ADR-210 D3 fail-loud: an image-to-image regen whose ORIGINAL is gone
    // (GC'd / deleted / IAM) is refused server-side. chora-creation maps that
    // onto the question-job as status=failed with `error` carrying the reason
    // token `image_regen_original_unavailable`. The author must get an EXPLICIT
    // "regenerate from scratch" message — never the generic failure copy that
    // reads like a transient glitch.
    it('onRegenImage surfaces an original-image-unavailable refusal with an explicit message (ADR-210 D3)', async () => {
      const { component } = await reachAiReview({
        polls: [
          job('succeeded', VALID),
          job('failed', undefined, { error: 'image_regen_original_unavailable' }),
        ],
      });
      component.onRegenImage({
        draftId: 'd-1',
        placement: 'stem',
        prompt: 'make it crayon',
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(component.regenState()['d-1|stem'].regenerating).toBe(false);
      expect(component.regenState()['d-1|stem'].error).toBe(
        'aplus.unified_authoring.error_original_unavailable',
      );
    });
  });

  // ── U5 Group A — compose-input parity (CHO-1826) ───────────────────
  describe('U5 Group A compose inputs', () => {
    // GAP #1 — context-for-LLM body (topic + body → buildContext)
    it('folds the context body into the batch context (topic + body)', async () => {
      const { component, svc } = await setup({ generate: job('running') });
      component.onTopicInput('Mitochondria');
      component.onContextBodyInput('Focus on the electron transport chain.');
      selectFile(component, pdfFile());
      component.start();
      const req = svc.generateQuestionJob.mock.calls[0][1] as GenerateBatchRequest;
      expect(req.context).toBe(
        'Mitochondria\n\nFocus on the electron transport chain.',
      );
    });

    it('folds the context body into the ai_draft prompt (no-files path)', async () => {
      const { component, svc } = await setup({ generate: job('running') });
      component.onTopicInput('Mitochondria');
      component.onContextBodyInput('ATP synthesis only.');
      component.start();
      const req = svc.generateQuestionJob.mock
        .calls[0][1] as GenerateAiDraftRequest;
      expect(req.job_type).toBe('ai_draft');
      expect(req.prompt).toBe('Mitochondria\n\nATP synthesis only.');
    });

    it('keeps the ai_draft prompt = topic when the context body is empty', async () => {
      const { component, svc } = await setup({ generate: job('running') });
      component.onTopicInput('Mitochondria');
      component.start();
      const req = svc.generateQuestionJob.mock
        .calls[0][1] as GenerateAiDraftRequest;
      expect(req.prompt).toBe('Mitochondria');
    });

    // CHO-1826 review pts 2-3 — the AI-instructions field is the UNIVERSAL steer
    // (honoured with no uploads); its placeholder is material-aware so it nudges
    // "describe what to generate" (no files) → "describe how to use it" (files).
    it('uses the no-materials instructions placeholder by default', async () => {
      const { component } = await setup();
      expect(component.hasMaterials()).toBe(false);
      expect(component.contextPlaceholderKey()).toBe(
        'aplus.unified_authoring.context_placeholder',
      );
    });

    it('switches to the with-materials placeholder when a source file is attached', async () => {
      const { component } = await setup();
      selectFile(component, pdfFile());
      expect(component.hasMaterials()).toBe(true);
      expect(component.contextPlaceholderKey()).toBe(
        'aplus.unified_authoring.context_placeholder_with_materials',
      );
    });

    it('switches to the with-materials placeholder when only a rubric is attached', async () => {
      const { component } = await setup();
      component.onRubricFilesAdded([pdfFile('rubric.pdf')]);
      expect(component.hasMaterials()).toBe(true);
      expect(component.contextPlaceholderKey()).toBe(
        'aplus.unified_authoring.context_placeholder_with_materials',
      );
    });

    // GAP #2 — rubric dropzone (single file, counts toward the 32MB cap)
    it('sends rubric_file + files[] on the batch dispatch when a rubric is attached', async () => {
      const { component, svc } = await setup({ generate: job('running') });
      component.onTopicInput('Essays');
      selectFile(component, pdfFile('source.pdf'));
      component.onRubricFilesAdded([pdfFile('rubric.pdf')]);
      expect(component.rubricFile()?.name).toBe('rubric.pdf');
      component.start();
      const req = svc.generateQuestionJob.mock.calls[0][1] as GenerateBatchRequest;
      expect(req.rubric_file?.name).toBe('rubric.pdf');
      expect(req.files?.length).toBe(1);
      expect(req.file).toBeUndefined();
    });

    it('counts the rubric toward the 32MB combined cap', async () => {
      const { component } = await setup();
      component.onSourceFilesAdded([sized(pdfFile('src.pdf'), 20 * 1024 * 1024)]);
      component.onRubricFilesAdded([sized(pdfFile('rub.pdf'), 20 * 1024 * 1024)]);
      expect(component.rubricFile()).toBeNull();
      expect(component.rubricError()).toContain('too_large');
    });

    it('clearRubric removes the rubric and its error', async () => {
      const { component } = await setup();
      component.onRubricFilesAdded([pdfFile('rubric.pdf')]);
      component.clearRubric();
      expect(component.rubricFile()).toBeNull();
      expect(component.rubricError()).toBeNull();
    });

    it('a rubric error blocks canStart', async () => {
      const { component } = await setup();
      component.onTopicInput('X');
      component.onRubricFilesAdded([
        new File([new Uint8Array(8)], 'bad.exe', {
          type: 'application/x-msdownload',
        }),
      ]);
      expect(component.rubricError()).toContain('unsupported');
      expect(component.canStart()).toBe(false);
    });

    // Growth-Edge targeting was REMOVED from the authoring canvas — it is a
    // learner concern (you target your own Growth Edges), not an author one.
    // The batch dispatch must no longer carry `target_growth_edges`.
    it('does not send target_growth_edges on the batch dispatch', async () => {
      const { component, svc } = await setup({ generate: job('running') });
      component.onTopicInput('X');
      selectFile(component, pdfFile());
      component.start();
      const req = svc.generateQuestionJob.mock.calls[0][1] as unknown as Record<
        string,
        unknown
      >;
      expect('target_growth_edges' in req).toBe(false);
    });

    // ── Template wiring ─────────────────────────────────────────────
    it('renders the context textarea + rubric dropzone in AI mode, hidden in manual', async () => {
      const { fixture, component } = await setup();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="unified-context"]')).toBeTruthy();
      expect(
        el.querySelector('[data-testid="unified-rubric-dropzone"]'),
      ).toBeTruthy();
      component.onModeChange('manual');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="unified-context"]')).toBeNull();
      expect(
        el.querySelector('[data-testid="unified-rubric-dropzone"]'),
      ).toBeNull();
    });

    // CHO-1826 review pt 1 — the AI-instructions field is hoisted to the top of
    // the compose form: OUT of ZONE 2 (the optional-upload zone) and ABOVE the
    // question-mix composer, so it reads as the starting point for generation.
    it('hoists the AI-instructions field above the composer and ZONE 2', async () => {
      const { fixture } = await setup();
      const el = fixture.nativeElement as HTMLElement;
      const ctx = el.querySelector('[data-testid="unified-context"]');
      const zone2 = el.querySelector('[data-testid="unified-zone2"]');
      const composer = el.querySelector('chora-question-batch-generator');
      expect(ctx).toBeTruthy();
      expect(zone2).toBeTruthy();
      expect(composer).toBeTruthy();
      // Not nested inside the optional-upload zone …
      expect(zone2!.contains(ctx!)).toBe(false);
      // … and earlier than both the composer and ZONE 2 in document order.
      expect(
        ctx!.compareDocumentPosition(composer!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        ctx!.compareDocumentPosition(zone2!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('renders the AI-instructions hint with the hoisted field', async () => {
      const { fixture } = await setup();
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="unified-context-hint"]'),
      ).toBeTruthy();
    });

    // CHO-1826 review — cognitive level sits with the AI instructions (between
    // the instructions hint and the composer), not down in the settings row.
    it('places cognitive level just below the AI-instructions field', async () => {
      const { fixture } = await setup();
      const el = fixture.nativeElement as HTMLElement;
      const ctx = el.querySelector('[data-testid="unified-context"]');
      const cognitive = el.querySelector('[data-testid="unified-cognitive-level"]');
      const composer = el.querySelector('chora-question-batch-generator');
      expect(cognitive).toBeTruthy();
      // After the instructions field …
      expect(
        ctx!.compareDocumentPosition(cognitive!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // … and before the question-mix composer.
      expect(
        cognitive!.compareDocumentPosition(composer!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('never renders a growth-edge picker (learner-only concern)', async () => {
      const { fixture } = await setup();
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="unified-growth-edge-picker"]',
        ),
      ).toBeNull();
    });
  });

  // ── U5 Group C — review summary + bulk-select + reorder (CHO-1826) ──
  describe('U5 Group C review summary', () => {
    async function reach(summary?: Partial<GenerationSummary>) {
      const extra = summary
        ? {
            generation_summary: {
              requested_total: 0,
              generated_total: 0,
              generated_per_type: {},
              ...summary,
            } satisfies GenerationSummary,
          }
        : {};
      const ctx = await setup({
        generate: job('running'),
        polls: [job('succeeded', THREE_CANDIDATES, extra)],
      });
      ctx.component.onTopicInput('Photosynthesis');
      ctx.component.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(ctx.component.composeState().status).toBe('review');
      return ctx;
    }

    // GAP #5 — shortfall banner data + render
    it('generationSummary is null when idle', async () => {
      const { component } = await setup();
      expect(component.generationSummary()).toBeNull();
    });

    it('exposes generation_summary in review state', async () => {
      const { component } = await reach({
        requested_total: 10,
        generated_total: 8,
        generated_per_type: { mcq: 6, oe: 2 },
        shortfall_reason: 'ran out of grounded passages',
      });
      expect(component.generationSummary()?.generated_total).toBe(8);
    });

    it('renders the shortfall banner when shortfall_reason is set', async () => {
      const { fixture } = await reach({
        requested_total: 10,
        generated_total: 8,
        generated_per_type: { mcq: 8 },
        shortfall_reason: 'ran out of grounded passages',
      });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="unified-authoring-shortfall"]'),
      ).toBeTruthy();
    });

    it('omits the shortfall banner when there is no shortfall_reason', async () => {
      const { fixture } = await reach({
        requested_total: 3,
        generated_total: 3,
        generated_per_type: { mcq: 3 },
      });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="unified-authoring-shortfall"]'),
      ).toBeNull();
    });

    // GAP #6 — per-type counts
    it('perTypeCounts formats nonzero types as "6 MCQ · 2 OE"', async () => {
      const { component } = await reach({
        requested_total: 8,
        generated_total: 8,
        generated_per_type: { mcq: 6, oe: 2, tf: 0 },
      });
      expect(component.perTypeCounts()).toBe('6 MCQ · 2 OE');
    });

    it('perTypeCounts is empty without a summary', async () => {
      const { component } = await setup();
      expect(component.perTypeCounts()).toBe('');
    });

    // GAP #10 — select-all / deselect-all
    it('onToggleAll deselects all when all selected, else selects all', async () => {
      const { component } = await reach();
      expect(component.reviewItems().every((i) => i.selected)).toBe(true);
      component.onToggleAll();
      expect(component.reviewItems().every((i) => !i.selected)).toBe(true);
      component.onToggleAll();
      expect(component.reviewItems().every((i) => i.selected)).toBe(true);
    });

    // GAP #11 — drag-reorder
    it('onReorder moves an item and preserves the others in order', async () => {
      const { component } = await reach();
      const ids = () =>
        component.reviewItems().map((i) => (i.kind === 'ai' ? i.draftId : ''));
      const before = ids();
      component.onReorder({ from: 0, to: 2 });
      expect(ids()).toEqual([before[1], before[2], before[0]]);
    });

    it('onReorder is a no-op for same / out-of-bounds indices', async () => {
      const { component } = await reach();
      const ids = () =>
        component.reviewItems().map((i) => (i.kind === 'ai' ? i.draftId : ''));
      const before = ids();
      component.onReorder({ from: 1, to: 1 });
      expect(ids()).toEqual(before);
      component.onReorder({ from: 0, to: 99 });
      expect(ids()).toEqual(before);
      component.onReorder({ from: -1, to: 1 });
      expect(ids()).toEqual(before);
    });
  });

  // ── U5 Group D — test-set points + description + discovery (CHO-1826) ─
  describe('U5 Group D test-set polish', () => {
    async function reachReview(testSetItems?: { test_set_id: string }[]) {
      const ctx = await setup({
        generate: job('running'),
        polls: [job('succeeded', THREE_CANDIDATES)],
        testSetItems,
      });
      ctx.component.onTopicInput('Photosynthesis');
      ctx.component.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(ctx.component.composeState().status).toBe('review');
      return ctx;
    }

    // GAP #12 — points-per-question
    it('onPointsChange clamps to 1..100 and threads pointsByKey into testSetConfig', async () => {
      const { component } = await setup();
      component.onPointsChange({ key: 'd-1', points: 250 });
      expect(component.testSetConfig().pointsByKey?.['d-1']).toBe(100);
      component.onPointsChange({ key: 'd-1', points: 0 });
      expect(component.testSetConfig().pointsByKey?.['d-1']).toBe(1);
      component.onPointsChange({ key: 'd-2', points: 7.6 });
      expect(component.testSetConfig().pointsByKey?.['d-2']).toBe(8);
    });

    // GAP #13 — test-set description
    it('onSetTestSetDescription threads description into testSetConfig', async () => {
      const { component } = await setup();
      component.onSetTestSetDescription('Covers chapters 1–3');
      expect(component.testSetConfig().description).toBe('Covers chapters 1–3');
    });

    it('reset clears points, description and discovery state', async () => {
      const { component } = await setup();
      component.onPointsChange({ key: 'd-1', points: 5 });
      component.onSetTestSetDescription('x');
      component.reset();
      expect(component.testSetConfig().pointsByKey).toEqual({});
      expect(component.testSetConfig().description).toBe('');
      expect(component.testSetDiscovery().status).toBe('idle');
    });

    // GAP #14 — discovery polling
    it('polls for the assembled test set and deep-links when found', async () => {
      const { component, tsSvc } = await reachReview([{ test_set_id: 'ts-1' }]);
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onSetTestSetEnabled(true);
      component.onSetTestSetTitle('Quiz 1');

      component.onAccept();
      // No done screen — resets to the form; the discovery poll runs in the
      // background and deep-links the editor once the set is assembled.
      expect(component.composeState().status).toBe('idle');

      await vi.advanceTimersByTimeAsync(2000);

      expect(tsSvc.listTestSets).toHaveBeenCalledWith({ source_job_id: JOB_ID });
      expect(component.testSetDiscovery()).toEqual({
        status: 'found',
        testSetId: 'ts-1',
      });
      expect(navSpy).toHaveBeenCalledWith([
        '/a/studio/test-sets',
        'ts-1',
        'edit',
      ]);
    });

    it('times out to a non-blocking toast after the discovery window', async () => {
      const { component } = await reachReview([]); // never assembled
      const toast = TestBed.inject(ToastService);
      const showSpy = vi.spyOn(toast, 'show');
      component.onSetTestSetEnabled(true);
      component.onSetTestSetTitle('Quiz 1');

      component.onAccept();
      await vi.advanceTimersByTimeAsync(2000 * 15);

      expect(component.testSetDiscovery().status).toBe('timeout');
      expect(showSpy).toHaveBeenCalled();
    });

    it('does not poll for a test set when the toggle is off', async () => {
      const { component, tsSvc } = await reachReview([{ test_set_id: 'ts-1' }]);
      // test-set toggle left OFF
      component.onAccept();
      expect(component.composeState().status).toBe('idle');
      expect(component.testSetDiscovery().status).toBe('idle');
      expect(tsSvc.listTestSets).not.toHaveBeenCalled();
    });
  });

  // ── U5 Group E — "coming soon" reserved-types accordion (CHO-1826) ──
  describe('U5 Group E coming-soon accordion', () => {
    it('loads only the reserved (disabled) question types on init', async () => {
      const { component } = await setup({
        questionTypes: [
          qtype('mcq', 'Multiple choice', true),
          qtype('oe', 'Open-ended', true),
          qtype('reserved_tf', 'True / False', false),
          qtype('reserved_match', 'Matching', false),
        ],
      });
      expect(component.reservedTypes().map((t) => t.code)).toEqual([
        'reserved_tf',
        'reserved_match',
      ]);
    });

    it('soft-fails to an empty reserved list on a registry load error', async () => {
      const { component } = await setup({ questionTypesError: { status: 500 } });
      expect(component.reservedTypes()).toEqual([]);
    });

    it('toggleComingSoon flips the disclosure (collapsed by default)', async () => {
      const { component } = await setup();
      expect(component.comingSoonExpanded()).toBe(false);
      component.toggleComingSoon();
      expect(component.comingSoonExpanded()).toBe(true);
      component.toggleComingSoon();
      expect(component.comingSoonExpanded()).toBe(false);
    });

    it('renders the accordion toggle only when reserved types exist', async () => {
      const none = await setup();
      expect(
        (none.fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="unified-coming-soon-toggle"]',
        ),
      ).toBeNull();
    });

    it('renders reserved tiles when expanded', async () => {
      const { fixture, component } = await setup({
        questionTypes: [qtype('reserved_tf', 'True / False', false)],
      });
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="unified-coming-soon-toggle"]',
        ),
      ).toBeTruthy();
      component.toggleComingSoon();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="unified-coming-soon-panel"]'),
      ).toBeTruthy();
      expect(
        el.querySelector('[data-testid="unified-reserved-tile-reserved_tf"]')
          ?.textContent,
      ).toContain('True / False');
    });
  });

  // ── U5 review-polish (post-review fixes, CHO-1826) ─────────────────
  describe('U5 review polish', () => {
    // Proposal seeding (#10/#11/#12/#13) — restore the legacy seedComposer
    async function reachWithProposal() {
      const proposalJob = job('succeeded', THREE_CANDIDATES, {
        proposed_test_set: {
          title: 'Photosynthesis Quiz',
          description: 'Covers the light reactions',
          order: ['d-3', 'd-1', 'd-2'],
          points: { 'd-1': 5, 'd-3': 20 },
        },
      });
      const ctx = await setup({ generate: job('running'), polls: [proposalJob] });
      ctx.component.onTopicInput('Photosynthesis');
      ctx.component.start();
      await vi.advanceTimersByTimeAsync(2000);
      return ctx;
    }

    it('seeds the test-set composer (toggle/title/description/points) from the proposal', async () => {
      const { component } = await reachWithProposal();
      expect(component.testSetEnabled()).toBe(true);
      expect(component.testSetConfig().title).toBe('Photosynthesis Quiz');
      expect(component.testSetConfig().description).toBe(
        'Covers the light reactions',
      );
      // proposal points clamped; absent draft → uniform default 1.
      expect(component.testSetConfig().pointsByKey).toEqual({
        'd-1': 5,
        'd-2': 1,
        'd-3': 20,
      });
    });

    it('orders review rows by the proposal order (proposed first, rest appended)', async () => {
      const { component } = await reachWithProposal();
      const ids = component
        .reviewItems()
        .map((i) => (i.kind === 'ai' ? i.draftId : ''));
      expect(ids).toEqual(['d-3', 'd-1', 'd-2']);
    });

    it('leaves the test set off + blank when the job carries no proposal', async () => {
      const { component } = await setup({
        generate: job('running'),
        polls: [job('succeeded', THREE_CANDIDATES)],
      });
      component.onTopicInput('X');
      component.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(component.testSetEnabled()).toBe(false);
      expect(component.testSetConfig().pointsByKey).toEqual({});
    });

    // Fail-loud (#3) — no-files multi-type plan must refuse, not drop rows
    it('refuses a no-files AI dispatch when the plan has more than one type', async () => {
      const { component, svc } = await setup();
      component.onTopicInput('Mixed');
      component.onBatchPlanChange({
        type_plan: [
          { question_type: 'mcq', count: 3, max_images: 0 },
          { question_type: 'oe', count: 2, max_images: 0 },
        ],
        total: 5,
        allow_images: false,
        valid: true,
      });
      component.start();
      expect(component.composeState().status).toBe('error');
      expect(component.errorMessage()).toBe(
        'aplus.unified_authoring.error_multi_type_needs_files',
      );
      expect(svc.createAtom).not.toHaveBeenCalled();
    });

    it('allows a multi-type plan once source files are attached', async () => {
      const { component, svc } = await setup({ generate: job('running') });
      component.onTopicInput('Mixed');
      component.onBatchPlanChange({
        type_plan: [
          { question_type: 'mcq', count: 3, max_images: 0 },
          { question_type: 'oe', count: 2, max_images: 0 },
        ],
        total: 5,
        allow_images: false,
        valid: true,
      });
      selectFile(component, pdfFile());
      component.start();
      expect(component.composeState().status).toBe('polling');
      expect(svc.createAtom).toHaveBeenCalledTimes(1);
    });
  });

  // ── Gap #4 — AI pipeline-trace transparency card (CHO-1826) ────────
  describe('Gap #4 AI-trace card', () => {
    it('pipelineTrace is null + traceIdle true at idle', async () => {
      const { component } = await setup();
      expect(component.pipelineTrace()).toBeNull();
      expect(component.traceIdle()).toBe(true);
    });

    it('renders the trace widget in AI review when the job carries a pipeline_trace', async () => {
      const { component, fixture } = await setup({
        generate: job('running'),
        polls: [
          job('succeeded', THREE_CANDIDATES, {
            pipeline_trace: [
              { name: 'generate', status: 'COMPLETED' },
              { name: 'render_image', status: 'COMPLETED', notes: '1 image rendered' },
            ],
          }),
        ],
      });
      component.onTopicInput('Photosynthesis');
      component.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(component.composeState().status).toBe('review');
      expect(component.pipelineTrace()?.length).toBe(2);
      expect(component.traceIdle()).toBe(false);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="aplus-trace-widget"]',
        ),
      ).toBeTruthy();
    });

    it('does not render the trace widget in manual mode (idle hand-authoring)', async () => {
      const { component, fixture } = await setup();
      component.onModeChange('manual');
      fixture.detectChanges();
      expect(component.composeState().status).toBe('idle');
      expect(component.pipelineTrace()).toBeNull();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="aplus-trace-widget"]',
        ),
      ).toBeNull();
    });
  });

  // ── Manual mode renders the hand-authoring surface in idle (CHO-1826 B) ──
  describe('manual-mode hand-authoring surface', () => {
    it('shows the review-list (no session name field), hides every AI compose control', async () => {
      const { component, fixture } = await setup();
      component.onModeChange('manual');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      // The hand-authoring list is present …
      expect(el.querySelector('[data-testid="unified-review-list"]')).toBeTruthy();
      // … there is no session "name" field (each row is its own atom) …
      expect(el.querySelector('[data-testid="unified-manual-name"]')).toBeNull();
      // … and the AI compose controls are gone.
      expect(el.querySelector('chora-question-batch-generator')).toBeNull();
      expect(el.querySelector('[data-testid="unified-context"]')).toBeNull();
      expect(el.querySelector('[data-testid="unified-zone2"]')).toBeNull();
      expect(el.querySelector('[data-testid="unified-authoring-start"]')).toBeNull();
    });

    it('keeps the mode toggle visible so the author can switch back to AI', async () => {
      const { component, fixture } = await setup();
      component.onModeChange('manual');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="unified-mode-ai"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="unified-mode-manual"]')).toBeTruthy();
    });
  });

  // ── Defect 1: a rubric with NO source material is never silently dropped ──
  // The no-files ai_draft path cannot carry a rubric_file, and the batch handler
  // (createBatchSourceMaterialJob → buildBatchUploadPlan) 400s a rubric-only
  // payload ("missing file part: supply `file` or `files`"), so the ONLY safe
  // resolution is to require ≥1 source file whenever a mark scheme is attached.
  // Before the fix, canStart was true for a rubric-only submit and start()
  // dispatched an ai_draft job that silently dropped the mark scheme.
  describe('rubric without source material is never silently dropped (Defect 1)', () => {
    it('rubricNeedsSource is true when a rubric is attached with no source files', async () => {
      const { component } = await setup();
      component.onTopicInput('Essays');
      component.onRubricFilesAdded([pdfFile('rubric.pdf')]);
      expect(component.sourceFiles().length).toBe(0);
      expect(component.rubricNeedsSource()).toBe(true);
    });

    it('gates canStart false while a rubric is attached with no source (would 400 at the batch handler)', async () => {
      const { component } = await setup();
      component.onTopicInput('Essays');
      component.onRubricFilesAdded([pdfFile('rubric.pdf')]);
      expect(component.canStart()).toBe(false);
    });

    it('start() dispatches NO rubric-dropping ai_draft for a rubric-only submission', async () => {
      const { component, svc } = await setup({ generate: job('running') });
      component.onTopicInput('Essays');
      component.onRubricFilesAdded([pdfFile('rubric.pdf')]);
      component.start();
      // The ai_draft path cannot carry a rubric, so a rubric-only submit must
      // never route there (that silently dropped the mark scheme). No job minted.
      expect(svc.createAtom).not.toHaveBeenCalled();
      expect(svc.generateQuestionJob).not.toHaveBeenCalled();
    });

    it('renders the inline rubric-needs-source validation message (WCAG role=alert)', async () => {
      const { component, fixture } = await setup();
      component.onTopicInput('Essays');
      component.onRubricFilesAdded([pdfFile('rubric.pdf')]);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const msg = el.querySelector(
        '[data-testid="unified-authoring-rubric-needs-source"]',
      );
      expect(msg).toBeTruthy();
      expect(msg?.getAttribute('role')).toBe('alert');
    });

    it('clears the block once a source file is added → batch dispatch carries the rubric', async () => {
      const { component, svc } = await setup({ generate: job('running') });
      component.onTopicInput('Essays');
      component.onRubricFilesAdded([pdfFile('rubric.pdf')]);
      expect(component.canStart()).toBe(false);
      selectFile(component, pdfFile('source.pdf'));
      expect(component.rubricNeedsSource()).toBe(false);
      expect(component.canStart()).toBe(true);
      component.start();
      const req = svc.generateQuestionJob.mock.calls[0][1] as GenerateBatchRequest;
      expect(req.job_type).toBe('batch_source_material');
      expect(req.rubric_file?.name).toBe('rubric.pdf');
      expect(req.files?.length).toBe(1);
    });
  });

  // ── Defect 2: a severed/timed-out compose upload is retryable, not a spinner ─
  // A 504 (edge upload timeout) or an aborted multi-MB upload must surface a
  // clear, retryable error and clear the spinner; a truly black-holed upload
  // (never resolves, never errors) must be cancellable so it is never an
  // inescapable "still working" spinner.
  describe('severed/failed compose upload surfaces a retryable error (Defect 2)', () => {
    it('a 504 on the compose POST flips to a RETRYABLE error, clearing the spinner', async () => {
      const { component } = await setup({ generateError: { status: 504 } });
      component.onTopicInput('Essays');
      selectFile(component, pdfFile('source.pdf'));
      component.start();
      expect(component.composeState().status).toBe('error');
      expect(component.isWorking()).toBe(false); // spinner cleared
      expect(component.isRetryableError()).toBe(true);
      expect(component.errorMessage()).toBe(
        'aplus.unified_authoring.error_upstream',
      );
    });

    it('renders a Retry affordance on the retryable error and re-dispatches on click', async () => {
      const { component, svc, fixture } = await setup({
        generateError: { status: 504 },
      });
      component.onTopicInput('Essays');
      selectFile(component, pdfFile('source.pdf'));
      component.start();
      fixture.detectChanges();
      const btn = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="unified-authoring-retry"]',
      );
      expect(btn).toBeTruthy();
      expect(svc.createAtom).toHaveBeenCalledTimes(1);
      component.retryDispatch();
      // Retry re-runs the dispatch (re-mints the host atom + re-POSTs the job).
      expect(svc.createAtom).toHaveBeenCalledTimes(2);
      expect(svc.generateQuestionJob).toHaveBeenCalledTimes(2);
    });

    it('a black-holed (never-resolving) compose upload can be cancelled out of the spinner', async () => {
      const { component, svc } = await setup();
      svc.generateQuestionJob.mockReturnValue(NEVER);
      component.onTopicInput('Essays');
      selectFile(component, pdfFile('source.pdf'));
      component.start();
      // Without a cancel affordance this is the forever-spinner symptom.
      expect(component.composeState().status).toBe('submitting');
      component.cancelDispatch();
      expect(component.composeState().status).toBe('idle');
      expect(component.isWorking()).toBe(false);
    });

    it('renders a Cancel affordance while the compose upload is in flight', async () => {
      const { component, svc, fixture } = await setup();
      svc.generateQuestionJob.mockReturnValue(NEVER);
      component.onTopicInput('Essays');
      selectFile(component, pdfFile('source.pdf'));
      component.start();
      fixture.detectChanges();
      const btn = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="unified-authoring-cancel"]',
      );
      expect(btn).toBeTruthy();
      component.cancelDispatch(); // tear down the NEVER subscription
    });

    it('a failed generation job stays NON-retryable (retry is scoped to the compose dispatch)', async () => {
      const { component } = await setup({
        generate: job('running'),
        polls: [job('failed')],
      });
      component.onTopicInput('X');
      component.start();
      await vi.advanceTimersByTimeAsync(2000);
      expect(component.composeState().status).toBe('error');
      expect(component.isRetryableError()).toBe(false);
    });

    it('retryDispatch is a no-op when there is no retryable error', async () => {
      const { component, svc } = await setup();
      component.onTopicInput('X');
      component.retryDispatch(); // idle, not a retryable error
      expect(svc.createAtom).not.toHaveBeenCalled();
      expect(component.composeState().status).toBe('idle');
    });
  });
});
