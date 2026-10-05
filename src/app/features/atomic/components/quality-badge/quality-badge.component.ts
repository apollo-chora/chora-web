import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BloomsLevel } from '../../services/content-quality.service';

@Component({
  selector: 'chora-quality-badge',
  imports: [TranslatePipe],
  templateUrl: './quality-badge.component.html',
  styleUrl: './quality-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QualityBadgeComponent {
  /** Difficulty score 1-5 from AI agent */
  difficultyScore = input<number | null>(null);

  /** Quality score 0-1 from content analysis */
  qualityScore = input<number | null>(null);

  /** Bloom's taxonomy level */
  bloomsLevel = input<BloomsLevel | null>(null);

  /** Compact mode for atom cards (hides labels) */
  compact = input(false);

  readonly difficultyDots = computed(() => {
    const score = this.difficultyScore();
    if (score === null) return [];
    const clamped = Math.max(1, Math.min(5, Math.round(score)));
    return Array.from({ length: 5 }, (_, i) => i < clamped);
  });

  readonly difficultyColor = computed(() => {
    const score = this.difficultyScore();
    if (score === null) return '';
    if (score <= 2) return 'easy';
    if (score <= 3) return 'medium';
    return 'hard';
  });

  readonly qualityPercent = computed(() => {
    const score = this.qualityScore();
    if (score === null) return null;
    return Math.round(score * 100);
  });

  readonly qualityLevel = computed(() => {
    const score = this.qualityScore();
    if (score === null) return '';
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  });

  readonly bloomsLabel = computed(() => {
    const level = this.bloomsLevel();
    if (!level) return null;
    return level.charAt(0).toUpperCase() + level.slice(1);
  });

  readonly hasDifficulty = computed(() => this.difficultyScore() !== null);
  readonly hasQuality = computed(() => this.qualityScore() !== null);
  readonly hasBlooms = computed(() => this.bloomsLevel() !== null);
  readonly hasAnyData = computed(() => this.hasDifficulty() || this.hasQuality() || this.hasBlooms());
}
