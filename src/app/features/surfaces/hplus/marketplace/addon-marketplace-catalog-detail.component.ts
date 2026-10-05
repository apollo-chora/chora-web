/**
 * H+ Marketplace catalog detail screen.
 *
 * Routes: `/h/marketplace/:addonPlanId` (browse), plus the same path
 * with `?checkout=success|cancel` queryparams used by the Stripe-hosted
 * Checkout return loop (CHO-1741).
 *
 * Reads from the tenant-agnostic BFF alias
 *   GET /api/v1/admin/marketplace/addons/{addonPlanId}
 * via `TenantAddonsAdminService.getMarketplaceDetail` (landed in
 * CHO-1735 PR 2 of the FE) and renders:
 *
 *   - Title (display_name + code), category badge, description.
 *   - `Installed ✓` badge when `is_installed === true`.
 *   - Entitlements list.
 *   - Integrations matrix.
 *   - Compliance pills (GDPR / PDPA / CCPA / IMDA) + residency chips.
 *   - Pricing tier cards.
 *   - Subscribe CTA → CHO-1741 calls
 *     `TenantAddonsAdminService.createCheckoutSession` and redirects
 *     the browser to Stripe-hosted Checkout. On return:
 *       - `?checkout=success` → 5-poll retry on `getMarketplaceDetail`
 *         until `is_installed === true`, then `subscribeActivated`
 *         toast. The tenancy subscriber (CHO-1740) flips the row
 *         after the Stripe webhook fires; this loop covers the
 *         eventual-consistency window.
 *       - `?checkout=cancel` → neutral `subscribeCancelled` toast.
 *   - 404 → not-found banner.
 *   - Loading / server-error / unauthenticated banners.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import {
  AddOnEntitlement,
  AddOnIntegration,
  AddOnPricingTier,
  MarketplaceAddonDetail,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

interface CompliancePill {
  readonly key: 'gdpr' | 'pdpa' | 'ccpa' | 'imda';
  readonly labelKey: string;
  readonly compliant: boolean;
}

/** Polling cadence after `?checkout=success` returns: 1s, 2s, 4s, 8s, 16s. */
const RETURN_POLL_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 16000];

@Component({
  selector: 'chora-hplus-addon-marketplace-catalog-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addon-marketplace-catalog-detail.component.html',
  styleUrl: './addon-marketplace-catalog-detail.component.scss',
})
export class AddonMarketplaceCatalogDetailComponent {
  private readonly addonsSvc = inject(TenantAddonsAdminService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly addonPlanId = signal<string>(
    this.route.snapshot.paramMap.get('addonPlanId') ?? '',
  );

  // ---------------------------------------------------------------------------
  // Async state
  // ---------------------------------------------------------------------------

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly detail = signal<MarketplaceAddonDetail | null>(null);

  /** True while the Subscribe → BFF → Stripe URL call is in flight. */
  readonly subscribeInFlight = signal(false);

  /**
   * CHO-1755 — the tier the tenant admin has selected on the detail
   * screen's radio-card group. Empty string until the first detail
   * load auto-initialises it via the effect below, then tracks user
   * clicks. Single-tier addons skip the radio chrome entirely; the
   * value still drives `onSubscribe` so the wire payload always uses
   * the chosen tier (defaulting to `[0]`).
   */
  readonly selectedTier = signal<string>('');

  // ---------------------------------------------------------------------------
  // Computed view-model
  // ---------------------------------------------------------------------------

  readonly entitlements = computed<ReadonlyArray<AddOnEntitlement>>(
    () => this.detail()?.entitlements ?? [],
  );
  readonly integrations = computed<ReadonlyArray<AddOnIntegration>>(
    () => this.detail()?.integrations ?? [],
  );
  readonly pricingTiers = computed<ReadonlyArray<AddOnPricingTier>>(
    () => this.detail()?.pricing_tiers ?? [],
  );
  /**
   * True when the calling tenant currently holds the addon. Reads both
   * the CHO-1747 canonical `installed` field AND the legacy
   * `is_installed` alias chora-tenancy ships during the transitional
   * window. Either being true means installed.
   */
  readonly isInstalled = computed(() => {
    const d = this.detail();
    return d?.installed === true || d?.is_installed === true;
  });

  /**
   * CHO-1749 — always-on baseline plans (`base` today). Drives system
   * badge + suppresses Subscribe / Activate Free affordances. The BE
   * enforces the same constraint via `cannot_unsubscribe_base` /
   * `amount_cents > 0`; this is an affordance gate, not a security gate.
   */
  readonly isSystem = computed(() => this.detail()?.system === true);

  /**
   * CHO-1780 — pending end-of-cycle tier change surfaced from the
   * tenant-scoped GET's `current_subscription`. Both fields must be
   * populated (defensive: never half-display).
   */
  readonly scheduledTier = computed<string | null>(() => {
    const sub = this.detail()?.current_subscription;
    if (!sub?.scheduled_tier_code || !sub.scheduled_effective_at) return null;
    return sub.scheduled_tier_code;
  });
  readonly scheduledEffectiveAt = computed<string | null>(() => {
    const sub = this.detail()?.current_subscription;
    if (!sub?.scheduled_tier_code || !sub.scheduled_effective_at) return null;
    return sub.scheduled_effective_at;
  });

  /**
   * CHO-1782 — destructive counterpart: surfaces the cycle-end deactivation
   * date when the snapshot is in PENDING_DEACTIVATION + has the date.
   */
  readonly deactivationEffectiveAt = computed<string | null>(() => {
    const sub = this.detail()?.current_subscription;
    if (sub?.status !== 'PENDING_DEACTIVATION' || !sub.deactivation_effective_at) {
      return null;
    }
    return sub.deactivation_effective_at;
  });

  /**
   * Format an ISO timestamp as YYYY-MM-DD for the scheduled-tier badge.
   * Mirrors AddonManagementComponent.formatScheduledDate added in PR #91.
   */
  formatScheduledDate(iso: string): string {
    const idx = iso.indexOf('T');
    return idx > 0 ? iso.slice(0, idx) : iso;
  }

  /**
   * CHO-1742 — true when the first pricing tier is $0/mo. The catalog
   * detail screen swaps the Subscribe CTA for `Activate Free` (Stripe
   * Checkout rejects $0 sessions by design).
   */
  readonly isFreeAddon = computed(() => {
    const tier = this.detail()?.pricing_tiers?.[0];
    return tier !== undefined && tier.monthly_price_cents === 0;
  });

  /** True while the Activate-Free POST is in flight. */
  readonly activateInFlight = signal(false);

  readonly compliancePills = computed<ReadonlyArray<CompliancePill>>(() => {
    const c = this.detail()?.compliance ?? {};
    return [
      { key: 'gdpr', labelKey: 'hplus.marketplace.detail.compliance.gdpr', compliant: !!c.gdpr },
      { key: 'pdpa', labelKey: 'hplus.marketplace.detail.compliance.pdpa', compliant: !!c.pdpa },
      { key: 'ccpa', labelKey: 'hplus.marketplace.detail.compliance.ccpa', compliant: !!c.ccpa },
      { key: 'imda', labelKey: 'hplus.marketplace.detail.compliance.imda', compliant: !!c.imda },
    ];
  });

  readonly residencyRegions = computed<ReadonlyArray<string>>(
    () => this.detail()?.compliance?.data_residency_regions ?? [],
  );

  constructor() {
    this.fetch();
    this.handleCheckoutReturn();
    // CHO-1755 — keep `selectedTier` in sync with the loaded detail so
    // it auto-initialises on first paint and resets if the detail
    // signal is swapped out (e.g. on the optimistic activation flip in
    // onActivateFree).
    //
    // CHO-1757 — when the BFF emits `current_tier` (only when the
    // tenant holds the addon), prefer it over `pricing_tiers[0]` so the
    // tier the tenant actually paid for is reflected after returning
    // from Stripe Checkout. Subscribe-flow tenants still default to
    // tiers[0]; stale codes fall back the same way.
    effect(() => {
      const d = this.detail();
      const tiers = d?.pricing_tiers ?? [];
      if (tiers.length === 0) {
        return;
      }
      const current = this.selectedTier();
      const stillValid = tiers.some((t) => t.tier_code === current);
      if (stillValid) {
        return;
      }
      const preferred = d?.current_tier;
      if (preferred && tiers.some((t) => t.tier_code === preferred)) {
        this.selectedTier.set(preferred);
        return;
      }
      this.selectedTier.set(tiers[0].tier_code);
    });
  }

  /**
   * CHO-1755 — radio-card click handler. Guards against the
   * single-tier path being clicked (the template hides chrome there)
   * and against picking a code that isn't on the catalogue row.
   */
  selectTier(code: string): void {
    const tiers = this.detail()?.pricing_tiers ?? [];
    if (!tiers.some((t) => t.tier_code === code)) {
      return;
    }
    this.selectedTier.set(code);
  }

  // ---------------------------------------------------------------------------
  // Subscribe CTA — CHO-1741 + CHO-1755 (tier picker).
  // ---------------------------------------------------------------------------

  onSubscribe(): void {
    if (this.isInstalled() || this.subscribeInFlight()) return;
    // CHO-1749 — system plans (always-on baseline) can't be subscribed.
    if (this.isSystem()) return;
    // CHO-1742 — free tiles route through onActivateFree, not Subscribe.
    if (this.isFreeAddon()) return;
    const d = this.detail();
    if (!d) return;
    // CHO-1755 — use the tier the admin picked on the radio-card group.
    // Falls back to pricing_tiers[0] for the legacy single-tier path
    // where selectedTier may still be empty if the effect hasn't run.
    const tiers = d.pricing_tiers ?? [];
    const tier =
      tiers.find((t) => t.tier_code === this.selectedTier()) ?? tiers[0];
    if (!tier) {
      this.toast.show(
        'hplus.marketplace.detail.subscribeFailed.validation',
        'error',
      );
      return;
    }
    this.subscribeInFlight.set(true);
    this.addonsSvc
      .createCheckoutSession({
        addonPlanId: d.addon_plan_id,
        addonCode: d.code,
        tierCode: tier.tier_code,
        amountCents: tier.monthly_price_cents,
        currency: tier.currency,
      })
      .subscribe({
        next: (result) => {
          this.subscribeInFlight.set(false);
          switch (result.kind) {
            case 'success':
              // Hard-navigate to Stripe-hosted Checkout. Use `href`
              // (not `replace`) so the back button returns to the
              // catalog detail page if the user cancels.
              window.location.href = result.stripeCheckoutUrl;
              return;
            case 'validation-error':
              this.toast.show(
                'hplus.marketplace.detail.subscribeFailed.validation',
                'error',
              );
              return;
            case 'unauthenticated':
              this.toast.show(
                'hplus.marketplace.detail.subscribeFailed.unauthenticated',
                'error',
              );
              return;
            case 'payments-down':
              this.toast.show(
                'hplus.marketplace.detail.subscribeFailed.paymentsDown',
                'error',
              );
              return;
            case 'network-error':
              this.toast.show(
                'hplus.marketplace.detail.subscribeFailed.network',
                'error',
              );
              return;
          }
        },
        error: () => {
          this.subscribeInFlight.set(false);
          this.toast.show(
            'hplus.marketplace.detail.subscribeFailed.network',
            'error',
          );
        },
      });
  }

  // ---------------------------------------------------------------------------
  // CHO-1742 — Activate-Free CTA (for $0 tiles).
  // ---------------------------------------------------------------------------

  onActivateFree(): void {
    if (this.isInstalled() || this.activateInFlight()) return;
    // CHO-1749 — system plans (always-on baseline) can't be re-activated.
    if (this.isSystem()) return;
    if (!this.isFreeAddon()) return;
    const d = this.detail();
    if (!d) return;
    this.activateInFlight.set(true);
    this.addonsSvc.activateAddon(d.addon_plan_id).subscribe({
      next: (result) => {
        this.activateInFlight.set(false);
        switch (result.kind) {
          case 'success':
            // Optimistically flip the local detail so the Installed
            // badge appears immediately + the CTA hides. The tenancy
            // registry's Subscribe is synchronous + idempotent, so
            // there's no eventual-consistency window to poll over
            // (unlike the Stripe Checkout path).
            this.detail.set({ ...d, is_installed: true });
            this.toast.show(
              'hplus.marketplace.detail.activateFreeActivated',
              'success',
            );
            return;
          case 'not-found':
            this.toast.show(
              'hplus.marketplace.detail.activateFreeFailed.notFound',
              'error',
            );
            return;
          case 'validation-error':
            this.toast.show(
              'hplus.marketplace.detail.activateFreeFailed.validation',
              'error',
            );
            return;
          case 'unauthenticated':
            this.toast.show(
              'hplus.marketplace.detail.activateFreeFailed.unauthenticated',
              'error',
            );
            return;
          case 'server-error':
            this.toast.show(
              'hplus.marketplace.detail.activateFreeFailed.serverError',
              'error',
            );
            return;
          case 'network-error':
            this.toast.show(
              'hplus.marketplace.detail.activateFreeFailed.network',
              'error',
            );
            return;
        }
      },
      error: () => {
        this.activateInFlight.set(false);
        this.toast.show(
          'hplus.marketplace.detail.activateFreeFailed.network',
          'error',
        );
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Post-checkout return — `?checkout=success` polls; `?checkout=cancel` toasts.
  // ---------------------------------------------------------------------------

  private handleCheckoutReturn(): void {
    const param = this.route.snapshot.queryParamMap.get('checkout');
    if (param === 'cancel') {
      this.toast.show('hplus.marketplace.detail.subscribeCancelled', 'info');
      return;
    }
    if (param !== 'success') return;
    // Kick off the polling loop. Each tick re-fetches the detail; we
    // stop early once `is_installed === true` (the tenancy subscriber
    // has flipped the row), then surface the success toast.
    this.pollUntilInstalled(0);
  }

  private pollUntilInstalled(attempt: number): void {
    if (attempt >= RETURN_POLL_DELAYS_MS.length) {
      // 5 attempts and still not flipped — show the optimistic-pending
      // toast so the user knows Stripe accepted the payment but
      // chora-tenancy hasn't materialised the row yet (DLQ recoverable).
      this.toast.show(
        'hplus.marketplace.detail.subscribeActivationPending',
        'info',
      );
      return;
    }
    const delay = RETURN_POLL_DELAYS_MS[attempt];
    setTimeout(() => {
      this.addonsSvc.getMarketplaceDetail(this.addonPlanId()).subscribe({
        next: (result) => {
          if (result.kind === 'success') {
            this.detail.set(result.detail);
            if (result.detail.is_installed === true) {
              this.toast.show(
                'hplus.marketplace.detail.subscribeActivated',
                'success',
              );
              return;
            }
          }
          this.pollUntilInstalled(attempt + 1);
        },
        error: () => this.pollUntilInstalled(attempt + 1),
      });
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  private fetch(): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.loadError.set(null);
    this.addonsSvc.getMarketplaceDetail(this.addonPlanId()).subscribe({
      next: (result) => {
        this.loading.set(false);
        switch (result.kind) {
          case 'success':
            this.detail.set(result.detail);
            return;
          case 'not-found':
            this.notFound.set(true);
            return;
          case 'unauthenticated':
            this.loadError.set('hplus.marketplace.detail.error.unauthenticated');
            return;
          case 'server-error':
          case 'network-error':
            this.loadError.set('hplus.marketplace.detail.error.serverError');
            return;
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('hplus.marketplace.detail.error.serverError');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------

  formatTierPrice(tier: AddOnPricingTier): string {
    const dollars = tier.monthly_price_cents / 100;
    // CHO-1798 — uppercase the ISO code (BE may echo "sgd" lowercase);
    // matches the change-tier + addon-detail formatters.
    const code = (tier.currency ?? '').toUpperCase() || 'SGD';
    return `${code} ${dollars.toFixed(2)}/mo`;
  }

  trackByEntitlement(_idx: number, e: AddOnEntitlement): string {
    return e.feature_code;
  }

  trackByIntegration(_idx: number, i: AddOnIntegration): string {
    return i.type;
  }

  trackByTier(_idx: number, t: AddOnPricingTier): string {
    return t.tier_code;
  }
}
