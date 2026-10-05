/**
 * AiTransparencyNoticeComponent — ADR-225 one-time first-interaction NOTICE
 * (EU AI Act Art 50 + IMDA MGF D2/D4).
 *
 * This is an ACKNOWLEDGEMENT, NOT a consent gate:
 *   - a SINGLE "Got it" button (label from the BFF disclosure),
 *   - NO decline / AI-off / cancel / close branch,
 *   - NOT dismissible via backdrop click or Escape (a mandated disclosure, not
 *     a throwaway popup) — the ONLY exit is acknowledging, which flips the
 *     service's `mustAcknowledge` to false and hides the modal.
 *
 * The notice self-gates: it renders only when `mustAcknowledge()` is true AND
 * the disclosure has loaded. Mount it at a Familiar (AI) interaction entry —
 * the component drives `ensureLoaded()` itself. The `disclosure.notice`
 * strings are the governance-config source of truth and are rendered DIRECTLY;
 * only chrome/aria uses i18n keys.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';
import { AiTransparencyService } from '../../../core/services/ai-transparency.service';

@Component({
  selector: 'chora-ai-transparency-notice',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './ai-transparency-notice.component.html',
  styleUrl: './ai-transparency-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiTransparencyNoticeComponent {
  private readonly service = inject(AiTransparencyService);

  /** The acknowledgement surface (BE-required). Defaults to the Familiar. */
  readonly surface = input<string>('familiar');
  /** The acknowledgement scope (BE-required). Defaults to Familiar chat. */
  readonly scope = input<string>('familiar_chat');

  readonly disclosure = this.service.disclosure;
  readonly ackState = this.service.ackState;

  /** Whether a submit is in flight (disables the button + shows the spinner). */
  readonly submitting = computed<boolean>(
    () => this.ackState().status === 'submitting',
  );

  /** The fail-loud error i18n key when the last acknowledge failed, else null. */
  readonly errorKey = computed<string | null>(() => {
    const s = this.ackState();
    return s.status === 'error' ? s.error : null;
  });

  /** Render only when the BE mandates the notice AND the copy has loaded. */
  readonly visible = computed<boolean>(
    () => this.service.mustAcknowledge() && this.disclosure() !== null,
  );

  /** Captured once, when the notice first becomes visible, for the BE record. */
  private firstShownAt: string | null = null;
  readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');

  constructor() {
    this.service.ensureLoaded();
    effect(() => {
      if (this.visible()) {
        this.firstShownAt ??= new Date().toISOString();
        // Move focus into the mandated dialog on show (a11y — the learner
        // must land on the acknowledgement, not stay behind the backdrop).
        queueMicrotask(() => this.dialogPanel()?.nativeElement.focus());
      }
    });
  }

  /** Acknowledge — the ONLY exit. No-op while a submit is already in flight. */
  acknowledge(): void {
    if (this.submitting()) return;
    this.service.acknowledge({
      surface: this.surface(),
      scope: this.scope(),
      firstShownAt: this.firstShownAt ?? new Date().toISOString(),
    });
  }

  /**
   * Trap Tab within the dialog. Escape is deliberately SWALLOWED (no dismissal
   * path other than acknowledging) — EU Art 50: this is not a throwaway popup.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
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
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
