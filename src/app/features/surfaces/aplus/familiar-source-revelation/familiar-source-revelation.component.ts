/**
 * FamiliarSourceRevelationComponent: `/a/companion/:familiarId/source-revelation`.
 *
 * The 24h Aha-moment ceremony triggered when a Familiar transitions
 * from Stage 2 → Stage 3 for the first time (per ADR-149 §"Source
 * revelation").
 *
 * Copy per HANDOFF §4.3:
 *
 *   Pre-window:
 *     "Your Familiar paused. For a heartbeat, you glimpsed what they
 *      will one day become — a {breed-stage-6}, wreathed in
 *      {breed-themed effect}. The vision faded. They returned, still
 *      {stage 3 form}, but their eyes carry the memory."
 *
 *     "For the next 24 hours, {Familiar name} can draw on the wisdom of
 *      their future self."
 *
 *   Post-window:
 *     "The wisdom of their future self has faded, but {Familiar name}
 *      carries the memory. They know what they will become. Keep
 *      walking together."
 *
 * Per ADR-149: the preview is mana-tier-bounded — Basic users get
 * `gemini-2.5-flash` (one notch up), Standard+Premium get `pro`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap, tap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { breedStageLabel } from '../../../../core/familiar/familiar-growth.model';
import type {
  FamiliarGrowthState,
  GrowthStage,
} from '../../../../core/familiar/familiar-growth.model';

@Component({
  selector: 'chora-aplus-familiar-source-revelation',
  imports: [TranslatePipe, RouterLink, BreedArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-source-revelation.component.html',
  styleUrl: './familiar-source-revelation.component.scss',
})
export class FamiliarSourceRevelationComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly growth = inject(FamiliarGrowthService);

  readonly state = toSignal<FamiliarGrowthState | null>(
    this.route.paramMap.pipe(
      switchMap((params) => {
        const id = params.get('familiarId') ?? '';
        return this.growth.getGrowth(id).pipe(
          tap((s) => {
            // Auto-trigger the 24h window if not yet consumed.
            if (s && !s.ahaMomentConsumed && !s.ahaMomentActiveUntil) {
              this.openWindow(id);
            } else if (s?.ahaMomentActiveUntil) {
              this.windowExpiresAt.set(s.ahaMomentActiveUntil);
              this.previewLlmTier.set(s.effectiveLlmTier);
            }
          }),
        );
      }),
    ),
    { initialValue: null },
  );

  readonly windowExpiresAt = signal<string>('');
  readonly previewLlmTier = signal<string>('');

  readonly windowConsumed = computed<boolean>(() => {
    return !!this.state()?.ahaMomentConsumed;
  });

  readonly currentStageLabel = computed<string>(() => {
    const s = this.state();
    if (!s) return '';
    return breedStageLabel(s.species, s.growthStage as GrowthStage);
  });

  readonly maturedStageLabel = computed<string>(() => {
    const s = this.state();
    if (!s) return '';
    return breedStageLabel(s.species, 6);
  });

  private openWindow(familiarId: string): void {
    this.growth.openSourceRevelation(familiarId).subscribe({
      next: (resp) => {
        this.windowExpiresAt.set(resp.windowExpiresAt);
        this.previewLlmTier.set(resp.previewLlmTier);
      },
    });
  }
}
