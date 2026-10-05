/**
 * ReasoningTraceComponent — Vertical timeline showing the reasoning steps
 * of an AI agent investigation. Each step has a number, description,
 * evidence, and color-coded confidence bar.
 *
 * Route: /admin/governance/explainability (child of ExplainabilityViewerComponent)
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { ReasoningStep } from '../../services/explainability.service';

@Component({
  selector: 'chora-reasoning-trace',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './reasoning-trace.component.html',
  styleUrl: './reasoning-trace.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReasoningTraceComponent {
  readonly steps = input.required<ReasoningStep[]>();
  readonly summary = input<string>('');

  confidenceClass(confidence: number): string {
    if (confidence > 0.8) return 'reasoning-trace__confidence-fill--high';
    if (confidence >= 0.5) return 'reasoning-trace__confidence-fill--medium';
    return 'reasoning-trace__confidence-fill--low';
  }

  confidencePercent(confidence: number): number {
    return Math.round(confidence * 100);
  }
}
