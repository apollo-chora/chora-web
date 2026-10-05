/**
 * StatAllocationComponent — 5-dimension personality slider panel with point budget.
 *
 * Post-summoning customization: Encouragement, Humor, Detail, Curiosity, Formality.
 * 20-point budget, minimum 2 per dimension, real-time response preview.
 *
 * @see docs/design/ux_familiar_companion.md (StatAllocation)
 * @see CHO-1343
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
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { FamiliarService } from '../../services/familiar.service';
import type { PersonalityTraits } from '../../models/familiar.model';

const TOTAL_BUDGET = 20;
const MIN_PER_TRAIT = 2;

interface TraitSlider {
  key: keyof PersonalityTraits;
  labelKey: string;
  descriptionKey: string;
  value: number;
}

const TRAIT_DEFINITIONS: Omit<TraitSlider, 'value'>[] = [
  {
    key: 'curiosity',
    labelKey: 'choraverse.stats.trait_curiosity',
    descriptionKey: 'choraverse.stats.desc_curiosity',
  },
  {
    key: 'encouragement',
    labelKey: 'choraverse.stats.trait_encouragement',
    descriptionKey: 'choraverse.stats.desc_encouragement',
  },
  {
    key: 'humor',
    labelKey: 'choraverse.stats.trait_humor',
    descriptionKey: 'choraverse.stats.desc_humor',
  },
  {
    key: 'detail',
    labelKey: 'choraverse.stats.trait_detail',
    descriptionKey: 'choraverse.stats.desc_detail',
  },
  {
    key: 'formality',
    labelKey: 'choraverse.stats.trait_formality',
    descriptionKey: 'choraverse.stats.desc_formality',
  },
];

/** Sample response previews based on dominant trait */
const PREVIEW_KEYS: Record<keyof PersonalityTraits, string> = {
  curiosity: 'choraverse.stats.preview_curiosity',
  encouragement: 'choraverse.stats.preview_encouragement',
  humor: 'choraverse.stats.preview_humor',
  detail: 'choraverse.stats.preview_detail',
  formality: 'choraverse.stats.preview_formality',
};

@Component({
  selector: 'chora-stat-allocation',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stat-allocation.component.html',
  styleUrl: './stat-allocation.component.scss',
})
export class StatAllocationComponent implements OnInit, OnDestroy {
  private readonly familiarService = inject(FamiliarService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly totalBudget = TOTAL_BUDGET;
  readonly minPerTrait = MIN_PER_TRAIT;
  readonly traitDefinitions = TRAIT_DEFINITIONS;

  /** Current slider values */
  readonly sliders = signal<TraitSlider[]>(
    TRAIT_DEFINITIONS.map((t) => ({ ...t, value: MIN_PER_TRAIT })),
  );

  /** Points spent */
  readonly pointsSpent = computed(() =>
    this.sliders().reduce((sum, s) => sum + s.value, 0),
  );

  /** Points remaining */
  readonly pointsRemaining = computed(() => TOTAL_BUDGET - this.pointsSpent());

  /** Whether all points are allocated */
  readonly isFullyAllocated = computed(() => this.pointsRemaining() === 0);

  /** Dominant trait for response preview */
  readonly dominantTrait = computed<keyof PersonalityTraits>(() => {
    const sorted = [...this.sliders()].sort((a, b) => b.value - a.value);
    return sorted[0].key;
  });

  /** Preview key based on dominant trait */
  readonly previewKey = computed(() => PREVIEW_KEYS[this.dominantTrait()]);

  /** Is the service submitting personality update? */
  readonly isSubmitting = signal(false);

  /** Familiar profile */
  readonly profile = computed(() => {
    const s = this.familiarService.state();
    return s.status === 'success' ? s.profile : null;
  });

  /** Whether this is first-time allocation (just summoned) */
  readonly isFirstTime = computed(() => this.familiarService.justSummoned());

  private subscriptions = new Subscription();

  ngOnInit(): void {
    // If familiar has existing traits, pre-fill sliders
    const profile = this.profile();
    if (profile && !this.isFirstTime()) {
      const traits = profile.personalityTraits;
      this.sliders.set(
        TRAIT_DEFINITIONS.map((t) => ({
          ...t,
          value: traits[t.key] || MIN_PER_TRAIT,
        })),
      );
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Slider interaction
  // -------------------------------------------------------------------------

  onSliderChange(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const newValue = parseInt(input.value, 10);
    const current = this.sliders();
    const oldValue = current[index].value;
    const diff = newValue - oldValue;

    // Check if we have budget for the increase
    if (diff > 0 && this.pointsRemaining() < diff) {
      // Clamp to remaining budget
      const clamped = oldValue + this.pointsRemaining();
      this.updateSlider(index, Math.max(MIN_PER_TRAIT, clamped));
      return;
    }

    this.updateSlider(index, Math.max(MIN_PER_TRAIT, newValue));
  }

  private updateSlider(index: number, value: number): void {
    this.sliders.update((sliders) => {
      const updated = [...sliders];
      updated[index] = { ...updated[index], value };
      return updated;
    });
  }

  /** Max value a slider can go to (remaining budget + current value) */
  sliderMax(index: number): number {
    return this.sliders()[index].value + this.pointsRemaining();
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  savePersonality(): void {
    const profile = this.profile();
    if (!profile || !this.isFullyAllocated()) return;

    const traits: PersonalityTraits = {
      curiosity: 0,
      encouragement: 0,
      humor: 0,
      detail: 0,
      formality: 0,
    };
    for (const slider of this.sliders()) {
      traits[slider.key] = slider.value;
    }

    this.isSubmitting.set(true);
    this.subscriptions.add(
      this.familiarService.updatePersonality(profile.id, traits).subscribe({
        next: (result) => {
          this.isSubmitting.set(false);
          if (result) {
            this.toast.show('choraverse.stats.save_success', 'success');
            if (this.isFirstTime()) {
              this.router.navigate(['/choraverse', 'tutorial']);
            } else {
              this.router.navigate(['/choraverse']);
            }
          }
        },
        error: () => {
          this.isSubmitting.set(false);
          this.toast.show('choraverse.stats.save_error', 'error');
        },
      }),
    );
  }

  /** Reset all sliders to equal distribution */
  resetSliders(): void {
    this.sliders.set(
      TRAIT_DEFINITIONS.map((t) => ({ ...t, value: MIN_PER_TRAIT })),
    );
  }
}
