/**
 * TestSetEditorComponent — A+ X.2 (ADR-155).
 *
 * Host surface for the test-set editor + list. The component decides its
 * internal mode from the route shape:
 *
 *   /a/studio/test-sets                  → list mode (cards of caller's test-sets)
 *   /a/studio/test-sets/new              → new mode (mint draft + redirect)
 *   /a/studio/test-sets/:testSetId/edit  → edit mode (load + edit the test-set)
 *
 * Legacy /a/test-sets/* paths redirect into the new family — see
 * aplus.routes.ts for the bookmark-preservation entries.
 *
 * The mode is resolved without route data — the route entries in
 * aplus.routes.ts all point at this component; mode = derive from the
 * presence/absence of the `:testSetId` param + the trailing URL segment
 * (matched against `url[]` for `new` vs `:testSetId/edit`).
 *
 * Embeds `AtomQuestionPickerComponent` (X.1) in edit mode; on
 * `pickedQuestion` event, POSTs to `/api/v1/test-sets/:id/questions` with
 * `points=10` default.
 *
 * Per chora-web CLAUDE.md:
 *   - Standalone + OnPush
 *   - signals (signal/computed/effect)
 *   - @if/@for control flow
 *   - data-testid selectors
 *   - BFF-only HTTP via the service layer
 *
 * Per ADR-155 D5: PUBLISHED test-sets are IMMUTABLE — the editor surfaces
 * an "Archive + Create new" CTA instead of edit controls. v1 demo edit-
 * flow per ADR-155 D8 is archive + new (no fork endpoint).
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { EMPTY, forkJoin, of, type Observable } from 'rxjs';
import { expand, reduce, switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ChoraQuestionReviewComponent } from '../../../../shared/components/chora-question-review/chora-question-review.component';
import type { QuestionReview } from '../../../../shared/components/chora-question-review/chora-question-review.model';
import { ChoraQuestionEditorComponent } from '../../../../shared/components/chora-question-editor/chora-question-editor.component';
import { ChoraQuestionImageComponent } from '../../../../shared/components/chora-question-image/chora-question-image.component';
import {
  toEditableQuestion,
  validateEditableQuestion,
  type EditableQuestion,
} from '../../../../shared/components/chora-question-editor/chora-question-editor.model';
import { type EditQuestionRequest } from '../atom-authoring/atom-authoring.model';
import { AtomQuestionPickerComponent } from '../atom-question-picker/atom-question-picker.component';
import type { QuestionRef } from '../atom-question-picker/atom-question-picker.model';
import { StudioSubNavComponent } from '../studio/studio-sub-nav.component';
import { QuestionBanksService } from '../question-banks/question-banks.service';
import type { QuestionBankItem } from '../question-banks/question-banks.model';
import { TestSetService } from './test-set.service';
import {
  POINTS_DEFAULT,
  POINTS_MAX,
  POINTS_MIN,
  type TestSet,
  type TestSetEditorAction,
  type TestSetEditorLoadState,
  type TestSetListLoadState,
  type TestSetQuestion,
} from './test-set-editor.model';

type EditorMode = 'list' | 'new' | 'edit';

@Component({
  selector: 'chora-aplus-test-set-editor',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    AtomQuestionPickerComponent,
    StudioSubNavComponent,
    ChoraQuestionReviewComponent,
    ChoraQuestionEditorComponent,
    ChoraQuestionImageComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './test-set-editor.component.html',
  styleUrl: './test-set-editor.component.scss',
})
export class TestSetEditorComponent implements OnInit {
  private readonly service = inject(TestSetService);
  private readonly questionBanks = inject(QuestionBanksService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Mode is derived from route shape; never mutated after construction. */
  readonly mode: EditorMode = this.deriveMode();

  // ── List-mode state ────────────────────────────────────────────────
  private readonly _listState = signal<TestSetListLoadState>({ status: 'loading' });
  readonly listState = this._listState.asReadonly();
  readonly listSets = computed<readonly TestSet[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.sets : [];
  });
  readonly listIsLoading = computed(() => this._listState().status === 'loading');
  readonly listIsError = computed(() => this._listState().status === 'error');
  readonly listIsEmpty = computed(
    () => this._listState().status === 'success' && this.listSets().length === 0,
  );
  readonly listErrorKey = computed(() => {
    const s = this._listState();
    return s.status === 'error' ? s.error : '';
  });

  // ── Editor-mode state ──────────────────────────────────────────────
  private readonly _editorState = signal<TestSetEditorLoadState>({ status: 'loading' });
  readonly editorState = this._editorState.asReadonly();
  readonly editorIsLoading = computed(
    () => this.mode === 'edit' && this._editorState().status === 'loading',
  );
  readonly editorIsError = computed(() => this._editorState().status === 'error');
  readonly editorErrorKey = computed(() => {
    const s = this._editorState();
    return s.status === 'error' ? s.error : '';
  });
  readonly testSet = computed(() => {
    const s = this._editorState();
    return s.status === 'success' ? s.testSet : null;
  });
  readonly testSetQuestions = computed<readonly TestSetQuestion[]>(
    () => this.testSet()?.questions ?? [],
  );
  readonly isPublished = computed(() => this.testSet()?.state === 'PUBLISHED');
  readonly isArchived = computed(() => this.testSet()?.state === 'ARCHIVED');
  readonly canEdit = computed(() => {
    const s = this.testSet()?.state;
    return s === 'DRAFT';
  });

  // ── Submit action states ────────────────────────────────────────────
  readonly createAction = signal<TestSetEditorAction>({ status: 'idle' });
  readonly publishAction = signal<TestSetEditorAction>({ status: 'idle' });
  readonly archiveAction = signal<TestSetEditorAction>({ status: 'idle' });
  readonly addQuestionAction = signal<TestSetEditorAction>({ status: 'idle' });
  readonly reorderAction = signal<TestSetEditorAction>({ status: 'idle' });
  /** Editable title draft (FE-BUG-5 fix). Saved on blur or Enter. */
  readonly titleDraft = signal<string>('');
  readonly titleAction = signal<TestSetEditorAction>({ status: 'idle' });

  /**
   * Per-atom title + stem cache for "Included questions" rendering on
   * DRAFT test-sets. BE captures `snapshot.{atom_title, prompt_preview}`
   * only at publish time, so DRAFT rows used to fall through to the
   * "Question content snapshot captured at publish (019e3…)" placeholder.
   * Lazy-fetch the atom projection on first render and cache the title +
   * stem so the row carries something meaningful immediately.
   */
  private readonly _atomTitles = signal<
    Readonly<Record<string, { title: string; stem: string }>>
  >({});
  readonly atomTitles = this._atomTitles.asReadonly();

  /**
   * Per-atom full answer-key cache. Keyed by `question_atom_id`. The test-set
   * rows render from the publish-time `snapshot` (stem only) or the learner-
   * safe atom projection — neither carries the correct answer, the per-option
   * grounding/explainer, the OE model answer/rubric, nor the author
   * illustrations. Lazy-fetch the AUTHOR question projection
   * (`getQuestionDetail`) per row so the "Included questions" reveal shows the
   * FULL question + answers + grounding (this is an author surface — the
   * answer key is in-scope here). Drives `<chora-question-review>`.
   */
  private readonly _questionDetails = signal<
    Readonly<Record<string, QuestionReview>>
  >({});
  readonly questionDetails = this._questionDetails.asReadonly();

  // ── Inline question editing (#6, 2026-06-20) ───────────────────────
  /** Working editable copy per test_set_question_id (seeded from the detail). */
  private readonly _questionEdits = signal<Readonly<Record<string, EditableQuestion>>>({});
  /** JSON snapshot of the seed per tsqId for dirty-checking. */
  private readonly _questionOriginals = signal<Readonly<Record<string, string>>>({});
  /** Per-question save lifecycle. */
  private readonly _questionSave = signal<
    Readonly<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>
  >({});

  /**
   * CHO-2402 — the stem pinned at publish, or '' when the row has none.
   * Template and spec read this rather than reaching into the payload shape.
   */
  pinnedStemFor(q: TestSetQuestion): string {
    return pinnedStem(q);
  }

  /** Point bounds (for slider template). */
  readonly pointsMin = POINTS_MIN;
  readonly pointsMax = POINTS_MAX;
  readonly pointsDefault = POINTS_DEFAULT;

  constructor() {
    // Hydrate `_atomTitles` for any test-set question whose snapshot is
    // missing (DRAFT rows). Reads `testSetQuestions()` reactively; new
    // rows added later (quick-add, bulk-add) are picked up next tick.
    effect(() => {
      const rows = this.testSetQuestions();
      const cache = this._atomTitles();
      for (const q of rows) {
        // CHO-2402 — a row that carries the copy pinned at publish is already
        // showing what the sitting serves. Asking the live atom would replace
        // it with wording the learners never see.
        if (pinnedStem(q) !== '') continue;
        const hasSnapshot =
          (q.snapshot?.prompt_preview && q.snapshot.prompt_preview.trim() !== '') ||
          (q.snapshot?.atom_title && q.snapshot.atom_title.trim() !== '');
        if (hasSnapshot) continue;
        if (cache[q.question_atom_id]) continue;
        this.service
          .getAtomProjection(q.question_atom_id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (atom) => {
              const stem =
                atom.mcq_payload?.prompt ??
                atom.oe_payload?.prompt ??
                '';
              this._atomTitles.set({
                ...this._atomTitles(),
                [q.question_atom_id]: {
                  title: atom.title ?? '',
                  stem,
                },
              });
            },
            error: () => {
              // Fail-loud at the row level — fall back to the truncated
              // atom-id placeholder. Don't mutate the cache so a retry
              // (e.g. next render after a save) can try again.
            },
          });
      }
    });

    // Hydrate `_questionDetails` for every row (MCQ + OE) so the "Included
    // questions" reveal renders the full question + correct answer + grounding
    // + illustrations. The snapshot/projection the rows render from omit the
    // answer key, so fetch the AUTHOR question projection per row.
    effect(() => {
      const rows = this.testSetQuestions();
      const cache = this._questionDetails();
      for (const q of rows) {
        if (!q.question_id) continue;
        if (cache[q.question_atom_id]) continue;
        // CHO-2402 — a PUBLISHED row is served from its own pinned payload, so
        // build the reveal from that rather than from the live question. The
        // pinned copy carries the stem, the options, the answer key and each
        // option's explainer, which is everything the reveal renders.
        const pinned = reviewFromPinned(q);
        if (pinned) {
          this._questionDetails.set({ ...this._questionDetails(), [q.question_atom_id]: pinned });
          this.seedEdit(q.test_set_question_id, pinned);
          continue;
        }
        this.service
          .getQuestionDetail(q.question_atom_id, q.question_id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (review) => {
              this._questionDetails.set({
                ...this._questionDetails(),
                [q.question_atom_id]: review,
              });
              this.seedEdit(q.test_set_question_id, review);
            },
            error: () => {
              // Fail-soft — a missing/forbidden detail just hides the reveal.
            },
          });
      }
    });
  }

  /** Full answer-key reveal for a row, or null until the fetch resolves. */
  questionReviewFor(atomId: string): QuestionReview | null {
    return this._questionDetails()[atomId] ?? null;
  }

  // ── Inline question editing (#6) ───────────────────────────────────
  /** Seed (or re-seed post-save) the editable copy + dirty baseline. */
  private seedEdit(tsqId: string, review: QuestionReview): void {
    const editable = toEditableQuestion(review);
    this._questionEdits.set({ ...this._questionEdits(), [tsqId]: editable });
    this._questionOriginals.set({
      ...this._questionOriginals(),
      [tsqId]: JSON.stringify(editable),
    });
  }

  /** Editable copy for a row, or null until its detail has hydrated. */
  editableFor(tsqId: string): EditableQuestion | null {
    return this._questionEdits()[tsqId] ?? null;
  }

  /** Editor change handler — store the latest edited value for the row. */
  onQuestionEdited(tsqId: string, value: EditableQuestion): void {
    this._questionEdits.set({ ...this._questionEdits(), [tsqId]: value });
  }

  isQuestionDirty(tsqId: string): boolean {
    const cur = this._questionEdits()[tsqId];
    if (!cur) return false;
    return JSON.stringify(cur) !== this._questionOriginals()[tsqId];
  }

  isQuestionValid(tsqId: string): boolean {
    const cur = this._questionEdits()[tsqId];
    return cur ? validateEditableQuestion(cur).valid : false;
  }

  /**
   * Save CTA enabled when the row has unsaved, valid edits. Deliberately NOT
   * gated on canEdit() (= test-set DRAFT): editing a question's content mints a
   * new AtomRevision on the ATOM, independent of the test-set's publish state,
   * so a PUBLISHED test-set's questions stay editable.
   */
  canSaveQuestion(tsqId: string): boolean {
    return (
      this.isQuestionDirty(tsqId) &&
      this.isQuestionValid(tsqId) &&
      this.questionSaveState(tsqId) !== 'saving'
    );
  }

  questionSaveState(tsqId: string): 'idle' | 'saving' | 'saved' | 'error' {
    return this._questionSave()[tsqId] ?? 'idle';
  }

  private setSaveState(
    tsqId: string,
    state: 'idle' | 'saving' | 'saved' | 'error',
  ): void {
    this._questionSave.set({ ...this._questionSave(), [tsqId]: state });
  }

  private editsToRequest(edits: EditableQuestion): EditQuestionRequest {
    if (edits.question_type === 'mcq') {
      return {
        prompt: edits.prompt.trim(),
        mcq_payload: {
          options: edits.options.map((o) => ({
            // Empty option_id ⇒ backend assigns a UUIDv7 for the new option.
            option_id: o.option_id ?? '',
            label: o.label.trim(),
            is_correct: o.is_correct,
            explainer: o.explainer.trim(),
          })),
        },
      };
    }
    return {
      prompt: edits.prompt.trim(),
      oe_payload: { model_answer: edits.model_answer.trim() },
    };
  }

  /**
   * Persist an edited question → PATCH /api/atoms/{id}/questions/{qid} (mints a
   * new AtomRevision). On success re-fetch the detail so the reveal + the
   * dirty baseline reflect the new revision (incl. backend-assigned option_ids).
   */
  saveQuestion(q: TestSetQuestion): void {
    const tsqId = q.test_set_question_id;
    if (!q.question_id || !this.canSaveQuestion(tsqId)) return;
    const edits = this._questionEdits()[tsqId];
    if (!edits) return;
    this.setSaveState(tsqId, 'saving');
    this.service
      .editQuestion(q.question_atom_id, q.question_id, this.editsToRequest(edits))
      .pipe(
        switchMap(() =>
          this.service.getQuestionDetail(q.question_atom_id, q.question_id),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (review) => {
          this._questionDetails.set({
            ...this._questionDetails(),
            [q.question_atom_id]: review,
          });
          this.seedEdit(tsqId, review); // resets dirty baseline
          this.setSaveState(tsqId, 'saved');
        },
        error: () => this.setSaveState(tsqId, 'error'),
      });
  }

  /** Returns the cached title for an included-question row, if any. */
  atomTitleFor(atomId: string): string {
    return this._atomTitles()[atomId]?.title ?? '';
  }

  /** Returns the cached stem for an included-question row, if any. */
  atomStemFor(atomId: string): string {
    return this._atomTitles()[atomId]?.stem ?? '';
  }

  ngOnInit(): void {
    switch (this.mode) {
      case 'list':
        this.loadList();
        break;
      case 'new':
        // `?from_bank=` (CHO-1980) seeds the fresh draft from a question bank.
        this.mintNewDraft(this.route.snapshot.queryParamMap.get('from_bank'));
        break;
      case 'edit':
        this.loadEditor();
        break;
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Mode handlers
  // ═════════════════════════════════════════════════════════════════════

  /** Compute mode from route shape. */
  private deriveMode(): EditorMode {
    const tsid = this.route.snapshot.paramMap.get('testSetId');
    if (tsid) return 'edit';
    const url = this.route.snapshot.url ?? [];
    const last = url[url.length - 1]?.path;
    if (last === 'new') return 'new';
    return 'list';
  }

  private currentTestSetId(): string | null {
    return this.route.snapshot.paramMap.get('testSetId');
  }

  // ── List ──────────────────────────────────────────────────────────
  private loadList(): void {
    this._listState.set({ status: 'loading' });
    this.service
      .listTestSets({})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this._listState.set({ status: 'success', sets: res.items }),
        error: (err: unknown) =>
          this._listState.set({ status: 'error', error: this.errorKey(err, 'list') }),
      });
  }

  retryList(): void {
    this.loadList();
  }

  // ── New ───────────────────────────────────────────────────────────
  /**
   * Mint a DRAFT test set. When `fromBank` is set (CHO-1980 — the QB-detail
   * "Assemble into test set" hand-off), seed the new draft from THAT bank's
   * questions before opening the edit view; otherwise open the empty draft.
   */
  private mintNewDraft(fromBank?: string | null): void {
    this.createAction.set({ status: 'submitting' });
    this.service
      .createTestSet({ title: 'Untitled Test Set' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ts) => {
          if (fromBank) {
            this.seedDraftFromBank(ts.test_set_id, fromBank);
            return;
          }
          this.createAction.set({ status: 'success' });
          void this.router.navigateByUrl(`/a/studio/test-sets/${ts.test_set_id}/edit`);
        },
        error: (err: unknown) =>
          this.createAction.set({ status: 'error', error: this.errorKey(err, 'create') }),
      });
  }

  /**
   * Seed a freshly-minted draft with every question in `bankId`, then open the
   * edit view. The bank list is already enriched with the distinct atom_id +
   * question_id (CHO-1899/1917), so each row maps straight to an add — no
   * per-atom projection hop. The DRAFT exists regardless of seed outcome, so we
   * ALWAYS land on the edit view (the honest source of truth) rather than
   * stranding the author on the transient `new` route.
   */
  private seedDraftFromBank(testSetId: string, bankId: string): void {
    const openEditor = (): void => {
      void this.router.navigateByUrl(`/a/studio/test-sets/${testSetId}/edit`);
    };
    this.fetchAllBankQuestions(bankId)
      .pipe(
        switchMap((items) => {
          const seedable = items.filter((it) => it.atomId && it.questionId);
          if (seedable.length === 0) return of(null);
          return forkJoin(
            seedable.map((it) =>
              this.service.addQuestion(testSetId, {
                question_atom_id: it.atomId,
                question_id: it.questionId,
                question_type: it.questionType,
                points: POINTS_DEFAULT,
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.createAction.set({ status: 'success' });
          openEditor();
        },
        error: () => openEditor(),
      });
  }

  /**
   * Fetch ALL of a bank's questions, paging through the server-side list (no
   * silent truncation — a large bank seeds in full). 100/page, accumulated.
   */
  private fetchAllBankQuestions(bankId: string): Observable<readonly QuestionBankItem[]> {
    const PAGE_SIZE = 100;
    return this.questionBanks.listQuestions(bankId, { page: 1, pageSize: PAGE_SIZE }).pipe(
      expand((res) =>
        res.page * res.pageSize < res.total
          ? this.questionBanks.listQuestions(bankId, {
              page: res.page + 1,
              pageSize: PAGE_SIZE,
            })
          : EMPTY,
      ),
      reduce((acc, res) => [...acc, ...res.items], [] as QuestionBankItem[]),
    );
  }

  /** Triggered by the "New test set" CTA in list mode. */
  newTestSet(): void {
    this.mintNewDraft();
  }

  // ── Edit (load) ────────────────────────────────────────────────────
  private loadEditor(): void {
    const id = this.currentTestSetId();
    if (!id) {
      this._editorState.set({ status: 'error', error: 'aplus.test_set_editor.error_missing_id' });
      return;
    }
    this._editorState.set({ status: 'loading' });
    // Snapshot the prior persisted title BEFORE the loaded payload
    // overwrites it. FE-BUG-TESTSET-TITLE-NO-BIND (2026-05-17 smoke):
    // add-question fires loadEditor(), and a naive `titleDraft.set(ts.title)`
    // here wiped out any in-progress typed edit. Seed the draft only when
    // it still matches the previous persisted value — i.e. the user
    // hasn't started typing — so concurrent loads don't trample the input.
    const prevPersisted = this.testSet()?.title ?? '';
    this.service
      .getTestSet(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ts) => {
          this._editorState.set({ status: 'success', testSet: ts });
          if (this.titleDraft() === prevPersisted) {
            this.titleDraft.set(ts.title ?? '');
          }
        },
        error: (err: unknown) =>
          this._editorState.set({ status: 'error', error: this.errorKey(err, 'load') }),
      });
  }

  /**
   * Title input handler — direct `(input)` binding (replaces ngModel
   * 2026-05-17 smoke #3). The ngModel two-way pattern misses synthetic
   * input events from Chrome DevTools fill + occasional re-render
   * races; the direct (input) → onTitleInput → signal.set chain is
   * deterministic.
   */
  onTitleInput(value: string): void {
    this.titleDraft.set(value);
  }

  /**
   * Commit the title draft (FE-BUG-5 fix). Called on blur or Enter.
   * No-ops if value is unchanged or empty/whitespace-only. Reverts to
   * persisted value on 4xx/5xx (per fail-loud).
   */
  saveTitle(): void {
    const id = this.currentTestSetId();
    if (!id) return;
    if (!this.canEdit()) return;
    const current = this.testSet()?.title ?? '';
    const next = this.titleDraft().trim();
    if (next.length === 0) {
      // Revert to persisted (empty input collapses to no-op).
      this.titleDraft.set(current);
      return;
    }
    if (next === current) return;
    this.titleAction.set({ status: 'submitting' });
    this.service
      .updateTestSet(id, { title: next })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ts) => {
          this.titleAction.set({ status: 'success' });
          // Reflect persisted title in the loaded test-set view so the
          // header subtitle + breadcrumb update without a full reload.
          this._editorState.set({ status: 'success', testSet: { ...ts, questions: this.testSet()?.questions ?? [] } });
        },
        error: (err: unknown) => {
          this.titleAction.set({
            status: 'error',
            error: this.errorKey(err, 'title'),
          });
          // Revert draft to last-known persisted value.
          this.titleDraft.set(current);
        },
      });
  }

  retryEditor(): void {
    this.loadEditor();
  }

  // ═════════════════════════════════════════════════════════════════════
  // Edit-mode actions
  // ═════════════════════════════════════════════════════════════════════

  onPickedQuestion(ref: QuestionRef): void {
    const id = this.currentTestSetId();
    if (!id) return;
    if (!this.canEdit()) return;
    this.addQuestionAction.set({ status: 'submitting' });
    // LEG3-D R3 Option B: fetch the atom projection to extract the embedded
    // Question UUID (mcq_payload.question_id or oe_payload.question_id),
    // then POST `addQuestion` with both distinct UUIDs.
    this.service
      .getAtomProjection(ref.id)
      .pipe(
        switchMap((atom) => {
          const embedded =
            atom.mcq_payload?.question_id ??
            atom.oe_payload?.question_id ??
            atom.essay_payload?.question_id;
          if (!embedded) {
            throw new Error('atom missing embedded question_id payload');
          }
          return this.service.addQuestion(id, {
            question_atom_id: ref.id,
            question_id: embedded,
            question_type: ref.question_type,
            points: POINTS_DEFAULT,
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.addQuestionAction.set({ status: 'success' });
          this.loadEditor();
        },
        error: (err: unknown) => {
          this.addQuestionAction.set({
            status: 'error',
            error: this.errorKey(err, 'add_question'),
          });
          this.loadEditor();
        },
      });
  }

  /**
   * Bulk-add path — emitted from the picker's "Add N selected" CTA.
   * Per LEG3-D R3 Option B each add requires a projection fetch + a
   * distinct-UUID POST. forkJoin lets the N projection GETs run in
   * parallel; we then forkJoin the N POSTs in parallel. After all
   * settle (success OR error per row) we reload the editor once.
   * Per `feedback_no_stubs_real_wiring` — no fixtures, fail-loud on any
   * row error (the others still complete on the BE side; this just
   * surfaces the most recent error in the UI).
   */
  onPickedQuestions(refs: readonly QuestionRef[]): void {
    const id = this.currentTestSetId();
    if (!id) return;
    if (!this.canEdit()) return;
    if (refs.length === 0) return;
    this.addQuestionAction.set({ status: 'submitting' });
    const adders = refs.map((ref) =>
      this.service.getAtomProjection(ref.id).pipe(
        switchMap((atom) => {
          const embedded =
            atom.mcq_payload?.question_id ??
            atom.oe_payload?.question_id ??
            atom.essay_payload?.question_id;
          if (!embedded) {
            throw new Error(
              `atom ${ref.id} missing embedded question_id payload`,
            );
          }
          return this.service.addQuestion(id, {
            question_atom_id: ref.id,
            question_id: embedded,
            question_type: ref.question_type,
            points: POINTS_DEFAULT,
          });
        }),
      ),
    );
    forkJoin(adders)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.addQuestionAction.set({ status: 'success' });
          this.loadEditor();
        },
        error: (err: unknown) => {
          this.addQuestionAction.set({
            status: 'error',
            error: this.errorKey(err, 'add_question'),
          });
          this.loadEditor();
        },
      });
  }

  onPointsChange(testSetQuestionId: string, event: Event): void {
    const id = this.currentTestSetId();
    if (!id) return;
    if (!this.canEdit()) return;
    const raw = (event.target as HTMLInputElement).value;
    if (raw.trim() === '') {
      // Cleared input — restore the persisted value instead of PATCHing
      // the Number('')→0→clamp-to-1 footgun.
      this.loadEditor();
      return;
    }
    const points = Math.max(POINTS_MIN, Math.min(POINTS_MAX, Number(raw)));
    if (!Number.isFinite(points)) return;
    this.service
      .updateQuestion(id, testSetQuestionId, { points })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadEditor(),
        error: () => this.loadEditor(),
      });
  }

  onRemoveQuestion(testSetQuestionId: string): void {
    const id = this.currentTestSetId();
    if (!id) return;
    if (!this.canEdit()) return;
    this.service
      .removeQuestion(id, testSetQuestionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadEditor(),
        error: () => this.loadEditor(),
      });
  }

  /**
   * Drag-reorder (CR2-C1). Persists the new question order via per-row
   * `PATCH .../questions/{id}` `{ display_order }` — the chora-delivery
   * `DisplayOrder` field + `Questions()` sort already exist, so this is a
   * FE-only hop. Only rows whose 1-based position actually changed are
   * PATCHed; the editor view is updated optimistically so the drop is
   * reflected immediately, then reconciled with a single reload once the
   * writes settle. DRAFT-only (PUBLISHED test-sets are immutable, D5).
   */
  onReorder(event: CdkDragDrop<readonly TestSetQuestion[]>): void {
    const id = this.currentTestSetId();
    if (!id) return;
    if (!this.canEdit()) return;
    const from = event.previousIndex;
    const to = event.currentIndex;
    if (from === to) return;
    const reordered = [...this.testSetQuestions()];
    if (from < 0 || from >= reordered.length || to < 0 || to >= reordered.length) {
      return;
    }
    // Capture the pre-move order so we PATCH only the rows that moved.
    const priorOrder = new Map(
      reordered.map((q) => [q.test_set_question_id, q.display_order]),
    );
    moveItemInArray(reordered, from, to);
    const renumbered = reordered.map((q, i) => ({ ...q, display_order: i + 1 }));

    // Optimistic — reflect the new order in the editor view at once.
    const ts = this.testSet();
    if (ts) {
      this._editorState.set({ status: 'success', testSet: { ...ts, questions: renumbered } });
    }

    const changed = renumbered.filter(
      (q) => priorOrder.get(q.test_set_question_id) !== q.display_order,
    );
    if (changed.length === 0) return;

    this.reorderAction.set({ status: 'submitting' });
    forkJoin(
      changed.map((q) =>
        this.service.updateQuestion(id, q.test_set_question_id, {
          display_order: q.display_order,
        }),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.reorderAction.set({ status: 'success' });
          this.loadEditor();
        },
        error: (err: unknown) => {
          this.reorderAction.set({ status: 'error', error: this.errorKey(err, 'reorder') });
          this.loadEditor();
        },
      });
  }

  publish(): void {
    const id = this.currentTestSetId();
    if (!id) return;
    this.publishAction.set({ status: 'submitting' });
    this.service
      .publishTestSet(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.publishAction.set({ status: 'success' });
          void this.router.navigateByUrl('/a/studio/test-sets');
        },
        error: (err: unknown) =>
          this.publishAction.set({ status: 'error', error: this.errorKey(err, 'publish') }),
      });
  }

  archive(): void {
    const id = this.currentTestSetId();
    if (!id) return;
    this.archiveAction.set({ status: 'submitting' });
    this.service
      .archiveTestSet(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ts) => {
          this.archiveAction.set({ status: 'success' });
          this._editorState.set({
            status: 'success',
            testSet: { ...ts, questions: this.testSetQuestions() },
          });
        },
        error: (err: unknown) =>
          this.archiveAction.set({ status: 'error', error: this.errorKey(err, 'archive') }),
      });
  }

  /** "Archive + Create new" CTA — composite for v1 edit-flow (D8). */
  archiveAndCreateNew(): void {
    const id = this.currentTestSetId();
    if (!id) return;
    this.archiveAction.set({ status: 'submitting' });
    this.service
      .archiveTestSet(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.archiveAction.set({ status: 'success' });
          this.mintNewDraft();
        },
        error: (err: unknown) =>
          this.archiveAction.set({ status: 'error', error: this.errorKey(err, 'archive') }),
      });
  }

  /** trackBy for the @for of TestSetQuestion. */
  trackByTsq(_index: number, q: TestSetQuestion): string {
    return q.test_set_question_id;
  }

  // ═════════════════════════════════════════════════════════════════════
  // Internals
  // ═════════════════════════════════════════════════════════════════════

  private errorKey(
    err: unknown,
    scope: 'list' | 'load' | 'create' | 'publish' | 'archive' | 'add_question' | 'title' | 'reorder',
  ): string {
    const e = err as { status?: number };
    const base = `aplus.test_set_editor.error_${scope}`;
    if (typeof e?.status === 'number') {
      if (e.status === 401 || e.status === 403) {
        return 'aplus.test_set_editor.error_unauthorised';
      }
      if (e.status === 404) {
        // List-scope 404 is "endpoint missing / nothing to load" — the
        // detail-style `error_not_found` ("this test set doesn't exist")
        // is misleading there. For everything else, the not-found copy
        // is the correct semantics (the target test-set is gone).
        if (scope === 'list') return `${base}_generic`;
        return 'aplus.test_set_editor.error_not_found';
      }
      if (e.status === 409) {
        return `${base}_conflict`;
      }
      if (e.status >= 500) return `${base}_upstream`;
    }
    return `${base}_generic`;
  }
}

// ---------------------------------------------------------------------------
// CHO-2402 — the copy pinned at publish
// ---------------------------------------------------------------------------

/** The pinned stem, trimmed, or '' when the row carries no pinned copy. */
function pinnedStem(q: TestSetQuestion): string {
  return (q.payload_snapshot?.stem ?? '').trim();
}

/**
 * Map a pinned payload onto the review shape the reveal renders. Returns null
 * when the row has no pinned copy, which is every DRAFT row: a draft follows
 * the live question by design and must keep doing so.
 */
function reviewFromPinned(q: TestSetQuestion): QuestionReview | null {
  const snap = q.payload_snapshot;
  if (!snap) return null;
  const stem = pinnedStem(q);
  const options = snap.options ?? [];
  if (stem === '' && options.length === 0) return null;
  return {
    question_type: q.question_type === 'oe' ? 'oe' : 'mcq',
    prompt: stem,
    options: options.map((o) => ({
      option_id: o.option_id,
      label: o.label,
      is_correct: !!o.is_correct,
      explainer: o.explainer ?? null,
    })),
    model_answer: snap.model_answer ?? null,
    rubric: (snap.rubric ?? []).map((r) => ({
      title: r.title ?? '',
      description: r.description ?? null,
      weight: r.weight ?? null,
    })),
    // The pinned copy holds content, not signed media URLs; the reveal renders
    // no illustration for a published row rather than showing a live one.
    question_image_url: null,
    answer_image_url: null,
  };
}
