/**
 * UnifiedAtomAuthoringComponent — A+ unified authoring canvas (CHO-1826 U4.2).
 *
 * Mounted at `/a/studio/atoms/new` (CHO-2215; `/a/atoms/new` + `/a/atoms/compose`
 * redirect here). The progressive-disclosure canvas that unifies the legacy
 * single + batch flows into ONE component. The legacy components stay as parity
 * reference and are NOT touched.
 *
 * This canvas is deliberately UNCHANGED by the Studio work beyond one removal:
 * the atom inventory that used to hang off its footer now lives at
 * `/a/studio/atoms`, where it has search, filters, real paging and a loud error.
 * The canvas is the step 2 of authoring; Studio is the step 1 it never had.
 *
 * THIS slice (U4.2) = the COMPOSE phase + state machine + job-dispatch wiring:
 *
 *   ZONE 1 (always visible): mode (AI / manual), topic (= atom title + AI seed),
 *     cognitive level, difficulty, and the shared mixed-type composer
 *     (QuestionBatchGenerator → QuestionBatchPlan).
 *   ZONE 2 (mode === 'ai' only): optional source files + grounding mode.
 *
 *   start() derives the host atom type from the first quota, mints the host
 *   atom (createAtom), then dispatches ONE of:
 *     • manual          → createManualJob (already `succeeded`; FREE; no LLM) →
 *                         review (manual: true) — candidates are EXPECTED empty.
 *     • AI, no files    → generateQuestionJob ai_draft (count 1..5) → poll →
 *                         review (manual: false).
 *     • AI, with files  → generateQuestionJob batch_source_material (type_plan +
 *                         grounding_mode) → poll → review (manual: false).
 *
 * The `review` state is a MINIMAL PLACEHOLDER in U4.2 — it shows the candidate
 * count (AI) or a "manual session ready" message (manual) plus a note that the
 * interleaved review + accept UI lands in U4.3. No accept logic, no inline
 * question editor here yet.
 *
 * Mirrors `batch-authoring.component.ts`: state-machine union, signals style,
 * createAtom → switchMap → generateQuestionJob → startPolling, and the
 * newId/errorKey/isTerminalJobStatus/backoffMs helpers.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { moveItemInArray } from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of, timer, catchError, map, switchMap, takeUntil, Subject } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../../core/services/translate.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { TestSetService } from '../../test-set-editor/test-set.service';
import { ChoraFileDropzoneComponent } from '../../../../../shared/components/chora-file-dropzone/chora-file-dropzone.component';
import { QuestionBatchGeneratorComponent } from '../../../../../shared/components/question-batch-generator/question-batch-generator.component';
import type {
  ComposerQuestionType,
  QuestionBatchPlan,
} from '../../../../../shared/components/question-batch-generator/question-batch-generator.model';
import { AtomAuthoringService } from '../atom-authoring.service';
import { AiAssistJobRegistryService } from '../ai-assist-job-registry.service';
import type { TrackedJob } from '../ai-assist-job-registry.service';
import {
  COGNITIVE_LEVELS,
  toDifficultyBucket,
  toWireCognitiveLevel,
} from '../atom-authoring.model';
import type {
  CognitiveLevel,
  GenerationSummary,
  ImagePlacement,
  PipelineTraceStep,
  QuestionDraftCandidate,
  QuestionGenerationJob,
  QuestionTypeOption,
} from '../atom-authoring.model';
import { TraceWidgetComponent } from '../widget/trace-widget.component';
import { StudioSubNavComponent } from '../../studio/studio-sub-nav.component';
import {
  validateEditableQuestion,
  type EditableQuestion,
} from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';
import { UnifiedReviewListComponent } from './unified-review-list.component';
import { buildAcceptRequest } from './unified-accept.builder';
import { previewAcceptMana } from './unified-mana.preview';
import { newManualRow, manualRowToReviewItem } from './unified-manual';
import type {
  ManaPreview,
  UnifiedReviewItem,
  UnifiedTestSetConfig,
} from './unified-review.model';

/** ZONE-1 authoring mode — AI generation vs hand-authoring. */
export type ComposeMode = 'ai' | 'manual';

/** ZONE-2 grounding mode (AI-with-files path only). */
export type GroundingMode = 'strict' | 'starting_point';

/**
 * Done-state test-set discovery (Lane 1c, GAP #14): chora-delivery assembles a
 * DRAFT test set off the `question_batch.accepted.v1` event; the canvas
 * discovers it by polling `?source_job_id=` then deep-links the editor.
 */
export type TestSetDiscoveryState =
  | { readonly status: 'idle' }
  | { readonly status: 'polling' }
  | { readonly status: 'found'; readonly testSetId: string }
  | { readonly status: 'timeout' };

/**
 * Component state machine for the unified compose flow. `polling` + `review`
 * carry the `atomId` so the poll loop + the (U4.3) accept route resolve the
 * host atom without re-reading it; `review.manual` distinguishes the
 * empty-candidates manual session from an AI candidate set.
 */
export type ComposeState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | {
      readonly status: 'polling';
      readonly job: QuestionGenerationJob;
      readonly atomId: string;
    }
  | {
      readonly status: 'review';
      readonly job: QuestionGenerationJob;
      readonly atomId: string;
      readonly manual: boolean;
    }
  | {
      readonly status: 'accepting';
      readonly job: QuestionGenerationJob;
      readonly atomId: string;
      readonly manual: boolean;
    }
  | {
      readonly status: 'error';
      readonly error: string;
      /**
       * FE-2 (Defect 2): true when the failure is a severed/timed-out/non-2xx
       * COMPOSE DISPATCH (createAtom → generateQuestionJob POST) that the author
       * can safely re-run as-is. Drives the inline "Try again" affordance. Left
       * unset for input-fix errors (multi-type, rubric-needs-source) and for
       * post-dispatch failures (a failed job, no candidates, a poll transport
       * error) where re-running the same dispatch is not the right recovery.
       */
      readonly retryable?: boolean;
    };

/**
 * Source-material upload constraints — mirror the BE allowlist + 32MB cap
 * (identical to batch-authoring: 1..5 source files, 32MB combined).
 */
const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.md',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
] as const;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_FILES = 5;
const POLL_BACKOFF_MS = [2000, 4000, 8000, 16000] as const;
/** ai_draft candidate count is bounded 1..5 on the unified no-files path. */
const MIN_AI_COUNT = 1;
const MAX_AI_COUNT = 5;
/**
 * CHO-1826 U4.3c: ceiling on the per-image regenerate poll (mirrors batch-
 * authoring). A single image render is fast (~5-15s); 30 attempts on the capped
 * 16s backoff is generous headroom before declaring a stuck job, so a never-
 * terminating regen job can't poll forever.
 */
const IMAGE_REGEN_POLL_MAX_ATTEMPTS = 30;
/** Test-set discovery poll cadence (GAP #14) — every 2s, ≤30s (15 attempts). */
const TEST_SET_POLL_INTERVAL_MS = 2000;
const TEST_SET_POLL_MAX_ATTEMPTS = 15;
/** Test-set-scoped points bounds + uniform fallback (mirror the BE clamp). */
const POINTS_MIN = 1;
const POINTS_MAX = 100;
const POINTS_DEFAULT = 1;

@Component({
  selector: 'chora-unified-atom-authoring',
  standalone: true,
  imports: [
    TranslatePipe,
    RouterLink,
    ChoraFileDropzoneComponent,
    QuestionBatchGeneratorComponent,
    UnifiedReviewListComponent,
    TraceWidgetComponent,
    StudioSubNavComponent,
  ],
  templateUrl: './unified-atom-authoring.component.html',
  styleUrl: './unified-atom-authoring.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnifiedAtomAuthoringComponent {
  private readonly service = inject(AtomAuthoringService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly testSetService = inject(TestSetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  /**
   * Route-independent tracking for in-flight generations. The poll no longer
   * lives on this component: leaving the route used to destroy the loop and
   * orphan the job with no way back (live complaint 2026-08-14). The registry
   * outlives the route, so the author can start a batch, go elsewhere, start a
   * second batch, and come back to either one.
   */
  private readonly jobRegistry = inject(AiAssistJobRegistryService);
  /** The job this screen is currently attached to (null when composing). */
  private readonly attachedJobId = signal<string | null>(null);

  // ── Compose ZONE 1 (always visible) ───────────────────────────────
  readonly mode = signal<ComposeMode>('ai');
  /** The atom title/subject — also the AI seed (stem + prompt + context). */
  readonly topic = signal<string>('');
  /** Optional free-text "Context for the LLM" body — combined with the topic
   *  into the generation hint (mirrors legacy batch title + contextBody). */
  readonly contextBody = signal<string>('');
  readonly cognitiveLevel = signal<CognitiveLevel>('applying');
  readonly difficulty = signal<1 | 2 | 3 | 4 | 5>(3);
  /** Latest mixed-type plan from the shared composer (gates `canStart`). */
  readonly batchPlan = signal<QuestionBatchPlan | null>(null);

  /** Cognitive-level options for the ZONE-1 select. */
  readonly cognitiveLevels = COGNITIVE_LEVELS;
  /** Stable identity for the composer's `allowedTypes` input (mcq + oe). */
  readonly allowedComposerTypes: readonly ComposerQuestionType[] = ['mcq', 'oe'];

  // ── "Coming soon" reserved question types (single-mode parity; GAP #15) ─
  /** The disabled registry entries — the reserved-type teaser (soft-fail []). */
  readonly reservedTypes = signal<readonly QuestionTypeOption[]>([]);
  /** Disclosure state for the "more question types coming soon" accordion. */
  readonly comingSoonExpanded = signal<boolean>(false);

  // ── Compose ZONE 2 (mode === 'ai' only) ───────────────────────────
  readonly sourceFiles = signal<readonly File[]>([]);
  readonly fileError = signal<string | null>(null);
  readonly groundingMode = signal<GroundingMode>('starting_point');
  /** Native `accept` allowlist for the source dropzone. */
  readonly acceptAttr = ALLOWED_EXTENSIONS.join(',');
  /** Optional single rubric / mark-scheme file (OE grading) — counts toward the
   *  32MB combined cap; sent as the `rubric_file` part on the batch path. */
  readonly rubricFile = signal<File | null>(null);
  readonly rubricError = signal<string | null>(null);
  /** The rubric as a 0..1 File[] for the shared dropzone's `files` input. */
  readonly rubricFiles = computed<readonly File[]>(() => {
    const f = this.rubricFile();
    return f ? [f] : [];
  });

  /**
   * True when any source material (files or a rubric) is attached. The
   * AI-instructions field (ZONE 1) is the UNIVERSAL steer — honoured whether or
   * not material is uploaded — so its placeholder is material-aware: with no
   * uploads it prompts "describe what to generate"; once material is attached it
   * prompts "describe how to use it" (CHO-1826 review pts 2-3).
   */
  readonly hasMaterials = computed<boolean>(
    () => this.sourceFiles().length > 0 || this.rubricFile() !== null,
  );

  /** Material-aware i18n key for the AI-instructions textarea placeholder. */
  readonly contextPlaceholderKey = computed<string>(() =>
    this.hasMaterials()
      ? 'aplus.unified_authoring.context_placeholder_with_materials'
      : 'aplus.unified_authoring.context_placeholder',
  );

  /**
   * FE-1 (Defect 1): a mark scheme with NO source material. The no-files
   * ai_draft path carries no rubric_file, and the batch handler
   * (buildBatchUploadPlan) rejects a rubric-only multipart with 400
   * ("missing file part: supply `file` or `files`"), so a rubric on its own
   * has no valid dispatch AND nothing to grade against. This gates the Start
   * CTA and drives the inline validation message; the author must attach at
   * least one source (routes the batch path that carries the rubric) or remove
   * the rubric (routes the ai_draft path with no rubric to drop).
   */
  readonly rubricNeedsSource = computed<boolean>(
    () => this.rubricFile() !== null && this.sourceFiles().length === 0,
  );

  // ── Flow state ────────────────────────────────────────────────────
  readonly composeState = signal<ComposeState>({ status: 'idle' });
  /**
   * FE-1 (#3): the last accept-time failure key (or null). On a 4xx/5xx accept
   * error we KEEP the `review` state — so the author keeps every generated
   * candidate and does NOT re-generate + re-pay accept-time mana — and surface
   * this inline by the accept CTA instead of flipping to the 'error' state. The
   * template renders the compose FORM for both 'idle' AND 'error', so flipping
   * to 'error' would destroy the review. Cleared at the top of onAccept and on
   * any edit/selection change so a fix-and-retry starts clean.
   */
  readonly acceptError = signal<string | null>(null);

  // ── Review working state (U4.3) ───────────────────────────────────
  /** Interleaved review rows (AI candidates + appended manual rows) in commit
   *  order. Seeded on entering `review`; mutated by the review-list outputs. */
  readonly reviewItems = signal<readonly UnifiedReviewItem[]>([]);
  /** Lane 1c — author opts to assemble the accepted atoms into a DRAFT test set. */
  readonly testSetEnabled = signal<boolean>(false);
  readonly testSetTitle = signal<string>('');
  /** Optional test-set description (GAP #13). */
  readonly testSetDescription = signal<string>('');
  /** Per-row test-set points, keyed by AI draftId (GAP #12). */
  readonly pointsByKey = signal<Readonly<Record<string, number>>>({});
  /** Done-state test-set discovery sub-state (GAP #14). */
  readonly testSetDiscovery = signal<TestSetDiscoveryState>({ status: 'idle' });

  // ── Per-image regenerate (U4.3c) ──────────────────────────────────
  /** Per-(draftId|placement) regenerate sub-state — spinner + inline error,
   *  keyed `draftId|placement` (the review-list reads the same key format). */
  private readonly _regen = signal<
    Readonly<Record<string, { regenerating: boolean; error: string | null }>>
  >({});
  /** Read-only view of the regenerate sub-state for the review-list input. */
  readonly regenState = this._regen.asReadonly();

  // ── Done / share state (post-accept) ────────────────────────────────
  /** After accept succeeds, a "done" panel replaces the compose form.
   *  Carries the atom ID so the Share CTA can call the sharing endpoint. */
  readonly doneState = signal<
    | { status: 'idle' }
    | { status: 'done'; atomId: string; created: number }
  >({ status: 'idle' });

  readonly sharePanelOpen = signal(false);
  readonly shareCaption = signal('');
  readonly shareLicense = signal('cc_by_sa');
  readonly shareRoyaltyRate = signal<number>(10);
  readonly shareState = signal<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success' }
    | { status: 'error'; error: string }
  >({ status: 'idle' });

  /**
   * FE-2 (Defect 2): fires to abort the in-flight compose dispatch / poll loop
   * so a severed or black-holed upload is never an inescapable spinner. Woven
   * into the dispatch pipe + pollLoop via takeUntil; emitted by cancelDispatch.
   */
  private readonly cancel$ = new Subject<void>();

  readonly isRoyaltyLicense = computed<boolean>(
    () => this.shareLicense() === 'royalty_pct' || this.shareLicense() === 'royalty_fixed',
  );

  readonly licenseOptions = [
    { value: 'free', labelKey: 'aplus.unified_authoring.share.license_free' },
    { value: 'cc_by_sa', labelKey: 'aplus.unified_authoring.share.license_cc_by_sa' },
    { value: 'cc_nd', labelKey: 'aplus.unified_authoring.share.license_cc_nd' },
    { value: 'royalty_pct', labelKey: 'aplus.unified_authoring.share.license_royalty_pct' },
    { value: 'royalty_fixed', labelKey: 'aplus.unified_authoring.share.license_royalty_fixed' },
  ] as const;

  constructor() {
    // Load the reserved (disabled) question types for the "coming soon" teaser.
    // Soft-fail: a registry error hides the accordion — it's pure enrichment.
    this.service
      .loadQuestionTypes()
      .pipe(
        map((types) => types.filter((t) => !t.enabled)),
        catchError(() => of([] as QuestionTypeOption[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((reserved) => this.reservedTypes.set(reserved));

    // Re-attach to a generation the author started and walked away from. Runs
    // before the sync effect so the first paint already shows the right state.
    this.reattachTrackedJob();

    // Mirror the registry onto composeState for whichever job this screen is
    // attached to. The registry polls regardless of this component's lifetime,
    // so this is a pure projection - the screen can come and go freely.
    // Subscribed (not a signal effect) because the compose state machine has to
    // settle in the SAME tick as the poll result; a scheduled effect would land
    // a change-detection pass late.
    this.jobRegistry.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((tracked) => {
        if (tracked.jobId !== this.attachedJobId()) return;
        this.applyTracked(tracked);
      });

    // Complete the cancel channel on teardown so it never leaks a subscription.
    // NOTE: teardown deliberately does NOT release the tracked job - that is
    // the whole point. An in-flight generation outlives this screen.
    this.destroyRef.onDestroy(() => this.cancel$.complete());
  }

  /** Toggle the "more question types coming soon" disclosure (GAP #15). */
  toggleComingSoon(): void {
    this.comingSoonExpanded.update((open) => !open);
  }

  // ── Derived view helpers ──────────────────────────────────────────
  /**
   * Start gate: idle/error AND a topic AND a valid plan AND no file/rubric error.
   * Files are OPTIONAL even in AI mode (no files ⇒ the ai_draft seed path).
   */
  readonly canStart = computed<boolean>(() => {
    const status = this.composeState().status;
    const idle = status === 'idle' || status === 'error';
    const plan = this.batchPlan();
    return (
      idle &&
      this.topic().trim().length > 0 &&
      (plan?.valid ?? false) &&
      this.fileError() === null &&
      this.rubricError() === null &&
      // FE-1 (Defect 1): a rubric with no source can only 400 (or silently drop
      // the mark scheme on the ai_draft path), so block the dispatch entirely.
      !this.rubricNeedsSource()
    );
  });

  /**
   * Context-aware helper text under a disabled Start CTA: the rubric-needs-
   * source ask takes priority over the generic need-a-topic nudge, so the
   * author sees the ACTUAL blocker (a mark scheme with no source) instead of a
   * misleading "add a topic" when they already have one.
   */
  readonly ctaStatusKey = computed<string>(() =>
    this.rubricNeedsSource()
      ? 'aplus.unified_authoring.rubric_needs_source'
      : 'aplus.unified_authoring.cta_status_need_topic',
  );

  /**
   * FE-2 (Defect 2): true only for a retryable compose-dispatch failure, so the
   * template renders the "Try again" affordance next to the error banner.
   */
  readonly isRetryableError = computed<boolean>(() => {
    const s = this.composeState();
    return s.status === 'error' && s.retryable === true;
  });

  readonly isWorking = computed<boolean>(() => {
    const s = this.composeState().status;
    return s === 'submitting' || s === 'polling';
  });

  readonly errorMessage = computed<string | null>(() => {
    const s = this.composeState();
    return s.status === 'error' ? s.error : null;
  });

  /** Review placeholder: true ⇒ manual session, false ⇒ AI candidate set. */
  readonly reviewManual = computed<boolean>(() => {
    const s = this.composeState();
    return s.status === 'review' ? s.manual : false;
  });

  /** Review placeholder: AI candidate count (0 for the manual session). */
  readonly reviewCandidateCount = computed<number>(() => {
    const s = this.composeState();
    if (s.status !== 'review') return 0;
    return s.job.candidate_questions?.length ?? s.job.drafts?.length ?? 0;
  });

  /** Indicative accept-time mana cost over the SELECTED review rows. */
  readonly manaPreview = computed<ManaPreview>(() =>
    previewAcceptMana(this.reviewItems()),
  );

  /** AI job's generation summary (shortfall + per-type counts) — present in
   *  review/accepting on AI paths; null for manual + idle (GAP #5/#6). */
  readonly generationSummary = computed<GenerationSummary | null>(() => {
    const s = this.composeState();
    if (s.status !== 'review' && s.status !== 'accepting') return null;
    return s.job.generation_summary ?? null;
  });

  /** Per-type generation breakdown ("6 MCQ · 2 OE") from the summary (GAP #6). */
  readonly perTypeCounts = computed<string>(() => {
    const per = this.generationSummary()?.generated_per_type;
    if (!per) return '';
    return Object.entries(per)
      .filter(([, n]) => n > 0)
      .map(([type, n]) => `${n} ${type.toUpperCase()}`)
      .join(' · ');
  });

  /** The polled job's per-step QGen pipeline trace (incl. image-gen) for the
   *  IMDA D2 transparency card (GAP #4). AI paths only — manual sessions carry
   *  no trace. Present once the completed AI job lands (review/accepting). */
  readonly pipelineTrace = computed<readonly PipelineTraceStep[] | null>(() => {
    const s = this.composeState();
    if (s.status === 'polling') return s.job.pipeline_trace ?? null;
    if ((s.status === 'review' || s.status === 'accepting') && !s.manual) {
      return s.job.pipeline_trace ?? null;
    }
    return null;
  });

  /** True when there is no trace to render — gates the widget mount. */
  readonly traceIdle = computed<boolean>(() => this.pipelineTrace() === null);

  /**
   * CHO-2387 fail-loud: the author asked for an illustration on every question
   * and did not get one. The orchestrator renders a forced image as INTEGRAL to
   * the item (the stem is written to say "using the illustration below"), so a
   * throttled renderer does not make the question plainer, it makes it
   * unanswerable. Before this the batch shipped looking clean and the only
   * evidence was a DEGRADED pill inside the collapsed trace.
   *
   * Read straight off the render_image trace row, whose notes carry the honest
   * "rendered N/M image(s)" count.
   */
  readonly imageRenderWarning = computed<{
    rendered: number;
    total: number;
  } | null>(() => {
    const row = (this.pipelineTrace() ?? []).find(
      (r) => r.name === 'render_image',
    );
    if (!row) return null;
    const m = /rendered (\d+)\/(\d+)/.exec(String(row.notes ?? ''));
    if (!m) return null;
    const rendered = Number(m[1]);
    const total = Number(m[2]);
    return rendered < total ? { rendered, total } : null;
  });

  /**
   * True while the AI job is in flight (submitting | polling). Drives the trace
   * widget's LIVE mode — the trace streams in node-by-node during generation
   * (running pill + working ghost, no auto-collapse) instead of a stale
   * "please wait" spinner (CR Phase 2).
   */
  readonly isGenerating = computed<boolean>(() => {
    const s = this.composeState().status;
    return s === 'submitting' || s === 'polling';
  });

  /** Author-curated test-set config passed to the accept builder. */
  readonly testSetConfig = computed<UnifiedTestSetConfig>(() => ({
    enabled: this.testSetEnabled(),
    title: this.testSetTitle(),
    description: this.testSetDescription(),
    pointsByKey: this.pointsByKey(),
  }));

  /**
   * FE-2 (#2): a topic test set needs ≥2 questions (ADR-195 D4). Only AI rows
   * carry a draft_id, so only selected AI candidates can populate a test set —
   * manual rows commit as their own atoms but are never placed in the test set
   * (see unified-accept.builder). Gates the test-set toggle + the accept.
   */
  readonly canAssembleTestSet = computed<boolean>(
    () =>
      this.reviewItems().filter((i) => i.kind === 'ai' && i.selected).length >=
      2,
  );

  /** Accept gate: ≥1 selected row, every selected row's edit valid, and — when
   *  the test-set toggle is on — a non-empty title AND ≥2 assemblable AI rows
   *  (else we'd hand the backend a guaranteed-400, now surfaced via FE-1). */
  readonly canAccept = computed<boolean>(() => {
    const selected = this.reviewItems().filter((i) => i.selected);
    if (selected.length === 0) return false;
    if (!selected.every((i) => validateEditableQuestion(i.edit).valid)) {
      return false;
    }
    if (this.testSetEnabled()) {
      if (this.testSetTitle().trim().length === 0) return false;
      if (!this.canAssembleTestSet()) return false;
    }
    return true;
  });

  /**
   * Manual-mode accept gate (CHO-1826 review): ≥1 selected hand-authored row
   * whose edit passes the shared question-editor validator. No session "name" is
   * required — each row is its own atom (titled by its prompt or the row's
   * optional atom-title override). No test-set branch either: manual rows carry
   * no draft_id, so they can never populate a test set.
   */
  readonly canAcceptManual = computed<boolean>(() => {
    if (this.mode() !== 'manual') return false;
    const selected = this.reviewItems().filter((i) => i.selected);
    if (selected.length === 0) return false;
    return selected.every((i) => validateEditableQuestion(i.edit).valid);
  });

  /** True while an accept is dispatching — disables the review-list CTA. */
  readonly acceptBusy = computed<boolean>(
    () => this.composeState().status === 'accepting',
  );

  // ── ZONE-1 handlers ───────────────────────────────────────────────
  onModeChange(mode: ComposeMode): void {
    this.mode.set(mode);
  }

  onTopicInput(value: string): void {
    this.topic.set(value);
  }

  onContextBodyInput(value: string): void {
    this.contextBody.set(value);
  }

  /** Combined LLM hint: topic + the optional context body (blank-filtered,
   *  double-newline joined). Used as the batch `context` AND the ai_draft
   *  `prompt` so a free-text hint is honoured on both dispatch paths. */
  private buildContext(): string {
    return [this.topic().trim(), this.contextBody().trim()]
      .filter((s) => s.length > 0)
      .join('\n\n');
  }

  /**
   * CHO-1657 — the author's structured hints as the str->str `metadata` map the
   * BE lifts onto ai_assist.started.v1 (proto field 12): the qgen crew is
   * conditioned on them AND O+ Decision Traces surface them as ADR-197
   * prompt_conditions. `subject` is the topic; `cognitive_level` maps FE
   * revised-Bloom → BE older-Bloom; `difficulty` is the 3-bucket vocabulary. All
   * values are strings (the BE metadata wire is map<string,string>). Mirrors the
   * single-mode drawer's `buildAiAssistMetadata()`; the unify (CHO-1826) dropped it.
   */
  private buildAiMetadata(): Readonly<Record<string, string>> {
    const subject = this.topic().trim();
    return {
      ...(subject ? { subject } : {}),
      cognitive_level: toWireCognitiveLevel(this.cognitiveLevel()),
      difficulty: toDifficultyBucket(this.difficulty()),
    };
  }

  onCognitiveLevelChange(value: string): void {
    if (COGNITIVE_LEVELS.includes(value as CognitiveLevel)) {
      this.cognitiveLevel.set(value as CognitiveLevel);
    }
  }

  onDifficultyChange(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (parsed >= 1 && parsed <= 5) {
      this.difficulty.set(parsed as 1 | 2 | 3 | 4 | 5);
    }
  }

  onBatchPlanChange(plan: QuestionBatchPlan): void {
    this.batchPlan.set(plan);
  }

  // ── ZONE-2 handlers (source files + grounding) ────────────────────
  setGroundingMode(mode: GroundingMode): void {
    this.groundingMode.set(mode);
  }

  /** The source dropzone emitted newly picked / dropped files — merge + validate. */
  onSourceFilesAdded(files: readonly File[]): void {
    this.addSourceFiles(files);
  }

  /** Remove a single accumulated source file by index. */
  removeSourceFile(index: number): void {
    this.sourceFiles.set(this.sourceFiles().filter((_, i) => i !== index));
    // Removal can only relax the over-cap / over-size constraints.
    this.fileError.set(null);
  }

  /**
   * The rubric dropzone emitted a file (multiple=false ⇒ at most one) via the
   * picker OR drag-and-drop — same MIME allowlist, counts toward the 32MB
   * combined cap, ≤1 file. An empty add keeps the prior rubric.
   */
  onRubricFilesAdded(files: readonly File[]): void {
    const picked = files[0];
    if (!picked) return;
    if (!this.hasAllowedExtension(picked)) {
      this.rubricFile.set(null);
      this.rubricError.set('aplus.unified_authoring.error_unsupported_type');
      return;
    }
    if (this.totalBytes(this.sourceFiles(), picked) > MAX_FILE_BYTES) {
      this.rubricFile.set(null);
      this.rubricError.set('aplus.unified_authoring.error_total_too_large');
      return;
    }
    this.rubricError.set(null);
    this.rubricFile.set(picked);
  }

  clearRubric(): void {
    this.rubricFile.set(null);
    this.rubricError.set(null);
  }

  /**
   * Merge incoming files into sourceFiles (APPEND + dedupe by name+size, capped
   * at MAX_SOURCE_FILES) and validate the COMBINED set. Mirrors the batch host:
   * a violating add is rejected WHOLE (existing valid selection KEPT + i18n
   * error); an empty add keeps the prior selection.
   */
  private addSourceFiles(incoming: readonly File[]): void {
    if (incoming.length === 0) return;
    const merged = [...this.sourceFiles()];
    for (const f of incoming) {
      if (!merged.some((e) => e.name === f.name && e.size === f.size)) {
        merged.push(f);
      }
    }
    if (merged.length > MAX_SOURCE_FILES) {
      this.fileError.set('aplus.unified_authoring.error_too_many_files');
      return;
    }
    if (merged.some((f) => !this.hasAllowedExtension(f))) {
      this.fileError.set('aplus.unified_authoring.error_unsupported_type');
      return;
    }
    if (merged.some((f) => f.size > MAX_FILE_BYTES)) {
      this.fileError.set('aplus.unified_authoring.error_file_too_large');
      return;
    }
    if (this.totalBytes(merged, this.rubricFile()) > MAX_FILE_BYTES) {
      this.fileError.set('aplus.unified_authoring.error_total_too_large');
      return;
    }
    this.fileError.set(null);
    this.sourceFiles.set(merged);
  }

  private hasAllowedExtension(file: File): boolean {
    const lower = file.name.toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  private totalBytes(
    sources: readonly File[],
    rubric: File | null = null,
  ): number {
    return (
      sources.reduce((sum, f) => sum + f.size, 0) + (rubric ? rubric.size : 0)
    );
  }

  // ── Start → (ai_draft | batch) → poll → review (AI only) ──────────
  start(): void {
    if (!this.canStart()) return;
    // AI-only. "By hand" now drops straight into the idle hand-authoring surface
    // and commits via onManualAccept — it never routes through start() (CHO-1826
    // review B). Guard defensively so a stray call can't mint an AI job.
    if (this.mode() !== 'ai') return;
    const plan = this.batchPlan();
    if (!plan) return;

    const typePlan = plan.type_plan;
    const firstType: ComposerQuestionType =
      typePlan[0]?.question_type ?? 'mcq';
    const firstCount = typePlan[0]?.count ?? 1;
    const planTotal = typePlan.reduce((sum, q) => sum + q.count, 0);
    const atomType = firstType === 'mcq' ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER';

    const topic = this.topic().trim();
    const mode = this.mode();
    const sources = this.sourceFiles();

    // Fail-loud: the no-files ai_draft path can only dispatch ONE question type
    // (the BE body rejects type_plan), so a mixed plan with no source material
    // would silently drop every row but the first. Refuse instead of dropping.
    if (mode === 'ai' && sources.length === 0 && typePlan.length > 1) {
      this.composeState.set({
        status: 'error',
        error: 'aplus.unified_authoring.error_multi_type_needs_files',
      });
      return;
    }

    // FE-1 (Defect 1): a rubric with no source is blocked upstream by canStart
    // (checked at the top of start(): rubricNeedsSource forces canStart false),
    // which disables the CTA + shows the inline message, so a rubric-only submit
    // can never reach the ai_draft path that would silently drop the mark scheme.

    this.composeState.set({ status: 'submitting' });

    this.service
      .createAtom({
        atom_type: atomType,
        stem: topic,
        title: topic,
        locale: 'en',
        cognitive_level: toWireCognitiveLevel(this.cognitiveLevel()),
        difficulty: this.difficulty(),
      })
      .pipe(
        switchMap(({ atomId }) => {
          if (sources.length === 0) {
            // AI seed (no source material) → single-question ai_draft path.
            return this.service
              .generateQuestionJob(
                atomId,
                {
                  job_type: 'ai_draft',
                  question_type: firstType,
                  // The no-files ai_draft body disallows unknown fields, so the
                  // free-text context rides the prompt (topic + context body).
                  prompt: this.buildContext(),
                  count: this.clampAiCount(firstCount),
                  difficulty: this.difficulty(),
                  // CHO-1826 Gap #4 — honour the composer's forced-image opt-in
                  // for the single-type no-files path (only ONE type here, so
                  // the first quota's flags apply). Emitted only when set so the
                  // legacy no-image body stays byte-stable. Without this the
                  // opt-in was silently dropped and the Illustration card never
                  // surfaced on the topic-only flow.
                  ...(typePlan[0]?.image_for_stem
                    ? { image_for_stem: true }
                    : {}),
                  ...(typePlan[0]?.image_for_answer
                    ? { image_for_answer: true }
                    : {}),
                  // CHO-1657 — author hints (subject / cognitive_level /
                  // difficulty) so the crew is conditioned on them AND O+ shows
                  // them as ADR-197 prompt_conditions. Restores the wire-through
                  // the unify dropped (cognitive level was a no-op without this).
                  metadata: this.buildAiMetadata(),
                },
                this.newId(),
              )
              .pipe(map((job) => ({ atomId, job })));
          }
          // AI grounded in uploaded material → batch_source_material path.
          // A single source with NO rubric keeps the legacy byte-identical
          // `file` part; multi-file and/or a rubric uses `files[]` + `rubric_file`.
          const rubric = this.rubricFile();
          const fileFields =
            sources.length === 1 && !rubric
              ? { file: sources[0] }
              : { files: sources, ...(rubric ? { rubric_file: rubric } : {}) };
          return this.service
            .generateQuestionJob(
              atomId,
              {
                job_type: 'batch_source_material',
                ...fileFields,
                question_type: firstType,
                question_count: planTotal,
                type_plan: typePlan,
                difficulty: this.difficulty(),
                grounding_mode: this.groundingMode(),
                context: this.buildContext(),
                // CHO-1657 — same author hints on the grounded batch path.
                metadata: this.buildAiMetadata(),
              },
              this.newId(),
            )
            .pipe(map((job) => ({ atomId, job })));
        }),
        // FE-2 (Defect 2): a Cancel abort tears down the whole createAtom →
        // compose-POST dispatch so a severed/black-holed upload is escapable.
        takeUntil(this.cancel$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ atomId, job }) =>
          this.startPolling(atomId, job, mode === 'manual'),
        // FE-2 (Defect 2): a severed / timed-out (504) / non-2xx compose POST
        // is a RETRYABLE dispatch failure: clear the spinner, surface the error
        // AND a "Try again" affordance (the inputs are preserved in signals, so
        // retryDispatch re-runs start() as-is).
        error: (err) =>
          this.composeState.set({
            status: 'error',
            error: this.errorKey(err),
            retryable: true,
          }),
      });
  }

  /**
   * FE-2 (Defect 2): re-run the compose dispatch after a retryable failure. The
   * inputs (topic / files / rubric / plan / difficulty) all live in signals, so
   * re-invoking start() re-mints the host atom + re-POSTs the compose job as-is.
   * Guarded by start()'s own canStart check.
   */
  retryDispatch(): void {
    if (!this.isRetryableError()) return;
    this.start();
  }

  /**
   * FE-2 (Defect 2): abort an in-flight compose upload / generation poll and
   * return to the compose form (inputs preserved). Turns the forever-spinner of
   * a severed or black-holed upload into an escapable, re-editable state.
   */
  /**
   * Generations the author can jump back to: everything the registry is
   * tracking except the one already on screen. This is the escape hatch that
   * makes {@link startAnother} safe - leaving a batch is only reasonable if
   * there is a visible way back to it.
   */
  readonly resumableJobs = computed<readonly TrackedJob[]>(() => {
    const attached = this.attachedJobId();
    return this.jobRegistry.jobs().filter((j) => j.jobId !== attached);
  });

  /** Human label for a resume row: running vs finished vs failed. */
  resumableStatusKey(entry: TrackedJob): string {
    if (entry.phase === 'running') {
      return 'aplus.unified_authoring.resume_running';
    }
    return entry.phase === 'error'
      ? 'aplus.unified_authoring.resume_failed'
      : 'aplus.unified_authoring.resume_ready';
  }

  /**
   * Leave the current generation running and go back to an empty compose form
   * so a second batch can be started. Deliberately does NOT release the job -
   * that is {@link cancelDispatch}. The abandoned batch stays in
   * {@link resumableJobs} so the author can return to it.
   */
  startAnother(): void {
    this.detach();
    this.composeState.set({ status: 'idle' });
  }

  /** Jump back to a tracked generation from the resume list. */
  resumeJob(jobId: string): void {
    const tracked = this.jobRegistry.entry(jobId)();
    if (!tracked) return;
    this.composeState.set({ status: 'idle' });
    this.attachTo(jobId, { syncUrl: true });
    this.applyTracked(tracked);
  }

  /** Forget a tracked generation from the resume list without opening it. */
  dismissJob(jobId: string): void {
    this.jobRegistry.release(jobId);
  }

  cancelDispatch(): void {
    this.cancel$.next();
    // Cancel is an explicit abandon, so stop tracking too - otherwise the
    // registry keeps polling a job the author walked away from on purpose and
    // it would re-attach on the next visit.
    const jobId = this.attachedJobId();
    if (jobId) this.jobRegistry.release(jobId);
    this.detach();
    this.composeState.set({ status: 'idle' });
  }

  /** Drop the screen's attachment and clear `?job=` from the URL. */
  private detach(): void {
    if (!this.attachedJobId()) return;
    this.attachedJobId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { job: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Hand the job to the route-independent registry and attach this screen to
   * it. The registry owns the polling from here, so navigating away no longer
   * kills the generation or loses the job id; coming back re-attaches through
   * {@link reattachTrackedJob}.
   */
  private startPolling(
    atomId: string,
    job: QuestionGenerationJob,
    manual: boolean,
  ): void {
    this.jobRegistry.track(atomId, job.job_id, manual, job);
    this.attachTo(job.job_id, { syncUrl: true, atomId });
    if (this.isTerminalJobStatus(job.status)) {
      this.handleTerminal(atomId, job, manual);
      return;
    }
    this.composeState.set({ status: 'polling', job, atomId });
  }

  /**
   * Point this screen at a tracked job and stamp `?job=` on the URL so the
   * browser back button, a deep link and a reload all land back on it.
   */
  private attachTo(
    jobId: string,
    opts: { syncUrl: boolean; atomId?: string },
  ): void {
    this.attachedJobId.set(jobId);
    if (!opts.syncUrl) return;
    const atomId =
      opts.atomId ?? this.jobRegistry.entry(jobId)()?.atomId ?? null;
    void this.router.navigate([], {
      relativeTo: this.route,
      // `atom` rides along because the job-status endpoint is nested under the
      // atom, so `?job=` ALONE is not enough to resolve a job this browser
      // session never tracked. Without it a deep link into a generation (a
      // bookmark, a link from support, a hand-recovered job) silently landed
      // on an empty compose form.
      queryParams: { job: jobId, ...(atomId ? { atom: atomId } : {}) },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * On mount, re-attach to a generation the author left behind: the `?job=`
   * query param first, else the newest job the registry is tracking. This is
   * the return half of the litmus test - leave mid-generation, start another
   * batch, come back and still see this one (live progress if it is still
   * running, the result if it finished while you were away).
   */
  private reattachTrackedJob(): void {
    if (this.composeState().status !== 'idle') return;
    const params = this.route.snapshot.queryParamMap;
    const fromUrl = params.get('job');
    const atomFromUrl = params.get('atom');

    // A deep link into a job this session never tracked (a bookmark, a fresh
    // tab, a link handed over after a manual recovery). Adopt it: with the
    // atom id the registry can poll it exactly like one we started ourselves.
    if (fromUrl && atomFromUrl && !this.jobRegistry.entry(fromUrl)()) {
      this.jobRegistry.track(atomFromUrl, fromUrl, false);
    }

    const tracked = fromUrl
      ? (this.jobRegistry.entry(fromUrl)() ?? null)
      : (this.jobRegistry.jobs().at(-1) ?? null);
    if (!tracked) return;
    this.attachTo(tracked.jobId, { syncUrl: !fromUrl });
    // Seed the visible state immediately; the registry effect below keeps it
    // current as polls land (a restored-after-reload entry has job === null
    // until its first poll, which is exactly the "still working" state).
    this.applyTracked(tracked);
  }

  /**
   * Project the registry's view of the attached job onto the screen state.
   * Terminal outcomes route through the existing {@link handleTerminal} so the
   * review seeding, test-set discovery and error copy are unchanged.
   */
  private applyTracked(tracked: TrackedJob): void {
    const status = this.composeState().status;
    // Never stomp a review the author is already working in, or an accept.
    if (status === 'review' || status === 'accepting') return;

    if (tracked.phase === 'error') {
      this.composeState.set({
        status: 'error',
        error: tracked.error ?? 'aplus.unified_authoring.error_failed',
      });
      return;
    }
    if (tracked.phase === 'done' && tracked.job) {
      this.handleTerminal(tracked.atomId, tracked.job, tracked.manual);
      return;
    }
    this.composeState.set({
      status: 'polling',
      job: tracked.job ?? this.placeholderJob(tracked),
      atomId: tracked.atomId,
    });
  }

  /**
   * Minimal job stand-in for a registry entry restored from storage before its
   * first poll returns - keeps the polling view (and its live trace widget)
   * mounted instead of flashing the empty compose form.
   */
  private placeholderJob(tracked: TrackedJob): QuestionGenerationJob {
    return {
      job_id: tracked.jobId,
      atom_id: tracked.atomId,
      job_type: 'batch_source_material',
      status: 'running',
      created_at: new Date(tracked.startedAt).toISOString(),
      updated_at: new Date(tracked.startedAt).toISOString(),
    } as QuestionGenerationJob;
  }

  private handleTerminal(
    atomId: string,
    job: QuestionGenerationJob,
    manual: boolean,
  ): void {
    if (
      job.status === 'failed' ||
      job.status === 'cancelled' ||
      job.status === 'rejected'
    ) {
      this.composeState.set({
        status: 'error',
        error: 'aplus.unified_authoring.error_failed',
      });
      return;
    }
    // succeeded | ready_for_review | accepted | partially_accepted.
    const candidates = manual
      ? []
      : (job.candidate_questions ?? job.drafts ?? []);
    if (!manual && candidates.length === 0) {
      this.composeState.set({
        status: 'error',
        error: 'aplus.unified_authoring.error_no_candidates',
      });
      return;
    }
    // Seed the interleaved review list (U4.3): AI candidates become selected,
    // unedited 'ai' rows ordered by the LLM's proposed test-set order (proposed
    // ids first, remaining appended); a manual session starts empty.
    const proposal = manual ? null : (job.proposed_test_set ?? null);
    const ordered = this.orderByProposal(candidates, proposal);
    this.reviewItems.set(ordered.map((c) => this.aiCandidateToReviewItem(c)));
    // Seed the test-set composer from the proposal so the AI's suggested
    // title / description / per-question points / order are pre-filled (mirrors
    // legacy seedComposer — they were silently dropped before). No proposal
    // (manual session or a no-files ai_draft) leaves the test set off + blank.
    if (proposal) {
      this.testSetEnabled.set(true);
      this.testSetTitle.set(proposal.title ?? '');
      this.testSetDescription.set(proposal.description ?? '');
      const points: Record<string, number> = {};
      for (const c of ordered) {
        points[c.draft_id] = this.clampPoints(
          proposal.points?.[c.draft_id] ?? POINTS_DEFAULT,
        );
      }
      this.pointsByKey.set(points);
    } else {
      this.testSetEnabled.set(false);
      this.testSetTitle.set('');
      this.testSetDescription.set('');
      this.pointsByKey.set({});
    }
    this.testSetDiscovery.set({ status: 'idle' });
    this.composeState.set({ status: 'review', job, atomId, manual });
  }

  /** Order candidates by the proposal's order (proposed ids first, in proposal
   *  order; remaining candidates appended). No proposal ⇒ original order. */
  private orderByProposal(
    candidates: readonly QuestionDraftCandidate[],
    proposal: { readonly order?: readonly string[] } | null,
  ): readonly QuestionDraftCandidate[] {
    const order = proposal?.order;
    if (!order?.length) return candidates;
    const byId = new Map(candidates.map((c) => [c.draft_id, c]));
    const head = order
      .map((id) => byId.get(id))
      .filter((c): c is QuestionDraftCandidate => c !== undefined);
    const headIds = new Set(head.map((c) => c.draft_id));
    const tail = candidates.filter((c) => !headIds.has(c.draft_id));
    return [...head, ...tail];
  }

  /** Discard the current session and return to the compose form. */
  reset(): void {
    // Starting over is an explicit "I am done with that batch", so stop
    // tracking it. Without this the canvas would re-attach to the finished
    // review on the next visit and the author could never reach a blank form
    // again (the mirror of the CHO-2387 defect, in the terminal state).
    const jobId = this.attachedJobId();
    if (jobId) this.jobRegistry.release(jobId);
    this.detach();
    this.composeState.set({ status: 'idle' });
    this.acceptError.set(null);
    this.sourceFiles.set([]);
    this.fileError.set(null);
    this.rubricFile.set(null);
    this.rubricError.set(null);
    this.reviewItems.set([]);
    this.testSetEnabled.set(false);
    this.testSetTitle.set('');
    this.testSetDescription.set('');
    this.pointsByKey.set({});
    this.testSetDiscovery.set({ status: 'idle' });
    this.doneState.set({ status: 'idle' });
    this.sharePanelOpen.set(false);
    this.shareState.set({ status: 'idle' });
    this.shareCaption.set('');
  }

  // ── Share to C+ ─────────────────────────────────────────────────────

  toggleSharePanel(): void {
    this.sharePanelOpen.update((v) => !v);
    if (!this.sharePanelOpen()) {
      this.shareState.set({ status: 'idle' });
    }
  }

  shareAtom(): void {
    const ds = this.doneState();
    if (ds.status !== 'done') return;
    this.shareState.set({ status: 'submitting' });
    this.service
      .shareAtom(ds.atomId, {
        license_terms: this.shareLicense(),
        caption: this.shareCaption().trim() || undefined,
        royalty_rate: this.isRoyaltyLicense()
          ? { kind: this.shareLicense() === 'royalty_pct' ? 'pct' : 'fixed_per_use', value: this.shareRoyaltyRate() }
          : null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.shareState.set({ status: 'success' }),
        error: (err: unknown) => {
          const e = err as { status?: number };
          let key = 'aplus.unified_authoring.share.error_generic';
          if (e?.status === 412) key = 'aplus.unified_authoring.share.error_not_published';
          else if (e?.status === 403) key = 'aplus.unified_authoring.share.error_not_owner';
          else if (e?.status && e.status >= 500) key = 'aplus.unified_authoring.share.error_upstream';
          this.shareState.set({ status: 'error', error: key });
        },
      });
  }

  dismissDone(): void {
    this.reset();
  }

  // ── Review-list handlers (U4.3) ───────────────────────────────────
  /** Map an AI draft candidate into a selected, unedited 'ai' review row. */
  private aiCandidateToReviewItem(c: QuestionDraftCandidate): UnifiedReviewItem {
    return {
      kind: 'ai',
      draftId: c.draft_id,
      candidate: c,
      edit: this.candidateToEditable(c),
      selected: true,
      edited: false,
    };
  }

  /** Generated candidate → the editor's editable shape (deep-ish copy). */
  private candidateToEditable(c: QuestionDraftCandidate): EditableQuestion {
    return {
      question_type: c.type === 'oe' ? 'oe' : 'mcq',
      prompt: c.prompt ?? '',
      options: (c.mcq_payload?.options ?? []).map((o) => ({
        option_id: o.option_id || null,
        label: o.label ?? '',
        is_correct: o.is_correct === true,
        explainer: o.explainer ?? '',
      })),
      model_answer: c.oe_payload?.model_answer ?? '',
    };
  }

  /** Stable row key — AI draftId or manual tempId. */
  private keyOf(item: UnifiedReviewItem): string {
    return item.kind === 'ai' ? item.draftId : item.tempId;
  }

  onToggleSelect(key: string): void {
    // FE-1 (#3): a selection change is the author fixing → drop the stale alert.
    this.acceptError.set(null);
    this.reviewItems.set(
      this.reviewItems().map((i) =>
        this.keyOf(i) === key ? { ...i, selected: !i.selected } : i,
      ),
    );
  }

  onEditItem(e: { key: string; edit: EditableQuestion }): void {
    // FE-1 (#3): an inline edit is the author fixing → drop the stale alert.
    this.acceptError.set(null);
    this.reviewItems.set(
      this.reviewItems().map((i) => {
        if (this.keyOf(i) !== e.key) return i;
        // AI rows flip `edited` so the builder emits overrides only on change;
        // manual rows carry their body verbatim.
        return i.kind === 'ai'
          ? { ...i, edit: e.edit, edited: true }
          : { ...i, edit: e.edit };
      }),
    );
  }

  onTitleChange(e: { key: string; title: string }): void {
    this.reviewItems.set(
      this.reviewItems().map((i) =>
        this.keyOf(i) === e.key ? { ...i, titleOverride: e.title } : i,
      ),
    );
  }

  onAddManual(type: 'mcq' | 'oe'): void {
    this.reviewItems.set([
      ...this.reviewItems(),
      manualRowToReviewItem(newManualRow(type)),
    ]);
  }

  onRemoveManual(tempId: string): void {
    this.reviewItems.set(
      this.reviewItems().filter(
        (i) => !(i.kind === 'manual' && i.tempId === tempId),
      ),
    );
  }

  /** Select-all / deselect-all the review rows (GAP #10). */
  onToggleAll(): void {
    const items = this.reviewItems();
    const allSelected = items.length > 0 && items.every((i) => i.selected);
    this.reviewItems.set(items.map((i) => ({ ...i, selected: !allSelected })));
  }

  /** Drag-reorder a review row; the accept builder commits in array order so
   *  reordering `reviewItems` directly IS the commit order (GAP #11). */
  onReorder(e: { from: number; to: number }): void {
    const { from, to } = e;
    if (from === to) return;
    const next = [...this.reviewItems()];
    if (from < 0 || from >= next.length || to < 0 || to >= next.length) return;
    moveItemInArray(next, from, to);
    this.reviewItems.set(next);
  }

  onSetTestSetEnabled(enabled: boolean): void {
    this.testSetEnabled.set(enabled);
  }

  onSetTestSetTitle(title: string): void {
    this.testSetTitle.set(title);
  }

  onSetTestSetDescription(description: string): void {
    this.testSetDescription.set(description);
  }

  /** Set a row's test-set points, clamped to [1..100] (GAP #12). */
  onPointsChange(e: { key: string; points: number }): void {
    this.pointsByKey.set({
      ...this.pointsByKey(),
      [e.key]: this.clampPoints(e.points),
    });
  }

  private clampPoints(value: number): number {
    if (!Number.isFinite(value)) return POINTS_MIN;
    return Math.max(POINTS_MIN, Math.min(POINTS_MAX, Math.round(value)));
  }

  /**
   * Commit the selected rows in one accept → one atom each. AI drafts charge
   * 10/20 per accepted question; inline manual rows are free (source_type=
   * manual). The first accepted candidate reuses the route atom server-side.
   */
  onAccept(): void {
    const s = this.composeState();
    if (s.status !== 'review' || !this.canAccept()) return;
    const { job, atomId, manual } = s;
    // FE-1 (#3): clear any prior accept error so a retry starts clean.
    this.acceptError.set(null);
    // Capture BEFORE the state flip — the done-state discovery poll only runs
    // when the author asked for a test set (GAP #14).
    const composeTestSet = this.testSetEnabled();
    const request = buildAcceptRequest(this.reviewItems(), this.testSetConfig());
    this.composeState.set({ status: 'accepting', job, atomId, manual });
    this.service
      .acceptGenerationJob(atomId, job.job_id, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const created =
            res.persisted?.length ?? request.accepted_candidates.length;
          this.toast.show(this.successMessage(created), 'success');
          this.reset();
          this.doneState.set({ status: 'done', atomId, created });
          // chora-delivery assembles the DRAFT test set off the
          // question_batch.accepted.v1 event — discover it in the background and
          // deep-link the editor when ready (toast on timeout).
          if (composeTestSet) {
            this.toast.show(
              this.translate.instant(
                'aplus.unified_authoring.test_set_assembling',
              ),
              'info',
            );
            this.pollTestSetLoop(job.job_id, 0);
          }
        },
        // FE-1 (#3): a 4xx/5xx accept failure (400/422 validation, 402 mana,
        // 5xx) PRESERVES the review for fix-and-retry — restore the SAME
        // {job, atomId, manual} review state and surface the error inline (by
        // the accept CTA) instead of flipping to 'error', which renders the
        // compose form and discards every generated candidate.
        error: (err) => {
          this.acceptError.set(this.errorKey(err));
          this.composeState.set({ status: 'review', job, atomId, manual });
        },
      });
  }

  /**
   * Commit a hand-authored session (CHO-1826 review B). In manual mode the rows
   * are FE-only until now; on accept we mint the host atom (type derived from the
   * first selected row), open a manual job, then accept the inline candidates in
   * ONE chain. No test set (manual rows have no draft_id). The `submitting`
   * spinner covers the chain; a 4xx/5xx failure returns to the idle authoring
   * surface with the rows + an inline error PRESERVED (FE-1 fix-and-retry
   * parity), never discarding the author's work.
   */
  onManualAccept(): void {
    if (!this.canAcceptManual()) return;
    const items = this.reviewItems();
    const firstSelected = items.find((i) => i.selected);
    const firstType = firstSelected?.edit.question_type ?? 'mcq';
    const atomType = firstType === 'mcq' ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER';
    // No session "name": each hand-authored row is its own atom, titled by its
    // own prompt (or the row's optional atom-title override). The host atom —
    // reused for the first accepted candidate — takes that first prompt as its
    // title/stem (CHO-1826 review: the author isn't committing to a test set).
    const firstPrompt =
      firstSelected?.edit.prompt.trim() || 'Untitled question';
    // Inline-only accept request — the manual path never assembles a test set.
    const request = buildAcceptRequest(items, {
      enabled: false,
      title: '',
      description: '',
      pointsByKey: {},
    });
    this.acceptError.set(null);
    this.composeState.set({ status: 'submitting' });
    this.service
      .createAtom({
        atom_type: atomType,
        stem: firstPrompt,
        title: firstPrompt,
        locale: 'en',
        cognitive_level: toWireCognitiveLevel(this.cognitiveLevel()),
        difficulty: this.difficulty(),
      })
      .pipe(
        switchMap(({ atomId }) =>
          this.service
            .createManualJob(atomId)
            .pipe(map((job) => ({ atomId, job }))),
        ),
        switchMap(({ atomId, job }) =>
          this.service
            .acceptGenerationJob(atomId, job.job_id, request)
            .pipe(map((res) => ({ res, atomId }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ res, atomId }) => {
          const created =
            res.persisted?.length ?? request.accepted_candidates.length;
          this.toast.show(this.successMessage(created), 'success');
          this.reset();
          this.doneState.set({ status: 'done', atomId, created });
        },
        error: (err) => {
          this.acceptError.set(this.errorKey(err));
          this.composeState.set({ status: 'idle' });
        },
      });
  }

  /**
   * Toast copy for a successful accept — singular/plural aware ("1 learning
   * atom" vs "N learning atoms"). TranslateService.instant takes no params, so
   * the count is spliced into the plural string here.
   */
  private successMessage(created: number): string {
    if (created === 1) {
      return this.translate.instant('aplus.unified_authoring.created_toast_one');
    }
    return this.translate
      .instant('aplus.unified_authoring.created_toast_other')
      .replace('{count}', String(created));
  }

  /**
   * Discovery poll (GAP #14): GET /api/v1/test-sets?source_job_id={job_id}
   * every 2s for ≤30s. Transport errors are non-fatal (keep polling). A hit
   * deep-links the test-set editor; the window exhausting shows a NON-blocking
   * toast + an inline list-link (the done state stays fully usable).
   */
  private pollTestSetLoop(jobId: string, attempt: number): void {
    if (attempt >= TEST_SET_POLL_MAX_ATTEMPTS) {
      this.testSetDiscovery.set({ status: 'timeout' });
      this.toast.show(
        this.translate.instant('aplus.unified_authoring.test_set_timeout_toast'),
        'info',
      );
      return;
    }
    timer(TEST_SET_POLL_INTERVAL_MS)
      .pipe(
        switchMap(() =>
          this.testSetService
            .listTestSets({ source_job_id: jobId })
            .pipe(catchError(() => of(null))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        const found = res?.items?.[0];
        if (found) {
          this.testSetDiscovery.set({
            status: 'found',
            testSetId: found.test_set_id,
          });
          void this.router.navigate([
            '/a/studio/test-sets',
            found.test_set_id,
            'edit',
          ]);
          return;
        }
        this.pollTestSetLoop(jobId, attempt + 1);
      });
  }

  // ── Per-image regenerate (U4.3c — mirrors batch-authoring) ─────────
  private regenKey(draftId: string, placement: ImagePlacement): string {
    return `${draftId}|${placement}`;
  }

  private setRegen(
    draftId: string,
    placement: ImagePlacement,
    value: { regenerating: boolean; error: string | null },
  ): void {
    this._regen.set({
      ...this._regen(),
      [this.regenKey(draftId, placement)]: value,
    });
  }

  /**
   * Map a terminal, non-succeeded image-regen job to its inline error key.
   * ADR-210 D3 fail-loud: when the ORIGINAL image is gone (transient GC'd /
   * deleted / IAM), chora-creation refuses the regen and surfaces it as a
   * failed question-job whose `error` (alias `failure_reason`) carries the
   * reason token `image_regen_original_unavailable` (see chora-creation
   * ai_assist_terminal_subscriber.tryQuestionJobRefused: msg = "<reason>[:
   * <user message>]"). That case gets an EXPLICIT "regenerate from scratch"
   * message so the author never mistakes it for a transient glitch; every
   * other failure keeps the generic copy.
   */
  private regenFailureKey(job: QuestionGenerationJob): string {
    const reason = `${job.error ?? job.failure_reason ?? ''}`;
    if (reason.includes('image_regen_original_unavailable')) {
      return 'aplus.unified_authoring.error_original_unavailable';
    }
    return 'aplus.unified_authoring.error_failed';
  }

  /**
   * Kick off a single image regenerate for (draftId, placement) using the
   * author's refined prompt. No-op when not in `review` or the prompt is blank.
   * Charges per-image mana on the BE (402 → inline error). On success the
   * targeted AI row's image swaps in place — selection / order / edits (all
   * keyed by draftId) are preserved and the review session stays open.
   */
  onRegenImage(e: {
    draftId: string;
    placement: 'stem' | 'answer';
    prompt: string;
  }): void {
    const s = this.composeState();
    if (s.status !== 'review') return;
    const prompt = e.prompt.trim();
    if (!prompt) return;
    const { job, atomId } = s;
    this.setRegen(e.draftId, e.placement, { regenerating: true, error: null });
    this.service
      .regenerateImage(
        atomId,
        job.job_id,
        { draft_id: e.draftId, placement: e.placement, prompt },
        this.newId(),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (regenJob) =>
          this.pollImageRegen(
            atomId,
            e.draftId,
            e.placement,
            regenJob.job_id,
            0,
          ),
        error: (err) =>
          this.setRegen(e.draftId, e.placement, {
            regenerating: false,
            error: this.errorKey(err),
          }),
      });
  }

  private pollImageRegen(
    atomId: string,
    draftId: string,
    placement: ImagePlacement,
    jobId: string,
    attempt: number,
  ): void {
    if (attempt >= IMAGE_REGEN_POLL_MAX_ATTEMPTS) {
      this.setRegen(draftId, placement, {
        regenerating: false,
        error: 'aplus.unified_authoring.error_generic',
      });
      return;
    }
    timer(this.backoffMs(attempt))
      .pipe(
        switchMap(() => this.service.pollGenerationJob(atomId, jobId)),
        catchError((err) => of({ __error: err } as { __error: unknown })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res && typeof res === 'object' && '__error' in res) {
          this.setRegen(draftId, placement, {
            regenerating: false,
            error: this.errorKey((res as { __error: unknown }).__error),
          });
          return;
        }
        const regenJob = res as QuestionGenerationJob;
        if (!this.isTerminalJobStatus(regenJob.status)) {
          this.pollImageRegen(atomId, draftId, placement, jobId, attempt + 1);
          return;
        }
        if (regenJob.status !== 'succeeded') {
          this.setRegen(draftId, placement, {
            regenerating: false,
            error: this.regenFailureKey(regenJob),
          });
          return;
        }
        // The chora-creation terminal stamps the 1-element patch
        // [{draft_id, placement, image_url}] regardless of slot — the new url
        // always rides `image_url`; swapImage routes it to the right field.
        const url = regenJob.candidate_questions?.[0]?.image_url;
        if (!url) {
          this.setRegen(draftId, placement, {
            regenerating: false,
            error: 'aplus.unified_authoring.error_generic',
          });
          return;
        }
        this.swapImage(draftId, placement, url);
        this.setRegen(draftId, placement, { regenerating: false, error: null });
      });
  }

  /**
   * Splice the regenerated url onto the targeted AI review row's candidate, in
   * place (immutable map). The review-list renders each row's stem/answer image
   * from its `candidate`, so updating it here re-emits the row; selection /
   * edits / order (keyed by draftId) are untouched.
   */
  private swapImage(
    draftId: string,
    placement: ImagePlacement,
    url: string,
  ): void {
    this.reviewItems.set(
      this.reviewItems().map((item) =>
        item.kind === 'ai' && item.draftId === draftId
          ? {
              ...item,
              candidate:
                placement === 'answer'
                  ? { ...item.candidate, answer_image_url: url }
                  : { ...item.candidate, image_url: url },
            }
          : item,
      ),
    );
  }

  // ── Helpers (mirror batch-authoring.component.ts) ──────────────────
  private clampAiCount(count: number): number {
    if (!Number.isFinite(count)) return MIN_AI_COUNT;
    return Math.min(MAX_AI_COUNT, Math.max(MIN_AI_COUNT, Math.trunc(count)));
  }

  private isTerminalJobStatus(status: QuestionGenerationJob['status']): boolean {
    return (
      // Live backend terminals.
      status === 'succeeded' ||
      status === 'failed' ||
      status === 'accepted' ||
      status === 'partially_accepted' ||
      status === 'cancelled' ||
      // Legacy aliases.
      status === 'ready_for_review' ||
      status === 'rejected'
    );
  }

  private backoffMs(attempt: number): number {
    return POLL_BACKOFF_MS[Math.min(attempt, POLL_BACKOFF_MS.length - 1)];
  }

  private newId(): string {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (e?.status === 402) return 'aplus.unified_authoring.error_insufficient_mana';
    if (typeof e?.status === 'number') {
      if (e.status === 422 || e.status === 400)
        return 'aplus.unified_authoring.error_validation';
      if (e.status >= 500) return 'aplus.unified_authoring.error_upstream';
      if (e.status === 401 || e.status === 403)
        return 'aplus.unified_authoring.error_unauthorised';
    }
    return 'aplus.unified_authoring.error_generic';
  }
}
