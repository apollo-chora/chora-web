import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-toast-container',
  imports: [TranslatePipe],
  template: `
    <div class="toast-container" data-testid="toast-container" aria-live="polite" role="log">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast toast--{{ toast.type }}"
          role="alert"
          [attr.data-testid]="'toast-' + toast.id"
          [attr.data-type]="toast.type">
          <span class="toast__icon" aria-hidden="true">
            @switch (toast.type) {
              @case ('success') { &#10003; }
              @case ('error') { &#10007; }
              @case ('warning') { &#9888; }
              @case ('info') { &#8505; }
            }
          </span>
          <span class="toast__message">{{ toast.message | translate }}</span>
          <button
            class="toast__dismiss"
            type="button"
            (click)="toastService.dismiss(toast.id)"
            [attr.aria-label]="'toast.dismiss' | translate"
            data-testid="toast-dismiss">
            &#10005;
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './toast-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainerComponent {
  protected readonly toastService = inject(ToastService);
}
