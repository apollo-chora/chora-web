/**
 * QuizBuilderComponent — R+ M9 wave-5 (real composer, real BFF wiring).
 *
 * Real authoring composer for /r/classroom/quiz-builder.
 *
 * Author flow (Mr. Chen drafts CSPO Sprint Planning quiz):
 *   1. Page opens with a blank DRAFT working copy (no fixtures).
 *   2. Author sets title, course id, adds questions, picks correct option.
 *   3. Save Draft → POST /api/v1/live-quizzes (first save) or
 *      PATCH /api/v1/live-quizzes/{id} (subsequent saves).
 *   4. Publish → POST /api/v1/live-quizzes/{id}/publish (DRAFT → PUBLISHED).
 *
 * Publish CTA is gated on isQuizDraftValid (≥1 well-formed question + title).
 *
 * Per chora-web/CLAUDE.md §3 — all HTTP goes via BffClientService through
 * QuizBuilderService. Standalone component, OnPush, signal-first state,
 * ReactiveForms for the input controls (signals read via formGroup.value).
 *
 * The wave-3 mock CSPO fixture is GONE; FE-only positional A/B/C/D markers
 * stay (per `feedback_mcq_option_naming`).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AtomQuestionPickerComponent } from '../../aplus/atom-question-picker/atom-question-picker.component';
import { AtomQuestionPickerService } from '../../aplus/atom-question-picker/atom-question-picker.service';
import type { QuestionRef } from '../../aplus/atom-question-picker/atom-question-picker.model';
import type {
  AtomProjection,
  AtomProjectionMcqPayload,
} from '../../aplus/test-set-editor/test-set-editor.model';
import { QuizBuilderService } from './quiz-builder.service';
import { ClassroomService } from '../classroom/classroom.service';
import {
  blankDraft,
  blankItem,
  coerceExplainerMode,
  EXPLAINER_MODES,
  isQuizDraftValid,
  itemFromAtom,
  MAX_QUIZ_TIME_LIMIT_SECONDS,
  MAX_SCORE_POINTS,
  MAX_TIMER_SECONDS,
  MIN_QUIZ_TIME_LIMIT_SECONDS,
  MIN_SCORE_POINTS,
  MIN_TIMER_SECONDS,
  toCreatePayload,
  toPatchPayload,
  totalScore,
  totalSeconds,
  validateQuizItem,
  type ExplainerMode,
  type QuizDraft,
  type QuizItemDraft,
  type QuizOptionDraft,
  type QuizOptionKey,
} from './quiz-builder.model';

/** Local-only counter for new question ids. */
let questionIdCounter = 1;
function nextQuestionId(): string {
  questionIdCounter += 1;
  return `q-${Date.now()}-${questionIdCounter}`;
}

@Component({
  selector: 'chora-rplus-quiz-builder',
  imports: [ReactiveFormsModule, TranslatePipe, AtomQuestionPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quiz-builder.component.html',
  styleUrl: './quiz-builder.component.scss',
})
export class QuizBuilderComponent implements OnInit {
  private readonly service = inject(QuizBuilderService);
  /**
   * Reused Content-Creation question search adapter (A+ X.1) — drives the
   * embedded `AtomQuestionPickerComponent` (which calls
   * `GET /api/atoms/questions/search` itself) and lets us lazily fetch the
   * full atom projection on selection so the composed MCQ shell is
   * pre-filled from the chosen LearningAtom (atom-centric SP-02 snapshot).
   */
  private readonly atomPicker = inject(AtomQuestionPickerService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  /** L5: launch a live session from a PUBLISHED quiz + jump to the presenter. */
  private readonly router = inject(Router);
  private readonly classroom = inject(ClassroomService);

  /** Mutable working copy. Starts as a fresh blank DRAFT. */
  private readonly draftSignal = signal<QuizDraft>(blankDraft());

  /** Index of the currently-selected item (preview pane focus). */
  readonly selectedIndex = signal<number>(0);

  /** UX flag — true while a save/publish round-trip is inflight. */
  readonly saving = signal<boolean>(false);

  /** L5 — true while the launch-session round-trip is inflight. */
  readonly launching = signal<boolean>(false);

  /** UX flag — last operation's surfaced error message (translation key). */
  readonly errorMessage = signal<string>('');

  /** UX flag — last operation's success banner (translation key). */
  readonly statusMessage = signal<string>('');

  readonly minTimer = MIN_TIMER_SECONDS;
  readonly maxTimer = MAX_TIMER_SECONDS;
  readonly minScore = MIN_SCORE_POINTS;
  readonly maxScore = MAX_SCORE_POINTS;
  readonly minQuizLimit = MIN_QUIZ_TIME_LIMIT_SECONDS;
  readonly maxQuizLimit = MAX_QUIZ_TIME_LIMIT_SECONDS;

  /** Ordered explainer-mode options for the selector. */
  readonly explainerModes = EXPLAINER_MODES;

  /**
   * Draft state for the "Add from Atom" affordance. The composer now hosts
   * the reused `AtomQuestionPickerComponent` (searches
   * `GET /api/atoms/questions/search`) instead of a manual atom-id paste.
   */
  readonly atomComposerOpen = signal<boolean>(false);
  /** True while the chosen atom's full projection is being fetched. */
  readonly atomComposing = signal<boolean>(false);

  /** Form group backing the quiz-level title + course id fields. */
  readonly metaForm: FormGroup;

  readonly draft = computed<QuizDraft>(() => this.draftSignal());

  readonly items = computed<readonly QuizItemDraft[]>(
    () => this.draftSignal().items,
  );

  readonly selectedItem = computed<QuizItemDraft | null>(() => {
    const idx = this.selectedIndex();
    return this.items()[idx] ?? null;
  });

  readonly totalScore = computed<number>(() => totalScore(this.draftSignal()));
  readonly totalSeconds = computed<number>(() =>
    totalSeconds(this.draftSignal()),
  );
  readonly isValid = computed<boolean>(() =>
    isQuizDraftValid(this.draftSignal()),
  );

  readonly state = computed<string>(() => this.draftSignal().state);

  readonly quizTimeLimitSeconds = computed<number>(
    () => this.draftSignal().quizTimeLimitSeconds,
  );

  readonly explainerMode = computed<ExplainerMode>(
    () => this.draftSignal().explainerMode,
  );

  readonly isPublished = computed<boolean>(
    () => this.draftSignal().state !== 'DRAFT',
  );

  readonly hasUnsavedId = computed<boolean>(
    () => this.draftSignal().id === '',
  );

  constructor() {
    this.metaForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(255)]],
      courseId: [''],
    });
  }

  ngOnInit(): void {
    // Wire form-level inputs into the working-copy signal so all read paths
    // (totalScore / isValid / preview) react in lockstep.
    this.metaForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.draftSignal.update((d) => ({
          ...d,
          title: typeof value.title === 'string' ? value.title : d.title,
          courseId:
            typeof value.courseId === 'string' ? value.courseId : d.courseId,
        }));
      });
  }

  // -------------------------------------------------------------------------
  // Item composition
  // -------------------------------------------------------------------------

  selectItem(index: number): void {
    this.selectedIndex.set(index);
  }

  addQuestion(): void {
    if (this.isPublished()) return;
    const fresh = blankItem(nextQuestionId());
    const next = [...this.draftSignal().items, fresh];
    this.draftSignal.update((d) => ({ ...d, items: next }));
    this.selectedIndex.set(next.length - 1);
  }

  removeQuestion(questionId: string): void {
    if (this.isPublished()) return;
    const next = this.draftSignal().items.filter(
      (it) => it.questionId !== questionId,
    );
    this.draftSignal.update((d) => ({ ...d, items: next }));
    if (this.selectedIndex() >= next.length) {
      this.selectedIndex.set(Math.max(0, next.length - 1));
    }
  }

  setCorrect(questionId: string, key: QuizOptionKey): void {
    this.mutateItem(questionId, (i) => ({ ...i, correctKey: key }));
  }

  setTimer(questionId: string, seconds: number): void {
    const clamped = Math.max(
      MIN_TIMER_SECONDS,
      Math.min(MAX_TIMER_SECONDS, Math.round(seconds)),
    );
    this.mutateItem(questionId, (i) => ({ ...i, timerSeconds: clamped }));
  }

  /**
   * Live (input) commit — only when the typed value is already in range.
   * Clamping mid-keystroke rewrites the field under the caret (typing "20"
   * clamped the intermediate "2" to 5 → the user ended up with "50" — the
   * §4.6 spinbutton quirk). Out-of-range intermediates stay local to the
   * input; (change) — blur/Enter/spinner — commits through setTimer's clamp.
   */
  setTimerSoft(questionId: string, seconds: number): void {
    if (seconds >= MIN_TIMER_SECONDS && seconds <= MAX_TIMER_SECONDS) {
      this.setTimer(questionId, seconds);
    }
  }

  setScore(questionId: string, points: number): void {
    const clamped = Math.max(
      MIN_SCORE_POINTS,
      Math.min(MAX_SCORE_POINTS, Math.round(points)),
    );
    this.mutateItem(questionId, (i) => ({ ...i, scorePoints: clamped }));
  }

  /** Same input/change split as setTimerSoft, for the points field. */
  setScoreSoft(questionId: string, points: number): void {
    if (points >= MIN_SCORE_POINTS && points <= MAX_SCORE_POINTS) {
      this.setScore(questionId, points);
    }
  }

  /** L5.2 (ADR-179 ruling 4) — toggle the per-question ×2 round flag. */
  setDoublePoints(questionId: string, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.mutateItem(questionId, (i) => ({ ...i, doublePoints: checked }));
  }

  setPrompt(questionId: string, prompt: string): void {
    this.mutateItem(questionId, (i) => ({ ...i, prompt }));
  }

  setOptionText(questionId: string, key: QuizOptionKey, text: string): void {
    this.mutateItem(questionId, (i) => ({
      ...i,
      options: i.options.map((o: QuizOptionDraft) =>
        o.key === key ? { ...o, text } : o,
      ),
    }));
  }

  /** Set a single option's post-reveal explainer (ADR-168 Task #9). */
  setOptionExplainer(
    questionId: string,
    key: QuizOptionKey,
    explainer: string,
  ): void {
    this.mutateItem(questionId, (i) => ({
      ...i,
      options: i.options.map((o: QuizOptionDraft) =>
        o.key === key ? { ...o, explainer } : o,
      ),
    }));
  }

  /**
   * Set the whole-quiz time-limit budget. 0 (or blank) = unlimited; any
   * positive value is clamped to [MIN_QUIZ_TIME_LIMIT, MAX_QUIZ_TIME_LIMIT].
   */
  setQuizTimeLimit(seconds: number): void {
    if (this.isPublished()) return;
    const rounded = Math.round(Number.isFinite(seconds) ? seconds : 0);
    const clamped =
      rounded <= 0
        ? 0
        : Math.max(
            MIN_QUIZ_TIME_LIMIT_SECONDS,
            Math.min(MAX_QUIZ_TIME_LIMIT_SECONDS, rounded),
          );
    this.draftSignal.update((d) => ({ ...d, quizTimeLimitSeconds: clamped }));
  }

  /** Set the post-reveal explainer disclosure policy (ADR-168 Task #9). */
  setExplainerMode(mode: string): void {
    if (this.isPublished()) return;
    const safe = coerceExplainerMode(mode);
    this.draftSignal.update((d) => ({ ...d, explainerMode: safe }));
  }

  // -------------------------------------------------------------------------
  // Add from Atom (ADR-168 Task #9)
  // -------------------------------------------------------------------------

  openAtomComposer(): void {
    if (this.isPublished()) return;
    this.atomComposerOpen.set(true);
  }

  cancelAtomComposer(): void {
    this.atomComposerOpen.set(false);
    this.atomComposing.set(false);
  }

  /**
   * Handle a question picked in the embedded `AtomQuestionPickerComponent`
   * (its per-row "+" quick-add emits `pickedQuestion`). Per BE round-22 a
   * "question" IS an atom intra-domain, so the picker's `QuestionRef.id` is
   * the LearningAtom id we snapshot from.
   *
   * Compose flow (atom-centric SP-02 — the question OWNS its snapshot, the
   * atom_id is provenance only):
   *   1. Fetch the full atom projection via the reused
   *      `AtomQuestionPickerService.getAtomProjection(id)`.
   *   2. Pre-fill the MCQ prompt + 4 options from `mcq_payload` when present;
   *      otherwise fall back to the picker's lightweight `stem`/`title`.
   *   3. If the projection fetch fails (or the atom isn't an MCQ), still
   *      compose a shell from the `QuestionRef` so the author can fill it in
   *      — the atom_id provenance is preserved either way.
   */
  onAtomPicked(ref: QuestionRef): void {
    if (this.isPublished()) return;
    const atomId = ref.id.trim();
    if (atomId.length === 0) {
      this.errorMessage.set('rplus.quizBuilder.error_atom_id_required');
      return;
    }
    this.errorMessage.set('');
    this.atomComposing.set(true);
    this.atomPicker
      .getAtomProjection(atomId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (atom) => this.composeFromAtom(atomId, ref, atom),
        // Fail soft: an atom with no learner-safe projection (or a transient
        // upstream error) still composes a shell from the picker ref so the
        // author can author the question by hand. atom_id provenance kept.
        error: () => this.composeFromAtom(atomId, ref, null),
      });
  }

  /**
   * Build + append a quiz item from a picked atom. Pure of HTTP — the
   * projection (if any) has already been resolved by `onAtomPicked`.
   */
  private composeFromAtom(
    atomId: string,
    ref: QuestionRef,
    atom: AtomProjection | null,
  ): void {
    const mcq: AtomProjectionMcqPayload | null = atom?.mcq_payload ?? null;
    const prompt = (mcq?.prompt ?? ref.stem ?? ref.title ?? '').trim();
    const options = (mcq?.options ?? []).slice(0, 4).map((o) => ({
      // Prefer the human-readable option text; fall back to the label.
      text: (o.text ?? o.label ?? '').trim(),
      explainer: '',
    }));
    const fresh = itemFromAtom(nextQuestionId(), atomId, {
      prompt,
      options:
        options.length > 0
          ? options
          : [
              { text: '', explainer: '' },
              { text: '', explainer: '' },
              { text: '', explainer: '' },
              { text: '', explainer: '' },
            ],
      correctKey: 'A',
    });
    const next = [...this.draftSignal().items, fresh];
    this.draftSignal.update((d) => ({ ...d, items: next }));
    this.selectedIndex.set(next.length - 1);
    this.atomComposing.set(false);
    this.atomComposerOpen.set(false);
    this.errorMessage.set('');
  }

  errorsFor(item: QuizItemDraft): readonly string[] {
    return validateQuizItem(item);
  }

  /** Read parsed number value out of an input event. */
  numberFromEvent(event: Event): number {
    const target = event.target as HTMLInputElement | null;
    return Number(target?.value ?? 0);
  }

  /** Read string value out of an input event. */
  stringFromEvent(event: Event): string {
    const target = event.target as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    return target?.value ?? '';
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  saveDraft(): void {
    if (this.isPublished()) {
      this.errorMessage.set('rplus.quizBuilder.error_published_immutable');
      return;
    }
    // Push current form into draft state before serialising.
    const formValue = this.metaForm.value;
    const current: QuizDraft = {
      ...this.draftSignal(),
      title:
        typeof formValue.title === 'string'
          ? formValue.title
          : this.draftSignal().title,
      courseId:
        typeof formValue.courseId === 'string'
          ? formValue.courseId
          : this.draftSignal().courseId,
    };
    if (current.title.trim().length === 0) {
      this.metaForm.markAllAsTouched();
      this.errorMessage.set('rplus.quizBuilder.error_title_required');
      return;
    }
    this.errorMessage.set('');
    this.statusMessage.set('');
    this.saving.set(true);
    if (current.id === '') {
      this.service
        .create(toCreatePayload(current))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (created) => {
            // Merge id + state from the BE response, but keep the local
            // questions (they aren't sent on create — the BE starts empty).
            const merged: QuizDraft = {
              ...current,
              id: created.id,
              state: created.state,
            };
            // If the author already added questions before first save, do
            // a follow-up PATCH so they aren't lost.
            if (merged.items.length > 0) {
              this.runPatch(merged);
            } else {
              this.draftSignal.set(merged);
              this.saving.set(false);
              this.statusMessage.set('rplus.quizBuilder.status_saved');
            }
          },
          error: (err: unknown) => {
            this.saving.set(false);
            this.errorMessage.set(this.errKey(err));
          },
        });
    } else {
      this.runPatch(current);
    }
  }

  publish(): void {
    const current = this.draftSignal();
    if (current.id === '') {
      // Must save first; the BE has no id to publish against.
      this.errorMessage.set('rplus.quizBuilder.error_save_before_publish');
      return;
    }
    if (!this.isValid()) {
      this.errorMessage.set('rplus.quizBuilder.error_invalid_draft');
      return;
    }
    this.errorMessage.set('');
    this.statusMessage.set('');
    this.saving.set(true);
    this.service
      .publish(current.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (published) => {
          this.draftSignal.set(published);
          this.saving.set(false);
          this.statusMessage.set('rplus.quizBuilder.status_published');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.errKey(err));
        },
      });
  }

  /**
   * L5 — launch a live classroom session from a PUBLISHED quiz. Calls
   * POST /api/v1/live-quizzes/{id}/sessions (creates an ARMED session) then
   * navigates to the R+ presenter (/r/classroom?session_id=...) where the
   * instructor arms + runs the quiz for joined learners.
   */
  launchSession(): void {
    const current = this.draftSignal();
    if (!this.isPublished() || current.id === '') {
      this.errorMessage.set('rplus.quizBuilder.error_publish_before_launch');
      return;
    }
    this.errorMessage.set('');
    this.launching.set(true);
    this.classroom
      .startSession(current.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.launching.set(false);
          void this.router.navigate(['/r/classroom'], {
            queryParams: { session_id: session.id },
          });
        },
        error: (err: unknown) => {
          this.launching.set(false);
          this.errorMessage.set(this.errKey(err));
        },
      });
  }

  private runPatch(draft: QuizDraft): void {
    this.service
      .update(draft.id, toPatchPayload(draft))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.draftSignal.set(updated);
          this.saving.set(false);
          this.statusMessage.set('rplus.quizBuilder.status_saved');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.errKey(err));
        },
      });
  }

  private errKey(err: unknown): string {
    // Map BE HTTP code to a translation key so the inline alert speaks
    // the operator's language. Per chora-web/CLAUDE.md §12 every visible
    // string must come from i18n.
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status: number }).status)
        : 0;
    if (status === 409) return 'rplus.quizBuilder.error_conflict';
    if (status === 403) return 'rplus.quizBuilder.error_forbidden';
    if (status === 400) return 'rplus.quizBuilder.error_validation';
    return 'rplus.quizBuilder.error_generic';
  }

  private mutateItem(
    questionId: string,
    fn: (i: QuizItemDraft) => QuizItemDraft,
  ): void {
    if (this.isPublished()) return;
    const items = this.draftSignal().items.map((i) =>
      i.questionId === questionId ? fn(i) : i,
    );
    this.draftSignal.update((d) => ({ ...d, items }));
  }
}
