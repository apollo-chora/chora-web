import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ModerationActionDialogComponent } from './moderation-action-dialog.component';
import type {
  FlaggedContentItem,
  ModerationActionRequest,
} from '../../models/moderation.model';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<FlaggedContentItem> = {}): FlaggedContentItem {
  return {
    id: 'flag-001',
    tenant_id: 'tenant-001',
    content_id: 'atom-123',
    content_type: 'atom',
    content_title: 'Photosynthesis Basics',
    content_excerpt: 'An excerpt about photosynthesis.',
    flagged_by_gcid: 'gcid-flagger',
    flagged_by_display_name: 'Jane Flagger',
    flag_reason: 'inappropriate',
    status: 'pending',
    assigned_moderator_gcid: null,
    assigned_moderator_name: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}

function setup(
  itemOverrides: Partial<FlaggedContentItem> = {},
  submitting = false,
): {
  fixture: ComponentFixture<ModerationActionDialogComponent>;
  element: HTMLElement;
  component: ModerationActionDialogComponent;
} {
  TestBed.configureTestingModule({
    imports: [ModerationActionDialogComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  const fixture = TestBed.createComponent(ModerationActionDialogComponent);
  fixture.componentRef.setInput('item', makeItem(itemOverrides));
  fixture.componentRef.setInput('submitting', submitting);
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();

  return { fixture, element, component: fixture.componentInstance };
}

function q(element: HTMLElement, testid: string): HTMLElement | null {
  return element.querySelector(`[data-testid="${testid}"]`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModerationActionDialogComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('shell render', () => {
    it('should create', () => {
      const { component } = setup();
      expect(component).toBeTruthy();
    });

    it('should render the dialog panel with role="dialog"', () => {
      const { element } = setup();
      const dialog = q(element, 'moderation-action-dialog');
      expect(dialog).toBeTruthy();
      expect(dialog?.getAttribute('role')).toBe('dialog');
    });

    it('should set the aria-label to the i18n key', () => {
      const { element } = setup();
      const dialog = q(element, 'moderation-action-dialog');
      expect(dialog?.getAttribute('aria-label')).toBe(
        'admin.moderation.action_dialog_title',
      );
    });

    it('should render the title using the i18n key', () => {
      const { element } = setup();
      const title = element.querySelector('.moderation-action-dialog__title');
      expect(title?.textContent?.trim()).toBe(
        'admin.moderation.action_dialog_title',
      );
    });

    it('should render the close button', () => {
      const { element } = setup();
      expect(q(element, 'btn-dialog-close')).toBeTruthy();
    });

    it('should render the cancel button', () => {
      const { element } = setup();
      expect(q(element, 'btn-dialog-cancel')).toBeTruthy();
    });

    it('should render the submit button', () => {
      const { element } = setup();
      expect(q(element, 'btn-dialog-submit')).toBeTruthy();
    });
  });

  describe('content summary', () => {
    it('should display the content title from the item input', () => {
      const { element } = setup({ content_title: 'Cell Division Deep Dive' });
      const summary = q(element, 'dialog-content-summary');
      expect(summary?.textContent).toContain('Cell Division Deep Dive');
    });

    it('should display the content type from the item input', () => {
      const { element } = setup({ content_type: 'comment' });
      const summary = q(element, 'dialog-content-summary');
      expect(summary?.textContent).toContain('comment');
    });
  });

  describe('decision select options', () => {
    it('should expose all four moderation decisions plus the empty choice', () => {
      const { element } = setup();
      const select = q(element, 'decision-select') as HTMLSelectElement;
      // 1 empty placeholder + 4 decisions
      expect(select.options.length).toBe(5);
    });

    it('should render each decision label as its i18n key', () => {
      const { element } = setup();
      const select = q(element, 'decision-select') as HTMLSelectElement;
      const texts = Array.from(select.options).map((o) => o.textContent?.trim());
      expect(texts).toContain('admin.moderation.decision_approve');
      expect(texts).toContain('admin.moderation.decision_request_edit');
      expect(texts).toContain('admin.moderation.decision_remove');
      expect(texts).toContain('admin.moderation.decision_restore');
    });

    it('should expose the constant arrays/maps on the instance', () => {
      const { component } = setup();
      expect(component.allDecisions).toEqual([
        'approve',
        'request_edit',
        'remove',
        'restore',
      ]);
      expect(component.decisionLabels.approve).toBe(
        'admin.moderation.decision_approve',
      );
    });
  });

  describe('initial form state', () => {
    it('should start with no selected decision', () => {
      const { component } = setup();
      expect(component.selectedDecision()).toBeNull();
    });

    it('should start with empty reason and notes', () => {
      const { component } = setup();
      expect(component.reason()).toBe('');
      expect(component.notes()).toBe('');
    });

    it('should be invalid initially', () => {
      const { component } = setup();
      expect(component.isValid()).toBe(false);
    });

    it('should report decisionVariant() as "default" with no decision', () => {
      const { component } = setup();
      expect(component.decisionVariant()).toBe('default');
    });

    it('should disable the submit button when invalid', () => {
      const { element } = setup();
      const submit = q(element, 'btn-dialog-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });

    it('should render the submit label (not submitting) initially', () => {
      const { element } = setup();
      const submit = q(element, 'btn-dialog-submit');
      expect(submit?.textContent?.trim()).toBe('admin.moderation.submit_action');
    });
  });

  describe('onDecisionChange', () => {
    it('should set the selected decision from a value', () => {
      const { component } = setup();
      component.onDecisionChange('remove');
      expect(component.selectedDecision()).toBe('remove');
    });

    it('should set the selected decision to null for the empty value', () => {
      const { component } = setup();
      component.onDecisionChange('approve');
      expect(component.selectedDecision()).toBe('approve');
      component.onDecisionChange('');
      expect(component.selectedDecision()).toBeNull();
    });

    it('should react to a native change event on the select', () => {
      const { fixture, element, component } = setup();
      const select = q(element, 'decision-select') as HTMLSelectElement;
      select.value = 'request_edit';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(component.selectedDecision()).toBe('request_edit');
    });
  });

  describe('decisionVariant computed', () => {
    it('should map approve -> success', () => {
      const { component } = setup();
      component.onDecisionChange('approve');
      expect(component.decisionVariant()).toBe('success');
    });

    it('should map restore -> success', () => {
      const { component } = setup();
      component.onDecisionChange('restore');
      expect(component.decisionVariant()).toBe('success');
    });

    it('should map request_edit -> warning', () => {
      const { component } = setup();
      component.onDecisionChange('request_edit');
      expect(component.decisionVariant()).toBe('warning');
    });

    it('should map remove -> danger', () => {
      const { component } = setup();
      component.onDecisionChange('remove');
      expect(component.decisionVariant()).toBe('danger');
    });

    it('should apply the success CSS class to the submit button for approve', () => {
      const { fixture, element, component } = setup();
      component.onDecisionChange('approve');
      fixture.detectChanges();
      const submit = q(element, 'btn-dialog-submit') as HTMLButtonElement;
      expect(submit.classList.contains('moderation-action-dialog__btn--success')).toBe(
        true,
      );
    });

    it('should apply the danger CSS class to the submit button for remove', () => {
      const { fixture, element, component } = setup();
      component.onDecisionChange('remove');
      fixture.detectChanges();
      const submit = q(element, 'btn-dialog-submit') as HTMLButtonElement;
      expect(submit.classList.contains('moderation-action-dialog__btn--danger')).toBe(
        true,
      );
    });

    it('should apply the warning CSS class to the submit button for request_edit', () => {
      const { fixture, element, component } = setup();
      component.onDecisionChange('request_edit');
      fixture.detectChanges();
      const submit = q(element, 'btn-dialog-submit') as HTMLButtonElement;
      expect(submit.classList.contains('moderation-action-dialog__btn--warning')).toBe(
        true,
      );
    });

    it('should apply the primary CSS class to the submit button by default', () => {
      const { element } = setup();
      const submit = q(element, 'btn-dialog-submit') as HTMLButtonElement;
      expect(submit.classList.contains('moderation-action-dialog__btn--primary')).toBe(
        true,
      );
    });
  });

  describe('onReasonChange / onNotesChange', () => {
    it('should update the reason signal', () => {
      const { component } = setup();
      component.onReasonChange('Violates policy');
      expect(component.reason()).toBe('Violates policy');
    });

    it('should update the notes signal', () => {
      const { component } = setup();
      component.onNotesChange('Internal context');
      expect(component.notes()).toBe('Internal context');
    });

    it('should react to a native input event on the reason textarea', () => {
      const { fixture, element, component } = setup();
      const textarea = q(element, 'reason-input') as HTMLTextAreaElement;
      textarea.value = 'typed reason';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.reason()).toBe('typed reason');
    });

    it('should react to a native input event on the notes textarea', () => {
      const { fixture, element, component } = setup();
      const textarea = q(element, 'notes-input') as HTMLTextAreaElement;
      textarea.value = 'typed notes';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.notes()).toBe('typed notes');
    });
  });

  describe('isValid computed', () => {
    it('should remain invalid when a decision is set but reason is blank whitespace', () => {
      const { component } = setup();
      component.onDecisionChange('approve');
      component.onReasonChange('   ');
      expect(component.isValid()).toBe(false);
    });

    it('should remain invalid when reason is set but no decision is chosen', () => {
      const { component } = setup();
      component.onReasonChange('A valid reason');
      expect(component.isValid()).toBe(false);
    });

    it('should become valid when both a decision and a non-empty reason are present', () => {
      const { component } = setup();
      component.onDecisionChange('remove');
      component.onReasonChange('Spam content');
      expect(component.isValid()).toBe(true);
    });

    it('should enable the submit button once valid', () => {
      const { fixture, element, component } = setup();
      component.onDecisionChange('approve');
      component.onReasonChange('Looks good');
      fixture.detectChanges();
      const submit = q(element, 'btn-dialog-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });
  });

  describe('submitting input', () => {
    it('should render the submitting label when submitting is true', () => {
      const { element } = setup({}, true);
      const submit = q(element, 'btn-dialog-submit');
      expect(submit?.textContent?.trim()).toBe('admin.moderation.submitting');
    });

    it('should keep the submit button disabled while submitting even if valid', () => {
      const { fixture, element, component } = setup({}, true);
      component.onDecisionChange('approve');
      component.onReasonChange('Looks good');
      fixture.detectChanges();
      const submit = q(element, 'btn-dialog-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });
  });

  describe('onSubmit', () => {
    it('should NOT emit when invalid', () => {
      const { component } = setup();
      let emitted: ModerationActionRequest | undefined;
      component.submitAction.subscribe((v) => (emitted = v));
      component.onSubmit();
      expect(emitted).toBeUndefined();
    });

    it('should NOT emit when a decision is set but reason is blank', () => {
      const { component } = setup();
      let emitted: ModerationActionRequest | undefined;
      component.submitAction.subscribe((v) => (emitted = v));
      component.onDecisionChange('approve');
      component.onSubmit();
      expect(emitted).toBeUndefined();
    });

    it('should emit a trimmed ModerationActionRequest when valid', () => {
      const { component } = setup();
      let emitted: ModerationActionRequest | undefined;
      component.submitAction.subscribe((v) => (emitted = v));
      component.onDecisionChange('remove');
      component.onReasonChange('  Spam  ');
      component.onNotesChange('  side note  ');
      component.onSubmit();
      expect(emitted).toEqual({
        decision: 'remove',
        reason: 'Spam',
        notes: 'side note',
      });
    });

    it('should emit empty trimmed notes when notes are untouched', () => {
      const { component } = setup();
      let emitted: ModerationActionRequest | undefined;
      component.submitAction.subscribe((v) => (emitted = v));
      component.onDecisionChange('approve');
      component.onReasonChange('Approved after review');
      component.onSubmit();
      expect(emitted).toEqual({
        decision: 'approve',
        reason: 'Approved after review',
        notes: '',
      });
    });

    it('should emit when the submit button is clicked while valid', () => {
      const { fixture, element, component } = setup();
      let emitted: ModerationActionRequest | undefined;
      component.submitAction.subscribe((v) => (emitted = v));
      component.onDecisionChange('restore');
      component.onReasonChange('Restoring content');
      fixture.detectChanges();
      const submit = q(element, 'btn-dialog-submit') as HTMLButtonElement;
      submit.click();
      expect(emitted).toEqual({
        decision: 'restore',
        reason: 'Restoring content',
        notes: '',
      });
    });
  });

  describe('onCancel', () => {
    it('should emit the cancelled output when onCancel is called', () => {
      const { component } = setup();
      let cancelled = false;
      component.cancelled.subscribe(() => (cancelled = true));
      component.onCancel();
      expect(cancelled).toBe(true);
    });

    it('should emit cancelled when the close button is clicked', () => {
      const { element, component } = setup();
      let cancelled = false;
      component.cancelled.subscribe(() => (cancelled = true));
      (q(element, 'btn-dialog-close') as HTMLButtonElement).click();
      expect(cancelled).toBe(true);
    });

    it('should emit cancelled when the cancel button is clicked', () => {
      const { element, component } = setup();
      let cancelled = false;
      component.cancelled.subscribe(() => (cancelled = true));
      (q(element, 'btn-dialog-cancel') as HTMLButtonElement).click();
      expect(cancelled).toBe(true);
    });
  });
});
