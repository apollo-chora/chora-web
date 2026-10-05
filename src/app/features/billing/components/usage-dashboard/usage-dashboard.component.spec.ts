import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { UsageDashboardComponent } from './usage-dashboard.component';

describe('UsageDashboardComponent', () => {
  let component: UsageDashboardComponent;
  let fixture: ComponentFixture<UsageDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsageDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(UsageDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="usage-dashboard"]');
    expect(el).toBeTruthy();
  });

  it('should default to current period', () => {
    expect(component.selectedPeriod()).toBe('current');
  });

  it('should change period on selection', () => {
    component.onPeriodChange('previous');
    expect(component.selectedPeriod()).toBe('previous');
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
