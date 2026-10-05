import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ChoraEmptyStateTone = 'neutral' | 'info' | 'warning';

/**
 * Shared empty-state primitive — icon + heading + optional body + optional
 * CTA. Replaces the per-feature inline empty-state implementations (AI
 * pipeline trace, submissions table, etc.) called out in
 * `docs/m13/cj1-ui-design-refinement-plan-2026-05-17.md` §Cross-cutting
 * design tokens item 4.
 *
 * Glassmorphism tokens (`--text-main`, `--text-muted`, `--primary`,
 * `--warning`) keep the primitive in lock-step with the design system; tone
 * variants surface as `data-tone` attribute selectors so the chip palette
 * is centralised.
 */
@Component({
  selector: 'chora-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chora-empty-state.component.html',
  styleUrl: './chora-empty-state.component.scss',
})
export class ChoraEmptyStateComponent {
  /** FontAwesome class string (e.g. `'fa-solid fa-inbox'`). Required. */
  icon = input.required<string>();
  /** Main message — short, sentence-cased. Required. */
  heading = input.required<string>();
  /** Optional supporting copy under the heading. */
  body = input<string | undefined>(undefined);
  /** Optional CTA button label. When set, the CTA button renders. */
  ctaLabel = input<string | undefined>(undefined);
  /** Accent variant — `neutral` (default) / `info` / `warning`. */
  tone = input<ChoraEmptyStateTone>('neutral');
  /** Optional `data-testid` for E2E + Vitest selectors. */
  testId = input<string | undefined>(undefined);

  readonly ctaClick = output<void>();

  onCtaClick(): void {
    this.ctaClick.emit();
  }
}
