/**
 * familiar-chat-grounding.component.spec.ts — CHO-2192 (ADR-231 D4/D5, IMDA D2).
 *
 * The Companion recalls a research note it wrote weeks ago, restates the
 * web-researched claim inside it, and — before this — the learner saw a bare
 * assertion with no source. These specs pin the four states the chat surface owes:
 *
 *   grounded + recorded    → the DURABLE sources, as text (never an expiring link)
 *   grounded + unrecorded  → an honest "we did not record them", never invented
 *   not grounded           → NOTHING (an empty block implies a search that never ran)
 *   attribution ≠ answer   → transparency metadata, visually apart from the prose
 *
 * Deliberately a separate file: the sibling spec is 1000+ lines and a parallel
 * session is live in chora-web.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';

import { FamiliarChatComponent } from './familiar-chat.component';
import { FamiliarChatService } from './familiar-chat.service';
import { TranslateService } from '../../../../core/services/translate.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import { provideMockAiTransparency } from '../../../../testing/mock-ai-transparency';
import type { ChatEvent } from './familiar-chat.model';

class StubTranslate {
  instant(key: string): string {
    return key;
  }
}

describe('FamiliarChatComponent — CHO-2192 grounded attribution on recall', () => {
  let fixture: ComponentFixture<FamiliarChatComponent>;
  let element: HTMLElement;
  let stream$: Subject<ChatEvent>;

  beforeEach(() => {
    stream$ = new Subject<ChatEvent>();
    const chatService = {
      streamChat: vi.fn().mockReturnValue(stream$.asObservable()),
    };
    const manaStub = {
      balanceUnits: signal<number | null>(100),
      loadState: signal({ status: 'idle' }),
      topupState: signal({ status: 'idle' }),
      load: vi.fn(),
      clearTopupState: vi.fn(),
      checkoutMana: vi.fn(),
    };

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
              paramMap: new Map([['familiarId', 'fam-1']]),
              queryParamMap: new Map(),
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(FamiliarChatComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  function sendMessage(text = 'how warm should the egg be?'): void {
    const input = element.querySelector(
      '[data-testid="familiar-chat-input"]',
    ) as HTMLTextAreaElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (
      element.querySelector(
        '[data-testid="familiar-chat-send"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
  }

  /** Drive a full turn, optionally preceded by a grounding frame. */
  function runTurn(grounding?: Partial<ChatEvent>): void {
    sendMessage();
    if (grounding) {
      stream$.next({ type: 'grounding', ...grounding } as ChatEvent);
    }
    stream$.next({
      type: 'session_open',
      session_id: 's',
      turn_id: 't',
      engine_session_id: 'e',
    } as ChatEvent);
    stream$.next({
      type: 'token',
      text: 'An incubating egg sits near 37.5C.',
    } as ChatEvent);
    stream$.next({
      type: 'turn_complete',
      session_id: 's',
      turn_id: 't',
      output_tokens: 9,
      mana_charged: 5,
      model: 'gemini-2.5-flash-lite',
      finish_reason: 'STOP',
    } as ChatEvent);
    fixture.detectChanges();
  }

  // ── THE HEADLINE ──────────────────────────────────────────────────────────

  it('shows the durable sources behind a claim recalled from a research note', () => {
    runTurn({
      citations: [
        { domain: 'cdc.gov', title: 'Incubation basics', snippet: 'near 37.5C' },
      ],
      web_search_queries: ['how warm should an egg be'],
      unrecorded_notes: 0,
    } as Partial<ChatEvent>);

    const block = element.querySelector('[data-testid="grounded-attribution"]');
    expect(
      block,
      'the Companion answered from a web-researched note with NO attribution',
    ).toBeTruthy();

    expect(block?.textContent).toContain('cdc.gov');
    expect(block?.textContent).toContain('Incubation basics');
    // The query the model actually issued — "what did you search", never "what is true".
    expect(block?.textContent).toContain('how warm should an egg be');
  });

  // ── ADR-231 D4: no expiring links, ever ───────────────────────────────────

  it('renders the source as TEXT, never an anchor — the persisted uri expired', () => {
    runTurn({
      citations: [{ domain: 'cdc.gov', title: 'Incubation basics', snippet: '' }],
      web_search_queries: [],
      unrecorded_notes: 0,
    } as Partial<ChatEvent>);

    const block = element.querySelector('[data-testid="grounded-attribution"]');
    expect(block).toBeTruthy();
    // An <a href=""> resolves to the CURRENT PAGE — a source that looks clickable
    // and goes nowhere is the exact dead link D4 exists to prevent.
    expect(
      block?.querySelectorAll('a').length,
      'a persisted citation has no url; it must never render as a link',
    ).toBe(0);
  });

  it('shows NO Google chip — a persisted chip is a wall of expired links', () => {
    runTurn({
      citations: [{ domain: 'cdc.gov', title: '', snippet: '' }],
      web_search_queries: [],
      unrecorded_notes: 0,
    } as Partial<ChatEvent>);

    expect(element.querySelector('[data-testid="grounded-chip"]')).toBeNull();
  });

  // ── No recall, no claim ───────────────────────────────────────────────────

  it('shows NO attribution block at all when the turn recalled no grounded note', () => {
    runTurn(); // no grounding frame — the ordinary case

    expect(
      element.querySelector('[data-testid="grounded-attribution"]'),
      'an empty attribution block would imply a web search that never happened',
    ).toBeNull();
    expect(
      element.querySelector('[data-testid="chat-grounded-unrecorded"]'),
    ).toBeNull();
    // ...and the answer itself still renders.
    expect(element.textContent).toContain('An incubating egg sits near 37.5C.');
  });

  // ── Unrecorded provenance: say so, never invent ───────────────────────────

  it('says the sources were not recorded for a pre-migration note, and invents none', () => {
    runTurn({
      citations: [],
      web_search_queries: [],
      unrecorded_notes: 1,
    } as Partial<ChatEvent>);

    expect(
      element.querySelector('[data-testid="chat-grounded-unrecorded"]'),
      'silence would read as "no web search happened" — the very bug this closes',
    ).toBeTruthy();
    // Nothing fabricated: no sources block, because there are no sources.
    expect(element.querySelector('[data-testid="grounded-sources"]')).toBeNull();
  });

  // ── Transparency metadata, never the answer ───────────────────────────────

  it('keeps the attribution OUT of the answer prose — metadata, not knowledge', () => {
    runTurn({
      citations: [{ domain: 'cdc.gov', title: 'Incubation basics', snippet: '' }],
      web_search_queries: ['how warm should an egg be'],
      unrecorded_notes: 0,
    } as Partial<ChatEvent>);

    // Scope to the FAMILIAR's message — the learner's own message uses the same
    // prose class, and an unscoped selector picks that one up first.
    const prose = element.querySelector(
      '.familiar-chat__msg--familiar .familiar-chat__msg-text',
    );
    expect(prose?.textContent).toContain('An incubating egg sits near 37.5C.');
    // The sources must not be inside the answer paragraph — they are a separate,
    // visually distinct channel. A learner must never read "cdc.gov" as the answer.
    expect(prose?.textContent).not.toContain('cdc.gov');
    expect(prose?.querySelector('[data-testid="grounded-attribution"]')).toBeNull();
  });
});
