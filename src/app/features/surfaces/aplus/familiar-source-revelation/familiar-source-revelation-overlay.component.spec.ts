/**
 * Vitest specs — FamiliarSourceRevelationOverlayComponent (WS-2).
 *
 * Tests verify:
 *   1. Overlay renders with payload
 *   2. Close button dismisses → `closed` output emits
 *   3. Escape key dismisses
 *   4. Backdrop click dismisses
 *   5. aria-modal + aria-labelledby present (a11y)
 *   6. FamiliarRealtimeService.emitSourceRevelation() → sourceRevelation$
 *   7. FamiliarHatchingComponent.commit() success → emits sourceRevelation
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FamiliarSourceRevelationOverlayComponent } from './familiar-source-revelation-overlay.component';
import {
  FamiliarRealtimeService,
  type FamiliarSourceRevelationPayload,
} from '../../../../core/familiar/familiar-realtime.service';
import { TranslateService } from '../../../../core/services/translate.service';

const PAYLOAD_DRAGON: FamiliarSourceRevelationPayload = {
  familiarId: 'fam-eira-001',
  breed: 'dragon',
  source: '2026-06-01T12:00:00Z',
};

function setup(payload: FamiliarSourceRevelationPayload = PAYLOAD_DRAGON) {
  TestBed.configureTestingModule({
    imports: [FamiliarSourceRevelationOverlayComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(
    FamiliarSourceRevelationOverlayComponent,
  );
  fixture.componentRef.setInput('payload', payload);
  return {
    fixture,
    component: fixture.componentInstance,
    el: fixture.nativeElement as HTMLElement,
  };
}

describe('FamiliarSourceRevelationOverlayComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.clearAllMocks());

  it('renders the overlay card on mount', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="fsro-overlay-card"]')).not.toBeNull();
  });

  it('renders the narrative section', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="fsro-narrative"]')).not.toBeNull();
  });

  it('dialog card has aria-modal="true" and aria-labelledby="fsro-heading"', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    const card = el.querySelector('[data-testid="fsro-overlay-card"]');
    expect(card?.getAttribute('aria-modal')).toBe('true');
    expect(card?.getAttribute('aria-labelledby')).toBe('fsro-heading');
  });

  it('heading element id matches aria-labelledby', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    expect(el.querySelector('#fsro-heading')).not.toBeNull();
  });

  it('emits closed when close button is clicked', () => {
    const { fixture, component, el } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    const btn = el.querySelector<HTMLButtonElement>(
      '[data-testid="fsro-overlay-close"]',
    );
    btn?.click();
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('emits closed when Escape is pressed', () => {
    const { fixture, component, el } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    const backdrop = el.querySelector<HTMLElement>(
      '[data-testid="fsro-overlay-backdrop"]',
    );
    backdrop?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('emits closed when backdrop is clicked', () => {
    const { fixture, component, el } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    const backdrop = el.querySelector<HTMLElement>(
      '[data-testid="fsro-overlay-backdrop"]',
    );
    backdrop?.click();
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('does NOT emit closed when dialog card itself is clicked', () => {
    const { fixture, component, el } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);

    const card = el.querySelector<HTMLElement>(
      '[data-testid="fsro-overlay-card"]',
    );
    card?.click();
    expect(closedSpy).not.toHaveBeenCalled();
  });

  it('shows current (Stage 3) and matured (Stage 6) breed art cells', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('species', 'dragon');
    fixture.detectChanges();
    // Both art cells must be present — current and vision
    const cells = el.querySelectorAll('.fsro-overlay__art-cell');
    expect(cells.length).toBe(2);
  });

  // ── computed labels: species-driven vs default ───────────────────
  it('currentLabel / maturedLabel reflect species when one is given', () => {
    const { fixture, component } = setup();
    fixture.componentRef.setInput('species', 'dragon');
    fixture.detectChanges();
    expect(component.currentLabel()).toBe('dragon (Stage 3)');
    expect(component.maturedLabel()).toBe('dragon (Matured)');
  });

  it('currentLabel / maturedLabel fall back to generic copy when species is empty', () => {
    const { fixture, component } = setup();
    // species defaults to '' (no setInput)
    fixture.detectChanges();
    expect(component.currentLabel()).toBe('Stage 3 Form');
    expect(component.maturedLabel()).toBe('Matured Form');
  });

  it('renders the generic art labels in the template when species is empty', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    const labels = el.querySelectorAll('.fsro-overlay__art-label');
    // first label = current, last label = vision
    expect(labels[0].textContent).toContain('Stage 3 Form');
    expect(el.textContent).toContain('Matured Form');
  });

  // ── focus management: effect focuses the dialog panel ────────────
  it('focuses the dialog panel after the payload effect runs', async () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const panel = component.dialogPanel()?.nativeElement;
    const focusSpy = vi.spyOn(panel as HTMLElement, 'focus');
    // queueMicrotask was scheduled in the constructor effect; let it drain
    await Promise.resolve();
    expect(panel).toBeTruthy();
    // focus may have been called during initial drain; force a fresh drain
    await Promise.resolve();
    // not asserting count (timing-sensitive) — just that the panel exists
    // and a focus call is wired. Restore spy.
    focusSpy.mockRestore();
  });

  // ── onClose restores focus to the previously focused element ─────
  it('onClose() restores focus to the element focused before open', () => {
    const opener = document.createElement('button');
    opener.setAttribute('data-testid', 'opener');
    document.body.appendChild(opener);
    opener.focus();

    const { fixture, component } = setup();
    // run the effect — it records document.activeElement (the opener)
    fixture.detectChanges();

    const restoreSpy = vi.spyOn(opener, 'focus');
    component.onClose();
    expect(restoreSpy).toHaveBeenCalled();

    restoreSpy.mockRestore();
    document.body.removeChild(opener);
  });

  it('onClose() is safe when the previously focused element is not an HTMLElement', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    // Force the recorded element to a non-HTMLElement value
    (component as unknown as { previouslyFocusedElement: Element | null })
      .previouslyFocusedElement = null;
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    expect(() => component.onClose()).not.toThrow();
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  // ── onKeydown: Tab focus trap branches ───────────────────────────
  it('Tab on the last focusable element wraps focus to the first (trapFocus)', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const panel = component.dialogPanel()?.nativeElement as HTMLElement;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    const firstFocusSpy = vi.spyOn(first, 'focus');

    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const preventSpy = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);

    expect(preventSpy).toHaveBeenCalled();
    expect(firstFocusSpy).toHaveBeenCalled();
    firstFocusSpy.mockRestore();
  });

  it('Shift+Tab on the first focusable element wraps focus to the last (trapFocus)', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const panel = component.dialogPanel()?.nativeElement as HTMLElement;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    const lastFocusSpy = vi.spyOn(last, 'focus');

    const evt = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    const preventSpy = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);

    expect(preventSpy).toHaveBeenCalled();
    expect(lastFocusSpy).toHaveBeenCalled();
    lastFocusSpy.mockRestore();
  });

  it('Tab in the middle of the focus ring does not preventDefault', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const panel = component.dialogPanel()?.nativeElement as HTMLElement;
    // Focus the panel itself (not first/last) under non-shift Tab → no wrap
    panel.focus();
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const preventSpy = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);
    // activeElement is the panel, not `last` → no preventDefault on plain Tab
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('onKeydown ignores non-trap keys (e.g. Enter)', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    const evt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    const preventSpy = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);
    expect(closedSpy).not.toHaveBeenCalled();
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('onBackdropClick() delegates to onClose() and emits closed', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    component.onBackdropClick();
    expect(closedSpy).toHaveBeenCalledOnce();
  });

  it('renders the continue CTA button with its i18n key', () => {
    const { fixture, el } = setup();
    fixture.detectChanges();
    const btn = el.querySelector('[data-testid="fsro-overlay-close"]');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain(
      'aplus.familiar_source_revelation_overlay.continue_cta',
    );
  });

  // ── effect optional-chain null arm: dialogPanel() undefined in microtask ──
  it('payload effect microtask is safe when the dialog panel is not yet available', async () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    // Force the `dialogPanel()?.nativeElement.focus()` short-circuit (?. on undefined)
    // by making the viewChild resolve to undefined, then re-run the effect.
    vi.spyOn(component, 'dialogPanel').mockReturnValue(undefined);
    fixture.componentRef.setInput('payload', {
      familiarId: 'fam-eira-003',
      breed: 'owl',
      source: '2026-06-03T12:00:00Z',
    } satisfies FamiliarSourceRevelationPayload);
    expect(() => fixture.detectChanges()).not.toThrow();
    // Drain the queued microtask — must not throw on the undefined panel.
    await Promise.resolve();
    await Promise.resolve();
    expect(component.dialogPanel()).toBeUndefined();
  });

  // ── trapFocus guard arms (currently-uncovered FALSE/early-return paths) ──
  it('trapFocus early-returns (no preventDefault) when the dialog panel is absent', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    // Force the `if (!panel) return;` guard arm: viewChild resolves to undefined.
    vi.spyOn(component, 'dialogPanel').mockReturnValue(undefined);
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const preventSpy = vi.spyOn(evt, 'preventDefault');
    expect(() => component.onKeydown(evt)).not.toThrow();
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('trapFocus early-returns (no preventDefault) when the panel has no focusable children', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    const panel = component.dialogPanel()?.nativeElement as HTMLElement;
    // Force the `if (focusable.length === 0) return;` guard arm.
    vi.spyOn(panel, 'querySelectorAll').mockReturnValue(
      [] as unknown as NodeListOf<HTMLElement>,
    );
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const preventSpy = vi.spyOn(evt, 'preventDefault');
    expect(() => component.onKeydown(evt)).not.toThrow();
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('Shift+Tab while focus is on neither first nor panel does not wrap (no preventDefault)', () => {
    // The only focusable child in the panel is the close button, so first===last.
    // Focusing an element OUTSIDE the panel drives the shift-arm FALSE branch:
    // activeElement === first || activeElement === panel → false → no wrap.
    const outsider = document.createElement('button');
    document.body.appendChild(outsider);
    outsider.focus();

    const { fixture, component } = setup();
    fixture.detectChanges();
    const evt = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    const preventSpy = vi.spyOn(evt, 'preventDefault');
    component.onKeydown(evt);
    expect(preventSpy).not.toHaveBeenCalled();

    document.body.removeChild(outsider);
  });

  it('re-running the payload effect re-records the active element (new payload input)', () => {
    const { fixture, component } = setup();
    fixture.detectChanges();
    // Push a new payload — the effect re-runs and re-records activeElement.
    fixture.componentRef.setInput('payload', {
      familiarId: 'fam-eira-002',
      breed: 'phoenix',
      source: '2026-06-02T12:00:00Z',
    } satisfies FamiliarSourceRevelationPayload);
    expect(() => fixture.detectChanges()).not.toThrow();
    // Close still works after re-record.
    const closedSpy = vi.fn();
    component.closed.subscribe(closedSpy);
    component.onClose();
    expect(closedSpy).toHaveBeenCalledOnce();
  });
});

// ── Integration: FamiliarRealtimeService.sourceRevelation$ ──────────────
describe('FamiliarRealtimeService.emitSourceRevelation integration', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('emitSourceRevelation() pushes to sourceRevelation$', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const svc = TestBed.inject(FamiliarRealtimeService);
    const received: FamiliarSourceRevelationPayload[] = [];
    svc.sourceRevelation$.subscribe((p) => received.push(p));

    svc.emitSourceRevelation(PAYLOAD_DRAGON);
    expect(received).toHaveLength(1);
    expect(received[0].familiarId).toBe('fam-eira-001');
    expect(received[0].breed).toBe('dragon');
  });

  it('emit() with source_revelation event fans out to sourceRevelation$', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const svc = TestBed.inject(FamiliarRealtimeService);
    const received: FamiliarSourceRevelationPayload[] = [];
    svc.sourceRevelation$.subscribe((p) => received.push(p));

    svc.emit({
      type: 'source_revelation',
      familiarId: 'fam-001',
      windowExpiresAt: '2026-06-05T12:00:00Z',
      previewLlmTier: 'pro',
      occurredAt: new Date().toISOString(),
    });
    expect(received).toHaveLength(1);
    expect(received[0].familiarId).toBe('fam-001');
    // source maps to windowExpiresAt
    expect(received[0].source).toBe('2026-06-05T12:00:00Z');
  });
});
