import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ConfirmDialogService } from './confirm-dialog.service';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let element: HTMLElement;
  let service: ConfirmDialogService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [provideHttpClient()],
    }).compileComponents();

    service = TestBed.inject(ConfirmDialogService);
    fixture = TestBed.createComponent(ConfirmDialogComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should not render dialog when not visible', () => {
    const dialog = element.querySelector('[data-testid="confirm-dialog"]');
    expect(dialog).toBeNull();
  });

  describe('when dialog is open', () => {
    beforeEach(() => {
      service.confirm({
        title: 'Delete Item',
        message: 'Are you sure you want to delete this item?',
        confirmText: 'Delete',
        cancelText: 'Keep',
        variant: 'danger',
      });
      fixture.detectChanges();
    });

    it('should render the dialog', () => {
      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog).toBeTruthy();
    });

    it('should display the title', () => {
      const title = element.querySelector('#confirm-dialog-title');
      expect(title?.textContent?.trim()).toBe('Delete Item');
    });

    it('should display the message', () => {
      const message = element.querySelector('#confirm-dialog-message');
      expect(message?.textContent?.trim()).toBe('Are you sure you want to delete this item?');
    });

    it('should display custom confirm text', () => {
      const confirmBtn = element.querySelector(
        '[data-testid="confirm-dialog-confirm"]',
      );
      expect(confirmBtn?.textContent?.trim()).toBe('Delete');
    });

    it('should display custom cancel text', () => {
      const cancelBtn = element.querySelector(
        '[data-testid="confirm-dialog-cancel"]',
      );
      expect(cancelBtn?.textContent?.trim()).toBe('Keep');
    });

    it('should have role="dialog"', () => {
      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog?.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-modal="true"', () => {
      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-labelledby pointing to title', () => {
      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog?.getAttribute('aria-labelledby')).toBe('confirm-dialog-title');
    });

    it('should have aria-describedby pointing to message', () => {
      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog?.getAttribute('aria-describedby')).toBe('confirm-dialog-message');
    });

    it('should apply danger variant CSS class', () => {
      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog?.classList.contains('confirm-dialog--danger')).toBe(true);
    });

    it('should resolve true when confirm button is clicked', async () => {
      // Re-open to capture the promise
      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();

      const confirmBtn = element.querySelector(
        '[data-testid="confirm-dialog-confirm"]',
      ) as HTMLButtonElement;
      confirmBtn.click();

      expect(await promise).toBe(true);
    });

    it('should resolve false when cancel button is clicked', async () => {
      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();

      const cancelBtn = element.querySelector(
        '[data-testid="confirm-dialog-cancel"]',
      ) as HTMLButtonElement;
      cancelBtn.click();

      expect(await promise).toBe(false);
    });

    it('should resolve false when backdrop is clicked', async () => {
      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();

      const backdrop = element.querySelector(
        '[data-testid="confirm-dialog-backdrop"]',
      ) as HTMLElement;
      backdrop.click();

      expect(await promise).toBe(false);
    });

    it('should hide dialog after confirm', async () => {
      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();

      const confirmBtn = element.querySelector(
        '[data-testid="confirm-dialog-confirm"]',
      ) as HTMLButtonElement;
      confirmBtn.click();
      await promise;
      fixture.detectChanges();

      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog).toBeNull();
    });

    it('should hide dialog after cancel', async () => {
      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();

      const cancelBtn = element.querySelector(
        '[data-testid="confirm-dialog-cancel"]',
      ) as HTMLButtonElement;
      cancelBtn.click();
      await promise;
      fixture.detectChanges();

      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog).toBeNull();
    });

    it('should resolve false on Escape key', async () => {
      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();

      const backdrop = element.querySelector(
        '[data-testid="confirm-dialog-backdrop"]',
      ) as HTMLElement;
      backdrop.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(await promise).toBe(false);
    });

    it('should resolve true on Enter key', async () => {
      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();

      const backdrop = element.querySelector(
        '[data-testid="confirm-dialog-backdrop"]',
      ) as HTMLElement;
      backdrop.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );

      expect(await promise).toBe(true);
    });

    it('should render backdrop', () => {
      const backdrop = element.querySelector('[data-testid="confirm-dialog-backdrop"]');
      expect(backdrop).toBeTruthy();
    });

    it('should not propagate click from dialog to backdrop', () => {
      let result: boolean | undefined;
      service.confirm({ title: 'T', message: 'M' }).then((v) => {
        result = v;
      });
      fixture.detectChanges();

      const dialog = element.querySelector(
        '[data-testid="confirm-dialog"]',
      ) as HTMLElement;
      dialog.click();

      // Dialog click should NOT resolve the promise (click stopped propagation)
      expect(result).toBeUndefined();
    });
  });

  describe('with default options', () => {
    beforeEach(() => {
      service.confirm({ title: 'Simple Title', message: 'Simple Message' });
      fixture.detectChanges();
    });

    it('should use default confirm text from i18n key', () => {
      const confirmBtn = element.querySelector(
        '[data-testid="confirm-dialog-confirm"]',
      );
      // Since there's no translation loaded, the i18n key itself is rendered
      expect(confirmBtn?.textContent?.trim()).toBe('confirm_dialog.confirm');
    });

    it('should use default cancel text from i18n key', () => {
      const cancelBtn = element.querySelector(
        '[data-testid="confirm-dialog-cancel"]',
      );
      expect(cancelBtn?.textContent?.trim()).toBe('confirm_dialog.cancel');
    });

    it('should apply info variant by default', () => {
      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog?.classList.contains('confirm-dialog--info')).toBe(true);
    });
  });

  describe('with warning variant', () => {
    beforeEach(() => {
      service.confirm({ title: 'Warn', message: 'Warning!', variant: 'warning' });
      fixture.detectChanges();
    });

    it('should apply warning variant CSS class', () => {
      const dialog = element.querySelector('[data-testid="confirm-dialog"]');
      expect(dialog?.classList.contains('confirm-dialog--warning')).toBe(true);
    });

    it('should apply warning variant to confirm button', () => {
      const confirmBtn = element.querySelector('[data-testid="confirm-dialog-confirm"]');
      expect(confirmBtn?.classList.contains('confirm-dialog__btn--warning')).toBe(true);
    });
  });

  describe('signal/computed outputs', () => {
    it('should expose visible() as false initially', () => {
      expect(fixture.componentInstance.visible()).toBe(false);
    });

    it('should expose visible() as true when service opens a dialog', () => {
      service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();
      expect(fixture.componentInstance.visible()).toBe(true);
    });

    it('should default variant() to info when none provided', () => {
      service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();
      expect(fixture.componentInstance.variant()).toBe('info');
    });

    it('should reflect the danger variant via variant()', () => {
      service.confirm({ title: 'T', message: 'M', variant: 'danger' });
      fixture.detectChanges();
      expect(fixture.componentInstance.variant()).toBe('danger');
    });

    it('should expose options() with the resolved confirm/cancel defaults', () => {
      service.confirm({ title: 'Hello', message: 'World' });
      fixture.detectChanges();
      const opts = fixture.componentInstance.options();
      expect(opts.title).toBe('Hello');
      expect(opts.message).toBe('World');
      expect(opts.confirmText).toBe('confirm_dialog.confirm');
      expect(opts.cancelText).toBe('confirm_dialog.cancel');
    });
  });

  describe('focus management', () => {
    it('should focus the dialog panel after open (effect + queueMicrotask)', async () => {
      service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();
      // queueMicrotask scheduled inside the effect — let it flush.
      await Promise.resolve();
      await Promise.resolve();

      const panel = element.querySelector(
        '[data-testid="confirm-dialog"]',
      ) as HTMLElement;
      expect(document.activeElement).toBe(panel);
    });

    it('should restore focus to the previously focused element after confirm', async () => {
      // Create an element that holds focus before the dialog opens.
      const trigger = document.createElement('button');
      trigger.setAttribute('data-testid', 'external-trigger');
      document.body.appendChild(trigger);
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();

      const confirmBtn = element.querySelector(
        '[data-testid="confirm-dialog-confirm"]',
      ) as HTMLButtonElement;
      confirmBtn.click();
      await promise;

      expect(document.activeElement).toBe(trigger);
      trigger.remove();
    });

    it('should restore focus to the previously focused element after cancel', async () => {
      const trigger = document.createElement('button');
      document.body.appendChild(trigger);
      trigger.focus();

      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();

      const cancelBtn = element.querySelector(
        '[data-testid="confirm-dialog-cancel"]',
      ) as HTMLButtonElement;
      cancelBtn.click();
      await promise;

      expect(document.activeElement).toBe(trigger);
      trigger.remove();
    });

    it('should not throw when the previously focused element is not an HTMLElement', async () => {
      // Blur everything so document.activeElement falls back to <body>.
      (document.activeElement as HTMLElement | null)?.blur?.();

      const promise = service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();
      await Promise.resolve();

      const cancelBtn = element.querySelector(
        '[data-testid="confirm-dialog-cancel"]',
      ) as HTMLButtonElement;
      expect(() => cancelBtn.click()).not.toThrow();
      expect(await promise).toBe(false);
    });
  });

  describe('nullish-coalescing button text (?? \'\' arms)', () => {
    // confirm() always substitutes a default for confirmText/cancelText, so the
    // `?? ''` fallback in the template never fires via the public API. We drive the
    // arm by writing the service's internal signal directly with undefined texts.
    interface WithInternalState {
      _state: {
        set(value: import('./confirm-dialog.model').ConfirmDialogState): void;
      };
    }

    it('should render empty string when confirmText/cancelText are undefined', () => {
      const internal = service as unknown as WithInternalState;
      internal._state.set({
        visible: true,
        options: {
          title: 'T',
          message: 'M',
          // confirmText + cancelText intentionally omitted -> undefined -> `?? ''`
          variant: 'info',
        },
        resolve: null,
      });
      fixture.detectChanges();

      const confirmBtn = element.querySelector(
        '[data-testid="confirm-dialog-confirm"]',
      );
      const cancelBtn = element.querySelector(
        '[data-testid="confirm-dialog-cancel"]',
      );
      // The `?? ''` fallback yields an empty (whitespace-only) translated label.
      expect(confirmBtn?.textContent?.trim()).toBe('');
      expect(cancelBtn?.textContent?.trim()).toBe('');
    });
  });

  describe('defensive guards when the dialog panel is absent', () => {
    // The dialogPanel viewChild resolves to undefined while the @if(visible())
    // block is NOT rendered. onKeydown / trapFocus are only DOM-bound on the
    // backdrop in real usage, but calling onKeydown directly with the dialog
    // hidden exercises the `if (panel)` false arm (queueMicrotask) and the
    // `if (!panel) return` guard in trapFocus.
    it('should not throw when Tab is handled while the panel is not rendered', () => {
      const component = fixture.componentInstance;
      expect(component.dialogPanel()).toBeUndefined();

      const evt = new KeyboardEvent('keydown', { key: 'Tab' });
      const prevented = vi.spyOn(evt, 'preventDefault');
      expect(() => component.onKeydown(evt)).not.toThrow();
      // trapFocus bailed out at `if (!panel) return` — no default prevented.
      expect(prevented).not.toHaveBeenCalled();
    });
  });

  describe('keyboard focus trap', () => {
    // NOTE: the trap lives in ConfirmDialogComponent.onKeydown -> trapFocus, which
    // is bound on the backdrop element. The dialog panel template stops keydown
    // propagation, so a Tab pressed while focus is inside the panel never reaches
    // onKeydown via DOM bubbling. We therefore characterize trapFocus by calling
    // the public onKeydown() handler directly (it reads document.activeElement +
    // the live dialogPanel viewChild). See prodBugFlag note in the run summary.
    let component: ConfirmDialogComponent;

    beforeEach(async () => {
      component = fixture.componentInstance;
      // Attach so focus() actually updates document.activeElement reliably.
      document.body.appendChild(element);
      service.confirm({ title: 'T', message: 'M' });
      fixture.detectChanges();
      // Let the focus effect's microtask run.
      await Promise.resolve();
      await Promise.resolve();
    });

    afterEach(() => {
      element.remove();
    });

    function getPanel(): HTMLElement {
      return element.querySelector('[data-testid="confirm-dialog"]') as HTMLElement;
    }

    function getFocusables(): HTMLButtonElement[] {
      const panel = getPanel();
      return Array.from(panel.querySelectorAll<HTMLButtonElement>('button'));
    }

    it('should wrap focus to first element when Tab pressed on the last focusable', () => {
      const focusables = getFocusables();
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      last.focus();
      expect(document.activeElement).toBe(last);

      const evt = new KeyboardEvent('keydown', { key: 'Tab' });
      const prevented = vi.spyOn(evt, 'preventDefault');
      component.onKeydown(evt);

      expect(prevented).toHaveBeenCalled();
      expect(document.activeElement).toBe(first);
    });

    it('should NOT wrap when Tab pressed and focus is not on the last focusable', () => {
      const focusables = getFocusables();
      const first = focusables[0];
      first.focus();
      expect(document.activeElement).toBe(first);

      const evt = new KeyboardEvent('keydown', { key: 'Tab' });
      const prevented = vi.spyOn(evt, 'preventDefault');
      component.onKeydown(evt);

      // Default Tab behaviour preserved; focus not forcibly moved by the trap.
      expect(prevented).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(first);
    });

    it('should wrap focus to last element when Shift+Tab pressed on the first focusable', () => {
      const focusables = getFocusables();
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      first.focus();
      expect(document.activeElement).toBe(first);

      const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      const prevented = vi.spyOn(evt, 'preventDefault');
      component.onKeydown(evt);

      expect(prevented).toHaveBeenCalled();
      expect(document.activeElement).toBe(last);
    });

    it('should wrap focus to last element when Shift+Tab pressed while panel itself is focused', () => {
      const focusables = getFocusables();
      const last = focusables[focusables.length - 1];
      const panel = getPanel();
      panel.focus();
      expect(document.activeElement).toBe(panel);

      const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      const prevented = vi.spyOn(evt, 'preventDefault');
      component.onKeydown(evt);

      expect(prevented).toHaveBeenCalled();
      expect(document.activeElement).toBe(last);
    });

    it('should NOT wrap when Shift+Tab pressed and focus is not on first/panel', () => {
      const focusables = getFocusables();
      const last = focusables[focusables.length - 1];
      last.focus();

      const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      const prevented = vi.spyOn(evt, 'preventDefault');
      component.onKeydown(evt);

      expect(prevented).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(last);
    });

    it('should ignore other keys (no resolve, no preventDefault, no error)', () => {
      let result: boolean | undefined;
      service.confirm({ title: 'T', message: 'M' }).then((v) => {
        result = v;
      });
      fixture.detectChanges();

      const evt = new KeyboardEvent('keydown', { key: 'a' });
      const prevented = vi.spyOn(evt, 'preventDefault');
      expect(() => component.onKeydown(evt)).not.toThrow();

      expect(prevented).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });
});
