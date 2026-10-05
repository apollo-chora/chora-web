/**
 * FamiliarBylineChipComponent — `[Stage N · Breed]` pill rendered
 * alongside an author byline on the C+ feed (and anywhere else where
 * author identity surfaces).
 *
 * Per HANDOFF §1.2: author byline gains `[Stage N · Breed]` chip on
 * the C+ feed. We render the breed adjective for the stage (e.g.,
 * "Teen Dragon") rather than the raw stage number for warmer copy.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import {
  breedStageLabel,
} from '../../../core/familiar/familiar-growth.model';
import type {
  GrowthStage,
} from '../../../core/familiar/familiar-growth.model';
import type {
  BreedSpecies,
} from '../breed-art/breed-art.component';

@Component({
  selector: 'chora-familiar-byline-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="byline-chip"
      [attr.data-breed]="species()"
      [attr.aria-label]="label()"
      data-testid="familiar-byline-chip">
      <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
      <span>{{ label() }}</span>
    </span>
  `,
  styles: [`
    @use '../../../../styles/breed-accents';

    :host { display: inline-flex; }

    .byline-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.1rem 0.55rem;
      border-radius: 999px;
      background: var(--breed-accent-soft, rgba(79, 70, 229, 0.08));
      color: var(--breed-accent, var(--primary));
      border: 1px solid var(--breed-accent-border, rgba(79, 70, 229, 0.18));
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      vertical-align: middle;
      white-space: nowrap;

      i { font-size: 8.5px; }
    }
  `],
})
export class FamiliarBylineChipComponent {
  readonly stage = input.required<GrowthStage>();
  readonly species = input.required<BreedSpecies>();

  readonly label = computed<string>(() => {
    const sp = this.species();
    const st = this.stage();
    if (!sp) return `Stage ${st}`;
    return breedStageLabel(sp, st);
  });
}
