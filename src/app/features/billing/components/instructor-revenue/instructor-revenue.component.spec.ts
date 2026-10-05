import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { InstructorRevenueComponent } from './instructor-revenue.component';

describe('InstructorRevenueComponent', () => {
  let component: InstructorRevenueComponent;
  let fixture: ComponentFixture<InstructorRevenueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InstructorRevenueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(InstructorRevenueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="instructor-revenue"]');
    expect(el).toBeTruthy();
  });

  it('should format price correctly', () => {
    expect(component.formatPrice(15000, 'usd')).toContain('150.00');
  });

  it('should compute bar width correctly', () => {
    // When maxShareAmount is default (1), shareBarWidth returns percentage
    expect(component.shareBarWidth(0)).toBe(0);
  });

  it('should return correct payout status class', () => {
    expect(component.payoutStatusClass('paid')).toBe('instructor-revenue__payout-status--paid');
  });

  it('should format date with null as dash', () => {
    expect(component.formatDate(null)).toBe('-');
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
