import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ManaTopupModalComponent } from './mana-topup-modal.component';
import type {
  InsufficientManaUpsell,
  ManaActionCode,
} from '../../../core/services/me-mana.model';

/**
 * ManaTopupModalComponent (Phase B) — pure presentation modal that renders
 * the 402 `InsufficientManaUpsell` block + CTA. Parent owns:
 *   - show/hide (`@if` on the modal in the parent template)
 *   - the actual `mana.topup(...)` BFF call
 *   - whether to open `stripe_checkout_url` in a new tab vs. call topup()
 *
 * Inputs (signal-based):
 *   upsell        — InsufficientManaUpsell (required)
 *   actionCode    — ManaActionCode (required) — drives i18n title context
 *   submitting    — boolean (default false) — disables CTA + shows spinner
 *   errorMessage  — string i18n key (default null) — renders inline error row
 *
 * Outputs:
 *   topupRequested — emits void when CTA clicked
 *   dismissed      — emits void on Cancel / Escape / backdrop click
 *
 * The wave-2 fixture provider pattern is intentionally avoided — the modal
 * is stateless presentation, fully driven by the typed Phase A shape.
 */

function buildUpsell(overrides: Partial<InsufficientManaUpsell> = {}): InsufficientManaUpsell {
  return {
    required_units: 10,
    current_balance_units: 3,
    recommended_plan_code: 'standard',
    recommended_topup_units: 100,
    stripe_checkout_url: null,
    ...overrides,
  };
}

function setupHarness(
  upsell: InsufficientManaUpsell,
  actionCode: ManaActionCode = 'question_authoring_ai_draft',
  submitting = false,
  errorMessage: string | null = null,
): { fixture: ComponentFixture<ManaTopupModalComponent>; element: HTMLElement } {
  const fixture = TestBed.createComponent(ManaTopupModalComponent);
  fixture.componentRef.setInput('upsell', upsell);
  fixture.componentRef.setInput('actionCode', actionCode);
  fixture.componentRef.setInput('submitting', submitting);
  fixture.componentRef.setInput('errorMessage', errorMessage);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('ManaTopupModalComponent (Phase B — Mana-priced upsell)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManaTopupModalComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  describe('a11y + structure', () => {
    it('renders the dialog with role=dialog + aria-modal=true', () => {
      const { element } = setupHarness(buildUpsell());
      const dialog = element.querySelector('[data-testid="mana-topup-modal"]');
      expect(dialog).toBeTruthy();
      expect(dialog?.getAttribute('role')).toBe('dialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
    });

    it('has aria-labelledby pointing to title id', () => {
      const { element } = setupHarness(buildUpsell());
      const dialog = element.querySelector('[data-testid="mana-topup-modal"]');
      const labelledBy = dialog?.getAttribute('aria-labelledby');
      expect(labelledBy).toBe('mana-topup-modal-title');
      expect(element.querySelector(`#${labelledBy}`)).toBeTruthy();
    });

    it('has aria-describedby pointing to message id', () => {
      const { element } = setupHarness(buildUpsell());
      const dialog = element.querySelector('[data-testid="mana-topup-modal"]');
      const describedBy = dialog?.getAttribute('aria-describedby');
      expect(describedBy).toBe('mana-topup-modal-message');
      expect(element.querySelector(`#${describedBy}`)).toBeTruthy();
    });

    it('renders the backdrop', () => {
      const { element } = setupHarness(buildUpsell());
      expect(element.querySelector('[data-testid="mana-topup-modal-backdrop"]')).toBeTruthy();
    });
  });

  describe('upsell rendering', () => {
    it('displays required_units in the message', () => {
      const { element } = setupHarness(buildUpsell({ required_units: 50 }));
      const message = element.querySelector('[data-testid="mana-topup-modal-required"]');
      expect(message?.textContent).toContain('50');
    });

    it('displays current_balance_units in the message', () => {
      const { element } = setupHarness(buildUpsell({ current_balance_units: 7 }));
      const message = element.querySelector('[data-testid="mana-topup-modal-balance"]');
      expect(message?.textContent).toContain('7');
    });

    it('displays the computed gap (required - balance)', () => {
      const { element } = setupHarness(
        buildUpsell({ required_units: 100, current_balance_units: 30 }),
      );
      const gap = element.querySelector('[data-testid="mana-topup-modal-gap"]');
      expect(gap?.textContent).toContain('70');
    });

    it('shows recommended_topup_units when present', () => {
      const { element } = setupHarness(buildUpsell({ recommended_topup_units: 250 }));
      const rec = element.querySelector('[data-testid="mana-topup-modal-recommended-units"]');
      expect(rec?.textContent).toContain('250');
    });

    it('omits recommended-units row when recommended_topup_units is null', () => {
      const { element } = setupHarness(buildUpsell({ recommended_topup_units: null }));
      expect(
        element.querySelector('[data-testid="mana-topup-modal-recommended-units"]'),
      ).toBeNull();
    });

    it('shows recommended_plan_code when present', () => {
      const { element } = setupHarness(buildUpsell({ recommended_plan_code: 'premium' }));
      const rec = element.querySelector('[data-testid="mana-topup-modal-recommended-plan"]');
      expect(rec?.textContent).toContain('premium');
    });

    it('omits recommended-plan row when recommended_plan_code is null', () => {
      const { element } = setupHarness(buildUpsell({ recommended_plan_code: null }));
      expect(
        element.querySelector('[data-testid="mana-topup-modal-recommended-plan"]'),
      ).toBeNull();
    });
  });

  describe('CTA variant by stripe_checkout_url', () => {
    it('shows "continue to Stripe" CTA when stripe_checkout_url is present', () => {
      const { element } = setupHarness(
        buildUpsell({ stripe_checkout_url: 'https://checkout.stripe.com/sess_123' }),
      );
      const cta = element.querySelector('[data-testid="mana-topup-modal-confirm"]');
      expect(cta?.textContent).toContain('core.mana.topup_modal.cta_stripe');
    });

    it('shows generic "top up" CTA when stripe_checkout_url is null', () => {
      const { element } = setupHarness(buildUpsell({ stripe_checkout_url: null }));
      const cta = element.querySelector('[data-testid="mana-topup-modal-confirm"]');
      expect(cta?.textContent).toContain('core.mana.topup_modal.cta_topup');
    });
  });

  describe('CTA disabled / spinner', () => {
    it('disables CTA when submitting=true', () => {
      const { element } = setupHarness(buildUpsell(), undefined, true);
      const cta = element.querySelector(
        '[data-testid="mana-topup-modal-confirm"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });

    it('disables Cancel when submitting=true', () => {
      const { element } = setupHarness(buildUpsell(), undefined, true);
      const cancel = element.querySelector(
        '[data-testid="mana-topup-modal-cancel"]',
      ) as HTMLButtonElement;
      expect(cancel.disabled).toBe(true);
    });

    it('shows spinner element when submitting=true', () => {
      const { element } = setupHarness(buildUpsell(), undefined, true);
      expect(element.querySelector('[data-testid="mana-topup-modal-spinner"]')).toBeTruthy();
    });

    it('does NOT render spinner when submitting=false', () => {
      const { element } = setupHarness(buildUpsell(), undefined, false);
      expect(element.querySelector('[data-testid="mana-topup-modal-spinner"]')).toBeNull();
    });

    it('enables CTA when submitting=false (default)', () => {
      const { element } = setupHarness(buildUpsell());
      const cta = element.querySelector(
        '[data-testid="mana-topup-modal-confirm"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(false);
    });
  });

  describe('inline error row', () => {
    it('shows error row with i18n key when errorMessage is set', () => {
      const { element } = setupHarness(
        buildUpsell(),
        undefined,
        false,
        'core.mana.topup_error_validation',
      );
      const err = element.querySelector('[data-testid="mana-topup-modal-error"]');
      expect(err).toBeTruthy();
      expect(err?.textContent).toContain('core.mana.topup_error_validation');
    });

    it('error row has role=alert for a11y', () => {
      const { element } = setupHarness(
        buildUpsell(),
        undefined,
        false,
        'core.mana.topup_error_upstream',
      );
      const err = element.querySelector('[data-testid="mana-topup-modal-error"]');
      expect(err?.getAttribute('role')).toBe('alert');
    });

    it('omits error row when errorMessage is null', () => {
      const { element } = setupHarness(buildUpsell());
      expect(element.querySelector('[data-testid="mana-topup-modal-error"]')).toBeNull();
    });
  });

  describe('output events', () => {
    it('emits topupRequested when CTA is clicked', () => {
      const { fixture, element } = setupHarness(buildUpsell());
      const spy = vi.fn();
      fixture.componentInstance.topupRequested.subscribe(spy);
      (
        element.querySelector(
          '[data-testid="mana-topup-modal-confirm"]',
        ) as HTMLButtonElement
      ).click();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does NOT emit topupRequested when CTA is disabled (submitting=true)', () => {
      const { fixture, element } = setupHarness(buildUpsell(), undefined, true);
      const spy = vi.fn();
      fixture.componentInstance.topupRequested.subscribe(spy);
      (
        element.querySelector(
          '[data-testid="mana-topup-modal-confirm"]',
        ) as HTMLButtonElement
      ).click();
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits dismissed when Cancel button is clicked', () => {
      const { fixture, element } = setupHarness(buildUpsell());
      const spy = vi.fn();
      fixture.componentInstance.dismissed.subscribe(spy);
      (
        element.querySelector(
          '[data-testid="mana-topup-modal-cancel"]',
        ) as HTMLButtonElement
      ).click();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('emits dismissed when backdrop is clicked', () => {
      const { fixture, element } = setupHarness(buildUpsell());
      const spy = vi.fn();
      fixture.componentInstance.dismissed.subscribe(spy);
      (
        element.querySelector(
          '[data-testid="mana-topup-modal-backdrop"]',
        ) as HTMLElement
      ).click();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('emits dismissed on Escape keydown', () => {
      const { fixture, element } = setupHarness(buildUpsell());
      const spy = vi.fn();
      fixture.componentInstance.dismissed.subscribe(spy);
      const backdrop = element.querySelector(
        '[data-testid="mana-topup-modal-backdrop"]',
      ) as HTMLElement;
      backdrop.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does NOT propagate click from dialog content to backdrop', () => {
      const { fixture, element } = setupHarness(buildUpsell());
      const dismissedSpy = vi.fn();
      fixture.componentInstance.dismissed.subscribe(dismissedSpy);
      const dialog = element.querySelector(
        '[data-testid="mana-topup-modal"]',
      ) as HTMLElement;
      dialog.click();
      expect(dismissedSpy).not.toHaveBeenCalled();
    });

    it('does NOT emit dismissed on Cancel when submitting=true', () => {
      const { fixture, element } = setupHarness(buildUpsell(), undefined, true);
      const spy = vi.fn();
      fixture.componentInstance.dismissed.subscribe(spy);
      (
        element.querySelector(
          '[data-testid="mana-topup-modal-cancel"]',
        ) as HTMLButtonElement
      ).click();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
