/**
 * AiLabelChipComponent — ADR-225 inline "AI-generated" label chip
 * (EU AI Act Art 50 + IMDA MGF D2 transparency).
 *
 * A reusable, drop-anywhere chip that discloses AI provenance next to
 * AI-produced content. The `variant` input selects which BFF-served inline
 * label to render (`aiGenerated` / `aiAssisted` / `doseHeader`); the label +
 * tooltip come from `disclosure.inlineLabels[variant]` DIRECTLY (governance
 * source of truth). Renders NOTHING until the disclosure loads (no fabricated
 * copy). Drives `ensureLoaded()` itself.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';

import { AiTransparencyService } from '../../../core/services/ai-transparency.service';
import type {
  AiInlineLabel,
  AiInlineLabelVariant,
} from '../../../core/services/ai-transparency.model';

@Component({
  selector: 'chora-ai-label-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label(); as l) {
      <span
        class="ai-label-chip"
        [class.ai-label-chip--header]="variant() === 'doseHeader'"
        data-testid="ai-label-chip"
        [attr.data-variant]="variant()"
        [attr.title]="l.tooltip"
        [attr.aria-label]="l.label + '. ' + l.tooltip">
        <i class="fa-solid fa-wand-magic-sparkles ai-label-chip__icon" aria-hidden="true"></i>
        <span class="ai-label-chip__label">{{ l.label }}</span>
      </span>
    }
  `,
  styleUrl: './ai-label-chip.component.scss',
})
export class AiLabelChipComponent {
  private readonly service = inject(AiTransparencyService);

  /** Which inline label to render. */
  readonly variant = input.required<AiInlineLabelVariant>();

  readonly label = computed<AiInlineLabel | null>(() => {
    const labels = this.service.disclosure()?.inlineLabels;
    return labels ? labels[this.variant()] : null;
  });

  constructor() {
    this.service.ensureLoaded();
  }
}
