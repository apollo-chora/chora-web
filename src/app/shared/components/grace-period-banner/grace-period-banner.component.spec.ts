import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { GracePeriodBannerComponent } from './grace-period-banner.component';

describe('GracePeriodBannerComponent', () => {
  let fixture: ComponentFixture<GracePeriodBannerComponent>;
  let component: GracePeriodBannerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GracePeriodBannerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
  });

  afterEach(() => {
    fixture?.destroy();
  });

  function createComponent(
    type: 'account' | 'tenant',
    deadline: Date,
    onCancel: () => void = vi.fn(),
  ): void {
    fixture = TestBed.createComponent(GracePeriodBannerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('type', type);
    fixture.componentRef.setInput('deadline', deadline);
    fixture.componentRef.setInput('onCancel', onCancel);
    fixture.detectChanges();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('creates the component', () => {
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate);
    expect(component).toBeTruthy();
  });

  it('renders the banner when deadline is in the future', () => {
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate);
    const banner = fixture.nativeElement.querySelector('[data-testid="grace-period-banner"]');
    expect(banner).toBeTruthy();
  });

  it('does not render when deadline has passed', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    createComponent('account', pastDate);
    const banner = fixture.nativeElement.querySelector('[data-testid="grace-period-banner"]');
    expect(banner).toBeNull();
  });

  it('displays the days remaining', () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate);
    const days = fixture.nativeElement.querySelector('[data-testid="grace-period-days"]');
    expect(days).toBeTruthy();
    expect(Number(days.textContent.trim())).toBeGreaterThanOrEqual(9);
  });

  it('shows warning icon', () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate);
    const icon = fixture.nativeElement.querySelector('[data-testid="grace-period-icon"]');
    expect(icon).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Urgency classes
  // -------------------------------------------------------------------------

  it('applies warning class for > 7 days remaining', () => {
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate);
    const banner = fixture.nativeElement.querySelector('[data-testid="grace-period-banner"]');
    expect(banner.classList.contains('grace-period-banner--warning')).toBe(true);
  });

  it('applies urgent class for <= 7 days remaining', () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate);
    const banner = fixture.nativeElement.querySelector('[data-testid="grace-period-banner"]');
    expect(banner.classList.contains('grace-period-banner--urgent')).toBe(true);
  });

  it('applies critical class for <= 3 days remaining', () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate);
    const banner = fixture.nativeElement.querySelector('[data-testid="grace-period-banner"]');
    expect(banner.classList.contains('grace-period-banner--critical')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Cancel action
  // -------------------------------------------------------------------------

  it('calls onCancel when cancel button is clicked', () => {
    const cancelFn = vi.fn();
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate, cancelFn);

    const btn = fixture.nativeElement.querySelector('[data-testid="grace-period-cancel-btn"]');
    btn.click();
    fixture.detectChanges();

    expect(cancelFn).toHaveBeenCalledTimes(1);
  });

  it('shows cancel button with accessible label', () => {
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    createComponent('tenant', futureDate);

    const btn = fixture.nativeElement.querySelector('[data-testid="grace-period-cancel-btn"]');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Type-specific behavior
  // -------------------------------------------------------------------------

  it('works with tenant type', () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    createComponent('tenant', futureDate);
    const banner = fixture.nativeElement.querySelector('[data-testid="grace-period-banner"]');
    expect(banner).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('cleans up interval on destroy', () => {
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    createComponent('account', futureDate);
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    fixture.destroy();
    expect(clearSpy).toHaveBeenCalled();
  });
});
