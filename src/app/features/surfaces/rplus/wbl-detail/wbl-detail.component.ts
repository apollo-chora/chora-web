/**
 * WblDetailComponent — R+ Wave-5 drill-down for a single WBL placement.
 *
 * Route: `/r/wbl/:id` (route entry owned by master; rplus.routes.ts is
 * untouched per the wave-5 contract). The `:id` route param is injected
 * via `withComponentInputBinding()` per chora-web/CLAUDE.md §8 — the
 * signal input pattern keeps the component standalone + reactive without
 * a manual ActivatedRoute subscription.
 *
 * Data path: WblDetailService → BffClientService → chora-gateway BFF →
 * chora-delivery wbl_handler.go::handleWblGet (no fixtures, no mocks per
 * feedback_no_stubs_real_wiring — empty BE → fail-loud error, the FE
 * never fabricates a placeholder placement).
 *
 * Render branches (discriminated AsyncState):
 *   - loading → skeleton "Loading…" panel
 *   - error   → role="alert" banner + Retry CTA (also catches the 404
 *               "placement not found" branch + propagated 5xx upstream)
 *   - success → full glass-panel detail with all wire fields rendered,
 *               breadcrumb back to /r/wbl, an inline PATCH form
 *               (hours_completed + evaluator_notes → PATCH /api/v1/wbl-
 *               placements/{id}), and a confirm-gated Withdraw CTA
 *               (DELETE soft-delete → state WITHDRAWN).
 *
 * The PATCH form mirrors the BE patchWblPlacementReq shape — both fields
 * optional; on a 2xx the placement is replaced in-place (the breadcrumb
 * + progress bar + state badge re-derive). On a 409 (terminal/over-hours)
 * the BE message surfaces in an inline banner without losing the draft.
 * Per `feedback_no_stubs_real_wiring` every write drives a real BFF call.
 *
 * Surface: R+ Rhythm+ (.surface-rplus accent). Tablet-first: ≥768px
 * primary, ≥1280px desktop enhanced (2-column detail dl).
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { WblDetailService } from './wbl-detail.service';
import {
  Placement,
  PlacementState,
  completionPercent,
  stateBadgeVariant,
} from './wbl-detail.model';

/** Discriminated AsyncState — loading / success / error. */
export type WblDetailLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly placement: Placement }
  | { readonly status: 'error'; readonly errorKey: string };

@Component({
  selector: 'chora-rplus-wbl-detail',
  imports: [RouterLink, ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wbl-detail.component.html',
  styleUrl: './wbl-detail.component.scss',
})
export class WblDetailComponent {
  private readonly service = inject(WblDetailService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly confirmDialog = inject(ConfirmDialogService);

  /**
   * `:id` route param wired via `withComponentInputBinding()` —
   * provideRouter is already configured with that feature at the app
   * root per chora-web/CLAUDE.md §8.
   */
  readonly id = input.required<string>();

  /** Tracks whether a write CTA (Withdraw) is in flight. */
  private readonly writePending = signal<boolean>(false);

  /** Tracks whether the PATCH (Record hours / notes) is in flight. */
  private readonly patchPending = signal<boolean>(false);

  /** Inline PATCH error banner — populated from the BE response (409/400). */
  private readonly patchErrorSignal = signal<string | null>(null);

  /**
   * ReactiveForm draft mirroring patchWblPlacementReq:
   *   - hours_completed ≥ 0 (BE clamps the upper bound to hoursRequired)
   *   - evaluator_notes ≤ 4000 chars (BE MaxEvaluatorNotesLen)
   * Pre-filled from the loaded placement; both fields stay optional —
   * only changed values are forwarded on the wire.
   */
  readonly patchDraft: FormGroup = this.fb.group({
    hours_completed: [0, [Validators.required, Validators.min(0)]],
    evaluator_notes: ['', [Validators.maxLength(4000)]],
  });

  /** Load state for the detail fetch. */
  private readonly loadStateSignal = signal<WblDetailLoadState>({
    status: 'loading',
  });

  readonly loadState = computed<WblDetailLoadState>(() => this.loadStateSignal());

  readonly isLoading = computed<boolean>(
    () => this.loadStateSignal().status === 'loading',
  );

  readonly isError = computed<boolean>(
    () => this.loadStateSignal().status === 'error',
  );

  readonly errorKey = computed<string>(() => {
    const s = this.loadStateSignal();
    return s.status === 'error' ? s.errorKey : '';
  });

  readonly placement = computed<Placement | null>(() => {
    const s = this.loadStateSignal();
    return s.status === 'success' ? s.placement : null;
  });

  readonly completionPct = computed<number>(() => {
    const p = this.placement();
    if (!p) return 0;
    return completionPercent(p.hoursCompleted, p.hoursRequired);
  });

  readonly canWithdraw = computed<boolean>(() => {
    const p = this.placement();
    if (!p) return false;
    return p.state !== 'COMPLETED' && p.state !== 'WITHDRAWN';
  });

  readonly isWithdrawPending = computed<boolean>(() => this.writePending());

  readonly isPatchPending = computed<boolean>(() => this.patchPending());

  readonly patchError = computed<string | null>(() => this.patchErrorSignal());

  /**
   * The PATCH form is only editable while the placement is in an open
   * state (SCHEDULED / IN_PROGRESS). The BE returns 409 ErrPlacementClosed
   * once COMPLETED / WITHDRAWN, so we disable the form to match.
   */
  readonly canEdit = computed<boolean>(() => {
    const p = this.placement();
    if (!p) return false;
    return p.state !== 'COMPLETED' && p.state !== 'WITHDRAWN';
  });

  /** Upper bound for the hours_completed input — the loaded hoursRequired. */
  readonly hoursRequired = computed<number>(
    () => this.placement()?.hoursRequired ?? 0,
  );

  constructor() {
    // Re-fetch whenever the :id route param changes (initial nav incl.).
    effect(() => {
      const id = this.id();
      this.loadPlacement(id);
    });
    // Lock the PATCH inputs when the placement is in a terminal state so
    // the form mirrors the BE 409 ErrPlacementClosed guard. Reactive-form
    // disable() is the canonical path (vs a [disabled] template binding,
    // which Angular warns against on formControlName).
    effect(() => {
      if (this.canEdit()) {
        this.patchDraft.enable({ emitEvent: false });
      } else {
        this.patchDraft.disable({ emitEvent: false });
      }
    });
  }

  badge(state: PlacementState): string {
    return stateBadgeVariant(state);
  }

  /** Retry the failing fetch using the current :id signal. */
  retry(): void {
    this.loadPlacement(this.id());
  }

  /**
   * Submit the PATCH form. Only the fields that differ from the loaded
   * placement are forwarded so an unchanged note is not needlessly
   * re-stamped. On a 2xx the placement is replaced in-place (state badge
   * + progress re-derive); on a 4xx/5xx the BE message surfaces in an
   * inline banner without clearing the draft so the author can fix +
   * retry.
   */
  savePatch(): void {
    const p = this.placement();
    if (!p || !this.canEdit() || this.patchPending() || this.patchDraft.invalid) {
      this.patchDraft.markAllAsTouched();
      return;
    }
    const raw = this.patchDraft.getRawValue() as {
      hours_completed: number;
      evaluator_notes: string;
    };
    const patch: { hoursCompleted?: number; evaluatorNotes?: string } = {};
    const nextHours = Number(raw.hours_completed);
    if (Number.isFinite(nextHours) && nextHours !== p.hoursCompleted) {
      patch.hoursCompleted = nextHours;
    }
    const nextNotes = (raw.evaluator_notes ?? '').trim();
    if (nextNotes !== p.evaluatorNotes) {
      patch.evaluatorNotes = nextNotes;
    }
    // Nothing changed — no-op rather than firing an empty PATCH.
    if (patch.hoursCompleted === undefined && patch.evaluatorNotes === undefined) {
      return;
    }
    this.patchPending.set(true);
    this.patchErrorSignal.set(null);
    this.service
      .update(p.id, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.patchPending.set(false);
          this.loadStateSignal.set({ status: 'success', placement: updated });
          this.seedPatchDraft(updated);
        },
        error: (err: unknown) => {
          this.patchPending.set(false);
          this.patchErrorSignal.set(extractErrorMessage(err));
        },
      });
  }

  /**
   * Confirm-gated soft-delete. Opens the shared ConfirmDialogService
   * (DELETE is destructive) and only fires the BE call on an explicit
   * confirm. On success we replace the placement in-place so the
   * breadcrumb + UI pick up the new WITHDRAWN state without a full
   * reload. The Withdraw CTA disables itself while the request is in
   * flight + when the placement is already in a terminal state per
   * `canWithdraw`.
   */
  async withdraw(): Promise<void> {
    const p = this.placement();
    if (!p || !this.canWithdraw() || this.writePending()) return;
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.wblDetail.withdraw_confirm_title',
      message: 'rplus.wblDetail.withdraw_confirm_body',
      confirmText: 'rplus.wblDetail.withdraw_confirm_ok',
      cancelText: 'rplus.wblDetail.withdraw_confirm_cancel',
      variant: 'danger',
    });
    if (!ok) return;
    this.writePending.set(true);
    this.service
      .withdraw(p.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.loadStateSignal.set({ status: 'success', placement: updated });
          this.seedPatchDraft(updated);
          this.writePending.set(false);
        },
        error: (err: unknown) => {
          this.writePending.set(false);
          this.loadStateSignal.set({
            status: 'error',
            errorKey: this.errorKeyFor(err),
          });
        },
      });
  }

  private loadPlacement(id: string): void {
    this.loadStateSignal.set({ status: 'loading' });
    this.patchErrorSignal.set(null);
    this.service
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (placement) => {
          this.loadStateSignal.set({ status: 'success', placement });
          this.seedPatchDraft(placement);
        },
        error: (err: unknown) =>
          this.loadStateSignal.set({
            status: 'error',
            errorKey: this.errorKeyFor(err),
          }),
      });
  }

  /** Reset the PATCH draft to mirror the freshly-loaded placement. */
  private seedPatchDraft(p: Placement): void {
    this.patchDraft.reset({
      hours_completed: p.hoursCompleted,
      evaluator_notes: p.evaluatorNotes,
    });
  }

  private errorKeyFor(err: unknown): string {
    const status = (err as { status?: number } | null)?.status;
    if (typeof status === 'number') {
      if (status === 404) return 'rplus.wblDetail.errorNotFound';
      if (status === 401 || status === 403) {
        return 'rplus.wblDetail.errorUnauthorised';
      }
      if (status >= 500) return 'rplus.wblDetail.errorUpstream';
    }
    return 'rplus.wblDetail.errorGeneric';
  }
}

/**
 * Pulls a human-readable error message out of an arbitrary
 * HttpErrorResponse-shaped value for the inline PATCH banner. The BE
 * envelope is `{ error: "..." }` (see writeError in chora-delivery), so
 * we look there first; falls back to a generic message when no shape
 * matches.
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
