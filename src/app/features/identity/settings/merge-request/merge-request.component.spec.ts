import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MergeRequestComponent } from './merge-request.component';
import { PortabilityService } from '../../portability/services/portability.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { AdminMergeRequest } from '../../portability/models/portability.model';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<AdminMergeRequest> = {}): AdminMergeRequest {
  return {
    id: 'req-001',
    requester_gcid: 'gcid-123',
    target_email: 'old@example.com',
    reason: 'I lost access to my other account email.',
    evidence_urls: [],
    status: 'submitted',
    denial_reason: null,
    submitted_at: '2026-06-01T10:00:00Z',
    reviewed_at: null,
    resolved_at: null,
    ...overrides,
  };
}

/** Build a File-shaped object; jsdom File supports type + size via Blob parts. */
function makeFile(name: string, type: string, sizeBytes: number): File {
  // Use a Blob of the requested size by repeating a 1-byte char.
  const content = sizeBytes > 0 ? new Uint8Array(sizeBytes) : new Uint8Array(0);
  return new File([content], name, { type });
}

describe('MergeRequestComponent', () => {
  let fixture: ComponentFixture<MergeRequestComponent>;
  let component: MergeRequestComponent;

  const mockPortabilityService = {
    loadAdminMergeRequest: vi.fn().mockReturnValue(of(null)),
    submitAdminMergeRequest: vi.fn().mockReturnValue(of({ id: 'req-001', status: 'submitted' })),
    resetAdminMergeRequestState: vi.fn(),
  };

  const mockToast = { show: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Restore default implementations (clearAllMocks keeps them, but be explicit
    // so per-test overrides in earlier tests do not leak).
    mockPortabilityService.loadAdminMergeRequest.mockReturnValue(of(null));
    mockPortabilityService.submitAdminMergeRequest.mockReturnValue(
      of({ id: 'req-001', status: 'submitted' }),
    );

    await TestBed.configureTestingModule({
      imports: [MergeRequestComponent],
      providers: [
        provideRouter([]),
        { provide: PortabilityService, useValue: mockPortabilityService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MergeRequestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Pre-existing tests (must remain GREEN)
  // -------------------------------------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load existing request on init', () => {
    expect(mockPortabilityService.loadAdminMergeRequest).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should validate email format', () => {
    expect(component.isEmailValid()).toBe(false);

    component.targetEmail.set('user@example.com');
    expect(component.isEmailValid()).toBe(true);
  });

  it('should validate reason length', () => {
    expect(component.isReasonValid()).toBe(false);

    component.reason.set('A'.repeat(20));
    expect(component.isReasonValid()).toBe(true);
  });

  it('should compute canSubmit requiring all conditions', () => {
    expect(component.canSubmit()).toBe(false);

    component.targetEmail.set('user@example.com');
    component.reason.set('A'.repeat(20));
    component.ownershipConfirmed.set(true);
    expect(component.canSubmit()).toBe(true);
  });

  it('should reset form on resubmit', () => {
    component.existingRequest.set({ status: 'denied' } as never);
    component.onResubmit();
    expect(component.existingRequest()).toBeNull();
    expect(component.targetEmail()).toBe('');
  });

  // -------------------------------------------------------------------------
  // Shell render (no existing request -> form)
  // -------------------------------------------------------------------------

  describe('shell render (form state)', () => {
    it('renders the page container and title', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="merge-request-page"]')).toBeTruthy();
      expect(
        el.querySelector('[data-testid="merge-request-title"]')?.textContent,
      ).toContain('identity.merge_request.title');
    });

    it('shows the form when there is no existing request', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="merge-request-form"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="merge-request-loading"]')).toBeNull();
    });

    it('exposes constants to the template', () => {
      expect(component.minReasonLength).toBe(20);
      expect(component.maxReasonLength).toBe(2000);
      expect(component.maxFiles).toBe(5);
      expect(component.maxFileSizeMb).toBe(10);
      expect(component.acceptedExtensions).toBe('.jpg,.jpeg,.png,.pdf');
    });

    it('renders the dropzone and submit button', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dropzone"]')).toBeTruthy();
      const submit = el.querySelector(
        '[data-testid="btn-submit"]',
      ) as HTMLButtonElement;
      expect(submit).toBeTruthy();
      // canSubmit() false initially -> disabled
      expect(submit.disabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('shows skeleton when loading is true', () => {
      component.loading.set(true);
      component.existingRequest.set(null);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="merge-request-loading"]')).toBeTruthy();
      // form hidden while loading
      expect(el.querySelector('[data-testid="merge-request-form"]')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // loadExistingRequest data + error paths
  // -------------------------------------------------------------------------

  describe('loadExistingRequest', () => {
    it('sets existingRequest when load returns a request', () => {
      const req = makeRequest({ status: 'submitted' });
      mockPortabilityService.loadAdminMergeRequest.mockReturnValueOnce(of(req));
      component.loadExistingRequest();
      expect(component.existingRequest()).toEqual(req);
      expect(component.loading()).toBe(false);
    });

    it('clears existingRequest and stops loading on error (404 path)', () => {
      mockPortabilityService.loadAdminMergeRequest.mockReturnValueOnce(
        throwError(() => new Error('not found')),
      );
      component.existingRequest.set(makeRequest());
      component.loadExistingRequest();
      expect(component.existingRequest()).toBeNull();
      expect(component.loading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Form handlers
  // -------------------------------------------------------------------------

  describe('form handlers', () => {
    it('onEmailInput updates targetEmail signal', () => {
      component.onEmailInput('  someone@x.io  ');
      expect(component.targetEmail()).toBe('  someone@x.io  ');
    });

    it('onReasonInput updates reason signal', () => {
      component.onReasonInput('a reason');
      expect(component.reason()).toBe('a reason');
    });

    it('onOwnershipToggle updates ownershipConfirmed signal', () => {
      expect(component.ownershipConfirmed()).toBe(false);
      component.onOwnershipToggle(true);
      expect(component.ownershipConfirmed()).toBe(true);
      component.onOwnershipToggle(false);
      expect(component.ownershipConfirmed()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Computed validity & char counters
  // -------------------------------------------------------------------------

  describe('computed validity', () => {
    it('isEmailValid false for missing dot or @', () => {
      component.targetEmail.set('nodot@example');
      expect(component.isEmailValid()).toBe(false);
      component.targetEmail.set('noatexample.com');
      expect(component.isEmailValid()).toBe(false);
    });

    it('isReasonValid false when reason too short or too long', () => {
      component.reason.set('A'.repeat(19));
      expect(component.isReasonValid()).toBe(false);
      component.reason.set('A'.repeat(2001));
      expect(component.isReasonValid()).toBe(false);
    });

    it('charCount and charsRemaining reflect reason length', () => {
      component.reason.set('hello');
      expect(component.charCount()).toBe(5);
      expect(component.charsRemaining()).toBe(2000 - 5);
    });

    it('charsRemaining goes negative when over the max', () => {
      component.reason.set('A'.repeat(2100));
      expect(component.charsRemaining()).toBe(2000 - 2100);
    });

    it('canSubmit is false while submitting even with valid fields', () => {
      component.targetEmail.set('user@example.com');
      component.reason.set('A'.repeat(20));
      component.ownershipConfirmed.set(true);
      component.submitting.set(true);
      expect(component.canSubmit()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Existing-request state computeds + template
  // -------------------------------------------------------------------------

  describe('existing-request states', () => {
    it('isPending true for submitted and admin_review', () => {
      component.existingRequest.set(makeRequest({ status: 'submitted' }));
      expect(component.isPending()).toBe(true);
      expect(component.hasExistingRequest()).toBe(true);
      component.existingRequest.set(makeRequest({ status: 'admin_review' }));
      expect(component.isPending()).toBe(true);
    });

    it('isDenied true only for denied', () => {
      component.existingRequest.set(makeRequest({ status: 'denied' }));
      expect(component.isDenied()).toBe(true);
      expect(component.isApproved()).toBe(false);
      expect(component.isPending()).toBe(false);
    });

    it('isApproved true only for approved', () => {
      component.existingRequest.set(makeRequest({ status: 'approved' }));
      expect(component.isApproved()).toBe(true);
      expect(component.isDenied()).toBe(false);
    });

    it('hasExistingRequest false when null', () => {
      component.existingRequest.set(null);
      expect(component.hasExistingRequest()).toBe(false);
      expect(component.isPending()).toBe(false);
      expect(component.isDenied()).toBe(false);
      expect(component.isApproved()).toBe(false);
    });

    it('renders pending panel and hides the form', () => {
      component.existingRequest.set(makeRequest({ status: 'admin_review' }));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="merge-request-pending"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="merge-request-form"]')).toBeNull();
    });

    it('renders approved panel', () => {
      component.existingRequest.set(
        makeRequest({ status: 'approved', resolved_at: '2026-06-02T12:00:00Z' }),
      );
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="merge-request-approved"]')).toBeTruthy();
    });

    it('renders denied panel with denial reason and resubmit button', () => {
      component.existingRequest.set(
        makeRequest({ status: 'denied', denial_reason: 'Insufficient evidence.' }),
      );
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="merge-request-denied"]')).toBeTruthy();
      expect(
        el.querySelector('[data-testid="denial-reason"]')?.textContent,
      ).toContain('Insufficient evidence.');
      expect(el.querySelector('[data-testid="btn-resubmit"]')).toBeTruthy();
    });

    it('omits denial reason block when denial_reason is null', () => {
      component.existingRequest.set(
        makeRequest({ status: 'denied', denial_reason: null }),
      );
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="denial-reason"]')).toBeNull();
    });

    it('clicking resubmit button clears request and shows form again', () => {
      component.existingRequest.set(makeRequest({ status: 'denied' }));
      component.targetEmail.set('keep@x.com');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector('[data-testid="btn-resubmit"]') as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      expect(component.existingRequest()).toBeNull();
      expect(component.targetEmail()).toBe('');
      expect(el.querySelector('[data-testid="merge-request-form"]')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // timelineSteps computed
  // -------------------------------------------------------------------------

  describe('timelineSteps', () => {
    it('returns empty array when no request', () => {
      component.existingRequest.set(null);
      expect(component.timelineSteps()).toEqual([]);
    });

    it('marks the submitted step current for submitted status', () => {
      component.existingRequest.set(makeRequest({ status: 'submitted' }));
      const steps = component.timelineSteps();
      expect(steps).toHaveLength(3);
      expect(steps[0].current).toBe(true);
      expect(steps[0].completed).toBe(true);
      expect(steps[1].completed).toBe(false);
      // third step is generic "decision" (not yet decided)
      expect(steps[2].key).toBe('approved');
      expect(steps[2].label).toBe('identity.merge_request.timeline_decision');
      expect(steps[2].icon).toBe('gavel');
      expect(steps[2].completed).toBe(false);
    });

    it('marks the review step current for admin_review status', () => {
      component.existingRequest.set(
        makeRequest({ status: 'admin_review', reviewed_at: '2026-06-01T11:00:00Z' }),
      );
      const steps = component.timelineSteps();
      expect(steps[1].current).toBe(true);
      expect(steps[1].completed).toBe(true);
      expect(steps[1].timestamp).toBe('2026-06-01T11:00:00Z');
    });

    it('terminal approved step is completed with check_circle icon', () => {
      component.existingRequest.set(
        makeRequest({ status: 'approved', resolved_at: '2026-06-02T09:00:00Z' }),
      );
      const steps = component.timelineSteps();
      expect(steps[2].key).toBe('approved');
      expect(steps[2].label).toBe('identity.merge_request.timeline_approved');
      expect(steps[2].icon).toBe('check_circle');
      expect(steps[2].completed).toBe(true);
      expect(steps[2].current).toBe(true);
      // admin_review marked completed because a decision was reached
      expect(steps[1].completed).toBe(true);
    });

    it('terminal denied step uses denied key, label and cancel icon', () => {
      component.existingRequest.set(makeRequest({ status: 'denied' }));
      const steps = component.timelineSteps();
      expect(steps[2].key).toBe('denied');
      expect(steps[2].label).toBe('identity.merge_request.timeline_denied');
      expect(steps[2].icon).toBe('cancel');
      expect(steps[2].completed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // File handling
  // -------------------------------------------------------------------------

  describe('file handling', () => {
    it('onFileSelect adds valid files and clears the input value', () => {
      const file = makeFile('proof.pdf', 'application/pdf', 1024);
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      const event = { target: input } as unknown as Event;

      component.onFileSelect(event);

      expect(component.files()).toHaveLength(1);
      expect(component.files()[0].name).toBe('proof.pdf');
      expect(input.value).toBe('');
      expect(component.fileErrors()).toEqual([]);
    });

    it('onFileSelect does nothing when input has no files', () => {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: null, configurable: true });
      const event = { target: input } as unknown as Event;
      component.onFileSelect(event);
      expect(component.files()).toHaveLength(0);
    });

    it('rejects an invalid file type', () => {
      const file = makeFile('bad.txt', 'text/plain', 100);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);
      expect(component.files()).toHaveLength(0);
      expect(component.fileErrors()).toContain('identity.merge_request.error_invalid_type');
    });

    it('rejects a file that is too large', () => {
      // 11 MB > 10 MB limit
      const file = makeFile('huge.png', 'image/png', 11 * 1024 * 1024);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);
      expect(component.files()).toHaveLength(0);
      expect(component.fileErrors()).toContain('identity.merge_request.error_file_too_large');
    });

    it('enforces the max-files limit', () => {
      const files = Array.from({ length: 6 }, (_, i) =>
        makeFile(`f${i}.pdf`, 'application/pdf', 10),
      );
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);
      expect(component.files()).toHaveLength(5);
      expect(component.fileErrors()).toContain('identity.merge_request.error_max_files');
    });

    it('generates a preview URL for image files', () => {
      const createSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:preview-1');
      const file = makeFile('pic.png', 'image/png', 500);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);

      expect(createSpy).toHaveBeenCalled();
      expect(component.getPreview('pic.png')).toBe('blob:preview-1');
      expect(component.isImageFile(file)).toBe(true);
      createSpy.mockRestore();
    });

    it('does not generate a preview for non-image files', () => {
      const createSpy = vi.spyOn(URL, 'createObjectURL');
      const file = makeFile('doc.pdf', 'application/pdf', 500);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);

      expect(createSpy).not.toHaveBeenCalled();
      expect(component.getPreview('doc.pdf')).toBeNull();
      expect(component.isImageFile(file)).toBe(false);
      createSpy.mockRestore();
    });

    it('removeFile drops a file by index and revokes its preview', () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:to-revoke');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const img = makeFile('pic.png', 'image/png', 500);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [img], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);
      expect(component.files()).toHaveLength(1);

      component.removeFile(0);
      expect(component.files()).toHaveLength(0);
      expect(revokeSpy).toHaveBeenCalledWith('blob:to-revoke');
      expect(component.getPreview('pic.png')).toBeNull();
      vi.restoreAllMocks();
    });

    it('removeFile with out-of-range index leaves files unchanged', () => {
      const file = makeFile('a.pdf', 'application/pdf', 10);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);
      component.removeFile(99);
      expect(component.files()).toHaveLength(1);
    });

    it('renders the file list and remove button after adding a file', () => {
      const file = makeFile('evidence.pdf', 'application/pdf', 2048);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="file-list"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="file-0"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="btn-remove-file-0"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="file-0"]')?.textContent).toContain(
        'evidence.pdf',
      );
    });

    it('renders file errors region', () => {
      const file = makeFile('bad.gif', 'image/gif', 100);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.merge-request__file-errors')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Drag-and-drop handlers
  // -------------------------------------------------------------------------

  describe('drag-and-drop', () => {
    function dragEvent(files?: File[]): DragEvent {
      return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: files ? { files } : undefined,
      } as unknown as DragEvent;
    }

    it('onDragOver sets dragOver and prevents default', () => {
      const ev = dragEvent();
      component.onDragOver(ev);
      expect(component.dragOver()).toBe(true);
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(ev.stopPropagation).toHaveBeenCalled();
    });

    it('onDragLeave clears dragOver', () => {
      component.dragOver.set(true);
      const ev = dragEvent();
      component.onDragLeave(ev);
      expect(component.dragOver()).toBe(false);
    });

    it('onDrop adds dropped files and clears dragOver', () => {
      component.dragOver.set(true);
      const file = makeFile('dropped.pdf', 'application/pdf', 256);
      const ev = dragEvent([file]);
      component.onDrop(ev);
      expect(component.dragOver()).toBe(false);
      expect(component.files()).toHaveLength(1);
      expect(component.files()[0].name).toBe('dropped.pdf');
    });

    it('onDrop with no dataTransfer files just clears dragOver', () => {
      component.dragOver.set(true);
      const ev = dragEvent(undefined);
      component.onDrop(ev);
      expect(component.dragOver()).toBe(false);
      expect(component.files()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // submitRequest
  // -------------------------------------------------------------------------

  describe('submitRequest', () => {
    function makeValid(): void {
      component.targetEmail.set('  user@example.com  ');
      component.reason.set('  ' + 'A'.repeat(25) + '  ');
      component.ownershipConfirmed.set(true);
    }

    it('does nothing when canSubmit is false', () => {
      component.submitRequest();
      expect(mockPortabilityService.submitAdminMergeRequest).not.toHaveBeenCalled();
    });

    it('builds FormData with trimmed fields + files and shows success', () => {
      const result = makeRequest({ status: 'submitted' });
      mockPortabilityService.submitAdminMergeRequest.mockReturnValueOnce(of(result));
      makeValid();
      const file = makeFile('e.pdf', 'application/pdf', 100);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);

      component.submitRequest();

      expect(mockPortabilityService.submitAdminMergeRequest).toHaveBeenCalledTimes(1);
      const formData = mockPortabilityService.submitAdminMergeRequest.mock
        .calls[0][0] as FormData;
      expect(formData.get('target_email')).toBe('user@example.com');
      expect(formData.get('reason')).toBe('A'.repeat(25));
      expect(formData.get('ownership_confirmed')).toBe('true');
      expect(formData.getAll('evidence')).toHaveLength(1);

      expect(component.submitting()).toBe(false);
      expect(component.existingRequest()).toEqual(result);
      expect(mockToast.show).toHaveBeenCalledWith(
        'identity.merge_request.submit_success',
        'success',
      );
    });

    it('shows error toast when submit resolves null', () => {
      mockPortabilityService.submitAdminMergeRequest.mockReturnValueOnce(of(null));
      makeValid();
      component.submitRequest();
      expect(component.submitting()).toBe(false);
      expect(component.existingRequest()).toBeNull();
      expect(mockToast.show).toHaveBeenCalledWith(
        'identity.merge_request.submit_error',
        'error',
      );
    });

    it('shows error toast when submit errors (5xx path)', () => {
      mockPortabilityService.submitAdminMergeRequest.mockReturnValueOnce(
        throwError(() => new Error('boom')),
      );
      makeValid();
      component.submitRequest();
      expect(component.submitting()).toBe(false);
      expect(mockToast.show).toHaveBeenCalledWith(
        'identity.merge_request.submit_error',
        'error',
      );
    });

    it('submitting() toggles the button label/state', () => {
      makeValid();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const submit = el.querySelector('[data-testid="btn-submit"]') as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
      // Drive submitting flag and re-render
      component.submitting.set(true);
      fixture.detectChanges();
      expect(submit.disabled).toBe(true);
      expect(submit.textContent).toContain('identity.merge_request.submitting');
    });
  });

  // -------------------------------------------------------------------------
  // Helpers: formatDateTime + formatFileSize
  // -------------------------------------------------------------------------

  describe('formatDateTime', () => {
    it('returns empty string for null', () => {
      expect(component.formatDateTime(null)).toBe('');
    });

    it('formats a valid ISO string into a locale string', () => {
      const out = component.formatDateTime('2026-06-01T10:00:00Z');
      expect(out).not.toBe('');
      expect(out).not.toBe('2026-06-01T10:00:00Z');
    });

    it('falls back to the raw string when Date.toLocaleString throws', () => {
      const spy = vi
        .spyOn(Date.prototype, 'toLocaleString')
        .mockImplementation(() => {
          throw new Error('locale fail');
        });
      expect(component.formatDateTime('whatever')).toBe('whatever');
      spy.mockRestore();
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes', () => {
      expect(component.formatFileSize(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(component.formatFileSize(2048)).toBe('2.0 KB');
    });

    it('formats megabytes', () => {
      expect(component.formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });

  // -------------------------------------------------------------------------
  // ngOnDestroy
  // -------------------------------------------------------------------------

  describe('ngOnDestroy', () => {
    it('revokes previews and resets service state', () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:destroy');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const img = makeFile('pic.png', 'image/png', 100);
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [img], configurable: true });
      component.onFileSelect({ target: input } as unknown as Event);

      component.ngOnDestroy();

      expect(revokeSpy).toHaveBeenCalledWith('blob:destroy');
      expect(mockPortabilityService.resetAdminMergeRequestState).toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });
});
