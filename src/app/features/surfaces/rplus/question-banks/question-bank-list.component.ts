/**
 * QuestionBankListComponent — the `/r/question-banks` List page (R+).
 *
 * "My question banks": lists the caller's reusable question pools (real BFF
 * wiring via `QuestionBanksService.listMine`) and offers an inline Create
 * dialog (name + description + visibility + tags). Fail-loud, no fixtures: a
 * failed fetch shows a loud error with retry; an honest empty-state leads the
 * author to create their first bank.
 *
 * Per chora-web CLAUDE.md: standalone + OnPush + signals + @if/@for +
 * data-testid + BFF-only HTTP. The route is role-gated upstream
 * (`roleGuard('assessment:author')`), so no in-component access panel.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { QuestionBanksService } from './question-banks.service';
import {
  visibilityLabelKey,
  type QuestionBank,
  type QuestionBankVisibility,
} from './question-banks.model';

/** Discriminated load state for the "my banks" fetch. */
type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly banks: readonly QuestionBank[] }
  | { readonly status: 'error' };

/** Selectable visibilities for the create form (object attribute, no toggle). */
const VISIBILITIES: readonly QuestionBankVisibility[] = ['PRIVATE', 'TENANT_INTERNAL'];

@Component({
  selector: 'chora-rplus-question-bank-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './question-bank-list.component.html',
  styleUrl: './question-bank-list.component.scss',
})
export class QuestionBankListComponent {
  private readonly service = inject(QuestionBanksService);
  private readonly toast = inject(ToastService);

  readonly visibilities = VISIBILITIES;
  readonly visibilityLabelKey = visibilityLabelKey;

  // ── List load state ────────────────────────────────────────────────────
  private readonly _state = signal<ListState>({ status: 'loading' });
  readonly state = this._state.asReadonly();
  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');
  readonly banks = computed<readonly QuestionBank[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.banks : [];
  });
  readonly isEmpty = computed(
    () => this._state().status === 'success' && this.banks().length === 0,
  );

  // ── Create dialog state + form fields (signal-driven, OnPush-friendly) ──
  readonly showCreate = signal(false);
  readonly name = signal('');
  readonly description = signal('');
  readonly visibility = signal<QuestionBankVisibility>('PRIVATE');
  readonly tagsRaw = signal('');
  readonly submitting = signal(false);
  readonly createError = signal<string | null>(null);
  readonly attempted = signal(false);

  readonly nameValid = computed(() => this.name().trim().length > 0);
  readonly parsedTags = computed<readonly string[]>(() => parseTags(this.tagsRaw()));

  constructor() {
    this.load();
  }

  // ── List actions ────────────────────────────────────────────────────────
  load(): void {
    this._state.set({ status: 'loading' });
    this.service.listMine().subscribe({
      next: (page) => this._state.set({ status: 'success', banks: page.items }),
      error: () => this._state.set({ status: 'error' }),
    });
  }

  retry(): void {
    this.load();
  }

  /** Question count for a bank — derives from the membership items length. */
  questionCount(bank: QuestionBank): number {
    return bank.items.length;
  }

  // ── Create dialog ─────────────────────────────────────────────────────────
  openCreate(): void {
    this.showCreate.set(true);
  }

  closeCreate(): void {
    this.showCreate.set(false);
    this.resetForm();
  }

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  onDescriptionInput(event: Event): void {
    this.description.set((event.target as HTMLTextAreaElement).value);
  }

  onVisibilityChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as QuestionBankVisibility;
    if (VISIBILITIES.includes(value)) {
      this.visibility.set(value);
    }
  }

  onTagsInput(event: Event): void {
    this.tagsRaw.set((event.target as HTMLInputElement).value);
  }

  /**
   * Native form submit. Signal-driven (no FormsModule), so bind `(submit)` and
   * `preventDefault()` to stop the browser navigating.
   */
  onSubmit(event: Event): void {
    event.preventDefault();
    this.submit();
  }

  /**
   * Validate + POST. On 201: close the dialog, refresh the list, toast success.
   * On 4xx/5xx: surface the BE message in a loud banner without clearing the
   * draft (the author can fix + retry).
   */
  submit(): void {
    this.attempted.set(true);
    if (this.submitting() || !this.nameValid()) {
      return;
    }
    this.submitting.set(true);
    this.createError.set(null);
    this.service
      .createBank({
        name: this.name().trim(),
        description: this.description().trim(),
        visibility: this.visibility(),
        tags: this.parsedTags(),
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeCreate();
          this.toast.show('rplus.question_banks.create.success', 'success');
          this.load();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.createError.set(extractErrorMessage(err));
        },
      });
  }

  private resetForm(): void {
    this.name.set('');
    this.description.set('');
    this.visibility.set('PRIVATE');
    this.tagsRaw.set('');
    this.createError.set(null);
    this.attempted.set(false);
  }
}

/** Split a comma-separated tags string into a clean, de-duplicated list. */
function parseTags(raw: string): readonly string[] {
  const seen = new Set<string>();
  for (const token of raw.split(',')) {
    const t = token.trim();
    if (t.length > 0) {
      seen.add(t);
    }
  }
  return [...seen];
}

/**
 * Pull a human-readable message out of an HttpErrorResponse-shaped value for
 * the loud create banner. The chora envelope is `{ error: "..." }`; fall back
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
