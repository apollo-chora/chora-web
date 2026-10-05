import { Injectable, signal } from '@angular/core';
import {
  ConfirmOptions,
  ConfirmDialogState,
  DEFAULT_CONFIRM_TEXT,
  DEFAULT_CANCEL_TEXT,
} from './confirm-dialog.model';

const INITIAL_STATE: ConfirmDialogState = {
  visible: false,
  options: {
    title: '',
    message: '',
    confirmText: DEFAULT_CONFIRM_TEXT,
    cancelText: DEFAULT_CANCEL_TEXT,
    variant: 'info',
  },
  resolve: null,
};

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly _state = signal<ConfirmDialogState>({ ...INITIAL_STATE });

  readonly state = this._state.asReadonly();

  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this._state.set({
        visible: true,
        options: {
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? DEFAULT_CONFIRM_TEXT,
          cancelText: options.cancelText ?? DEFAULT_CANCEL_TEXT,
          variant: options.variant ?? 'info',
        },
        resolve,
      });
    });
  }

  /** @internal — called by ConfirmDialogComponent */
  _resolve(value: boolean): void {
    const current = this._state();
    if (current.resolve) {
      current.resolve(value);
    }
    this._state.set({ ...INITIAL_STATE });
  }
}
