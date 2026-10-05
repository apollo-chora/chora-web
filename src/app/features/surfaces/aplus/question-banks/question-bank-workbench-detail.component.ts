/**
 * QuestionBankWorkbenchDetailComponent — the `/a/studio/question-banks/:id` Detail page (A+).
 *
 * Opening one bank from the List page yields this curation workspace:
 *   - bank metadata (name / description / visibility badge / tags), from
 *     `getBank` (real BFF wiring; fail-loud — a 404 shows a back-to-list state);
 *   - the bank's questions list, from the dedicated `listQuestions` endpoint
 *     (kept separate so refresh-after-mutation is a single cheap GET), each row
 *     with a Remove action;
 *   - "Add questions" → the REUSED `AtomQuestionPickerComponent` (the same
 *     widget the test-set editor + R+ bank detail embed) → on pick, POST add →
 *     refresh.
 *
 * A+ is the authoring/curation workbench — the R+ "assemble test-set" dialog is
 * intentionally ABSENT (assembly-for-delivery is R+'s job).
 *
 * Per chora-web CLAUDE.md: standalone + OnPush + signals + @if/@for +
 * data-testid + BFF-only HTTP. `:id` is bound via withComponentInputBinding.
 * The route is role-gated upstream (`roleGuard('assessment:author')`).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  switchMap,
  type Observable,
} from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../core/services/translate.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AtomQuestionPickerComponent } from '../atom-question-picker/atom-question-picker.component';
import type { QuestionRef } from '../atom-question-picker/atom-question-picker.model';
import { ChoraQuestionEditorComponent } from '../../../../shared/components/chora-question-editor/chora-question-editor.component';
import {
  validateEditableQuestion,
  type EditableQuestion,
} from '../../../../shared/components/chora-question-editor/chora-question-editor.model';
import { ChoraQuestionReviewComponent } from '../../../../shared/components/chora-question-review/chora-question-review.component';
import { ChoraQuestionImageComponent } from '../../../../shared/components/chora-question-image/chora-question-image.component';
import type { QuestionReview } from '../../../../shared/components/chora-question-review/chora-question-review.model';
import { QuestionBanksService } from './question-banks.service';
import { QuestionBankAtomsService, editsToRequest } from './question-bank-atoms.service';
import {
  visibilityLabelKey,
  type ListQuestionsParams,
  type QuestionBank,
  type QuestionBankItem,
} from './question-banks.model';

/** A sort option for the bank's question list (label + the `field:dir` token). */
interface QuestionSortOption {
  readonly value: string;
  readonly labelKey: string;
}

/** The sort menu — server-side over position | added_at | prompt. */
const QUESTION_SORT_OPTIONS: readonly QuestionSortOption[] = [
  { value: 'position:asc', labelKey: 'aplus.question_banks.detail.sort.position' },
  { value: 'added_at:desc', labelKey: 'aplus.question_banks.detail.sort.newest' },
  { value: 'added_at:asc', labelKey: 'aplus.question_banks.detail.sort.oldest' },
  { value: 'prompt:asc', labelKey: 'aplus.question_banks.detail.sort.prompt_az' },
  { value: 'prompt:desc', labelKey: 'aplus.question_banks.detail.sort.prompt_za' },
];

const QUESTION_PAGE_SIZES: readonly number[] = [10, 20, 50, 100];
const DEFAULT_QUESTION_PAGE_SIZE = 20;

/** Which inline per-row panel is open (only one at a time). */
type ActivePanel =
  | { readonly mode: 'preview'; readonly atomId: string }
  | { readonly mode: 'edit'; readonly atomId: string }
  | { readonly mode: 'tags'; readonly atomId: string }
  | null;

/** Generic async state for the inline preview/edit/tags fetches. */
type PanelFetchState = 'loading' | 'ready' | 'error';

/** Discriminated load state for the bank-metadata fetch. */
type BankLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly bank: QuestionBank }
  | { readonly status: 'error'; readonly errorKey: string; readonly notFound: boolean };

/** Discriminated load state for the bank's questions list (one server page). */
type QuestionsLoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly items: readonly QuestionBankItem[];
      readonly total: number;
      readonly page: number;
      readonly pageSize: number;
    }
  | { readonly status: 'error' };

@Component({
  selector: 'chora-aplus-question-bank-workbench-detail',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    TranslatePipe,
    AtomQuestionPickerComponent,
    ChoraQuestionEditorComponent,
    ChoraQuestionReviewComponent,
    ChoraQuestionImageComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './question-bank-workbench-detail.component.html',
  styleUrl: './question-bank-workbench-detail.component.scss',
})
export class QuestionBankWorkbenchDetailComponent {
  private readonly service = inject(QuestionBanksService);
  private readonly atoms = inject(QuestionBankAtomsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslateService);
  private readonly router = inject(Router);

  /** `:id` path param (withComponentInputBinding). */
  readonly id = input.required<string>();

  readonly visibilityLabelKey = visibilityLabelKey;

  // ── Bank metadata load state ───────────────────────────────────────────
  private readonly _bankState = signal<BankLoadState>({ status: 'loading' });
  readonly bank = computed<QuestionBank | null>(() => {
    const s = this._bankState();
    return s.status === 'success' ? s.bank : null;
  });
  readonly isLoading = computed(() => this._bankState().status === 'loading');
  readonly isError = computed(() => this._bankState().status === 'error');
  readonly isNotFound = computed(() => {
    const s = this._bankState();
    return s.status === 'error' && s.notFound;
  });
  readonly errorKey = computed(() => {
    const s = this._bankState();
    return s.status === 'error' ? s.errorKey : '';
  });

  // ── Questions list load state ──────────────────────────────────────────
  private readonly _questionsState = signal<QuestionsLoadState>({ status: 'loading' });
  readonly questions = computed<readonly QuestionBankItem[]>(() => {
    const s = this._questionsState();
    return s.status === 'success' ? s.items : [];
  });
  readonly isQuestionsLoading = computed(() => this._questionsState().status === 'loading');
  readonly isQuestionsError = computed(() => this._questionsState().status === 'error');
  readonly isQuestionsEmpty = computed(
    () => this._questionsState().status === 'success' && this.questions().length === 0,
  );

  // ── Search / filter / sort / pagination (ALL server-side, huge-bank-safe) ─
  readonly searchDraft = signal(''); // bound to the input (raw)
  readonly appliedQuery = signal(''); // debounced → drives the fetch
  readonly types = signal<readonly string[]>([]); // question_type filter (mcq/oe)
  readonly sortValue = signal('position:asc'); // field:dir token
  readonly page = signal(1);
  readonly pageSize = signal(DEFAULT_QUESTION_PAGE_SIZE);
  readonly sortOptions = QUESTION_SORT_OPTIONS;
  readonly pageSizeOptions = QUESTION_PAGE_SIZES;
  private readonly searchInput$ = new Subject<string>();
  /** A filter/sort/page re-fetch is in flight (current page stays visible). */
  readonly reloadingQuestions = signal(false);

  readonly totalQuestions = computed(() => {
    const s = this._questionsState();
    return s.status === 'success' ? s.total : 0;
  });
  readonly currentPage = computed(() => {
    const s = this._questionsState();
    return s.status === 'success' ? s.page : this.page();
  });
  readonly totalPages = computed(() => {
    const s = this._questionsState();
    if (s.status !== 'success' || s.pageSize <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(s.total / s.pageSize));
  });
  readonly hasPrevPage = computed(() => this.currentPage() > 1);
  readonly hasNextPage = computed(() => this.currentPage() < this.totalPages());
  /**
   * "Page X of Y" status. The app's custom `translate` pipe/service takes a key
   * only (no interpolation params), so we interpolate here in TS via `.replace`
   * — the canonical codebase idiom. Passing params through the pipe breaks the
   * AOT build (TS2554: the pipe's transform accepts exactly one argument).
   */
  readonly pageStatus = computed(() =>
    this.i18n
      .instant('aplus.question_banks.detail.pagination.page_of')
      .replace('{{page}}', String(this.currentPage()))
      .replace('{{total}}', String(this.totalPages())),
  );
  /** Absolute row number offset for the current page (so #s span pages). */
  readonly rowOffset = computed(() => {
    const s = this._questionsState();
    const ps = s.status === 'success' ? s.pageSize : this.pageSize();
    return (this.currentPage() - 1) * ps;
  });
  /** Any active keyword/type filter or non-default sort — drives the Clear button. */
  readonly hasActiveFilters = computed(
    () =>
      this.appliedQuery().trim() !== '' ||
      this.types().length > 0 ||
      this.sortValue() !== 'position:asc',
  );
  /** Empty because a filter matched nothing (vs an empty bank) — different copy. */
  readonly isFilteredEmpty = computed(() => this.isQuestionsEmpty() && this.hasActiveFilters());
  /**
   * Drag-reorder is only meaningful on the FULL manual order — disabled while
   * filtered / non-position-sorted / multi-page (the reorder endpoint needs a
   * permutation of ALL members, which a single page is not).
   */
  readonly canReorder = computed(() => {
    const s = this._questionsState();
    return s.status === 'success' && !this.hasActiveFilters() && s.total <= s.pageSize;
  });

  // ── Add-picker UI state ────────────────────────────────────────────────
  readonly showPicker = signal(false);
  /** question id currently being removed — per-row busy + re-entrancy guard. */
  readonly removingId = signal<string | null>(null);

  // ── Bulk-select state (checkbox per row → bulk-remove bar) ──────────────
  private readonly _selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly selectedIds = this._selectedIds.asReadonly();
  readonly selectedCount = computed(() => this._selectedIds().size);
  /** in-flight guard for the bulk DELETE batch (disables the bar + checkboxes). */
  readonly bulkRemoving = signal(false);

  // ── Inline per-row panel (preview | edit | tags) — one open at a time ───
  readonly activePanel = signal<ActivePanel>(null);

  // Preview (W2.B): the AUTHOR review (answer-key reveal) via the shared
  // ChoraQuestionReviewComponent — the same review the test-set editor renders.
  readonly previewState = signal<PanelFetchState>('loading');
  readonly previewReview = signal<QuestionReview | null>(null);

  // Inline quick-edit (W2.C): shared ChoraQuestionEditor, two-way bound.
  readonly editState = signal<PanelFetchState>('loading');
  readonly editQuestionId = signal<string | null>(null);
  readonly editModel = signal<EditableQuestion | null>(null);
  /** Stem illustration URL for the quick-edit view (null = none). */
  readonly editQuestionImageUrl = signal<string | null>(null);
  /** Model-answer illustration URL for the quick-edit view (null = none). */
  readonly editAnswerImageUrl = signal<string | null>(null);
  /**
   * Image-removal is STAGED on the edit form (CHO-1974): clicking "Remove"
   * flags the image; the SAME Save then sends `image_url`/`answer_image_url` =
   * `''` (explicit clear) for any flagged image and OMITS it otherwise (so the
   * BE carries the durable gs:// ref forward). Reset whenever the panel re-opens.
   */
  readonly editQuestionImageRemoved = signal(false);
  readonly editAnswerImageRemoved = signal(false);
  /** Show the stem/answer image only while it exists AND is not staged-removed. */
  readonly showEditQuestionImage = computed(
    () => this.editQuestionImageUrl() !== null && !this.editQuestionImageRemoved(),
  );
  readonly showEditAnswerImage = computed(
    () => this.editAnswerImageUrl() !== null && !this.editAnswerImageRemoved(),
  );
  readonly editSaving = signal(false);
  readonly editValid = computed<boolean>(() => {
    const m = this.editModel();
    return m !== null && validateEditableQuestion(m).valid;
  });

  // Tags/subject edit (W2.D): atom-level meta (ADR-156 Phase-1).
  readonly metaState = signal<PanelFetchState>('loading');
  readonly metaSubject = signal('');
  readonly metaTags = signal<readonly string[]>([]);
  readonly metaTagDraft = signal('');
  readonly metaSaving = signal(false);

  // Clone-as-variant (W2.F): per-row busy guard.
  readonly cloningId = signal<string | null>(null);

  // Drag-reorder (W2.E): in-flight guard while a new order persists.
  readonly reordering = signal(false);

  constructor() {
    // Bank metadata reacts to the :id only.
    effect(() => this.loadBank(this.id()));
    // The questions PAGE reacts to :id AND every filter/sort/page signal (read
    // synchronously inside loadQuestions) — any change re-fetches one page.
    effect(() => this.loadQuestions(this.id()));
    // Debounce the search box → applied query (snapping back to page 1).
    this.searchInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((v) => {
        this.appliedQuery.set(v.trim());
        this.page.set(1);
      });
  }

  // ── Loads ───────────────────────────────────────────────────────────────
  private loadBank(id: string): void {
    this._bankState.set({ status: 'loading' });
    this.service.getBank(id).subscribe({
      next: (bank) => this._bankState.set({ status: 'success', bank }),
      error: (err: unknown) => {
        const notFound = (err as { status?: number })?.status === 404;
        this._bankState.set({
          status: 'error',
          notFound,
          errorKey: notFound
            ? 'aplus.question_banks.detail.error_not_found'
            : 'aplus.question_banks.detail.error_generic',
        });
      },
    });
  }

  private loadQuestions(id: string): void {
    // Keep the current page visible while re-fetching (filter/sort/page change)
    // so the controls bar + search box never unmount (no focus loss / flicker);
    // only the FIRST load (or after an error) shows the full loading state.
    // `untracked`: this read must NOT make the reload effect depend on
    // _questionsState (which the async callback writes) — that would loop.
    if (untracked(() => this._questionsState().status === 'success')) {
      this.reloadingQuestions.set(true);
    } else {
      this._questionsState.set({ status: 'loading' });
    }
    const params: ListQuestionsParams = {
      q: this.appliedQuery() || undefined,
      types: this.types().length > 0 ? this.types() : undefined,
      sort: this.sortValue() || undefined,
      page: this.page(),
      pageSize: this.pageSize(),
    };
    this.service.listQuestions(id, params).subscribe({
      next: (pageData) => {
        this.reloadingQuestions.set(false);
        this._questionsState.set({
          status: 'success',
          items: pageData.items,
          total: pageData.total,
          page: pageData.page,
          pageSize: pageData.pageSize,
        });
        this.pruneSelection(pageData.items);
      },
      error: () => {
        this.reloadingQuestions.set(false);
        this._questionsState.set({ status: 'error' });
      },
    });
  }

  // ── Search / filter / sort / pagination handlers ─────────────────────────
  onSearchInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.searchDraft.set(v);
    this.searchInput$.next(v);
  }

  clearSearch(): void {
    this.searchDraft.set('');
    this.appliedQuery.set('');
    this.page.set(1);
  }

  isTypeActive(type: string): boolean {
    return this.types().includes(type);
  }

  toggleType(type: string): void {
    const next = this.types().includes(type)
      ? this.types().filter((t) => t !== type)
      : [...this.types(), type];
    this.types.set(next);
    this.page.set(1);
  }

  onSortChange(event: Event): void {
    this.sortValue.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }

  onPageSizeChange(event: Event): void {
    const n = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(n) && n > 0) {
      this.pageSize.set(n);
      this.page.set(1);
    }
  }

  /** Reset every filter/sort back to the default manual view. */
  clearFilters(): void {
    this.searchDraft.set('');
    this.appliedQuery.set('');
    this.types.set([]);
    this.sortValue.set('position:asc');
    this.page.set(1);
  }

  prevPage(): void {
    if (this.hasPrevPage()) {
      this.page.set(this.currentPage() - 1);
    }
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.page.set(this.currentPage() + 1);
    }
  }

  retry(): void {
    this.loadBank(this.id());
    this.loadQuestions(this.id());
  }

  retryQuestions(): void {
    this.loadQuestions(this.id());
  }

  // ── Remove a question ───────────────────────────────────────────────────
  removeQuestion(questionId: string): void {
    if (this.removingId() !== null) {
      return;
    }
    this.removingId.set(questionId);
    this.service.removeQuestion(this.id(), questionId).subscribe({
      next: () => {
        this.removingId.set(null);
        this.toast.show('aplus.question_banks.detail.removed', 'success');
        this.loadQuestions(this.id());
      },
      error: () => {
        this.removingId.set(null);
        this.toast.show('aplus.question_banks.detail.remove_failed', 'error');
      },
    });
  }

  // ── Bulk selection + bulk remove ────────────────────────────────────────
  isQuestionSelected(questionId: string): boolean {
    return this._selectedIds().has(questionId);
  }

  toggleQuestionSelected(questionId: string): void {
    const next = new Set(this._selectedIds());
    if (next.has(questionId)) {
      next.delete(questionId);
    } else {
      next.add(questionId);
    }
    this._selectedIds.set(next);
  }

  clearSelection(): void {
    this._selectedIds.set(new Set());
  }

  /** Drop any selected ids no longer present in the (reloaded) list. */
  private pruneSelection(items: readonly QuestionBankItem[]): void {
    const present = new Set(items.map((i) => i.questionId));
    const current = this._selectedIds();
    const pruned = new Set([...current].filter((id) => present.has(id)));
    if (pruned.size !== current.size) {
      this._selectedIds.set(pruned);
    }
  }

  /**
   * Remove every selected question in one batch (forkJoin over the single-row
   * DELETE). Partial success is possible (forkJoin errors on the first failure
   * and cancels the rest), so we ALWAYS refresh afterwards to reflect the true
   * server state, and clear the selection either way. Re-entrancy-guarded.
   */
  bulkRemove(): void {
    const ids = [...this._selectedIds()];
    if (ids.length === 0 || this.bulkRemoving()) {
      return;
    }
    this.bulkRemoving.set(true);
    forkJoin(ids.map((qid) => this.service.removeQuestion(this.id(), qid))).subscribe({
      next: () => {
        this.bulkRemoving.set(false);
        this.clearSelection();
        this.toast.show('aplus.question_banks.detail.bulk_removed', 'success');
        this.loadQuestions(this.id());
      },
      error: () => {
        this.bulkRemoving.set(false);
        this.clearSelection();
        this.toast.show('aplus.question_banks.detail.bulk_remove_failed', 'error');
        this.loadQuestions(this.id());
      },
    });
  }

  // ── Add questions (embedded reused picker) ──────────────────────────────
  toggleAddPicker(): void {
    this.showPicker.update((open) => !open);
  }

  /**
   * Hand off to the standalone A+ test-set builder, seeded from THIS bank
   * (CHO-1980). A+ never assembles FOR DELIVERY inline (that is R+'s job) — it
   * opens the existing editor at `…/test-sets/new?from_bank={id}`, which mints a
   * DRAFT then adds this bank's questions. NB the editor performs the seed (it
   * owns the chora_delivery TestSet writes); this is a pure navigation.
   */
  assembleIntoTestSet(): void {
    void this.router.navigate(['/a/studio/test-sets/new'], {
      queryParams: { from_bank: this.id() },
    });
  }

  /**
   * Resolve a picker/clone ATOM id → its embedded question_id, then add THAT to
   * the bank. The picker emits atom ids, but a QuestionBank references the
   * questions-table PK (`question_id`) — posting the atom id 404s
   * (CREATION_QUESTION_NOT_FOUND, QuestionLookup.Resolve). Emits 'added', or
   * 'no_question' when the atom has no live question to add (caller toasts).
   */
  private addResolved(atomId: string): Observable<'added' | 'no_question'> {
    return this.atoms.resolveQuestionId(atomId).pipe(
      switchMap((questionId) =>
        questionId
          ? this.service.addQuestion(this.id(), questionId).pipe(map(() => 'added' as const))
          : of('no_question' as const),
      ),
    );
  }

  /** Single-add from the picker's per-row "+" (pickedQuestion). */
  onQuestionPicked(ref: QuestionRef): void {
    this.addResolved(ref.id).subscribe({
      next: (outcome) => {
        if (outcome === 'no_question') {
          this.toast.show('aplus.question_banks.detail.add_no_question', 'error');
          return;
        }
        this.toast.show('aplus.question_banks.detail.added', 'success');
        this.loadQuestions(this.id());
      },
      error: () => this.toast.show('aplus.question_banks.detail.add_failed', 'error'),
    });
  }

  /** Bulk-add from the picker's "Add N selected" (pickedQuestions). */
  onQuestionsPicked(refs: readonly QuestionRef[]): void {
    if (refs.length === 0) {
      return;
    }
    forkJoin(refs.map((ref) => this.addResolved(ref.id))).subscribe({
      next: (outcomes) => {
        const added = outcomes.filter((o) => o === 'added').length;
        const skipped = outcomes.length - added;
        if (added > 0) {
          this.toast.show('aplus.question_banks.detail.added', 'success');
          this.loadQuestions(this.id());
        }
        if (skipped > 0) {
          // Some picked atoms had no live question — surface it, don't silently drop.
          this.toast.show('aplus.question_banks.detail.add_no_question', 'error');
        }
      },
      error: () => this.toast.show('aplus.question_banks.detail.add_failed', 'error'),
    });
  }

  // ── Inline panel helpers (preview | edit | tags — one open at a time) ────
  isPanelOpen(atomId: string, mode: 'preview' | 'edit' | 'tags'): boolean {
    const p = this.activePanel();
    return p !== null && p.atomId === atomId && p.mode === mode;
  }

  closePanel(): void {
    this.activePanel.set(null);
  }

  // ── Preview (W2.B) — the AUTHOR review (answer key), shared component ─────
  openPreview(atomId: string): void {
    if (this.isPanelOpen(atomId, 'preview')) {
      this.closePanel();
      return;
    }
    this.activePanel.set({ mode: 'preview', atomId });
    this.previewState.set('loading');
    this.previewReview.set(null);
    this.atoms.getQuestionReview(atomId).subscribe({
      next: (review) => {
        this.previewReview.set(review);
        this.previewState.set('ready');
      },
      error: () => this.previewState.set('error'),
    });
  }

  // ── Inline quick-edit (W2.C) — shared ChoraQuestionEditor + PATCH ────────
  openEdit(atomId: string): void {
    if (this.isPanelOpen(atomId, 'edit')) {
      this.closePanel();
      return;
    }
    this.activePanel.set({ mode: 'edit', atomId });
    this.editState.set('loading');
    this.editModel.set(null);
    this.editQuestionId.set(null);
    this.editQuestionImageUrl.set(null);
    this.editAnswerImageUrl.set(null);
    this.editQuestionImageRemoved.set(false);
    this.editAnswerImageRemoved.set(false);
    this.atoms.getEditableQuestion(atomId).subscribe({
      next: ({ questionId, editable, questionImageUrl, answerImageUrl }) => {
        this.editQuestionId.set(questionId);
        this.editModel.set(editable);
        this.editQuestionImageUrl.set(questionImageUrl);
        this.editAnswerImageUrl.set(answerImageUrl);
        this.editState.set('ready');
      },
      error: () => this.editState.set('error'),
    });
  }

  // Stage / un-stage image removal — the actual clear is sent on Save.
  removeEditQuestionImage(): void {
    this.editQuestionImageRemoved.set(true);
  }

  undoRemoveEditQuestionImage(): void {
    this.editQuestionImageRemoved.set(false);
  }

  removeEditAnswerImage(): void {
    this.editAnswerImageRemoved.set(true);
  }

  undoRemoveEditAnswerImage(): void {
    this.editAnswerImageRemoved.set(false);
  }

  /** Persist the inline edit → PATCH (mints a new, non-destructive AtomRevision). */
  saveEdit(): void {
    const panel = this.activePanel();
    const model = this.editModel();
    const qid = this.editQuestionId();
    if (
      panel === null ||
      panel.mode !== 'edit' ||
      model === null ||
      qid === null ||
      this.editSaving() ||
      !this.editValid()
    ) {
      return;
    }
    this.editSaving.set(true);
    // Normal save OMITS the image fields (BE carries the durable ref forward);
    // a staged Remove adds `''` to explicitly clear that image (CHO-1974).
    const req = {
      ...editsToRequest(model),
      ...(this.editQuestionImageRemoved() ? { image_url: '' } : {}),
      ...(this.editAnswerImageRemoved() ? { answer_image_url: '' } : {}),
    };
    this.atoms.editQuestion(panel.atomId, qid, req).subscribe({
      next: () => {
        this.editSaving.set(false);
        this.toast.show('aplus.question_banks.detail.edit.saved', 'success');
        this.closePanel();
      },
      error: () => {
        this.editSaving.set(false);
        this.toast.show('aplus.question_banks.detail.edit.save_failed', 'error');
      },
    });
  }

  // ── Tags/subject edit (W2.D) — atom-level meta (ADR-156 Phase-1) ─────────
  openTags(atomId: string): void {
    if (this.isPanelOpen(atomId, 'tags')) {
      this.closePanel();
      return;
    }
    this.activePanel.set({ mode: 'tags', atomId });
    this.metaState.set('loading');
    this.metaTagDraft.set('');
    this.atoms.getAtom(atomId).subscribe({
      next: (atom) => {
        this.metaSubject.set(atom.subject);
        this.metaTags.set(atom.tags);
        this.metaState.set('ready');
      },
      error: () => this.metaState.set('error'),
    });
  }

  onMetaSubjectInput(event: Event): void {
    this.metaSubject.set((event.target as HTMLInputElement).value);
  }

  onMetaTagDraftInput(event: Event): void {
    this.metaTagDraft.set((event.target as HTMLInputElement).value);
  }

  /** Enter or comma commits the current draft as a chip. */
  onMetaTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addMetaTag();
    }
  }

  addMetaTag(): void {
    const t = this.metaTagDraft().replace(/,/g, '').trim();
    if (t.length === 0) {
      return;
    }
    if (!this.metaTags().includes(t)) {
      this.metaTags.set([...this.metaTags(), t]);
    }
    this.metaTagDraft.set('');
  }

  removeMetaTag(tag: string): void {
    this.metaTags.set(this.metaTags().filter((t) => t !== tag));
  }

  /** Persist atom-level tags + subject → PATCH /api/atoms/{id}. */
  saveMeta(): void {
    const panel = this.activePanel();
    if (panel === null || panel.mode !== 'tags' || this.metaSaving()) {
      return;
    }
    this.metaSaving.set(true);
    this.atoms
      .updateMeta(panel.atomId, {
        tags: this.metaTags(),
        subject: this.metaSubject().trim(),
      })
      .subscribe({
        next: () => {
          this.metaSaving.set(false);
          this.toast.show('aplus.question_banks.detail.tags.saved', 'success');
          this.closePanel();
        },
        error: () => {
          this.metaSaving.set(false);
          this.toast.show('aplus.question_banks.detail.tags.save_failed', 'error');
        },
      });
  }

  // ── Clone-as-variant (W2.F) ─────────────────────────────────────────────
  /**
   * Clone the atom, then add the new variant to THIS bank + refresh — chained
   * so the variant lands where the author is working. Re-entrancy-guarded.
   */
  cloneAtom(atomId: string): void {
    if (this.cloningId() !== null) {
      return;
    }
    this.cloningId.set(atomId);
    // Clone returns the NEW atom id → resolve its embedded question_id before
    // adding to the bank (same atom_id→question_id resolution as the picker add).
    this.atoms
      .clone(atomId)
      .pipe(switchMap((cloned) => this.addResolved(cloned.atomId)))
      .subscribe({
        next: (outcome) => {
          this.cloningId.set(null);
          if (outcome === 'no_question') {
            this.toast.show('aplus.question_banks.detail.add_no_question', 'error');
            return;
          }
          this.toast.show('aplus.question_banks.detail.clone.added', 'success');
          this.loadQuestions(this.id());
        },
        error: () => {
          this.cloningId.set(null);
          this.toast.show('aplus.question_banks.detail.clone.failed', 'error');
        },
      });
  }

  // ── Drag-reorder (W2.E) — cdk drag + keyboard up/down, both persist ──────
  // Only on the FULL manual order (canReorder); the endpoint needs a permutation
  // of ALL members, which a filtered / sorted / multi-page view is not.
  canMoveUp(index: number): boolean {
    return this.canReorder() && index > 0 && !this.reordering();
  }

  canMoveDown(index: number): boolean {
    return this.canReorder() && index < this.questions().length - 1 && !this.reordering();
  }

  moveUp(index: number): void {
    if (!this.canMoveUp(index)) {
      return;
    }
    const ids = this.questions().map((q) => q.questionId);
    moveItemInArray(ids, index, index - 1);
    this.persistReorder(ids);
  }

  moveDown(index: number): void {
    if (!this.canMoveDown(index)) {
      return;
    }
    const ids = this.questions().map((q) => q.questionId);
    moveItemInArray(ids, index, index + 1);
    this.persistReorder(ids);
  }

  drop(event: CdkDragDrop<readonly QuestionBankItem[]>): void {
    if (!this.canReorder() || this.reordering() || event.previousIndex === event.currentIndex) {
      return;
    }
    const ids = this.questions().map((q) => q.questionId);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    this.persistReorder(ids);
  }

  /**
   * Optimistically reorder the local list, then POST the full ordered id list.
   * Reload on BOTH success (authoritative positions) and error (revert the
   * optimistic move to the server's truth) so the UI never lies.
   */
  private persistReorder(orderedIds: readonly string[]): void {
    this.reordering.set(true);
    this.reorderItemsLocally(orderedIds);
    this.service.reorder(this.id(), orderedIds).subscribe({
      next: () => {
        this.reordering.set(false);
        this.loadQuestions(this.id());
      },
      error: () => {
        this.reordering.set(false);
        this.toast.show('aplus.question_banks.detail.reorder_failed', 'error');
        this.loadQuestions(this.id());
      },
    });
  }

  /** Reorder the in-memory items to match `orderedIds` (optimistic UI). */
  private reorderItemsLocally(orderedIds: readonly string[]): void {
    const s = this._questionsState();
    if (s.status !== 'success') {
      return;
    }
    const byId = new Map(s.items.map((i) => [i.questionId, i]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((i): i is QuestionBankItem => i !== undefined);
    this._questionsState.set({
      status: 'success',
      items: reordered,
      total: s.total,
      page: s.page,
      pageSize: s.pageSize,
    });
  }
}
