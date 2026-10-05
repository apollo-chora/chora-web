import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { MergeWizardComponent } from './merge-wizard.component';
import { PortabilityService } from '../../services/portability.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { environment } from '../../../../../../environments/environment';
import type { GCIDMerge, MergePreview } from '../../models/portability.model';

const MERGE_URL = `${environment.bffBaseUrl}/api/v1/gcid/merge`;

function makePreview(overrides: Partial<MergePreview> = {}): MergePreview {
  return {
    tenant_memberships: 3,
    assessment_results: 12,
    knowledge_graph_nodes: 47,
    familiar_observations: 8,
    digital_skins: 2,
    conflicts: [],
    ...overrides,
  };
}

function makeMerge(overrides: Partial<GCIDMerge> = {}): GCIDMerge {
  return {
    id: 'merge-123',
    source_gcid: 'gcid-source',
    target_gcid: 'gcid-target',
    status: 'pending_confirmation',
    initiated_by: 'self_service',
    merge_preview: makePreview(),
    initiated_at: '2026-06-04T00:00:00Z',
    confirmed_at: null,
    completed_at: null,
    created_at: '2026-06-04T00:00:00Z',
    ...overrides,
  };
}

describe('MergeWizardComponent', () => {
  let component: MergeWizardComponent;
  let fixture: ComponentFixture<MergeWizardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MergeWizardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(MergeWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="merge-wizard"]');
    expect(el).toBeTruthy();
  });

  it('should start at step 1', () => {
    expect(component.currentStep()).toBe(1);
  });

  it('should navigate between steps', () => {
    component.goToStep(2);
    expect(component.currentStep()).toBe(2);
    component.goToStep(3);
    expect(component.currentStep()).toBe(3);
  });

  it('should not navigate to invalid steps', () => {
    component.goToStep(0);
    expect(component.currentStep()).toBe(1);
    component.goToStep(5);
    expect(component.currentStep()).toBe(1);
  });

  it('should compute canProceedStep1 based on email', () => {
    expect(component.canProceedStep1()).toBe(false);
    component.targetEmail.set('test@example.com');
    expect(component.canProceedStep1()).toBe(true);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Shell rendering
  // ---------------------------------------------------------------------------

  it('should render the header title testid', () => {
    const title = fixture.nativeElement.querySelector('[data-testid="merge-title"]');
    expect(title).toBeTruthy();
    expect(title.textContent).toContain('identity.portability.merge_title');
  });

  it('should render the step indicator with 4 labels', () => {
    const indicator = fixture.nativeElement.querySelector('[data-testid="step-indicator"]');
    expect(indicator).toBeTruthy();
    const steps = indicator.querySelectorAll('.merge-wizard__step');
    expect(steps.length).toBe(4);
    expect(component.stepLabels.length).toBe(4);
  });

  it('should mark step 1 as the active step initially', () => {
    const indicator = fixture.nativeElement.querySelector('[data-testid="step-indicator"]');
    const active = indicator.querySelector('[aria-current="step"]');
    expect(active).toBeTruthy();
    expect(active.textContent).toContain('1');
  });

  it('should render step-1 panel initially with email input', () => {
    const panel = fixture.nativeElement.querySelector('[data-testid="step-1"]');
    expect(panel).toBeTruthy();
    const input = fixture.nativeElement.querySelector('[data-testid="input-target-email"]');
    expect(input).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Computed signals
  // ---------------------------------------------------------------------------

  it('should reject emails without an @ in canProceedStep1', () => {
    component.targetEmail.set('notanemail');
    expect(component.canProceedStep1()).toBe(false);
  });

  it('should treat whitespace-only email as invalid', () => {
    component.targetEmail.set('   ');
    expect(component.canProceedStep1()).toBe(false);
  });

  it('should compute canProceedStep2 from authenticated flag', () => {
    expect(component.canProceedStep2()).toBe(false);
    component.authenticated.set(true);
    expect(component.canProceedStep2()).toBe(true);
  });

  it('should only allow submit when confirmation text is exactly MERGE and not submitting', () => {
    expect(component.canSubmitMerge()).toBe(false);
    component.confirmationText.set('merge');
    expect(component.canSubmitMerge()).toBe(false);
    component.confirmationText.set('MERGE');
    expect(component.canSubmitMerge()).toBe(true);
    component.confirmationText.set('  MERGE  ');
    expect(component.canSubmitMerge()).toBe(true);
    component.submitting.set(true);
    expect(component.canSubmitMerge()).toBe(false);
  });

  it('should expose null mergePreview and empty conflicts when no merge data', () => {
    expect(component.mergePreview()).toBeNull();
    expect(component.conflicts()).toEqual([]);
    expect(component.hasConflicts()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Service-driven preview / conflicts
  // ---------------------------------------------------------------------------

  it('should derive mergePreview/conflicts from service merge state', () => {
    const svc = TestBed.inject(PortabilityService);
    const conflict = {
      type: 'role_conflict' as const,
      description: 'Both GCIDs are admins',
      resolution: 'manual' as const,
    };
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge({ merge_preview: makePreview({ conflicts: [conflict] }) }),
    });

    expect(component.mergePreview()?.tenant_memberships).toBe(3);
    expect(component.conflicts().length).toBe(1);
    expect(component.hasConflicts()).toBe(true);
  });

  it('should render preview values when on step 3 with merge data', () => {
    const svc = TestBed.inject(PortabilityService);
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge({
        merge_preview: makePreview({ tenant_memberships: 9, assessment_results: 21 }),
      }),
    });
    component.goToStep(3);
    fixture.detectChanges();

    const preview = fixture.nativeElement.querySelector('[data-testid="merge-preview"]');
    expect(preview).toBeTruthy();
    const memberships = fixture.nativeElement.querySelector('[data-testid="preview-memberships"]');
    expect(memberships.textContent).toContain('9');
    const assessments = fixture.nativeElement.querySelector('[data-testid="preview-assessments"]');
    expect(assessments.textContent).toContain('21');
  });

  it('should render conflicts block when conflicts exist on step 3', () => {
    const svc = TestBed.inject(PortabilityService);
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge({
        merge_preview: makePreview({
          conflicts: [
            { type: 'data_overlap', description: 'overlap detail', resolution: 'keep_target' },
          ],
        }),
      }),
    });
    component.goToStep(3);
    fixture.detectChanges();

    const conflicts = fixture.nativeElement.querySelector('[data-testid="merge-conflicts"]');
    expect(conflicts).toBeTruthy();
    expect(conflicts.textContent).toContain('overlap detail');
    expect(conflicts.textContent).toContain('identity.portability.conflict_data_overlap');
    expect(conflicts.textContent).toContain('identity.portability.resolution_keep_target');
  });

  it('should show the loading indicator on step 3 while merge state is loading', () => {
    const svc = TestBed.inject(PortabilityService);
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'loading',
    });
    component.goToStep(3);
    fixture.detectChanges();

    const loading = fixture.nativeElement.querySelector('[data-testid="preview-loading"]');
    expect(loading).toBeTruthy();
  });

  it('should render the error banner when merge state is error', () => {
    const svc = TestBed.inject(PortabilityService);
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'error',
      error: { code: 'X', message: 'boom' },
    });
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[data-testid="merge-error"]');
    expect(error).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Step helpers
  // ---------------------------------------------------------------------------

  it('should compute step completed/active states', () => {
    component.goToStep(3);
    expect(component.isStepActive(3)).toBe(true);
    expect(component.isStepActive(2)).toBe(false);
    expect(component.isStepCompleted(1)).toBe(true);
    expect(component.isStepCompleted(2)).toBe(true);
    expect(component.isStepCompleted(3)).toBe(false);
    expect(component.isStepCompleted(4)).toBe(false);
  });

  it('should format conflict type and resolution i18n keys', () => {
    expect(component.formatConflictType('active_session')).toBe(
      'identity.portability.conflict_active_session',
    );
    expect(component.formatResolution('merge_both')).toBe(
      'identity.portability.resolution_merge_both',
    );
  });

  // ---------------------------------------------------------------------------
  // Step 2: authenticate
  // ---------------------------------------------------------------------------

  it('should authenticate and advance to step 3', () => {
    component.goToStep(2);
    component.onAuthenticate();
    expect(component.authenticated()).toBe(true);
    expect(component.currentStep()).toBe(3);
  });

  it('should render authenticate button on step 2 before authentication', () => {
    component.goToStep(2);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-authenticate"]');
    expect(btn).toBeTruthy();
  });

  it('should advance to step 4 on proceed-to-confirm', () => {
    component.onProceedToConfirm();
    expect(component.currentStep()).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // Step 1: initiate merge (HTTP)
  // ---------------------------------------------------------------------------

  it('should not initiate merge when email is empty', () => {
    const http = TestBed.inject(HttpTestingController);
    component.targetEmail.set('   ');
    component.onInitiateMerge();
    http.expectNone(MERGE_URL);
    http.verify();
  });

  it('should POST to merge and advance to step 2 on success', () => {
    const http = TestBed.inject(HttpTestingController);
    component.targetEmail.set('other@example.com');
    component.onInitiateMerge();

    const req = http.expectOne(MERGE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ target_email: 'other@example.com' });
    req.flush(makeMerge());

    expect(component.currentStep()).toBe(2);
    http.verify();
  });

  it('should toast an error and stay on step 1 when initiate fails (catchError -> null)', () => {
    const http = TestBed.inject(HttpTestingController);
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');

    component.targetEmail.set('other@example.com');
    component.onInitiateMerge();

    const req = http.expectOne(MERGE_URL);
    req.flush({ message: 'bad' }, { status: 500, statusText: 'Server Error' });

    expect(component.currentStep()).toBe(1);
    expect(spy).toHaveBeenCalledWith('identity.portability.merge_initiate_error', 'error');
    http.verify();
  });

  // ---------------------------------------------------------------------------
  // Step 4: confirm merge (HTTP + confirm dialog)
  // ---------------------------------------------------------------------------

  it('should do nothing on confirm when there is no merge data', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.confirmationText.set('MERGE');
    await component.onConfirmMerge();
    http.expectNone(`${MERGE_URL}/merge-123/confirm`);
    http.verify();
  });

  it('should do nothing on confirm when confirmation text is not MERGE', async () => {
    const svc = TestBed.inject(PortabilityService);
    const http = TestBed.inject(HttpTestingController);
    const dialog = TestBed.inject(ConfirmDialogService);
    const dialogSpy = vi.spyOn(dialog, 'confirm');
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge(),
    });

    component.confirmationText.set('nope');
    await component.onConfirmMerge();

    expect(dialogSpy).not.toHaveBeenCalled();
    http.verify();
  });

  it('should abort confirm merge when the danger dialog is declined', async () => {
    const svc = TestBed.inject(PortabilityService);
    const http = TestBed.inject(HttpTestingController);
    const dialog = TestBed.inject(ConfirmDialogService);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(false);
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge(),
    });

    component.confirmationText.set('MERGE');
    await component.onConfirmMerge();

    expect(component.submitting()).toBe(false);
    http.expectNone(`${MERGE_URL}/merge-123/confirm`);
    http.verify();
  });

  it('should confirm merge, POST confirm, and toast success', async () => {
    const svc = TestBed.inject(PortabilityService);
    const http = TestBed.inject(HttpTestingController);
    const dialog = TestBed.inject(ConfirmDialogService);
    const toast = TestBed.inject(ToastService);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge({ id: 'merge-xyz' }),
    });

    component.confirmationText.set('MERGE');
    await component.onConfirmMerge();

    const req = http.expectOne(`${MERGE_URL}/merge-xyz/confirm`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ confirmation_text: 'MERGE' });
    req.flush(makeMerge({ id: 'merge-xyz', status: 'completed' }));

    expect(component.submitting()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('identity.portability.merge_confirmed', 'success');
    http.verify();
  });

  it('should toast confirm error when confirm merge returns null (catchError path)', async () => {
    const svc = TestBed.inject(PortabilityService);
    const http = TestBed.inject(HttpTestingController);
    const dialog = TestBed.inject(ConfirmDialogService);
    const toast = TestBed.inject(ToastService);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge({ id: 'merge-err' }),
    });

    component.confirmationText.set('MERGE');
    await component.onConfirmMerge();

    const req = http.expectOne(`${MERGE_URL}/merge-err/confirm`);
    req.flush({ message: 'fail' }, { status: 500, statusText: 'Server Error' });

    expect(component.submitting()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('identity.portability.merge_confirm_error', 'error');
    http.verify();
  });

  // ---------------------------------------------------------------------------
  // Cancel merge
  // ---------------------------------------------------------------------------

  it('should reset the wizard immediately on cancel when no merge data exists', async () => {
    const http = TestBed.inject(HttpTestingController);
    component.currentStep.set(3);
    component.targetEmail.set('x@y.com');
    component.authenticated.set(true);
    component.confirmationText.set('MERGE');

    await component.onCancelMerge();

    expect(component.currentStep()).toBe(1);
    expect(component.targetEmail()).toBe('');
    expect(component.authenticated()).toBe(false);
    expect(component.confirmationText()).toBe('');
    http.verify();
  });

  it('should abort cancel when the info dialog is declined', async () => {
    const svc = TestBed.inject(PortabilityService);
    const http = TestBed.inject(HttpTestingController);
    const dialog = TestBed.inject(ConfirmDialogService);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(false);
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge(),
    });
    component.currentStep.set(3);

    await component.onCancelMerge();

    expect(component.currentStep()).toBe(3);
    http.expectNone(`${MERGE_URL}/merge-123`);
    http.verify();
  });

  it('should DELETE merge, reset wizard, and toast on confirmed cancel', async () => {
    const svc = TestBed.inject(PortabilityService);
    const http = TestBed.inject(HttpTestingController);
    const dialog = TestBed.inject(ConfirmDialogService);
    const toast = TestBed.inject(ToastService);
    vi.spyOn(dialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');
    (svc as unknown as { _mergeState: { set: (v: unknown) => void } })._mergeState.set({
      status: 'success',
      data: makeMerge({ id: 'merge-cancel' }),
    });
    component.currentStep.set(3);
    component.authenticated.set(true);

    await component.onCancelMerge();

    const req = http.expectOne(`${MERGE_URL}/merge-cancel`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(component.currentStep()).toBe(1);
    expect(component.authenticated()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('identity.portability.merge_cancelled', 'success');
    http.verify();
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  it('should reset merge state on destroy', () => {
    const svc = TestBed.inject(PortabilityService);
    const resetSpy = vi.spyOn(svc, 'resetMergeState');
    fixture.destroy();
    expect(resetSpy).toHaveBeenCalled();
  });
});
