/**
 * ModerationFeedbackPanelComponent — shared inline moderation Verdict panel.
 *
 * Surfaces the chora-sharing `ModerationVerdict` 422 envelope (ADR-152 Cloud
 * Model Armor screening) as an accessible inline panel. Pattern precedent:
 * the A+ atom-authoring "gatekeeper refuse + rewrite" modal — this is the
 * extracted, reusable shape.
 *
 * Verdict → UX:
 *  - `refine` → reason + "Accept rewrite" CTA (only when `suggested_rewrite`
 *    is present) — emits `acceptRewrite` with the rewrite string.
 *  - `reject` → reason + "Edit and retry" CTA — emits `editRetry`.
 *  - `unknown` → generic fail-safe message + "Edit and retry" CTA.
 *
 * `role="alert"` + `aria-live="polite"` so assistive tech announces the
 * verdict the moment it renders.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';
import type { ModerationVerdict } from '../../models/moderation-verdict.model';

@Component({
  selector: 'chora-moderation-feedback-panel',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './moderation-feedback-panel.component.html',
  styleUrl: './moderation-feedback-panel.component.scss',
})
export class ModerationFeedbackPanelComponent {
  /** The 422 moderation verdict to surface. */
  readonly verdict = input.required<ModerationVerdict>();

  /** Emits the `suggested_rewrite` string when the user accepts the rewrite. */
  readonly acceptRewrite = output<string>();

  /** Emits when the user chooses to edit their post and retry. */
  readonly editRetry = output<void>();

  /** Emits when the user dismisses the panel. */
  readonly dismiss = output<void>();

  /** True for the `refine` verdict with a non-empty `suggested_rewrite`. */
  readonly canAcceptRewrite = computed<boolean>(() => {
    const v = this.verdict();
    return v.verdict === 'refine' && !!v.suggested_rewrite;
  });

  /** i18n key for the verdict heading. */
  readonly headingKey = computed<string>(
    () => `shared.moderation_feedback.heading_${this.verdict().verdict}`,
  );

  onAcceptRewrite(): void {
    const rewrite = this.verdict().suggested_rewrite;
    if (rewrite) {
      this.acceptRewrite.emit(rewrite);
    }
  }

  onEditRetry(): void {
    this.editRetry.emit();
  }

  onDismiss(): void {
    this.dismiss.emit();
  }
}
