import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AiTransparencyNoticeComponent } from './ai-transparency-notice.component';
import { AiTransparencyService } from '../../../core/services/ai-transparency.service';
import type {
  AiAcknowledgeState,
  AiDisclosure,
} from '../../../core/services/ai-transparency.model';

/**
 * AiTransparencyNoticeComponent (ADR-225) — the one-time first-interaction
 * NOTICE modal. An ACKNOWLEDGEMENT, not a consent gate: a single "Got it"
 * button, NO decline / AI-off / backdrop / Escape dismissal (EU AI Act Art 50 —
 * a mandated disclosure, not a throwaway popup). Renders the BFF-served
 * `disclosure.notice` strings DIRECTLY.
 */

function buildDisclosure(overrides: Partial<AiDisclosure> = {}): AiDisclosure {
  return {
    version: '2026-07-07',
    locale: 'en',
    audienceVariant: 'standard',
    notice: {
      title: 'Meet your AI companion',
      body: 'Your Familiar is powered by AI. Replies may be imperfect — always double-check.',
      action: 'Got it',
    },
    badge: { label: 'AI companion', tooltip: 'Responses here are AI-generated.' },
    inlineLabels: {
      aiGenerated: { label: 'AI-generated', tooltip: 'Created by AI.' },
      aiAssisted: { label: 'AI-assisted', tooltip: 'Drafted with AI help.' },
      doseHeader: { label: 'AI-composed dose', tooltip: 'Composed by AI.' },
    },
    ...overrides,
  };
}

class StubAiTransparencyService {
  readonly disclosure = signal<AiDisclosure | null>(null);
  readonly mustAcknowledge = signal(false);
  readonly ackState = signal<AiAcknowledgeState>({ status: 'idle' });
  ensureLoaded = vi.fn();
  acknowledge = vi.fn();
  clearAckState = vi.fn();
}

function setup(
  configure: (stub: StubAiTransparencyService) => void = () => undefined,
): {
  fixture: ComponentFixture<AiTransparencyNoticeComponent>;
  element: HTMLElement;
  stub: StubAiTransparencyService;
} {
  const stub = new StubAiTransparencyService();
  configure(stub);
  TestBed.configureTestingModule({
    imports: [AiTransparencyNoticeComponent],
    providers: [{ provide: AiTransparencyService, useValue: stub }],
  });
  const fixture = TestBed.createComponent(AiTransparencyNoticeComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, stub };
}

const shown = (stub: StubAiTransparencyService): void => {
  stub.disclosure.set(buildDisclosure());
  stub.mustAcknowledge.set(true);
};

describe('AiTransparencyNoticeComponent (ADR-225 first-interaction notice)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('calls ensureLoaded on init so the disclosure is fetched', () => {
    const { stub } = setup();
    expect(stub.ensureLoaded).toHaveBeenCalled();
  });

  describe('visibility gating', () => {
    it('renders nothing when mustAcknowledge is false', () => {
      const { element } = setup((s) => s.disclosure.set(buildDisclosure()));
      expect(element.querySelector('[data-testid="ai-transparency-notice"]')).toBeNull();
    });

    it('renders nothing when disclosure has not loaded (even if mustAcknowledge true)', () => {
      const { element } = setup((s) => s.mustAcknowledge.set(true));
      expect(element.querySelector('[data-testid="ai-transparency-notice"]')).toBeNull();
    });

    it('renders the modal when mustAcknowledge is true AND disclosure loaded', () => {
      const { fixture, element } = setup(shown);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="ai-transparency-notice"]')).toBeTruthy();
    });
  });

  describe('rendering (BFF strings direct)', () => {
    it('renders the notice title / body / action from the disclosure directly', () => {
      const { fixture, element } = setup(shown);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="ai-transparency-notice-title"]')?.textContent,
      ).toContain('Meet your AI companion');
      expect(
        element.querySelector('[data-testid="ai-transparency-notice-body"]')?.textContent,
      ).toContain('powered by AI');
      expect(
        element.querySelector('[data-testid="ai-transparency-notice-action"]')?.textContent,
      ).toContain('Got it');
    });

    it('is a role=dialog with aria-modal=true and label/description wired', () => {
      const { fixture, element } = setup(shown);
      fixture.detectChanges();
      const dialog = element.querySelector('[data-testid="ai-transparency-notice-dialog"]');
      expect(dialog?.getAttribute('role')).toBe('dialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      const labelledBy = dialog?.getAttribute('aria-labelledby');
      const describedBy = dialog?.getAttribute('aria-describedby');
      expect(element.querySelector(`#${labelledBy}`)).toBeTruthy();
      expect(element.querySelector(`#${describedBy}`)).toBeTruthy();
    });
  });

  describe('acknowledge-only (no decline / no dismissal)', () => {
    it('has NO decline / cancel / close affordance', () => {
      const { fixture, element } = setup(shown);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="ai-transparency-notice-cancel"]')).toBeNull();
      expect(element.querySelector('[data-testid="ai-transparency-notice-close"]')).toBeNull();
      expect(element.querySelector('[data-testid="ai-transparency-notice-decline"]')).toBeNull();
    });

    it('clicking "Got it" acknowledges with the default familiar surface + scope + firstShownAt', () => {
      const { fixture, element, stub } = setup(shown);
      fixture.detectChanges();
      (
        element.querySelector('[data-testid="ai-transparency-notice-action"]') as HTMLButtonElement
      ).click();
      expect(stub.acknowledge).toHaveBeenCalledTimes(1);
      const arg = stub.acknowledge.mock.calls[0][0] as Record<string, string>;
      expect(arg['surface']).toBe('familiar');
      expect(arg['scope']).toBe('familiar_chat');
      expect(typeof arg['firstShownAt']).toBe('string');
    });

    it('forwards custom surface + scope inputs to acknowledge', () => {
      const { fixture, element, stub } = setup(shown);
      fixture.componentRef.setInput('surface', 'aplus');
      fixture.componentRef.setInput('scope', 'daily_dose');
      fixture.detectChanges();
      (
        element.querySelector('[data-testid="ai-transparency-notice-action"]') as HTMLButtonElement
      ).click();
      const arg = stub.acknowledge.mock.calls[0][0] as Record<string, string>;
      expect(arg['surface']).toBe('aplus');
      expect(arg['scope']).toBe('daily_dose');
    });

    it('Escape keydown does NOT acknowledge or close (not a throwaway popup)', () => {
      const { fixture, element, stub } = setup(shown);
      fixture.detectChanges();
      const dialog = element.querySelector(
        '[data-testid="ai-transparency-notice-dialog"]',
      ) as HTMLElement;
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(stub.acknowledge).not.toHaveBeenCalled();
      // Still on screen.
      expect(element.querySelector('[data-testid="ai-transparency-notice"]')).toBeTruthy();
    });

    it('backdrop click does NOT acknowledge or close', () => {
      const { fixture, element, stub } = setup(shown);
      fixture.detectChanges();
      (
        element.querySelector('[data-testid="ai-transparency-notice"]') as HTMLElement
      ).click();
      expect(stub.acknowledge).not.toHaveBeenCalled();
      expect(element.querySelector('[data-testid="ai-transparency-notice"]')).toBeTruthy();
    });
  });

  describe('submit + error states', () => {
    it('disables the action button and shows a spinner while submitting', () => {
      const { fixture, element, stub } = setup(shown);
      stub.ackState.set({ status: 'submitting' });
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="ai-transparency-notice-action"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(element.querySelector('[data-testid="ai-transparency-notice-spinner"]')).toBeTruthy();
    });

    it('does not re-acknowledge while a submit is already in flight', () => {
      const { fixture, element, stub } = setup(shown);
      stub.ackState.set({ status: 'submitting' });
      fixture.detectChanges();
      (
        element.querySelector('[data-testid="ai-transparency-notice-action"]') as HTMLButtonElement
      ).click();
      expect(stub.acknowledge).not.toHaveBeenCalled();
    });

    it('shows a fail-loud error row (role=alert) and keeps the button enabled for retry', () => {
      const { fixture, element, stub } = setup(shown);
      stub.ackState.set({ status: 'error', error: 'core.ai_transparency.ack_error_unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="ai-transparency-notice-error"]');
      expect(err).toBeTruthy();
      expect(err?.getAttribute('role')).toBe('alert');
      const btn = element.querySelector(
        '[data-testid="ai-transparency-notice-action"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('hides the modal once mustAcknowledge flips false (post-acknowledge)', () => {
      const { fixture, element, stub } = setup(shown);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="ai-transparency-notice"]')).toBeTruthy();
      stub.mustAcknowledge.set(false);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="ai-transparency-notice"]')).toBeNull();
    });
  });

  describe('focus management', () => {
    it('moves focus into the dialog panel when the notice becomes visible', async () => {
      const { fixture, element } = setup(shown);
      fixture.detectChanges();
      await Promise.resolve(); // flush the queueMicrotask focus
      const dialog = element.querySelector('[data-testid="ai-transparency-notice-dialog"]');
      expect(document.activeElement).toBe(dialog);
    });

    it('traps forward Tab on the sole action button (wraps within the dialog)', () => {
      const { fixture, element } = setup(shown);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="ai-transparency-notice-action"]',
      ) as HTMLButtonElement;
      btn.focus();
      const dialog = element.querySelector(
        '[data-testid="ai-transparency-notice-dialog"]',
      ) as HTMLElement;
      const ev = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      });
      dialog.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    });

    it('traps Shift+Tab on the sole action button (wraps within the dialog)', () => {
      const { fixture, element } = setup(shown);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="ai-transparency-notice-action"]',
      ) as HTMLButtonElement;
      btn.focus();
      const dialog = element.querySelector(
        '[data-testid="ai-transparency-notice-dialog"]',
      ) as HTMLElement;
      const ev = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      dialog.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
    });

    it('ignores non-Tab, non-Escape keys (no trap, no acknowledge)', () => {
      const { fixture, element, stub } = setup(shown);
      fixture.detectChanges();
      const dialog = element.querySelector(
        '[data-testid="ai-transparency-notice-dialog"]',
      ) as HTMLElement;
      const ev = new KeyboardEvent('keydown', {
        key: 'a',
        bubbles: true,
        cancelable: true,
      });
      dialog.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      expect(stub.acknowledge).not.toHaveBeenCalled();
    });
  });

  describe('a11y', () => {
    it('has no critical/serious axe violations when shown', async () => {
      const { fixture } = setup(shown);
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.length).toBe(0);
    });
  });
});
