import { firstValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { FamiliarChatService } from './familiar-chat.service';

const BFF = environment.bffBaseUrl;

/**
 * Minimal EventSource fake for driving the SSE branches in sendMessage.
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

describe('FamiliarChatService', () => {
  let service: FamiliarChatService;
  let httpMock: HttpTestingController;
  let originalEventSource: typeof EventSource | undefined;

  beforeEach(() => {
    originalEventSource = (globalThis as Record<string, unknown>)['EventSource'] as
      | typeof EventSource
      | undefined;
    FakeEventSource.instances = [];
    (globalThis as Record<string, unknown>)['EventSource'] =
      FakeEventSource as unknown as typeof EventSource;

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FamiliarChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    if (originalEventSource === undefined) {
      delete (globalThis as Record<string, unknown>)['EventSource'];
    } else {
      (globalThis as Record<string, unknown>)['EventSource'] = originalEventSource;
    }
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadChatHistory', () => {
    it('should set loading then success state', () => {
      const mockMessages = [
        { id: 'msg-1', role: 'learner', content: 'Hello', timestamp: '2026-01-01T00:00:00Z', citations: [], is_streaming: false },
        { id: 'msg-2', role: 'familiar', content: 'Hi there!', timestamp: '2026-01-01T00:00:01Z', citations: [], is_streaming: false },
      ];

      service.loadChatHistory().subscribe();
      expect(service.chatState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/familiar/chat/history'));
      expect(req.request.method).toBe('GET');
      req.flush(mockMessages);

      expect(service.chatState().status).toBe('success');
      expect(service.messages().length).toBe(2);
    });

    it('should set error state on failure', () => {
      service.loadChatHistory().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/familiar/chat/history'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.chatState().status).toBe('error');
    });
  });

  describe('loadPersona', () => {
    it('should set loading then success state', () => {
      const mockPersona = { archetype: 'sage', name: 'Owly', stats: { curiosity: 80, encouragement: 90, humor: 60, detail: 70, formality: 40 } };

      service.loadPersona().subscribe();
      expect(service.personaState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/familiar/persona'));
      req.flush(mockPersona);

      expect(service.personaState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadPersona().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/familiar/persona'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.personaState().status).toBe('error');
    });
  });

  describe('loadMemory', () => {
    it('should set loading then success state', () => {
      const mockEntries = [{ id: 'mem-1', content: 'Likes math', source: 'chat', created_at: '2026-01-01T00:00:00Z' }];

      service.loadMemory().subscribe();
      expect(service.memoryState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/familiar/memory'));
      req.flush(mockEntries);

      expect(service.memoryState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadMemory().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/familiar/memory'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.memoryState().status).toBe('error');
    });
  });

  describe('clearMemory', () => {
    it('should DELETE and set entries to empty', () => {
      service.clearMemory().subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/familiar/memory') && r.method === 'DELETE');
      req.flush(null);

      expect(service.memoryState().status).toBe('success');
    });
  });

  describe('sendMessage', () => {
    it('should add learner message and set streaming state', () => {
      service.sendMessage('Hello');

      expect(service.messages().length).toBe(2); // learner msg + streaming placeholder
      expect(service.messages()[0].role).toBe('learner');
      expect(service.messages()[0].content).toBe('Hello');
      expect(service.messages()[1].role).toBe('familiar');
      expect(service.messages()[1].is_streaming).toBe(true);
      expect(service.chatState().status).toBe('streaming');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/familiar/chat'));
      expect(req.request.method).toBe('POST');
      // Don't flush the SSE URL — just verify the POST was made
      req.flush('Error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('closeStream', () => {
    it('should be callable without error when no stream exists', () => {
      expect(() => service.closeStream()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Augmented coverage — exact BFF URLs, emitted observable values, SSE branches
  // ---------------------------------------------------------------------------

  describe('initial state', () => {
    it('exposes idle signals before any call', () => {
      expect(service.chatState().status).toBe('idle');
      expect(service.personaState().status).toBe('idle');
      expect(service.memoryState().status).toBe('idle');
      expect(service.messages()).toEqual([]);
    });
  });

  describe('loadChatHistory (exact URL + emitted value)', () => {
    it('GETs the absolute BFF history URL and emits the messages', async () => {
      const promise = firstValueFrom(service.loadChatHistory());

      const req = httpMock.expectOne(`${BFF}/api/v1/familiar/chat/history`);
      expect(req.request.method).toBe('GET');
      const payload = [
        { id: 'm1', role: 'learner', content: 'Hi', timestamp: 't', citations: [], is_streaming: false },
      ];
      req.flush(payload);

      const emitted = await promise;
      expect(emitted).toEqual(payload);
      expect(service.messages().length).toBe(1);
      expect(service.chatState().status).toBe('success');
    });

    it('emits null and sets HISTORY_LOAD_FAILED on error', async () => {
      const promise = firstValueFrom(service.loadChatHistory());
      httpMock
        .expectOne(`${BFF}/api/v1/familiar/chat/history`)
        .flush('boom', { status: 500, statusText: 'Server Error' });

      const emitted = await promise;
      expect(emitted).toBeNull();
      const st = service.chatState();
      expect(st.status).toBe('error');
      if (st.status === 'error') {
        expect(st.error.code).toBe('HISTORY_LOAD_FAILED');
        expect(st.error.message).toBe('Failed to load chat history');
      }
    });
  });

  describe('loadPersona (exact URL + emitted value)', () => {
    it('GETs the absolute BFF persona URL and stores persona in state', async () => {
      const persona = {
        archetype: 'sage',
        level: 3,
        stats: { curiosity: 80, encouragement: 90, humor: 60, detail: 70, formality: 40 },
        current_skin_name: null,
      };
      const promise = firstValueFrom(service.loadPersona());

      const req = httpMock.expectOne(`${BFF}/api/v1/familiar/persona`);
      expect(req.request.method).toBe('GET');
      req.flush(persona);

      const emitted = await promise;
      expect(emitted).toEqual(persona);
      const st = service.personaState();
      expect(st.status).toBe('success');
      if (st.status === 'success') {
        expect(st.persona.level).toBe(3);
      }
    });

    it('emits null and sets PERSONA_LOAD_FAILED on a 4xx error', async () => {
      const promise = firstValueFrom(service.loadPersona());
      httpMock
        .expectOne(`${BFF}/api/v1/familiar/persona`)
        .flush('nope', { status: 404, statusText: 'Not Found' });

      const emitted = await promise;
      expect(emitted).toBeNull();
      const st = service.personaState();
      expect(st.status).toBe('error');
      if (st.status === 'error') {
        expect(st.error.code).toBe('PERSONA_LOAD_FAILED');
      }
    });
  });

  describe('loadMemory (exact URL + emitted value)', () => {
    it('GETs the absolute BFF memory URL and stores entries', async () => {
      const entries = [
        { id: 'e1', content: 'Likes math', source: 'conversation', relevance_score: 0.9, created_at: 't' },
      ];
      const promise = firstValueFrom(service.loadMemory());

      const req = httpMock.expectOne(`${BFF}/api/v1/familiar/memory`);
      expect(req.request.method).toBe('GET');
      req.flush(entries);

      const emitted = await promise;
      expect(emitted).toEqual(entries);
      const st = service.memoryState();
      expect(st.status).toBe('success');
      if (st.status === 'success') {
        expect(st.entries.length).toBe(1);
      }
    });

    it('emits null and sets MEMORY_LOAD_FAILED on error', async () => {
      const promise = firstValueFrom(service.loadMemory());
      httpMock
        .expectOne(`${BFF}/api/v1/familiar/memory`)
        .flush('boom', { status: 500, statusText: 'Server Error' });

      const emitted = await promise;
      expect(emitted).toBeNull();
      const st = service.memoryState();
      expect(st.status).toBe('error');
      if (st.status === 'error') {
        expect(st.error.code).toBe('MEMORY_LOAD_FAILED');
      }
    });
  });

  describe('clearMemory (DELETE branches)', () => {
    it('DELETEs the absolute BFF memory URL and resets entries to []', async () => {
      const promise = firstValueFrom(service.clearMemory());

      const req = httpMock.expectOne(`${BFF}/api/v1/familiar/memory`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      await promise;
      const st = service.memoryState();
      expect(st.status).toBe('success');
      if (st.status === 'success') {
        expect(st.entries).toEqual([]);
      }
    });

    it('swallows a DELETE error and emits null (catchError -> of(null))', async () => {
      const promise = firstValueFrom(service.clearMemory());
      httpMock
        .expectOne(`${BFF}/api/v1/familiar/memory`)
        .flush('boom', { status: 500, statusText: 'Server Error' });

      const emitted = await promise;
      expect(emitted).toBeNull();
    });
  });

  describe('sendMessage success / streaming branches', () => {
    function startStream(): FakeEventSource {
      service.sendMessage('Tell me about photosynthesis');

      const req = httpMock.expectOne(`${BFF}/api/v1/familiar/chat`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ content: 'Tell me about photosynthesis' });
      req.flush({ stream_url: 'https://sse.chora.site/stream/abc' });

      expect(FakeEventSource.instances.length).toBe(1);
      const es = FakeEventSource.instances[0]!;
      expect(es.url).toBe('https://sse.chora.site/stream/abc');
      return es;
    }

    it('opens an EventSource with the returned stream_url', () => {
      const es = startStream();
      expect(es).toBeTruthy();
      expect(service.chatState().status).toBe('streaming');
      // tidy up the open stream so afterEach has nothing pending
      es.emit('done', JSON.stringify({ citations: [] }));
    });

    it('appends token data to the streaming familiar message', () => {
      const es = startStream();

      es.emit('token', 'Photo');
      es.emit('token', 'synthesis');

      const msgs = service.messages();
      const last = msgs[msgs.length - 1];
      expect(last.role).toBe('familiar');
      expect(last.is_streaming).toBe(true);
      expect(last.content).toBe('Photosynthesis');

      es.emit('done', JSON.stringify({ citations: [] }));
    });

    it('finalizes the message and closes the stream on done', () => {
      const es = startStream();
      es.emit('token', 'Answer');

      es.emit('done', JSON.stringify({ citations: [{ atom_id: 'a-1', title: 'Bio' }] }));

      const msgs = service.messages();
      const last = msgs[msgs.length - 1];
      expect(last.is_streaming).toBe(false);
      expect(last.content).toBe('Answer');
      expect(last.citations).toEqual([{ atom_id: 'a-1', title: 'Bio' }]);
      expect(service.chatState().status).toBe('success');
      expect(es.closed).toBe(true);
    });

    it('defaults citations to [] when done payload omits them', () => {
      const es = startStream();
      es.emit('done', JSON.stringify({}));

      const msgs = service.messages();
      expect(msgs[msgs.length - 1].citations).toEqual([]);
      expect(service.chatState().status).toBe('success');
    });

    it('sets STREAM_ERROR state and closes the stream on EventSource error', () => {
      const es = startStream();

      es.triggerError();

      const st = service.chatState();
      expect(st.status).toBe('error');
      if (st.status === 'error') {
        expect(st.error.code).toBe('STREAM_ERROR');
        expect(st.error.message).toBe('Connection lost');
      }
      expect(es.closed).toBe(true);
    });
  });

  describe('sendMessage POST failure branch', () => {
    it('sets SEND_FAILED state and opens no EventSource when the POST 4xx', () => {
      service.sendMessage('Hi');
      const req = httpMock.expectOne(`${BFF}/api/v1/familiar/chat`);
      req.flush('bad', { status: 400, statusText: 'Bad Request' });

      const st = service.chatState();
      expect(st.status).toBe('error');
      if (st.status === 'error') {
        expect(st.error.code).toBe('SEND_FAILED');
        expect(st.error.message).toBe('Failed to send message');
      }
      expect(FakeEventSource.instances.length).toBe(0);
    });
  });

  describe('closeStream after an open stream', () => {
    it('closes and nulls an active EventSource', () => {
      service.sendMessage('Hi');
      httpMock
        .expectOne(`${BFF}/api/v1/familiar/chat`)
        .flush({ stream_url: 'https://sse.chora.site/x' });

      const es = FakeEventSource.instances[0]!;
      expect(es.closed).toBe(false);

      service.closeStream();
      expect(es.closed).toBe(true);

      // second call is a no-op (eventSource already nulled)
      expect(() => service.closeStream()).not.toThrow();
    });
  });
});
