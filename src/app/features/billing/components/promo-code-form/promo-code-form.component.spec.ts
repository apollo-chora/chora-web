import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { PromoCodeFormComponent } from './promo-code-form.component';
import { BillingService } from '../../services/billing.service';

describe('PromoCodeFormComponent', () => {
  let component: PromoCodeFormComponent;
  let fixture: ComponentFixture<PromoCodeFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromoCodeFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PromoCodeFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="promo-code-form"]');
    expect(el).toBeTruthy();
  });

  it('should have form controls', () => {
    expect(component.codeControl).toBeTruthy();
    expect(component.discountTypeControl).toBeTruthy();
    expect(component.discountValueControl).toBeTruthy();
  });

  it('should validate form as invalid when empty', () => {
    expect(component.isFormValid()).toBe(false);
  });

  it('should detect percentage max error', () => {
    component.form.patchValue({ discount_type: 'percentage', discount_value: 150 });
    expect(component.hasPercentageMaxError()).toBe(true);
  });

  it('should detect date range error', () => {
    component.form.patchValue({ valid_from: '2026-12-31', valid_until: '2026-01-01' });
    expect(component.hasDateRangeError()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Discount-value wire unit (P0 financial — CHO UX audit)
  //
  // The whole billing module stores money as CENTS on the wire and
  // PromoCodeManager.discountDisplay divides fixed_amount by 100 to render
  // dollars. So a $10 fixed-amount discount MUST be sent as 1000 cents — then
  // the list renders 1000 / 100 = $10.00. Sending the raw dollar value (10)
  // makes the list show $0.10. Percentage is NOT money: a 15% discount is sent
  // as the whole number 15 and rendered as "15%" (no ×100).
  // ---------------------------------------------------------------------------

  function fillValidForm(
    overrides: Partial<{ discount_type: string; discount_value: number }>,
  ): void {
    component.form.patchValue({
      code: 'SAVE',
      discount_type: 'fixed_amount',
      discount_value: 0,
      valid_from: '2026-01-01',
      valid_until: '2026-12-31',
      max_redemptions: 5,
      ...overrides,
    });
  }

  it('sends a $10 fixed-amount discount as 1000 cents (so the list shows $10.00)', () => {
    const billing = TestBed.inject(BillingService);
    const spy = vi.spyOn(billing, 'createPromoCode').mockReturnValue(of(null));

    fillValidForm({ discount_type: 'fixed_amount', discount_value: 10 });
    component.onSubmit();

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ discount_type: 'fixed_amount', discount_value: 1000 }),
    );
  });

  it('sends a 15% percentage discount unchanged (whole number, not ×100)', () => {
    const billing = TestBed.inject(BillingService);
    const spy = vi.spyOn(billing, 'createPromoCode').mockReturnValue(of(null));

    fillValidForm({ discount_type: 'percentage', discount_value: 15 });
    component.onSubmit();

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ discount_type: 'percentage', discount_value: 15 }),
    );
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
