import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

export interface WeakTopic {
  topic_name: string;
  mastery_pct: number;
}

export interface StudyPlanItem {
  atom_id: string;
  title: string;
  priority: number;
  reason: string;
}

export interface ExamCoachingResponse {
  readiness_score: number;
  weak_topics: WeakTopic[];
  study_plan: StudyPlanItem[];
  coaching_message: string;
  governance: Record<string, unknown>;
}

export interface ChatStreamInit {
  stream_url: string;
}

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type CoachingState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ExamCoachingResponse }
  | { status: 'error'; error: { code: string; message: string } };

export type ChatState =
  | { status: 'idle' }
  | { status: 'streaming'; text: string }
  | { status: 'complete'; text: string; metadata: Record<string, unknown> }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class ExamCoachingService {
  private readonly bff = inject(BffClientService);
  private readonly ngZone = inject(NgZone);
  private readonly coachPath = '/api/v1/familiar/agents/exam-prep/coach';
  private readonly chatPath = '/api/v1/familiar/chat';

  private eventSource: EventSource | null = null;

  // --- State ---
  private readonly _coachingState = signal<CoachingState>({ status: 'idle' });
  readonly coachingState = this._coachingState.asReadonly();

  private readonly _chatState = signal<ChatState>({ status: 'idle' });
  readonly chatState = this._chatState.asReadonly();

  // --- Computed ---
  readonly readinessScore = computed(() => {
    const s = this._coachingState();
    return s.status === 'success' ? s.data.readiness_score : 0;
  });

  readonly weakTopics = computed(() => {
    const s = this._coachingState();
    return s.status === 'success' ? s.data.weak_topics : [];
  });

  readonly studyPlan = computed(() => {
    const s = this._coachingState();
    return s.status === 'success' ? s.data.study_plan : [];
  });

  readonly coachingMessage = computed(() => {
    const s = this._coachingState();
    return s.status === 'success' ? s.data.coaching_message : '';
  });

  readonly chatText = computed(() => {
    const s = this._chatState();
    if (s.status === 'streaming' || s.status === 'complete') return s.text;
    return '';
  });

  readonly isChatStreaming = computed(() => {
    return this._chatState().status === 'streaming';
  });

  // ---------------------------------------------------------------------------
  // Load exam coaching data (Agent #14 — Exam Prep Coach)
  // ---------------------------------------------------------------------------

  loadCoaching(
    gcid: string,
    examId?: string,
    context?: string,
  ): Observable<ExamCoachingResponse | null> {
    this._coachingState.set({ status: 'loading' });

    const body: Record<string, unknown> = { gcid };
    if (examId) body['exam_id'] = examId;
    if (context) body['context'] = context;

    return this.bff.post<ExamCoachingResponse>(this.coachPath, body).pipe(
      tap((data) => {
        this._coachingState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._coachingState.set({
          status: 'error',
          error: { code: 'COACHING_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Start SSE chat stream
  // ---------------------------------------------------------------------------

  startChat(gcid: string, message: string): void {
    this.stopChat();
    this._chatState.set({ status: 'streaming', text: '' });

    this.bff.post<ChatStreamInit>(this.chatPath, { gcid, message }).pipe(
      tap((init) => {
        this.connectStream(init.stream_url);
      }),
      catchError((err: Error) => {
        this._chatState.set({
          status: 'error',
          error: { code: 'CHAT_INIT_FAILED', message: err.message },
        });
        return of(null);
      }),
    ).subscribe();
  }

  stopChat(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this.stopChat();
    this._coachingState.set({ status: 'idle' });
    this._chatState.set({ status: 'idle' });
  }

  // ---------------------------------------------------------------------------
  // Private — SSE connection
  // ---------------------------------------------------------------------------

  private connectStream(url: string): void {
    this.ngZone.runOutsideAngular(() => {
      const es = new EventSource(url);
      this.eventSource = es;

      es.addEventListener('token', (event: MessageEvent) => {
        this.ngZone.run(() => {
          const current = this._chatState();
          const existing = current.status === 'streaming' ? current.text : '';
          this._chatState.set({ status: 'streaming', text: existing + event.data });
        });
      });

      es.addEventListener('done', (event: MessageEvent) => {
        this.ngZone.run(() => {
          const current = this._chatState();
          const text = current.status === 'streaming' ? current.text : '';
          const metadata = JSON.parse(event.data) as Record<string, unknown>;
          this._chatState.set({ status: 'complete', text, metadata });
          es.close();
          this.eventSource = null;
        });
      });

      es.onerror = () => {
        this.ngZone.run(() => {
          this._chatState.set({
            status: 'error',
            error: { code: 'CHAT_STREAM_ERROR', message: 'Connection lost' },
          });
          es.close();
          this.eventSource = null;
        });
      };
    });
  }
}
