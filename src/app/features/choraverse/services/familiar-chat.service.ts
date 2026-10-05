import { Injectable, inject, signal, NgZone } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  ChatMessage,
  ChatState,
  PersonaState,
  PersonaSnapshot,
  MemoryEntry,
  MemoryListState,
} from '../models/familiar-chat.model';

@Injectable({ providedIn: 'root' })
export class FamiliarChatService {
  private readonly bff = inject(BffClientService);
  private readonly zone = inject(NgZone);

  private readonly _chatState = signal<ChatState>({ status: 'idle' });
  readonly chatState = this._chatState.asReadonly();

  private readonly _messages = signal<ChatMessage[]>([]);
  readonly messages = this._messages.asReadonly();

  private readonly _personaState = signal<PersonaState>({ status: 'idle' });
  readonly personaState = this._personaState.asReadonly();

  private readonly _memoryState = signal<MemoryListState>({ status: 'idle' });
  readonly memoryState = this._memoryState.asReadonly();

  private eventSource: EventSource | null = null;

  sendMessage(content: string): void {
    const learnerMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'learner',
      content,
      timestamp: new Date().toISOString(),
      citations: [],
      is_streaming: false,
    };
    this._messages.update((msgs) => [...msgs, learnerMsg]);

    const streamingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'familiar',
      content: '',
      timestamp: new Date().toISOString(),
      citations: [],
      is_streaming: true,
    };
    this._messages.update((msgs) => [...msgs, streamingMsg]);
    this._chatState.set({ status: 'streaming' });

    this.bff
      .post<{ stream_url: string }>('/api/v1/familiar/chat', { content })
      .subscribe({
        next: (res) => {
          this.eventSource = new EventSource(res.stream_url);

          this.eventSource.addEventListener('token', (event: MessageEvent) => {
            this.zone.run(() => {
              this._messages.update((msgs) => {
                const updated = [...msgs];
                const last = updated[updated.length - 1];
                if (last.is_streaming) {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + event.data,
                  };
                }
                return updated;
              });
            });
          });

          this.eventSource.addEventListener('done', (event: MessageEvent) => {
            this.zone.run(() => {
              const parsed = JSON.parse(event.data);
              this._messages.update((msgs) => {
                const updated = [...msgs];
                const last = updated[updated.length - 1];
                if (last.is_streaming) {
                  updated[updated.length - 1] = {
                    ...last,
                    is_streaming: false,
                    citations: parsed.citations || [],
                  };
                }
                return updated;
              });
              this._chatState.set({ status: 'success' });
              this.closeStream();
            });
          });

          this.eventSource.onerror = () => {
            this.zone.run(() => {
              this._chatState.set({
                status: 'error',
                error: { code: 'STREAM_ERROR', message: 'Connection lost' },
              });
              this.closeStream();
            });
          };
        },
        error: () => {
          this._chatState.set({
            status: 'error',
            error: { code: 'SEND_FAILED', message: 'Failed to send message' },
          });
        },
      });
  }

  loadChatHistory(): Observable<ChatMessage[] | null> {
    this._chatState.set({ status: 'loading' });

    return this.bff
      .get<ChatMessage[]>('/api/v1/familiar/chat/history')
      .pipe(
        tap((messages) => {
          this._messages.set(messages);
          this._chatState.set({ status: 'success' });
        }),
        catchError(() => {
          this._chatState.set({
            status: 'error',
            error: { code: 'HISTORY_LOAD_FAILED', message: 'Failed to load chat history' },
          });
          return of(null);
        }),
      );
  }

  loadPersona(): Observable<PersonaSnapshot | null> {
    this._personaState.set({ status: 'loading' });

    return this.bff
      .get<PersonaSnapshot>('/api/v1/familiar/persona')
      .pipe(
        tap((persona) => {
          this._personaState.set({ status: 'success', persona });
        }),
        catchError(() => {
          this._personaState.set({
            status: 'error',
            error: { code: 'PERSONA_LOAD_FAILED', message: 'Failed to load persona' },
          });
          return of(null);
        }),
      );
  }

  loadMemory(): Observable<MemoryEntry[] | null> {
    this._memoryState.set({ status: 'loading' });

    return this.bff
      .get<MemoryEntry[]>('/api/v1/familiar/memory')
      .pipe(
        tap((entries) => {
          this._memoryState.set({ status: 'success', entries });
        }),
        catchError(() => {
          this._memoryState.set({
            status: 'error',
            error: { code: 'MEMORY_LOAD_FAILED', message: 'Failed to load memory' },
          });
          return of(null);
        }),
      );
  }

  clearMemory(): Observable<void | null> {
    return this.bff
      .delete<void>('/api/v1/familiar/memory')
      .pipe(
        tap(() => {
          this._memoryState.set({ status: 'success', entries: [] });
        }),
        catchError(() => of(null)),
      );
  }

  closeStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
