/**
 * FamiliarStageUpComponent — full-screen celebration shown on
 * `FamiliarStageUp` realtime push OR direct navigation to
 * `/a/companion/:familiarId/stage-up`.
 *
 * Per HANDOFF §5:
 *   1. Per-breed sprite morphs from current to next stage
 *   2. Newly unlocked tools list (animate icons in + chime — visual only)
 *   3. New LLM tier badge ("Your Familiar can now reason with stronger
 *      insight")
 *   4. Share-to-Circle CTA (routes to a C+ composer with a stage-up
 *      template — wiring lands in W6 when we touch the C+ feed)
 *
 * The KG-neighbours reveal (old §5.3) is RETIRED per R3-1 (CHO-2013 P1) —
 * superseded by the awakening resonant-concept pick + ring radius.
 *
 * Special case: Stage 2 → Stage 3 routes to `/source-revelation` for
 * the dedicated 24h Aha-moment ceremony INSTEAD of this celebration.
 * The component detects that transition on mount and redirects.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import {
  STAGE_NAMES,
  breedStageLabel,
} from '../../../../core/familiar/familiar-growth.model';
import type {
  FamiliarGrowthState,
  GrowthStage,
  LoadoutGrant,
  LoadoutView,
  NextUnlock,
} from '../../../../core/familiar/familiar-growth.model';

@Component({
  selector: 'chora-aplus-familiar-stage-up',
  imports: [TranslatePipe, RouterLink, BreedArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-stage-up.component.html',
  styleUrl: './familiar-stage-up.component.scss',
})
export class FamiliarStageUpComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly growth = inject(FamiliarGrowthService);

  readonly state = toSignal<FamiliarGrowthState | null>(
    this.route.paramMap.pipe(
      switchMap((params) => {
        const id = params.get('familiarId') ?? '';
        return this.growth.getGrowth(id);
      }),
    ),
    { initialValue: null },
  );

  /**
   * CHO-2030 (R3-9): the loadout read backs the "just woke" band (grants
   * minted at the current stage, incl. dormants). A read failure keeps
   * the celebration alive — the section simply stays absent (null).
   */
  readonly loadout = toSignal<LoadoutView | null>(
    this.route.paramMap.pipe(
      switchMap((params) => {
        const id = params.get('familiarId') ?? '';
        return this.growth
          .getLoadout(id)
          .pipe(catchError(() => of<LoadoutView | null>(null)));
      }),
    ),
    { initialValue: null },
  );

  /** Path Skills that woke AT the new stage (dormants stay flagged). */
  readonly justWoke = computed<readonly LoadoutGrant[]>(() => {
    const l = this.loadout();
    const s = this.state();
    if (!l || !s) return [];
    return l.grants.filter((g) => g.unlockedAtStage === s.growthStage);
  });

  /** The next-stage named-tease (CHO-2030 BE preview; empty at top stage). */
  readonly nextUnlocks = computed<readonly NextUnlock[]>(
    () => this.state()?.nextUnlocks ?? [],
  );

  /** Previous stage = current - 1 (derived). The real event payload
   *  would carry stageFrom; for the prebuild we derive it. */
  readonly prevStage = computed<GrowthStage>(() => {
    const s = this.state();
    if (!s || s.growthStage === 0) return 0;
    return (s.growthStage - 1) as GrowthStage;
  });

  readonly currentStage = computed<GrowthStage>(() => {
    return (this.state()?.growthStage ?? 0) as GrowthStage;
  });

  readonly prevLabel = computed<string>(() => {
    const s = this.state();
    if (!s) return '';
    return breedStageLabel(s.species, this.prevStage());
  });

  readonly currentLabel = computed<string>(() => {
    const s = this.state();
    if (!s) return '';
    return breedStageLabel(s.species, this.currentStage());
  });

  /** Newly unlocked tools — for the prebuild we show all unlocked at
   *  current stage. The real event payload carries the delta. */
  readonly newToolsBucket = computed<readonly string[]>(() => {
    return this.state()?.unlockedTools ?? [];
  });

  readonly llmTier = computed<string>(() => {
    return this.state()?.effectiveLlmTier ?? '';
  });

  constructor() {
    // If this is the Stage 2 → Stage 3 transition, redirect to the
    // dedicated source-revelation ceremony instead of the generic
    // celebration modal.
    queueMicrotask(() => {
      const s = this.state();
      if (s && s.growthStage === 3 && !s.ahaMomentConsumed) {
        this.router.navigate([
          '/a/companion',
          s.familiarId,
          'source-revelation',
        ]);
      }
    });
  }

  shareToCircle(): void {
    const s = this.state();
    if (!s) return;
    // The C+ feed composer doesn't yet accept a template param — we
    // navigate to /c/feed for now; W6 will wire the actual template.
    this.router.navigate(['/c/feed'], {
      queryParams: {
        composeStageUp: s.familiarId,
        stage: s.growthStage,
      },
    });
  }

  stageNameLabel(stage: GrowthStage): string {
    return STAGE_NAMES[stage];
  }
}
