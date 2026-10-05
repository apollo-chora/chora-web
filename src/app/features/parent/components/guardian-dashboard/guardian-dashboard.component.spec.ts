import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { GuardianDashboardComponent } from './guardian-dashboard.component';

describe('GuardianDashboardComponent', () => {
  let component: GuardianDashboardComponent;
  let fixture: ComponentFixture<GuardianDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuardianDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(GuardianDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="guardian-dashboard"]');
    expect(el).toBeTruthy();
  });

  it('should have dashboard title', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="dashboard-title"]');
    expect(el).toBeTruthy();
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('active')).toBe('guardian-dashboard__status--active');
    expect(component.statusClass('pending')).toBe('guardian-dashboard__status--pending');
    expect(component.statusClass('revoked')).toBe('guardian-dashboard__status--revoked');
  });

  it('should compute severityClass correctly', () => {
    expect(component.severityClass('info')).toBe('guardian-dashboard__alert-severity--info');
    expect(component.severityClass('critical')).toBe(
      'guardian-dashboard__alert-severity--critical',
    );
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should handle invalid date gracefully', () => {
    const result = component.formatDate('invalid');
    // new Date('invalid').toLocaleDateString() returns 'Invalid Date'
    expect(result).toBe('Invalid Date');
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
