/**
 * WblComponent — R+ /r/wbl Work-Based Learning placements admin surface
 * (M13 R+ buildout).
 *
 * Renders the live list of WBL placements for the current tenant with
 * per-row state badge, completion progress, host/supervisor metadata,
 * and a Withdraw CTA (BE soft-delete = state transition to WITHDRAWN).
 *
 * As of M15b Stage-C wave-3 the header "+ New Placement" CTA opens an
 * inline composer panel (ReactiveForms) that POSTs the snake-case
 * createWblPlacementReq envelope through WblService.create() — i.e.
 * real BFF wiring per `feedback_no_stubs_real_wiring`. On a 2xx the
 * list reloads via the reloadKey switchMap; on a 4xx the BE error
 * message surfaces in an inline banner without closing the panel so
 * the author can fix + retry.
 *
 * Data path: WblService → BffClientService → chora-gateway BFF →
 * chora-delivery wbl_handler.go.
 *
 * Surface: R+ Rhythm+ (.surface-rplus accent — currently mirrors A+ per
 * feedback_chora_brand_palette_canonical; distinct R+ palette deferred).
 * Tablet-first: ≥768px primary, ≥1280px desktop enhanced.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { switchMap } from 'rxjs/operators';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { WblService } from './wbl.service';
import {
  Placement,
  PlacementState,
  completionPercent,
  stateBadgeVariant,
} from './wbl.model';

interface PlacementRow extends Placement {
  /** Pre-computed completion percentage [0..100] for the progress bar. */
  readonly completionPct: number;
}

@Component({
  selector: 'chora-rplus-wbl',
  imports: [ReactiveFormsModule, TranslatePipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wbl.component.html',
  styleUrl: './wbl.component.scss',
})
export class WblComponent {
  private readonly service = inject(WblService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * `reloadKey` increments after every successful create / update /
   * withdraw — the data signal switchMaps on it so the list refreshes
   * end-to-end against the BFF (no fixture short-circuit).
   */
  private readonly reloadKey = signal(0);

  private readonly data = toSignal(
    toObservable(this.reloadKey).pipe(
      switchMap(() => this.service.list()),
    ),
    {
      initialValue: null,
    },
  );

  readonly tenantName = computed<string>(() => this.data()?.tenantName ?? '');
  readonly totalPlacements = computed<number>(
    () => this.data()?.totalPlacements ?? 0,
  );

  /**
   * i18n key for the total-count noun: singular for exactly one placement,
   * plural otherwise (CHO-2335, the "1 placements" grammar bug). The count
   * itself is rendered separately (bolded), so the label carries only the noun.
   */
  readonly totalCountLabelKey = computed<string>(() =>
    this.totalPlacements() === 1
      ? 'rplus.wbl.total_label_one'
      : 'rplus.wbl.total_label',
  );
  readonly items = computed<readonly PlacementRow[]>(() => {
    const list = this.data()?.items ?? [];
    return list.map((p) => ({
      ...p,
      completionPct: completionPercent(p.hoursCompleted, p.hoursRequired),
    }));
  });

  // ── Search + latest-first sort + client-side pagination ─────────────
  /** Free-text filter over host / supervisor / learner / course / state. */
  readonly searchQuery = signal<string>('');
  /** Rows shown before the "Load more" button. */
  private readonly PAGE_SIZE = 12;
  readonly visibleLimit = signal<number>(this.PAGE_SIZE);

  /** Search-filtered placements, newest-first (createdAt desc, id tiebreak). */
  readonly filteredItems = computed<readonly PlacementRow[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const rows = q
      ? this.items().filter((p) =>
          [p.hostOrgName, p.supervisorName, p.gcid, p.courseId, p.state].some(
            (f) => (f ?? '').toLowerCase().includes(q),
          ),
        )
      : this.items();
    return [...rows].sort((a, b) =>
      (b.createdAt || b.id).localeCompare(a.createdAt || a.id),
    );
  });

  /** The rows actually rendered (paged slice). */
  readonly visibleItems = computed<readonly PlacementRow[]>(() =>
    this.filteredItems().slice(0, this.visibleLimit()),
  );
  readonly hasMore = computed<boolean>(
    () => this.filteredItems().length > this.visibleLimit(),
  );
  readonly hasItems = computed<boolean>(() => this.items().length > 0);
  /** Items exist but the current search matched none. */
  readonly noMatch = computed<boolean>(
    () => this.items().length > 0 && this.filteredItems().length === 0,
  );

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.visibleLimit.set(this.PAGE_SIZE);
  }
  loadMore(): void {
    this.visibleLimit.update((n) => n + this.PAGE_SIZE);
  }

  /** Bumps the reload trigger — kept reactive to ensure the linter sees
   *  reloadKey as read. */
  readonly reloadCount = computed(() => this.reloadKey());

  /** True while the composer panel is rendered. */
  readonly composerOpen = signal<boolean>(false);

  /** True while a POST is inflight (disables submit + cancel buttons). */
  readonly submitting = signal<boolean>(false);

  /** Inline error banner — populated from the BE response on a 4xx/5xx. */
  readonly composerError = signal<string | null>(null);

  /**
   * ReactiveForm draft mirroring the createWblPlacementReq snake-case
   * envelope (see services/chora-delivery/internal/adapter/http/wbl_handler.go).
   * Validators mirror the wbl.NewPlacement() invariants:
   *   - gcid / course_id / host_org_name / supervisor_name required
   *   - supervisor_email must include '@' (the BE looksLikeEmail check
   *     is stricter; we let the BE arbitrate)
   *   - start_date / end_date required (HTML5 date inputs)
   *   - hours_required > 0 (min 1)
   */
  readonly draft: FormGroup = this.fb.group({
    gcid: ['', [Validators.required]],
    course_id: ['', [Validators.required]],
    host_org_name: ['', [Validators.required]],
    role_title: [''],
    start_date: ['', [Validators.required]],
    end_date: ['', [Validators.required]],
    supervisor_name: ['', [Validators.required]],
    supervisor_email: ['', [Validators.required, Validators.email]],
    hours_required: [
      1,
      [Validators.required, Validators.min(1)],
    ],
  });

  badge(state: PlacementState): string {
    return stateBadgeVariant(state);
  }

  /**
   * Header "+ New Placement" CTA — opens the composer panel. Per
   * `feedback_no_stubs_real_wiring` we never fake a successful create;
   * the panel renders the ReactiveForm and the user must drive a real
   * POST to land a placement.
   */
  onCompose(): void {
    this.composerOpen.set(true);
    this.composerError.set(null);
    this.draft.reset({
      gcid: '',
      course_id: '',
      host_org_name: '',
      role_title: '',
      start_date: '',
      end_date: '',
      supervisor_name: '',
      supervisor_email: '',
      hours_required: 1,
    });
  }

  /**
   * Cancel CTA — closes the composer panel + clears the form + dismisses
   * any inline error banner. No BE call.
   */
  onCancel(): void {
    this.composerOpen.set(false);
    this.composerError.set(null);
    this.submitting.set(false);
  }

  /**
   * Submit CTA — POSTs the draft envelope through WblService. On 2xx
   * the panel closes + the list reloads. On 4xx/5xx the BE message
   * surfaces in the inline banner and the panel stays open so the
   * author can fix + retry.
   */
  onSubmit(): void {
    if (this.draft.invalid || this.submitting()) {
      this.draft.markAllAsTouched();
      return;
    }
    const raw = this.draft.getRawValue() as {
      gcid: string;
      course_id: string;
      host_org_name: string;
      role_title: string;
      start_date: string;
      end_date: string;
      supervisor_name: string;
      supervisor_email: string;
      hours_required: number;
    };
    this.submitting.set(true);
    this.composerError.set(null);
    this.service
      .create({
        gcid: raw.gcid.trim(),
        courseId: raw.course_id.trim(),
        hostOrgName: raw.host_org_name.trim(),
        supervisorName: raw.supervisor_name.trim(),
        supervisorEmail: raw.supervisor_email.trim(),
        startDate: raw.start_date,
        endDate: raw.end_date,
        hoursRequired: Number(raw.hours_required) || 0,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.composerOpen.set(false);
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.composerError.set(extractErrorMessage(err));
        },
      });
  }

  /** True while a per-row withdraw DELETE is in flight (any row). */
  readonly withdrawing = signal<boolean>(false);

  /**
   * Per-row Withdraw CTA. Confirm-gated (DELETE is destructive) via the
   * shared ConfirmDialogService; on confirm it fires the real BE
   * soft-delete (state → WITHDRAWN) and reloads the list so the row
   * picks up its new state. Per `feedback_no_stubs_real_wiring` the
   * click drives a real DELETE — no faked soft-delete.
   */
  async onWithdrawClicked(placementId: string): Promise<void> {
    if (this.withdrawing()) return;
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.wbl.withdraw_confirm_title',
      message: 'rplus.wbl.withdraw_confirm_body',
      confirmText: 'rplus.wbl.withdraw_confirm_ok',
      cancelText: 'rplus.wbl.withdraw_confirm_cancel',
      variant: 'danger',
    });
    if (!ok) return;
    this.withdrawing.set(true);
    this.service
      .withdraw(placementId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.withdrawing.set(false);
          this.reloadKey.update((n) => n + 1);
        },
        error: () => {
          this.withdrawing.set(false);
          // Re-pull so the row reflects server-of-record state even on a
          // failed withdraw (e.g. a concurrent terminal transition).
          this.reloadKey.update((n) => n + 1);
        },
      });
  }
}

/**
 * Pulls a human-readable error message out of an arbitrary HttpErrorResponse-
 * shaped value. Falls back to a generic "request failed" if no shape matches
 * — the BE envelope is `{ error: "..." }` so we look there first.
 */
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { error?: unknown; message?: unknown };
    if (e.error && typeof e.error === 'object') {
      const inner = (e.error as { error?: unknown; message?: unknown });
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
