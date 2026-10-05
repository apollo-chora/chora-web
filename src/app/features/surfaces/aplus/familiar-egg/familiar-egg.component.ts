/**
 * FamiliarEggComponent: `/a/companion/egg/:familiarId` (Stage 0).
 *
 * The INCUBATION CARD (CHO-2089, ADR-228 D2/D6): the post-purchase,
 * pre-hatch screen wired to the live growth read.
 *
 *   - warming bar = expCurrent / expNextThreshold (the hatch gate the BE
 *     surfaces for Stage-0 eggs; ADR-228 D2 default 25);
 *   - stirring (exp >= threshold) glows the card and frees the hatch CTA —
 *     before that the ceremony is honestly locked (the BE 409s early
 *     hatches, ErrNotStirring);
 *   - species: ALWAYS a mystery pre-reveal (CHO-2227). The card used to
 *     name the species of the first hatched sibling, on a since-inverted
 *     one-species-per-user rule; growth.ExcludeOwnedSpecies (owner ruling
 *     2026-08-07) now guarantees a new pod is NOT a species already owned,
 *     so that reading advertised the one outcome the roll forbids. The
 *     backend keeps `species` empty until RevealBreed writes it;
 *   - the bound goal (map) it warms on, from the bindings read (fail-soft;
 *     unbound eggs get a summon nudge — binding happens map-side, WS-E).
 *
 * Per ADR-149 §3.3 egg art stays BREED-NEUTRAL. The mock-era hint ledger
 * was removed with the live rewire (client-side scaffold only — never a
 * real BE feature). Lootbox transparency footer persists per HANDOFF §4.4.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { FamiliarMapService } from '../discovery-graph/familiar-map.service';
import type { FamiliarSummary } from '../../../../core/familiar/familiar-growth.model';

type EggViewState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'chora-aplus-familiar-egg',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-egg.component.html',
  styleUrl: './familiar-egg.component.scss',
})
export class FamiliarEggComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly growth = inject(FamiliarGrowthService);
  private readonly maps = inject(FamiliarMapService);

  readonly familiarId = signal<string>(
    this.route.snapshot.paramMap.get('familiarId') ?? '',
  );

  readonly viewState = signal<EggViewState>('loading');
  /** This egg's roster summary (live read). */
  readonly egg = signal<FamiliarSummary | null>(null);
  /** The bound map's theme title; '' = unbound or bindings unavailable. */
  readonly boundGoalTheme = signal<string>('');

  readonly warmExp = computed<number>(() => this.egg()?.expCurrent ?? 0);
  readonly warmThreshold = computed<number>(
    () => this.egg()?.expNextThreshold ?? 0,
  );
  readonly warmPct = computed<number>(() => {
    const thr = this.warmThreshold();
    if (thr <= 0) return 0;
    return Math.min(100, Math.round((this.warmExp() / thr) * 100));
  });
  /** Full bar = the egg is stirring: the hatch ceremony is unlocked. */
  readonly stirring = computed<boolean>(() => {
    const thr = this.warmThreshold();
    return thr > 0 && this.warmExp() >= thr;
  });

  constructor() {
    const id = this.familiarId();
    if (!id) {
      this.router.navigate(['/a/companion']);
      return;
    }
    this.growth.listMyFamiliars().subscribe({
      next: (list) => {
        const me = list.find((f) => f.familiarId === id) ?? null;
        if (!me) {
          this.viewState.set('error');
          return;
        }
        if (me.growthStage > 0) {
          // Hatched already — this page is Stage-0 only.
          this.router.navigate(['/a/companion', id]);
          return;
        }
        this.egg.set(me);
        this.viewState.set('ready');
      },
      error: () => this.viewState.set('error'),
    });
    // Bound goal (fail-soft — the card renders without it).
    this.maps.listBindings().subscribe({
      next: (resp) => {
        const mine = resp.items.find((b) => b.familiarId === id);
        this.boundGoalTheme.set(mine?.mapTheme ?? '');
      },
      error: () => this.boundGoalTheme.set(''),
    });
  }
}
