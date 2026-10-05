import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  viewChild,
  effect,
  ElementRef,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import {
  type TrainingSession,
  getCapacityLevel,
} from './models/training.model';

@Component({
  selector: 'chora-training-session-detail-modal',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div
      class="session-modal-backdrop"
      data-testid="session-detail-backdrop"
      role="presentation"
      tabindex="-1"
      (click)="onBackdropClick()"
      (keydown)="onKeydown($event)">
      <div
        #modalPanel
        class="session-modal"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="'session-detail-title'"
        tabindex="-1"
        data-testid="session-detail-modal"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()">

        <header class="session-modal__header">
          <h2 id="session-detail-title" class="session-modal__title">
            {{ session().title }}
          </h2>
          <button
            type="button"
            class="session-modal__close"
            aria-label="Close detail modal"
            data-testid="session-detail-close"
            (click)="closed.emit()">
            &times;
          </button>
        </header>

        <div class="session-modal__body">
          <p class="session-modal__description">{{ session().description }}</p>

          <div class="session-modal__meta">
            <div class="session-modal__meta-item">
              <span class="session-modal__meta-label">{{ 'training.detail.trainer' | translate }}</span>
              <span data-testid="detail-trainer-name">{{ session().trainerName }}</span>
            </div>
            @if (session().trainerBio) {
              <p class="session-modal__trainer-bio" data-testid="detail-trainer-bio">
                {{ session().trainerBio }}
              </p>
            }
            <div class="session-modal__meta-item">
              <span class="session-modal__meta-label">{{ 'training.detail.date-time' | translate }}</span>
              <span data-testid="detail-date-time">{{ formattedDateTime() }}</span>
            </div>
            <div class="session-modal__meta-item">
              <span class="session-modal__meta-label">{{ 'training.detail.duration' | translate }}</span>
              <span data-testid="detail-duration">{{ session().durationMinutes }} min</span>
            </div>
            <div class="session-modal__meta-item">
              <span class="session-modal__meta-label">{{ 'training.detail.capacity' | translate }}</span>
              <span
                class="session-modal__capacity session-modal__capacity--{{ capacityLevel() }}"
                data-testid="detail-capacity">
                {{ session().enrolledCount }}/{{ session().capacity }} {{ 'training.enrolled' | translate }}
              </span>
            </div>
            @if (session().location) {
              <div class="session-modal__meta-item">
                <span class="session-modal__meta-label">{{ 'training.detail.location' | translate }}</span>
                <span data-testid="detail-location">{{ session().location }}</span>
              </div>
            }
            @if (session().virtualLink) {
              <div class="session-modal__meta-item">
                <span class="session-modal__meta-label">{{ 'training.detail.virtual-link' | translate }}</span>
                <a
                  [href]="session().virtualLink!"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="detail-virtual-link">
                  {{ 'training.detail.join-online' | translate }}
                </a>
              </div>
            }
          </div>

          @if (session().topics.length > 0) {
            <div class="session-modal__section">
              <h3 class="session-modal__section-title">{{ 'training.detail.topics-covered' | translate }}</h3>
              <ul class="session-modal__tag-list" data-testid="detail-topics">
                @for (topic of session().topics; track topic) {
                  <li class="session-modal__tag">{{ topic }}</li>
                }
              </ul>
            </div>
          }

          @if (session().prerequisites.length > 0) {
            <div class="session-modal__section">
              <h3 class="session-modal__section-title">{{ 'training.detail.prerequisites' | translate }}</h3>
              <ul class="session-modal__prereq-list" data-testid="detail-prerequisites">
                @for (prereq of session().prerequisites; track prereq) {
                  <li>{{ prereq }}</li>
                }
              </ul>
            </div>
          }

          @if (session().isEnrolled && session().waitlistPosition !== null) {
            <p class="session-modal__waitlist" data-testid="detail-waitlist-position">
              {{ 'training.detail.waitlist-position' | translate }}: #{{ session().waitlistPosition }}
            </p>
          }
        </div>

        <footer class="session-modal__footer">
          @if (session().isEnrolled) {
            <button
              type="button"
              class="session-modal__btn session-modal__btn--withdraw"
              data-testid="detail-withdraw-btn"
              [disabled]="enrolling()"
              (click)="withdraw.emit(session().id)">
              {{ 'training.action.withdraw' | translate }}
            </button>
            <span class="session-modal__enrolled-badge" data-testid="detail-enrolled-badge">
              &#10003; {{ 'training.status.enrolled' | translate }}
            </span>
          } @else if (capacityLevel() === 'full') {
            <button
              type="button"
              class="session-modal__btn session-modal__btn--waitlist"
              data-testid="detail-waitlist-btn"
              [disabled]="enrolling()"
              (click)="enroll.emit(session().id)">
              {{ 'training.action.join-waitlist' | translate }}
            </button>
          } @else {
            <button
              type="button"
              class="session-modal__btn session-modal__btn--enroll"
              data-testid="detail-enroll-btn"
              [disabled]="enrolling()"
              (click)="enroll.emit(session().id)">
              {{ 'training.action.enroll' | translate }}
            </button>
          }
        </footer>
      </div>
    </div>
  `,
  styleUrl: './training-session-detail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingSessionDetailModalComponent {
  readonly session = input.required<TrainingSession>();
  readonly enrolling = input<boolean>(false);

  readonly closed = output<void>();
  readonly enroll = output<string>();
  readonly withdraw = output<string>();

  readonly modalPanel = viewChild<ElementRef<HTMLElement>>('modalPanel');

  readonly capacityLevel = computed(() => getCapacityLevel(this.session()));

  readonly formattedDateTime = computed(() => {
    try {
      const dt = new Date(this.session().dateTime);
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(dt);
    } catch {
      return this.session().dateTime;
    }
  });

  private previouslyFocusedElement: Element | null = null;

  constructor() {
    effect(() => {
      if (this.session()) {
        this.previouslyFocusedElement = document.activeElement;
        queueMicrotask(() => {
          this.modalPanel()?.nativeElement.focus();
        });
      }
    });
  }

  onBackdropClick(): void {
    this.restoreFocus();
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.restoreFocus();
      this.closed.emit();
    }
  }

  private restoreFocus(): void {
    if (this.previouslyFocusedElement instanceof HTMLElement) {
      this.previouslyFocusedElement.focus();
    }
    this.previouslyFocusedElement = null;
  }
}
