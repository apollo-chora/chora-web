/**
 * CertPreviewModalComponent — sample Certification preview modal.
 *
 * Used by R+ class-roster rows to preview the cert that would be issued
 * on cohort completion (Phyllis demo Step 10: instructor previews
 * Phyllis's certification). Implemented as a glassmorphism overlay +
 * card per polyglass primitives. Stub data only — a wave-2 BFF call
 * (`GET /v1/delivery/cohorts/{id}/learners/{gcid}/cert-preview`) will
 * replace the in-template fixture.
 *
 * A11y:
 *   - `role="dialog"` + `aria-modal="true"` on overlay
 *   - `aria-labelledby` points at the modal title
 *   - Backdrop click + Escape key both close
 *   - Initial focus moved to the close button on open
 *   - Focus is restored to the trigger by the consumer
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { RosterLearner } from '../class-roster/class-roster.model';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'chora-rplus-cert-preview-modal',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="modal-overlay"
      data-testid="cert-preview-overlay"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="titleId"
      tabindex="-1"
      (click)="handleBackdropClick($event)"
      (keydown.escape)="emitClose()">
      <div class="modal-content glass-panel cert-preview-modal__card">
        <header class="cert-preview-modal__header">
          <h2
            class="surface-accent-text cert-preview-modal__title"
            [id]="titleId"
            data-testid="cert-preview-title">
            {{ 'rplus.cert.preview.title' | translate }}
          </h2>
          <button
            #closeButton
            type="button"
            class="cert-preview-modal__close"
            data-testid="cert-preview-close"
            [attr.aria-label]="'rplus.cert.preview.close.label' | translate"
            (click)="emitClose()">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        <section class="cert-preview-modal__body">
          <div
            class="cert-preview-modal__seal surface-accent-bg"
            aria-hidden="true">
            <i class="fa-solid fa-award"></i>
          </div>
          <p class="cert-preview-modal__certifies">
            {{ 'rplus.cert.preview.certifies' | translate }}
          </p>
          <p
            class="cert-preview-modal__learner"
            data-testid="cert-preview-learner-name">
            {{ learner().displayName }}
          </p>
          <p class="cert-preview-modal__gcid" data-testid="cert-preview-gcid">
            {{ learner().gcid }}
          </p>
          <p class="cert-preview-modal__course">
            {{ 'rplus.cert.preview.has_completed' | translate }}
          </p>
          <p
            class="cert-preview-modal__course-name"
            data-testid="cert-preview-course-name">
            {{ courseName() }}
          </p>
          <dl class="cert-preview-modal__meta">
            <div class="cert-preview-modal__meta-row">
              <dt>{{ 'rplus.cert.preview.atoms_mastered' | translate }}</dt>
              <dd data-testid="cert-preview-atoms">
                {{ learner().atomicSessionsCompleted }} /
                {{ learner().atomicSessionsTotal }}
              </dd>
            </div>
            <div class="cert-preview-modal__meta-row">
              <dt>{{ 'rplus.cert.preview.instructor' | translate }}</dt>
              <dd>{{ instructorName() }}</dd>
            </div>
            <div class="cert-preview-modal__meta-row">
              <dt>{{ 'rplus.cert.preview.status' | translate }}</dt>
              <dd>{{ learner().status }}</dd>
            </div>
          </dl>
          <p class="cert-preview-modal__note" role="note">
            {{ 'rplus.cert.preview.draft_note' | translate }}
          </p>
        </section>

        <footer class="cert-preview-modal__footer">
          <button
            type="button"
            class="btn btn-secondary"
            data-testid="cert-preview-dismiss"
            (click)="emitClose()">
            {{ 'rplus.cert.preview.dismiss' | translate }}
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: `
    :host { display: contents; }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      z-index: 100;
      animation: cert-preview-fade-in 0.2s ease;
    }

    @keyframes cert-preview-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .modal-content {
      max-width: 520px;
      width: 100%;
      padding: 1.5rem;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .cert-preview-modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .cert-preview-modal__title {
      font-size: 1.5rem;
      margin: 0;
      font-weight: 800;
    }
    .cert-preview-modal__close {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      border: none;
      background: rgba(255, 255, 255, 0.6);
      color: var(--text-muted);
      cursor: pointer;
      font-size: 1rem;
    }
    .cert-preview-modal__close:hover {
      background: white;
      color: var(--primary);
    }
    .cert-preview-modal__close:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    .cert-preview-modal__body {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      text-align: center;
    }
    .cert-preview-modal__seal {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1.75rem;
      box-shadow: 0 4px 12px rgba(180, 83, 9, 0.3);
    }
    .cert-preview-modal__certifies {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 0;
    }
    .cert-preview-modal__learner {
      font-size: 1.5rem;
      font-weight: 800;
      margin: 0;
      color: var(--text-main);
    }
    .cert-preview-modal__gcid {
      font-size: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--text-muted);
      margin: 0;
    }
    .cert-preview-modal__course {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 0.5rem 0 0;
    }
    .cert-preview-modal__course-name {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-main);
      margin: 0;
    }
    .cert-preview-modal__meta {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0.5rem 0 0;
      padding: 0.75rem;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 12px;
    }
    .cert-preview-modal__meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
    }
    .cert-preview-modal__meta-row dt {
      color: var(--text-muted);
      margin: 0;
    }
    .cert-preview-modal__meta-row dd {
      color: var(--text-main);
      font-weight: 600;
      margin: 0;
    }
    .cert-preview-modal__note {
      font-size: 0.75rem;
      font-style: italic;
      color: var(--text-muted);
      margin: 0.5rem 0 0;
    }

    .cert-preview-modal__footer {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class CertPreviewModalComponent implements AfterViewInit {
  readonly learner = input.required<RosterLearner>();
  readonly courseName = input.required<string>();
  readonly instructorName = input.required<string>();

  readonly closed = output<void>();

  /** Stable DOM id used by `aria-labelledby` on the dialog. */
  readonly titleId = 'rplus-cert-preview-title';

  private readonly closeButtonRef = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  ngAfterViewInit(): void {
    // Move initial focus to the close button per WAI-ARIA dialog pattern.
    this.closeButtonRef()?.nativeElement.focus();
  }

  emitClose(): void {
    this.closed.emit();
  }

  handleBackdropClick(event: Event): void {
    // Only close when the click landed on the overlay itself (not the card).
    if (event.target === event.currentTarget) {
      this.emitClose();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.emitClose();
  }
}
