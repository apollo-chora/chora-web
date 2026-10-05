/**
 * PublicPathViewComponent — Displays a LockedPath overview with step count,
 * estimated duration, and completion rate for unauthenticated visitors.
 *
 * Route: /paths/:id
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

interface PublicPathResponse {
  id: string;
  title: string;
  description: string;
  step_count: number;
  estimated_duration_minutes: number;
  completion_rate: number;
}

type PathViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; path: PublicPathResponse }
  | { status: 'error'; message: string };

@Component({
  selector: 'chora-public-path-view',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="public-path" data-testid="public-path-view">
      @if (state().status === 'loading') {
        <div class="public-path__loading" data-testid="path-loading">
          <p>Loading path...</p>
        </div>
      } @else if (state().status === 'error') {
        <div class="public-path__error" data-testid="path-error">
          <h2>Path not found</h2>
          <p>{{ errorMessage() }}</p>
        </div>
      } @else if (state().status === 'success') {
        <header class="public-path__header">
          <h1 class="public-path__title" data-testid="path-title">{{ path()!.title }}</h1>
          <p class="public-path__description" data-testid="path-description">
            {{ path()!.description }}
          </p>
        </header>

        <section class="public-path__stats" data-testid="path-stats">
          <div class="public-path__stat">
            <span class="public-path__stat-value">{{ path()!.step_count }}</span>
            <span class="public-path__stat-label">Steps</span>
          </div>
          <div class="public-path__stat">
            <span class="public-path__stat-value">{{ formatDuration(path()!.estimated_duration_minutes) }}</span>
            <span class="public-path__stat-label">Estimated Duration</span>
          </div>
          <div class="public-path__stat">
            <span class="public-path__stat-value">{{ formatPercentage(path()!.completion_rate) }}</span>
            <span class="public-path__stat-label">Completion Rate</span>
          </div>
        </section>

        <div class="public-path__cta-container">
          <a routerLink="/register" class="public-path__cta" data-testid="path-signup-cta">
            Start this learning path
          </a>
        </div>
      }
    </article>
  `,
  styles: [`
    .public-path {
      max-width: 720px;
      margin: 0 auto;
      padding: var(--chora-space-xl);

      &__loading, &__error {
        text-align: center;
        padding: var(--chora-space-2xl);
        color: var(--chora-color-text-secondary);
      }

      &__header {
        margin-bottom: var(--chora-space-xl);
      }

      &__title {
        font-size: 28px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin-bottom: var(--chora-space-sm);
      }

      &__description {
        color: var(--chora-color-text-secondary);
        line-height: 1.6;
        font-size: 16px;
      }

      &__stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--chora-space-md);
        margin-bottom: var(--chora-space-xl);
      }

      &__stat {
        background: var(--chora-color-surface-1, #f8f9fa);
        border-radius: var(--chora-radius-md);
        padding: var(--chora-space-md);
        text-align: center;
      }

      &__stat-value {
        display: block;
        font-size: 24px;
        font-weight: 700;
        color: var(--chora-color-primary);
      }

      &__stat-label {
        display: block;
        font-size: 13px;
        color: var(--chora-color-text-secondary);
        margin-top: var(--chora-space-xs);
      }

      &__cta-container {
        text-align: center;
      }

      &__cta {
        display: inline-block;
        padding: var(--chora-space-sm) var(--chora-space-xl);
        background: var(--chora-color-primary);
        color: var(--chora-color-on-primary);
        border-radius: var(--chora-radius-md);
        text-decoration: none;
        font-weight: 600;
        transition: opacity var(--chora-transition-fast);

        &:hover { opacity: 0.9; }
        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 2px; }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicPathViewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly bff = inject(BffClientService);

  readonly state = signal<PathViewState>({ status: 'idle' });

  readonly path = computed(() => {
    const s = this.state();
    return s.status === 'success' ? s.path : null;
  });

  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  });

  private subscription = new Subscription();

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.state.set({ status: 'error', message: 'No path ID provided' });
      return;
    }
    this.state.set({ status: 'loading' });
    this.subscription.add(
      this.bff
        .get<PublicPathResponse>(`/api/v1/paths/${encodeURIComponent(id)}/public`)
        .subscribe({
          next: (path) => this.state.set({ status: 'success', path }),
          error: () =>
            this.state.set({ status: 'error', message: 'This path could not be loaded.' }),
        }),
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
  }

  formatPercentage(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }
}
