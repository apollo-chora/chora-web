/**
 * AtomAuthoringComponent — A+ Stage 3 wave 3 (Phyllis demo Steps 3 + 4).
 *
 * Ports `chora-web/.stitch-imports/aplus/atom-authoring-tablet-landscape.html`
 * + embeds `ai-assist-drawer.html` (slide-out drawer) + `gatekeeper-
 * refuse-rewrite-modal.html` (modal) into a single standalone Angular
 * component on the polyglass design system.
 *
 * Two route entries hit this component:
 *   - `/a/atoms/new`          — mode='new', no atomId
 *   - `/a/atoms/:atomId/edit` — mode='edit', resolved atomId in route param
 *
 * Phyllis demo Step 3 + 4 happy path:
 *   1. Phyllis opens `/a/atoms/new` — empty draft scaffold
 *   2. AI Assist drawer toggles open via the "AI Assist" CTA
 *   3. Drawer suggests title / difficulty / topic tags from the prompt
 *   4. "Generate Content" → state PENDING → service responds
 *   5. If REFUSED: Gatekeeper modal opens with rewrite suggestion;
 *      "Accept rewrite" updates the body and re-runs (now APPROVED)
 *   6. Publish CTA gated until state === 'APPROVED'
 *
 * Domain vocabulary anchors: `LearningAtom`, `AtomRevision`, IMDA D3
 * (Safety & Robustness) audit trail per ADR-141.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { AtomAuthoringService } from './atom-authoring.service';
import { AtomQuestionPickerService } from '../atom-question-picker/atom-question-picker.service';
import type { QuestionSearchResult } from '../atom-question-picker/atom-question-picker.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { TraceWidgetComponent } from './widget/trace-widget.component';
import { McqFieldsComponent } from './mcq-fields/mcq-fields.component';
import { OeFieldsComponent } from './oe-fields/oe-fields.component';
import type { ModelAnswerRequestPayload } from './oe-fields/oe-fields.component';
import { QuestionTypePickerComponent } from './question-type-picker/question-type-picker.component';
import { AiAssistPanelComponent } from './ai-assist-panel/ai-assist-panel.component';
import { StudioSubNavComponent } from '../studio/studio-sub-nav.component';
import type { AiAssistGenerateRequest } from './ai-assist-panel/ai-assist-panel.component';
import { ManaTopupModalComponent } from '../../../../shared/components/mana-topup-modal/mana-topup-modal.component';
import { ChoraQuestionImageComponent } from '../../../../shared/components/chora-question-image/chora-question-image.component';
import { MeManaService } from '../../../../core/services/me-mana.service';
import type {
  AcceptedCandidate,
  AiAssistJob,
  AiAssistJobState,
  AiAssistMcqCandidate,
  AiAssistOeCandidate,
  AiAssistRequest,
  AtomAuthoringMode,
  AtomContent,
  AtomDraft,
  AtomDraftLoadState,
  AtomDraftState,
  CognitiveLevel,
  GenerationJobState,
  McqContent,
  McqPayload,
  OePayload,
  OpenEndedContent,
  PipelineTraceStep,
  QuestionDraftCandidate,
  QuestionGenerationJob,
  QuestionType,
  QuestionTypeOption,
} from './atom-authoring.model';
import {
  COGNITIVE_LEVELS,
  toCreateRequest,
  toDifficultyBucket,
  toEditRequest,
  toWireCognitiveLevel,
} from './atom-authoring.model';
import type { InsufficientManaUpsell } from '../../../../core/services/me-mana.model';
import { recommendedManaPackSku } from '../../../../core/services/me-mana.model';
import { Observable, timer, of, throwError } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';

/**
 * How many recent atoms the "My authored questions" side list shows. The full
 * searchable inventory is Studio's (`/a/studio/atoms`); this is a convenience
 * peek, so it asks the server for exactly what it renders.
 */
const MY_ATOMS_PAGE_SIZE = 10;

@Component({
  selector: 'chora-aplus-atom-authoring',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    TimeAgoPipe,
    TraceWidgetComponent,
    McqFieldsComponent,
    OeFieldsComponent,
    QuestionTypePickerComponent,
    AiAssistPanelComponent,
    ManaTopupModalComponent,
    StudioSubNavComponent,
    ChoraQuestionImageComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './atom-authoring.component.html',
  styleUrl: './atom-authoring.component.scss',
})
export class AtomAuthoringComponent implements OnInit {
  private readonly authoringService = inject(AtomAuthoringService);
  private readonly pickerService = inject(AtomQuestionPickerService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly manaService = inject(MeManaService);

  /** Edit vs New — derived from route param. */
  readonly atomIdParam = this.route.snapshot.paramMap.get('atomId');
  readonly mode: AtomAuthoringMode = this.atomIdParam ? 'edit' : 'new';

  /**
   * F2 paydown — discriminated load state (loading / success / error).
   * Populated by `loadDraft()` (called from ngOnInit + retry CTA).
   */
  private readonly loadState = signal<AtomDraftLoadState>({ status: 'loading' });

  readonly isLoading = computed<boolean>(() => this.loadState().status === 'loading');
  readonly isError = computed<boolean>(() => this.loadState().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.loadState();
    return s.status === 'error' ? s.error : '';
  });

  /** Source-of-truth initial draft (success payload only). */
  private readonly initialDraft = computed<AtomDraft | null>(() => {
    const s = this.loadState();
    return s.status === 'success' ? s.data : null;
  });

  // ── Atom draft fields (component-local writable signals) ──────────
  readonly title = signal('');
  readonly body = signal('');
  readonly cognitiveLevel = signal<CognitiveLevel>('applying');

  // ── Generator state machine ───────────────────────────────────────
  // Legacy `state` retained for the topbar status pill + Phase H gate;
  // the source of truth for the async ai-assist flow is `aiAssistJobState`.
  // `state` is derived/synced from the lifecycle transitions in
  // `applyAiAssistJobState`.
  readonly state = signal<AtomDraftState>('DRAFT');
  /**
   * Source-of-truth for the AI Assist drawer's async lifecycle.
   * Transitions: idle → submitting → polling(...) → terminal
   * (completed | refused | failed | timeout | error).
   */
  readonly aiAssistJobState = signal<AiAssistJobState>({ status: 'idle' });

  // ── Drawer + modal flags ──────────────────────────────────────────
  readonly aiAssistOpen = signal(false);
  /** True during the drawer's fade/slide-out so it stays mounted to animate
   * before unmounting (no @angular/animations available). (2026-06-21) */
  readonly drawerClosing = signal(false);
  readonly refusalOpen = signal(false);

  // ── A2 disclosure flag (CJ#1 smoke #4 metadata sidebar collapse) ──
  // TAGS / PREREQUISITES / LEARNING OBJECTIVES collapse into a single
  // "Atom metadata" disclosure. Default collapsed per the design plan;
  // COGNITIVE LEVEL stays outside (its picker is functional today).
  readonly metadataExpanded = signal(false);
  readonly metadataPanelId = 'aplus-atom-authoring-metadata-panel';

  // ── Agent-trace widget state ──────────────────────────────────────
  /**
   * Live pipeline_trace[] from the async AI-Assist envelope. Sourced
   * from `aiAssistJobState` polling updates and final terminal value.
   * Null when idle. The trace widget consumes this directly — the
   * legacy mock `AgentTraceService.observeWorkflow` is no longer used.
   */
  readonly pipelineTrace = computed<readonly PipelineTraceStep[] | null>(() => {
    const s = this.aiAssistJobState();
    if (s.status === 'polling' || s.status === 'completed' ||
        s.status === 'refused' || s.status === 'failed') {
      return s.job.pipeline_trace ?? null;
    }
    return null;
  });

  /** Refused branch — flips the trace widget's terminal-signal cards. */
  readonly traceRefused = computed<boolean>(() => {
    const s = this.aiAssistJobState();
    return s.status === 'refused';
  });

  /** Empty-state hint visibility — true when no generation has been kicked. */
  readonly traceIdle = computed<boolean>(() => {
    return this.aiAssistJobState().status === 'idle';
  });

  // ── AI Assist form ───────────────────────────────────────────────
  /**
   * Question type for the new async wire (MCQ-first per user direction
   * 2026-05-17; OE deferred to backlog until MCQ smoke is GREEN).
   * The drawer hides the OE tab; flipping `aiQuestionType` to 'oe'
   * requires re-enabling the tab.
   */
  readonly aiQuestionType = signal<'mcq' | 'oe'>('mcq');
  readonly aiPrompt = signal('');
  readonly aiDifficulty = signal<1 | 2 | 3 | 4 | 5>(3);
  /**
   * Optional subject hint forwarded to BE metadata.subject — used by
   * the generator template to bias the candidate (e.g. "Biology").
   * Left empty by default.
   */
  readonly aiSubject = signal<string>('');

  // ── W8 AUTHOR-OPT-IN image toggles ────────────────────────────────
  /**
   * Author opt-in: include a diagram/image for the QUESTION stem. Default
   * false. Forwarded to the generate request as `image_for_stem`; the BE
   * honours it and returns the image on `candidate.image_url`.
   */
  readonly imageForStem = signal<boolean>(false);
  /**
   * Author opt-in: include an image for the MODEL ANSWER (the 2nd slot).
   * Default false. Forwarded as `image_for_answer`; the BE returns it on
   * `candidate.answer_image_url`.
   */
  readonly imageForAnswer = signal<boolean>(false);

  /** Cognitive level options for the metadata select. */
  readonly cognitiveLevels = COGNITIVE_LEVELS;

  /** Derived: a hydrated view of the current draft. */
  readonly draft = computed<AtomDraft | null>(() => {
    const initial = this.initialDraft();
    if (!initial) return null;
    return {
      ...initial,
      // On the /a/atoms/:atomId/edit route the atom ALWAYS exists, but the
      // GET-atom draft payload doesn't reliably surface `atomId` — fall back to
      // the route param so Save PATCHes the existing atom (instead of minting a
      // duplicate via ensureAtomId → POST /api/atoms, then 404-ing the question
      // PATCH under the new atom) and Publish targets the right atom.
      atomId: initial.atomId ?? (this.mode === 'edit' ? this.atomIdParam : null),
      title: this.title() || initial.title,
      body: this.body() || initial.body,
      cognitiveLevel: this.cognitiveLevel(),
      state: this.state(),
    };
  });

  readonly canPublish = computed<boolean>(() => this.state() === 'APPROVED');

  readonly isGenerating = computed<boolean>(
    () => this.state() === 'GENERATING' || this.state() === 'PENDING',
  );

  /** Element refs for focus management. */
  @ViewChild('drawerCloseBtn') drawerCloseBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('modalCloseBtn') modalCloseBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('aiAssistTriggerBtn') aiAssistTriggerBtn?:
    | ElementRef<HTMLButtonElement>;

  // ═════════════════════════════════════════════════════════════════════
  // Phase H — Question Authoring CR integration (additive — legacy AI
  // Assist drawer + Gatekeeper modal flow above kept intact for now;
  // Phase H.2 sweep removes the legacy once the new flow is browser-
  // verified end-to-end).
  // ═════════════════════════════════════════════════════════════════════

  /** 16-enum picker registry (Phase D). Loaded from /api/atoms/question-types. */
  readonly questionTypes = signal<readonly QuestionTypeOption[]>([]);

  /** Selected question_type — drives whether to render MCQ vs OE fields. */
  readonly selectedQuestionType = signal<QuestionType | null>(null);

  /** Current draft content (synthesised from sub-component contentChanged). */
  readonly currentContent = signal<AtomContent | null>(null);

  /**
   * One-way seed for the field components' `initialContent` input.
   * Updated ONLY on (a) picker selection, (b) AI draft ready, (c)
   * AI model-answer ready. NEVER updated via `onMcqContentChanged` /
   * `onOeContentChanged` — that would re-bind the input and trigger
   * the field's seed-effect to re-run, creating an Effect-1↔Effect-2
   * cycle (NG0103). The live edit state lives in `currentContent`.
   */
  readonly editorSeed = signal<AtomContent | null>(null);

  /** Sub-component validity output — drives publish CTA gate. */
  readonly currentValidity = signal<boolean>(false);

  /** Existing question_id from the atom projection — null on new atoms. */
  readonly existingQuestionId = signal<string | null>(null);

  /** Save state for the Save Draft / Publish CTA. */
  readonly saveState = signal<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; revision: number }
    // `raw: true` → `error` is a verbatim backend message (rendered as-is, not
    // through the translate pipe). Used to surface real payload-validation
    // errors (e.g. rubric weight-sum) instead of the generic key (bug #2-A).
    | { status: 'error'; error: string; raw?: boolean }
  >({ status: 'idle' });

  /**
   * Phase K — Publish state for the new Publish CTA. `revisionNumber`
   * is the `current_revision_number` from BE's 200 response (A22 close
   * 776d9c85). Toast renders the version after publish for confidence.
   */
  readonly publishState = signal<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; revisionNumber?: number }
    | { status: 'error'; error: string }
  >({ status: 'idle' });

  /** Delete state — atom CRUD per ddd-enforcement #5 (soft delete). */
  readonly deleteState = signal<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success' }
    | { status: 'error'; error: string }
  >({ status: 'idle' });
  readonly canDelete = computed<boolean>(
    () =>
      this.hasPersistedQuestion() &&
      this.deleteState().status !== 'submitting',
  );

  /**
   * "My authored questions" recent list — user-requested UX 2026-05-16.
   * Rendered below the editor. Pull tenant-wide latest 10 atoms via the
   * existing picker search service (sort created_at:desc). Refreshes
   * on every publish/delete success so the just-published atom appears
   * at the top — gives the author a visible confirmation of their
   * work + Open CTA back to /a/atoms/:atomId/edit.
   */
  readonly myAtomsList = signal<readonly QuestionSearchResult[]>([]);
  readonly myAtomsLoading = signal<boolean>(false);
  readonly myAtomsError = signal<string | null>(null);

  /** 402 upsell — populates when a mana-spending call returns insufficient. */
  readonly topupUpsell = signal<InsufficientManaUpsell | null>(null);

  /** Phase H mana balance signal — wired through MeManaService. */
  readonly manaBalance = this.manaService.balanceUnits;
  readonly manaLoadState = this.manaService.loadState;
  readonly manaTopupState = this.manaService.topupState;

  /** Whether the topup modal should be shown. */
  readonly topupModalOpen = computed<boolean>(() => this.topupUpsell() !== null);

  /** Phase H save-gate: valid content + not already submitting. */
  readonly canSavePhaseH = computed<boolean>(
    () => this.currentValidity() && this.saveState().status !== 'submitting',
  );

  /** Phase K — secondary CTAs (Preview + Publish) only show after first save. */
  readonly hasPersistedQuestion = computed<boolean>(
    () => this.existingQuestionId() !== null,
  );

  /** Phase K — publish gate: must have a saved question + not mid-publish. */
  readonly canPublishPhaseK = computed<boolean>(
    () =>
      this.hasPersistedQuestion() &&
      this.publishState().status !== 'submitting' &&
      this.saveState().status !== 'submitting',
  );

  /** Is the post-publish lock active? — for now, false (every save bumps a revision per BE design). */
  readonly questionTypeLocked = computed<boolean>(
    () => this.existingQuestionId() !== null,
  );

  // ── Share to C+ (post-publish) ───────────────────────────────────────
  readonly sharePanelOpen = signal(false);
  readonly shareCaption = signal('');
  readonly shareLicense = signal('cc_by_sa');
  readonly shareRoyaltyRate = signal<number>(10);
  readonly shareTargetAtomId = signal<string | null>(null);
  readonly shareState = signal<
    | { status: 'idle' }
    | { status: 'submitting' }
    | { status: 'success'; shareEntryId: string }
    | { status: 'error'; error: string }
  >({ status: 'idle' });

  readonly canShare = computed<boolean>(
    () => this.publishState().status === 'success',
  );

  readonly isRoyaltyLicense = computed<boolean>(
    () => this.shareLicense() === 'royalty_pct' || this.shareLicense() === 'royalty_fixed',
  );

  readonly licenseOptions = [
    { value: 'free', labelKey: 'aplus.atom_authoring.share.license_free' },
    { value: 'cc_by_sa', labelKey: 'aplus.atom_authoring.share.license_cc_by_sa' },
    { value: 'cc_nd', labelKey: 'aplus.atom_authoring.share.license_cc_nd' },
    { value: 'royalty_pct', labelKey: 'aplus.atom_authoring.share.license_royalty_pct' },
    { value: 'royalty_fixed', labelKey: 'aplus.atom_authoring.share.license_royalty_fixed' },
  ] as const;

  // ═════════════════════════════════════════════════════════════════════
  // Phase I — AI assist orchestration (Path 2 model-answer + Path 3 ai_draft).
  // The AiAssistPanel mounts inside both MCQ + OE editor blocks; this
  // component owns the GenerationJobState lifecycle, polling, 402 →
  // topup modal, and re-seeding currentContent with the ready draft.
  // ═════════════════════════════════════════════════════════════════════

  /** ai_draft job lifecycle (Path 3 — 10 mana, full-question draft). */
  readonly aiJobState = signal<GenerationJobState>({ status: 'idle' });

  /** model-answer job lifecycle (Path 2 — 5 mana, OE model-answer fill). */
  readonly modelAnswerJobState = signal<GenerationJobState>({ status: 'idle' });

  /** When AI draft lands, remember (job_id, draft_id) so Save can call acceptGenerationJob with the user's overrides. */
  private readonly aiActiveJobId = signal<string | null>(null);
  private readonly aiActiveDraftId = signal<string | null>(null);

  readonly aiInFlight = computed<boolean>(() => {
    const s = this.aiJobState().status;
    return s === 'submitting' || s === 'submitted' || s === 'polling';
  });

  readonly modelAnswerInFlight = computed<boolean>(() => {
    const s = this.modelAnswerJobState().status;
    return s === 'submitting' || s === 'submitted' || s === 'polling';
  });

  ngOnInit(): void {
    this.loadDraft();
    this.loadPhaseHContext();
    this.loadMyAtoms();
    if (this.mode === 'edit' && this.atomIdParam) {
      this.loadExistingQuestionForEdit(this.atomIdParam);
    }
  }

  /**
   * CHO-1638 — re-open hydration. Loads the persisted AUTHOR question (full
   * answer key + minted images) and seeds the editor so opening an existing
   * atom from "Your recent atoms" shows its question/model-answer images,
   * options, and explainers instead of a blank picker. Best-effort: a null
   * result (no question yet / load error) leaves the manual picker available.
   */
  private loadExistingQuestionForEdit(atomId: string): void {
    this.authoringService
      .loadQuestionForEdit(atomId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (!res) return;
          // Set BOTH editorSeed (one-way field input) and currentContent
          // (live edit state used by Save), mirroring onQuestionTypeSelected.
          this.selectedQuestionType.set(res.content.type);
          this.editorSeed.set(res.content);
          this.currentContent.set(res.content);
          this.existingQuestionId.set(res.questionId);
        },
        error: () => {
          // Re-open is non-fatal; the picker still supports manual re-author.
        },
      });
  }

  /** Retry CTA — re-fetch the draft from BFF. */
  retry(): void {
    this.loadDraft();
    this.loadPhaseHContext();
  }

  private loadDraft(): void {
    this.authoringService
      .loadDraft(this.atomIdParam)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => {
        this.loadState.set(s);
        if (s.status === 'success') {
          this.cognitiveLevel.set(s.data.cognitiveLevel);
          // If the atom is already published, set publishState to success
          // so the "Share to C+" button appears on reload (not just right
          // after clicking Publish).
          const wire = s.data as AtomDraft & { status?: string };
          if (wire.status === 'published') {
            this.publishState.set({ status: 'success' });
          }
        }
      });
  }

  /** Phase H: load 16-enum registry + mana balance in parallel. */
  private loadPhaseHContext(): void {
    this.authoringService
      .loadQuestionTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (types) => this.questionTypes.set(types),
        error: () => {
          // Silent fail-loud — picker just won't render. The legacy
          // AI Assist drawer keeps working in the meantime.
        },
      });
    this.manaService.load();
  }

  // ── Phase H — picker + fields handlers ──────────────────────────

  onQuestionTypeSelected(type: QuestionType): void {
    const prev = this.selectedQuestionType();
    if (prev === type) return; // no-op when re-clicking the same tile
    if (this.existingQuestionId() !== null) {
      // BE locks the question type once persisted (per ADR-155 D5);
      // surface the constraint instead of silently rejecting.
       
      alert(
        'This question is already saved. Question type is locked after save; delete and re-author to use a different type.',
      );
      return;
    }
    if (prev !== null) {
      // Confirm before wiping in-progress draft content.
      const content = this.currentContent();
      const hasDraftContent =
        content !== null && content.prompt.trim().length > 0;
      const upper = (s: string): string => s.toUpperCase();
      if (
        hasDraftContent &&
         
        !confirm(
          `Switch to ${upper(type)}? Unsaved ${upper(prev)} content will be cleared.`,
        )
      ) {
        return;
      }
    }
    this.selectedQuestionType.set(type);
    // Seed a blank AtomContent of the chosen type. Set BOTH editorSeed
    // (for the field component's one-way input bind) and currentContent
    // (the live edit state used by Save).
    const seed = type === 'mcq' ? this.emptyMcqContent() : this.emptyOeContent();
    this.editorSeed.set(seed);
    this.currentContent.set(seed);
    this.currentValidity.set(false);
  }

  onMcqContentChanged(content: McqContent): void {
    this.currentContent.set(content);
  }

  onOeContentChanged(content: OpenEndedContent): void {
    this.currentContent.set(content);
  }

  onContentValidityChanged(valid: boolean): void {
    this.currentValidity.set(valid);
  }

  /**
   * Save Draft — PATCH if a question already exists on the atom; else
   * POST. The Phase C service handles serialisation; BE handles
   * revisioning per the locked contract (every save bumps revisions).
   *
   * FE-BUG-1 fix (2026-05-16): the manual MCQ/OE path used to silently
   * early-return when atomId was null (template-mode at /a/atoms/new).
   * Now wraps the create/edit call in ensureAtomId() so the atom is
   * auto-minted on first Save, matching the AI Assist flow.
   */
  saveQuestion(): void {
    const content = this.currentContent();
    if (!content || !this.currentValidity()) return;
    const qt = this.selectedQuestionType();
    if (!qt) return;

    this.saveState.set({ status: 'submitting' });
    const existingId = this.existingQuestionId();
    const aiJobId = this.aiActiveJobId();
    const aiDraftId = this.aiActiveDraftId();

    // Phase I — AI-draft commit: when kind=ai_draft and we have an
    // active (job_id, draft_id), Save = `acceptGenerationJob` with the
    // user's edited content carried as the per-candidate override.
    const isAiCommit =
      content.kind === 'ai_draft' &&
      !existingId &&
      aiJobId !== null &&
      aiDraftId !== null;

    const call$: Observable<{
      question: { question_id: string };
      atom_revision: { revision_number: number };
    }> = this.ensureAtomId(qt).pipe(
      switchMap((atomId) =>
        isAiCommit
          ? this.authoringService
              .acceptGenerationJob(atomId, aiJobId!, {
                accepted_candidates: [this.buildAcceptedCandidate(aiDraftId!, content)],
              })
              .pipe(
                switchMap((env) => {
                  // Backend renamed questions→persisted (see model note); read
                  // either so the single-question accept survives both shapes.
                  const question = (env.questions ?? env.persisted ?? [])[0];
                  if (!question) {
                    throw { status: 500, message: 'No question in accept response' };
                  }
                  return of({
                    question,
                    atom_revision: { revision_number: 1 },
                  });
                }),
              )
          : existingId
          ? this.authoringService.editQuestion(
              atomId,
              existingId,
              toEditRequest(content),
            )
          : this.authoringService.createQuestion(
              atomId,
              toCreateRequest(content),
            ),
      ),
    );

    call$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (env) => {
        this.existingQuestionId.set(env.question.question_id);
        this.saveState.set({
          status: 'success',
          revision: env.atom_revision.revision_number,
        });
        // Clear AI-job state on successful commit so the panel returns
        // to idle and a follow-up Generate starts a fresh job.
        if (isAiCommit) {
          this.aiActiveJobId.set(null);
          this.aiActiveDraftId.set(null);
          this.aiJobState.set({ status: 'idle' });
        }
      },
      error: (err) => {
        // 402 → open topup modal; everything else surfaces as save error.
        if (this.is402(err)) {
          const upsell = this.extractUpsell(err);
          if (upsell) {
            this.topupUpsell.set(upsell);
            this.saveState.set({ status: 'idle' });
            return;
          }
        }
        // Prefer the backend's real validation message (e.g. the rubric
        // weight-sum error) over the generic "check the required fields" key.
        const backendMsg = this.backendValidationMessage(err);
        if (backendMsg) {
          this.saveState.set({ status: 'error', error: backendMsg, raw: true });
          return;
        }
        this.saveState.set({
          status: 'error',
          error: this.saveErrorKey(err),
        });
      },
    });
  }

  // ── Phase K — Publish handler (POST /api/atoms/:id/publish) ──────

  publishAtomDraft(): void {
    const atomId = this.draft()?.atomId;
    if (!atomId || !this.canPublishPhaseK()) return;

    this.publishState.set({ status: 'submitting' });
    this.authoringService
      .publishAtom(atomId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (raw) => {
          // BE response (per A22 close in 776d9c85) is a bare LearningAtom
          // including `current_revision_id` + `current_revision_number`
          // merged from the latest QuestionRevision. Surface the version
          // in the success toast so the author sees what they published.
          const revisionNumber =
            (raw as { current_revision_number?: number })
              ?.current_revision_number;
          this.publishState.set({
            status: 'success',
            revisionNumber: typeof revisionNumber === 'number'
              ? revisionNumber
              : undefined,
          });
          // Refresh "My authored questions" so the just-published atom
          // surfaces at the top.
          this.loadMyAtoms();
        },
        error: (err: unknown) => {
          this.publishState.set({
            status: 'error',
            error: this.publishErrorKey(err),
          });
        },
      });
  }

  // ── Share to C+ ─────────────────────────────────────────────────────

  /** Per-row share from the "My authored questions" list. Opens the share
   *  panel targeting the listed atom without navigating to the edit page. */
  shareFromList(atomId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.shareTargetAtomId.set(atomId);
    this.sharePanelOpen.set(true);
    this.shareState.set({ status: 'idle' });
  }

  toggleSharePanel(): void {
    this.sharePanelOpen.update((v) => !v);
    if (!this.sharePanelOpen()) {
      this.shareState.set({ status: 'idle' });
    }
  }

  shareAtom(): void {
    const atomId = this.draft()?.atomId ?? this.shareTargetAtomId();
    if (!atomId) return;
    this.shareState.set({ status: 'submitting' });
    this.authoringService
      .shareAtom(atomId, {
        license_terms: this.shareLicense(),
        caption: this.shareCaption().trim() || undefined,
        royalty_rate: this.isRoyaltyLicense()
          ? { kind: this.shareLicense() === 'royalty_pct' ? 'pct' : 'fixed_per_use', value: this.shareRoyaltyRate() }
          : null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.shareState.set({ status: 'success', shareEntryId: res.share_entry_id });
        },
        error: (err: unknown) => {
          const e = err as { status?: number };
          let key = 'aplus.atom_authoring.share.error_generic';
          if (e?.status === 412) key = 'aplus.atom_authoring.share.error_not_published';
          else if (e?.status === 403) key = 'aplus.atom_authoring.share.error_not_owner';
          else if (e?.status && e.status >= 500) key = 'aplus.atom_authoring.share.error_upstream';
          this.shareState.set({ status: 'error', error: key });
        },
      });
  }

  /**
   * Load the "My authored questions" recent list — server-side narrowed.
   *
   * ADR-229 WS-2 (CHO-2133): the picker search now enforces the consent
   * disjunct server-side and `source=mine` returns ONLY the caller's atoms,
   * so the old pull-50-and-filter-client-side hack is DELETED — the
   * response is trusted verbatim (no over-fetch, no yield-rate guess).
   *
   * The list shows 10, so it ASKS for 10. It previously asked for 20 and sliced
   * the tail off client-side, which is the over-fetch the paragraph above says
   * was deleted; the spec had asserted the intended 10 all along and had been
   * failing on `main` against the 20 the code really sent.
   */
  loadMyAtoms(): void {
    const myGcid = this.auth.gcid();
    if (!myGcid) {
      this.myAtomsList.set([]);
      return;
    }
    this.myAtomsLoading.set(true);
    this.myAtomsError.set(null);
    this.pickerService
      .search({
        sort: 'created_at:desc',
        per: MY_ATOMS_PAGE_SIZE,
        question_type: ['mcq', 'oe'],
        state: ['DRAFT', 'PUBLISHED'],
        source: 'mine',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.myAtomsList.set(res.items);
          this.myAtomsLoading.set(false);
        },
        error: () => {
          this.myAtomsError.set('aplus.atom_authoring.my_atoms.error');
          this.myAtomsLoading.set(false);
        },
      });
  }

  /**
   * Author another — FE-BUG-POST-PUBLISH-STALE-FORM fix.
   * After a successful publish, navigate to a fresh `/a/atoms/new`
   * (replaceUrl) so the form resets and the user can author the
   * next atom. Uses queryParam timestamp to force Angular to
   * re-init the component even though the route is the same.
   */
  authorAnother(): void {
    if (this.publishState().status !== 'success') return;
    this.router.navigate(['/a/studio/atoms/new'], {
      queryParams: { _: Date.now() },
      replaceUrl: false,
    });
  }

  /**
   * Delete the current atom — atom-level soft-delete (FE atom CRUD).
   * Calls `DELETE /api/atoms/{atom_id}` per BE ack `d2ec6ee7`. Sets
   * `deleted_at` + `status=archived` server-side; subsequent reads
   * return 404; picker search excludes the row.
   *
   * NOTE: Cloud Armor at the edge currently blocks DELETE method with
   * 403 — Infra-side block at `ad408b28`. Until Infra whitelists DELETE
   * for /api/atoms/{id}, this CTA will 403 from a browser. Port-forward
   * + service-to-service paths work.
   */
  deleteCurrentAtom(): void {
    const atomId = this.draft()?.atomId;
    if (!atomId) return;
    if (!confirm('Delete this atom? This cannot be undone.')) return;
    this.deleteState.set({ status: 'submitting' });
    this.authoringService
      .deleteAtom(atomId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteState.set({ status: 'success' });
          // Refresh "My authored questions" so the deleted atom drops.
          this.loadMyAtoms();
          // Redirect to a fresh /a/atoms/new after delete.
          this.router.navigate(['/a/studio/atoms/new'], {
            queryParams: { _: Date.now() },
          });
        },
        error: (err: unknown) => {
          this.deleteState.set({
            status: 'error',
            error: this.publishErrorKey(err),
          });
        },
      });
  }

  private publishErrorKey(err: unknown): string {
    const e = err as { status?: number; error?: { error?: { code?: string } } };
    const code = e?.error?.error?.code;
    if (e?.status === 409) {
      // BE A22 close (776d9c85) returns two discriminated sub-codes:
      //   - CREATION_ATOM_NO_PUBLISHED_REVISION
      //   - CREATION_ATOM_ARCHIVED
      // (idempotent re-publish returns 200, NOT 409 ALREADY_PUBLISHED,
      // so that branch is dropped — single-tap forgiving CTA.)
      if (code === 'CREATION_ATOM_NO_PUBLISHED_REVISION') {
        return 'aplus.atom_authoring.phase_k.error_no_revision';
      }
      if (code === 'CREATION_ATOM_ARCHIVED') {
        return 'aplus.atom_authoring.phase_k.error_archived';
      }
      return 'aplus.atom_authoring.phase_k.error_validation';
    }
    if (e?.status === 404) {
      return 'aplus.atom_authoring.phase_k.error_not_found';
    }
    if (typeof e?.status === 'number' && e.status >= 500) {
      return 'aplus.atom_authoring.phase_k.error_upstream';
    }
    if (e?.status === 401 || e?.status === 403) {
      return 'aplus.atom_authoring.phase_k.error_unauthorised';
    }
    return 'aplus.atom_authoring.phase_k.error_generic';
  }

  /** Build the per-candidate override block for acceptGenerationJob. */
  private buildAcceptedCandidate(
    draftId: string,
    content: AtomContent,
  ): AcceptedCandidate {
    // W8 image-gen: carry the AI-generated illustration URLs into the accept
    // override. The override REPLACES the AI draft payload server-side, so
    // without these the generated images are dropped on commit. Wire names
    // `image_url` / `answer_image_url` — IDENTICAL across all layers.
    const imageOverrides = {
      ...(content.image_url ? { image_url: content.image_url } : {}),
      ...(content.answer_image_url
        ? { answer_image_url: content.answer_image_url }
        : {}),
    };
    if (content.type === 'mcq') {
      return {
        draft_id: draftId,
        prompt_override: content.prompt,
        mcq_payload_override: content.mcq_payload,
        ...imageOverrides,
      };
    }
    return {
      draft_id: draftId,
      prompt_override: content.prompt,
      oe_payload_override: content.oe_payload,
      ...imageOverrides,
    };
  }

  // ── Phase I — AI assist handlers ──────────────────────────────────

  /**
   * Phase I.3 — kick off a Path 3 ai_draft job (10 mana). On 402, opens
   * the Phase B topup modal. On 202, starts polling. On `ready_for_review`,
   * reshapes the candidate into McqContent / OpenEndedContent + re-seeds
   * `currentContent` so the editor populates. The `kind: 'ai_draft'` tag
   * routes Save through `acceptGenerationJob` (with the user's overrides)
   * instead of `createQuestion`.
   */
  onAiAssistRequested(req: AiAssistGenerateRequest): void {
    const qt = this.selectedQuestionType();
    if (!qt || qt !== 'mcq' && qt !== 'oe') return;
    if (this.aiInFlight()) return;

    this.aiJobState.set({ status: 'submitting' });
    this.aiActiveJobId.set(null);
    this.aiActiveDraftId.set(null);

    this.ensureAtomId(qt)
      .pipe(
        switchMap((atomId: string) =>
          this.authoringService
            .generateQuestionJob(
              atomId,
              {
                job_type: 'ai_draft',
                question_type: qt,
                prompt: req.prompt,
                difficulty: req.difficulty,
              },
              this.newId(),
            )
            .pipe(map((job: QuestionGenerationJob) => ({ atomId, job }))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res: { atomId: string; job: QuestionGenerationJob }) => {
          this.aiActiveJobId.set(res.job.job_id);
          this.aiJobState.set({ status: 'submitted', job: res.job });
          this.startPollingAiJob(res.atomId, res.job);
        },
        error: (err) => {
          if (this.is402(err)) {
            const upsell = this.extractUpsell(err);
            if (upsell) {
              this.topupUpsell.set(upsell);
              this.aiJobState.set({ status: 'idle' });
              return;
            }
          }
          this.aiJobState.set({
            status: 'error',
            error: this.aiErrorKey(err),
          });
        },
      });
  }

  /**
   * Phase I.5 — ensure the current atom has a real atomId. On the
   * /a/atoms/new route the server template returns atomId=null; the
   * FE auto-mints via POST /api/atoms before any nested call. Caches
   * the minted id by pushing it into loadState so subsequent calls
   * (Save, second AI generation, etc.) reuse it.
   */
  /**
   * Atom title derivation — FE-BUG-ATOM-TITLE-MEANINGLESS-DEFAULT fix.
   * When the author left the title input blank, derive a meaningful
   * label from the current question stem (first 60 chars, single-line).
   * Falls back to "Untitled {TYPE}" instead of the generic
   * "Untitled Atom" so at least the type is visible in the picker.
   *
   * This is the FE-side stopgap pending the atom-aggregate redesign
   * (`docs/architecture/atom-aggregate-holistic-assessment-2026-05-16.md`)
   * which proposes dropping `title` as a required field entirely.
   */
  private deriveAtomTitle(qt: QuestionType): string {
    const explicit = this.title().trim();
    if (explicit) return explicit;
    const content = this.currentContent();
    const stem = (content?.prompt ?? '').trim();
    if (stem) {
      const oneLine = stem.replace(/\s+/g, ' ');
      return oneLine.length > 60 ? oneLine.slice(0, 60) + '…' : oneLine;
    }
    return qt === 'mcq' ? 'Untitled MCQ' : 'Untitled OE';
  }

  /**
   * Stem derivation — ADR-156 Phase 1 Decision #1 + BE deploy `9f63ae00`.
   * The `learning_atoms` aggregate now requires top-level `stem` (≥1 char
   * after trim). Source priority:
   *   1. `currentContent().prompt` — the live question stem the user is
   *      typing in mcq-fields / oe-fields.
   *   2. `title()` — fallback when the picker hasn't been selected yet.
   *   3. null — caller MUST short-circuit (no wire call); we refuse to
   *      let the request hit BE just to receive 400 CREATION_INVALID_ATOM.
   *
   * Per ADR-156 Decision #1 `title` is optional on the wire; we keep it
   * populated via `deriveAtomTitle()` for backwards-compat and so the
   * picker / "My authored questions" list has a readable label even
   * before the BE auto-derive lands.
   */
  private deriveAtomStem(): string | null {
    const promptVal = (this.currentContent()?.prompt ?? '').trim();
    if (promptVal) return promptVal;
    const titleVal = this.title().trim();
    if (titleVal) return titleVal;
    return null;
  }

  private ensureAtomId(qt: QuestionType): Observable<string> {
    const existing = this.draft()?.atomId;
    if (existing) return of(existing);
    const stemVal = this.deriveAtomStem();
    if (!stemVal) {
      // Refuse to issue the BE call — without a stem the BE returns 400
      // CREATION_INVALID_ATOM. Surface a typed error so saveQuestion's
      // catch path renders the validation message instead of letting the
      // 400 round-trip leak through.
      return throwError(() => ({
        status: 422,
        message: 'stem is required to mint an atom',
      }));
    }
    const titleVal = this.deriveAtomTitle(qt);
    const atomType = qt === 'mcq' ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER';
    return this.authoringService
      .createAtom({
        atom_type: atomType,
        // ADR-156 Decision #1 — `stem` is the new REQUIRED top-level
        // field on CreateAtomRequest. Derived from the live question
        // prompt; falls back to title when the picker hasn't been
        // selected yet. See `deriveAtomStem` above.
        stem: stemVal,
        title: titleVal,
        locale: 'en',
        // E2E-BE-COGNITIVE-LEVEL — map FE revised-Bloom picker to the
        // BE-canonical older-Bloom wire enum at the boundary.
        cognitive_level: toWireCognitiveLevel(this.cognitiveLevel()),
      })
      .pipe(
        map((res) => {
          // Stash the minted atomId into the load state so `draft()`
          // computed picks it up + downstream Save / re-mint short-
          // circuits return the existing id.
          const current = this.loadState();
          if (current.status === 'success') {
            this.loadState.set({
              status: 'success',
              data: { ...current.data, atomId: res.atomId },
            });
          }
          return res.atomId;
        }),
      );
  }

  /**
   * Phase I.2/I.3 — kick off a Path 2 ai_model_answer job (5 mana). Requires
   * existingQuestionId. On `ready_for_review`, patches the OE editor's
   * `model_answer` field via `currentContent` re-seed.
   */
  onModelAnswerRequested(payload: ModelAnswerRequestPayload): void {
    const atom = this.draft();
    const atomId = atom?.atomId;
    const questionId = this.existingQuestionId();
    const content = this.asOeContent(this.currentContent());
    if (!atomId || !questionId || !content) return;
    if (this.modelAnswerInFlight()) return;

    this.modelAnswerJobState.set({ status: 'submitting' });

    this.authoringService
      .generateModelAnswer(
        atomId,
        questionId,
        { question_id: questionId, regenerate: payload.regenerate },
        this.newId(),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.modelAnswerJobState.set({ status: 'submitted', job });
          this.startPollingModelAnswerJob(atomId, job);
        },
        error: (err) => {
          if (this.is402(err)) {
            const upsell = this.extractUpsell(err);
            if (upsell) {
              this.topupUpsell.set(upsell);
              this.modelAnswerJobState.set({ status: 'idle' });
              return;
            }
          }
          this.modelAnswerJobState.set({
            status: 'error',
            error: this.aiErrorKey(err),
          });
        },
      });
  }

  /** Polling backoff: 2s/4s/8s/16s cap, or `poll_after_ms` override. */
  private startPollingAiJob(atomId: string, initial: QuestionGenerationJob): void {
    if (this.isTerminalJobStatus(initial.status)) {
      this.handleAiJobTerminal(initial);
      return;
    }
    this.aiJobState.set({ status: 'polling', job: initial });
    this.pollAiJobLoop(atomId, initial.job_id, 0);
  }

  private startPollingModelAnswerJob(
    atomId: string,
    initial: QuestionGenerationJob,
  ): void {
    if (this.isTerminalJobStatus(initial.status)) {
      this.handleModelAnswerJobTerminal(initial);
      return;
    }
    this.modelAnswerJobState.set({ status: 'polling', job: initial });
    this.pollModelAnswerJobLoop(atomId, initial.job_id, 0);
  }

  private pollAiJobLoop(atomId: string, jobId: string, attempt: number): void {
    const last = this.aiJobState();
    const serverHint = last.status === 'polling' ? last.job.poll_after_ms : undefined;
    const delay = serverHint ?? this.backoffMs(attempt);
    timer(delay)
      .pipe(
        switchMap(() => this.authoringService.pollGenerationJob(atomId, jobId)),
        catchError((err) => of({ __error: err } as { __error: unknown })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if ('__error' in res) {
          this.aiJobState.set({
            status: 'error',
            error: this.aiErrorKey(res.__error),
          });
          return;
        }
        const job = res as QuestionGenerationJob;
        if (this.isTerminalJobStatus(job.status)) {
          this.handleAiJobTerminal(job);
          return;
        }
        this.aiJobState.set({ status: 'polling', job });
        this.pollAiJobLoop(atomId, jobId, attempt + 1);
      });
  }

  private pollModelAnswerJobLoop(
    atomId: string,
    jobId: string,
    attempt: number,
  ): void {
    const last = this.modelAnswerJobState();
    const serverHint = last.status === 'polling' ? last.job.poll_after_ms : undefined;
    const delay = serverHint ?? this.backoffMs(attempt);
    timer(delay)
      .pipe(
        switchMap(() => this.authoringService.pollGenerationJob(atomId, jobId)),
        catchError((err) => of({ __error: err } as { __error: unknown })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if ('__error' in res) {
          this.modelAnswerJobState.set({
            status: 'error',
            error: this.aiErrorKey(res.__error),
          });
          return;
        }
        const job = res as QuestionGenerationJob;
        if (this.isTerminalJobStatus(job.status)) {
          this.handleModelAnswerJobTerminal(job);
          return;
        }
        this.modelAnswerJobState.set({ status: 'polling', job });
        this.pollModelAnswerJobLoop(atomId, jobId, attempt + 1);
      });
  }

  private handleAiJobTerminal(job: QuestionGenerationJob): void {
    if (job.status === 'failed') {
      this.aiJobState.set({
        status: 'error',
        error: job.failure_reason
          ? 'aplus.atom_authoring.ai_assist.error_failed'
          : 'aplus.atom_authoring.ai_assist.error_generic',
        job,
      });
      return;
    }
    if (job.status === 'ready_for_review' || job.status === 'accepted') {
      const candidate = (job.drafts ?? [])[0];
      if (!candidate) {
        this.aiJobState.set({
          status: 'error',
          error: 'aplus.atom_authoring.ai_assist.error_generic',
          job,
        });
        return;
      }
      this.aiActiveDraftId.set(candidate.draft_id);
      const seeded = this.seedAiDraftContent(candidate);
      if (seeded) {
        // AI-ready re-seed: set BOTH editorSeed + currentContent.
        this.editorSeed.set(seeded);
        this.currentContent.set(seeded);
        this.aiJobState.set({ status: 'ready', job });
      } else {
        this.aiJobState.set({
          status: 'error',
          error: 'aplus.atom_authoring.ai_assist.error_generic',
          job,
        });
      }
      return;
    }
    // rejected / unexpected — surface as error
    this.aiJobState.set({
      status: 'error',
      error: 'aplus.atom_authoring.ai_assist.error_generic',
      job,
    });
  }

  private handleModelAnswerJobTerminal(job: QuestionGenerationJob): void {
    if (job.status === 'failed') {
      this.modelAnswerJobState.set({
        status: 'error',
        error: 'aplus.atom_authoring.ai_assist.error_failed',
        job,
      });
      return;
    }
    if (job.status === 'ready_for_review' || job.status === 'accepted') {
      const candidate = (job.drafts ?? [])[0];
      const ma = this.extractModelAnswer(candidate);
      const current = this.asOeContent(this.currentContent());
      if (ma && current) {
        const patched: OpenEndedContent = {
          ...current,
          oe_payload: {
            ...current.oe_payload,
            model_answer: ma,
          },
        };
        // Model-answer re-seed: set BOTH editorSeed + currentContent
        // so the OE field component receives the new model_answer
        // through its initialContent input.
        this.editorSeed.set(patched);
        this.currentContent.set(patched);
        this.modelAnswerJobState.set({ status: 'ready', job });
      } else {
        this.modelAnswerJobState.set({
          status: 'error',
          error: 'aplus.atom_authoring.ai_assist.error_generic',
          job,
        });
      }
      return;
    }
    this.modelAnswerJobState.set({
      status: 'error',
      error: 'aplus.atom_authoring.ai_assist.error_generic',
      job,
    });
  }

  /** Reshape an AI draft candidate into a McqContent or OpenEndedContent seed. */
  private seedAiDraftContent(c: QuestionDraftCandidate): AtomContent | null {
    // W8 image-gen — `QuestionDraftCandidate` (the BE `question_drafts`
    // AUTHOR projection) does not declare `image_url` on its type today, so
    // read it defensively off the candidate via a cast (matching how the
    // other optional candidate fields are read). Wire-aligned with
    // `AiAssistCandidate.image_url` (creation-questions.yaml §1404). Absent
    // today → the branch below contributes nothing (dormant).
    const draftImageUrl = (c as { image_url?: unknown }).image_url;
    const imageUrlSeed =
      typeof draftImageUrl === 'string' ? { image_url: draftImageUrl } : {};
    // W8 AUTHOR-OPT-IN — model-answer image (2nd slot). Same defensive read
    // as `image_url`: `QuestionDraftCandidate` doesn't declare it today, so
    // read it off the candidate via a cast. Absent unless the author opted
    // in (dormant). Wire-aligned with `AiAssistCandidate.answer_image_url`.
    const draftAnswerImageUrl = (c as { answer_image_url?: unknown })
      .answer_image_url;
    const answerImageUrlSeed =
      typeof draftAnswerImageUrl === 'string'
        ? { answer_image_url: draftAnswerImageUrl }
        : {};
    if (c.type === 'mcq') {
      const payload = c.payload as Partial<McqPayload>;
      if (!Array.isArray(payload?.options)) return null;
      return {
        kind: 'ai_draft',
        type: 'mcq',
        prompt: c.prompt,
        mcq_payload: {
          options: payload.options.map((o) => ({
            option_id: o.option_id ?? this.newId(),
            label: o.label ?? '',
            is_correct: !!o.is_correct,
            explainer: o.explainer ?? '',
          })),
        },
        ...imageUrlSeed,
        ...answerImageUrlSeed,
      };
    }
    if (c.type === 'oe') {
      const payload = c.payload as Partial<OePayload>;
      return {
        kind: 'ai_draft',
        type: 'oe',
        prompt: c.prompt,
        oe_payload: {
          model_answer: payload?.model_answer ?? '',
          rubric: payload?.rubric ?? [],
          min_response_chars: payload?.min_response_chars ?? null,
          max_response_chars: payload?.max_response_chars ?? null,
          grader_tier: payload?.grader_tier ?? null,
        },
        ...imageUrlSeed,
        ...answerImageUrlSeed,
      };
    }
    return null;
  }

  private extractModelAnswer(c: QuestionDraftCandidate | undefined): string | null {
    if (!c) return null;
    const p = c.payload as { model_answer?: unknown };
    return typeof p?.model_answer === 'string' ? p.model_answer : null;
  }

  private isTerminalJobStatus(s: QuestionGenerationJob['status']): boolean {
    return (
      s === 'ready_for_review' ||
      s === 'accepted' ||
      s === 'rejected' ||
      s === 'failed'
    );
  }

  private backoffMs(attempt: number): number {
    const schedule = [2000, 4000, 8000, 16000];
    return schedule[Math.min(attempt, schedule.length - 1)];
  }

  private aiErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 422 || e.status === 400)
        return 'aplus.atom_authoring.ai_assist.error_validation';
      if (e.status >= 500)
        return 'aplus.atom_authoring.ai_assist.error_upstream';
      if (e.status === 401 || e.status === 403)
        return 'aplus.atom_authoring.ai_assist.error_unauthorised';
    }
    return 'aplus.atom_authoring.ai_assist.error_generic';
  }

  /** Topup modal — Cancel / Escape / backdrop. */
  onTopupDismissed(): void {
    this.topupUpsell.set(null);
    this.manaService.clearTopupState();
  }

  /**
   * Topup modal — Confirm CTA. Mints a Stripe Checkout Session for the mana
   * pack that covers the shortfall and redirects (WS-2.2). On payment capture
   * the webhook → identity subscriber credits the wallet; the success_url
   * returns here so a subsequent load() reflects the new balance.
   */
  onTopupRequested(): void {
    const upsell = this.topupUpsell();
    if (!upsell) return;
    const gap = Math.max(0, upsell.required_units - upsell.current_balance_units);
    const sku = recommendedManaPackSku(upsell.recommended_topup_units ?? gap);
    this.manaService.checkoutMana(sku);
  }

  /** Empty MCQ seed for the picker → editor transition. */
  private emptyMcqContent(): McqContent {
    return {
      kind: 'manual',
      type: 'mcq',
      prompt: '',
      mcq_payload: {
        options: [
          { option_id: this.newId(), label: '', is_correct: true, explainer: '' },
          { option_id: this.newId(), label: '', is_correct: false, explainer: '' },
          { option_id: this.newId(), label: '', is_correct: false, explainer: '' },
          { option_id: this.newId(), label: '', is_correct: false, explainer: '' },
        ],
      },
    };
  }

  /** Empty OE seed for the picker → editor transition. */
  private emptyOeContent(): OpenEndedContent {
    return {
      kind: 'manual',
      type: 'oe',
      prompt: '',
      oe_payload: {
        model_answer: '',
        rubric: [],
        min_response_chars: null,
        max_response_chars: null,
        grader_tier: null,
      },
    };
  }

  private newId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private is402(err: unknown): boolean {
    return typeof (err as { status?: number })?.status === 'number'
      && (err as { status: number }).status === 402;
  }

  private extractUpsell(err: unknown): InsufficientManaUpsell | null {
    const e = err as { error?: { error?: { upsell?: InsufficientManaUpsell } } };
    return e?.error?.error?.upsell ?? null;
  }

  /**
   * Extract a verbatim, human-readable validation message from a 400
   * payload-invalid response so the author sees the real reason (e.g. "oe
   * payload: rubric weight_percent sum = 200; want 100") instead of the
   * generic "check the required fields" key. Scoped to known payload-validation
   * codes / message shapes to limit blast radius. bug #2-A (2026-06-03).
   */
  private backendValidationMessage(err: unknown): string | null {
    const e = err as {
      status?: number;
      error?: {
        error?: { code?: string; message?: string };
        code?: string;
        message?: string;
      };
    };
    if (e?.status !== 400) return null;
    const code = e?.error?.error?.code ?? e?.error?.code;
    const msg = e?.error?.error?.message ?? e?.error?.message;
    if (!msg) return null;
    if (
      code === 'CREATION_QUESTION_PAYLOAD_INVALID' ||
      code === 'CREATION_INVALID_BODY' ||
      /weight_percent|rubric|model_answer|response_chars|grader_tier/.test(msg)
    ) {
      return msg;
    }
    return null;
  }

  private saveErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 409) return 'aplus.atom_authoring.save_error_duplicate';
      if (e.status === 422 || e.status === 400) return 'aplus.atom_authoring.save_error_validation';
      if (e.status >= 500) return 'aplus.atom_authoring.save_error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.atom_authoring.save_error_unauthorised';
      }
    }
    return 'aplus.atom_authoring.save_error_generic';
  }

  /** Cast helper for templates needing typed access to the discriminated content. */
  asMcqContent(c: AtomContent | null): McqContent | null {
    return c?.type === 'mcq' ? c : null;
  }

  asOeContent(c: AtomContent | null): OpenEndedContent | null {
    return c?.type === 'oe' ? c : null;
  }

  /** Action code for the topup modal (used for i18n / analytics context). */
  readonly currentActionCode = computed(() =>
    this.selectedQuestionType() === 'oe'
      ? 'question_authoring_model_answer'
      : 'question_authoring_ai_draft',
  );

  // ── Field editors ─────────────────────────────────────────────────
  onTitleInput(value: string): void {
    this.title.set(value);
  }

  onBodyInput(value: string): void {
    this.body.set(value);
  }

  onCognitiveLevelChange(value: string): void {
    if (COGNITIVE_LEVELS.includes(value as CognitiveLevel)) {
      this.cognitiveLevel.set(value as CognitiveLevel);
    }
  }

  // ── A2 metadata disclosure toggle ─────────────────────────────────
  toggleMetadata(): void {
    this.metadataExpanded.update((open) => !open);
  }

  // ── AI Assist drawer ──────────────────────────────────────────────
  openAiAssist(): void {
    this.drawerClosing.set(false);
    this.aiAssistOpen.set(true);
    // Focus close button after open for keyboard users.
    queueMicrotask(() => this.drawerCloseBtn?.nativeElement.focus());
  }

  closeAiAssist(): void {
    if (!this.aiAssistOpen() || this.drawerClosing()) return;
    // Return focus to the trigger for keyboard users, but DON'T scroll — the
    // trigger sits near the top, and a plain .focus() yanked the page to the
    // top on close. preventScroll keeps the scroll position put.
    const restoreFocus = () =>
      queueMicrotask(() =>
        this.aiAssistTriggerBtn?.nativeElement.focus({ preventScroll: true }),
      );
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.aiAssistOpen.set(false);
      restoreFocus();
      return;
    }
    // Play the fade/slide-out, then unmount (2026-06-21). Duration matches the
    // CSS leave animation (.atom-authoring__drawer--closing) below.
    this.drawerClosing.set(true);
    setTimeout(() => {
      this.aiAssistOpen.set(false);
      this.drawerClosing.set(false);
      restoreFocus();
    }, 200);
  }

  setAiQuestionType(type: 'mcq' | 'oe'): void {
    this.aiQuestionType.set(type);
  }

  onAiPromptInput(value: string): void {
    this.aiPrompt.set(value);
  }

  onAiDifficultyInput(value: string | number): void {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num) && num >= 1 && num <= 5) {
      this.aiDifficulty.set(Math.round(num) as 1 | 2 | 3 | 4 | 5);
    }
  }

  onAiSubjectInput(value: string): void {
    this.aiSubject.set(value);
  }

  /** W8 — toggle the "image for the question stem" opt-in. */
  onImageForStemToggle(checked: boolean): void {
    this.imageForStem.set(checked);
  }

  /** W8 — toggle the "image for the model answer" opt-in. */
  onImageForAnswerToggle(checked: boolean): void {
    this.imageForAnswer.set(checked);
  }

  /**
   * Kick off an async AI-Assist generation. POST 202 mints the job id,
   * then 2s/90s poll drives the lifecycle. Renders pipeline_trace[]
   * live via the trace widget (IMDA D2 Transparency). On COMPLETED
   * the candidate is rendered inline in the drawer preview area; on
   * REFUSED the refusal banner shows `refusal.user_facing_message`
   * verbatim per `ai_assist.proto §251` (non-leaky).
   */
  runGenerate(): void {
    if (this.isGenerating()) return;
    const promptText = this.aiPrompt().trim();
    if (!promptText) return;

    this.state.set('GENERATING');
    this.aiAssistJobState.set({ status: 'submitting' });

    const req: AiAssistRequest = {
      question_type: this.aiQuestionType(),
      prompt: promptText,
      metadata: this.buildAiAssistMetadata(),
      max_retries: 3,
      // W8 AUTHOR-OPT-IN — forward the two image opt-ins from the drawer
      // toggles. Default false; when set, the BE generates + returns the
      // image(s) on `candidate.image_url` (stem) / `candidate.answer_image_url`
      // (model answer). Sent verbatim by `startAiAssist`.
      image_for_stem: this.imageForStem(),
      image_for_answer: this.imageForAnswer(),
    };

    this.authoringService
      .startAiAssist(req)
      .pipe(
        switchMap((initial) => {
          this.applyAiAssistJobState(initial);
          // Optimistic local echo — the 202 envelope carries the authoritative
          // `mana_charged`, so drop the balance pill instantly rather than
          // waiting for a reconcile round-trip. `applyOptimisticDebit` clamps
          // at 0 and no-ops when the balance isn't loaded; the terminal
          // `load()` below corrects any drift.
          this.manaService.applyOptimisticDebit(initial.mana_charged ?? 0);
          return this.authoringService.pollAiAssistUntilTerminal(initial.job_id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (job) => this.applyAiAssistJobState(job),
        // Reconcile the pill to the BE-authoritative balance when the job
        // reaches a terminal state. Pairs with the optimistic debit above:
        // instant echo on submit, authoritative replace on completion.
        complete: () => this.manaService.load(),
        error: (err: unknown) => {
          // A job that charged mana then failed/timed-out must still
          // reconcile, so re-fetch before branching on the error kind.
          this.manaService.load();
          const e = err as { code?: string; status?: number; message?: string };
          if (e?.code === 'ai_assist_poll_timeout') {
            this.aiAssistJobState.set({ status: 'timeout' });
            this.state.set('DRAFT');
            return;
          }
          this.aiAssistJobState.set({
            status: 'error',
            error: this.aiAssistErrorKey(err),
          });
          this.state.set('DRAFT');
        },
      });
  }

  /**
   * Build the optional metadata block forwarded to BE — `subject`,
   * `cognitive_level` (Bloom→wire) and `difficulty`. All three condition the
   * qgen generator + critic via the executor's session-state hints
   * (`subject_hint` / `cognitive_level_hint` / `difficulty_hint`) — see the
   * authoring-metadata wire-through (2026-06-03) closing the audited dead
   * controls. `difficulty` ships as the 3-bucket string the qgen agents speak
   * (`{foundation, intermediate, advanced}`) via {@link toDifficultyBucket},
   * NOT the canonical 1-5 int: the BE async handler types `metadata` as
   * `map[string]string`, so the bucket string is the ADR-157 addendum interim
   * while the full `difficulty_v2` enum/persistence migration is future work
   * (`docs/architecture/adrs/adr-157-difficulty-axis-3-bucket-enum.md`).
   */
  private buildAiAssistMetadata(): AiAssistRequest['metadata'] {
    const subject = this.aiSubject().trim();
    return {
      ...(subject ? { subject } : {}),
      cognitive_level: toWireCognitiveLevel(this.cognitiveLevel()),
      difficulty: toDifficultyBucket(this.aiDifficulty()),
    };
  }

  /**
   * Apply a fresh AI-Assist job envelope to the FSM. Branches:
   *   - QUEUED / IN_PROGRESS → status: 'polling'
   *   - COMPLETED            → status: 'completed' + sync `state` pill
   *                            + seed editor if MCQ candidate present
   *   - REFUSED              → status: 'refused' + open refusal banner
   *   - FAILED               → status: 'failed' + sync `state: DRAFT`
   */
  private applyAiAssistJobState(job: AiAssistJob): void {
    switch (job.status) {
      case 'QUEUED':
      case 'IN_PROGRESS': {
        this.aiAssistJobState.set({ status: 'polling', job });
        this.state.set('PENDING');
        break;
      }
      case 'COMPLETED': {
        this.aiAssistJobState.set({ status: 'completed', job });
        this.state.set('APPROVED');
        // Seed the editor when the BE returned a candidate so the author
        // can review + save without re-typing. Candidate is discriminated
        // by `question_type` — narrowing gives AiAssistMcqCandidate /
        // AiAssistOeCandidate with their payload fields flat on candidate
        // (per the Go source). OE seeding unhidden 2026-06-03 (OE image
        // track) now that OE author→grade→result is proven e2e.
        if (job.candidate?.question_type === 'mcq') {
          this.seedEditorFromAiAssistMcq(job.candidate);
        } else if (job.candidate?.question_type === 'oe') {
          this.seedEditorFromAiAssistOe(job.candidate);
        }
        break;
      }
      case 'REFUSED': {
        this.aiAssistJobState.set({ status: 'refused', job });
        this.state.set('REFUSED');
        this.refusalOpen.set(true);
        queueMicrotask(() => this.modalCloseBtn?.nativeElement.focus());
        break;
      }
      case 'FAILED': {
        this.aiAssistJobState.set({ status: 'failed', job });
        this.state.set('DRAFT');
        break;
      }
    }
  }

  /**
   * Seed the in-editor MCQ field component with the AI-generated
   * candidate so Save can persist it. Sets `kind: 'ai_draft'` so a
   * downstream Save routes through `acceptGenerationJob` when the
   * Phase H path-3 flow is the persistence target. (Today the drawer
   * is a standalone preview, not yet wired into Save — that
   * integration is a follow-up.)
   *
   * Wraps the BE-flat candidate (`options[]` + optional `scoring`
   * directly on the candidate) into the editor's `McqPayload`-shaped
   * `mcq_payload` field. The editor form expects the wrapped shape
   * because it doubles as the wire body for POST/PATCH question.
   */
  private seedEditorFromAiAssistMcq(candidate: AiAssistMcqCandidate): void {
    const seeded: McqContent = {
      kind: 'ai_draft',
      type: 'mcq',
      prompt: candidate.stem,
      mcq_payload: {
        options: candidate.options,
        ...(candidate.scoring ? { scoring: candidate.scoring } : {}),
      },
      // W8 image-gen — carry the generated illustration URL onto the seed
      // so the mcq-fields editor renders it beside the stem. `image_url`
      // is declared on `AiAssistCandidateBase`; absent today (dormant).
      ...(candidate.image_url ? { image_url: candidate.image_url } : {}),
      // W8 AUTHOR-OPT-IN — carry the model-answer image (2nd slot) onto the
      // seed so the mcq-fields editor renders it in the correct-answer
      // explainer area. `answer_image_url` is declared on
      // `AiAssistCandidateBase`; absent unless the author opted in (dormant).
      ...(candidate.answer_image_url
        ? { answer_image_url: candidate.answer_image_url }
        : {}),
    };
    this.editorSeed.set(seeded);
    this.currentContent.set(seeded);
    this.selectedQuestionType.set('mcq');
  }

  /**
   * Seed the in-editor OE field component with the AI-generated
   * candidate so Save can persist it. Mirrors `seedEditorFromAiAssistMcq`
   * for the open-ended branch; sets `kind: 'ai_draft'` so a downstream
   * Save routes the same way as the MCQ draft path.
   *
   * `AiAssistOeCandidate extends OePayload`, so `model_answer` + the
   * optional `rubric` / `min_response_chars` / `max_response_chars` /
   * `grader_tier` ride flat on the candidate; they are wrapped into the
   * editor's `OePayload`-shaped `oe_payload`. The generated illustration
   * URLs are carried onto the seed so `oe-fields` renders BOTH the question
   * (stem) and model-answer images and spreads them through SAVE — the OE
   * image track's payoff. Both `image_url` / `answer_image_url` are present
   * only when the author opted in (`image_for_stem` / `image_for_answer`).
   */
  private seedEditorFromAiAssistOe(candidate: AiAssistOeCandidate): void {
    const seeded: OpenEndedContent = {
      kind: 'ai_draft',
      type: 'oe',
      prompt: candidate.stem,
      // OE answer data rides nested under `oe_payload` on the wire (asymmetric
      // with MCQ's flat options) — spread it onto the editor's oe_payload
      // verbatim. Defensive fallback keeps the editor mountable if a future
      // candidate omits it.
      oe_payload: candidate.oe_payload ?? { model_answer: '' },
      ...(candidate.image_url ? { image_url: candidate.image_url } : {}),
      ...(candidate.answer_image_url
        ? { answer_image_url: candidate.answer_image_url }
        : {}),
    };
    this.editorSeed.set(seeded);
    this.currentContent.set(seeded);
    this.selectedQuestionType.set('oe');
  }

  /** Map a transport / BFF error to a translation key. */
  private aiAssistErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 422 || e.status === 400) {
        return 'aplus.atom_authoring.ai_assist.error_validation';
      }
      if (e.status >= 500) {
        return 'aplus.atom_authoring.ai_assist.error_upstream';
      }
      if (e.status === 401 || e.status === 403) {
        return 'aplus.atom_authoring.ai_assist.error_unauthorised';
      }
    }
    return 'aplus.atom_authoring.ai_assist.error_generic';
  }

  // ── Refusal banner ──────────────────────────────────────────────
  closeRefusalDialog(): void {
    this.refusalOpen.set(false);
  }

  /**
   * Try again after a refusal — clear the refusal state + close the
   * banner. The author edits the prompt manually and re-submits.
   * Replaces the legacy `acceptRewrite()` (which depended on the
   * FE-fabricated `suggestedRewrite` block that the BE wire no longer
   * carries).
   */
  refusalTryAgain(): void {
    this.aiAssistJobState.set({ status: 'idle' });
    this.state.set('DRAFT');
    this.refusalOpen.set(false);
    queueMicrotask(() => this.aiAssistTriggerBtn?.nativeElement.focus());
  }

  // ── Publish ──────────────────────────────────────────────────────
  publish(): void {
    // No-op for the demo: wave-4 wires the BFF AtomRevision append call.
    if (!this.canPublish()) return;
  }

  // ── Keyboard handling (Escape closes drawer + refusal banner) ─────
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.refusalOpen()) {
      this.closeRefusalDialog();
      return;
    }
    if (this.aiAssistOpen()) {
      this.closeAiAssist();
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  isAiQuestionType(type: 'mcq' | 'oe'): boolean {
    return this.aiQuestionType() === type;
  }

  /**
   * Live MCQ candidate from the most recent terminal `COMPLETED`
   * envelope. Drives the inline drawer preview. Null when the job
   * is non-terminal or non-MCQ.
   */
  readonly aiAssistMcqCandidate = computed<McqPayload | null>(() => {
    const s = this.aiAssistJobState();
    if (s.status !== 'completed') return null;
    const c = s.job.candidate;
    if (c?.question_type !== 'mcq') return null;
    return {
      options: c.options,
      ...(c.scoring ? { scoring: c.scoring } : {}),
    };
  });

  /**
   * Live OE candidate from the most recent terminal `COMPLETED`
   * envelope. Drives the inline drawer preview. Null when the job is
   * non-terminal or non-OE. Mirrors `aiAssistMcqCandidate`. The stem and
   * both illustration URLs are read via the type-agnostic
   * `aiAssistCandidateStem` / `aiAssistCandidateImageUrl` /
   * `aiAssistCandidateAnswerImageUrl` computeds (shared with MCQ).
   */
  readonly aiAssistOeCandidate = computed<OePayload | null>(() => {
    const s = this.aiAssistJobState();
    if (s.status !== 'completed') return null;
    const c = s.job.candidate;
    if (c?.question_type !== 'oe') return null;
    // OE answer data rides nested under `oe_payload` (see AiAssistOeCandidate).
    return c.oe_payload ?? null;
  });

  /** MCQ candidate stem string (template convenience). */
  readonly aiAssistCandidateStem = computed<string>(() => {
    const s = this.aiAssistJobState();
    if (s.status !== 'completed') return '';
    return s.job.candidate?.stem ?? '';
  });

  /**
   * Generated illustration URL for the in-drawer candidate preview (W8
   * image-gen). Reads `candidate.image_url` off the COMPLETED envelope —
   * declared on `AiAssistCandidate` (creation-questions.yaml §1404). Null
   * when the job is non-terminal or no image was generated (dormant today),
   * so the conditional `<img>` in the drawer preview stays hidden.
   */
  readonly aiAssistCandidateImageUrl = computed<string | null>(() => {
    const s = this.aiAssistJobState();
    if (s.status !== 'completed') return null;
    return s.job.candidate?.image_url ?? null;
  });

  /**
   * Generated MODEL-ANSWER image URL for the in-drawer candidate preview
   * (W8 AUTHOR-OPT-IN, 2nd slot). Reads `candidate.answer_image_url` off the
   * COMPLETED envelope — populated by the BE only when the request set
   * `image_for_answer: true`. Null when the job is non-terminal or no answer
   * image was generated (dormant today), so the conditional `<img>` in the
   * drawer preview stays hidden. Mirrors `aiAssistCandidateImageUrl` above.
   */
  readonly aiAssistCandidateAnswerImageUrl = computed<string | null>(() => {
    const s = this.aiAssistJobState();
    if (s.status !== 'completed') return null;
    return s.job.candidate?.answer_image_url ?? null;
  });

  /** Soft warning shown when the critic flagged a residual concern. */
  readonly aiAssistQualityWarning = computed<string | null>(() => {
    const s = this.aiAssistJobState();
    if (s.status !== 'completed') return null;
    if (!s.job.quality_warning) return null;
    return s.job.candidate?.critic_notes ?? '';
  });

  /** Refusal block from a REFUSED terminal envelope. */
  readonly aiAssistRefusal = computed(() => {
    const s = this.aiAssistJobState();
    if (s.status !== 'refused') return null;
    return s.job.refusal ?? null;
  });

  /** i18n key for the surface-level status pill. */
  stateKey(): string {
    return `aplus.atom_authoring.state_${this.state().toLowerCase()}`;
  }
}
