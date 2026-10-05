/**
 * EggCardComponent — one egg SKU in the marketplace grid.
 *
 * Visual structure:
 *   - Header: SKU display name + branded-tenant chip (if tenant-branded)
 *   - Pod art (breed-neutral, per-tier pod image via podArt() — owner
 *     2026-07-16 egg→pod migration; the breed stays a hatch-time reveal)
 *   - Description
 *   - Mana-tier inclusion chip (if applicable)
 *   - Price line ($X.XX or "Free Trial Egg")
 *   - "Show odds" toggle → reveals <chora-egg-odds-table>
 *   - "Choose this egg" CTA → calls checkout()
 *
 * IMDA D2 mandate per ADR-149: the odds table is REQUIRED to be
 * surfaced pre-checkout. The toggle is "show" only; once revealed, the
 * table stays visible until the user navigates away — we don't hide it
 * after reveal because that could be construed as obscuring the
 * disclosure.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { EggOddsTableComponent } from '../egg-odds-table/egg-odds-table.component';
import type { EggSku } from '../../../../../core/familiar/familiar-growth.model';

@Component({
  selector: 'chora-egg-card',
  imports: [TranslatePipe, EggOddsTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './egg-card.component.html',
  styleUrl: './egg-card.component.scss',
})
export class EggCardComponent {
  readonly sku = input.required<EggSku>();
  readonly checkoutRequested = output<EggSku>();

  readonly oddsRevealed = signal<boolean>(false);

  readonly priceDisplay = computed<string>(() => {
    const s = this.sku();
    if (s.priceMicros === 0) return 'FREE';
    const dollars = (s.priceMicros / 1_000_000).toFixed(2);
    return `${this.currencySymbol(s.currency)}${dollars}`;
  });

  readonly isTrial = computed<boolean>(() => this.sku().priceMicros === 0);

  readonly isBrandedTenant = computed<boolean>(() => !!this.sku().brandedTenantName);

  /**
   * Per-tier POD art (owner 2026-07-16 — "egg" imagery replaced by pods). Trial =
   * green starter, premium/legendary = violet+gold, everything else = standard
   * blue. Breed stays a hatch-time reveal, so the pod art is tier-neutral, not
   * breed-specific.
   */
  readonly podArt = computed<string>(() => {
    if (this.isTrial()) return '/assets/familiars/pods/pod-trial.png';
    const sku = this.sku().sku.toLowerCase();
    if (/premium|legendary|rare|elite/.test(sku)) {
      return '/assets/familiars/pods/pod-premium.png';
    }
    return '/assets/familiars/pods/pod-standard.png';
  });

  showOdds(): void {
    this.oddsRevealed.set(true);
  }

  onCheckout(): void {
    this.checkoutRequested.emit(this.sku());
  }

  private currencySymbol(code: string): string {
    switch (code.toUpperCase()) {
      case 'USD': return '$';
      case 'SGD': return 'S$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      default: return code + ' ';
    }
  }
}
