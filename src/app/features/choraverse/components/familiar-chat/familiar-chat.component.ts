import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { FamiliarChatService } from '../../services/familiar-chat.service';
import type { ChatMessage } from '../../models/familiar-chat.model';

@Component({
  selector: 'chora-familiar-chat',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './familiar-chat.component.html',
  styleUrl: './familiar-chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamiliarChatComponent implements OnInit, OnDestroy {
  protected readonly chatService = inject(FamiliarChatService);
  private readonly toast = inject(ToastService);

  readonly messageInput = signal('');

  private subscriptions = new Subscription();

  get messages() {
    return this.chatService.messages;
  }

  get chatState() {
    return this.chatService.chatState;
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.chatService.loadChatHistory().subscribe({
        error: () => {
          this.toast.show('choraverse.familiar_chat.history_load_error', 'error');
        },
      }),
    );
  }

  ngOnDestroy(): void {
    this.chatService.closeStream();
    this.subscriptions.unsubscribe();
  }

  sendMessage(): void {
    const content = this.messageInput().trim();
    if (!content) return;
    if (this.chatState().status === 'streaming') return;

    this.chatService.sendMessage(content);
    this.messageInput.set('');
  }

  onInputChange(value: string): void {
    this.messageInput.set(value);
  }

  onKeyEnter(event: Event): void {
    event.preventDefault();
    this.sendMessage();
  }

  isStreaming(): boolean {
    return this.chatState().status === 'streaming';
  }

  isLastMessageStreaming(): boolean {
    const msgs = this.messages();
    if (msgs.length === 0) return false;
    return msgs[msgs.length - 1].is_streaming;
  }

  trackByMessageId(_index: number, message: ChatMessage): string {
    return message.id;
  }
}
