/**
 * PublicTopicViewComponent — Displays a TopicNode with its child atoms
 * and a sign-up CTA for unauthenticated visitors.
 *
 * Route: /topics/:id
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

interface DifficultyDistribution {
  level: number;
  count: number;
}

interface PublicTopicResponse {
  id: string;
  name: string;
  description: string;
  atom_count: number;
  difficulty_distribution: DifficultyDistribution[];
}

type TopicViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; topic: PublicTopicResponse }
  | { status: 'error'; message: string };

@Component({
  selector: 'chora-public-topic-view',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="public-topic" data-testid="public-topic-view">
      @if (state().status === 'loading') {
        <div class="public-topic__loading" data-testid="topic-loading">
          <p>Loading topic...</p>
        </div>
      } @else if (state().status === 'error') {
        <div class="public-topic__error" data-testid="topic-error">
          <h2>Topic not found</h2>
          <p>{{ errorMessage() }}</p>
        </div>
      } @else if (state().status === 'success') {
        <header class="public-topic__header">
          <h1 class="public-topic__name" data-testid="topic-name">{{ topic()!.name }}</h1>
          <p class="public-topic__description" data-testid="topic-description">
            {{ topic()!.description }}
          </p>
        </header>

        <section class="public-topic__stats" data-testid="topic-stats">
          <div class="public-topic__stat">
            <span class="public-topic__stat-value">{{ topic()!.atom_count }}</span>
            <span class="public-topic__stat-label">Atoms</span>
          </div>
          @for (dist of topic()!.difficulty_distribution; track dist.level) {
            <div class="public-topic__stat">
              <span class="public-topic__stat-value">{{ dist.count }}</span>
              <span class="public-topic__stat-label">Level {{ dist.level }}</span>
            </div>
          }
        </section>

        <div class="public-topic__cta-container">
          <a routerLink="/register" class="public-topic__cta" data-testid="topic-signup-cta">
            Explore this topic
          </a>
        </div>
      }
    </article>
  `,
  styles: [`
    .public-topic {
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

      &__name {
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
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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
export class PublicTopicViewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly bff = inject(BffClientService);

  readonly state = signal<TopicViewState>({ status: 'idle' });

  readonly topic = computed(() => {
    const s = this.state();
    return s.status === 'success' ? s.topic : null;
  });

  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  });

  private subscription = new Subscription();

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.state.set({ status: 'error', message: 'No topic ID provided' });
      return;
    }
    this.state.set({ status: 'loading' });
    this.subscription.add(
      this.bff
        .get<PublicTopicResponse>(`/api/v1/topics/${encodeURIComponent(id)}/public`)
        .subscribe({
          next: (topic) => this.state.set({ status: 'success', topic }),
          error: () =>
            this.state.set({ status: 'error', message: 'This topic could not be loaded.' }),
        }),
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}
