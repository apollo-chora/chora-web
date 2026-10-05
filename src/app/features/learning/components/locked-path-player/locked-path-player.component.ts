/**
 * LockedPathPlayerComponent — Step-by-step navigation through a LockedPath
 * (ordered atom sequence for Straight-Up certification mode).
 *
 * Route: /learning/path/:pathId
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BffClientService } from '../../../../core/services/bff-client.service';

interface LockedPathStep {
  atomId: string;
  order: number;
  title: string;
  atomType: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

interface LockedPath {
  id: string;
  title: string;
  description: string;
  steps: LockedPathStep[];
}

@Component({
  selector: 'chora-locked-path-player',
  standalone: true,
  template: `
    <section class="path-player" data-testid="locked-path-player">
      @if (loading()) {
        <div class="path-player__loading" data-testid="path-loading">
          <p>Loading path...</p>
        </div>
      } @else if (error()) {
        <div class="path-player__error" data-testid="path-error">
          <h2>Unable to load path</h2>
          <p>{{ error() }}</p>
          <button class="path-player__retry-btn" (click)="loadPath()">Retry</button>
        </div>
      } @else if (path()) {
        <header class="path-player__header" data-testid="path-header">
          <div class="path-player__header-top">
            <a class="path-player__back-link"
               data-testid="back-to-overview"
               (click)="backToOverview()"
               (keydown.enter)="backToOverview()"
               tabindex="0"
               role="link">
              Back to Path Overview
            </a>
            <h1 class="path-player__title">{{ path()!.title }}</h1>
          </div>
          <div class="path-player__progress-bar" data-testid="progress-bar">
            <div class="path-player__progress-fill"
                 [style.width.%]="progress()"
                 role="progressbar"
                 [attr.aria-valuenow]="progress()"
                 aria-valuemin="0"
                 aria-valuemax="100">
            </div>
          </div>
          <p class="path-player__progress-text" data-testid="progress-text">
            Step {{ currentStepIndex() + 1 }} of {{ path()!.steps.length }}
            ({{ progress() }}% complete)
          </p>
        </header>

        <div class="path-player__body">
          <nav class="path-player__step-strip" data-testid="step-strip" aria-label="Path steps">
            @for (step of path()!.steps; track step.order) {
              <button
                class="path-player__step-indicator"
                [class.path-player__step-indicator--completed]="step.isCompleted"
                [class.path-player__step-indicator--current]="step.order === currentStepIndex()"
                [class.path-player__step-indicator--locked]="!step.isCompleted && step.order !== currentStepIndex()"
                [disabled]="!step.isCompleted && step.order !== currentStepIndex()"
                (click)="goToStep(step.order)"
                [attr.data-testid]="'step-' + step.order"
                [attr.aria-label]="'Step ' + (step.order + 1) + ': ' + step.title">
                @if (step.isCompleted) {
                  <span class="path-player__step-icon" aria-hidden="true">&#10003;</span>
                } @else if (step.order === currentStepIndex()) {
                  <span class="path-player__step-icon" aria-hidden="true">{{ step.order + 1 }}</span>
                } @else {
                  <span class="path-player__step-icon" aria-hidden="true">&#128274;</span>
                }
              </button>
            }
          </nav>

          <main class="path-player__content" data-testid="step-content">
            @if (currentStep()) {
              <article class="path-player__atom-card" data-testid="current-atom">
                <span class="path-player__atom-type">{{ currentStep()!.atomType }}</span>
                <h2 class="path-player__atom-title">{{ currentStep()!.title }}</h2>
                <p class="path-player__atom-preview">
                  Tap below to study this atom and complete the step.
                </p>
                <div class="path-player__actions">
                  <button
                    class="path-player__open-btn"
                    data-testid="open-atom-btn"
                    (click)="openAtom(currentStep()!.atomId)">
                    Open Atom
                  </button>
                  <button
                    class="path-player__complete-btn"
                    data-testid="complete-next-btn"
                    [disabled]="!canCompleteStep()"
                    (click)="completeAndNext()">
                    Complete &amp; Next
                  </button>
                </div>
              </article>
            }
          </main>
        </div>
      }
    </section>
  `,
  styles: [`
    .path-player {
      max-width: 960px;
      margin: 0 auto;
      padding: var(--chora-space-lg);

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

      &__header { margin-bottom: var(--chora-space-lg); }

      &__header-top { margin-bottom: var(--chora-space-md); }

      &__back-link {
        font-size: 14px;
        color: var(--chora-color-primary);
        cursor: pointer;
        text-decoration: underline;
        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 2px; }
      }

      &__title {
        font-size: 24px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin-top: var(--chora-space-xs);
      }

      &__progress-bar {
        height: 8px;
        background: var(--chora-color-surface-1, #e0e0e0);
        border-radius: var(--chora-radius-sm);
        overflow: hidden;
        margin-bottom: var(--chora-space-xs);
      }

      &__progress-fill {
        height: 100%;
        background: var(--chora-color-primary);
        border-radius: var(--chora-radius-sm);
        transition: width 0.3s ease;
      }

      &__progress-text {
        font-size: 14px;
        color: var(--chora-color-text-secondary);
      }

      &__body {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--chora-space-lg);
      }

      &__step-strip {
        display: flex;
        flex-direction: column;
        gap: var(--chora-space-sm);
        padding: var(--chora-space-sm);
      }

      &__step-indicator {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid var(--chora-color-surface-1, #ccc);
        background: var(--chora-color-surface-0, #fff);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        color: var(--chora-color-text-secondary);
        transition: all var(--chora-transition-fast, 0.15s);

        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 2px; }
        &:disabled { cursor: not-allowed; opacity: 0.5; }

        &--completed {
          border-color: var(--chora-color-success, #22c55e);
          background: var(--chora-color-success, #22c55e);
          color: #fff;
        }

        &--current {
          border-color: var(--chora-color-primary);
          background: var(--chora-color-primary);
          color: #fff;
        }

        &--locked {
          border-color: var(--chora-color-surface-1, #ccc);
          color: var(--chora-color-text-secondary);
        }
      }

      &__content { flex: 1; }

      &__atom-card {
        background: var(--chora-color-surface-0, #fff);
        border: 1px solid var(--chora-color-surface-1, #e0e0e0);
        border-radius: var(--chora-radius-md);
        padding: var(--chora-space-xl);
      }

      &__atom-type {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--chora-color-text-secondary);
      }

      &__atom-title {
        font-size: 20px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin: var(--chora-space-xs) 0 var(--chora-space-md);
      }

      &__atom-preview {
        font-size: 15px;
        color: var(--chora-color-text-secondary);
        margin-bottom: var(--chora-space-lg);
      }

      &__actions {
        display: flex;
        gap: var(--chora-space-md);
      }

      &__open-btn, &__complete-btn {
        padding: var(--chora-space-sm) var(--chora-space-lg);
        border-radius: var(--chora-radius-md);
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--chora-transition-fast, 0.15s);
        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 2px; }
      }

      &__open-btn {
        border: 2px solid var(--chora-color-primary);
        background: transparent;
        color: var(--chora-color-primary);
        &:hover { background: var(--chora-color-surface-1, #f5f5f5); }
      }

      &__complete-btn {
        border: none;
        background: var(--chora-color-primary);
        color: #fff;
        &:hover:not(:disabled) { filter: brightness(1.1); }
        &:disabled { opacity: 0.5; cursor: not-allowed; }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LockedPathPlayerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bff = inject(BffClientService);

  readonly path = signal<LockedPath | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly currentStepIndex = signal(0);

  readonly currentStep = computed(() => this.path()?.steps[this.currentStepIndex()] ?? null);

  readonly progress = computed(() => {
    const p = this.path();
    if (!p || p.steps.length === 0) return 0;
    return Math.round((p.steps.filter(s => s.isCompleted).length / p.steps.length) * 100);
  });

  ngOnInit(): void {
    this.loadPath();
  }

  loadPath(): void {
    const pathId = this.route.snapshot.paramMap.get('pathId') ?? '';
    if (!pathId) {
      this.error.set('No path ID provided');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.bff.get<LockedPath>(`/api/v1/locked-paths/${pathId}`).subscribe({
      next: (data) => {
        this.path.set(data);
        const currentIdx = data.steps.findIndex(s => s.isCurrent);
        this.currentStepIndex.set(currentIdx >= 0 ? currentIdx : 0);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load path');
        this.loading.set(false);
      },
    });
  }

  canCompleteStep(): boolean {
    const step = this.currentStep();
    return step !== null && !step.isCompleted;
  }

  goToStep(order: number): void {
    const p = this.path();
    if (!p) return;
    const step = p.steps[order];
    if (step && (step.isCompleted || step.order === this.currentStepIndex())) {
      this.currentStepIndex.set(order);
    }
  }

  openAtom(atomId: string): void {
    this.router.navigate(['/learning', 'player', atomId]);
  }

  completeAndNext(): void {
    const p = this.path();
    if (!p) return;

    const idx = this.currentStepIndex();
    const step = p.steps[idx];
    if (!step) return;

    this.bff.post(`/api/v1/locked-paths/${p.id}/steps/${step.atomId}/complete`, {}).subscribe({
      next: () => {
        const updated = { ...p, steps: p.steps.map((s, i) =>
          i === idx ? { ...s, isCompleted: true, isCurrent: false } : s,
        )};
        if (idx < updated.steps.length - 1) {
          updated.steps[idx + 1] = { ...updated.steps[idx + 1], isCurrent: true };
          this.currentStepIndex.set(idx + 1);
        }
        this.path.set(updated);
      },
    });
  }

  backToOverview(): void {
    this.router.navigate(['/learning']);
  }
}
