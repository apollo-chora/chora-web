import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { vi, type Mock } from 'vitest';
import { ErrorRetryComponent } from './error-retry.component';
import { ErrorMessageMapperService } from '../../../core/services/error-message-mapper.service';

// Note: Angular's `fakeAsync(...)` + `tick(...)` are NOT used here because
// the @angular/build:unit-test Vitest runner does not wrap test bodies in a
// ProxyZone (Angular's "Expected to be running in 'ProxyZone'" error). Use
// `vi.useFakeTimers()` + `vi.advanceTimersByTime(...)` for setInterval /
// setTimeout-based component tests until Vitest+Angular ProxyZone parity
// is solved. Tracked in docs/TODO-DEVELOPMENT.md.

interface MapperMock {
  mapErrorCode: Mock;
  isRetryable: Mock;
}

describe('ErrorRetryComponent', () => {
  let component: ErrorRetryComponent;
  let fixture: ComponentFixture<ErrorRetryComponent>;
  let mapperSpy: MapperMock;

  beforeEach(async () => {
    mapperSpy = {
      mapErrorCode: vi.fn().mockReturnValue('errors.generic.not_found'),
      isRetryable: vi.fn().mockReturnValue(false),
    };

    await TestBed.configureTestingModule({
      imports: [ErrorRetryComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ErrorMessageMapperService, useValue: mapperSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ErrorRetryComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create', () => {
    fixture.componentRef.setInput('errorCode', 'GENERIC_NOT_FOUND');
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display error message from mapper', () => {
    mapperSpy.mapErrorCode.mockReturnValue('errors.atomic.not_found');
    fixture.componentRef.setInput('errorCode', 'ATOM_NOT_FOUND');
    fixture.detectChanges();

    expect(mapperSpy.mapErrorCode).toHaveBeenCalledWith('ATOM_NOT_FOUND');
    expect(component.messageKey()).toBe('errors.atomic.not_found');
  });

  it('should show retry button for retryable errors', () => {
    mapperSpy.isRetryable.mockReturnValue(true);
    fixture.componentRef.setInput('errorCode', 'GATEWAY_SERVICE_UNAVAILABLE');
    fixture.detectChanges();

    expect(component.isRetryable()).toBe(true);
    const retryButton = fixture.nativeElement.querySelector(
      '.error-retry__button--retry'
    );
    expect(retryButton).toBeTruthy();
  });

  it('should show contact support link for non-retryable errors', () => {
    mapperSpy.isRetryable.mockReturnValue(false);
    fixture.componentRef.setInput('errorCode', 'ATOM_NOT_FOUND');
    fixture.detectChanges();

    expect(component.isRetryable()).toBe(false);
    const supportLink = fixture.nativeElement.querySelector(
      '.error-retry__button--support'
    );
    expect(supportLink).toBeTruthy();
  });

  it('should override retryable from input', () => {
    mapperSpy.isRetryable.mockReturnValue(false);
    fixture.componentRef.setInput('errorCode', 'ATOM_NOT_FOUND');
    fixture.componentRef.setInput('retryable', true);
    fixture.detectChanges();

    expect(component.isRetryable()).toBe(true);
  });

  it('should use exponential backoff for countdown', () => {
    fixture.componentRef.setInput('errorCode', 'GATEWAY_SERVICE_UNAVAILABLE');
    fixture.componentRef.setInput('retryable', true);
    fixture.detectChanges();

    expect(component.backoffDelay()).toBe(1);

    component.retryAttempt.set(1);
    expect(component.backoffDelay()).toBe(2);

    component.retryAttempt.set(3);
    expect(component.backoffDelay()).toBe(8);

    component.retryAttempt.set(7);
    expect(component.backoffDelay()).toBe(60);
  });

  it('should emit retryClicked after countdown completes', () => {
    fixture.componentRef.setInput('errorCode', 'GATEWAY_SERVICE_UNAVAILABLE');
    fixture.componentRef.setInput('retryable', true);
    fixture.detectChanges();

    vi.useFakeTimers();
    const retrySpy = vi.spyOn(component.retryClicked, 'emit');

    component.onRetry();
    expect(component.countdownActive()).toBe(true);

    vi.advanceTimersByTime(1000);

    expect(retrySpy).toHaveBeenCalled();
    expect(component.countdownActive()).toBe(false);
  });

  it('should not allow double-click during countdown', () => {
    fixture.componentRef.setInput('errorCode', 'GATEWAY_SERVICE_UNAVAILABLE');
    fixture.componentRef.setInput('retryable', true);
    fixture.detectChanges();

    vi.useFakeTimers();
    component.onRetry();
    expect(component.countdownActive()).toBe(true);

    component.onRetry();
    expect(component.countdownSeconds()).toBeGreaterThanOrEqual(0);

    vi.advanceTimersByTime(1000);
  });

  it('should reset state via reset()', () => {
    fixture.componentRef.setInput('errorCode', 'GATEWAY_SERVICE_UNAVAILABLE');
    fixture.componentRef.setInput('retryable', true);
    fixture.detectChanges();

    vi.useFakeTimers();
    component.retryAttempt.set(5);
    component.onRetry();
    vi.advanceTimersByTime(500);

    component.reset();
    expect(component.retryAttempt()).toBe(0);
    expect(component.countdownActive()).toBe(false);
    expect(component.countdownSeconds()).toBe(0);
  });

  it('should have correct ARIA attributes', () => {
    fixture.componentRef.setInput('errorCode', 'ATOM_NOT_FOUND');
    fixture.detectChanges();

    const alertDiv = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alertDiv).toBeTruthy();
    expect(alertDiv.getAttribute('aria-live')).toBe('polite');
  });
});
