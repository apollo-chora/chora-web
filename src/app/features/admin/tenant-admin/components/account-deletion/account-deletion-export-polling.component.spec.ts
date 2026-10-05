// Export-polling coverage for AccountDeletionComponent.
//
// NOTE: this file intentionally does NOT import describe/it/beforeEach/
// afterEach from 'vitest'. src/test-setup.ts patches the vitest GLOBALS to
// run tests inside a ProxyZone; importing the test functions from 'vitest'
// bypasses that patch and Angular `fakeAsync` aborts with
// "Expected to be running in 'ProxyZone', but it was not found." The polling
// flow is timer-driven, so it lives here (globals) instead of inside
// account-deletion.component.spec.ts which imports from 'vitest'.
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { AccountDeletionComponent } from './account-deletion.component';
import { AccountLifecycleService, DataExportRequest } from '../../services/account-lifecycle.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

function buildDataExportRequest(overrides: Partial<DataExportRequest> = {}): DataExportRequest {
  return {
    id: 'export-001',
    gcid: 'gcid-001',
    scope: 'full',
    tenant_id: null,
    status: 'pending',
    format: 'json',
    download_url: null,
    requested_at: '2026-03-15T00:00:00Z',
    ready_at: null,
    expires_at: null,
    ...overrides,
  };
}

describe('AccountDeletionComponent — export polling', () => {
  let component: AccountDeletionComponent;
  let fixture: ComponentFixture<AccountDeletionComponent>;
  let lifecycleService: AccountLifecycleService;
  let toastService: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountDeletionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    lifecycleService = TestBed.inject(AccountLifecycleService);
    toastService = TestBed.inject(ToastService);

    fixture = TestBed.createComponent(AccountDeletionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('polls until the export is ready', fakeAsync(() => {
    const exportSubject = new Subject<DataExportRequest>();
    vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      of(buildDataExportRequest({ status: 'processing' })),
    );
    vi.spyOn(lifecycleService, 'getDataExport').mockReturnValue(
      exportSubject.asObservable(),
    );
    const toastSpy = vi.spyOn(toastService, 'show');

    component.requestExport();
    expect(component.exportPolling()).toBe(true);

    // First poll fires, export still pending → keep polling
    tick(3_000);
    exportSubject.next(buildDataExportRequest({ status: 'pending' }));
    expect(component.exportPolling()).toBe(true);

    // Second poll returns ready → stop and toast
    tick(3_000);
    exportSubject.next(buildDataExportRequest({ status: 'ready' }));
    expect(component.exportPolling()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('account_deletion.export_ready', 'success');

    // No further polls after completion
    tick(3_000);
    expect(component.exportPolling()).toBe(false);
  }));

  it('stops polling and toasts when the export fails', fakeAsync(() => {
    const exportSubject = new Subject<DataExportRequest>();
    vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      of(buildDataExportRequest({ status: 'processing' })),
    );
    vi.spyOn(lifecycleService, 'getDataExport').mockReturnValue(
      exportSubject.asObservable(),
    );
    const toastSpy = vi.spyOn(toastService, 'show');

    component.requestExport();
    tick(3_000);
    exportSubject.next(buildDataExportRequest({ status: 'failed' }));

    expect(component.exportPolling()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('account_deletion.export_failed', 'error');
  }));

  it('stops polling when the export expires', fakeAsync(() => {
    const exportSubject = new Subject<DataExportRequest>();
    vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      of(buildDataExportRequest({ status: 'processing' })),
    );
    vi.spyOn(lifecycleService, 'getDataExport').mockReturnValue(
      exportSubject.asObservable(),
    );
    const toastSpy = vi.spyOn(toastService, 'show');

    component.requestExport();
    tick(3_000);
    exportSubject.next(buildDataExportRequest({ status: 'expired' }));

    expect(component.exportPolling()).toBe(false);
    expect(toastSpy).not.toHaveBeenCalledWith('account_deletion.export_ready', 'success');
    expect(toastSpy).not.toHaveBeenCalledWith('account_deletion.export_failed', 'error');
  }));

  it('stops polling when the status request errors', fakeAsync(() => {
    const exportSubject = new Subject<DataExportRequest>();
    vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      of(buildDataExportRequest({ status: 'processing' })),
    );
    vi.spyOn(lifecycleService, 'getDataExport').mockReturnValue(
      exportSubject.asObservable(),
    );

    component.requestExport();
    tick(3_000);
    exportSubject.error(new Error('boom'));

    expect(component.exportPolling()).toBe(false);
  }));
}, 30_000);