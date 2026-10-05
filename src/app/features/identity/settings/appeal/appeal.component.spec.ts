import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';
import { AppealComponent, SuspensionAppeal } from './appeal.component';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

describe('AppealComponent', () => {
  let fixture: ComponentFixture<AppealComponent>;
  let component: AppealComponent;

  const mockBff = {
    get: vi.fn().mockReturnValue(of(null)),
    post: vi.fn().mockReturnValue(of({
      id: 'appeal-001',
      restriction_id: 'r-001',
      appellant_gcid: 'gcid-001',
      reason: 'I did not violate the policy',
      evidence_urls: [],
      status: 'submitted',
      reviewer_gcid: null,
      reviewer_notes: null,
      submitted_at: '2026-03-12T10:00:00Z',
      reviewed_at: null,
      resolved_at: null,
    })),
  };

  const mockToast = { show: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [AppealComponent],
      providers: [
        provideRouter([]),
        { provide: BffClientService, useValue: mockBff },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppealComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load existing appeal on init', () => {
    expect(mockBff.get).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should validate reason length', () => {
    expect(component.isReasonValid()).toBe(false);

    component.reason.set('A'.repeat(50));
    expect(component.isReasonValid()).toBe(true);
  });

  it('should compute canSubmit based on reason validity', () => {
    expect(component.canSubmit()).toBe(false);

    component.reason.set('A'.repeat(50));
    expect(component.canSubmit()).toBe(true);
  });

  it('should compute character count', () => {
    component.reason.set('Hello world');
    expect(component.charCount()).toBe(11);
    expect(component.charsRemaining()).toBe(1989);
  });

  it('should build timeline steps when existing appeal is set', () => {
    component.existingAppeal.set({
      id: 'appeal-001',
      restriction_id: 'r-001',
      appellant_gcid: 'gcid-001',
      reason: 'Test',
      evidence_urls: [],
      status: 'under_review',
      reviewer_gcid: null,
      reviewer_notes: null,
      submitted_at: '2026-03-12T10:00:00Z',
      reviewed_at: '2026-03-13T10:00:00Z',
      resolved_at: null,
    });

    const steps = component.timelineSteps();
    expect(steps.length).toBe(3);
    expect(steps[0].key).toBe('submitted');
    expect(steps[1].current).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Helpers to build a stub File with a controllable size.
  // jsdom's File reports the byte length of its parts; override size for tests.
  // ---------------------------------------------------------------------------
  function stubFile(name: string, type: string, sizeBytes: number): File {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: sizeBytes });
    return f;
  }

  function buildAppeal(overrides: Record<string, unknown> = {}): SuspensionAppeal {
    return {
      id: 'appeal-001',
      restriction_id: 'r-001',
      appellant_gcid: 'gcid-001',
      reason: 'I respectfully appeal this suspension because I did not violate.',
      evidence_urls: [],
      status: 'submitted',
      reviewer_gcid: null,
      reviewer_notes: null,
      submitted_at: '2026-03-12T10:00:00Z',
      reviewed_at: null,
      resolved_at: null,
      ...overrides,
    } as SuspensionAppeal;
  }

  // ===========================================================================
  // Data loading
  // ===========================================================================

  it('should set existingAppeal when get returns an appeal', () => {
    const appeal = buildAppeal({ status: 'submitted' });
    mockBff.get.mockReturnValueOnce(of(appeal));

    component.loadExistingAppeal();

    expect(component.existingAppeal()).toEqual(appeal);
    expect(component.hasExistingAppeal()).toBe(true);
    expect(component.loading()).toBe(false);
  });

  it('should clear existingAppeal and show form on load error (e.g. 404)', () => {
    component.existingAppeal.set(buildAppeal());
    mockBff.get.mockReturnValueOnce(throwError(() => ({ status: 404 })));

    component.loadExistingAppeal();

    expect(component.existingAppeal()).toBeNull();
    expect(component.hasExistingAppeal()).toBe(false);
    expect(component.loading()).toBe(false);
  });

  // ===========================================================================
  // Reason input handler & computed validity edge cases
  // ===========================================================================

  it('onReasonInput should update the reason signal', () => {
    component.onReasonInput('Some reason text');
    expect(component.reason()).toBe('Some reason text');
    expect(component.charCount()).toBe(16);
  });

  it('isReasonValid should be false when only whitespace pads short content', () => {
    // 60 spaces + "abc" => length 63 but trimmed length 3 (< 50)
    component.reason.set(' '.repeat(60) + 'abc');
    expect(component.isReasonValid()).toBe(false);
  });

  it('isReasonValid should be false when over the max length', () => {
    component.reason.set('A'.repeat(2001));
    expect(component.isReasonValid()).toBe(false);
    expect(component.charsRemaining()).toBe(-1);
  });

  // ===========================================================================
  // File handling — addFiles via onFileSelect / onDrop
  // ===========================================================================

  it('onFileSelect should add valid files and reset the input value', () => {
    const file = stubFile('proof.png', 'image/png', 1024);
    const input = { files: [file], value: 'C:\\fakepath\\proof.png' } as unknown as HTMLInputElement;
    const event = { target: input } as unknown as Event;

    component.onFileSelect(event);

    expect(component.files().length).toBe(1);
    expect(component.files()[0].name).toBe('proof.png');
    expect(input.value).toBe('');
    expect(component.fileErrors().length).toBe(0);
  });

  it('onFileSelect should be a no-op when input has no files', () => {
    const input = { files: null } as unknown as HTMLInputElement;
    const event = { target: input } as unknown as Event;

    component.onFileSelect(event);

    expect(component.files().length).toBe(0);
  });

  it('addFiles should reject an unsupported file type', () => {
    const file = stubFile('virus.exe', 'application/x-msdownload', 100);
    const input = { files: [file], value: '' } as unknown as HTMLInputElement;
    component.onFileSelect({ target: input } as unknown as Event);

    expect(component.files().length).toBe(0);
    expect(component.fileErrors()).toContain('appeal.error_invalid_type');
  });

  it('addFiles should reject a file that exceeds the max size', () => {
    const file = stubFile('huge.pdf', 'application/pdf', 11 * 1024 * 1024);
    const input = { files: [file], value: '' } as unknown as HTMLInputElement;
    component.onFileSelect({ target: input } as unknown as Event);

    expect(component.files().length).toBe(0);
    expect(component.fileErrors()).toContain('appeal.error_file_too_large');
  });

  it('addFiles should stop adding and flag error once max files reached', () => {
    const valid = Array.from({ length: 5 }, (_, i) =>
      stubFile(`f${i}.pdf`, 'application/pdf', 1000),
    );
    const input = { files: valid, value: '' } as unknown as HTMLInputElement;
    component.onFileSelect({ target: input } as unknown as Event);
    expect(component.files().length).toBe(5);

    // One more file beyond the cap.
    const extra = stubFile('extra.pdf', 'application/pdf', 1000);
    component.onFileSelect({
      target: { files: [extra], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);

    expect(component.files().length).toBe(5);
    expect(component.fileErrors()).toContain('appeal.error_max_files');
  });

  it('addFiles should accept jpeg, png and pdf types', () => {
    const files = [
      stubFile('a.jpg', 'image/jpeg', 100),
      stubFile('b.png', 'image/png', 100),
      stubFile('c.pdf', 'application/pdf', 100),
    ];
    component.onFileSelect({
      target: { files, value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);

    expect(component.files().map((f) => f.name)).toEqual(['a.jpg', 'b.png', 'c.pdf']);
    expect(component.fileErrors().length).toBe(0);
  });

  it('removeFile should remove the file at the given index and clear errors', () => {
    const files = [
      stubFile('a.jpg', 'image/jpeg', 100),
      stubFile('b.png', 'image/png', 100),
    ];
    component.onFileSelect({
      target: { files, value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);
    component.fileErrors.set(['appeal.error_invalid_type']);

    component.removeFile(0);

    expect(component.files().map((f) => f.name)).toEqual(['b.png']);
    expect(component.fileErrors().length).toBe(0);
  });

  // ===========================================================================
  // Drag and drop
  // ===========================================================================

  it('onDragOver should set dragOver and prevent default', () => {
    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as DragEvent;

    component.onDragOver(ev);

    expect(component.dragOver()).toBe(true);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ev.stopPropagation).toHaveBeenCalled();
  });

  it('onDragLeave should clear dragOver', () => {
    component.dragOver.set(true);
    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as DragEvent;

    component.onDragLeave(ev);

    expect(component.dragOver()).toBe(false);
  });

  it('onDrop should add dropped files and clear dragOver', () => {
    component.dragOver.set(true);
    const file = stubFile('dropped.pdf', 'application/pdf', 500);
    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as DragEvent;

    component.onDrop(ev);

    expect(component.dragOver()).toBe(false);
    expect(component.files().length).toBe(1);
    expect(component.files()[0].name).toBe('dropped.pdf');
  });

  it('onDrop should handle a drop with no dataTransfer files gracefully', () => {
    const ev = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: null },
    } as unknown as DragEvent;

    component.onDrop(ev);

    expect(component.files().length).toBe(0);
    expect(component.dragOver()).toBe(false);
  });

  // ===========================================================================
  // Submit
  // ===========================================================================

  it('submitAppeal should no-op when canSubmit is false', () => {
    component.reason.set('too short'); // invalid
    component.submitAppeal();

    expect(mockBff.post).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  it('submitAppeal should POST trimmed reason + evidence and set existing appeal on success', () => {
    const returned = buildAppeal({ status: 'submitted', id: 'appeal-new' });
    mockBff.post.mockReturnValueOnce(of(returned));

    component.reason.set('  ' + 'A'.repeat(60) + '  ');
    const file = stubFile('proof.pdf', 'application/pdf', 1000);
    component.onFileSelect({
      target: { files: [file], value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);

    component.submitAppeal();

    expect(mockBff.post).toHaveBeenCalledTimes(1);
    const [path, body] = mockBff.post.mock.calls[0];
    expect(path).toBe('/api/v1/governance/appeals/me');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('reason')).toBe('A'.repeat(60));
    expect((body as FormData).getAll('evidence').length).toBe(1);

    expect(component.existingAppeal()).toEqual(returned);
    expect(component.submitting()).toBe(false);
    expect(mockToast.show).toHaveBeenCalledWith('appeal.submit_success', 'success');
  });

  it('submitAppeal should toast an error and reset submitting on failure', () => {
    mockBff.post.mockReturnValueOnce(throwError(() => ({ status: 500 })));

    component.reason.set('A'.repeat(60));
    component.submitAppeal();

    expect(component.existingAppeal()).toBeNull();
    expect(component.submitting()).toBe(false);
    expect(mockToast.show).toHaveBeenCalledWith('appeal.submit_error', 'error');
  });

  // ===========================================================================
  // Helpers
  // ===========================================================================

  it('formatDateTime should return empty string for null', () => {
    expect(component.formatDateTime(null)).toBe('');
  });

  it('formatDateTime should produce a non-empty locale string for a valid ISO date', () => {
    const out = component.formatDateTime('2026-03-12T10:00:00Z');
    expect(out.length).toBeGreaterThan(0);
  });

  it('formatFileSize should format bytes, KB and MB ranges', () => {
    expect(component.formatFileSize(500)).toBe('500 B');
    expect(component.formatFileSize(2048)).toBe('2.0 KB');
    expect(component.formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('statusIcon should map every lifecycle status to an icon', () => {
    expect(component.statusIcon('submitted')).toBe('send');
    expect(component.statusIcon('under_review')).toBe('pending');
    expect(component.statusIcon('approved')).toBe('check_circle');
    expect(component.statusIcon('denied')).toBe('cancel');
  });

  // ===========================================================================
  // Timeline computed — all branches
  // ===========================================================================

  it('timelineSteps should be empty when no existing appeal', () => {
    component.existingAppeal.set(null);
    expect(component.timelineSteps()).toEqual([]);
  });

  it('timelineSteps should mark submitted as current when status is submitted', () => {
    component.existingAppeal.set(buildAppeal({ status: 'submitted' }) as never);
    const steps = component.timelineSteps();
    expect(steps[0].current).toBe(true);
    expect(steps[1].completed).toBe(false);
    expect(steps[2].key).toBe('approved');
    expect(steps[2].label).toBe('appeal.timeline_decision');
    expect(steps[2].icon).toBe('gavel');
    expect(steps[2].completed).toBe(false);
  });

  it('timelineSteps should reflect an approved decision', () => {
    component.existingAppeal.set(
      buildAppeal({
        status: 'approved',
        reviewed_at: '2026-03-13T10:00:00Z',
        resolved_at: '2026-03-14T10:00:00Z',
      }) as never,
    );
    const steps = component.timelineSteps();
    expect(steps[1].completed).toBe(true);
    expect(steps[2].key).toBe('approved');
    expect(steps[2].label).toBe('appeal.timeline_approved');
    expect(steps[2].icon).toBe('check_circle');
    expect(steps[2].completed).toBe(true);
    expect(steps[2].current).toBe(true);
  });

  it('timelineSteps should reflect a denied decision', () => {
    component.existingAppeal.set(
      buildAppeal({
        status: 'denied',
        reviewed_at: '2026-03-13T10:00:00Z',
        resolved_at: '2026-03-14T10:00:00Z',
      }) as never,
    );
    const steps = component.timelineSteps();
    expect(steps[2].key).toBe('denied');
    expect(steps[2].label).toBe('appeal.timeline_denied');
    expect(steps[2].icon).toBe('cancel');
    expect(steps[2].completed).toBe(true);
  });

  // ===========================================================================
  // DOM rendering states
  // ===========================================================================

  it('should render the loading skeleton while loading', () => {
    // Fresh component held in loading state via get pending observable.
    mockBff.get.mockReturnValueOnce(NEVER);
    const f = TestBed.createComponent(AppealComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="appeal-loading"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="appeal-form"]')).toBeNull();
  });

  it('should render the appeal form when no existing appeal', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="appeal-form"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="existing-appeal"]')).toBeNull();
    expect(el.querySelector('[data-testid="appeal-title"]')?.textContent).toContain(
      'appeal.title',
    );
  });

  it('should render the existing-appeal status view when an appeal exists', () => {
    component.existingAppeal.set(
      buildAppeal({ status: 'under_review', reason: 'My detailed appeal reason' }) as never,
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="existing-appeal"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="appeal-form"]')).toBeNull();
    expect(el.querySelector('[data-testid="appeal-reason"]')?.textContent).toContain(
      'My detailed appeal reason',
    );
    expect(el.querySelector('[data-testid="appeal-timeline"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="timeline-step-submitted"]')).toBeTruthy();
  });

  it('should render reviewer notes when present on an existing appeal', () => {
    component.existingAppeal.set(
      buildAppeal({
        status: 'denied',
        reviewer_notes: 'Insufficient evidence provided.',
        reviewed_at: '2026-03-13T10:00:00Z',
        resolved_at: '2026-03-14T10:00:00Z',
      }) as never,
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="appeal-reviewer-notes"]')?.textContent).toContain(
      'Insufficient evidence provided.',
    );
  });

  it('should render the file list and count after files are added', () => {
    const files = [
      stubFile('a.jpg', 'image/jpeg', 1500),
      stubFile('b.pdf', 'application/pdf', 2 * 1024 * 1024),
    ];
    component.onFileSelect({
      target: { files, value: '' } as unknown as HTMLInputElement,
    } as unknown as Event);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="appeal-file-list"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="file-item-0"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="file-item-1"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="file-count"]')?.textContent).toContain('2 / 5');
  });

  it('should disable the submit button until reason is valid', () => {
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('[data-testid="btn-submit-appeal"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    component.reason.set('A'.repeat(60));
    fixture.detectChanges();
    expect(btn.disabled).toBe(false);
  });

  it('should render file errors region when validation fails', () => {
    component.fileErrors.set(['appeal.error_invalid_type']);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="file-errors"]')).toBeTruthy();
  });

  it('should call ngOnDestroy without error (unsubscribes)', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
