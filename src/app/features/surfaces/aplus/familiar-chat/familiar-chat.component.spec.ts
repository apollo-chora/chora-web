import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { FamiliarChatComponent } from './familiar-chat.component';
import { FamiliarChatService } from './familiar-chat.service';
import { TranslateService } from '../../../../core/services/translate.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import { FamiliarRealtimeService } from '../../../../core/familiar/familiar-realtime.service';
import { recommendedManaPackSku } from '../../../../core/services/me-mana.model';
import { provideMockAiTransparency } from '../../../../testing/mock-ai-transparency';
import type {
  ChatEvent,
  ChatMessage,
  ChatStreamError,
} from './familiar-chat.model';
import { signal } from '@angular/core';

class StubTranslate {
  instant(key: string): string {
    return key;
  }
}

function buildMeManaStub() {
  return {
    balanceUnits: signal<number | null>(100),
    loadState: signal<{ status: string }>({ status: 'idle' }),
    topupState: signal<{ status: string }>({ status: 'idle' }),
    load: vi.fn(),
    clearTopupState: vi.fn(),
    checkoutMana: vi.fn(),
  };
}

describe('FamiliarChatComponent (Phase J.2 — SSE chat UI)', () => {
  let fixture: ComponentFixture<FamiliarChatComponent>;
  let element: HTMLElement;
  let chatService: { streamChat: ReturnType<typeof vi.fn> };
  let stream$: Subject<ChatEvent>;
  let manaStub: ReturnType<typeof buildMeManaStub>;

  function setup(
    familiarId = 'fam-1',
    queryParams: Record<string, string> = {},
  ): void {
    stream$ = new Subject<ChatEvent>();
    chatService = {
      streamChat: vi.fn().mockReturnValue(stream$.asObservable()),
    };
    manaStub = buildMeManaStub();
    // Allow re-`setup()` within a single test (e.g. demo-slug resolution) —
    // tear down any module instantiated by the beforeEach default setup first.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FamiliarChatComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideMockAiTransparency(),
        { provide: FamiliarChatService, useValue: chatService },
        { provide: TranslateService, useClass: StubTranslate },
        { provide: MeManaService, useValue: manaStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: new Map([['familiarId', familiarId]]),
              queryParamMap: convertToParamMap(queryParams),
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(FamiliarChatComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    setup();
  });

  describe('initial render', () => {
    it('renders the chat region + composer with Send disabled while empty', () => {
      expect(element.querySelector('[data-testid="familiar-chat-region"]')).toBeTruthy();
      const send = element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
    });

    it('does not call streamChat on init', () => {
      expect(chatService.streamChat).not.toHaveBeenCalled();
    });

    it('renders the empty-state hint when no turns are present', () => {
      const empty = element.querySelector('[data-testid="familiar-chat-empty"]');
      expect(empty).toBeTruthy();
    });

    it('renders the mana balance pill', () => {
      const pill = element.querySelector('[data-testid="familiar-chat-mana-pill"]');
      expect(pill?.textContent).toContain('100');
    });
  });

  describe('compose + send', () => {
    it('Send enables once the textarea has non-whitespace content', () => {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'hello familiar';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const send = element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement;
      expect(send.disabled).toBe(false);
    });

    it('clicking Send calls streamChat with familiarId + the trimmed message', () => {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = '  what is the forgetting curve?  ';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement).click();
      expect(chatService.streamChat).toHaveBeenCalledWith('fam-1', {
        message: 'what is the forgetting curve?',
      });
    });

    it('user message appears immediately in the transcript after Send', () => {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'hi';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      const userMsg = element.querySelector(
        '[data-testid="familiar-chat-msg-user-0"]',
      );
      expect(userMsg?.textContent).toContain('hi');
    });

    it('textarea is cleared after Send', () => {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'hi';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(input.value).toBe('');
    });

    it('Send is disabled while a turn is in flight', () => {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'hi';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      // refill while streaming
      input.value = 'second';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const send = element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
    });
  });

  describe('SSE stream consumption', () => {
    function sendMessage(text = 'hi'): void {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('shows a "streaming" indicator after session_open until turn_complete', () => {
      sendMessage();
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="familiar-chat-streaming"]'),
      ).toBeTruthy();
    });

    it('renders each tool_call frame as a tool-pill on the assistant message', () => {
      sendMessage();
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({ type: 'tool_call', tool: 'atom_search', args: {} });
      stream$.next({ type: 'tool_call', tool: 'persona_lookup', args: {} });
      fixture.detectChanges();
      const pills = element.querySelectorAll(
        '[data-testid^="familiar-chat-tool-pill-"]',
      );
      expect(pills.length).toBe(2);
      expect(pills[0].textContent).toContain('atom_search');
      expect(pills[1].textContent).toContain('persona_lookup');
    });

    it('concatenates token frames into the assistant message text in order', () => {
      sendMessage();
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({ type: 'token', text: 'Based ' });
      stream$.next({ type: 'token', text: 'on your ' });
      stream$.next({ type: 'token', text: 'history,' });
      fixture.detectChanges();
      const fam = element.querySelector(
        '[data-testid="familiar-chat-msg-familiar-0"]',
      );
      expect(fam?.textContent).toContain('Based on your history,');
    });

    it('clears the streaming indicator + locks completion meta on turn_complete', () => {
      sendMessage();
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({ type: 'token', text: 'hi back!' });
      stream$.next({
        type: 'turn_complete',
        session_id: 's',
        turn_id: 't',
        output_tokens: 2,
        mana_charged: 5,
        model: 'gemini-2.5-flash-lite',
        finish_reason: 'STOP',
      });
      stream$.complete();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="familiar-chat-streaming"]'),
      ).toBeFalsy();
      const meta = element.querySelector(
        '[data-testid="familiar-chat-completion-0"]',
      );
      expect(meta?.textContent).toContain('5');
      expect(meta?.textContent).toContain('gemini-2.5-flash-lite');
    });

    it('Send re-enables after turn_complete', () => {
      sendMessage();
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({
        type: 'turn_complete',
        session_id: 's',
        turn_id: 't',
        output_tokens: 0,
        mana_charged: 5,
        model: 'm',
      });
      stream$.complete();
      fixture.detectChanges();
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'next';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const send = element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement;
      expect(send.disabled).toBe(false);
    });

    it('renders an `error` frame inline on the assistant message', () => {
      sendMessage();
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({
        type: 'error',
        code: 'GUARDRAIL_BLOCKED',
        message: 'Output blocked by Cloud Model Armor',
      });
      stream$.complete();
      fixture.detectChanges();
      const errEl = element.querySelector(
        '[data-testid="familiar-chat-frame-error-0"]',
      );
      expect(errEl?.textContent).toContain('GUARDRAIL_BLOCKED');
    });
  });

  describe('402 insufficient_mana → topup modal', () => {
    it('opens the topup modal mount with the upsell envelope on stream error', () => {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'hi';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      const upsellError: ChatStreamError = {
        kind: 'insufficient_mana',
        upsell: {
          required_units: 5,
          current_balance_units: 0,
          recommended_plan_code: 'basic',
          recommended_topup_units: 100,
        },
      };
      stream$.error(upsellError);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="familiar-chat-topup-modal-mount"]'),
      ).toBeTruthy();
    });

    it('Send re-enables after 402 (so user can retry after topup)', () => {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'hi';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      stream$.error({
        kind: 'insufficient_mana',
        upsell: {
          required_units: 5,
          current_balance_units: 0,
          recommended_plan_code: null,
          recommended_topup_units: null,
        },
      });
      fixture.detectChanges();
      input.value = 'retry';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const send = element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement;
      expect(send.disabled).toBe(false);
    });
  });

  describe('transport error', () => {
    it('renders an error banner on a transport-kind stream error', () => {
      const input = element.querySelector(
        '[data-testid="familiar-chat-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'hi';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      stream$.error({
        kind: 'transport',
        status: 503,
        code: 'ENGINE_NOT_CONFIGURED',
        message: 'engine env missing',
      });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="familiar-chat-error-banner"]',
      );
      expect(banner?.textContent?.length ?? 0).toBeGreaterThan(0);
    });
  });

  // ── New augmentation coverage (characterization only) ──────────────

  function sendOnce(text = 'hi'): void {
    const input = element.querySelector(
      '[data-testid="familiar-chat-input"]',
    ) as HTMLTextAreaElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (element.querySelector(
      '[data-testid="familiar-chat-send"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  describe('shell + initial wiring', () => {
    it('creates the component instance', () => {
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('calls manaService.load() on construction', () => {
      expect(manaStub.load).toHaveBeenCalled();
    });

    it('renders the heading + cost hint i18n keys', () => {
      const heading = element.querySelector('.familiar-chat__heading');
      expect(heading?.textContent).toContain('aplus.familiar_chat.heading');
      const hint = element.querySelector('.familiar-chat__cost-hint');
      expect(hint?.textContent).toContain('aplus.familiar_chat.cost_hint');
    });

    it('does not render an error banner initially', () => {
      expect(
        element.querySelector('[data-testid="familiar-chat-error-banner"]'),
      ).toBeFalsy();
    });

    it('does not render the topup modal mount initially', () => {
      expect(
        element.querySelector('[data-testid="familiar-chat-topup-modal-mount"]'),
      ).toBeFalsy();
    });

    it('does not render the stage-up overlay slot initially', () => {
      expect(
        element.querySelector('[data-testid="familiar-chat-stage-up-overlay-slot"]'),
      ).toBeFalsy();
    });
  });

  describe('signal/computed outputs', () => {
    it('trimmed() collapses surrounding whitespace from the draft', () => {
      fixture.componentInstance.draft.set('   padded   ');
      expect(fixture.componentInstance.trimmed()).toBe('padded');
    });

    it('canSend() is false when the draft is whitespace only', () => {
      fixture.componentInstance.draft.set('   ');
      expect(fixture.componentInstance.canSend()).toBe(false);
    });

    it('canSend() is true when idle with non-empty trimmed draft', () => {
      fixture.componentInstance.draft.set('go');
      expect(fixture.componentInstance.canSend()).toBe(true);
    });

    it('canSend() allows retry while in the error state', () => {
      fixture.componentInstance.draft.set('retry');
      fixture.componentInstance.turnState.set({
        status: 'error',
        error: 'aplus.familiar_chat.error_generic',
      });
      expect(fixture.componentInstance.canSend()).toBe(true);
    });

    it('composerLocked() is true while sending or streaming, false otherwise', () => {
      const c = fixture.componentInstance;
      c.turnState.set({ status: 'sending' });
      expect(c.composerLocked()).toBe(true);
      c.turnState.set({ status: 'streaming', assistantMessageId: 'a' });
      expect(c.composerLocked()).toBe(true);
      c.turnState.set({ status: 'idle' });
      expect(c.composerLocked()).toBe(false);
    });

    it('isStreaming() mirrors the streaming status', () => {
      const c = fixture.componentInstance;
      expect(c.isStreaming()).toBe(false);
      c.turnState.set({ status: 'streaming', assistantMessageId: 'a' });
      expect(c.isStreaming()).toBe(true);
    });

    it('errorBanner() returns the error key only in the error state', () => {
      const c = fixture.componentInstance;
      expect(c.errorBanner()).toBeNull();
      c.turnState.set({ status: 'error', error: 'some.key' });
      expect(c.errorBanner()).toBe('some.key');
    });

    it('topupModalOpen() flips true once an upsell is set', () => {
      const c = fixture.componentInstance;
      expect(c.topupModalOpen()).toBe(false);
      c.topupUpsell.set({
        required_units: 5,
        current_balance_units: 0,
        recommended_plan_code: null,
        recommended_topup_units: null,
      });
      expect(c.topupModalOpen()).toBe(true);
    });
  });

  describe('familiarId resolution (demo slug → UUID)', () => {
    it('passes a normal UUID-shaped param through unchanged', () => {
      // default setup() used 'fam-1'
      expect(fixture.componentInstance.familiarId).toBe('fam-1');
    });

    it('swaps the legacy eira-001 slug to the seeded UUID', () => {
      setup('eira-001');
      expect(fixture.componentInstance.familiarId).toBe(
        '00000000-0000-7000-8000-00000000e1a0',
      );
    });

    it('streamChat is called with the resolved UUID for the demo slug', () => {
      setup('eira-001');
      sendOnce('hello eira');
      expect(chatService.streamChat).toHaveBeenCalledWith(
        '00000000-0000-7000-8000-00000000e1a0',
        { message: 'hello eira' },
      );
    });
  });

  describe('growth-edge deep-link pre-seed (Phase 2D)', () => {
    it('pre-seeds the draft with the concept when ?concept= is present', () => {
      setup('fam-1', { growth_edge: 'ge-1', concept: 'the forgetting curve' });
      expect(fixture.componentInstance.draft()).toContain(
        'the forgetting curve',
      );
    });

    it('pre-seeds a generic starter when only ?growth_edge= rides along', () => {
      setup('fam-1', { growth_edge: 'ge-1' });
      expect(fixture.componentInstance.draft()).toBe(
        'aplus.familiar_chat.growth_edge_generic',
      );
    });

    it('treats a whitespace-only concept as absent (generic starter)', () => {
      setup('fam-1', { growth_edge: 'ge-1', concept: '   ' });
      expect(fixture.componentInstance.draft()).toBe(
        'aplus.familiar_chat.growth_edge_generic',
      );
    });

    it('leaves the draft empty when no growth-edge params are present', () => {
      setup('fam-1', {});
      expect(fixture.componentInstance.draft()).toBe('');
    });
  });

  describe('turn ordinal + trackBy helpers', () => {
    it('turnOrdinal pairs adjacent user+familiar messages', () => {
      const c = fixture.componentInstance;
      expect(c.turnOrdinal(0)).toBe(0);
      expect(c.turnOrdinal(1)).toBe(0);
      expect(c.turnOrdinal(2)).toBe(1);
      expect(c.turnOrdinal(3)).toBe(1);
    });

    it('trackMessageById returns the message id', () => {
      const c = fixture.componentInstance;
      expect(
        c.trackMessageById(0, { id: 'abc', role: 'user', text: 'x' }),
      ).toBe('abc');
    });

    it('trackToolCall returns the index', () => {
      const c = fixture.componentInstance;
      expect(c.trackToolCall(3, { tool: 'atom_search' })).toBe(3);
    });
  });

  describe('transport error key mapping', () => {
    function errorWith(status: number, code: string): string | null {
      sendOnce('q');
      stream$.error({ kind: 'transport', status, code, message: 'm' });
      fixture.detectChanges();
      return fixture.componentInstance.errorBanner();
    }

    it('maps 404 → error_not_found', () => {
      expect(errorWith(404, 'NOT_FOUND')).toBe(
        'aplus.familiar_chat.error_not_found',
      );
    });

    it('maps 401 → error_unauthorised', () => {
      expect(errorWith(401, 'UNAUTH')).toBe(
        'aplus.familiar_chat.error_unauthorised',
      );
    });

    it('maps 403 → error_unauthorised', () => {
      expect(errorWith(403, 'FORBIDDEN')).toBe(
        'aplus.familiar_chat.error_unauthorised',
      );
    });

    it('maps 500 → error_upstream', () => {
      expect(errorWith(500, 'BOOM')).toBe(
        'aplus.familiar_chat.error_upstream',
      );
    });

    it('maps GATEWAY_UPSTREAM_5XX code → error_upstream', () => {
      expect(errorWith(400, 'GATEWAY_UPSTREAM_5XX')).toBe(
        'aplus.familiar_chat.error_upstream',
      );
    });

    it('maps ENGINE_NOT_CONFIGURED code → error_engine_unavailable', () => {
      expect(errorWith(400, 'ENGINE_NOT_CONFIGURED')).toBe(
        'aplus.familiar_chat.error_engine_unavailable',
      );
    });

    it('falls back to error_generic for an unmapped 4xx', () => {
      expect(errorWith(418, 'TEAPOT')).toBe(
        'aplus.familiar_chat.error_generic',
      );
    });

    it('drops the in-flight assistant placeholder on a transport error', () => {
      sendOnce('q');
      // 2 messages present (user + streaming familiar) before the error.
      expect(fixture.componentInstance.messages().length).toBe(2);
      stream$.error({
        kind: 'transport',
        status: 500,
        code: 'BOOM',
        message: 'm',
      });
      fixture.detectChanges();
      // placeholder removed → only the user message remains.
      expect(fixture.componentInstance.messages().length).toBe(1);
      expect(fixture.componentInstance.messages()[0].role).toBe('user');
    });
  });

  describe('stream complete without turn_complete (defensive settle)', () => {
    it('clears the streaming flag and returns to idle when the stream just completes', () => {
      sendOnce('q');
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({ type: 'token', text: 'partial' });
      stream$.complete();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="familiar-chat-streaming"]'),
      ).toBeFalsy();
      expect(fixture.componentInstance.turnState().status).toBe('idle');
    });

    it('does not clobber an error state on complete', () => {
      sendOnce('q');
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({
        type: 'error',
        code: 'GUARDRAIL_BLOCKED',
        message: 'blocked',
      });
      stream$.complete();
      fixture.detectChanges();
      expect(fixture.componentInstance.turnState().status).toBe('error');
    });
  });

  describe('send() guard', () => {
    it('does nothing when canSend() is false (empty draft)', () => {
      fixture.componentInstance.send();
      expect(chatService.streamChat).not.toHaveBeenCalled();
      expect(fixture.componentInstance.messages().length).toBe(0);
    });
  });

  describe('topup modal handlers', () => {
    function openUpsell(
      recommended_topup_units: number | null = 100,
      required_units = 50,
      current_balance_units = 10,
    ): void {
      fixture.componentInstance.topupUpsell.set({
        required_units,
        current_balance_units,
        recommended_plan_code: 'basic',
        recommended_topup_units,
      });
      fixture.detectChanges();
    }

    it('onTopupDismissed clears the upsell + the mana topup state', () => {
      openUpsell();
      fixture.componentInstance.onTopupDismissed();
      expect(fixture.componentInstance.topupUpsell()).toBeNull();
      expect(manaStub.clearTopupState).toHaveBeenCalled();
    });

    it('onTopupRequested is a no-op when there is no upsell', () => {
      fixture.componentInstance.onTopupRequested();
      expect(manaStub.checkoutMana).not.toHaveBeenCalled();
    });

    it('onTopupRequested checks out the recommended pack sku', () => {
      openUpsell(100);
      fixture.componentInstance.onTopupRequested();
      expect(manaStub.checkoutMana).toHaveBeenCalledWith(
        recommendedManaPackSku(100),
      );
    });

    it('onTopupRequested falls back to the gap when no recommended units', () => {
      openUpsell(null, 50, 10);
      fixture.componentInstance.onTopupRequested();
      // gap = required(50) - balance(10) = 40
      expect(manaStub.checkoutMana).toHaveBeenCalledWith(
        recommendedManaPackSku(40),
      );
    });
  });

  describe('in-chat stage-up overlay (WS-2)', () => {
    it('shows the overlay slot when the realtime service emits a stage transition', () => {
      const realtime = TestBed.inject(FamiliarRealtimeService);
      realtime.emitStageTransition({
        familiarId: 'fam-1',
        fromStage: 1,
        toStage: 2,
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.chatStageUpOverlay()).toEqual({
        familiarId: 'fam-1',
        fromStage: 1,
        toStage: 2,
      });
      expect(
        element.querySelector('[data-testid="familiar-chat-stage-up-overlay-slot"]'),
      ).toBeTruthy();
    });

    it('dismissChatStageUp clears the overlay', () => {
      fixture.componentInstance.chatStageUpOverlay.set({
        familiarId: 'fam-1',
        fromStage: 1,
        toStage: 2,
      });
      fixture.detectChanges();
      fixture.componentInstance.dismissChatStageUp();
      fixture.detectChanges();
      expect(fixture.componentInstance.chatStageUpOverlay()).toBeNull();
      expect(
        element.querySelector('[data-testid="familiar-chat-stage-up-overlay-slot"]'),
      ).toBeFalsy();
    });
  });

  describe('turn_complete reloads mana balance', () => {
    it('calls manaService.load() again after a completed turn', () => {
      manaStub.load.mockClear();
      sendOnce('q');
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({
        type: 'turn_complete',
        session_id: 's',
        turn_id: 't',
        output_tokens: 1,
        mana_charged: 5,
        model: 'm',
        finish_reason: 'STOP',
      });
      stream$.complete();
      fixture.detectChanges();
      expect(manaStub.load).toHaveBeenCalled();
    });
  });

  // ── Residual uncovered branches (characterization) ─────────────────
  describe('residual branch coverage', () => {
    it('onFrame ignores an unrecognised frame type (no if-arm matches)', () => {
      sendOnce('q');
      const c = fixture.componentInstance;
      const beforeStatus = c.turnState().status;
      const beforeAssistant = c.messages()[1].text;
      // None of the session_open/tool_call/token/turn_complete/error arms fire.
      stream$.next({ type: 'heartbeat' } as unknown as ChatEvent);
      fixture.detectChanges();
      expect(c.turnState().status).toBe(beforeStatus);
      expect(c.messages()[1].text).toBe(beforeAssistant);
    });

    it('tool_call falls back to [] when the assistant message has no tool_calls (?? left arm)', () => {
      sendOnce('q');
      const c = fixture.componentInstance;
      // Replace the in-flight assistant message with one whose tool_calls is
      // undefined to drive the `m.tool_calls ?? []` nullish-left fallback.
      const arr = c.messages();
      const assistant = arr[1];
      const stripped: ChatMessage = {
        id: assistant.id,
        role: 'familiar',
        text: assistant.text,
        streaming: true,
        // tool_calls intentionally omitted -> undefined
      };
      c.messages.set([arr[0], stripped]);
      stream$.next({ type: 'tool_call', tool: 'ebbinghaus_state', args: {} });
      fixture.detectChanges();
      const after = c.messages()[1];
      expect(after.tool_calls?.length).toBe(1);
      expect(after.tool_calls?.[0].tool).toBe('ebbinghaus_state');
    });

    it('patchAssistant leaves non-matching messages untouched (map else arm)', () => {
      sendOnce('first');
      const c = fixture.componentInstance;
      // Seed an unrelated message after the in-flight pair; a token frame
      // targets only the streaming assistant id, so this one is returned as-is.
      const bystander: ChatMessage = {
        id: 'bystander-id',
        role: 'user',
        text: 'unrelated',
      };
      c.messages.update((m) => [...m, bystander]);
      stream$.next({
        type: 'session_open',
        session_id: 's',
        turn_id: 't',
        engine_session_id: 'e',
      });
      stream$.next({ type: 'token', text: 'patched' });
      fixture.detectChanges();
      // The assistant (index 1) received the token; the bystander is unchanged.
      expect(c.messages()[1].text).toContain('patched');
      const stillThere = c.messages().find((m) => m.id === 'bystander-id');
      expect(stillThere?.text).toBe('unrelated');
    });

    it('newId falls back to the timestamp form when crypto.randomUUID is unavailable', () => {
      const original = globalThis.crypto;
      // Remove crypto so the `typeof crypto !== "undefined" && ...` guard short-circuits.
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });
      try {
        sendOnce('no-crypto');
        const ids = fixture.componentInstance.messages().map((m) => m.id);
        // Two minted ids, both via the `m-...` fallback path.
        expect(ids.length).toBe(2);
        for (const id of ids) {
          expect(id.startsWith('m-')).toBe(true);
        }
      } finally {
        Object.defineProperty(globalThis, 'crypto', {
          value: original,
          configurable: true,
        });
      }
    });
  });
});

// ──────────────────────────────────────────────────────────────────────
// CHO-2095 — identity header: the chat page names WHICH familiar you are
// talking to (breed art + name + stage chip + back-to-profile), fed from
// the roster read; a roster miss falls back to the generic heading.
// ──────────────────────────────────────────────────────────────────────

import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { of, throwError } from 'rxjs';
import type { FamiliarSummary } from '../../../../core/familiar/familiar-growth.model';

describe('FamiliarChatComponent (CHO-2095 identity header)', () => {
  let fixture: ComponentFixture<FamiliarChatComponent>;
  let element: HTMLElement;

  const EIRA: FamiliarSummary = {
    familiarId: 'fam-1',
    displayName: 'Eira',
    species: 'dragon',
    growthStage: 2,
    shinyVariant: false,
    expCurrent: 12,
    expNextThreshold: 200,
    isActive: true,
  };

  function setupWithRoster(roster: FamiliarSummary[] | Error): void {
    const growthStub = {
      listMyFamiliars: vi.fn(() =>
        roster instanceof Error ? throwError(() => roster) : of(roster),
      ),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FamiliarChatComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideMockAiTransparency(),
        {
          provide: FamiliarChatService,
          useValue: { streamChat: vi.fn().mockReturnValue(new Subject().asObservable()) },
        },
        { provide: TranslateService, useClass: StubTranslate },
        { provide: MeManaService, useValue: buildMeManaStub() },
        { provide: FamiliarGrowthService, useValue: growthStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: new Map([['familiarId', 'fam-1']]),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(FamiliarChatComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  it('renders breed identity + back-to-profile when the familiar is in the roster', () => {
    setupWithRoster([EIRA]);
    const identity = element.querySelector('[data-testid="familiar-chat-identity"]');
    expect(identity).not.toBeNull();
    expect(identity!.textContent).toContain('Eira');
    const back = element.querySelector(
      '[data-testid="familiar-chat-back"]',
    ) as HTMLAnchorElement;
    expect(back).not.toBeNull();
    expect(back.getAttribute('href')).toContain('/a/companion/fam-1');
    expect(
      element.querySelector('[data-testid="familiar-chat-identity-stage"]'),
    ).not.toBeNull();
  });

  it('falls back to the generic heading when the roster misses the familiar', () => {
    setupWithRoster([]);
    expect(
      element.querySelector('[data-testid="familiar-chat-identity"]'),
    ).toBeNull();
    expect(element.querySelector('#familiar-chat-heading')).not.toBeNull();
  });

  it('falls back to the generic heading when the roster read fails (fail-soft identity)', () => {
    setupWithRoster(new Error('bff down'));
    expect(
      element.querySelector('[data-testid="familiar-chat-identity"]'),
    ).toBeNull();
    expect(element.querySelector('#familiar-chat-heading')).not.toBeNull();
  });
});
