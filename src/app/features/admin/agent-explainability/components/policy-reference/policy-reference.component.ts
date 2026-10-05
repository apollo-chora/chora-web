/**
 * PolicyReferenceComponent — Displays policy rules triggered during
 * an AI agent investigation: name, description, trigger reason.
 *
 * Route: /admin/governance/explainability (child of ExplainabilityViewerComponent)
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { PolicyReference } from '../../services/explainability.service';

@Component({
  selector: 'chora-policy-reference',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './policy-reference.component.html',
  styleUrl: './policy-reference.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PolicyReferenceComponent {
  readonly policies = input.required<PolicyReference[]>();
}
