/**
 * H+ Add-On Marketplace catalog browse (CHO-1735).
 *
 * Previously shipped with a 5-tile static mock + an in-page Terms of
 * Service modal that mutated local state to `installed`. CHO-1735
 * promotes this to a real catalog browse against the BFF alias
 * `GET /api/v1/admin/marketplace/addons` (tenant-agnostic — the BE
 * strips `current_subscription` from list responses). Clicking a tile
 * routes to the catalog detail screen at
 * `/h/marketplace/:addonPlanId` (separate component), where the
 * Subscribe CTA lives. The actual Stripe Checkout flow is the next
 * epic (CHO-1736) — for now Subscribe shows a coming-soon toast.
 *
 * Behaviour:
 *   - On init, calls `TenantAddonsAdminService.listMarketplace({})`.
 *   - Renders one tile per `AddOnDetail` row from the BE.
 *   - Tile click → `router.navigate(['/h/marketplace', planId])`.
 *   - Loading / empty / error states render their own banners.
 *
 * Source HTML: chora-web/.stitch-imports/hplus/addon-marketplace.html
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import { AddOnDetail } from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

interface MarketplaceTileVm {
  readonly addonPlanId: string;
  readonly code: string;
  readonly displayName: string;
  readonly description: string;
  readonly category: string;
  readonly priceLabel: string;
  /** CHO-1745 — always-on baseline plan; suppresses Subscribe affordances. */
  readonly system: boolean;
  /** CHO-1745 — tenant holds a live subscription (ACTIVE + PENDING + GRACE + PENDING_DEACTIVATION). */
  readonly installed: boolean;
}

@Component({
  selector: 'chora-hplus-marketplace',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addon-marketplace.component.html',
  styleUrl: './addon-marketplace.component.scss',
})
export class AddonMarketplaceComponent {
  private readonly addonsSvc = inject(TenantAddonsAdminService);
  private readonly router = inject(Router);

  // ---------------------------------------------------------------------------
  // Async state
  // ---------------------------------------------------------------------------

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  private readonly _items = signal<readonly AddOnDetail[]>([]);

  // ---------------------------------------------------------------------------
  // Computed view-model
  // ---------------------------------------------------------------------------

  readonly tiles = computed<readonly MarketplaceTileVm[]>(() =>
    this._items().map((it) => this.toTile(it)),
  );

  readonly isEmpty = computed(
    () => !this.loading() && this._items().length === 0 && this.loadError() === null,
  );

  constructor() {
    this.fetch();
  }

  reload(): void {
    this.fetch();
  }

  trackByPlanId(_idx: number, tile: MarketplaceTileVm): string {
    return tile.addonPlanId;
  }

  /**
   * Tile click handler — routes to the catalog detail screen. The
   * Install / Subscribe CTA lives on the detail page (CHO-1735 PR 2).
   */
  openDetail(tile: MarketplaceTileVm): void {
    this.router.navigate(['/h/marketplace', tile.addonPlanId]);
  }

  /**
   * Primary CTA for system or already-installed plans (CHO-1749). Deep-
   * links to the Add-On Management surface so the user can manage the
   * subscription directly rather than being offered a deceptive
   * Subscribe / Activate Free flow on a plan they already hold or that
   * cannot be subscribed to at all.
   */
  openManage(): void {
    this.router.navigate(['/h/addons']);
  }

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  private fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.addonsSvc.listMarketplace({}).subscribe({
      next: (result) => {
        this.loading.set(false);
        switch (result.kind) {
          case 'success':
            this._items.set(result.items);
            return;
          case 'unauthenticated':
            this.loadError.set('hplus.marketplace.error.unauthenticated');
            return;
          case 'server-error':
          case 'network-error':
            this.loadError.set('hplus.marketplace.error.serverError');
            return;
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('hplus.marketplace.error.serverError');
      },
    });
  }

  private toTile(it: AddOnDetail): MarketplaceTileVm {
    const firstTier = it.pricing_tiers?.[0];
    return {
      addonPlanId: it.addon_plan_id,
      code: it.code,
      displayName: it.display_name,
      description: it.description ?? '',
      category: it.category,
      priceLabel: firstTier
        ? `${firstTier.currency} ${(firstTier.monthly_price_cents / 100).toFixed(2)}/mo`
        : '–',
      system: it.system === true,
      installed: it.installed === true,
    };
  }
}
