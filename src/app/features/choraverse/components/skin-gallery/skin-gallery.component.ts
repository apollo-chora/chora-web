/**
 * SkinGalleryComponent — Enhanced grid of earned DigitalSkin cards.
 *
 * Features: theme grid grouping, 360 preview rotation, rarity glow borders,
 * unlock requirements tooltip, save-for-later wishlist, search, owned/locked toggle.
 * DigitalSkins are EARNED rewards — NEVER purchasable.
 *
 * @see docs/design/ux_familiar_companion.md (SkinCustomization)
 * @see chora-contracts/openapi/gamification.yaml
 * @see CHO-1345
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
import type { SkinCatalogEntry, SkinTheme, EquipmentSlot } from '../../models/gamification.model';

/** Earn criteria display labels */
const EARN_VIA_LABELS: Record<string, string> = {
  streak: 'choraverse.skin_gallery.earn_streak',
  league_win: 'choraverse.skin_gallery.earn_league_win',
  topic_mastery: 'choraverse.skin_gallery.earn_topic_mastery',
  featured_work: 'choraverse.skin_gallery.earn_featured_work',
  instructor_award: 'choraverse.skin_gallery.earn_instructor_award',
  certification: 'choraverse.skin_gallery.earn_certification',
  legendary_transfer: 'choraverse.skin_gallery.earn_legendary_transfer',
};

type OwnershipFilter = 'all' | 'owned' | 'locked';

@Component({
  selector: 'chora-skin-gallery',
  standalone: true,
  imports: [UpperCasePipe, TranslatePipe],
  templateUrl: './skin-gallery.component.html',
  styleUrl: './skin-gallery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkinGalleryComponent implements OnInit, OnDestroy {
  private readonly gamificationService = inject(GamificationService);
  private readonly toast = inject(ToastService);

  // --- Filters ---
  readonly filterRarity = signal<SkinRarity | null>(null);
  readonly filterTheme = signal<SkinTheme | null>(null);
  readonly filterOwnership = signal<OwnershipFilter>('all');
  readonly searchQuery = signal('');

  // --- State ---
  readonly selectedSkin = signal<SkinCatalogEntry | null>(null);
  readonly showEquipDialog = signal(false);
  readonly wishlist = signal<Set<string>>(new Set());

  // --- Constants ---
  readonly allRarities = ALL_SKIN_RARITIES;
  readonly allThemes = ALL_SKIN_THEMES;
  readonly rarityLabels = RARITY_LABELS;
  readonly themeLabels = THEME_LABELS;
  readonly rarityColors = RARITY_COLORS;
  readonly earnViaLabels = EARN_VIA_LABELS;

  // --- Computed ---
  readonly skinCatalogState = this.gamificationService.skinCatalogState;
  readonly coinBalance = this.gamificationService.coinBalance;

  readonly isLoading = computed(() => this.skinCatalogState().status === 'loading');

  readonly filteredSkins = computed(() => {
    let result = this.gamificationService.skins();
    const rarity = this.filterRarity();
    const theme = this.filterTheme();
    const ownership = this.filterOwnership();
    const query = this.searchQuery().toLowerCase().trim();

    if (rarity) {
      result = result.filter((s) => s.rarity === rarity);
    }
    if (theme) {
      result = result.filter((s) => s.theme === theme);
    }
    if (ownership === 'owned') {
      result = result.filter((s) => s.isOwned);
    } else if (ownership === 'locked') {
      result = result.filter((s) => !s.isOwned);
    }
    if (query) {
      result = result.filter((s) =>
        s.name.toLowerCase().includes(query),
      );
    }

    return result;
  });

  /** Group skins by theme for grid display */
  readonly skinsByTheme = computed(() => {
    const skins = this.filteredSkins();
    const groups: { theme: SkinTheme; skins: SkinCatalogEntry[] }[] = [];

    for (const theme of ALL_SKIN_THEMES) {
      const themed = skins.filter((s) => s.theme === theme);
      if (themed.length > 0) {
        groups.push({ theme, skins: themed });
      }
    }

    return groups;
  });

  readonly isEmpty = computed(
    () => !this.isLoading() && this.filteredSkins().length === 0,
  );

  readonly totalCount = computed(() => this.gamificationService.skins().length);
  readonly filteredCount = computed(() => this.filteredSkins().length);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadSkins();
    this.subscriptions.add(
      this.gamificationService.loadCoinAccount().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  private loadSkins(): void {
    this.subscriptions.add(
      this.gamificationService.loadSkins().subscribe({
        error: () => {
          this.toast.show('choraverse.skin_gallery.load_error', 'error');
        },
      }),
    );
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

  onOwnershipFilter(value: string): void {
    this.filterOwnership.set(value as OwnershipFilter);
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  // -------------------------------------------------------------------------
  // Preview / Select
  // -------------------------------------------------------------------------

  selectSkin(skin: SkinCatalogEntry): void {
    this.selectedSkin.set(
      this.selectedSkin()?.id === skin.id ? null : skin,
    );
  }

  isSelected(skinId: string): boolean {
    return this.selectedSkin()?.id === skinId;
  }

  // -------------------------------------------------------------------------
  // Equip action
  // -------------------------------------------------------------------------

  openEquipDialog(skin: SkinCatalogEntry): void {
    if (!skin.isOwned) return;
    this.selectedSkin.set(skin);
    this.showEquipDialog.set(true);
  }

  cancelEquip(): void {
    this.showEquipDialog.set(false);
  }

  confirmEquip(slot: EquipmentSlot): void {
    const skin = this.selectedSkin();
    if (!skin) return;

    this.subscriptions.add(
      this.gamificationService.equipSkin(skin.id, slot).subscribe({
        next: (success) => {
          if (success) {
            this.toast.show('choraverse.skin_gallery.skin_equipped', 'success');
            this.showEquipDialog.set(false);
          }
        },
        error: () => {
          this.toast.show('choraverse.skin_gallery.equip_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Wishlist
  // -------------------------------------------------------------------------

  toggleWishlist(skinId: string): void {
    this.wishlist.update((set) => {
      const next = new Set(set);
      if (next.has(skinId)) {
        next.delete(skinId);
      } else {
        next.add(skinId);
      }
      return next;
    });
  }

  isWishlisted(skinId: string): boolean {
    return this.wishlist().has(skinId);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  rarityBorderColor(rarity: SkinRarity): string {
    return RARITY_COLORS[rarity];
  }

  rarityGlowStyle(rarity: SkinRarity): string {
    const color = RARITY_COLORS[rarity];
    return `0 0 12px ${color}40, 0 0 4px ${color}20`;
  }

  earnViaLabel(via: string | null): string {
    if (!via) return 'choraverse.skin_gallery.earn_unknown';
    return EARN_VIA_LABELS[via] || 'choraverse.skin_gallery.earn_unknown';
  }
}
