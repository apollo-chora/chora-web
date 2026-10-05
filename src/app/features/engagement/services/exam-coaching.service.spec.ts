import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ExamCoachingService, ExamCoachingResponse } from './exam-coaching.service';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders — match backend Go snake_case JSON exactly
// ---------------------------------------------------------------------------

function buildCoachingResponse() {
  return {
    readiness_score: 68,
    weak_topics: [
      { topic_name: 'Integration', mastery_pct: 35 },
      { topic_name: 'Probability', mastery_pct: 42 },
    ],
    study_plan: [
      {
        atom_id: 'atom-300',
        title: 'Integration Techniques',
        priority: 1,
        reason: 'Lowest mastery — high exam weight',
      },
      {
        atom_id: 'atom-301',
        title: 'Bayes Theorem',
        priority: 2,
        reason: 'Frequently tested',
      },
      {
        atom_id: 'atom-302',
        title: 'Chain Rule Practice',
        priority: 3,
        reason: 'Supports integration mastery',
      },
    ],
    coaching_message: 'Focus on integration first — it accounts for 30% of the exam.',
    governance: { model_id: 'model-1', agent_id: 'exam-coach-v1' },
  };
}

function buildChatInitResponse() {
  return {
    stream_url: 'http://localhost:8000/api/v1/familiar/chat/stream/session-001',
  };
}

/**
 * Minimal EventSource fake for driving the SSE branches in connectStream.
 * jsdom has no real EventSource, so the service constructs THIS instead.
 * Captured listeners can be invoked directly to simulate `token`/`done`,
 * and `closed` records whether the service closed the connection.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  private listeners: Record<string, ((ev: MessageEvent) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }

  emit(type: string, data: string): void {
    for (const cb of this.listeners[type] ?? []) {
      cb({ data } as MessageEvent);
    }
  }

  triggerError(): void {
    this.onerror?.call(this as unknown as EventSource, new Event('error'));
  }

  close(): void {
    this.closed = true;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExamCoachingService', () => {
  let service: ExamCoachingService;
  let httpMock: HttpTestingController;
  let originalEventSource: typeof EventSource | undefined;
  const coachUrl = `${environment.bffBaseUrl}/api/v1/familiar/agents/exam-prep/coach`;
  const chatUrl = `${environment.bffBaseUrl}/api/v1/familiar/chat`;

  beforeEach(() => {
    originalEventSource = (globalThis as Record<string, unknown>)['EventSource'] as
      | typeof EventSource
      | undefined;
    FakeEventSource.instances = [];
    (globalThis as Record<string, unknown>)['EventSource'] =
      FakeEventSource as unknown as typeof EventSource;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ExamCoachingService,
      ],
    });
    service = TestBed.inject(ExamCoachingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stopChat();
    httpMock.verify();
    if (originalEventSource === undefined) {
      delete (globalThis as Record<string, unknown>)['EventSource'];
    } else {
      (globalThis as Record<string, unknown>)['EventSource'] = originalEventSource;
    }
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with idle state', () => {
    expect(service.coachingState().status).toBe('idle');
    expect(service.chatState().status).toBe('idle');
    expect(service.readinessScore()).toBe(0);
    expect(service.weakTopics()).toEqual([]);
    expect(service.studyPlan()).toEqual([]);
    expect(service.coachingMessage()).toBe('');
    expect(service.chatText()).toBe('');
    expect(service.isChatStreaming()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // loadCoaching
  // -------------------------------------------------------------------------

  it('sets loading state when loadCoaching is called', () => {
    service.loadCoaching('gcid-001').subscribe();
    expect(service.coachingState().status).toBe('loading');
    httpMock.expectOne(coachUrl).flush(buildCoachingResponse());
  });

  it('maps coaching data on success', () => {
    service.loadCoaching('gcid-001').subscribe();
    httpMock.expectOne(coachUrl).flush(buildCoachingResponse());

    expect(service.coachingState().status).toBe('success');
    expect(service.readinessScore()).toBe(68);
    expect(service.weakTopics().length).toBe(2);
    expect(service.weakTopics()[0].topic_name).toBe('Integration');
    expect(service.weakTopics()[0].mastery_pct).toBe(35);
  });

  it('maps study plan correctly', () => {
    service.loadCoaching('gcid-001').subscribe();
    httpMock.expectOne(coachUrl).flush(buildCoachingResponse());

    expect(service.studyPlan().length).toBe(3);
    expect(service.studyPlan()[0].atom_id).toBe('atom-300');
    expect(service.studyPlan()[0].priority).toBe(1);
    expect(service.studyPlan()[2].title).toBe('Chain Rule Practice');
  });

  it('maps coaching message correctly', () => {
    service.loadCoaching('gcid-001').subscribe();
    httpMock.expectOne(coachUrl).flush(buildCoachingResponse());

    expect(service.coachingMessage()).toContain('Focus on integration');
  });

  it('sends optional exam_id and context in body', () => {
    service.loadCoaching('gcid-001', 'exam-abc', 'final prep').subscribe();

    const req = httpMock.expectOne(coachUrl);
    expect(req.request.body).toEqual({
      gcid: 'gcid-001',
      exam_id: 'exam-abc',
      context: 'final prep',
    });
    req.flush(buildCoachingResponse());
  });

  it('sets error state on coaching failure', () => {
    service.loadCoaching('gcid-001').subscribe();
    httpMock.expectOne(coachUrl).error(new ProgressEvent('error'));

    expect(service.coachingState().status).toBe('error');
    const state = service.coachingState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('COACHING_LOAD_FAILED');
    }
  });

  it('returns default computed values on error', () => {
    service.loadCoaching('gcid-001').subscribe();
    httpMock.expectOne(coachUrl).error(new ProgressEvent('error'));

    expect(service.readinessScore()).toBe(0);
    expect(service.weakTopics()).toEqual([]);
    expect(service.studyPlan()).toEqual([]);
    expect(service.coachingMessage()).toBe('');
  });

  // -------------------------------------------------------------------------
  // startChat — SSE initialization
  // -------------------------------------------------------------------------

  it('sets streaming state when startChat is called', () => {
    service.startChat('gcid-001', 'How should I study?');

    expect(service.chatState().status).toBe('streaming');
    expect(service.isChatStreaming()).toBe(true);
    expect(service.chatText()).toBe('');

    // Flush the POST that initiates chat
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());
  });

  it('sets error state when chat init fails', () => {
    service.startChat('gcid-001', 'Help me');

    httpMock.expectOne(chatUrl).error(new ProgressEvent('error'));

    expect(service.chatState().status).toBe('error');
    const state = service.chatState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('CHAT_INIT_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // stopChat
  // -------------------------------------------------------------------------

  it('stopChat does not throw when no stream active', () => {
    expect(() => service.stopChat()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  it('resetState returns all states to idle', () => {
    service.loadCoaching('gcid-001').subscribe();
    httpMock.expectOne(coachUrl).flush(buildCoachingResponse());

    service.resetState();

    expect(service.coachingState().status).toBe('idle');
    expect(service.chatState().status).toBe('idle');
    expect(service.readinessScore()).toBe(0);
    expect(service.weakTopics()).toEqual([]);
    expect(service.studyPlan()).toEqual([]);
    expect(service.coachingMessage()).toBe('');
    expect(service.chatText()).toBe('');
    expect(service.isChatStreaming()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // loadCoaching — partial optional body
  // -------------------------------------------------------------------------

  it('sends only exam_id when context is omitted', () => {
    service.loadCoaching('gcid-001', 'exam-abc').subscribe();

    const req = httpMock.expectOne(coachUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ gcid: 'gcid-001', exam_id: 'exam-abc' });
    req.flush(buildCoachingResponse());
  });

  it('sends only context when exam_id is omitted', () => {
    service.loadCoaching('gcid-001', undefined, 'cramming').subscribe();

    const req = httpMock.expectOne(coachUrl);
    expect(req.request.body).toEqual({ gcid: 'gcid-001', context: 'cramming' });
    req.flush(buildCoachingResponse());
  });

  it('sends only gcid when both optional params omitted', () => {
    service.loadCoaching('gcid-001').subscribe();

    const req = httpMock.expectOne(coachUrl);
    expect(req.request.body).toEqual({ gcid: 'gcid-001' });
    req.flush(buildCoachingResponse());
  });

  it('emits the mapped response value to the subscriber on success', () => {
    let emitted: unknown = 'unset';
    service.loadCoaching('gcid-001').subscribe((v) => (emitted = v));
    httpMock.expectOne(coachUrl).flush(buildCoachingResponse());

    expect(emitted).not.toBeNull();
    expect((emitted as ExamCoachingResponse).readiness_score).toBe(68);
  });

  it('emits null to the subscriber on coaching failure', () => {
    let emitted: unknown = 'unset';
    service.loadCoaching('gcid-001').subscribe((v) => (emitted = v));
    httpMock.expectOne(coachUrl).error(new ProgressEvent('error'));

    expect(emitted).toBeNull();
  });

  it('captures the HTTP error message in the coaching error state', () => {
    service.loadCoaching('gcid-001').subscribe();
    httpMock
      .expectOne(coachUrl)
      .flush('server boom', { status: 500, statusText: 'Internal Server Error' });

    const state = service.coachingState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('COACHING_LOAD_FAILED');
      expect(typeof state.error.message).toBe('string');
    }
  });

  // -------------------------------------------------------------------------
  // SSE streaming — connectStream branches via FakeEventSource
  // -------------------------------------------------------------------------

  it('opens an EventSource with the returned stream_url after chat init', () => {
    service.startChat('gcid-001', 'How do I prepare?');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());

    expect(FakeEventSource.instances.length).toBe(1);
    expect(FakeEventSource.instances[0].url).toBe(buildChatInitResponse().stream_url);
  });

  it('appends token events to the streaming chat text', () => {
    service.startChat('gcid-001', 'Help');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());

    const es = FakeEventSource.instances[0];
    es.emit('token', 'Hello');
    es.emit('token', ', world');

    expect(service.chatState().status).toBe('streaming');
    expect(service.chatText()).toBe('Hello, world');
    expect(service.isChatStreaming()).toBe(true);
  });

  it('transitions to complete on the done event and parses metadata', () => {
    service.startChat('gcid-001', 'Help');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());

    const es = FakeEventSource.instances[0];
    es.emit('token', 'Final answer');
    es.emit('done', JSON.stringify({ tokens: 12, model_id: 'm-1' }));

    const state = service.chatState();
    expect(state.status).toBe('complete');
    if (state.status === 'complete') {
      expect(state.text).toBe('Final answer');
      expect(state.metadata['tokens']).toBe(12);
      expect(state.metadata['model_id']).toBe('m-1');
    }
    expect(service.isChatStreaming()).toBe(false);
    // Service should have closed the stream on done.
    expect(es.closed).toBe(true);
  });

  it('treats text as empty on done when no token arrived', () => {
    service.startChat('gcid-001', 'Help');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());

    const es = FakeEventSource.instances[0];
    es.emit('done', JSON.stringify({ tokens: 0 }));

    const state = service.chatState();
    expect(state.status).toBe('complete');
    if (state.status === 'complete') {
      expect(state.text).toBe('');
    }
  });

  it('sets error state when the EventSource errors mid-stream', () => {
    service.startChat('gcid-001', 'Help');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());

    const es = FakeEventSource.instances[0];
    es.emit('token', 'partial');
    es.triggerError();

    const state = service.chatState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('CHAT_STREAM_ERROR');
      expect(state.error.message).toBe('Connection lost');
    }
    expect(es.closed).toBe(true);
  });

  it('startChat closes a prior active stream before opening a new one', () => {
    service.startChat('gcid-001', 'First');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());
    const first = FakeEventSource.instances[0];
    expect(first.closed).toBe(false);

    service.startChat('gcid-001', 'Second');
    expect(first.closed).toBe(true);
    expect(service.chatState().status).toBe('streaming');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());

    expect(FakeEventSource.instances.length).toBe(2);
  });

  it('stopChat closes the active EventSource', () => {
    service.startChat('gcid-001', 'Help');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());
    const es = FakeEventSource.instances[0];

    service.stopChat();

    expect(es.closed).toBe(true);
  });

  it('resetState stops an active stream and clears chat state', () => {
    service.startChat('gcid-001', 'Help');
    httpMock.expectOne(chatUrl).flush(buildChatInitResponse());
    const es = FakeEventSource.instances[0];
    es.emit('token', 'hi');

    service.resetState();

    expect(es.closed).toBe(true);
    expect(service.chatState().status).toBe('idle');
    expect(service.chatText()).toBe('');
  });

  it('does not emit chatText for an error chat state after init failure', () => {
    service.startChat('gcid-001', 'Help');
    httpMock.expectOne(chatUrl).error(new ProgressEvent('error'));

    expect(service.chatText()).toBe('');
    expect(service.isChatStreaming()).toBe(false);
  });
});
