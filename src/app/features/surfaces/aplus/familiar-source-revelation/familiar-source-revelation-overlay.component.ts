/**
 * FamiliarSourceRevelationOverlayComponent — lightweight modal overlay
 * triggered after a Familiar transitions Stage 2 → Stage 3 (WS-2, 2026-05-26).
 *
 * This is the OVERLAY form driven by the hatch POST completion in
 * FamiliarHatchingComponent. The full-page routed ceremony
 * (FamiliarSourceRevelationComponent at `/a/companion/:id/source-revelation`)
 * is unchanged.
 *
 * Trigger path:
 *   FamiliarHatchingComponent.commit() success
 *   → FamiliarRealtimeService.emitSourceRevelation(payload)
 *   → FamiliarComponent subscribes sourceRevelation$
 *   → sets `payload` input → overlay renders
 *
 * A11y:
 *   - role="dialog" aria-modal="true" aria-labelledby
 *   - Manual focus trap (mirrors ManaTopupModal pattern)
 *   - Escape closes
 *   - focus restores to caller on close
 *
 * Glassmorphism tokens: --glass-bg / --glass-border / --glass-shadow
 * A+ surface accent: --secondary = #ec4899 Pink 500
 * Tablet-first: max-width 600px centered modal.
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

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import type { FamiliarSourceRevelationPayload } from '../../../../core/familiar/familiar-realtime.service';
import type { BreedSpecies } from '../../../../shared/components/breed-art/breed-art.component';

@Component({
  selector: 'chora-aplus-familiar-source-revelation-overlay',
  standalone: true,
  imports: [TranslatePipe, BreedArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-source-revelation-overlay.component.html',
  styleUrl: './familiar-source-revelation-overlay.component.scss',
})
export class FamiliarSourceRevelationOverlayComponent {
  /** Required: payload from FamiliarRealtimeService.sourceRevelation$. */
  readonly payload = input.required<FamiliarSourceRevelationPayload>();
  /** Optional: breed for breed-art display. Defaults to '' (stage-icon only). */
  readonly species = input<BreedSpecies>('');
  /** Emitted when the overlay should close. */
  readonly closed = output<void>();

  readonly dialogPanel =
    viewChild<ElementRef<HTMLElement>>('dialogPanel');

  /** The breed display for Stage 3 current form. */
  readonly currentLabel = computed<string>(() => {
    const s = this.species();
    return s ? `${s} (Stage 3)` : 'Stage 3 Form';
  });

  /** The breed display for Stage 6 destined form. */
  readonly maturedLabel = computed<string>(() => {
    const s = this.species();
    return s ? `${s} (Matured)` : 'Matured Form';
  });

  private previouslyFocusedElement: Element | null = null;

  constructor() {
    effect(() => {
      this.payload();
      this.previouslyFocusedElement = document.activeElement;
      queueMicrotask(() => {
        this.dialogPanel()?.nativeElement.focus();
      });
    });
  }

  onClose(): void {
    this.restoreFocus();
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.onClose();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onClose();
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
