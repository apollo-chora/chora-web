import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountDeletionComponent, DeletionStep } from './account-deletion.component';
import {
  AccountLifecycleService,
  AccountImpactSummary,
  DataExportRequest,
} from '../../services/account-lifecycle.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';

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

describe('AccountDeletionComponent', () => {
  let component: AccountDeletionComponent;
  let fixture: ComponentFixture<AccountDeletionComponent>;
  let lifecycleService: AccountLifecycleService;
  let authService: AuthService;
  let toastService: ToastService;
  let confirmDialogService: ConfirmDialogService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountDeletionComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    lifecycleService = TestBed.inject(AccountLifecycleService);
    authService = TestBed.inject(AuthService);
    toastService = TestBed.inject(ToastService);
    confirmDialogService = TestBed.inject(ConfirmDialogService);
    router = TestBed.inject(Router);

    fixture = TestBed.createComponent(AccountDeletionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('shows the page title', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="account-deletion-title"]');
    expect(el).toBeTruthy();
  });

  it('shows step indicator', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="step-indicator"]');
    expect(el).toBeTruthy();
  });

  it('starts on warning step', () => {
    expect(component.currentStep()).toBe('warning');
    const panel = fixture.nativeElement.querySelector('[data-testid="step-warning-panel"]');
    expect(panel).toBeTruthy();
  });

  it('shows consequences list in warning step', () => {
    const list = fixture.nativeElement.querySelector('[data-testid="consequences-list"]');
    expect(list).toBeTruthy();
  });

  it('shows grace period info in warning step', () => {
    const info = fixture.nativeElement.querySelector('[data-testid="grace-period-info"]');
    expect(info).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  it('navigates to export step', () => {
    component.nextStep();
    fixture.detectChanges();

    expect(component.currentStep()).toBe('export');
    const panel = fixture.nativeElement.querySelector('[data-testid="step-export-panel"]');
    expect(panel).toBeTruthy();
  });

  it('navigates to confirm step', () => {
    component.nextStep(); // export
    component.nextStep(); // confirm
    fixture.detectChanges();

    expect(component.currentStep()).toBe('confirm');
    const panel = fixture.nativeElement.querySelector('[data-testid="step-confirm-panel"]');
    expect(panel).toBeTruthy();
  });

  it('navigates back from export to warning', () => {
    component.nextStep(); // export
    component.previousStep(); // warning
    fixture.detectChanges();

    expect(component.currentStep()).toBe('warning');
  });

  it('does not go below step 0', () => {
    component.previousStep();
    expect(component.currentStepIndex()).toBe(0);
  });

  it('does not exceed max step on nextStep', () => {
    component.goToStep('submitted');
    const idx = component.currentStepIndex();
    component.nextStep();
    expect(component.currentStepIndex()).toBe(idx);
  });

  // -------------------------------------------------------------------------
  // Data export
  // -------------------------------------------------------------------------

  it('requests data export', () => {
    const exportSpy = vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      of(buildDataExportRequest()),
    );
    const toastSpy = vi.spyOn(toastService, 'show');

    component.nextStep(); // go to export step
    fixture.detectChanges();
    component.requestExport();
    fixture.detectChanges();

    expect(exportSpy).toHaveBeenCalledWith({ scope: 'full', format: 'json' });
    expect(toastSpy).toHaveBeenCalledWith('account_deletion.export_requested', 'success');
    expect(component.exportRequested()).toBe(true);
  });

  it('shows export status after request', () => {
    vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      of(buildDataExportRequest({ status: 'processing' })),
    );

    component.nextStep();
    fixture.detectChanges();
    component.requestExport();
    fixture.detectChanges();

    const status = fixture.nativeElement.querySelector('[data-testid="export-status"]');
    expect(status).toBeTruthy();
  });

  it('shows error toast on export failure', () => {
    vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      throwError(() => new Error('fail')),
    );
    const toastSpy = vi.spyOn(toastService, 'show');

    component.nextStep();
    fixture.detectChanges();
    component.requestExport();

    expect(toastSpy).toHaveBeenCalledWith('account_deletion.export_error', 'error');
  });

  // -------------------------------------------------------------------------
  // Confirmation form
  // -------------------------------------------------------------------------

  it('disables submit when confirm text is empty', () => {
    component.goToStep('confirm');
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('[data-testid="btn-submit-deletion"]');
    expect(btn.disabled).toBe(true);
  });

  it('disables submit when checkbox is not checked', () => {
    component.goToStep('confirm');
    component.onConfirmTextChange('DELETE');
    fixture.detectChanges();

    expect(component.isConfirmValid()).toBe(false);
  });

  it('enables submit when text is DELETE and checkbox is checked', () => {
    component.goToStep('confirm');
    component.onConfirmTextChange('DELETE');
    component.onConfirmCheckedChange(true);
    fixture.detectChanges();

    expect(component.isConfirmValid()).toBe(true);
  });

  it('rejects lowercase delete text (case-sensitive match required)', () => {
    component.goToStep('confirm');
    component.onConfirmTextChange('delete');
    component.onConfirmCheckedChange(true);

    // Component uses case-sensitive comparison with 'DELETE'
    expect(component.isConfirmValid()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Submit deletion
  // -------------------------------------------------------------------------

  it('submits deletion after confirmation', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(true);
    vi.spyOn(authService, 'gcid').mockReturnValue('gcid-test-001');
    const deleteSpy = vi.spyOn(lifecycleService, 'deleteAccount').mockReturnValue(of(undefined));
    vi.spyOn(authService, 'logout').mockImplementation(() => { /* spy stub */ });

    component.goToStep('confirm');
    component.onConfirmTextChange('DELETE');
    component.onConfirmCheckedChange(true);
    fixture.detectChanges();

    await component.submitDeletion();
    fixture.detectChanges();

    expect(deleteSpy).toHaveBeenCalledWith('gcid-test-001');
    expect(component.currentStep()).toBe('submitted');
  });

  it('does not submit when confirm dialog is cancelled', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(false);
    const deleteSpy = vi.spyOn(lifecycleService, 'deleteAccount').mockReturnValue(of(undefined));

    component.goToStep('confirm');
    component.onConfirmTextChange('DELETE');
    component.onConfirmCheckedChange(true);
    await component.submitDeletion();

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('shows error toast on deletion failure', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(true);
    vi.spyOn(authService, 'gcid').mockReturnValue('gcid-test-001');
    vi.spyOn(lifecycleService, 'deleteAccount').mockReturnValue(
      throwError(() => new Error('fail')),
    );
    const toastSpy = vi.spyOn(toastService, 'show');

    component.goToStep('confirm');
    component.onConfirmTextChange('DELETE');
    component.onConfirmCheckedChange(true);
    await component.submitDeletion();

    expect(toastSpy).toHaveBeenCalledWith('account_deletion.submit_error', 'error');
  });

  it('shows error when no session on submit', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(true);
    vi.spyOn(authService, 'gcid').mockReturnValue(null);
    const toastSpy = vi.spyOn(toastService, 'show');

    component.goToStep('confirm');
    component.onConfirmTextChange('DELETE');
    component.onConfirmCheckedChange(true);
    await component.submitDeletion();

    expect(toastSpy).toHaveBeenCalledWith('account_deletion.no_session', 'error');
  });

  // -------------------------------------------------------------------------
  // Submitted step
  // -------------------------------------------------------------------------

  it('shows submitted panel after successful deletion', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(true);
    vi.spyOn(authService, 'gcid').mockReturnValue('gcid-test-001');
    vi.spyOn(lifecycleService, 'deleteAccount').mockReturnValue(of(undefined));
    vi.spyOn(authService, 'logout').mockImplementation(() => { /* spy stub */ });

    component.goToStep('confirm');
    component.onConfirmTextChange('DELETE');
    component.onConfirmCheckedChange(true);
    await component.submitDeletion();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="step-submitted-panel"]');
    expect(panel).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Navigation helpers
  // -------------------------------------------------------------------------

  it('navigates back to settings', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.goBack();
    expect(navSpy).toHaveBeenCalledWith(['/settings']);
  });

  it('renders back button', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-back"]');
    expect(btn).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has accessible form labels on confirm step', () => {
    component.goToStep('confirm');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('[data-testid="confirm-text-input"]');
    expect(input.getAttribute('id')).toBe('delete-confirm-input');

    const label = fixture.nativeElement.querySelector('label[for="delete-confirm-input"]');
    expect(label).toBeTruthy();
  });

  it('has aria-current on active step', () => {
    const activeStep = fixture.nativeElement.querySelector('[aria-current="step"]');
    expect(activeStep).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Impact summary
  // -------------------------------------------------------------------------

  it('loads the account impact summary', () => {
    const summary: AccountImpactSummary = {
      authored_atoms: 42,
      active_enrollments: 3,
      assessment_records: 10,
      has_familiar: true,
    };
    vi.spyOn(lifecycleService, 'getAccountImpactSummary').mockReturnValue(of(summary));
    component.loadImpactSummary();
    expect(component.impactSummary()).toEqual(summary);
    expect(component.impactLoading()).toBe(false);
  });

  it('clears impact loading state on summary failure', () => {
    vi.spyOn(lifecycleService, 'getAccountImpactSummary').mockReturnValue(
      throwError(() => new Error('boom')),
    );
    component.loadImpactSummary();
    expect(component.impactLoading()).toBe(false);
    expect(component.impactSummary()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Navigation edge cases
  // -------------------------------------------------------------------------

  it('ignores unknown step names in goToStep', () => {
    const startIdx = component.currentStepIndex();
    component.goToStep('nope' as DeletionStep);
    expect(component.currentStepIndex()).toBe(startIdx);
  });

  it('falls back to the warning step for out-of-range indexes', () => {
    component.currentStepIndex.set(99);
    expect(component.currentStep()).toBe('warning');
  });

  // -------------------------------------------------------------------------
  // Export format & scope selectors
  // -------------------------------------------------------------------------

  it('updates the export format for valid values only', () => {
    component.onExportFormatChange('csv');
    expect(component.exportFormat()).toBe('csv');
    component.onExportFormatChange('json');
    expect(component.exportFormat()).toBe('json');
    component.onExportFormatChange('xml');
    expect(component.exportFormat()).toBe('json'); // invalid value ignored
  });

  it('updates the export scope for valid values only', () => {
    component.onExportScopeChange('gcid_scoped');
    expect(component.exportScope()).toBe('gcid_scoped');
    component.onExportScopeChange('tenant_scoped');
    expect(component.exportScope()).toBe('tenant_scoped');
    component.onExportScopeChange('full');
    expect(component.exportScope()).toBe('full');
    component.onExportScopeChange('everything');
    expect(component.exportScope()).toBe('full'); // invalid value ignored
  });

  // -------------------------------------------------------------------------
  // Export polling
  // -------------------------------------------------------------------------

  it('does not start polling when the export is already ready', () => {
    vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      of(buildDataExportRequest({ status: 'ready' })),
    );
    component.requestExport();
    expect(component.exportRequest()?.status).toBe('ready');
    expect(component.exportPolling()).toBe(false);
  });

  it('starts polling while the export is still processing', () => {
    vi.spyOn(lifecycleService, 'requestDataExport').mockReturnValue(
      of(buildDataExportRequest({ status: 'processing' })),
    );
    vi.spyOn(lifecycleService, 'getDataExport').mockReturnValue(
      of(buildDataExportRequest({ id: 'export-001', status: 'pending' })),
    );
    component.requestExport();
    expect(component.exportPolling()).toBe(true);
  });

  it('skips export and advances a step', () => {
    component.skipExport();
    expect(component.currentStep()).toBe('export');
  });

  // -------------------------------------------------------------------------
  // Submit guards
  // -------------------------------------------------------------------------

  it('does not open the confirm dialog when the form is invalid', async () => {
    const confirmSpy = vi.spyOn(confirmDialogService, 'confirm');
    await component.submitDeletion();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cancel deletion (step 4)
  // -------------------------------------------------------------------------

  it('does not cancel deletion when the dialog is cancelled', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(false);
    const cancelSpy = vi.spyOn(lifecycleService, 'cancelDeletion');
    await component.cancelDeletion();
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('shows an error toast when there is no session to cancel', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(true);
    vi.spyOn(authService, 'gcid').mockReturnValue(null);
    const toastSpy = vi.spyOn(toastService, 'show');

    await component.cancelDeletion();

    expect(toastSpy).toHaveBeenCalledWith('account_deletion.no_session', 'error');
    expect(component.cancelling()).toBe(false);
  });

  it('cancels deletion and marks the flow as cancelled', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(true);
    vi.spyOn(authService, 'gcid').mockReturnValue('gcid-test-001');
    vi.spyOn(lifecycleService, 'cancelDeletion').mockReturnValue(of(undefined));
    const toastSpy = vi.spyOn(toastService, 'show');

    await component.cancelDeletion();

    expect(component.deletionCancelled()).toBe(true);
    expect(component.cancelling()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('account_deletion.deletion_cancelled', 'success');
  });

  it('shows an error toast when cancellation fails', async () => {
    vi.spyOn(confirmDialogService, 'confirm').mockResolvedValue(true);
    vi.spyOn(authService, 'gcid').mockReturnValue('gcid-test-001');
    vi.spyOn(lifecycleService, 'cancelDeletion').mockReturnValue(
      throwError(() => new Error('boom')),
    );
    const toastSpy = vi.spyOn(toastService, 'show');

    await component.cancelDeletion();

    expect(toastSpy).toHaveBeenCalledWith('account_deletion.cancel_error', 'error');
    expect(component.cancelling()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Grace period & date helpers
  // -------------------------------------------------------------------------

  it('exposes a 30-day grace period for the submitted flow', () => {
    expect(component.gracePeriodDaysRemaining()).toBe(30);
    const end = component.gracePeriodEndDate();
    expect(end).toBeInstanceOf(Date);
    const daysOut = Math.round((end.getTime() - Date.now()) / 86_400_000);
    expect(daysOut).toBe(30);
  });

  it('formats dates for display', () => {
    expect(component.formatDate(new Date('2026-03-15T00:00:00Z'))).toContain('2026');
  });
});
