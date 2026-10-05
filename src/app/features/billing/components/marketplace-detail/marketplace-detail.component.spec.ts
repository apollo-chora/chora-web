import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { MarketplaceDetailComponent } from './marketplace-detail.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';

const ACTIVATE_URL = `${environment.bffBaseUrl}/api/v1/billing/marketplace/test-item-123/activate`;
const LOAD_URL = `${environment.bffBaseUrl}/api/v1/billing/marketplace/test-item-123`;

describe('MarketplaceDetailComponent', () => {
  let component: MarketplaceDetailComponent;
  let fixture: ComponentFixture<MarketplaceDetailComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketplaceDetailComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(MarketplaceDetailComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('itemId', 'test-item-123');
    fixture.detectChanges();
    // ngOnInit fires the detail GET — drain it so per-test HTTP is isolated.
    httpMock.expectOne(LOAD_URL).flush({
      id: 'test-item-123',
      name: 'Pro Add-on',
      description: '',
      long_description: '',
      price_cents: 2999,
      currency: 'usd',
      billing_interval: 'monthly',
      features: [],
      screenshots: [],
      reviews: [],
      average_rating: 0,
      review_count: 0,
      compatibility: [],
      is_active: false,
      created_at: '2026-01-01T00:00:00Z',
    });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="marketplace-detail"]');
    expect(el).toBeTruthy();
  });

  it('should format price correctly', () => {
    expect(component.formatPrice(2999, 'usd')).toContain('29.99');
  });

  it('should generate star array', () => {
    const stars = component.starArray(3);
    expect(stars.length).toBe(5);
    expect(stars.filter((s) => s).length).toBe(3);
  });

  it('should return correct compatibility class', () => {
    expect(component.compatibilityClass('compatible')).toBe(
      'marketplace-detail__compat--compatible',
    );
    expect(component.compatibilityClass('required')).toBe('marketplace-detail__compat--required');
  });

  it('should initialize carousel index at 0', () => {
    expect(component.carouselIndex()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Activation — paid action MUST confirm + give loud feedback (CHO UX audit)
  // ---------------------------------------------------------------------------

  it('asks for confirmation and does NOT purchase when the dialog is declined', async () => {
    const confirm = TestBed.inject(ConfirmDialogService);
    const confirmSpy = vi.spyOn(confirm, 'confirm').mockResolvedValue(false);

    await component.activate();

    expect(confirmSpy).toHaveBeenCalled();
    httpMock.expectNone(ACTIVATE_URL); // no purchase issued
    expect(component.activating()).toBe(false);
  });

  it('purchases and shows a SUCCESS toast when confirmed', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');

    const done = component.activate();
    await Promise.resolve();
    const req = httpMock.expectOne(ACTIVATE_URL);
    expect(req.request.method).toBe('POST');
    req.flush(null);
    await done;

    expect(toastSpy).toHaveBeenCalledWith('billing.activate_success', 'success');
    expect(component.activating()).toBe(false);
  });

  it('shows a loud ERROR toast when the purchase fails (no silent catch)', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');

    const done = component.activate();
    await Promise.resolve();
    httpMock
      .expectOne(ACTIVATE_URL)
      .flush({ error: 'declined' }, { status: 402, statusText: 'Payment Required' });
    await done;

    expect(toastSpy).toHaveBeenCalledWith('billing.activate_error', 'error');
    expect(component.activating()).toBe(false);
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
