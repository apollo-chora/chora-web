import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { FamiliarChatComponent } from './familiar-chat.component';
import { FamiliarChatService } from '../../services/familiar-chat.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { ChatMessage } from '../../models/familiar-chat.model';

const BFF = environment.bffBaseUrl;

/**
 * Minimal EventSource fake — jsdom has none, and the underlying
 * FamiliarChatService constructs `new EventSource(url)` in sendMessage.
 * Captured listeners can be fired directly to drive the SSE branches.
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

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? 'msg-1',
    role: overrides.role ?? 'familiar',
    content: overrides.content ?? 'Hello there',
    timestamp: overrides.timestamp ?? '2026-06-04T00:00:00.000Z',
    citations: overrides.citations ?? [],
    is_streaming: overrides.is_streaming ?? false,
  };
}

describe('FamiliarChatComponent', () => {
  let component: FamiliarChatComponent;
  let fixture: ComponentFixture<FamiliarChatComponent>;
  let httpMock: HttpTestingController;
  let chatService: FamiliarChatService;
  let originalEventSource: typeof EventSource | undefined;

  beforeEach(async () => {
    originalEventSource = (globalThis as Record<string, unknown>)['EventSource'] as
      | typeof EventSource
      | undefined;
    FakeEventSource.instances = [];
    (globalThis as Record<string, unknown>)['EventSource'] =
      FakeEventSource as unknown as typeof EventSource;

    await TestBed.configureTestingModule({
      imports: [FamiliarChatComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FamiliarChatComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    chatService = TestBed.inject(FamiliarChatService);
  });

  afterEach(() => {
    if (originalEventSource === undefined) {
      delete (globalThis as Record<string, unknown>)['EventSource'];
    } else {
      (globalThis as Record<string, unknown>)['EventSource'] = originalEventSource;
    }
  });

  /**
   * The component fires loadChatHistory() in ngOnInit on first detectChanges.
   * This helper triggers that and flushes the pending history GET so the
   * service settles and httpMock has no outstanding requests.
   */
  function initAndFlushHistory(body: ChatMessage[] = []): void {
    fixture.detectChanges();
    const req = httpMock.expectOne(`${BFF}/api/v1/familiar/chat/history`);
    expect(req.request.method).toBe('GET');
    req.flush(body);
    fixture.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Pre-existing tests (preserved verbatim — must keep passing)
  // ---------------------------------------------------------------------------

  it('should create', () => {
    initAndFlushHistory();
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    initAndFlushHistory();
    const el = fixture.nativeElement.querySelector('[data-testid="familiar-chat"]');
    expect(el).toBeTruthy();
  });

  it('should start with empty message input', () => {
    initAndFlushHistory();
    expect(component.messageInput()).toBe('');
  });

  it('should update message input', () => {
    initAndFlushHistory();
    component.onInputChange('Hello');
    expect(component.messageInput()).toBe('Hello');
  });

  it('should not send empty messages', () => {
    initAndFlushHistory();
    component.messageInput.set('   ');
    component.sendMessage();
    expect(component.messages().length).toBe(0);
  });

  it('should have no critical accessibility violations', async () => {
    initAndFlushHistory();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // ngOnInit — history load wiring
  // ---------------------------------------------------------------------------

  describe('ngOnInit history load', () => {
    it('issues a GET to the history endpoint on init', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(`${BFF}/api/v1/familiar/chat/history`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
      httpMock.verify();
    });

    it('populates messages from a successful history response', () => {
      const history = [
        makeMessage({ id: 'h1', role: 'learner', content: 'hi' }),
        makeMessage({ id: 'h2', role: 'familiar', content: 'hey' }),
      ];
      initAndFlushHistory(history);
      expect(component.messages().length).toBe(2);
      expect(component.messages()[0].content).toBe('hi');
      expect(component.chatState().status).toBe('success');
    });

    it('characterizes the swallowed history-error: chat state goes error but the toast never fires', () => {
      // PROD BUG (characterized, not fixed): the component subscribes to
      // loadChatHistory() with an `error` callback that calls
      // toast.show('...history_load_error', 'error'). But the service pipes
      // catchError(() => of(null)), so on HTTP failure the stream emits `null`
      // and COMPLETES normally — the subscriber's `error` callback is never
      // invoked. Net effect: the error toast is dead code; only the service's
      // internal chatState flips to 'error'. We assert the real behavior so the
      // spec stays green and documents the gap.
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');
      fixture.detectChanges();
      const req = httpMock.expectOne(`${BFF}/api/v1/familiar/chat/history`);
      req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      // The toast NEVER fires because catchError swallows the error.
      expect(spy).not.toHaveBeenCalled();
      // The service-internal chatState is the error state.
      expect(component.chatState().status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // Template state rendering
  // ---------------------------------------------------------------------------

  describe('template rendering', () => {
    function q(sel: string): Element | null {
      return fixture.nativeElement.querySelector(sel);
    }

    it('renders the loading indicator while history is loading', () => {
      // detectChanges fires ngOnInit -> chatState becomes 'loading' before flush.
      fixture.detectChanges();
      expect(q('[data-testid="chat-loading"]')).toBeTruthy();
      // settle the outstanding request to satisfy httpMock.
      httpMock.expectOne(`${BFF}/api/v1/familiar/chat/history`).flush([]);
    });

    it('renders the error banner when chat state is error', () => {
      fixture.detectChanges();
      httpMock
        .expectOne(`${BFF}/api/v1/familiar/chat/history`)
        .flush({}, { status: 500, statusText: 'err' });
      fixture.detectChanges();
      const banner = q('[data-testid="chat-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('renders a message bubble per message with role-derived classes', () => {
      initAndFlushHistory([
        makeMessage({ id: 'm-learner', role: 'learner', content: 'ask' }),
        makeMessage({ id: 'm-fam', role: 'familiar', content: 'answer' }),
      ]);
      const learner = q('[data-testid="chat-message-m-learner"]');
      const familiar = q('[data-testid="chat-message-m-fam"]');
      expect(learner).toBeTruthy();
      expect(familiar).toBeTruthy();
      expect(learner?.classList.contains('familiar-chat__message--learner')).toBe(true);
      expect(familiar?.classList.contains('familiar-chat__message--familiar')).toBe(true);
      // Real data asserted via toContain (Translate pipe returns keys only).
      expect(fixture.nativeElement.textContent).toContain('ask');
      expect(fixture.nativeElement.textContent).toContain('answer');
    });

    it('renders the streaming indicator for a streaming message', () => {
      initAndFlushHistory([makeMessage({ id: 'm-stream', role: 'familiar', is_streaming: true })]);
      expect(q('[data-testid="streaming-indicator"]')).toBeTruthy();
    });

    it('renders citation chips for a familiar message with citations', () => {
      initAndFlushHistory([
        makeMessage({
          id: 'm-cite',
          role: 'familiar',
          citations: [{ atomId: 'atom-9', atomTitle: 'Photosynthesis', topicNodePath: 'bio/cell' }],
        }),
      ]);
      expect(q('[data-testid="chat-citations"]')).toBeTruthy();
      const chip = q('[data-testid="citation-atom-9"]');
      expect(chip).toBeTruthy();
      expect(chip?.textContent?.trim()).toContain('Photosynthesis');
    });

    it('does not render citations for a learner message even with citations', () => {
      initAndFlushHistory([
        makeMessage({
          id: 'm-learner-cite',
          role: 'learner',
          citations: [{ atomId: 'atom-x', atomTitle: 'X', topicNodePath: 'p' }],
        }),
      ]);
      expect(q('[data-testid="chat-citations"]')).toBeNull();
    });

    it('disables the input and send button while streaming', () => {
      initAndFlushHistory();
      component.messageInput.set('a question');
      // Force the underlying service into streaming state.
      (
        chatService as unknown as {
          _chatState: { set: (v: unknown) => void };
        }
      )._chatState.set({ status: 'streaming' });
      fixture.detectChanges();
      const input = q('[data-testid="chat-input"]') as HTMLInputElement;
      const sendBtn = q('[data-testid="chat-send-btn"]') as HTMLButtonElement;
      expect(input.disabled).toBe(true);
      expect(sendBtn.disabled).toBe(true);
    });

    it('disables the send button when input is empty/whitespace', () => {
      initAndFlushHistory();
      component.messageInput.set('   ');
      fixture.detectChanges();
      const sendBtn = q('[data-testid="chat-send-btn"]') as HTMLButtonElement;
      expect(sendBtn.disabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // sendMessage interaction
  // ---------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('delegates a trimmed non-empty message to the service and clears input', () => {
      initAndFlushHistory();
      const spy = vi.spyOn(chatService, 'sendMessage');
      component.messageInput.set('  what is mitosis?  ');
      component.sendMessage();
      expect(spy).toHaveBeenCalledWith('what is mitosis?');
      expect(component.messageInput()).toBe('');
    });

    it('does nothing when the message is only whitespace', () => {
      initAndFlushHistory();
      const spy = vi.spyOn(chatService, 'sendMessage');
      component.messageInput.set('   ');
      component.sendMessage();
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not send when the service is already streaming', () => {
      initAndFlushHistory();
      const spy = vi.spyOn(chatService, 'sendMessage');
      (
        chatService as unknown as {
          _chatState: { set: (v: unknown) => void };
        }
      )._chatState.set({ status: 'streaming' });
      component.messageInput.set('queued question');
      component.sendMessage();
      expect(spy).not.toHaveBeenCalled();
      // Input is NOT cleared on the streaming short-circuit.
      expect(component.messageInput()).toBe('queued question');
    });

    it('drives the real service: appends learner + streaming bubbles and posts', () => {
      initAndFlushHistory();
      component.messageInput.set('explain');
      component.sendMessage();

      const post = httpMock.expectOne(`${BFF}/api/v1/familiar/chat`);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ content: 'explain' });
      post.flush({ stream_url: 'https://stream.example/abc' });

      // learner echo + streaming familiar placeholder.
      expect(component.messages().length).toBe(2);
      expect(component.messages()[0].role).toBe('learner');
      expect(component.messages()[1].is_streaming).toBe(true);
      expect(component.isStreaming()).toBe(true);
      expect(component.isLastMessageStreaming()).toBe(true);

      // SSE token + done complete the streaming turn.
      const es = FakeEventSource.instances[0];
      expect(es.url).toBe('https://stream.example/abc');
      es.emit('token', 'partial answer');
      es.emit('done', JSON.stringify({ citations: [] }));
      fixture.detectChanges();

      expect(component.isLastMessageStreaming()).toBe(false);
      expect(component.messages()[1].content).toBe('partial answer');
      expect(es.closed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // onKeyEnter
  // ---------------------------------------------------------------------------

  describe('onKeyEnter', () => {
    it('prevents default and sends the current input', () => {
      initAndFlushHistory();
      const sendSpy = vi.spyOn(component, 'sendMessage');
      component.messageInput.set('via enter');
      const evt = new Event('keydown');
      const preventSpy = vi.spyOn(evt, 'preventDefault');
      component.onKeyEnter(evt);
      expect(preventSpy).toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // signal/computed-ish helpers
  // ---------------------------------------------------------------------------

  describe('state helpers', () => {
    it('isStreaming reflects the service chat state', () => {
      initAndFlushHistory();
      expect(component.isStreaming()).toBe(false);
      (
        chatService as unknown as {
          _chatState: { set: (v: unknown) => void };
        }
      )._chatState.set({ status: 'streaming' });
      expect(component.isStreaming()).toBe(true);
    });

    it('isLastMessageStreaming is false when there are no messages', () => {
      initAndFlushHistory();
      expect(component.messages().length).toBe(0);
      expect(component.isLastMessageStreaming()).toBe(false);
    });

    it('isLastMessageStreaming is false when the last message is not streaming', () => {
      initAndFlushHistory([
        makeMessage({ id: 'a', is_streaming: true }),
        makeMessage({ id: 'b', is_streaming: false }),
      ]);
      expect(component.isLastMessageStreaming()).toBe(false);
    });

    it('isLastMessageStreaming is true when the last message is streaming', () => {
      initAndFlushHistory([
        makeMessage({ id: 'a', is_streaming: false }),
        makeMessage({ id: 'b', is_streaming: true }),
      ]);
      expect(component.isLastMessageStreaming()).toBe(true);
    });

    it('messages and chatState getters proxy the service signals', () => {
      initAndFlushHistory();
      expect(component.messages).toBe(chatService.messages);
      expect(component.chatState).toBe(chatService.chatState);
    });

    it('trackByMessageId returns the message id', () => {
      initAndFlushHistory();
      expect(component.trackByMessageId(0, makeMessage({ id: 'xyz' }))).toBe('xyz');
    });

    it('onInputChange updates the messageInput signal', () => {
      initAndFlushHistory();
      component.onInputChange('typed value');
      expect(component.messageInput()).toBe('typed value');
    });
  });

  // ---------------------------------------------------------------------------
  // ngOnDestroy
  // ---------------------------------------------------------------------------

  describe('ngOnDestroy', () => {
    it('closes the stream and unsubscribes on destroy', () => {
      initAndFlushHistory();
      const closeSpy = vi.spyOn(chatService, 'closeStream');
      fixture.destroy();
      expect(closeSpy).toHaveBeenCalled();
    });

    it('does not throw when destroyed with no active stream', () => {
      initAndFlushHistory();
      expect(() => fixture.destroy()).not.toThrow();
    });
  });
});
