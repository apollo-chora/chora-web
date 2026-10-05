/**
 * SkillsFuturesClaimDetailComponent — R+ Wave-5 drill-down for a
 * single SkillsFutures funding claim (`/r/skillsfutures-claims/:id`).
 *
 * Drill-down from `/r/skillsfutures-claims` queue. Renders the SSG
 * funding claim with: state badge, learner+course, NRIC sha256 hash
 * (truncated for at-a-glance + full-hash hover), requested + approved
 * amounts in SGD, submission + decision timestamps, decider gcid +
 * rejection reason (when terminal). Per-claim Approve / Reject CTAs
 * fire the BE decision endpoints — they are visible ONLY when state =
 * PENDING (the FE invariant; the BE rejects non-PENDING with 409).
 *
 * Route: `/r/skillsfutures-claims/:id` (route entry owned by master).
 * The `:id` route param is injected via `withComponentInputBinding()`
 * per chora-web/CLAUDE.md §8.
 *
 * Data path: SkillsFuturesClaimDetailService → BffClientService →
 * chora-gateway BFF → chora-delivery skillsfutures_handler.go
 * (no fixtures, no mocks per feedback_no_stubs_real_wiring — failed
 * BE → fail-loud error banner; never fabricate a placeholder).
 *
 * Approve uses a placeholder amount = requested_amount (a richer
 * approve-amount composer lands in a follow-on iter); Reject uses a
 * placeholder reason; both are wired to fire against the live BE so
 * the contract stays exercised. The per-row composer surfaced in the
 * list view is shared work for both screens.
 *
 * Surface: R+ Rhythm+ (.surface-rplus accent). Tablet-first: ≥768px
 * primary, ≥1280px desktop enhanced (2-column field grid).
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { SkillsFuturesClaimDetailService } from './skillsfutures-claim-detail.service';
import {
  type SkillsFuturesClaim,
  type SkillsFuturesClaimState,
  formatSGD,
  shortNricHash,
  stateBadgeVariant,
} from './skillsfutures-claim-detail.model';

/** Discriminated AsyncState — loading / success / error. */
export type SkillsFuturesClaimDetailLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly claim: SkillsFuturesClaim }
  | { readonly status: 'error'; readonly errorKey: string };

@Component({
  selector: 'chora-rplus-skillsfutures-claim-detail',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skillsfutures-claim-detail.component.html',
  styleUrl: './skillsfutures-claim-detail.component.scss',
})
export class SkillsFuturesClaimDetailComponent {
  private readonly service = inject(SkillsFuturesClaimDetailService);
  private readonly destroyRef = inject(DestroyRef);

  /** `:id` route param wired via `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  /** Tracks whether a write CTA (Approve / Reject) is in flight. */
  private readonly writePending = signal<boolean>(false);

  private readonly loadStateSignal =
    signal<SkillsFuturesClaimDetailLoadState>({ status: 'loading' });

  readonly loadState = computed<SkillsFuturesClaimDetailLoadState>(
    () => this.loadStateSignal(),
  );

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

  readonly claim = computed<SkillsFuturesClaim | null>(() => {
    const s = this.loadStateSignal();
    return s.status === 'success' ? s.claim : null;
  });

  readonly canDecide = computed<boolean>(() => {
    const c = this.claim();
    return c?.state === 'PENDING';
  });

  readonly isWritePending = computed<boolean>(() => this.writePending());

  constructor() {
    // Re-fetch whenever the :id route param changes (initial nav incl.).
    effect(() => {
      const id = this.id();
      this.loadClaim(id);
    });
  }

  badge(state: SkillsFuturesClaimState): string {
    return stateBadgeVariant(state);
  }

  sgd(cents: number): string {
    return formatSGD(cents);
  }

  nric(hash: string): string {
    return shortNricHash(hash);
  }

  /** Retry the failing fetch using the current :id signal. */
  retry(): void {
    this.loadClaim(this.id());
  }

  /**
   * Trigger the BE Approve transition with the claim's requested
   * amount (placeholder — a richer approve-amount composer lands in a
   * follow-on iter; this keeps the contract exercised against live BE).
   * Per feedback_no_stubs_real_wiring we never fabricate the result;
   * the BE response replaces the in-memory claim.
   */
  approve(): void {
    const c = this.claim();
    if (!c || !this.canDecide() || this.writePending()) return;
    this.writePending.set(true);
    this.service
      .approve(c.id, c.requestedAmountSGDCents)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.loadStateSignal.set({ status: 'success', claim: updated });
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

  /**
   * Trigger the BE Reject transition with a placeholder reason. A
   * full reject-reason composer modal lands in a follow-on iter; this
   * keeps the wire path exercised against live BE so the contract is
   * never stub-skipped.
   */
  reject(): void {
    const c = this.claim();
    if (!c || !this.canDecide() || this.writePending()) return;
    this.writePending.set(true);
    this.service
      .reject(c.id, 'rejected via admin detail view')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.loadStateSignal.set({ status: 'success', claim: updated });
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

  private loadClaim(id: string): void {
    this.loadStateSignal.set({ status: 'loading' });
    this.service
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (claim) => this.loadStateSignal.set({ status: 'success', claim }),
        error: (err: unknown) =>
          this.loadStateSignal.set({
            status: 'error',
            errorKey: this.errorKeyFor(err),
          }),
      });
  }

  private errorKeyFor(err: unknown): string {
    const status = (err as { status?: number } | null)?.status;
    if (typeof status === 'number') {
      if (status === 404) {
        return 'rplus.skillsfuturesClaimDetail.errorNotFound';
      }
      if (status === 401 || status === 403) {
        return 'rplus.skillsfuturesClaimDetail.errorUnauthorised';
      }
      if (status === 409) {
        return 'rplus.skillsfuturesClaimDetail.errorConflict';
      }
      if (status >= 500) {
        return 'rplus.skillsfuturesClaimDetail.errorUpstream';
      }
    }
    return 'rplus.skillsfuturesClaimDetail.errorGeneric';
  }
}
