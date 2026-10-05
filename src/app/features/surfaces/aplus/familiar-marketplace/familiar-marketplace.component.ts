/**
 * FamiliarMarketplaceComponent — A+ egg marketplace at
 * `/a/companion/marketplace`.
 *
 * Renders the egg-card grid for the current tenant's catalog + platform
 * SKUs. Per ADR-149: every egg card surfaces its breed odds PRE-CHECKOUT
 * (IMDA D2 mandatory). Lootbox-transparency footer is persistent on
 * every egg-related screen per handoff §4.4.
 *
 * Two acquisition lanes (CHO-2034):
 *  - PAID eggs (priceMicros > 0) → `service.checkout(sku)` returns a
 *    `stripeCheckoutUrl` we redirect to (external Stripe) or navigate to
 *    (in-app mock path `/a/companion/egg/:mockId` for the demo flow).
 *  - the FREE Trial Egg (priceMicros === 0) is seeded purchasable=false, so
 *    the Stripe checkout lane 403s (sku_not_purchasable). It routes to the
 *    sovereign free-claim lane instead: resolve a target map → acquire+bind a
 *    Familiar WITHOUT Stripe (mode "dev_hatched") → land on the map. Every
 *    outcome surfaces a toast — never a console-only 403.
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { map, switchMap, throwError } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { MapsService } from '../my-knowledge/maps.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { EggCardComponent } from './egg-card/egg-card.component';
import type { EggSku } from '../../../../core/familiar/familiar-growth.model';

@Component({
  selector: 'chora-aplus-familiar-marketplace',
  imports: [TranslatePipe, EggCardComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-marketplace.component.html',
  styleUrl: './familiar-marketplace.component.scss',
})
export class FamiliarMarketplaceComponent {
  private readonly growth = inject(FamiliarGrowthService);
  private readonly maps = inject(MapsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly catalog = toSignal(this.growth.getEggCatalog(), {
    initialValue: { skus: [] as readonly EggSku[] },
  });

  /** True while the free-claim lane (resolve map → acquire) is in flight. */
  readonly claiming = signal<boolean>(false);

  onCheckout(sku: EggSku): void {
    // CHO-2034: the free Trial Egg (priceMicros === 0) is not purchasable via
    // Stripe checkout (403 sku_not_purchasable). Route it to the sovereign
    // free-claim lane; paid eggs keep the Stripe checkout flow. Both lanes
    // surface their outcome via a toast — never a silent 403.
    if (sku.priceMicros === 0) {
      this.claimTrial();
      return;
    }
    this.growth.checkout(sku.sku).subscribe({
      next: (resp) => {
        // External Stripe URL → full redirect.
        // In-app mock URL (starts with /) → internal router navigation.
        if (resp.stripeCheckoutUrl.startsWith('/')) {
          this.router.navigateByUrl(resp.stripeCheckoutUrl);
        } else {
          window.location.assign(resp.stripeCheckoutUrl);
        }
      },
      error: () =>
        this.toast.show('aplus.familiar_marketplace.checkout_error', 'error'),
    });
  }

  /**
   * Free Trial Egg claim (CHO-2034). Resolve a target map (one with no Familiar
   * yet), then acquire+bind a Familiar to it WITHOUT the Stripe ceremony
   * (dev_hatched). One-per-learner + one-per-map are enforced server-side and
   * surface as a friendly toast (409/limit → claim_error). On success, land the
   * learner on the map so they meet their companion and the campaign begins.
   */
  private claimTrial(): void {
    if (this.claiming()) return;
    this.claiming.set(true);
    this.maps
      .listMaps()
      .pipe(
        switchMap((maps) => {
          // Bind to a map that has no Familiar yet (never overwrite an
          // existing bond); a missing/empty atlas is a friendly guide, not a
          // 403 on click.
          const target = maps.find((m) => !m.attachedFamiliarId);
          if (!target) {
            return throwError(() => new Error('NO_MAP'));
          }
          return this.growth
            .acquireFamiliar(target.goalId, { mode: 'dev_hatched' })
            .pipe(map(() => target.goalId));
        }),
      )
      .subscribe({
        next: (goalId) => {
          this.claiming.set(false);
          this.toast.show(
            'aplus.familiar_marketplace.claim_success',
            'success',
          );
          this.router.navigateByUrl(`/a/knowledge/${goalId}`);
        },
        error: (err: unknown) => {
          this.claiming.set(false);
          if (err instanceof Error && err.message === 'NO_MAP') {
            this.toast.show(
              'aplus.familiar_marketplace.claim_no_map',
              'error',
            );
            this.router.navigateByUrl('/a/knowledge');
          } else {
            this.toast.show('aplus.familiar_marketplace.claim_error', 'error');
          }
        },
      });
  }
}
