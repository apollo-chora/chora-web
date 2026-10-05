/**
 * ExamFinalPrepComponent — Last-day review session with highest-impact atoms.
 * Minimal, low-distraction design focused on Ebbinghaus decay + weakness atoms.
 *
 * Route: /learning/exam-prep/:examId/final
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
import { HttpParams } from '@angular/common/http';

interface PrepAtom {
  id: string;
  title: string;
  topic: string;
  confidence: 'low' | 'medium' | 'high';
  reviewed: boolean;
}

interface FinalPrepData {
  examName: string;
  examDate: string;
  atoms: PrepAtom[];
  familiarMessage: string;
}

@Component({
  selector: 'chora-exam-final-prep',
  standalone: true,
  template: `
    <section class="final-prep" data-testid="exam-final-prep">
      @if (loading()) {
        <div class="final-prep__loading" data-testid="prep-loading">
          <p>Preparing your final review...</p>
        </div>
      } @else if (error()) {
        <div class="final-prep__error" data-testid="prep-error">
          <p>{{ error() }}</p>
          <button class="final-prep__retry-btn" (click)="loadPrepData()">Retry</button>
        </div>
      } @else if (prepData()) {
        <header class="final-prep__header" data-testid="prep-header">
          <h1 class="final-prep__title">Final Preparation</h1>
          <p class="final-prep__exam-name" data-testid="exam-name">{{ prepData()!.examName }}</p>
          <p class="final-prep__time-remaining" data-testid="time-remaining">
            Exam on {{ prepData()!.examDate }}
          </p>
        </header>

        @if (allReviewed()) {
          <div class="final-prep__complete" data-testid="prep-complete">
            <h2 class="final-prep__complete-title">You're prepared!</h2>
            <p class="final-prep__complete-message">{{ prepData()!.familiarMessage }}</p>
          </div>
        }

        <p class="final-prep__progress" data-testid="review-progress">
          {{ reviewedCount() }} of {{ totalCount() }} reviewed
        </p>

        <div class="final-prep__atom-list" data-testid="atom-list">
          @for (atom of prepData()!.atoms; track atom.id) {
            <article
              class="final-prep__atom-card"
              [class.final-prep__atom-card--reviewed]="atom.reviewed"
              [attr.data-testid]="'atom-card-' + atom.id">
              <div class="final-prep__atom-info">
                <h3 class="final-prep__atom-title">{{ atom.title }}</h3>
                <span class="final-prep__atom-topic">{{ atom.topic }}</span>
              </div>
              <div class="final-prep__atom-meta">
                <span
                  class="final-prep__confidence"
                  [class.final-prep__confidence--low]="atom.confidence === 'low'"
                  [class.final-prep__confidence--medium]="atom.confidence === 'medium'"
                  [class.final-prep__confidence--high]="atom.confidence === 'high'"
                  [attr.data-testid]="'confidence-' + atom.id">
                  {{ atom.confidence }}
                </span>
                @if (atom.reviewed) {
                  <span class="final-prep__reviewed-badge" data-testid="reviewed-badge">
                    &#10003; Reviewed
                  </span>
                } @else {
                  <button
                    class="final-prep__review-btn"
                    [attr.data-testid]="'review-btn-' + atom.id"
                    (click)="markReviewed(atom.id)">
                    Review
                  </button>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .final-prep {
      max-width: 720px;
      margin: 0 auto;
      padding: var(--chora-space-xl);

      &__loading, &__error {
        text-align: center;
        padding: var(--chora-space-2xl, 48px);
        color: var(--chora-color-text-secondary);
      }

      &__retry-btn {
        margin-top: var(--chora-space-md);
        padding: var(--chora-space-sm) var(--chora-space-lg);
        border: 1px solid var(--chora-color-primary);
        border-radius: var(--chora-radius-md);
        background: transparent;
        color: var(--chora-color-primary);
        cursor: pointer;
      }

      &__header {
        text-align: center;
        margin-bottom: var(--chora-space-xl);
      }

      &__title {
        font-size: 28px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin-bottom: var(--chora-space-xs);
      }

      &__exam-name {
        font-size: 18px;
        font-weight: 600;
        color: var(--chora-color-primary);
      }

      &__time-remaining {
        font-size: 14px;
        color: var(--chora-color-text-secondary);
        margin-top: var(--chora-space-xs);
      }

      &__complete {
        text-align: center;
        padding: var(--chora-space-xl);
        margin-bottom: var(--chora-space-lg);
        background: var(--chora-color-success-bg, #f0fdf4);
        border-radius: var(--chora-radius-md);
      }

      &__complete-title {
        font-size: 22px;
        font-weight: 700;
        color: var(--chora-color-success, #22c55e);
        margin-bottom: var(--chora-space-sm);
      }

      &__complete-message {
        font-size: 15px;
        color: var(--chora-color-text-secondary);
      }

      &__progress {
        font-size: 14px;
        font-weight: 600;
        color: var(--chora-color-text-secondary);
        margin-bottom: var(--chora-space-md);
      }

      &__atom-list {
        display: flex;
        flex-direction: column;
        gap: var(--chora-space-sm);
      }

      &__atom-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--chora-space-md) var(--chora-space-lg);
        background: var(--chora-color-surface-0, #fff);
        border: 1px solid var(--chora-color-surface-1, #e0e0e0);
        border-radius: var(--chora-radius-md);
        transition: all var(--chora-transition-fast, 0.15s);

        &--reviewed {
          opacity: 0.7;
          background: var(--chora-color-surface-1, #f9f9f9);
        }
      }

      &__atom-info { flex: 1; }

      &__atom-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--chora-color-text-primary);
        margin-bottom: 2px;
      }

      &__atom-topic {
        font-size: 13px;
        color: var(--chora-color-text-secondary);
      }

      &__atom-meta {
        display: flex;
        align-items: center;
        gap: var(--chora-space-md);
      }

      &__confidence {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 8px;
        border-radius: var(--chora-radius-sm);

        &--low { background: #fee2e2; color: #dc2626; }
        &--medium { background: #fef3c7; color: #d97706; }
        &--high { background: #dcfce7; color: #16a34a; }
      }

      &__reviewed-badge {
        font-size: 13px;
        font-weight: 600;
        color: var(--chora-color-success, #22c55e);
      }

      &__review-btn {
        padding: var(--chora-space-xs, 4px) var(--chora-space-md);
        border: 2px solid var(--chora-color-primary);
        border-radius: var(--chora-radius-md);
        background: var(--chora-color-primary);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--chora-transition-fast, 0.15s);

        &:hover { filter: brightness(1.1); }
        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 2px; }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamFinalPrepComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly bff = inject(BffClientService);

  readonly prepData = signal<FinalPrepData | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly reviewedCount = computed(() => {
    const data = this.prepData();
    return data ? data.atoms.filter(a => a.reviewed).length : 0;
  });

  readonly totalCount = computed(() => {
    const data = this.prepData();
    return data ? data.atoms.length : 0;
  });

  readonly allReviewed = computed(() => {
    const data = this.prepData();
    return data !== null && data.atoms.length > 0 && data.atoms.every(a => a.reviewed);
  });

  ngOnInit(): void {
    this.loadPrepData();
  }

  loadPrepData(): void {
    const examId = this.route.snapshot.paramMap.get('examId') ?? '';
    if (!examId) {
      this.error.set('No exam ID provided');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const params = new HttpParams().set('mode', 'final_prep').set('examId', examId);
    this.bff.get<FinalPrepData>('/api/v1/engagement/agents/daily-dose/curate', params).subscribe({
      next: (data) => {
        this.prepData.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load preparation data');
        this.loading.set(false);
      },
    });
  }

  markReviewed(atomId: string): void {
    const data = this.prepData();
    if (!data) return;

    const updated: FinalPrepData = {
      ...data,
      atoms: data.atoms.map(a =>
        a.id === atomId ? { ...a, reviewed: true } : a,
      ),
    };
    this.prepData.set(updated);
  }
}
