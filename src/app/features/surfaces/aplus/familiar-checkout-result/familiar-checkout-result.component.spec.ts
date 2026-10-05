import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { FamiliarCheckoutResultComponent } from './familiar-checkout-result.component';
import { TranslateService } from '../../../../core/services/translate.service';

/**
 * CHO-2028: Stripe Checkout redirects back to
 * /a/companion/marketplace/checkout/{success|cancel} (tenancy
 * STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL). Both legs previously fell
 * through to /not-found. This landing renders the outcome + routes the
 * learner onward (roster for success, marketplace for cancel).
 */
function setup(outcome: 'success' | 'cancel') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [FamiliarCheckoutResultComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { data: { outcome } } },
      },
    ],
  });
  const fx = TestBed.createComponent(FamiliarCheckoutResultComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fx.detectChanges();
  httpMock.match(() => true).forEach((r) =>
    r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' }),
  );
  fx.detectChanges();
  return { fx, el: fx.nativeElement as HTMLElement };
}

describe('FamiliarCheckoutResultComponent (CHO-2028)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders the success outcome with a CTA to the Familiar roster', () => {
    const { el } = setup('success');
    const panel = el.querySelector('[data-testid="aplus-checkout-result"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain(
      'aplus.familiar_checkout.success_title',
    );
    expect(panel?.textContent).toContain('aplus.familiar_checkout.success_sub');
    const cta = el.querySelector(
      '[data-testid="aplus-checkout-success-cta"]',
    ) as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute('href')).toBe('/a/companion');
  });

  it('renders the cancel outcome with a CTA back to the marketplace and no charge messaging', () => {
    const { el } = setup('cancel');
    const panel = el.querySelector('[data-testid="aplus-checkout-result"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain(
      'aplus.familiar_checkout.cancel_title',
    );
    expect(panel?.textContent).toContain('aplus.familiar_checkout.cancel_sub');
    const cta = el.querySelector(
      '[data-testid="aplus-checkout-cancel-cta"]',
    ) as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute('href')).toBe('/a/companion/marketplace');
    // The success CTA must not render on the cancel leg.
    expect(
      el.querySelector('[data-testid="aplus-checkout-success-cta"]'),
    ).toBeNull();
  });
});
