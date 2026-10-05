import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import {
  SuspendDialogComponent,
  ALL_SUSPENSION_REASONS,
  ALL_SUSPENSION_DURATIONS,
  SUSPENSION_REASON_LABELS,
  SUSPENSION_DURATION_LABELS,
} from './suspend-dialog.component';
import { GovernanceService } from '../../services/governance.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

describe('SuspendDialogComponent', () => {
  let fixture: ComponentFixture<SuspendDialogComponent>;
  let component: SuspendDialogComponent;

  const mockGovernanceService = {
    applyRestriction: vi.fn().mockReturnValue(of(true)),
  };

  const mockToast = { show: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [SuspendDialogComponent],
      providers: [
        { provide: GovernanceService, useValue: mockGovernanceService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuspendDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('targetGcid', 'gcid-001');
    fixture.componentRef.setInput('targetDisplayName', 'Alice Smith');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start at form step', () => {
    expect(component.step()).toBe('form');
  });

  it('should validate form requires reason and duration', () => {
    expect(component.formValid()).toBe(false);

    component.selectedReason.set('policy_violation');
    component.selectedDuration.set('30_days');
    expect(component.formValid()).toBe(true);
  });

  it('should advance to confirm step when form is valid', () => {
    component.selectedReason.set('harassment');
    component.selectedDuration.set('7_days');
    component.goToConfirm();
    expect(component.step()).toBe('confirm');
  });

  it('should not advance to confirm when form is invalid', () => {
    component.goToConfirm();
    expect(component.step()).toBe('form');
  });

  it('should go back to form from confirm', () => {
    component.step.set('confirm');
    component.goBackToForm();
    expect(component.step()).toBe('form');
  });

  it('should emit closed on closeDialog', () => {
    const emitSpy = vi.spyOn(component.closed, 'emit');
    component.closeDialog();
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should not close on backdrop click when submitting', () => {
    component.submitting.set(true);
    const emitSpy = vi.spyOn(component.closed, 'emit');
    component.onBackdropClick();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Exported constants
  // -------------------------------------------------------------------------

  it('should expose the full list of suspension reasons', () => {
    expect(component.allReasons).toBe(ALL_SUSPENSION_REASONS);
    expect(component.allReasons).toContain('policy_violation');
    expect(component.allReasons).toContain('other');
    expect(component.allReasons.length).toBe(6);
  });

  it('should expose the full list of suspension durations', () => {
    expect(component.allDurations).toBe(ALL_SUSPENSION_DURATIONS);
    expect(component.allDurations).toEqual([
      '7_days',
      '30_days',
      '90_days',
      'permanent',
    ]);
  });

  it('should expose reason and duration label maps', () => {
    expect(component.reasonLabels).toBe(SUSPENSION_REASON_LABELS);
    expect(component.durationLabels).toBe(SUSPENSION_DURATION_LABELS);
    expect(component.reasonLabels.harassment).toBe(
      'admin.governance.suspend_reason_harassment',
    );
    expect(component.durationLabels.permanent).toBe(
      'admin.governance.suspend_duration_permanent',
    );
  });

  // -------------------------------------------------------------------------
  // Form change handlers
  // -------------------------------------------------------------------------

  it('should set reason on change and clear it when empty', () => {
    component.onReasonChange('content_abuse');
    expect(component.selectedReason()).toBe('content_abuse');

    component.onReasonChange('');
    expect(component.selectedReason()).toBeNull();
  });

  it('should set duration on change and clear it when empty', () => {
    component.onDurationChange('90_days');
    expect(component.selectedDuration()).toBe('90_days');

    component.onDurationChange('');
    expect(component.selectedDuration()).toBeNull();
  });

  it('should toggle notify email signal', () => {
    expect(component.notifyEmail()).toBe(true);
    component.onNotifyEmailChange(false);
    expect(component.notifyEmail()).toBe(false);
    component.onNotifyEmailChange(true);
    expect(component.notifyEmail()).toBe(true);
  });

  it('should update admin notes signal', () => {
    component.onAdminNotesChange('manual review pending');
    expect(component.adminNotes()).toBe('manual review pending');
  });

  // -------------------------------------------------------------------------
  // Effect / reset behaviour
  // -------------------------------------------------------------------------

  it('should reset the form to defaults when the dialog becomes visible', () => {
    // Dirty the form state.
    component.selectedReason.set('harassment');
    component.selectedDuration.set('30_days');
    component.notifyEmail.set(false);
    component.adminNotes.set('dirty');
    component.step.set('confirm');
    component.submitting.set(true);

    // Toggle visibility off then on to re-trigger the open effect.
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    expect(component.selectedReason()).toBeNull();
    expect(component.selectedDuration()).toBeNull();
    expect(component.notifyEmail()).toBe(true);
    expect(component.adminNotes()).toBe('');
    expect(component.step()).toBe('form');
    expect(component.submitting()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Template rendering
  // -------------------------------------------------------------------------

  it('should render the dialog shell when visible', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="suspend-dialog"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="suspend-dialog-backdrop"]')).toBeTruthy();
  });

  it('should not render the dialog shell when not visible', () => {
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="suspend-dialog"]')).toBeNull();
  });

  it('should set dialog accessibility attributes', () => {
    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('[data-testid="suspend-dialog"]');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('suspend-dialog-title');
    expect(dialog?.getAttribute('aria-describedby')).toBe('suspend-dialog-desc');
  });

  it('should render the display name in the target line', () => {
    const el = fixture.nativeElement as HTMLElement;
    const target = el.querySelector('#suspend-dialog-desc');
    expect(target?.textContent).toContain('Alice Smith');
  });

  it('should fall back to gcid when display name is empty', () => {
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('targetDisplayName', '');
    fixture.componentRef.setInput('targetGcid', 'gcid-xyz');
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const target = el.querySelector('#suspend-dialog-desc');
    expect(target?.textContent).toContain('gcid-xyz');
  });

  it('should render the form step by default and the reason options', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="suspend-dialog-form"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="suspend-dialog-confirm"]')).toBeNull();
    const options = el.querySelectorAll('[data-testid="suspend-reason-select"] option');
    // placeholder + 6 reasons
    expect(options.length).toBe(ALL_SUSPENSION_REASONS.length + 1);
  });

  it('should disable the next button until the form is valid', () => {
    const el = fixture.nativeElement as HTMLElement;
    const nextBtn = el.querySelector(
      '[data-testid="suspend-next-btn"]',
    ) as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);

    component.selectedReason.set('payment_fraud');
    component.selectedDuration.set('7_days');
    fixture.detectChanges();
    expect(nextBtn.disabled).toBe(false);
  });

  it('should render the confirmation summary when on confirm step', () => {
    component.selectedReason.set('harassment');
    component.selectedDuration.set('30_days');
    component.adminNotes.set('investigation note');
    component.step.set('confirm');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="suspend-dialog-confirm"]')).toBeTruthy();
    expect(
      el.querySelector('[data-testid="confirm-reason"]')?.textContent,
    ).toContain(SUSPENSION_REASON_LABELS.harassment);
    expect(
      el.querySelector('[data-testid="confirm-duration"]')?.textContent,
    ).toContain(SUSPENSION_DURATION_LABELS['30_days']);
    expect(
      el.querySelector('[data-testid="confirm-notes"]')?.textContent,
    ).toContain('investigation note');
  });

  it('should omit the notes summary row when notes are empty', () => {
    component.selectedReason.set('other');
    component.selectedDuration.set('permanent');
    component.adminNotes.set('');
    component.step.set('confirm');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="confirm-notes"]')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // confirmSuspend — success path
  // -------------------------------------------------------------------------

  it('should submit, emit suspended, toast success and close on success', () => {
    mockGovernanceService.applyRestriction.mockReturnValue(of(true));
    component.selectedReason.set('content_abuse');
    component.selectedDuration.set('90_days');
    component.notifyEmail.set(false);
    component.adminNotes.set('see ticket 42');

    const suspendedSpy = vi.spyOn(component.suspended, 'emit');
    const closedSpy = vi.spyOn(component.closed, 'emit');

    component.confirmSuspend();

    expect(mockGovernanceService.applyRestriction).toHaveBeenCalledWith({
      target_gcid: 'gcid-001',
      tier: 'suspended',
      reason: 'content_abuse|90_days|notify:false|notes:see ticket 42',
    });
    expect(mockToast.show).toHaveBeenCalledWith(
      'admin.governance.suspend_success',
      'success',
    );
    expect(suspendedSpy).toHaveBeenCalledWith({
      target_gcid: 'gcid-001',
      reason: 'content_abuse',
      duration: '90_days',
      notify_email: false,
      admin_notes: 'see ticket 42',
    });
    expect(closedSpy).toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  it('should not submit when reason or duration is missing', () => {
    component.selectedReason.set(null);
    component.selectedDuration.set('7_days');
    component.confirmSuspend();
    expect(mockGovernanceService.applyRestriction).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // confirmSuspend — falsy result path (service returns null)
  // -------------------------------------------------------------------------

  it('should toast error and not emit when service returns a falsy result', () => {
    mockGovernanceService.applyRestriction.mockReturnValue(of(null));
    component.selectedReason.set('policy_violation');
    component.selectedDuration.set('7_days');

    const suspendedSpy = vi.spyOn(component.suspended, 'emit');
    const closedSpy = vi.spyOn(component.closed, 'emit');

    component.confirmSuspend();

    expect(mockToast.show).toHaveBeenCalledWith(
      'admin.governance.suspend_error',
      'error',
    );
    expect(suspendedSpy).not.toHaveBeenCalled();
    expect(closedSpy).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // confirmSuspend — error path (observable errors)
  // -------------------------------------------------------------------------

  it('should toast error and reset submitting when the observable errors', () => {
    mockGovernanceService.applyRestriction.mockReturnValue(
      throwError(() => new Error('500 server error')),
    );
    component.selectedReason.set('suspicious_activity');
    component.selectedDuration.set('30_days');

    const suspendedSpy = vi.spyOn(component.suspended, 'emit');

    component.confirmSuspend();

    expect(mockToast.show).toHaveBeenCalledWith(
      'admin.governance.suspend_error',
      'error',
    );
    expect(suspendedSpy).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Backdrop / keyboard
  // -------------------------------------------------------------------------

  it('should close on backdrop click when not submitting', () => {
    component.submitting.set(false);
    const emitSpy = vi.spyOn(component.closed, 'emit');
    component.onBackdropClick();
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should close on Escape keydown when not submitting', () => {
    const emitSpy = vi.spyOn(component.closed, 'emit');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    component.onKeydown(event);
    expect(preventSpy).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should not close on Escape keydown while submitting', () => {
    component.submitting.set(true);
    const emitSpy = vi.spyOn(component.closed, 'emit');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should route Tab keydown through the focus trap without throwing', () => {
    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    expect(() => component.onKeydown(event)).not.toThrow();
  });

  it('should ignore unrelated keydown keys', () => {
    const emitSpy = vi.spyOn(component.closed, 'emit');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'a' }));
    expect(emitSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Focus trap
  // -------------------------------------------------------------------------

  it('should wrap focus backward on Shift+Tab from the first focusable element', () => {
    // jsdom only moves document.activeElement for elements attached to the
    // live document, and never focuses a disabled control — so mount the
    // fixture and make the form valid (which enables the last button).
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    component.selectedReason.set('harassment');
    component.selectedDuration.set('7_days');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('[data-testid="suspend-dialog"]') as HTMLElement;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    expect(document.activeElement).toBe(first);

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    component.onKeydown(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);

    (fixture.nativeElement as HTMLElement).remove();
  });

  it('should wrap focus forward on Tab from the last focusable element', () => {
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    component.selectedReason.set('harassment');
    component.selectedDuration.set('7_days');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('[data-testid="suspend-dialog"]') as HTMLElement;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    component.onKeydown(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);

    (fixture.nativeElement as HTMLElement).remove();
  });

  // -------------------------------------------------------------------------
  // Focus restore + lifecycle
  // -------------------------------------------------------------------------

  it('should restore focus to the previously focused element on close', () => {
    // Place a focused trigger element before re-opening the dialog.
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    component.closeDialog();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it('should unsubscribe on destroy without throwing', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // confirmSuspend — guard short-circuit on missing duration (other OR arm)
  // -------------------------------------------------------------------------

  it('should not submit when duration is missing but reason is present', () => {
    // Covers the `!duration` arm of `if (!reason || !duration) return;`
    // (the existing missing-reason test only exercises the `!reason` arm).
    component.selectedReason.set('harassment');
    component.selectedDuration.set(null);
    component.confirmSuspend();
    expect(mockGovernanceService.applyRestriction).not.toHaveBeenCalled();
    expect(component.submitting()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Open effect — focus the dialog panel via queueMicrotask (if (panel) TRUE)
  // -------------------------------------------------------------------------

  it('should focus the dialog panel after the open effect microtask runs', async () => {
    // The open effect schedules a queueMicrotask that focuses the panel when
    // present. Re-open the dialog and flush microtasks so the `if (panel)`
    // TRUE arm executes against a live panel.
    document.body.appendChild(fixture.nativeElement as HTMLElement);

    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    await Promise.resolve();
    await Promise.resolve();

    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('[data-testid="suspend-dialog"]') as HTMLElement;
    expect(document.activeElement).toBe(panel);

    (fixture.nativeElement as HTMLElement).remove();
  });

  // -------------------------------------------------------------------------
  // trapFocus — early-return guards
  // -------------------------------------------------------------------------

  it('should no-op the focus trap when the dialog panel is absent', () => {
    // With visible() false the @if removes the panel, so the dialogPanel
    // viewChild resolves to undefined -> trapFocus hits the `if (!panel) return`
    // guard. onKeydown must still not throw.
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    expect(component.dialogPanel()).toBeUndefined();

    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    expect(() => component.onKeydown(event)).not.toThrow();
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('should no-op the focus trap when the panel has no focusable elements', () => {
    // Force the `focusableElements.length === 0` early return by pointing the
    // dialogPanel viewChild at an empty element with no focusable children.
    const empty = document.createElement('div');
    vi.spyOn(component, 'dialogPanel').mockReturnValue({
      nativeElement: empty,
    } as unknown as ReturnType<SuspendDialogComponent['dialogPanel']>);

    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    expect(() => component.onKeydown(event)).not.toThrow();
    expect(preventSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // trapFocus — OR arm (panel itself focused) + non-wrapping arms
  // -------------------------------------------------------------------------

  it('should wrap focus backward on Shift+Tab when the panel itself is focused', () => {
    // Covers the `document.activeElement === panel` OR arm of the shift branch.
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    component.selectedReason.set('harassment');
    component.selectedDuration.set('7_days');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('[data-testid="suspend-dialog"]') as HTMLElement;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const last = focusables[focusables.length - 1];
    panel.focus();
    expect(document.activeElement).toBe(panel);

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    component.onKeydown(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);

    (fixture.nativeElement as HTMLElement).remove();
  });

  it('should NOT wrap on Shift+Tab when focus is on a middle focusable element', () => {
    // Covers the FALSE arm of the shift branch (activeElement is neither first
    // nor panel) — preventDefault must NOT fire and focus stays put.
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    component.selectedReason.set('harassment');
    component.selectedDuration.set('7_days');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('[data-testid="suspend-dialog"]') as HTMLElement;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const last = focusables[focusables.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    component.onKeydown(event);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(last);

    (fixture.nativeElement as HTMLElement).remove();
  });

  it('should NOT wrap forward on Tab when focus is on a non-last focusable element', () => {
    // Covers the FALSE arm of the forward branch (`activeElement === last` is
    // false) — preventDefault must NOT fire and focus stays put.
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    component.selectedReason.set('harassment');
    component.selectedDuration.set('7_days');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('[data-testid="suspend-dialog"]') as HTMLElement;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    first.focus();
    expect(document.activeElement).toBe(first);

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    component.onKeydown(event);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(first);

    (fixture.nativeElement as HTMLElement).remove();
  });

  // -------------------------------------------------------------------------
  // restoreFocus — previously-focused element is NOT an HTMLElement
  // -------------------------------------------------------------------------

  it('should not throw on close when the previously focused element is not an HTMLElement', () => {
    // Open with document.activeElement = <body> (not focusable as a stored
    // trigger) so the `instanceof HTMLElement` guard is FALSE on restore.
    (document.activeElement as HTMLElement | null)?.blur?.();

    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    const closedSpy = vi.spyOn(component.closed, 'emit');
    expect(() => component.closeDialog()).not.toThrow();
    expect(closedSpy).toHaveBeenCalled();
  });
});
