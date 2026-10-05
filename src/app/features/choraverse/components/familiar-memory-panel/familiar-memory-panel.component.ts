import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { FamiliarChatService } from '../../services/familiar-chat.service';
import type { MemoryEntry } from '../../models/familiar-chat.model';

@Component({
  selector: 'chora-familiar-memory-panel',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
  templateUrl: './familiar-memory-panel.component.html',
  styleUrl: './familiar-memory-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamiliarMemoryPanelComponent implements OnInit, OnDestroy {
  private readonly chatService = inject(FamiliarChatService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly memoryState = this.chatService.memoryState;

  readonly entries = computed<MemoryEntry[]>(() => {
    const state = this.memoryState();
    return state.status === 'success' ? state.entries : [];
  });

  readonly isEmpty = computed(() => {
    const state = this.memoryState();
    return state.status === 'success' && state.entries.length === 0;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.chatService.loadMemory().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  async clearMemory(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'choraverse.familiar_memory.clear_title',
      message: 'choraverse.familiar_memory.clear_message',
      confirmText: 'choraverse.familiar_memory.clear_confirm',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.chatService.clearMemory().subscribe({
        next: () => {
          this.toast.show('choraverse.familiar_memory.cleared', 'success');
        },
        error: () => {
          this.toast.show('choraverse.familiar_memory.clear_error', 'error');
        },
      }),
    );
  }

  sourceClass(source: string): string {
    return `familiar-memory-panel__source--${source}`;
  }
}
