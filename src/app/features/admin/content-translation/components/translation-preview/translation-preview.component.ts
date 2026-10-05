/**
 * TranslationPreviewComponent — Side-by-side preview of original and translated content
 * with confidence score and accept/reject actions.
 *
 * Route: /admin/content/translation (child of TranslationPanelComponent)
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { TranslationResponse } from '../../services/content-translation.service';

@Component({
  selector: 'chora-translation-preview',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './translation-preview.component.html',
  styleUrl: './translation-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranslationPreviewComponent {
  readonly translation = input.required<TranslationResponse>();
  readonly originalContent = input<string>('');

  readonly accept = output<string>();
  readonly reject = output<string>();

  onAccept(): void {
    this.accept.emit(this.translation().content_id);
  }

  onReject(): void {
    this.reject.emit(this.translation().content_id);
  }

  confidenceClass(): string {
    const confidence = this.translation().confidence;
    if (confidence >= 0.8) return 'translation-preview__confidence--high';
    if (confidence >= 0.5) return 'translation-preview__confidence--medium';
    return 'translation-preview__confidence--low';
  }

  formatConfidence(): string {
    return `${(this.translation().confidence * 100).toFixed(0)}%`;
  }
}
