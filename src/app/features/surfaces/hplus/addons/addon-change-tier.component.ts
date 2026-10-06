/**
 * H+ Add-on Change-Tier screen.
 *
 * Route: /h/addons/:addonPlanId/change-tier
 *
 * CHO-1733 shipped a v1 placeholder (text input for the target_plan_id
 * UUID). CHO-1766 replaces it with a visual radio-card tier picker +
 * debounced Stripe-Invoice-upcoming preview card, backed by the
 * CHO-1764/1765/1767 BE chain (real `Subscription.update` + real
 * `Invoice.upcoming` deltas).
 *
 * Flow:
 *   1. constructor → fetch addon detail → populate tiers + current_tier
 *   2. user clicks a tier card → debounce 300ms → preview call
 *   3. preview success → render preview card with billing_delta
 *   4. user clicks Confirm → PATCH /me/addons/<id> changeTier
 *   5. success → result card (existing); error → banner
 *
 * CHO-1772 — end-of-cycle radio is now wired end-to-end. Toggling
 * Immediately / End of billing cycle re-fires the preview against the
 * BE's SubscriptionSchedule path: end_of_cycle returns
 * billing_delta=0 + next_invoice = the new tier's full monthly price;
 * immediate returns the Stripe Invoice.upcoming proration delta.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../core/services/translate.service';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import {
  AddOnPricingTier,
  ChangeAddonTierRequest,
  ChangeAddonTierResponse,
  ChangeAddonTierResult,
  PreviewAddonTierResponse,
  PreviewAddonTierResult,
  ProrationMode,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

/**
 * CHO-1772 follow-up — collapsed from the original (proration_mode ×
 * effective_at) matrix to a single binary selector. The "immediate +
 * no proration" combo was a trap (user forfeits their unused
 * current-cycle credit for nothing), so it's removed; proration_mode
 * is now BE-internal and derived from the selector:
 *
 *   immediate    → effective_at=null, proration_mode=create_prorations
 *   end-of-cycle → effective_at=<ISO>, proration_mode=none
 *
 * Derivation is in changeModeToPayload() so the spec can pin it.
 */
export type ChangeMode = 'immediate' | 'end-of-cycle';

@Component({
  selector: 'chora-hplus-addon-change-tier',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addon-change-tier.component.html',
  styleUrl: './addon-change-tier.component.scss',
})
export class AddonChangeTierComponent {
  private readonly addonsSvc = inject(TenantAddonsAdminService);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(TranslateService);

  readonly addonPlanId = signal<string>(
    this.route.snapshot.paramMap.get('addonPlanId') ?? '',
  );

  // ---------------------------------------------------------------------------
  // Detail-loaded state
  // ---------------------------------------------------------------------------

  readonly tiers = signal<readonly AddOnPricingTier[]>([]);
  readonly currentTier = signal<string>('');
  readonly detailLoading = signal<boolean>(true);
  readonly detailLoadError = signal<boolean>(false);

  // ---------------------------------------------------------------------------
  // Picker state
  // ---------------------------------------------------------------------------

  readonly selectedTier = signal<string>('');
  /**
   * CHO-1772 follow-up — single source of truth for the "when does the
   * new tier take effect?" selector. proration_mode + effective_at on
   * the BE wire are derived via changeModeToPayload().
   */
  readonly changeMode = signal<ChangeMode>('immediate');
  /** Derived ProrationMode for the BE payload. */
  readonly prorationMode = computed<ProrationMode>(
    () => changeModeToPayload(this.changeMode()).prorationMode,
  );

  // ---------------------------------------------------------------------------
  // Preview state
  // ---------------------------------------------------------------------------

  readonly preview = signal<PreviewAddonTierResponse | null>(null);
  readonly previewLoading = signal<boolean>(false);
  readonly previewError = signal<PreviewAddonTierResult['kind'] | null>(null);

  // ---------------------------------------------------------------------------
  // Submit state
  // ---------------------------------------------------------------------------

  readonly submitting = signal(false);
  readonly result = signal<ChangeAddonTierResponse | null>(null);
  readonly error = signal<ChangeAddonTierResult['kind'] | null>(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  readonly canSubmit = computed(() => {
    if (this.submitting()) return false;
    const picked = this.selectedTier();
    if (!picked || picked === this.currentTier()) return false;
    // Allow submit either after preview success OR when the path
    // doesn't bill anything mid-cycle (proration=none).
    if (this.prorationMode() === 'none') return true;
    return this.preview() !== null;
  });

  /**
   * True when the picker should hide because the row predates
   * CHO-1762 — change-tier returns 422 no_stripe_subscription. We
   * surface this on the picker side (via preview error) so the user
   * sees the banner before clicking Confirm.
   */
  readonly noStripeSubscription = computed(
    () => this.previewError() === 'no-stripe-subscription',
  );

  private previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.fetchDetail();
    // CHO-1766 — when the user clicks a tier, schedule a debounced
    // preview call. Single effect drives both the cleared-state on
    // re-pick + the actual fetch after the debounce delay.
    // CHO-1772 follow-up — also re-fire when the changeMode selector
    // toggles. The derived (effective_at, proration_mode) tuple
    // changes per mode, and the BE returns different deltas/anchors.
    effect(() => {
      const tier = this.selectedTier();
      const current = this.currentTier();
      const mode = this.changeMode();
      this.preview.set(null);
      this.previewError.set(null);
      if (!tier || tier === current) {
        return;
      }
      if (this.previewDebounceTimer !== null) {
        clearTimeout(this.previewDebounceTimer);
      }
      this.previewLoading.set(true);
      this.previewDebounceTimer = setTimeout(() => {
        this.runPreview(tier, mode);
      }, 300);
    });
  }

  // ---------------------------------------------------------------------------
  // Detail fetch
  // ---------------------------------------------------------------------------

  private fetchDetail(): void {
    this.detailLoading.set(true);
    this.detailLoadError.set(false);
    this.addonsSvc.getDetail(this.addonPlanId()).subscribe({
      next: (r) => {
        this.detailLoading.set(false);
        if (r.kind !== 'success') {
          this.detailLoadError.set(true);
          return;
        }
        this.tiers.set(r.detail.pricing_tiers ?? []);
        const ct = r.detail.current_subscription?.current_tier ?? '';
        this.currentTier.set(ct);
      },
      error: () => {
        this.detailLoading.set(false);
        this.detailLoadError.set(true);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Picker
  // ---------------------------------------------------------------------------

  selectTier(code: string): void {
    if (code === this.currentTier()) return;
    if (!this.tiers().some((t) => t.tier_code === code)) return;
    this.selectedTier.set(code);
  }

  setChangeMode(mode: ChangeMode): void {
    this.changeMode.set(mode);
  }

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  private runPreview(targetTierCode: string, mode: ChangeMode): void {
    const payload = changeModeToPayload(mode);
    this.addonsSvc
      .previewTierChange(this.addonPlanId(), {
        target_tier_code: targetTierCode,
        proration_mode: payload.prorationMode,
        effective_at: payload.effectiveAtISO,
      })
      .subscribe({
        next: (r) => {
          this.previewLoading.set(false);
          if (r.kind === 'success') {
            this.preview.set(r.response);
            this.previewError.set(null);
          } else {
            this.preview.set(null);
            this.previewError.set(r.kind);
          }
        },
        error: () => {
          this.previewLoading.set(false);
          this.preview.set(null);
          this.previewError.set('network-error');
        },
      });
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  submit(): void {
    if (!this.canSubmit()) return;
    const planId = this.addonPlanId();
    if (!planId) return;
    this.submitting.set(true);
    this.error.set(null);
    const derived = changeModeToPayload(this.changeMode());
    const payload: ChangeAddonTierRequest = {
      // CHO-1766 — the BE accepts either target_plan_id OR target_tier_code
      // and prefers tier_code when both are present (see chora-tenancy's
      // changeTierReq decoder). We send the tier_code from the picker
      // and leave plan_id null.
      target_plan_id: this.selectedTier(),
      proration_mode: derived.prorationMode,
      effective_at: derived.effectiveAtISO,
    };
    this.addonsSvc.changeTier(planId, payload).subscribe({
      next: (r) => {
        this.submitting.set(false);
        switch (r.kind) {
          case 'success-immediate':
          case 'success-scheduled':
            this.result.set(r.response);
            return;
          default:
            this.error.set(r.kind);
            return;
        }
      },
      error: () => {
        this.submitting.set(false);
        this.error.set('server-error');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------

  // CHO-1789 — formatCurrency surfaces the response currency rather than
  // a hardcoded "$". After CHO-1787's USD→SGD platform swap the prior
  // implementation kept rendering "$" on the preview banner + result
  // card even though chora-payments echoed back currency="sgd". Accepts
  // undefined for the ChangeAddonTierResponse case where a stale BE may
  // omit the field (fallback to SGD platform default).
  formatCurrency(cents: number, currency: string | undefined): string {
    const abs = Math.abs(cents) / 100;
    const code = (currency ?? '').trim().toUpperCase() || 'SGD';
    return `${code} ${abs.toFixed(2)}`;
  }

  formatTierPrice(tier: AddOnPricingTier): string {
    return `${tier.currency.toUpperCase()} ${(tier.monthly_price_cents / 100).toFixed(2)}/mo`;
  }

  isCredit(cents: number): boolean {
    return cents < 0;
  }

  formatPreviewCharge(cents: number, currency: string | undefined): string {
    return this.i18n
      .instant('hplus.addons.changeTier.previewCharge')
      .replace('{{amount}}', this.formatCurrency(cents, currency));
  }

  formatPreviewCredit(cents: number, currency: string | undefined): string {
    return this.i18n
      .instant('hplus.addons.changeTier.previewCredit')
      .replace('{{amount}}', this.formatCurrency(cents, currency));
  }

  trackByTier(_idx: number, t: AddOnPricingTier): string {
    return t.tier_code;
  }

}

/**
 * Pure derivation: 1 changeMode → (proration_mode, effective_at ISO).
 * Exported as a free function so the spec can pin it without spinning
 * up the component, and so future callers (e.g. a confirm-modal
 * summary) can reuse the same mapping.
 *
 * effective_at: chora-tenancy translates any non-null ISO into the
 * `end_of_cycle` tag for chora-payments; the actual cycle anchor is
 * resolved server-side from row.CurrentPeriodEnd. Any future ISO
 * works as the marker; +30d is a stable placeholder.
 */
export function changeModeToPayload(mode: ChangeMode): {
  readonly prorationMode: ProrationMode;
  readonly effectiveAtISO: string | null;
} {
  switch (mode) {
    case 'immediate':
      // CHO-1786 — always_invoice (was create_prorations) so Stripe
      // creates a separate invoice TODAY for the prorated delta and
      // charges the default payment method. The result card's
      // "Additional charge today" label is now truthful; the preview
      // copy in en.json was updated in the same PR to drop the "added
      // to your next invoice" wording.
      return { prorationMode: 'always_invoice', effectiveAtISO: null };
    case 'end-of-cycle':
      return {
        prorationMode: 'none',
        effectiveAtISO: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      };
  }
}
