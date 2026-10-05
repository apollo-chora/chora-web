/**
 * H+ Add-on Marketplace Tile Detail screen (CHO-1734 STITCH-H-ADD-5
 * — the FINAL sub-story closing epic CHO-1697).
 *
 * Route: /h/addons/:addonPlanId/detail
 * Reached from the dashboard tile's `View in Marketplace` action
 * (CHO-1698 button now navigates here instead of firing the
 * `Coming soon` toast).
 *
 * Reads from the gateway alias
 *   GET /api/v1/admin/tenants/me/addons/{addonPlanId}
 * via TenantAddonsAdminService.getDetail (landed CHO-1734 PR 1) and
 * renders:
 *   - Title (display_name + code), category badge, description.
 *   - Entitlements list, integrations matrix.
 *   - Compliance pills (GDPR / PDPA / CCPA / IMDA) + data residency
 *     regions chip list.
 *   - Pricing-tier cards with current-tier highlight (`aria-current`).
 *   - Subscription snapshot block + `Manage` CTA when the tenant has
 *     an active subscription.
 *   - `Install coming soon` copy when not subscribed (the Purchase /
 *     Activate flow is on a separate epic).
 *   - 404 → `Not currently subscribed` empty state.
 *   - Loading / server-error / unauthenticated banners.
 *
 * Out of scope (deferred — epic close already reached):
 *   - Marketplace catalog browse list (separate epic).
 *   - Stripe Checkout / install flow (separate epic).
 *   - Markdown rendering for `description` (v1 plain text only).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import {
  AddOnDetail,
  AddOnEntitlement,
  AddOnIntegration,
  AddOnPricingTier,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

interface CompliancePill {
  readonly key: 'gdpr' | 'pdpa' | 'ccpa' | 'imda';
  readonly labelKey: string;
  readonly compliant: boolean;
}

@Component({
  selector: 'chora-hplus-addon-marketplace-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addon-marketplace-detail.component.html',
  styleUrl: './addon-marketplace-detail.component.scss',
})
export class AddonMarketplaceDetailComponent {
  private readonly addonsSvc = inject(TenantAddonsAdminService);
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
  readonly detail = signal<AddOnDetail | null>(null);

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
  readonly subscription = computed(() => this.detail()?.current_subscription ?? null);
  readonly isSubscribed = computed(() => this.subscription() != null);
  readonly currentTierCode = computed(() => this.subscription()?.current_tier ?? null);

  /**
   * CHO-1780 — pending end-of-cycle tier change. Both fields must be
   * populated; defensive partial guard avoids a "<empty> starting <date>"
   * half-display.
   */
  readonly scheduledTier = computed<string | null>(() => {
    const sub = this.subscription();
    if (!sub?.scheduled_tier_code || !sub.scheduled_effective_at) return null;
    return sub.scheduled_tier_code;
  });
  readonly scheduledEffectiveAt = computed<string | null>(() => {
    const sub = this.subscription();
    if (!sub?.scheduled_tier_code || !sub.scheduled_effective_at) return null;
    return sub.scheduled_effective_at;
  });

  /**
   * CHO-1782 — destructive counterpart: surfaces the cycle-end deactivation
   * date when the snapshot is in PENDING_DEACTIVATION + has the date.
   * Half-populated states render nothing (matches the scheduled-tier guard).
   */
  readonly deactivationEffectiveAt = computed<string | null>(() => {
    const sub = this.subscription();
    if (sub?.status !== 'PENDING_DEACTIVATION' || !sub.deactivation_effective_at) {
      return null;
    }
    return sub.deactivation_effective_at;
  });

  /** YYYY-MM-DD slice of an ISO timestamp — matches PR #91's tile badge. */
  formatScheduledDate(iso: string): string {
    const idx = iso.indexOf('T');
    return idx > 0 ? iso.slice(0, idx) : iso;
  }

  readonly compliancePills = computed<ReadonlyArray<CompliancePill>>(() => {
    const c = this.detail()?.compliance ?? {};
    return [
      { key: 'gdpr', labelKey: 'hplus.addons.detail.compliance.gdpr', compliant: !!c.gdpr },
      { key: 'pdpa', labelKey: 'hplus.addons.detail.compliance.pdpa', compliant: !!c.pdpa },
      { key: 'ccpa', labelKey: 'hplus.addons.detail.compliance.ccpa', compliant: !!c.ccpa },
      { key: 'imda', labelKey: 'hplus.addons.detail.compliance.imda', compliant: !!c.imda },
    ];
  });

  readonly residencyRegions = computed<ReadonlyArray<string>>(
    () => this.detail()?.compliance?.data_residency_regions ?? [],
  );

  constructor() {
    this.fetch();
  }

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  private fetch(): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.loadError.set(null);
    this.addonsSvc.getDetail(this.addonPlanId()).subscribe({
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
            this.loadError.set('hplus.addons.detail.error.unauthenticated');
            return;
          case 'server-error':
          case 'network-error':
            this.loadError.set('hplus.addons.detail.error.serverError');
            return;
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('hplus.addons.detail.error.serverError');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------

  /**
   * Format cents as "<CODE> X.YY/mo" (consistent with the change-tier
   * screen). CHO-1798: previously rendered "$X.YY/mo" with a hardcoded
   * "$", which kept showing USD-styling after the CHO-1787 SGD swap.
   * Mirrors AddonChangeTierComponent.formatTierPrice.
   */
  formatTierPrice(tier: AddOnPricingTier): string {
    const dollars = tier.monthly_price_cents / 100;
    const code = (tier.currency ?? '').toUpperCase() || 'SGD';
    return `${code} ${dollars.toFixed(2)}/mo`;
  }

  isCurrentTier(tier: AddOnPricingTier): boolean {
    return this.currentTierCode() === tier.tier_code;
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
