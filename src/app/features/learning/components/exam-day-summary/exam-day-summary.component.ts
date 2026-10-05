/**
 * ExamDayConfidenceSummaryComponent — Read-only confidence card shown on exam day.
 * Displays stats, readiness gauge, familiar encouragement, and exam logistics.
 *
 * Route: /learning/exam-prep/:examId/day-of
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BffClientService } from '../../../../core/services/bff-client.service';

interface ExamDaySummary {
  examName: string;
  examDate: string;
  examTime: string;
  venue: string;
  atomsCompleted: number;
  mockExamsTaken: number;
  hoursStudied: number;
  readinessPercent: number;
  familiarName: string;
  familiarMessage: string;
  familiarAvatarUrl: string;
}

@Component({
  selector: 'chora-exam-day-summary',
  standalone: true,
  template: `
    <section class="day-summary" data-testid="exam-day-summary">
      @if (loading()) {
        <div class="day-summary__loading" data-testid="summary-loading">
          <p>Loading your exam day summary...</p>
        </div>
      } @else if (error()) {
        <div class="day-summary__error" data-testid="summary-error">
          <p>{{ error() }}</p>
        </div>
      } @else if (summary()) {
        <div class="day-summary__card" data-testid="summary-card">
          <header class="day-summary__header">
            <h1 class="day-summary__title" data-testid="exam-title">
              {{ summary()!.examName }}
            </h1>
            <p class="day-summary__subtitle">Exam Day</p>
          </header>

          <div class="day-summary__gauge" data-testid="readiness-gauge">
            <svg viewBox="0 0 120 120" class="day-summary__gauge-svg" aria-hidden="true">
              <circle cx="60" cy="60" r="52" fill="none" stroke-width="10"
                      class="day-summary__gauge-track" />
              <circle cx="60" cy="60" r="52" fill="none" stroke-width="10"
                      class="day-summary__gauge-fill"
                      [attr.stroke-dasharray]="gaugeDash()"
                      stroke-dashoffset="0"
                      stroke-linecap="round"
                      transform="rotate(-90 60 60)" />
            </svg>
            <span class="day-summary__gauge-label" data-testid="readiness-percent">
              {{ summary()!.readinessPercent }}%
            </span>
            <p class="day-summary__gauge-caption">Readiness</p>
          </div>

          <div class="day-summary__stats" data-testid="stats">
            <div class="day-summary__stat">
              <span class="day-summary__stat-value" data-testid="atoms-completed">
                {{ summary()!.atomsCompleted }}
              </span>
              <span class="day-summary__stat-label">Atoms Completed</span>
            </div>
            <div class="day-summary__stat">
              <span class="day-summary__stat-value" data-testid="mock-exams">
                {{ summary()!.mockExamsTaken }}
              </span>
              <span class="day-summary__stat-label">Mock Exams Taken</span>
            </div>
            <div class="day-summary__stat">
              <span class="day-summary__stat-value" data-testid="hours-studied">
                {{ summary()!.hoursStudied }}
              </span>
              <span class="day-summary__stat-label">Hours Studied</span>
            </div>
          </div>

          @if (summary()!.venue || summary()!.examDate) {
            <div class="day-summary__logistics" data-testid="exam-logistics">
              <h2 class="day-summary__logistics-title">Exam Logistics</h2>
              @if (summary()!.examDate) {
                <p class="day-summary__logistics-item">
                  <strong>Date:</strong> {{ summary()!.examDate }}
                </p>
              }
              @if (summary()!.examTime) {
                <p class="day-summary__logistics-item">
                  <strong>Time:</strong> {{ summary()!.examTime }}
                </p>
              }
              @if (summary()!.venue) {
                <p class="day-summary__logistics-item">
                  <strong>Venue:</strong> {{ summary()!.venue }}
                </p>
              }
            </div>
          }

          <div class="day-summary__familiar" data-testid="familiar-message">
            @if (summary()!.familiarAvatarUrl) {
              <img
                class="day-summary__familiar-avatar"
                [src]="summary()!.familiarAvatarUrl"
                [alt]="summary()!.familiarName + ' avatar'"
                data-testid="familiar-avatar" />
            }
            <div class="day-summary__familiar-content">
              <p class="day-summary__familiar-name">{{ summary()!.familiarName }}</p>
              <p class="day-summary__familiar-text">{{ summary()!.familiarMessage }}</p>
            </div>
          </div>

          <div class="day-summary__cta" data-testid="cta">
            <p class="day-summary__cta-text">You've got this!</p>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    .day-summary {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 80vh;
      padding: var(--chora-space-xl);

      &__loading, &__error {
        text-align: center;
        padding: var(--chora-space-2xl, 48px);
        color: var(--chora-color-text-secondary);
      }

      &__card {
        max-width: 540px;
        width: 100%;
        background: var(--chora-color-surface-0, #fff);
        border: 1px solid var(--chora-color-surface-1, #e0e0e0);
        border-radius: var(--chora-radius-lg, 16px);
        padding: var(--chora-space-2xl, 48px) var(--chora-space-xl);
        text-align: center;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
      }

      &__header { margin-bottom: var(--chora-space-lg); }

      &__title {
        font-size: 24px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin-bottom: var(--chora-space-xs);
      }

      &__subtitle {
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 600;
        color: var(--chora-color-text-secondary);
      }

      &__gauge {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: var(--chora-space-lg);
      }

      &__gauge-svg {
        width: 120px;
        height: 120px;
      }

      &__gauge-track {
        stroke: var(--chora-color-surface-1, #e0e0e0);
      }

      &__gauge-fill {
        stroke: var(--chora-color-primary);
        transition: stroke-dasharray 0.6s ease;
      }

      &__gauge-label {
        position: absolute;
        top: 40px;
        font-size: 28px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
      }

      &__gauge-caption {
        font-size: 13px;
        color: var(--chora-color-text-secondary);
        margin-top: var(--chora-space-xs);
      }

      &__stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--chora-space-md);
        margin-bottom: var(--chora-space-xl);
      }

      &__stat {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      &__stat-value {
        font-size: 24px;
        font-weight: 700;
        color: var(--chora-color-primary);
      }

      &__stat-label {
        font-size: 12px;
        color: var(--chora-color-text-secondary);
        margin-top: 2px;
      }

      &__logistics {
        text-align: start;
        padding: var(--chora-space-md);
        background: var(--chora-color-surface-1, #f9f9f9);
        border-radius: var(--chora-radius-md);
        margin-bottom: var(--chora-space-xl);
      }

      &__logistics-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin-bottom: var(--chora-space-sm);
      }

      &__logistics-item {
        font-size: 14px;
        color: var(--chora-color-text-secondary);
        margin-bottom: var(--chora-space-xs);

        strong {
          color: var(--chora-color-text-primary);
        }
      }

      &__familiar {
        display: flex;
        align-items: center;
        gap: var(--chora-space-md);
        padding: var(--chora-space-md);
        background: var(--chora-color-surface-1, #f9f9f9);
        border-radius: var(--chora-radius-md);
        margin-bottom: var(--chora-space-xl);
        text-align: start;
      }

      &__familiar-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
      }

      &__familiar-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
      }

      &__familiar-text {
        font-size: 14px;
        color: var(--chora-color-text-secondary);
        margin-top: 2px;
      }

      &__cta { margin-top: var(--chora-space-lg); }

      &__cta-text {
        font-size: 20px;
        font-weight: 700;
        color: var(--chora-color-primary);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamDayConfidenceSummaryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly bff = inject(BffClientService);

  readonly summary = signal<ExamDaySummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  /** SVG circle circumference = 2 * PI * 52 ~= 326.73 */
  private readonly circumference = 2 * Math.PI * 52;

  readonly gaugeDash = computed(() => {
    const s = this.summary();
    if (!s) return '0 326.73';
    const filled = (s.readinessPercent / 100) * this.circumference;
    return `${filled} ${this.circumference}`;
  });

  ngOnInit(): void {
    this.loadSummary();
  }

  private loadSummary(): void {
    const examId = this.route.snapshot.paramMap.get('examId') ?? '';
    if (!examId) {
      this.error.set('No exam ID provided');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.bff.get<ExamDaySummary>(`/api/v1/engagement/dashboard`).subscribe({
      next: (data) => {
        this.summary.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load exam summary');
        this.loading.set(false);
      },
    });
  }
}
