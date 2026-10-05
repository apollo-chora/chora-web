/**
 * BatchTranslateQueueComponent — Batch translation job list with progress bars.
 *
 * Route: /admin/content/translation (child of TranslationPanelComponent)
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type {
  BatchTranslationResponse,
  BatchTranslationResult,
} from '../../services/content-translation.service';

@Component({
  selector: 'chora-batch-translate-queue',
  standalone: true,
  imports: [UpperCasePipe, TranslatePipe],
  templateUrl: './batch-translate-queue.component.html',
  styleUrl: './batch-translate-queue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchTranslateQueueComponent {
  readonly batch = input.required<BatchTranslationResponse>();

  completedCount(): number {
    return this.batch().results.filter((r) => r.status === 'completed').length;
  }

  totalCount(): number {
    return this.batch().results.length;
  }

  progressPercent(): number {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.completedCount() / total) * 100);
  }

  statusClass(result: BatchTranslationResult): string {
    return `batch-translate-queue__item-status--${result.status}`;
  }

  statusLabel(status: string): string {
    const key = `admin.translation.batch_status_${status}`;
    return key;
  }
}
