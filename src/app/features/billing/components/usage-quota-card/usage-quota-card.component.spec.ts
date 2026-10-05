import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { UsageQuotaCardComponent } from './usage-quota-card.component';

describe('UsageQuotaCardComponent', () => {
  let component: UsageQuotaCardComponent;
  let fixture: ComponentFixture<UsageQuotaCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsageQuotaCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(UsageQuotaCardComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('resourceType', 'api_calls');
    fixture.componentRef.setInput('currentUsage', 75);
    fixture.componentRef.setInput('limit', 100);
    fixture.componentRef.setInput('unit', 'calls');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="usage-quota-card-api_calls"]');
    expect(el).toBeTruthy();
  });

  it('should compute percentUsed correctly', () => {
    expect(component.percentUsed()).toBe(75);
  });

  it('should not be in warning state at 75%', () => {
    expect(component.isWarning()).toBe(false);
  });

  it('should be in warning state at 80%', () => {
    fixture.componentRef.setInput('currentUsage', 80);
    fixture.detectChanges();
    expect(component.isWarning()).toBe(true);
  });

  it('should be in critical state at 95%', () => {
    fixture.componentRef.setInput('currentUsage', 95);
    fixture.detectChanges();
    expect(component.isCritical()).toBe(true);
  });

  it('should be in overage state at 100%', () => {
    fixture.componentRef.setInput('currentUsage', 100);
    fixture.detectChanges();
    expect(component.isOverage()).toBe(true);
  });

  it('should format usage display', () => {
    expect(component.formatUsage()).toBe('75 / 100 calls');
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
