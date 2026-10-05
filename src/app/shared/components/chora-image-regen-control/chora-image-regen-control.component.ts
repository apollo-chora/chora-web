/**
 * ChoraImageRegenControlComponent — shared, presentational image-regenerate
 * control (CHO-1824 P5.3b).
 *
 * A refined-prompt input + Regenerate button (with a spinner while in flight)
 * + an inline error. It owns NO service and NO poll — purely presentation. The
 * host wires the {@link regenerate} output (the trimmed prompt) to its own
 * orchestration (`AtomAuthoringService.regenerateImage` → poll → apply), and
 * feeds back `regenerating` / `error` state. This DRYs the verbose regen UI so
 * A+ batch-authoring and R+ assessment-authoring share one implementation.
 */
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-image-regen-control',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './chora-image-regen-control.component.html',
  styleUrl: './chora-image-regen-control.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChoraImageRegenControlComponent {
  /** Which illustration slot this control targets (display/aria only). */
  readonly placement = input.required<'stem' | 'answer'>();
  /** True while the host's regeneration is in flight — drives the spinner. */
  readonly regenerating = input<boolean>(false);
  /** i18n key of an inline error, or null. */
  readonly error = input<string | null>(null);
  /** Prefix for per-instance data-testids (host passes a unique value). */
  readonly testIdPrefix = input<string>('');

  /** Emits the trimmed refined prompt when the author clicks Regenerate. */
  readonly regenerate = output<string>();

  readonly prompt = signal<string>('');

  onPromptInput(value: string): void {
    this.prompt.set(value);
  }

  submit(): void {
    const p = this.prompt().trim();
    if (!p || this.regenerating()) {
      return;
    }
    this.regenerate.emit(p);
  }
}
