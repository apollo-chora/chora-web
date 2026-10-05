import { Injectable, signal, computed } from '@angular/core';
import { Toast, ToastType, DEFAULT_DURATIONS, MAX_VISIBLE_TOASTS } from './toast.model';

let nextId = 0;

function generateToastId(): string {
  nextId++;
  return `toast-${nextId}`;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly toasts = computed(() => this._toasts());

  show(message: string, type: ToastType, duration?: number): string {
    const id = generateToastId();
    const resolvedDuration = duration ?? DEFAULT_DURATIONS[type];

    const toast: Toast = { id, message, type, duration: resolvedDuration };

    this._toasts.update((current) => {
      const updated = [...current, toast];
      // Enforce FIFO max — remove oldest when exceeding limit
      if (updated.length > MAX_VISIBLE_TOASTS) {
        const removed = updated.slice(0, updated.length - MAX_VISIBLE_TOASTS);
        for (const r of removed) {
          this.clearTimer(r.id);
        }
        return updated.slice(updated.length - MAX_VISIBLE_TOASTS);
      }
      return updated;
    });

    this.scheduleAutoDismiss(id, resolvedDuration);
    return id;
  }

  dismiss(id: string): void {
    this.clearTimer(id);
    this._toasts.update((current) => current.filter((t) => t.id !== id));
  }

  dismissAll(): void {
    for (const [id] of this.timers) {
      this.clearTimer(id);
    }
    this._toasts.set([]);
  }

  private scheduleAutoDismiss(id: string, duration: number): void {
    const timer = setTimeout(() => {
      this.dismiss(id);
    }, duration);
    this.timers.set(id, timer);
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}
