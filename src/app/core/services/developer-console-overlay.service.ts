/**
 * DeveloperConsoleOverlayService — manages global tilde (~) key toggle for the developer console overlay.
 *
 * Role-gated: only users with 'super_admin' or 'developer' role can activate.
 * PII-safe: never displays email, display name, or raw API keys.
 *
 * Phase 57.2 (CHO-117).
 */
import { Injectable, signal, computed, OnDestroy, inject } from '@angular/core';
import { RbacService } from './rbac.service';

@Injectable({ providedIn: 'root' })
export class DeveloperConsoleOverlayService implements OnDestroy {
  private readonly rbac = inject(RbacService);

  /** Whether the console overlay is currently visible. */
  readonly isOpen = signal(false);

  /** Whether the current user has permission to use the developer console. */
  readonly canAccess = computed(() => {
    return this.rbac.hasCapability('developer:console') ||
           this.rbac.hasRole('super_admin') ||
           this.rbac.hasRole('developer');
  });

  private readonly keydownHandler = (event: KeyboardEvent): void => {
    // Tilde key: '`' or '~' (Backquote key).
    // Ignore if user is typing in an input, textarea, or contenteditable.
    if (event.key === '`' && !this.isInputFocused(event)) {
      event.preventDefault();
      this.toggle();
    }
  };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.keydownHandler);
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.keydownHandler);
    }
  }

  /** Toggle the console overlay open/closed. No-op if user lacks permission. */
  toggle(): void {
    if (!this.canAccess()) {
      return; // Silently ignore: AC-4: role-gated, keypress silently ignored.
    }
    this.isOpen.update(v => !v);
  }

  /** Close the console overlay. */
  close(): void {
    this.isOpen.set(false);
  }

  /** Open the console overlay. */
  open(): void {
    if (this.canAccess()) {
      this.isOpen.set(true);
    }
  }

  /** Check if an input-like element is focused (avoid capturing keystrokes in text fields). */
  private isInputFocused(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      // Document, Window, or null target — definitely not an input.
      return false;
    }
    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' ||
           target.isContentEditable;
  }
}
