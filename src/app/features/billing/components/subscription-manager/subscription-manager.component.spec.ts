import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SubscriptionManagerComponent } from './subscription-manager.component';
import { environment } from '../../../../../environments/environment';

const SUB_URL = `${environment.bffBaseUrl}/api/v1/billing/subscriptions`;

const ACTIVE_SUB = {
  id: 's1',
  tenant_id: 't1',
  plan_id: 'p1',
  plan_name: 'Pro',
  status: 'active',
  current_period_start: '2026-01-01T00:00:00Z',
  current_period_end: '2026-02-01T00:00:00Z',
  cancel_at_period_end: false,
  created_at: '2026-01-01T00:00:00Z',
};

describe('SubscriptionManagerComponent', () => {
  let component: SubscriptionManagerComponent;
  let fixture: ComponentFixture<SubscriptionManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionManagerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SubscriptionManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="subscription-manager"]');
    expect(el).toBeTruthy();
  });

  it('should format price correctly', () => {
    expect(component.formatPrice(1999, 'usd')).toContain('19.99');
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('active')).toBe('subscription-manager__status--active');
  });

  // ---------------------------------------------------------------------------
  // Price display (P1 trust — CHO UX audit)
  //
  // The price slot used to render the unbound, missing key billing.price_display
  // (a fake "price"). The Subscription DTO carries NO price field, so the slot
  // must render an honest fail-loud state — NEVER a fabricated/placeholder price.
  // ---------------------------------------------------------------------------
  it('never renders the fake billing.price_display placeholder as a price', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(SUB_URL).flush(ACTIVE_SUB); // ngOnInit GET → success state
    fixture.detectChanges();

    const price = fixture.nativeElement.querySelector(
      '[data-testid="subscription-price"]',
    ) as HTMLElement | null;
    expect(price).not.toBeNull();
    const text = price?.textContent?.trim() ?? '';
    // Neither the raw key nor its humanized form ("Price display") may appear.
    expect(text).not.toContain('price_display');
    expect(text).not.toContain('Price display');
    // Honest unavailable state instead — | translate emits the raw key in tests (prod humanizes).
    expect(text).toContain('billing.price_unavailable');
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
