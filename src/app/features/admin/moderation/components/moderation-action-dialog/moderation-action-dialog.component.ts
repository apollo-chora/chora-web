/**
 * ModerationActionDialogComponent — Dialog for submitting moderation decisions.
 *
 * Displayed as an inline panel within the moderation queue when a moderator
 * wants to approve, request edit, remove, or restore flagged content.
 *
 * Features:
 *   - Decision selection (approve, request edit, remove, restore)
 *   - Required reason field
 *   - Optional notes field
 *   - Submit / Cancel actions
 */
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type {
  FlaggedContentItem,
  ModerationDecision,
  ModerationActionRequest,
} from '../../models/moderation.model';
import {
  ALL_MODERATION_DECISIONS,
  MODERATION_DECISION_LABELS,
} from '../../models/moderation.model';

@Component({
  selector: 'chora-moderation-action-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './moderation-action-dialog.component.html',
  styleUrl: './moderation-action-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationActionDialogComponent {
  // --- Inputs ---
  readonly item = input.required<FlaggedContentItem>();
  readonly submitting = input<boolean>(false);

  // --- Outputs ---
  readonly submitAction = output<ModerationActionRequest>();
  readonly cancelled = output<void>();

  // --- Constants ---
  readonly allDecisions = ALL_MODERATION_DECISIONS;
  readonly decisionLabels = MODERATION_DECISION_LABELS;

  // --- Form state ---
  readonly selectedDecision = signal<ModerationDecision | null>(null);
  readonly reason = signal('');
  readonly notes = signal('');

  // --- Computed ---
  readonly isValid = computed(() => {
    return this.selectedDecision() !== null && this.reason().trim().length > 0;
  });

  readonly decisionVariant = computed((): string => {
    const decision = this.selectedDecision();
    switch (decision) {
      case 'approve':
      case 'restore':
        return 'success';
      case 'request_edit':
        return 'warning';
      case 'remove':
        return 'danger';
      default:
        return 'default';
    }
  });

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  onDecisionChange(value: string): void {
    this.selectedDecision.set(value === '' ? null : value as ModerationDecision);
  }

  onReasonChange(value: string): void {
    this.reason.set(value);
  }

  onNotesChange(value: string): void {
    this.notes.set(value);
  }

  onSubmit(): void {
    const decision = this.selectedDecision();
    if (!decision || !this.isValid()) return;

    this.submitAction.emit({
      decision,
      reason: this.reason().trim(),
      notes: this.notes().trim(),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
