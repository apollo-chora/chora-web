import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PromoCodeManagerComponent } from './promo-code-manager.component';
import type { PromoCode } from '../../models/billing.model';

describe('PromoCodeManagerComponent', () => {
  let component: PromoCodeManagerComponent;
  let fixture: ComponentFixture<PromoCodeManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromoCodeManagerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PromoCodeManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="promo-code-manager"]');
    expect(el).toBeTruthy();
  });

  it('should toggle create form', () => {
    expect(component.showCreateForm()).toBe(false);
    component.toggleCreateForm();
    expect(component.showCreateForm()).toBe(true);
    component.toggleCreateForm();
    expect(component.showCreateForm()).toBe(false);
  });

  it('should compute discountDisplay correctly', () => {
    expect(
      component.discountDisplay({ discount_type: 'percentage', discount_value: 20 } as PromoCode),
    ).toBe('20%');
    expect(
      component.discountDisplay({
        discount_type: 'fixed_amount',
        discount_value: 1000,
      } as PromoCode),
    ).toBe('$10.00');
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
