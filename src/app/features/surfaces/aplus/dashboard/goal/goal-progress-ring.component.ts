/**
 * GoalProgressRingComponent — compact verified-progress %-ring (CHO-1921).
 *
 * Renders REAL, mastery-backed Goal progress (NOT a faked %) as a small glass-
 * consistent SVG arc with the integer percent in the centre. The host carries a
 * single translated `role="img"` aria-label ("Goal progress: N% — M of T concepts
 * mastered") so assistive tech reads ONE coherent label and the decorative SVG is
 * `aria-hidden` — progress is never conveyed by colour alone (WCAG 2.1 AA).
 *
 * Geometry: the arc circle radius is normalised so its circumference is exactly
 * 100 user units (r = 100 / 2π). That makes the fill a 1:1 map from percent →
 * `stroke-dasharray="{percent} 100"` — no per-instance circumference maths.
 *
 * Purely presentational: the today-bar only mounts it for a goal with
 * `totalConcepts > 0` (concept-less curiosity goals show the neutral bullseye
 * placeholder instead — a 0% ring would misrepresent "progress is N/A").
 *
 * Usage:
 *   <chora-aplus-goal-progress-ring
 *     [percent]="g.progressPercent ?? 0"
 *     [mastered]="g.masteredConcepts ?? 0"
 *     [total]="g.totalConcepts" />
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';

import { TranslateService } from '../../../../../core/services/translate.service';

/** i18n key for the ring's full accessible label (carries 3 placeholders). */
const ARIA_KEY = 'aplus.dashboard.goal.progress_ring_aria';

/** Arc radius giving a circumference of exactly 100 user units (= 100 / 2π). */
export const RING_RADIUS = 100 / (2 * Math.PI);

@Component({
  selector: 'chora-aplus-goal-progress-ring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-progress-ring.component.html',
  styleUrl: './goal-progress-ring.component.scss',
  host: {
    role: 'img',
    class: 'goal-progress-ring',
    'data-testid': 'goal-progress-ring',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class GoalProgressRingComponent {
  /** Verified mastery progress, 0–100 (clamped + rounded for display). */
  readonly percent = input.required<number>();
  /** Count of the goal's concepts the learner has verifiably mastered. */
  readonly mastered = input<number>(0);
  /** Total concepts in the goal's set. */
  readonly total = input.required<number>();

  /** Exposed to the template for the SVG circle `r` attribute. */
  readonly radius = RING_RADIUS;

  private readonly translate = inject(TranslateService);

  /** Display percent — clamped into 0–100 and rounded to a whole number. */
  readonly displayPercent = computed<number>(() => {
    const raw = this.percent();
    const safe = Number.isFinite(raw) ? raw : 0;
    return Math.min(100, Math.max(0, Math.round(safe)));
  });

  /**
   * SVG `stroke-dasharray` for the arc — "{filled} 100". The circumference is
   * normalised to 100 (see RING_RADIUS) so the filled length equals the percent.
   */
  readonly dashArray = computed<string>(() => `${this.displayPercent()} 100`);

  /**
   * One coherent, translated aria-label built by interpolating the percent +
   * mastered/total counts into the i18n template. Falls back to the raw key
   * when translations are unloaded (the key still carries no PII).
   */
  readonly ariaLabel = computed<string>(() =>
    this.translate
      .instant(ARIA_KEY)
      .replace('{percent}', String(this.displayPercent()))
      .replace('{mastered}', String(this.mastered()))
      .replace('{total}', String(this.total())),
  );
}
