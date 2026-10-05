export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

export interface ConfirmDialogState {
  visible: boolean;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
}

export const DEFAULT_CONFIRM_TEXT = 'confirm_dialog.confirm';
export const DEFAULT_CANCEL_TEXT = 'confirm_dialog.cancel';
