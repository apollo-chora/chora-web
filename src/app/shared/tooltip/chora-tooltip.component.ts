import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/** Which side of its trigger the tooltip sits - drives the caret + offset. */
export type TooltipPosition = 'above' | 'below';

/**
 * Presentational glassmorphic info-tooltip (UX review §2.2). Rendered into a
 * CDK Overlay portal by {@link InfoTooltipDirective} - never placed inline - so
 * it is never clipped by an `overflow` ancestor. Pure view: it owns no overlay
 * or trigger logic, only the two-tier (label + description) glass card and the
 * reduced-motion decision.
 */
@Component({
  selector: 'chora-tooltip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chora-tooltip.component.html',
  styleUrl: './chora-tooltip.component.scss',
})
export class ChoraTooltipComponent {
  /** Bold first line - the term being explained. */
  readonly label = input<string>('');

  /** Plain-language second line - what it does for the user. Optional. */
  readonly description = input<string>('');

  /** DOM id so the trigger can point `aria-describedby` at this card. */
  readonly tooltipId = input<string>('');

  /** Side the tooltip sits relative to its trigger; the directive keeps it in sync. */
  readonly position = input<TooltipPosition>('below');

  /**
   * Whether the OS asked for reduced motion. Read once at construction
   * (the tooltip is transient). When true the CSS animation drops the
   * translate and fades only - see the component stylesheet.
   */
  protected readonly reducedMotion = signal(false);

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.reducedMotion.set(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
  }
}
