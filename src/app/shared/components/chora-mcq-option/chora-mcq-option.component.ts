import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ChoraMcqOptionMode = 'interactive' | 'reveal';

@Component({
  selector: 'chora-mcq-option',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chora-mcq-option.component.html',
  styleUrl: './chora-mcq-option.component.scss',
})
export class ChoraMcqOptionComponent {
  mode = input.required<ChoraMcqOptionMode>();
  marker = input.required<string>();
  text = input.required<string>();
  selected = input<boolean>(false);
  correct = input<boolean | undefined>(undefined);
  explainer = input<string | undefined>(undefined);
  testId = input<string | undefined>(undefined);
  disabled = input<boolean>(false);
  ariaLabel = input<string | undefined>(undefined);
  /**
   * Optional id of the question-stem element (e.g. the `<h2>` carrying the
   * prompt). When set, the interactive `<button role="radio">` gets
   * `aria-describedby="{stemElementId}"` so screen readers announce the
   * stem alongside the option marker + text — addresses WCAG 2.1 AA per
   * `docs/m13/cj1-ui-design-refinement-plan-2026-05-17.md` §Accessibility.
   */
  stemElementId = input<string | undefined>(undefined);
  /**
   * Reveal-mode badge labels. The shared component is presentational, so the
   * caller passes already-translated strings (the result page sources them
   * from `aplus.me_assessments.result.{your,correct}_answer_badge`). Defaults
   * keep the component self-contained for Storybook + isolated specs.
   *
   * `yourAnswerLabel` tags the option the learner actually picked;
   * `correctAnswerLabel` tags the correct option when the learner did NOT
   * pick it — together they make chosen-vs-correct legible at a glance.
   */
  yourAnswerLabel = input<string>('Your answer');
  correctAnswerLabel = input<string>('Correct answer');

  readonly pick = output<void>();

  onPick(): void {
    if (this.disabled()) return;
    this.pick.emit();
  }
}
