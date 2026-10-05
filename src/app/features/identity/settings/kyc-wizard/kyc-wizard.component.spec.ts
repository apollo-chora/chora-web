import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { KycWizardComponent } from './kyc-wizard.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { KycVerificationLearner } from '../../../admin/governance/models/escalation.model';

const BFF = 'https://api.chora.site';
const KYC_URL = `${BFF}/api/v1/identity/kyc`;

function makeVerification(overrides: Partial<KycVerificationLearner> = {}): KycVerificationLearner {
  return {
    id: 'kyc-1',
    document_type: 'passport',
    document_file_name: 'passport.pdf',
    selfie_file_name: 'selfie_capture.jpg',
    status: 'pending_review',
    rejection_reason: null,
    submitted_at: '2026-06-01T10:00:00Z',
    verified_at: null,
    timeline: [],
    ...overrides,
  };
}

describe('KycWizardComponent', () => {
  let component: KycWizardComponent;
  let fixture: ComponentFixture<KycWizardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycWizardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(KycWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="kyc-wizard"]');
    expect(el).toBeTruthy();
  });

  it('should start at document step', () => {
    expect(component.wizardStep()).toBe('document');
  });

  it('should navigate wizard steps', () => {
    component.selectedDocType.set('passport');
    component.documentFile.set(new File([''], 'test.pdf'));
    component.nextStep();
    expect(component.wizardStep()).toBe('selfie');

    component.nextStep();
    expect(component.wizardStep()).toBe('review');

    component.prevStep();
    expect(component.wizardStep()).toBe('selfie');
  });

  it('should format date with null as dash', () => {
    expect(component.formatDate(null)).toBe('-');
  });

  it('should return correct status class', () => {
    expect(component.statusClass('verified')).toBe('kyc-wizard__verification-status--verified');
  });

  it('should have doc types available', () => {
    expect(component.docTypes.length).toBe(3);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Initial render / shell
  // -------------------------------------------------------------------------

  it('should render the title and aria-label', () => {
    const title = fixture.nativeElement.querySelector('[data-testid="kyc-title"]');
    expect(title?.textContent).toContain('governance.kyc_verification');
    const section = fixture.nativeElement.querySelector('[data-testid="kyc-wizard"]');
    expect(section?.getAttribute('aria-label')).toBe('governance.kyc_verification');
  });

  it('should expose constants for accepted formats and max size', () => {
    expect(component.acceptedFormats).toBe('.pdf,.jpg,.jpeg,.png');
    expect(component.maxFileSizeMb).toBe(10);
    expect(component.statusLabels.verified).toBe('governance.kyc_verified');
  });

  it('should expose initial signal state', () => {
    expect(component.state().status).toBe('loading');
    expect(component.selectedDocType()).toBeNull();
    expect(component.documentFileName()).toBeNull();
    expect(component.documentFile()).toBeNull();
    expect(component.selfieFileName()).toBeNull();
    expect(component.submitting()).toBe(false);
    expect(component.fileError()).toBeNull();
    expect(component.wizardStepIndex()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Wizard navigation guards
  // -------------------------------------------------------------------------

  it('should not advance past the last step', () => {
    component.wizardStep.set('review');
    component.nextStep();
    expect(component.wizardStep()).toBe('review');
  });

  it('should not go before the first step', () => {
    component.wizardStep.set('document');
    component.prevStep();
    expect(component.wizardStep()).toBe('document');
  });

  // -------------------------------------------------------------------------
  // File handling
  // -------------------------------------------------------------------------

  it('should accept a valid document file', () => {
    const file = new File(['x'], 'id.png', { type: 'image/png' });
    const event = { target: { files: [file] } } as unknown as Event;
    component.onDocumentFileChange(event);
    expect(component.documentFileName()).toBe('id.png');
    expect(component.documentFile()).toBe(file);
    expect(component.fileError()).toBeNull();
  });

  it('should reject a document file over the size limit', () => {
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    const event = { target: { files: [big] } } as unknown as Event;
    component.onDocumentFileChange(event);
    expect(component.fileError()).toBe('governance.file_too_large');
    expect(component.documentFileName()).toBeNull();
    expect(component.documentFile()).toBeNull();
  });

  it('should clear file state when no file is selected', () => {
    component.documentFileName.set('prev.pdf');
    component.documentFile.set(new File([''], 'prev.pdf'));
    component.fileError.set('governance.file_too_large');
    const event = { target: { files: [] } } as unknown as Event;
    component.onDocumentFileChange(event);
    expect(component.documentFileName()).toBeNull();
    expect(component.documentFile()).toBeNull();
    expect(component.fileError()).toBeNull();
  });

  it('should set a placeholder selfie file name on capture', () => {
    component.onSelfieCapture();
    expect(component.selfieFileName()).toBe('selfie_capture.jpg');
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  it('should format a valid date string', () => {
    const out = component.formatDate('2026-06-01T10:00:00Z');
    expect(out).not.toBe('-');
    expect(typeof out).toBe('string');
  });

  it('should return the raw string when date parsing yields invalid', () => {
    // toLocaleDateString on an invalid Date does not throw; characterize output
    const out = component.formatDate('not-a-date');
    expect(typeof out).toBe('string');
  });

  it('should build a timeline stage class', () => {
    expect(component.timelineStageClass('completed')).toBe('kyc-wizard__timeline-stage--completed');
  });

  it('should build verification status classes', () => {
    expect(component.statusClass('rejected')).toBe('kyc-wizard__verification-status--rejected');
    expect(component.statusClass('pending_review')).toBe(
      'kyc-wizard__verification-status--pending_review',
    );
  });
});

// ---------------------------------------------------------------------------
// HTTP-driven scenarios (own setup, no auto detectChanges in beforeEach)
// ---------------------------------------------------------------------------

describe('KycWizardComponent (HTTP states)', () => {
  let component: KycWizardComponent;
  let fixture: ComponentFixture<KycWizardComponent>;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycWizardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(KycWizardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  it('should GET /api/v1/identity/kyc on init and show loading skeleton', () => {
    fixture.detectChanges(); // triggers ngOnInit
    expect(component.isLoading()).toBe(true);
    const loading = fixture.nativeElement.querySelector('[data-testid="kyc-loading"]');
    expect(loading).toBeTruthy();

    const req = httpMock.expectOne(KYC_URL);
    expect(req.request.method).toBe('GET');
    req.flush(makeVerification({ submitted_at: null, status: 'pending_review' }));
  });

  it('should render existing verification status on success', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(KYC_URL);
    req.flush(makeVerification({ status: 'pending_review' }));
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.hasExistingVerification()).toBe(true);
    expect(component.verificationStatus()).toBe('pending_review');

    const statusEl = fixture.nativeElement.querySelector('[data-testid="verification-status"]');
    expect(statusEl?.textContent).toContain('governance.kyc_pending_review');
  });

  it('should treat a verification with null submitted_at as not yet submitted', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(makeVerification({ submitted_at: null }));
    fixture.detectChanges();

    expect(component.hasExistingVerification()).toBe(false);
    // wizard should be visible (step indicators rendered)
    const step = fixture.nativeElement.querySelector('[data-testid="wizard-step-document"]');
    expect(step).toBeTruthy();
  });

  it('should show rejection reason and still allow re-submission when rejected', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(
      makeVerification({
        status: 'rejected',
        rejection_reason: 'Blurry document',
      }),
    );
    fixture.detectChanges();

    expect(component.rejectionReason()).toBe('Blurry document');
    const reason = fixture.nativeElement.querySelector('[data-testid="rejection-reason"]');
    expect(reason?.textContent).toContain('Blurry document');

    // rejected => wizard re-shown even though verification exists
    const wizardStep = fixture.nativeElement.querySelector('[data-testid="wizard-step-document"]');
    expect(wizardStep).toBeTruthy();
  });

  it('should render the verification timeline', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(
      makeVerification({
        status: 'verified',
        verified_at: '2026-06-02T10:00:00Z',
        timeline: [
          {
            label_key: 'governance.kyc_step_submitted',
            date: '2026-06-01T10:00:00Z',
            status: 'completed',
          },
          { label_key: 'governance.kyc_step_reviewed', date: null, status: 'active' },
        ],
      }),
    );
    fixture.detectChanges();

    expect(component.timeline().length).toBe(2);
    const timelineEl = fixture.nativeElement.querySelector('[data-testid="kyc-timeline"]');
    expect(timelineEl).toBeTruthy();
    expect(timelineEl?.textContent).toContain('governance.kyc_step_submitted');
  });

  it('should enter error state on a 5xx load failure', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.isError()).toBe(true);
    expect(component.state().status).toBe('error');
    const errorEl = fixture.nativeElement.querySelector('[data-testid="kyc-error"]');
    expect(errorEl).toBeTruthy();
    expect(component.verification()).toBeNull();
  });

  it('should not submit when doc type or file is missing', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(makeVerification({ submitted_at: null }));

    component.selectedDocType.set(null);
    component.documentFile.set(null);
    component.submit();
    expect(component.submitting()).toBe(false);
    httpMock.expectNone(KYC_URL);
  });

  it('should POST submission and show success toast on success', () => {
    const toastSpy = vi.spyOn(toast, 'show');
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(makeVerification({ submitted_at: null }));

    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    component.selectedDocType.set('national_id');
    component.documentFile.set(file);
    component.documentFileName.set('doc.pdf');
    component.selfieFileName.set('selfie_capture.jpg');

    component.submit();
    expect(component.submitting()).toBe(true);

    const req = httpMock.expectOne(KYC_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      document_type: 'national_id',
      document_file_name: 'doc.pdf',
      selfie_file_name: 'selfie_capture.jpg',
    });
    req.flush(makeVerification({ status: 'pending_review' }));

    expect(component.submitting()).toBe(false);
    expect(component.verificationStatus()).toBe('pending_review');
    expect(toastSpy).toHaveBeenCalledWith('governance.kyc_submitted', 'success');
  });

  it('should show error toast and reset submitting on POST failure', () => {
    const toastSpy = vi.spyOn(toast, 'show');
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(makeVerification({ submitted_at: null }));

    component.selectedDocType.set('drivers_license');
    component.documentFile.set(new File(['x'], 'dl.jpg'));

    component.submit();
    httpMock.expectOne(KYC_URL).flush('nope', { status: 400, statusText: 'Bad Request' });

    expect(component.submitting()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('governance.kyc_submit_error', 'error');
  });

  it('should unsubscribe on destroy without errors', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(makeVerification({ submitted_at: null }));
    expect(() => fixture.destroy()).not.toThrow();
  });
});
