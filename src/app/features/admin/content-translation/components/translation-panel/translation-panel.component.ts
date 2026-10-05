/**
 * TranslationPanelComponent — Language picker, content selector, translate button,
 * side-by-side preview, and batch translate queue.
 *
 * Route: /admin/content/translation
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import {
  ContentTranslationService,
  SUPPORTED_LANGUAGES,
} from '../../services/content-translation.service';
import type { SupportedLanguage } from '../../services/content-translation.service';
import { TranslationPreviewComponent } from '../translation-preview/translation-preview.component';
import { BatchTranslateQueueComponent } from '../batch-translate-queue/batch-translate-queue.component';

@Component({
  selector: 'chora-translation-panel',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    TranslationPreviewComponent,
    BatchTranslateQueueComponent,
  ],
  templateUrl: './translation-panel.component.html',
  styleUrl: './translation-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TranslationPanelComponent implements OnDestroy {
  private readonly translationService = inject(ContentTranslationService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly contentId = signal('');
  readonly sourceLanguage = signal<SupportedLanguage>('en');
  readonly targetLanguage = signal<SupportedLanguage>('zh-CN');
  readonly originalContent = signal('');

  // --- Batch ---
  readonly batchContentIds = signal('');

  // --- Delegate to service ---
  readonly translationState = this.translationService.translationState;
  readonly translationResult = this.translationService.translationResult;
  readonly batchState = this.translationService.batchState;
  readonly batchResult = this.translationService.batchResult;

  // --- Constants ---
  readonly languages = SUPPORTED_LANGUAGES;

  private subscriptions = new Subscription();

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Single Translation
  // -------------------------------------------------------------------------

  onContentIdInput(event: Event): void {
    this.contentId.set((event.target as HTMLInputElement).value);
  }

  onSourceLanguageChange(event: Event): void {
    this.sourceLanguage.set((event.target as HTMLSelectElement).value as SupportedLanguage);
  }

  onTargetLanguageChange(event: Event): void {
    this.targetLanguage.set((event.target as HTMLSelectElement).value as SupportedLanguage);
  }

  translate(): void {
    const id = this.contentId().trim();
    if (!id) return;

    this.subscriptions.add(
      this.translationService
        .translate({
          content_id: id,
          source_language: this.sourceLanguage(),
          target_language: this.targetLanguage(),
        })
        .subscribe({
          next: (result) => {
            if (result) {
              this.toast.show('admin.translation.translate_success', 'success');
            }
          },
          error: () => this.toast.show('admin.translation.translate_error', 'error'),
        }),
    );
  }

  onAcceptTranslation(_contentId: string): void {
    this.toast.show('admin.translation.accepted', 'success');
    this.translationService.resetTranslation();
  }

  onRejectTranslation(_contentId: string): void {
    this.toast.show('admin.translation.rejected', 'info');
    this.translationService.resetTranslation();
  }

  // -------------------------------------------------------------------------
  // Batch Translation
  // -------------------------------------------------------------------------

  onBatchContentIdsInput(event: Event): void {
    this.batchContentIds.set((event.target as HTMLTextAreaElement).value);
  }

  batchTranslate(): void {
    const ids = this.batchContentIds()
      .split('\n')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (ids.length === 0) return;

    this.subscriptions.add(
      this.translationService
        .batchTranslate({
          content_ids: ids,
          source_language: this.sourceLanguage(),
          target_language: this.targetLanguage(),
        })
        .subscribe({
          next: (result) => {
            if (result) {
              this.toast.show('admin.translation.batch_started', 'success');
            }
          },
          error: () => this.toast.show('admin.translation.batch_error', 'error'),
        }),
    );
  }
}
