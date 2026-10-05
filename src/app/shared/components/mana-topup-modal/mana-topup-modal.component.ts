/**
 * ManaTopupModalComponent — presentation modal for the 402 `InsufficientMana`
 * upsell block. Renders the gap (required - balance), the recommended
 * top-up units / plan code, and a single CTA whose label switches by
 * whether the upsell carries a pre-minted `stripe_checkout_url`.
 *
 * Wave-2 fixture provider pattern intentionally avoided — the component
 * is stateless presentation, fully driven by the typed Phase A shape
 * (`InsufficientManaUpsell` + `ManaActionCode`).
 *
 * Parent owns:
 *   - show/hide (`@if` around the embed in the parent template)
 *   - the actual `mana.topup(...)` BFF call (or `window.open(url)` when
 *     the upsell carries `stripe_checkout_url`)
 *   - re-load of `/api/v1/me/mana` on success
 *
 * Outputs:
 *   - `topupRequested` — CTA clicked; parent decides whether to navigate
 *     to `upsell.stripe_checkout_url` or call `MeManaService.topup()`.
 *   - `dismissed` — Cancel / Escape / backdrop click.
 *
 * Focus-trap, Tab cycling, and focus restore are inherited from the
 * proven `confirm-dialog` precedent (chora-web CLAUDE.md §10 a11y).
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';
import type {
  InsufficientManaUpsell,
  ManaActionCode,
} from '../../../core/services/me-mana.model';

@Component({
  selector: 'chora-mana-topup-modal',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './mana-topup-modal.component.html',
  styleUrl: './mana-topup-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManaTopupModalComponent {
  /** The 402 upsell payload (Phase A typed shape). */
  readonly upsell = input.required<InsufficientManaUpsell>();
  /** Which action triggered the gate — i18n / analytics context only. */
  readonly actionCode = input.required<ManaActionCode>();
  /** When true, disables both CTAs + shows a spinner glyph. */
  readonly submitting = input<boolean>(false);
  /** Optional i18n key for an inline error row (e.g. after a failed `topup()`). */
  readonly errorMessage = input<string | null>(null);

  /** CTA clicked — parent decides what to do (Stripe URL vs. mana.topup). */
  readonly topupRequested = output<void>();
  /** Dialog dismissed (Cancel / Escape / backdrop). */
  readonly dismissed = output<void>();

  readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');

  /** required - balance, floored at 0 (defensive — server should send rational values). */
  readonly gap = computed<number>(() => {
    const u = this.upsell();
    return Math.max(0, u.required_units - u.current_balance_units);
  });

  /** Whether the upsell carries a pre-minted Stripe Checkout URL. */
  readonly hasStripeUrl = computed<boolean>(
    () => !!this.upsell().stripe_checkout_url,
  );

  /** CTA i18n key — switches on the presence of `stripe_checkout_url`. */
  readonly ctaKey = computed<string>(() =>
    this.hasStripeUrl()
      ? 'core.mana.topup_modal.cta_stripe'
      : 'core.mana.topup_modal.cta_topup',
  );

  private previouslyFocusedElement: Element | null = null;

  constructor() {
    effect(() => {
      // Read `upsell()` so this re-fires every time the modal is freshly
      // shown with a new payload (e.g. after the parent re-attempts and
      // gets a second 402 with different recommended units).
      this.upsell();
      this.previouslyFocusedElement = document.activeElement;
      queueMicrotask(() => {
        this.dialogPanel()?.nativeElement.focus();
      });
    });
  }

  onConfirm(): void {
    if (this.submitting()) return;
    this.topupRequested.emit();
  }

  onCancel(): void {
    if (this.submitting()) return;
    this.restoreFocus();
    this.dismissed.emit();
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
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.dialogPanel()?.nativeElement;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first || document.activeElement === panel) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
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
