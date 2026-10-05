/**
 * EggOddsTableComponent — IMDA D2 mandatory pre-checkout odds disclosure
 * per ADR-149 §"Breed lootbox + transparency".
 *
 * Renders the per-SKU breed_distribution as a SORTED, transparent table
 * (descending probability by default). NO obscuring animations. NO copy
 * implying "guaranteed" outcomes. Persistent "Odds are independent per
 * egg" compliance line + tenant policy link in the parent footer.
 *
 * Sort modes: 'probability-desc' (default — most likely first) | 'rarity'
 * (rarest first) | 'species' (alphabetic).
 *
 * Per-row: breed name + rarity chip + percentage bar (visual) + numeric.
 * Loadeable in a collapsed-by-default panel inside each egg card.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { FamiliarGrowthService } from '../../../../../core/familiar/familiar-growth.service';
import type {
  BreedOdds,
  PreviewEggOddsResponse,
} from '../../../../../core/familiar/familiar-growth.model';

type SortMode = 'probability-desc' | 'rarity' | 'species';

const RARITY_ORDER: Readonly<Record<string, number>> = {
  legendary: 0,
  rare: 1,
  uncommon: 2,
  common: 3,
};

@Component({
  selector: 'chora-egg-odds-table',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './egg-odds-table.component.html',
  styleUrl: './egg-odds-table.component.scss',
})
export class EggOddsTableComponent {
  private readonly growth = inject(FamiliarGrowthService);

  readonly sku = input.required<string>();

  private readonly oddsResponse = signal<PreviewEggOddsResponse | null>(null);

  constructor() {
    // Re-fetch whenever sku() changes — covers the parent re-mount path
    // and any future dynamic-SKU swap.
    effect((onCleanup) => {
      const currentSku = this.sku();
      const sub = this.growth.getEggOdds(currentSku).subscribe({
        next: (resp) => this.oddsResponse.set(resp),
        error: () => this.oddsResponse.set(null),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  readonly sortMode = signal<SortMode>('probability-desc');

  readonly odds = computed<readonly BreedOdds[]>(() => {
    const resp = this.oddsResponse();
    if (!resp) return [];
    const list = [...resp.odds];
    switch (this.sortMode()) {
      case 'probability-desc':
        return list.sort((a, b) => b.probability - a.probability);
      case 'rarity':
        return list.sort(
          (a, b) =>
            (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99),
        );
      case 'species':
        return list.sort((a, b) => a.species.localeCompare(b.species));
    }
  });

  readonly totalWeight = computed<number>(() => this.oddsResponse()?.totalWeight ?? 0);
  readonly distributionUpdatedAt = computed<string>(
    () => this.oddsResponse()?.distributionUpdatedAt ?? '',
  );
  readonly isLoaded = computed<boolean>(() => this.oddsResponse() !== null);

  setSortMode(mode: SortMode): void {
    this.sortMode.set(mode);
  }

  isSort(mode: SortMode): boolean {
    return this.sortMode() === mode;
  }
}
