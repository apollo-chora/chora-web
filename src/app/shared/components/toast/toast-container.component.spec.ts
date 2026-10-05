import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ToastContainerComponent } from './toast-container.component';
import { ToastService } from './toast.service';

describe('ToastContainerComponent', () => {
  let fixture: ComponentFixture<ToastContainerComponent>;
  let element: HTMLElement;
  let toastService: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
      providers: [provideHttpClient()],
    }).compileComponents();

    toastService = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(ToastContainerComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    toastService.dismissAll();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the toast container', () => {
    const container = element.querySelector('[data-testid="toast-container"]');
    expect(container).toBeTruthy();
  });

  it('should have aria-live="polite" on container', () => {
    const container = element.querySelector('[data-testid="toast-container"]');
    expect(container?.getAttribute('aria-live')).toBe('polite');
  });

  it('should have role="log" on container', () => {
    const container = element.querySelector('[data-testid="toast-container"]');
    expect(container?.getAttribute('role')).toBe('log');
  });

  it('should render no toasts initially', () => {
    const toasts = element.querySelectorAll('[role="alert"]');
    expect(toasts.length).toBe(0);
  });

  it('should render a success toast', () => {
    toastService.show('Success message', 'success');
    fixture.detectChanges();

    const toasts = element.querySelectorAll('[role="alert"]');
    expect(toasts.length).toBe(1);
    expect(toasts[0].getAttribute('data-type')).toBe('success');
    expect(toasts[0].textContent).toContain('Success message');
  });

  it('should render an error toast', () => {
    toastService.show('Error message', 'error');
    fixture.detectChanges();

    const toast = element.querySelector('[data-type="error"]');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain('Error message');
  });

  it('should render a warning toast', () => {
    toastService.show('Warning message', 'warning');
    fixture.detectChanges();

    const toast = element.querySelector('[data-type="warning"]');
    expect(toast).toBeTruthy();
  });

  it('should render an info toast', () => {
    toastService.show('Info message', 'info');
    fixture.detectChanges();

    const toast = element.querySelector('[data-type="info"]');
    expect(toast).toBeTruthy();
  });

  it('should render multiple toasts', () => {
    toastService.show('First', 'success');
    toastService.show('Second', 'error');
    toastService.show('Third', 'info');
    fixture.detectChanges();

    const toasts = element.querySelectorAll('[role="alert"]');
    expect(toasts.length).toBe(3);
  });

  it('should remove toast when dismiss button is clicked', () => {
    toastService.show('Dismissable', 'info');
    fixture.detectChanges();

    const dismissBtn = element.querySelector('[data-testid="toast-dismiss"]') as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();

    dismissBtn.click();
    fixture.detectChanges();

    const toasts = element.querySelectorAll('[role="alert"]');
    expect(toasts.length).toBe(0);
  });

  it('should have role="alert" on each toast', () => {
    toastService.show('Alert toast', 'success');
    fixture.detectChanges();

    const toast = element.querySelector('.toast');
    expect(toast?.getAttribute('role')).toBe('alert');
  });

  it('should have dismiss button with aria-label', () => {
    toastService.show('Test', 'info');
    fixture.detectChanges();

    const dismissBtn = element.querySelector('[data-testid="toast-dismiss"]');
    expect(dismissBtn?.getAttribute('aria-label')).toBeTruthy();
  });

  it('should show icon as aria-hidden', () => {
    toastService.show('Test', 'success');
    fixture.detectChanges();

    const icon = element.querySelector('.toast__icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('should auto-dismiss toast after duration', () => {
    vi.useFakeTimers();
    toastService.show('Auto dismiss', 'success');
    fixture.detectChanges();

    expect(element.querySelectorAll('[role="alert"]').length).toBe(1);

    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(element.querySelectorAll('[role="alert"]').length).toBe(0);
    vi.useRealTimers();
  });

  it('should apply correct CSS class for each toast type', () => {
    toastService.show('Success', 'success');
    toastService.show('Error', 'error');
    fixture.detectChanges();

    expect(element.querySelector('.toast--success')).toBeTruthy();
    expect(element.querySelector('.toast--error')).toBeTruthy();
  });
});
