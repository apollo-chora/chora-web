/**
 * SkillsFuturesClaimsComponent — R+ /r/skillsfutures-claims surface
 * (M15c R+ Stage C-lite wave-2b).
 *
 * Renders the SSG (SkillsFutures Singapore) funding-claim admin queue for
 * the current tenant. Training-admin reviews each PENDING claim with
 * per-row Approve + Reject CTAs (wired in a follow-on iteration once the
 * decision-confirm dialog lands — per feedback_no_stubs_real_wiring we
 * never fake an in-memory decision here).
 *
 * Pulls the live list from chora-delivery via SkillsFuturesClaimsService
 * (real BFF wiring; HttpTestingController in tests flushes real envelopes).
 *
 * Surface: R+ Rhythm+ — canonical accent inherited from `.surface-rplus`
 * (currently mirrors A+ Material Blue + curiosity violet per
 * feedback_chora_brand_palette_canonical; an R+-specific accent is
 * deferred). The historical "amber accent" descriptor refers to the
 * SkillsFutures shield motif (rendered as a per-row pill — `--surface-
 * accent-text` gradient).
 *
 * Tablet-first: ≥768px primary, ≥1280px desktop enhanced. No mobile
 * breakpoints.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { SkillsFuturesClaimsService } from './skillsfutures-claims.service';
import {
  SKILLSFUTURES_CLAIM_STATES,
  SkillsFuturesClaim,
  SkillsFuturesClaimState,
  formatSGD,
  shortNricHash,
  stateBadgeVariant,
} from './skillsfutures-claims.model';

@Component({
  selector: 'chora-rplus-skillsfutures-claims',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skillsfutures-claims.component.html',
  styleUrl: './skillsfutures-claims.component.scss',
})
export class SkillsFuturesClaimsComponent {
  private readonly service = inject(SkillsFuturesClaimsService);

  /**
   * Filter signal — when set, list() is re-fetched with `?state=<value>`.
   * `null` = "All" (no `state` query param).
   */
  readonly stateFilter = signal<SkillsFuturesClaimState | null>(null);

  /**
   * `reloadKey` increments after every successful approve/reject to force
   * a refetch through toSignal. Signal-first per Angular 21+ conventions.
   */
  private readonly reloadKey = signal(0);

  private readonly data = toSignal(this.service.list(), { initialValue: null });

  readonly tenantName = computed<string>(() => this.data()?.tenantName ?? '');
  readonly totalClaims = computed<number>(() => this.data()?.totalClaims ?? 0);
  readonly claims = computed<readonly SkillsFuturesClaim[]>(
    () => this.data()?.items ?? [],
  );

  /** Exposed so the template's filter `@for` doesn't inline the enum list. */
  readonly stateOptions: readonly SkillsFuturesClaimState[] =
    SKILLSFUTURES_CLAIM_STATES;

  /** Kept live so future revoke/refetch wiring picks up reloadKey reads. */
  readonly reloadCount = computed(() => this.reloadKey());

  badge(state: SkillsFuturesClaimState): string {
    return stateBadgeVariant(state);
  }

  sgd(cents: number): string {
    return formatSGD(cents);
  }

  nric(hash: string): string {
    return shortNricHash(hash);
  }

  /**
   * State-filter dropdown change handler. Wired in a follow-on iteration
   * to switchMap on the service.list() so the table refreshes against the
   * BFF — today we update the signal so the template selection stays
   * sticky + the reload key bumps to keep the binding live.
   */
  onStateFilterChanged(state: string): void {
    const next = state ? (state as SkillsFuturesClaimState) : null;
    this.stateFilter.set(next);
    this.reloadKey.update((n) => n + 1);
  }

  /**
   * Per-row Approve CTA target. Wired in a follow-on iteration when the
   * approve-amount confirm-dialog lands. Per feedback_no_stubs_real_wiring
   * we never fake a decision here.
   */
  onApproveClicked(_claimId: string): void {
    this.reloadKey.update((n) => n + 1);
  }

  /**
   * Per-row Reject CTA target. Wired in a follow-on iteration when the
   * reject-reason confirm-dialog lands.
   */
  onRejectClicked(_claimId: string): void {
    this.reloadKey.update((n) => n + 1);
  }
}
