/**
 * QuestionBankDetailComponent — the `/r/question-banks/:id` Detail page (R+).
 *
 * Opening one bank from the List page yields this workspace:
 *   - bank metadata (name / description / visibility badge / tags), from
 *     `getBank` (real BFF wiring; fail-loud — a 404 shows a back-to-list state);
 *   - the bank's questions list, from the dedicated `listQuestions` endpoint
 *     (kept separate so refresh-after-mutation is a single cheap GET), each row
 *     with a Remove action;
 *   - "Add questions" → the REUSED `AtomQuestionPickerComponent` (the same
 *     widget quiz-builder embeds) → on pick, POST add → refresh;
 *   - "Assemble test-set" → a dialog (title + description) → POST assemble
 *     (202 async job) → success toast pointing the author to the offering's
 *     Assessments tab.
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
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap, type Observable } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AtomQuestionPickerComponent } from '../../aplus/atom-question-picker/atom-question-picker.component';
import type { QuestionRef } from '../../aplus/atom-question-picker/atom-question-picker.model';
import { QuestionBanksService } from './question-banks.service';
import { QuestionBankAtomsService } from './question-bank-atoms.service';
import {
  visibilityLabelKey,
  type QuestionBank,
  type QuestionBankItem,
} from './question-banks.model';

/** Discriminated load state for the bank-metadata fetch. */
type BankLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly bank: QuestionBank }
  | { readonly status: 'error'; readonly errorKey: string; readonly notFound: boolean };

/** Discriminated load state for the bank's questions list. */
type QuestionsLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly QuestionBankItem[] }
  | { readonly status: 'error' };

@Component({
  selector: 'chora-rplus-question-bank-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, TranslatePipe, AtomQuestionPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './question-bank-detail.component.html',
  styleUrl: './question-bank-detail.component.scss',
})
export class QuestionBankDetailComponent {
  private readonly service = inject(QuestionBanksService);
  private readonly atoms = inject(QuestionBankAtomsService);
  private readonly toast = inject(ToastService);

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

  // ── Add-picker + assemble-dialog UI state ──────────────────────────────
  readonly showPicker = signal(false);
  /** question id currently being removed — per-row busy + re-entrancy guard. */
  readonly removingId = signal<string | null>(null);

  readonly showAssemble = signal(false);
  readonly assembleTitle = signal('');
  readonly assembleDescription = signal('');
  readonly assembling = signal(false);
  readonly assembleError = signal<string | null>(null);
  readonly assembleAttempted = signal(false);
  readonly assembleTitleValid = computed(() => this.assembleTitle().trim().length > 0);

  constructor() {
    // (Re)fetch metadata + questions whenever the :id route param changes.
    effect(() => {
      const id = this.id();
      this.loadBank(id);
      this.loadQuestions(id);
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
            ? 'rplus.question_banks.detail.error_not_found'
            : 'rplus.question_banks.detail.error_generic',
        });
      },
    });
  }

  private loadQuestions(id: string): void {
    this._questionsState.set({ status: 'loading' });
    this.service.listQuestions(id).subscribe({
      next: (items) => this._questionsState.set({ status: 'success', items }),
      error: () => this._questionsState.set({ status: 'error' }),
    });
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
        this.toast.show('rplus.question_banks.detail.removed', 'success');
        this.loadQuestions(this.id());
      },
      error: () => {
        this.removingId.set(null);
        this.toast.show('rplus.question_banks.detail.remove_failed', 'error');
      },
    });
  }

  // ── Add questions (embedded reused picker) ──────────────────────────────
  toggleAddPicker(): void {
    this.showPicker.update((open) => !open);
  }

  /**
   * Resolve a picker's ATOM id → its embedded question_id, then add THAT to the
   * bank. The picker emits atom ids, but a QuestionBank references the
   * questions-table PK (`question_id`) — posting the atom id 404s
   * (CREATION_QUESTION_NOT_FOUND). Emits 'added', or 'no_question' when the atom
   * has no live question to add (caller toasts). Mirrors the A+ fix.
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
          this.toast.show('rplus.question_banks.detail.add_no_question', 'error');
          return;
        }
        this.toast.show('rplus.question_banks.detail.added', 'success');
        this.loadQuestions(this.id());
      },
      error: () => this.toast.show('rplus.question_banks.detail.add_failed', 'error'),
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
          this.toast.show('rplus.question_banks.detail.added', 'success');
          this.loadQuestions(this.id());
        }
        if (skipped > 0) {
          // Some picked atoms had no live question — surface it, don't silently drop.
          this.toast.show('rplus.question_banks.detail.add_no_question', 'error');
        }
      },
      error: () => this.toast.show('rplus.question_banks.detail.add_failed', 'error'),
    });
  }

  // ── Assemble test-set ───────────────────────────────────────────────────
  openAssemble(): void {
    this.showAssemble.set(true);
  }

  closeAssemble(): void {
    this.showAssemble.set(false);
    this.resetAssemble();
  }

  onAssembleTitleInput(event: Event): void {
    this.assembleTitle.set((event.target as HTMLInputElement).value);
  }

  onAssembleDescriptionInput(event: Event): void {
    this.assembleDescription.set((event.target as HTMLTextAreaElement).value);
  }

  onAssembleSubmit(event: Event): void {
    event.preventDefault();
    this.submitAssemble();
  }

  submitAssemble(): void {
    this.assembleAttempted.set(true);
    if (this.assembling() || !this.assembleTitleValid()) {
      return;
    }
    this.assembling.set(true);
    this.assembleError.set(null);
    this.service
      .assembleTestSet(this.id(), {
        title: this.assembleTitle().trim(),
        description: this.assembleDescription().trim(),
      })
      .subscribe({
        next: () => {
          this.assembling.set(false);
          this.closeAssemble();
          // Toast points the author to attach the test-set via the offering's
          // Assessments tab (the W3.A flow).
          this.toast.show('rplus.question_banks.detail.assemble.success', 'success');
        },
        error: (err: unknown) => {
          this.assembling.set(false);
          this.assembleError.set(extractErrorMessage(err));
        },
      });
  }

  private resetAssemble(): void {
    this.assembleTitle.set('');
    this.assembleDescription.set('');
    this.assembleError.set(null);
    this.assembleAttempted.set(false);
  }
}

/**
 * Pull a human-readable message out of an HttpErrorResponse-shaped value for
 * the loud assemble banner. The chora envelope is `{ error: "..." }`; fall back
 * through nested / top-level shapes to a generic message.
 */
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { error?: unknown; message?: unknown };
    if (e.error && typeof e.error === 'object') {
      const inner = e.error as { error?: unknown; message?: unknown };
      if (typeof inner.error === 'string' && inner.error.length > 0) {
        return inner.error;
      }
      if (typeof inner.message === 'string' && inner.message.length > 0) {
        return inner.message;
      }
    }
    if (typeof e.error === 'string' && e.error.length > 0) {
      return e.error;
    }
    if (typeof e.message === 'string' && e.message.length > 0) {
      return e.message;
    }
  }
  return 'Request failed';
}
