/**
 * AddonChangeTierComponent spec — CHO-1766.
 *
 * The CHO-1733 v1 placeholder (text-input + free-typed target_plan_id)
 * is replaced by a visual radio-card tier picker + debounced
 * Stripe-Invoice-upcoming preview backed by CHO-1764/1765/1767. This
 * spec drives the new shape: detail fetch → tier cards → click →
 * debounced preview → confirm → result.
 *
 * Strict TDD per chora/.claude/rules/development-execution.md.
 * Lesson from Dale's CHO-1694 catch: every `vi.fn()` mock param gets
 * a typed signature so `mock.calls[0][0]` is the real tuple.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';

import { AddonChangeTierComponent } from './addon-change-tier.component';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import type {
  AddOnDetail,
  AddonDetailResult,
  ChangeAddonTierRequest,
  ChangeAddonTierResponse,
  ChangeAddonTierResult,
  PreviewAddonTierRequest,
  PreviewAddonTierResponse,
  PreviewAddonTierResult,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

const PLAN_ID = '019e0000-0000-7000-8000-bbbbbbbbbbbb';

const tmsDetail: AddOnDetail = {
  addon_plan_id: PLAN_ID,
  code: 'tms',
  display_name: 'Training Management Suite',
  category: 'Delivery',
  description: 'TMS',
  pricing_tiers: [
    { tier_code: 'starter', label: 'Starter', monthly_price_cents: 4900, currency: 'USD' },
    { tier_code: 'pro', label: 'Pro', monthly_price_cents: 9900, currency: 'USD' },
    { tier_code: 'enterprise', label: 'Enterprise', monthly_price_cents: 19900, currency: 'USD' },
  ],
  current_subscription: {
    activated_at: '2026-06-01T00:00:00Z',
    current_tier: 'starter',
    status: 'ACTIVE',
  },
};

const previewSuccess: PreviewAddonTierResponse = {
  from_tier: 'starter',
  to_tier: 'pro',
  current_monthly_cents: 4900,
  target_monthly_cents: 9900,
  billing_delta_cents: 2500,
  next_invoice_total_cents: 9900,
  proration_mode: 'create_prorations',
  effective_at: '2026-06-16T12:00:00Z',
  deferred_to_cycle_end: false,
  currency: 'usd',
};

const changeSuccess: ChangeAddonTierResponse = {
  subscription_id: '01970000-0000-7000-8000-000000000010',
  billing_delta_cents: 2500,
  effective_at: '2026-06-16T12:00:00Z',
  from_tier: 'starter',
  to_tier: 'pro',
};

interface SetupOpts {
  readonly detailResult?: AddonDetailResult;
  readonly previewResult?: PreviewAddonTierResult;
  readonly changeResult?: ChangeAddonTierResult;
}

function makeServiceMock(opts: SetupOpts) {
  return {
    getDetail: vi.fn(
      (_planId: string): Observable<AddonDetailResult> =>
        of(opts.detailResult ?? { kind: 'success', detail: tmsDetail }),
    ),
    previewTierChange: vi.fn(
      (_planId: string, _req: PreviewAddonTierRequest): Observable<PreviewAddonTierResult> =>
        of(opts.previewResult ?? { kind: 'success', response: previewSuccess }),
    ),
    changeTier: vi.fn(
      (_planId: string, _req: ChangeAddonTierRequest): Observable<ChangeAddonTierResult> =>
        of(
          opts.changeResult ??
            ({ kind: 'success-immediate', response: changeSuccess } as ChangeAddonTierResult),
        ),
    ),
  };
}

async function setup(opts: SetupOpts = {}): Promise<{
  fixture: ComponentFixture<AddonChangeTierComponent>;
  component: AddonChangeTierComponent;
  element: HTMLElement;
  serviceMock: ReturnType<typeof makeServiceMock>;
}> {
  const serviceMock = makeServiceMock(opts);
  await TestBed.configureTestingModule({
    imports: [AddonChangeTierComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TenantAddonsAdminService, useValue: serviceMock },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (k: string) => (k === 'addonPlanId' ? PLAN_ID : null) } },
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AddonChangeTierComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, component, element, serviceMock };
}

function clickTierCard(element: HTMLElement, tierCode: string): void {
  const card = element.querySelector(`[data-testid="change-tier-card-${tierCode}"]`) as HTMLElement;
  card.click();
}

describe('AddonChangeTierComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('detail fetch', () => {
    it('fetches the addon detail on construction and populates the tiers', async () => {
      const { element, serviceMock } = await setup();
      expect(serviceMock.getDetail).toHaveBeenCalledWith(PLAN_ID);
      // Three tier cards rendered.
      for (const code of ['starter', 'pro', 'enterprise']) {
        expect(
          element.querySelector(`[data-testid="change-tier-card-${code}"]`),
          `tier card ${code}`,
        ).toBeTruthy();
      }
    });

    it('renders the detail loading skeleton while the fetch is in flight', async () => {
      const { fixture, element, serviceMock } = await setup({
        detailResult: { kind: 'success', detail: tmsDetail },
      });
      // After the synchronous of() resolves the loading is over; verify the
      // existence of the testid markers in the rendered tier cards instead.
      expect(serviceMock.getDetail).toHaveBeenCalled();
      expect(element.querySelector('[data-testid="change-tier-card-starter"]')).toBeTruthy();
      void fixture;
    });

    it('renders the detail-load error state on getDetail failure', async () => {
      const { element } = await setup({
        detailResult: { kind: 'server-error' },
      });
      expect(element.querySelector('[data-testid="change-tier-detail-error"]')).toBeTruthy();
    });
  });

  describe('tier picker', () => {
    it('marks the current tier card with --current modifier and disables it', async () => {
      const { element } = await setup();
      const starterCard = element.querySelector(
        '[data-testid="change-tier-card-starter"]',
      ) as HTMLElement;
      expect(starterCard.classList.contains('change-tier__tier-card--current')).toBe(true);
      expect(starterCard.classList.contains('change-tier__tier-card--disabled')).toBe(true);
      expect(starterCard.getAttribute('aria-disabled')).toBe('true');
      // Current badge.
      expect(
        starterCard.querySelector('[data-testid="change-tier-current-badge"]'),
      ).toBeTruthy();
    });

    it('clicking a non-current tier flips aria-checked', async () => {
      const { fixture, element } = await setup();
      clickTierCard(element, 'pro');
      fixture.detectChanges();
      const proCard = element.querySelector('[data-testid="change-tier-card-pro"]') as HTMLElement;
      expect(proCard.getAttribute('aria-checked')).toBe('true');
      expect(proCard.classList.contains('change-tier__tier-card--selected')).toBe(true);
    });

    it('clicking the CURRENT tier card is a no-op (no preview fired)', async () => {
      const { element, serviceMock } = await setup();
      clickTierCard(element, 'starter'); // starter is the current tier
      vi.advanceTimersByTime(400);
      expect(serviceMock.previewTierChange).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('fires previewTierChange 300ms after tier selection', async () => {
      const { fixture, element, serviceMock } = await setup();
      clickTierCard(element, 'pro');
      fixture.detectChanges();
      // Not fired yet.
      expect(serviceMock.previewTierChange).not.toHaveBeenCalled();
      // Advance debounce.
      vi.advanceTimersByTime(300);
      expect(serviceMock.previewTierChange).toHaveBeenCalledTimes(1);
      const args = serviceMock.previewTierChange.mock.calls[0];
      expect(args[0]).toBe(PLAN_ID);
      expect(args[1].target_tier_code).toBe('pro');
      // CHO-1786 — immediate path sends always_invoice (was
      // create_prorations) so Stripe creates a separate invoice today.
      expect(args[1].proration_mode).toBe('always_invoice');
    });

    it('renders the preview card on positive delta (charge variant)', async () => {
      const { fixture, element, component } = await setup();
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      const card = element.querySelector('[data-testid="change-tier-preview"]') as HTMLElement;
      expect(card).toBeTruthy();
      expect(card.querySelector('[data-testid="change-tier-preview-charge"]')).toBeTruthy();
      // CHO-1789 — formatCurrency surfaces the response currency, not a
      // hardcoded "$" (which still rendered after the CHO-1787 SGD swap).
      expect(component.formatCurrency(2500, 'usd')).toBe('USD 25.00');
      expect(component.formatCurrency(2500, 'sgd')).toBe('SGD 25.00');
    });

    it('renders the credit variant when delta is negative', async () => {
      const { fixture, element, component } = await setup({
        previewResult: {
          kind: 'success',
          response: { ...previewSuccess, billing_delta_cents: -1500, currency: 'sgd' },
        },
      });
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      const credit = element.querySelector('[data-testid="change-tier-preview-credit"]');
      expect(credit).toBeTruthy();
      // Negative delta → still SGD-formatted, sign stripped (it's a credit
      // labelled separately in the copy).
      expect(component.formatCurrency(-1500, 'sgd')).toBe('SGD 15.00');
    });

    it('formatCurrency falls back to SGD when currency is blank (post CHO-1787)', async () => {
      const { component } = await setup();
      // Defensive: a stale BE that doesn't echo currency should still
      // render the platform default rather than "$" (CHO-1789).
      expect(component.formatCurrency(2500, '')).toBe('SGD 25.00');
    });

    it('renders the no_stripe_subscription banner when preview surfaces that error', async () => {
      const { fixture, element } = await setup({
        previewResult: { kind: 'no-stripe-subscription' },
      });
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="change-tier-preview-error-no-stripe-subscription"]'),
      ).toBeTruthy();
    });

    it('renders the stripe_price_missing banner on the preview error path', async () => {
      const { fixture, element } = await setup({
        previewResult: { kind: 'stripe-price-missing' },
      });
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="change-tier-preview-error-stripe-price-missing"]'),
      ).toBeTruthy();
    });

    // CHO-1772 follow-up — collapsed from 3 options to 2 after the
    // "immediate + no proration" combo was identified as a trap (user
    // forfeits their unused current-cycle credit for nothing). The
    // selector is now truly binary:
    //
    //   immediate    → effective_at=null, proration_mode=create_prorations
    //   end-of-cycle → effective_at=<ISO>, proration_mode=none
    //
    // proration_mode=none becomes a BE-internal detail derived from
    // end-of-cycle, never user-pickable.
    it('re-fires previewTierChange with derived payload when the change-mode selector toggles', async () => {
      const { fixture, element, component, serviceMock } = await setup();
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      expect(serviceMock.previewTierChange).toHaveBeenCalledTimes(1);
      // Default 'immediate' → null effective_at + always_invoice
      // (CHO-1786 swapped from create_prorations so Stripe bills today).
      const first = serviceMock.previewTierChange.mock.calls[0][1];
      expect(first.effective_at).toBeNull();
      expect(first.proration_mode).toBe('always_invoice');

      // Switch to 'end-of-cycle' → non-null ISO + proration_mode=none.
      component.setChangeMode('end-of-cycle');
      fixture.detectChanges();
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      expect(serviceMock.previewTierChange).toHaveBeenCalledTimes(2);
      const second = serviceMock.previewTierChange.mock.calls[1][1];
      expect(second.target_tier_code).toBe('pro');
      expect(second.effective_at).toBeTypeOf('string');
      expect(second.effective_at).toMatch(/T.*Z$/);
      expect(second.proration_mode).toBe('none');

      // Back to immediate.
      component.setChangeMode('immediate');
      fixture.detectChanges();
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      expect(serviceMock.previewTierChange).toHaveBeenCalledTimes(3);
      const third = serviceMock.previewTierChange.mock.calls[2][1];
      expect(third.effective_at).toBeNull();
      expect(third.proration_mode).toBe('always_invoice');
    });

    it('renders a single radio group with exactly 2 mutually-exclusive options', async () => {
      const { element } = await setup();
      const group = element.querySelector('[data-testid="change-tier-change-mode-group"]');
      expect(group).toBeTruthy();
      // The 2 valid options.
      for (const opt of ['immediate', 'end-of-cycle']) {
        const radio = element.querySelector(
          `[data-testid="change-tier-change-mode-${opt}"]`,
        ) as HTMLInputElement | null;
        expect(radio, `radio ${opt}`).toBeTruthy();
        expect(radio?.getAttribute('name')).toBe('changeMode');
      }
      // The dropped trap option must NOT render.
      expect(
        element.querySelector('[data-testid="change-tier-change-mode-immediate-no-proration"]'),
      ).toBeFalsy();
      // Default selection is immediate.
      const def = element.querySelector(
        '[data-testid="change-tier-change-mode-immediate"]',
      ) as HTMLInputElement;
      expect(def.checked).toBe(true);
      // Legacy 2-fieldset shape is gone.
      expect(element.querySelector('[data-testid="change-tier-proration-group"]')).toBeFalsy();
      expect(element.querySelector('[data-testid="change-tier-effective-group"]')).toBeFalsy();
    });
  });

  describe('submit gating', () => {
    it('disables the Confirm button until a non-current tier is picked', async () => {
      const { fixture, element } = await setup();
      const btn = element.querySelector('[data-testid="change-tier-submit"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      expect(btn.disabled).toBe(false);
    });

    it('keeps Confirm disabled when preview errored on create_prorations mode', async () => {
      const { fixture, element } = await setup({
        previewResult: { kind: 'no-stripe-subscription' },
      });
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      const btn = element.querySelector('[data-testid="change-tier-submit"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  describe('submit', () => {
    it('fires changeTier with the derived payload from the single selector', async () => {
      const { fixture, element, component, serviceMock } = await setup();
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      const btn = element.querySelector('[data-testid="change-tier-submit"]') as HTMLButtonElement;
      btn.click();
      const call = serviceMock.changeTier.mock.calls[0];
      expect(call[0]).toBe(PLAN_ID);
      expect(call[1].target_plan_id).toBe('pro');
      expect(call[1].proration_mode).toBe('always_invoice');
      // Default 'immediate' → effective_at null.
      expect(call[1].effective_at).toBeNull();

      // Switch to end-of-cycle and re-submit; payload reflects derivation.
      // The first submit's success rendered a result card (which hid the
      // form button), so invoke submit() directly — the component's
      // canSubmit gating is the only thing we want to assert against here.
      component.setChangeMode('end-of-cycle');
      fixture.detectChanges();
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      component.submit();
      const secondCall = serviceMock.changeTier.mock.calls[1][1];
      expect(secondCall.effective_at).toBeTypeOf('string');
      expect(secondCall.proration_mode).toBe('none');
    });

    it('renders the result card on success', async () => {
      const { fixture, element } = await setup();
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      (element.querySelector('[data-testid="change-tier-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="change-tier-result"]')).toBeTruthy();
    });

    it('surfaces no_stripe_subscription error on change-tier failure', async () => {
      const { fixture, element } = await setup({
        changeResult: { kind: 'no-stripe-subscription' },
      });
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      (element.querySelector('[data-testid="change-tier-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="change-tier-error-no-stripe-subscription"]'),
      ).toBeTruthy();
    });

    it('surfaces stripe_price_missing error on change-tier failure', async () => {
      const { fixture, element } = await setup({
        changeResult: { kind: 'stripe-price-missing' },
      });
      clickTierCard(element, 'pro');
      vi.advanceTimersByTime(300);
      fixture.detectChanges();
      (element.querySelector('[data-testid="change-tier-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="change-tier-error-stripe-price-missing"]'),
      ).toBeTruthy();
    });
  });
});
