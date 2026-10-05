/**
 * RPlusAssessmentAuthoringComponent — R+ assessment-authoring (CHO-2122, ADR-232).
 *
 * DDD: question authoring is a CONTENT CREATION capability — R+ is only the
 * surface entry point. Per ADR-232 this entry is RE-HOMED onto the shared
 * unified compose canvas: it REUSES the shared review + accept units the A+ U4
 * canvas is built from — `chora-unified-review-list` (the entire interleaved
 * review/accept/test-set/manual UI), `buildAcceptRequest` (the accept body incl.
 * the `test_set` block), `previewAcceptMana`, the manual-row helpers, and the
 * `UnifiedReviewItem` / `UnifiedTestSetConfig` models — instead of the bespoke
 * ~450-line poll/review/accept state-machine it used to carry. That retires the
 * one genuine duplication ADR-232 targets AND drops R+'s source-file-only limit,
 * bringing prompt-only (ai_draft) + by-hand (manual) parity with A+.
 *
 * WHY NOT embed `unified-atom-authoring.component.ts` wholesale: that A+ canvas
 * hard-couples an A+ authoring sub-nav (RouterLinks to `/a/...`), the
 * `surface-aplus` accent, atom-creation-framed `aplus.unified_authoring.*` copy,
 * and a done-state deep-link into the A+ test-set editor — none of which belong
 * on the R+ surface (bouncing an instructor to `chora.site` is the exact
 * integrative-UI harm ADR-232 rejected Option C to avoid). Reusing the shared
 * COMPONENTS + pure builders is ADR-232's "shared-component embedding, not a
 * copied canvas": R+ keeps only a thin surface shell (R+ chrome/route/gate + the
 * compose form + a createAtom→generate→poll dispatch) and copies no orchestration.
 *
 * R+ KEEPS its route + `assessment:author` gate (route config, untouched) and —
 * critically — its `test_set`-on-accept assemble step: an author-fresh accept
 * carries a curated `test_set` block so chora-delivery assembles ONE DRAFT
 * TestSet referencing the authored atoms by UUID (atom-centric; Delivery never
 * owns atoms). Author-fresh is R+'s SECONDARY path (assemble-from-QuestionBank,
 * FE-2, is the primary front-door).
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
import { of, timer, catchError, map, switchMap } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ChoraFileDropzoneComponent } from '../../../../shared/components/chora-file-dropzone/chora-file-dropzone.component';
import { QuestionBatchGeneratorComponent } from '../../../../shared/components/question-batch-generator/question-batch-generator.component';
import type {
  ComposerQuestionType,
  QuestionBatchPlan,
} from '../../../../shared/components/question-batch-generator/question-batch-generator.model';
import {
  validateEditableQuestion,
  type EditableQuestion,
} from '../../../../shared/components/chora-question-editor/chora-question-editor.model';
import { AtomAuthoringService } from '../../aplus/atom-authoring/atom-authoring.service';
import {
  COGNITIVE_LEVELS,
  toDifficultyBucket,
  toWireCognitiveLevel,
} from '../../aplus/atom-authoring/atom-authoring.model';
import type {
  CognitiveLevel,
  ImagePlacement,
  QuestionDraftCandidate,
  QuestionGenerationJob,
} from '../../aplus/atom-authoring/atom-authoring.model';
import { UnifiedReviewListComponent } from '../../aplus/atom-authoring/unified/unified-review-list.component';
import { buildAcceptRequest } from '../../aplus/atom-authoring/unified/unified-accept.builder';
import { previewAcceptMana } from '../../aplus/atom-authoring/unified/unified-mana.preview';
import {
  manualRowToReviewItem,
  newManualRow,
} from '../../aplus/atom-authoring/unified/unified-manual';
import type {
  ManaPreview,
  UnifiedReviewItem,
  UnifiedTestSetConfig,
} from '../../aplus/atom-authoring/unified/unified-review.model';

/** ZONE-1 authoring mode — AI generation vs hand-authoring (parity with A+). */
export type ComposeMode = 'ai' | 'manual';
/** ZONE-2 grounding mode (AI-with-files path only). */
export type GroundingMode = 'strict' | 'starting_point';

/**
 * Thin surface-shell state machine for the compose → poll → review → accept
 * flow. `polling`/`review`/`accepting` carry the host `atomId` so the poll loop
 * + accept resolve it without re-reading. The heavy review/accept logic is NOT
 * here — it lives in the reused shared units. Manual (by-hand) commits straight
 * from the idle compose surface via `onManualAccept` (never through the poll).
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
    }
  | {
      readonly status: 'accepting';
      readonly job: QuestionGenerationJob;
      readonly atomId: string;
    }
  | { readonly status: 'done'; readonly created: number }
  | { readonly status: 'error'; readonly error: string };

/** Source-material constraints — mirror the BE allowlist + 32MB cap. */
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
/** Ceiling on poll attempts before declaring a stuck job (fail-loud). */
const POLL_MAX_ATTEMPTS = 60;
/** A single image render is fast — a tighter cap on the regen poll. */
const IMAGE_REGEN_POLL_MAX_ATTEMPTS = 30;
/** ai_draft candidate count is bounded 1..5 on the no-files path. */
const MIN_AI_COUNT = 1;
const MAX_AI_COUNT = 5;
/** Test-set-scoped points bounds + R+ uniform default (marks-per-question). */
const POINTS_MIN = 1;
const POINTS_MAX = 100;
const POINTS_DEFAULT = 10;

@Component({
  selector: 'chora-rplus-assessment-authoring',
  standalone: true,
  imports: [
    TranslatePipe,
    ChoraFileDropzoneComponent,
    QuestionBatchGeneratorComponent,
    UnifiedReviewListComponent,
  ],
  templateUrl: './assessment-authoring.component.html',
  styleUrl: './assessment-authoring.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RPlusAssessmentAuthoringComponent {
  private readonly service = inject(AtomAuthoringService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Compose ZONE 1 (always visible) ───────────────────────────────
  readonly mode = signal<ComposeMode>('ai');
  /** The assessment topic — atom title + AI seed. */
  readonly topic = signal<string>('');
  /** Optional free-text "instructions for the AI" body. */
  readonly contextBody = signal<string>('');
  readonly cognitiveLevel = signal<CognitiveLevel>('applying');
  readonly difficulty = signal<1 | 2 | 3 | 4 | 5>(3);
  /** Latest mixed-type plan from the shared composer (gates `canStart`). */
  readonly batchPlan = signal<QuestionBatchPlan | null>(null);

  readonly cognitiveLevels = COGNITIVE_LEVELS;
  readonly allowedComposerTypes: readonly ComposerQuestionType[] = ['mcq', 'oe'];
  readonly acceptAttr = ALLOWED_EXTENSIONS.join(',');

  // ── Compose ZONE 2 (mode === 'ai' only) ───────────────────────────
  readonly sourceFiles = signal<readonly File[]>([]);
  readonly fileError = signal<string | null>(null);
  readonly groundingMode = signal<GroundingMode>('starting_point');

  // ── Flow state ────────────────────────────────────────────────────
  readonly composeState = signal<ComposeState>({ status: 'idle' });
  /**
   * The last accept-time failure key (or null). On a 4xx/5xx accept error we
   * KEEP the review — so the author keeps every generated candidate and does NOT
   * re-generate + re-pay accept-time mana — and surface this inline by the accept
   * CTA instead of flipping to the 'error' state (which renders the compose form
   * and destroys the review). Cleared on any edit/selection change + a retry.
   */
  readonly acceptError = signal<string | null>(null);

  // ── Review working state (reused shared units) ────────────────────
  readonly reviewItems = signal<readonly UnifiedReviewItem[]>([]);
  /** Lane 1c — assemble the accepted atoms into a DRAFT test set (the R+
   *  assessment). Seeded ON for a ≥2-question author-fresh review. */
  readonly testSetEnabled = signal<boolean>(false);
  readonly testSetTitle = signal<string>('');
  readonly testSetDescription = signal<string>('');
  /** Per-row test-set points, keyed by AI draftId. */
  readonly pointsByKey = signal<Readonly<Record<string, number>>>({});

  // ── Per-image regenerate ──────────────────────────────────────────
  private readonly _regen = signal<
    Readonly<Record<string, { regenerating: boolean; error: string | null }>>
  >({});
  readonly regenState = this._regen.asReadonly();

  // ── Derived view helpers ──────────────────────────────────────────
  /** Start gate: idle/error AND AI mode AND a topic AND a valid plan AND no file
   *  error. Files are OPTIONAL even in AI mode (no files ⇒ the ai_draft path). */
  readonly canStart = computed<boolean>(() => {
    const status = this.composeState().status;
    const idle = status === 'idle' || status === 'error';
    const plan = this.batchPlan();
    return (
      idle &&
      this.mode() === 'ai' &&
      this.topic().trim().length > 0 &&
      (plan?.valid ?? false) &&
      this.fileError() === null
    );
  });

  readonly isWorking = computed<boolean>(() => {
    const s = this.composeState().status;
    return s === 'submitting' || s === 'polling';
  });

  readonly errorMessage = computed<string | null>(() => {
    const s = this.composeState();
    return s.status === 'error' ? s.error : null;
  });

  readonly createdCount = computed<number>(() => {
    const s = this.composeState();
    return s.status === 'done' ? s.created : 0;
  });

  /** Indicative accept-time mana over the SELECTED review rows (shared tally). */
  readonly manaPreview = computed<ManaPreview>(() =>
    previewAcceptMana(this.reviewItems()),
  );

  /** Author-curated test-set config passed to the shared accept builder. */
  readonly testSetConfig = computed<UnifiedTestSetConfig>(() => ({
    enabled: this.testSetEnabled(),
    title: this.testSetTitle(),
    description: this.testSetDescription(),
    pointsByKey: this.pointsByKey(),
  }));

  /** A topic test set needs ≥2 questions (ADR-195 D4). Only selected AI rows
   *  carry a draft_id, so only they can populate a test set. */
  readonly canAssembleTestSet = computed<boolean>(
    () =>
      this.reviewItems().filter((i) => i.kind === 'ai' && i.selected).length >=
      2,
  );

  /** AI-review accept gate: in review, ≥1 selected, every selected edit valid,
   *  and — when the test-set toggle is on — a non-empty title AND ≥2 AI rows. */
  readonly canAccept = computed<boolean>(() => {
    if (this.composeState().status !== 'review') return false;
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

  /** By-hand accept gate: manual mode, ≥1 selected row, every selected edit
   *  valid. No test-set branch (manual rows carry no draft_id). */
  readonly canAcceptManual = computed<boolean>(() => {
    if (this.mode() !== 'manual') return false;
    const selected = this.reviewItems().filter((i) => i.selected);
    if (selected.length === 0) return false;
    return selected.every((i) => validateEditableQuestion(i.edit).valid);
  });

  readonly acceptBusy = computed<boolean>(
    () => this.composeState().status === 'accepting',
  );

  // ── ZONE-1 handlers ───────────────────────────────────────────────
  onModeChange(mode: ComposeMode): void {
    this.mode.set(mode);
    this.acceptError.set(null);
  }

  onTopicInput(value: string): void {
    this.topic.set(value);
  }

  onContextBodyInput(value: string): void {
    this.contextBody.set(value);
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

  onSourceFilesAdded(files: readonly File[]): void {
    this.addSourceFiles(files);
  }

  removeSourceFile(index: number): void {
    this.sourceFiles.set(this.sourceFiles().filter((_, i) => i !== index));
    this.fileError.set(null);
  }

  private addSourceFiles(incoming: readonly File[]): void {
    if (incoming.length === 0) return;
    const merged = [...this.sourceFiles()];
    for (const f of incoming) {
      if (!merged.some((e) => e.name === f.name && e.size === f.size)) {
        merged.push(f);
      }
    }
    if (merged.length > MAX_SOURCE_FILES) {
      this.fileError.set('rplus.assessment_authoring.error_too_many_files');
      return;
    }
    if (merged.some((f) => !this.hasAllowedExtension(f))) {
      this.fileError.set('rplus.assessment_authoring.error_unsupported_type');
      return;
    }
    if (merged.reduce((sum, f) => sum + f.size, 0) > MAX_FILE_BYTES) {
      this.fileError.set('rplus.assessment_authoring.error_total_too_large');
      return;
    }
    this.fileError.set(null);
    this.sourceFiles.set(merged);
  }

  private hasAllowedExtension(file: File): boolean {
    const lower = file.name.toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  // ── Start → (ai_draft | batch) → poll → review (AI only) ──────────
  start(): void {
    if (!this.canStart()) return;
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
    const sources = this.sourceFiles();

    // Fail-loud: the no-files ai_draft path can only dispatch ONE question type,
    // so a mixed plan with no source material would silently drop all but the
    // first row. Refuse — the author must add source material for a mixed batch.
    if (sources.length === 0 && typePlan.length > 1) {
      this.composeState.set({
        status: 'error',
        error: 'rplus.assessment_authoring.error_validation',
      });
      return;
    }

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
            // AI seed (no source material) → single-type ai_draft path.
            return this.service
              .generateQuestionJob(
                atomId,
                {
                  job_type: 'ai_draft',
                  question_type: firstType,
                  prompt: this.buildContext(),
                  count: this.clampAiCount(firstCount),
                  difficulty: this.difficulty(),
                  ...(typePlan[0]?.image_for_stem
                    ? { image_for_stem: true }
                    : {}),
                  ...(typePlan[0]?.image_for_answer
                    ? { image_for_answer: true }
                    : {}),
                  metadata: this.buildAiMetadata(),
                },
                this.newId(),
              )
              .pipe(map((job) => ({ atomId, job })));
          }
          // AI grounded in uploaded material → batch_source_material path.
          const fileFields =
            sources.length === 1
              ? { file: sources[0] }
              : { files: sources };
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
                metadata: this.buildAiMetadata(),
              },
              this.newId(),
            )
            .pipe(map((job) => ({ atomId, job })));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ atomId, job }) => this.startPolling(atomId, job),
        error: (err) =>
          this.composeState.set({ status: 'error', error: this.errorKey(err) }),
      });
  }

  /** Combined LLM hint — topic + optional context body (blank-filtered). */
  private buildContext(): string {
    return [this.topic().trim(), this.contextBody().trim()]
      .filter((s) => s.length > 0)
      .join('\n\n');
  }

  /** Author hint map (subject / cognitive_level / difficulty) — conditions the
   *  qgen crew AND surfaces as ADR-197 prompt_conditions in O+. */
  private buildAiMetadata(): Readonly<Record<string, string>> {
    const subject = this.topic().trim();
    return {
      ...(subject ? { subject } : {}),
      cognitive_level: toWireCognitiveLevel(this.cognitiveLevel()),
      difficulty: toDifficultyBucket(this.difficulty()),
    };
  }

  private startPolling(atomId: string, job: QuestionGenerationJob): void {
    if (this.isTerminalJobStatus(job.status)) {
      this.handleTerminal(atomId, job);
      return;
    }
    this.composeState.set({ status: 'polling', job, atomId });
    this.pollLoop(atomId, job.job_id, 0);
  }

  private pollLoop(atomId: string, jobId: string, attempt: number): void {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      this.composeState.set({
        status: 'error',
        error: 'rplus.assessment_authoring.error_generic',
      });
      return;
    }
    const last = this.composeState();
    const serverHint =
      last.status === 'polling' ? last.job.poll_after_ms : undefined;
    timer(serverHint ?? this.backoffMs(attempt))
      .pipe(
        switchMap(() => this.service.pollGenerationJob(atomId, jobId)),
        catchError((err) => of({ __error: err } as { __error: unknown })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res && typeof res === 'object' && '__error' in res) {
          this.composeState.set({
            status: 'error',
            error: this.errorKey((res as { __error: unknown }).__error),
          });
          return;
        }
        const job = res as QuestionGenerationJob;
        if (this.isTerminalJobStatus(job.status)) {
          this.handleTerminal(atomId, job);
          return;
        }
        this.composeState.set({ status: 'polling', job, atomId });
        this.pollLoop(atomId, jobId, attempt + 1);
      });
  }

  private handleTerminal(atomId: string, job: QuestionGenerationJob): void {
    if (
      job.status === 'failed' ||
      job.status === 'cancelled' ||
      job.status === 'rejected'
    ) {
      this.composeState.set({
        status: 'error',
        error: 'rplus.assessment_authoring.error_failed',
      });
      return;
    }
    const candidates = job.candidate_questions ?? job.drafts ?? [];
    if (candidates.length === 0) {
      this.composeState.set({
        status: 'error',
        error: 'rplus.assessment_authoring.error_no_candidates',
      });
      return;
    }
    // Seed the shared review list: AI candidates → selected, unedited 'ai' rows
    // in the LLM's proposed order (proposed ids first, remaining appended).
    const proposal = job.proposed_test_set ?? null;
    const ordered = this.orderByProposal(candidates, proposal);
    this.reviewItems.set(ordered.map((c) => this.aiCandidateToReviewItem(c)));
    // R+ author-fresh IS the assemble step: seed the test set ON for a ≥2-question
    // review (title from the proposal or the topic) so the accept carries the
    // `test_set` block by default — chora-delivery then assembles the DRAFT
    // TestSet. A single question can't form a test set (ADR-195 D4 ≥2), so it
    // commits as just the atom.
    const assemblable = ordered.length >= 2;
    this.testSetEnabled.set(assemblable);
    this.testSetTitle.set(
      assemblable
        ? (proposal?.title?.trim() || this.topic().trim() || 'Assessment')
        : '',
    );
    this.testSetDescription.set(proposal?.description ?? '');
    const points: Record<string, number> = {};
    for (const c of ordered) {
      points[c.draft_id] = this.clampPoints(
        proposal?.points?.[c.draft_id] ?? POINTS_DEFAULT,
      );
    }
    this.pointsByKey.set(points);
    this.acceptError.set(null);
    this.composeState.set({ status: 'review', job, atomId });
  }

  /** Order candidates by the proposal (proposed ids first, remaining appended). */
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

  /** Discard the current session → back to the compose form. */
  reset(): void {
    this.composeState.set({ status: 'idle' });
    this.acceptError.set(null);
    this.sourceFiles.set([]);
    this.fileError.set(null);
    this.reviewItems.set([]);
    this.testSetEnabled.set(false);
    this.testSetTitle.set('');
    this.testSetDescription.set('');
    this.pointsByKey.set({});
    this._regen.set({});
  }

  // ── Review-list handlers (shared component outputs) ───────────────
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

  private keyOf(item: UnifiedReviewItem): string {
    return item.kind === 'ai' ? item.draftId : item.tempId;
  }

  onToggleSelect(key: string): void {
    this.acceptError.set(null);
    this.reviewItems.set(
      this.reviewItems().map((i) =>
        this.keyOf(i) === key ? { ...i, selected: !i.selected } : i,
      ),
    );
  }

  onEditItem(e: { key: string; edit: EditableQuestion }): void {
    this.acceptError.set(null);
    this.reviewItems.set(
      this.reviewItems().map((i) => {
        if (this.keyOf(i) !== e.key) return i;
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

  onToggleAll(): void {
    const items = this.reviewItems();
    const allSelected = items.length > 0 && items.every((i) => i.selected);
    this.reviewItems.set(items.map((i) => ({ ...i, selected: !allSelected })));
  }

  onReorder(e: { from: number; to: number }): void {
    const { from, to } = e;
    if (from === to) return;
    const next = [...this.reviewItems()];
    if (from < 0 || from >= next.length || to < 0 || to >= next.length) return;
    moveItemInArray(next, from, to);
    this.reviewItems.set(next);
  }

  onPointsChange(e: { key: string; points: number }): void {
    this.pointsByKey.set({
      ...this.pointsByKey(),
      [e.key]: this.clampPoints(e.points),
    });
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

  private clampPoints(value: number): number {
    if (!Number.isFinite(value)) return POINTS_MIN;
    return Math.max(POINTS_MIN, Math.min(POINTS_MAX, Math.round(value)));
  }

  /**
   * Commit the selected AI rows in ONE accept via the SHARED accept builder —
   * one atom each; the `test_set` block (when enabled) makes chora-delivery
   * assemble the DRAFT TestSet. A 4xx/5xx failure PRESERVES the review + surfaces
   * the error inline (fix-and-retry — no re-generate, no re-paid mana).
   */
  onAccept(): void {
    const s = this.composeState();
    if (s.status !== 'review' || !this.canAccept()) return;
    const { job, atomId } = s;
    this.acceptError.set(null);
    const request = buildAcceptRequest(this.reviewItems(), this.testSetConfig());
    this.composeState.set({ status: 'accepting', job, atomId });
    this.service
      .acceptGenerationJob(atomId, job.job_id, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const created =
            res.persisted?.length ?? request.accepted_candidates.length;
          this.composeState.set({ status: 'done', created });
        },
        error: (err) => {
          this.acceptError.set(this.errorKey(err));
          this.composeState.set({ status: 'review', job, atomId });
        },
      });
  }

  /**
   * Commit a hand-authored session (by-hand parity). Mint the host atom (type
   * from the first selected row), open a manual job, accept the inline
   * candidates — in ONE chain. No test set (manual rows carry no draft_id). A
   * failure returns to the idle authoring surface with the rows + an inline error
   * PRESERVED, never discarding the author's work.
   */
  onManualAccept(): void {
    if (!this.canAcceptManual()) return;
    const items = this.reviewItems();
    const firstSelected = items.find((i) => i.selected);
    const firstType = firstSelected?.edit.question_type ?? 'mcq';
    const atomType = firstType === 'mcq' ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER';
    const firstPrompt =
      firstSelected?.edit.prompt.trim() || 'Untitled question';
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
            .pipe(map((res) => ({ res }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ res }) => {
          const created =
            res.persisted?.length ?? request.accepted_candidates.length;
          this.composeState.set({ status: 'done', created });
        },
        error: (err) => {
          this.acceptError.set(this.errorKey(err));
          this.composeState.set({ status: 'idle' });
        },
      });
  }

  // ── Per-image regenerate (shared review-list control + reuse) ─────
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
          this.pollImageRegen(atomId, e.draftId, e.placement, regenJob.job_id, 0),
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
        error: 'rplus.assessment_authoring.error_generic',
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
            error: 'rplus.assessment_authoring.error_failed',
          });
          return;
        }
        const url = regenJob.candidate_questions?.[0]?.image_url;
        if (!url) {
          this.setRegen(draftId, placement, {
            regenerating: false,
            error: 'rplus.assessment_authoring.error_generic',
          });
          return;
        }
        this.swapImage(draftId, placement, url);
        this.setRegen(draftId, placement, { regenerating: false, error: null });
      });
  }

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

  // ── Helpers ───────────────────────────────────────────────────────
  private clampAiCount(count: number): number {
    if (!Number.isFinite(count)) return MIN_AI_COUNT;
    return Math.min(MAX_AI_COUNT, Math.max(MIN_AI_COUNT, Math.trunc(count)));
  }

  private isTerminalJobStatus(status: QuestionGenerationJob['status']): boolean {
    return (
      status === 'succeeded' ||
      status === 'failed' ||
      status === 'accepted' ||
      status === 'partially_accepted' ||
      status === 'cancelled' ||
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
    if (e?.status === 402)
      return 'rplus.assessment_authoring.error_insufficient_mana';
    if (typeof e?.status === 'number') {
      if (e.status === 422 || e.status === 400)
        return 'rplus.assessment_authoring.error_validation';
      if (e.status >= 500) return 'rplus.assessment_authoring.error_upstream';
      if (e.status === 401 || e.status === 403)
        return 'rplus.assessment_authoring.error_unauthorised';
    }
    return 'rplus.assessment_authoring.error_generic';
  }
}
