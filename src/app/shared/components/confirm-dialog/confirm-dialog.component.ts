import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  effect,
  viewChild,
  ElementRef,
} from '@angular/core';
import { ConfirmDialogService } from './confirm-dialog.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-confirm-dialog',
  imports: [TranslatePipe],
  template: `
    @if (visible()) {
      <div
        class="confirm-dialog-backdrop"
        data-testid="confirm-dialog-backdrop"
        role="presentation"
        tabindex="-1"
        (click)="onBackdropClick()"
        (keydown)="onKeydown($event)">
        <div
          #dialogPanel
          class="confirm-dialog confirm-dialog--{{ variant() }}"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="'confirm-dialog-title'"
          [attr.aria-describedby]="'confirm-dialog-message'"
          tabindex="-1"
          data-testid="confirm-dialog"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()">
          <h2 id="confirm-dialog-title" class="confirm-dialog__title">
            {{ options().title | translate }}
          </h2>
          <p id="confirm-dialog-message" class="confirm-dialog__message">
            {{ options().message | translate }}
          </p>
          <div class="confirm-dialog__actions">
            <button
              type="button"
              class="confirm-dialog__btn confirm-dialog__btn--cancel"
              data-testid="confirm-dialog-cancel"
              (click)="onCancel()">
              {{ (options().cancelText ?? '') | translate }}
            </button>
            <button
              #confirmBtn
              type="button"
              class="confirm-dialog__btn confirm-dialog__btn--confirm confirm-dialog__btn--{{ variant() }}"
              data-testid="confirm-dialog-confirm"
              (click)="onConfirm()">
              {{ (options().confirmText ?? '') | translate }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  private readonly dialogService = inject(ConfirmDialogService);

  readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');

  readonly visible = computed(() => this.dialogService.state().visible);
  readonly options = computed(() => this.dialogService.state().options);
  readonly variant = computed(() => this.dialogService.state().options.variant ?? 'info');

  private previouslyFocusedElement: Element | null = null;

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.previouslyFocusedElement = document.activeElement;
        // Focus dialog panel on next microtask (after Angular renders the @if block)
        queueMicrotask(() => {
          const panel = this.dialogPanel();
          if (panel) {
            panel.nativeElement.focus();
          }
        });
      }
    });
  }

  onConfirm(): void {
    this.restoreFocus();
    this.dialogService._resolve(true);
  }

  onCancel(): void {
    this.restoreFocus();
    this.dialogService._resolve(false);
  }

  onBackdropClick(): void {
    this.onCancel();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.onConfirm();
      return;
    }

    // Focus trap: Tab and Shift+Tab cycle within dialog
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.dialogPanel()?.nativeElement;
    if (!panel) return;

    const focusableElements = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    if (focusableElements.length === 0) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstFocusable || document.activeElement === panel) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  }

  private restoreFocus(): void {
    if (this.previouslyFocusedElement instanceof HTMLElement) {
      this.previouslyFocusedElement.focus();
    }
    this.previouslyFocusedElement = null;
  }
}
