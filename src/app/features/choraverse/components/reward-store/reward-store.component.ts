/**
 * RewardStoreComponent — Tabbed interface for reward browsing.
 *
 * Tabs: Skins | Items | Bounties
 * Header shows StarCredit balance.
 * DigitalSkins are EARNED rewards — NEVER purchasable.
 *
 * @see docs/design/ux_engagement.md
 * @see chora-contracts/openapi/gamification.yaml
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { UpperCasePipe } from '@angular/common';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { GamificationService } from '../../services/gamification.service';
import { SkinRarity } from '../../models/familiar.model';
import {
  ALL_SKIN_RARITIES,
  ALL_SKIN_THEMES,
  RARITY_COLORS,
  RARITY_LABELS,
  THEME_LABELS,
} from '../../models/gamification.model';
import type { SkinCatalogEntry, SkinTheme } from '../../models/gamification.model';

export type StoreTab = 'skins' | 'items' | 'bounties';

@Component({
  selector: 'chora-reward-store',
  standalone: true,
  imports: [UpperCasePipe, TranslatePipe],
  templateUrl: './reward-store.component.html',
  styleUrl: './reward-store.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RewardStoreComponent implements OnInit, OnDestroy {
  private readonly gamificationService = inject(GamificationService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly activeTab = signal<StoreTab>('skins');
  readonly filterRarity = signal<SkinRarity | null>(null);
  readonly filterTheme = signal<SkinTheme | null>(null);

  // --- Constants ---
  readonly allRarities = ALL_SKIN_RARITIES;
  readonly allThemes = ALL_SKIN_THEMES;
  readonly rarityLabels = RARITY_LABELS;
  readonly themeLabels = THEME_LABELS;
  readonly rarityColors = RARITY_COLORS;

  // --- Computed from service ---
  readonly coinBalance = this.gamificationService.coinBalance;
  readonly skinCatalogState = this.gamificationService.skinCatalogState;
  readonly bountyListState = this.gamificationService.bountyListState;

  readonly filteredSkins = computed(() => {
    let result = this.gamificationService.skins();
    const rarity = this.filterRarity();
    const theme = this.filterTheme();

    if (rarity) {
      result = result.filter((s) => s.rarity === rarity);
    }
    if (theme) {
      result = result.filter((s) => s.theme === theme);
    }

    return result;
  });

  readonly bounties = this.gamificationService.bounties;

  readonly isSkinsLoading = computed(() => this.skinCatalogState().status === 'loading');
  readonly isBountiesLoading = computed(() => this.bountyListState().status === 'loading');

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadCoinAccount();
    this.loadSkins();
    this.loadBounties();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  private loadCoinAccount(): void {
    this.subscriptions.add(
      this.gamificationService.loadCoinAccount().subscribe({
        error: () => {
          this.toast.show('choraverse.reward_store.coins_load_error', 'error');
        },
      }),
    );
  }

  private loadSkins(): void {
    this.subscriptions.add(
      this.gamificationService.loadSkins().subscribe({
        error: () => {
          this.toast.show('choraverse.reward_store.skins_load_error', 'error');
        },
      }),
    );
  }

  private loadBounties(): void {
    this.subscriptions.add(
      this.gamificationService.loadBounties().subscribe({
        error: () => {
          this.toast.show('choraverse.reward_store.bounties_load_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Tab switching
  // -------------------------------------------------------------------------

  setActiveTab(tab: StoreTab): void {
    this.activeTab.set(tab);
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onRarityFilter(value: string): void {
    this.filterRarity.set(value === '' ? null : value as SkinRarity);
  }

  onThemeFilter(value: string): void {
    this.filterTheme.set(value === '' ? null : value as SkinTheme);
  }

  // -------------------------------------------------------------------------
  // Equip action
  // -------------------------------------------------------------------------

  equipSkin(skin: SkinCatalogEntry): void {
    if (skin.is_equipped || !skin.isOwned) return;

    this.subscriptions.add(
      this.gamificationService.equipSkin(skin.id, 'profile_photo').subscribe({
        next: (success) => {
          if (success) {
            this.toast.show('choraverse.reward_store.skin_equipped', 'success');
          }
        },
        error: () => {
          this.toast.show('choraverse.reward_store.equip_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  rarityBorderColor(rarity: SkinRarity): string {
    return RARITY_COLORS[rarity];
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
