import { Injectable, signal } from '@angular/core';

export interface PendingAction {
  type: 'referral' | 'invite' | 'enroll';
  code: string;
  capturedAt: number;
}

const STORAGE_KEY = 'chora_pending_action';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable({ providedIn: 'root' })
export class PendingActionService {
  private readonly _action = signal<PendingAction | null>(this.loadFromStorage());

  readonly action = this._action.asReadonly();

  capture(action: PendingAction): void {
    this._action.set(action);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(action));
  }

  consume(): PendingAction | null {
    const action = this._action();
    this._action.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
    return action;
  }

  private loadFromStorage(): PendingAction | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const action = JSON.parse(raw) as PendingAction;
      if (Date.now() - action.capturedAt > MAX_AGE_MS) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return action;
    } catch {
      return null;
    }
  }
}
