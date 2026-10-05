/**
 * H+ Familiar Egg catalog list: `/h/marketplace/companion-eggs`.
 *
 * Tenant-admin view of the SKU catalog. Per ADR-149 IMDA D2: every
 * SKU surfaces its `breed_distribution` JSONB so admins can audit /
 * tune odds before the learner sees the disclosure. Click a row → edit
 * form at `/h/marketplace/companion-eggs/:sku`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';

@Component({
  selector: 'chora-hplus-familiar-eggs',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-eggs.component.html',
  styleUrl: './familiar-eggs.component.scss',
})
export class FamiliarEggsComponent {
  private readonly growth = inject(FamiliarGrowthService);

  readonly catalog = toSignal(this.growth.getEggCatalog(), {
    initialValue: { skus: [] },
  });

  formatPrice(priceMicros: number, currency: string): string {
    if (priceMicros === 0) return 'FREE';
    const dollars = (priceMicros / 1_000_000).toFixed(2);
    const sym = currency === 'USD' ? '$' : currency === 'SGD' ? 'S$' : currency + ' ';
    return `${sym}${dollars}`;
  }
}
