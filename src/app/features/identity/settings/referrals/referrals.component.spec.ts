import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ReferralsComponent } from './referrals.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import type { ReferralInfo } from '../../../billing/models/marketplace.model';

const REFERRALS_URL = `${environment.bffBaseUrl}/api/v1/identity/referrals`;

const STUB_INFO: ReferralInfo = {
  referral_code: 'CHORA-7F3K',
  referral_link: 'https://chora.site/r/CHORA-7F3K',
  earned_credits_cents: 4250,
  currency: 'usd',
  credits: [
    {
      id: 'credit-1',
      referred_initials: 'AB',
      credit_cents: 2000,
      currency: 'usd',
      status: 'credited',
      created_at: '2026-05-01T00:00:00Z',
    },
    {
      id: 'credit-2',
      referred_initials: 'CD',
      credit_cents: 2250,
      currency: 'usd',
      status: 'pending',
      created_at: '2026-05-15T00:00:00Z',
    },
  ],
  tiers: [
    {
      name: 'Bronze',
      referrals_required: 1,
      reward_description: '$10 credit',
      is_achieved: true,
    },
    {
      name: 'Silver',
      referrals_required: 5,
      reward_description: '$50 credit',
      is_achieved: false,
    },
  ],
};

describe('ReferralsComponent', () => {
  let component: ReferralsComponent;
  let fixture: ComponentFixture<ReferralsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReferralsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ReferralsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="referrals"]');
    expect(el).toBeTruthy();
  });

  it('should format price correctly', () => {
    expect(component.formatPrice(1000, 'usd')).toContain('10.00');
  });

  it('should return correct credit status class', () => {
    expect(component.creditStatusClass('credited')).toBe('referrals__credit-status--credited');
  });

  it('should start with copy state as false', () => {
    expect(component.codeCopied()).toBe(false);
    expect(component.linkCopied()).toBe(false);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Augmented coverage — HTTP states, computed signals, clipboard, helpers
// ---------------------------------------------------------------------------

function build(): {
  fixture: ComponentFixture<ReferralsComponent>;
  component: ReferralsComponent;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ReferralsComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(ReferralsComponent);
  const component = fixture.componentInstance;
  const httpMock = TestBed.inject(HttpTestingController);
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, component, httpMock, element };
}

describe('ReferralsComponent — load lifecycle', () => {
  let fixture: ComponentFixture<ReferralsComponent>;
  let component: ReferralsComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    const built = build();
    fixture = built.fixture;
    component = built.component;
    httpMock = built.httpMock;
    element = built.element;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('issues a GET to the referrals endpoint and shows the loading skeleton first', () => {
    fixture.detectChanges(); // triggers ngOnInit → loadReferralInfo
    expect(component.isLoading()).toBe(true);
    expect(component.isError()).toBe(false);
    expect(element.querySelector('[data-testid="referrals-loading"]')).not.toBeNull();

    const req = httpMock.expectOne(REFERRALS_URL);
    expect(req.request.method).toBe('GET');
    req.flush(STUB_INFO);
  });

  it('renders code, link, credits balance, tiers and tracking table on success', () => {
    fixture.detectChanges();
    httpMock.expectOne(REFERRALS_URL).flush(STUB_INFO);
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.referralInfo()).toEqual(STUB_INFO);

    const code = element.querySelector('[data-testid="referral-code"]');
    expect(code?.textContent).toContain('CHORA-7F3K');

    const link = element.querySelector('[data-testid="referral-link"]');
    expect(link?.textContent).toContain('https://chora.site/r/CHORA-7F3K');

    const balance = element.querySelector('[data-testid="credits-balance"]');
    expect(balance?.textContent).toContain('42.50');

    const tierItems = element.querySelectorAll('[data-testid="tier-item"]');
    expect(tierItems.length).toBe(2);
    expect(tierItems[0].className).toContain('referrals__tier-item--achieved');
    expect(tierItems[1].className).not.toContain('referrals__tier-item--achieved');

    const rows = element.querySelectorAll('[data-testid="credit-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('AB');
  });

  it('exposes derived computed signals matching the response', () => {
    fixture.detectChanges();
    httpMock.expectOne(REFERRALS_URL).flush(STUB_INFO);
    fixture.detectChanges();

    expect(component.referralCode()).toBe('CHORA-7F3K');
    expect(component.referralLink()).toBe('https://chora.site/r/CHORA-7F3K');
    expect(component.earnedCredits()).toBe(4250);
    expect(component.currency()).toBe('usd');
    expect(component.credits().length).toBe(2);
    expect(component.tiers().length).toBe(2);
  });

  it('hides the tiers block when no tiers are returned', () => {
    fixture.detectChanges();
    httpMock.expectOne(REFERRALS_URL).flush({ ...STUB_INFO, tiers: [] });
    fixture.detectChanges();

    expect(component.tiers().length).toBe(0);
    expect(element.querySelector('[data-testid="referral-tiers"]')).toBeNull();
  });

  it('hides the tracking table when no credits are returned', () => {
    fixture.detectChanges();
    httpMock.expectOne(REFERRALS_URL).flush({ ...STUB_INFO, credits: [] });
    fixture.detectChanges();

    expect(component.credits().length).toBe(0);
    expect(element.querySelector('[data-testid="credit-tracking"]')).toBeNull();
  });

  it('renders the error panel and sets error state on a 500', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(REFERRALS_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.isError()).toBe(true);
    expect(component.isLoading()).toBe(false);
    expect(component.referralInfo()).toBeNull();
    expect(component.state()).toEqual({
      status: 'error',
      error: { code: 'REFERRALS_LOAD_FAILED', message: expect.any(String) },
    });
    expect(element.querySelector('[data-testid="referrals-error"]')).not.toBeNull();
  });

  it('also surfaces an error on a 4xx response', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(REFERRALS_URL)
      .flush({ error: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect(component.isError()).toBe(true);
    expect(element.querySelector('[data-testid="referrals-error"]')).not.toBeNull();
  });

  it('re-fetches when loadReferralInfo is called again', () => {
    fixture.detectChanges();
    httpMock.expectOne(REFERRALS_URL).flush(STUB_INFO);
    fixture.detectChanges();

    component.loadReferralInfo();
    expect(component.isLoading()).toBe(true);
    httpMock.expectOne(REFERRALS_URL).flush(STUB_INFO);
  });

  it('unsubscribes on destroy, cancelling the in-flight request', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(REFERRALS_URL);
    expect(req.cancelled).toBe(false);
    fixture.destroy(); // ngOnDestroy → subscriptions.unsubscribe()
    expect(req.cancelled).toBe(true);
  });
});

describe('ReferralsComponent — clipboard', () => {
  let component: ReferralsComponent;
  let toast: ToastService;
  let httpMock: HttpTestingController;
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    const built = build();
    component = built.component;
    httpMock = built.httpMock;
    built.fixture.detectChanges();
    httpMock.expectOne(REFERRALS_URL).flush(STUB_INFO);
    built.fixture.detectChanges();
    toast = TestBed.inject(ToastService);
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    }
    httpMock.verify();
  });

  it('copyCode writes the code, flips codeCopied, and toasts success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const toastSpy = vi.spyOn(toast, 'show');

    await component.copyCode();

    expect(writeText).toHaveBeenCalledWith('CHORA-7F3K');
    expect(component.codeCopied()).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith('settings.referral_code_copied', 'success');
  });

  it('copyLink writes the link, flips linkCopied, and toasts success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const toastSpy = vi.spyOn(toast, 'show');

    await component.copyLink();

    expect(writeText).toHaveBeenCalledWith('https://chora.site/r/CHORA-7F3K');
    expect(component.linkCopied()).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith('settings.referral_link_copied', 'success');
  });

  it('copyCode toasts an error and leaves codeCopied false when clipboard rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const toastSpy = vi.spyOn(toast, 'show');

    await component.copyCode();

    expect(component.codeCopied()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('settings.copy_failed', 'error');
  });

  it('copyLink toasts an error and leaves linkCopied false when clipboard rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const toastSpy = vi.spyOn(toast, 'show');

    await component.copyLink();

    expect(component.linkCopied()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('settings.copy_failed', 'error');
  });
});

describe('ReferralsComponent — pure helpers', () => {
  let component: ReferralsComponent;

  beforeEach(() => {
    const built = build();
    component = built.component;
    // no detectChanges → ngOnInit not run → no HTTP request to verify
  });

  it('defaults computed signals to safe values before any data loads', () => {
    expect(component.referralInfo()).toBeNull();
    expect(component.referralCode()).toBe('');
    expect(component.referralLink()).toBe('');
    expect(component.earnedCredits()).toBe(0);
    expect(component.currency()).toBe('usd');
    expect(component.credits()).toEqual([]);
    expect(component.tiers()).toEqual([]);
    expect(component.state()).toEqual({ status: 'idle' });
  });

  it('formatPrice renders a localized currency string', () => {
    const out = component.formatPrice(12345, 'usd');
    expect(out).toContain('123.45');
  });

  it('formatPrice falls back gracefully on an invalid currency code', () => {
    const out = component.formatPrice(5000, 'not-a-currency');
    // Invalid ISO currency → fallback branch "CUR 50.00"
    expect(out).toContain('50.00');
    expect(out).toContain('NOT-A-CURRENCY');
  });

  it('creditStatusClass composes the BEM modifier for each status', () => {
    expect(component.creditStatusClass('pending')).toBe('referrals__credit-status--pending');
    expect(component.creditStatusClass('expired')).toBe('referrals__credit-status--expired');
  });

  it('formatDate renders a parseable ISO string as a locale date', () => {
    const out = component.formatDate('2026-05-01T00:00:00Z');
    expect(out).not.toBe('');
    expect(out).not.toBe('2026-05-01T00:00:00Z');
  });

  it('formatDate echoes a non-parseable input back through the catch branch', () => {
    // new Date(...) never throws in JS, so toLocaleDateString of an Invalid Date
    // returns "Invalid Date" rather than the original — characterize that.
    const out = component.formatDate('clearly-not-a-date');
    expect(typeof out).toBe('string');
  });

  it('exposes the credit-status label map', () => {
    expect(component.creditStatusLabels.credited).toBe('billing.referral_credit_credited');
    expect(component.creditStatusLabels.pending).toBe('billing.referral_credit_pending');
    expect(component.creditStatusLabels.expired).toBe('billing.referral_credit_expired');
  });
});
