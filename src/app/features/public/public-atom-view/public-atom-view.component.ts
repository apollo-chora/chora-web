/**
 * PublicAtomViewComponent — Displays a LearningAtom's latest published revision
 * for unauthenticated visitors with a sign-up CTA.
 *
 * Route: /atoms/:id
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

interface PublicAtomResponse {
  id: string;
  title: string;
  atom_type: string;
  difficulty: number;
  topic_breadcrumbs: string[];
  content_preview: string;
}

type AtomViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; atom: PublicAtomResponse }
  | { status: 'error'; message: string };

@Component({
  selector: 'chora-public-atom-view',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="public-atom" data-testid="public-atom-view">
      @if (state().status === 'loading') {
        <div class="public-atom__loading" data-testid="atom-loading">
          <p>Loading atom...</p>
        </div>
      } @else if (state().status === 'error') {
        <div class="public-atom__error" data-testid="atom-error">
          <h2>Atom not found</h2>
          <p>{{ errorMessage() }}</p>
          <a routerLink="/register" class="public-atom__cta" data-testid="atom-error-cta">
            Sign up to explore more
          </a>
        </div>
      } @else if (state().status === 'success') {
        <nav class="public-atom__breadcrumbs" data-testid="atom-breadcrumbs" aria-label="Topic breadcrumbs">
          @for (crumb of atom()!.topic_breadcrumbs; track crumb) {
            <span class="public-atom__crumb">{{ crumb }}</span>
          }
        </nav>

        <header class="public-atom__header">
          <span class="public-atom__type-badge" data-testid="atom-type-badge">
            {{ atom()!.atom_type }}
          </span>
          <h1 class="public-atom__title" data-testid="atom-title">{{ atom()!.title }}</h1>
          <div class="public-atom__meta">
            <span class="public-atom__difficulty" data-testid="atom-difficulty">
              Difficulty: {{ atom()!.difficulty }}/5
            </span>
          </div>
        </header>

        <section class="public-atom__preview" data-testid="atom-content-preview">
          <p>{{ atom()!.content_preview }}</p>
        </section>

        <div class="public-atom__cta-container">
          <a routerLink="/register" class="public-atom__cta" data-testid="atom-signup-cta">
            Sign up to try this atom
          </a>
        </div>
      }
    </article>
  `,
  styles: [`
    .public-atom {
      max-width: 720px;
      margin: 0 auto;
      padding: var(--chora-space-xl);

      &__loading, &__error {
        text-align: center;
        padding: var(--chora-space-2xl);
        color: var(--chora-color-text-secondary);
      }

      &__breadcrumbs {
        display: flex;
        gap: var(--chora-space-xs);
        flex-wrap: wrap;
        margin-bottom: var(--chora-space-md);
        color: var(--chora-color-text-secondary);
        font-size: 14px;
      }

      &__crumb + &__crumb::before {
        content: '/';
        margin-inline-end: var(--chora-space-xs);
      }

      &__header {
        margin-bottom: var(--chora-space-lg);
      }

      &__type-badge {
        display: inline-block;
        padding: var(--chora-space-xs) var(--chora-space-sm);
        background: var(--chora-color-primary);
        color: var(--chora-color-on-primary);
        border-radius: var(--chora-radius-sm);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        margin-bottom: var(--chora-space-sm);
      }

      &__title {
        font-size: 28px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin-bottom: var(--chora-space-sm);
      }

      &__difficulty {
        color: var(--chora-color-text-secondary);
        font-size: 14px;
      }

      &__preview {
        background: var(--chora-color-surface-1, #f8f9fa);
        border-radius: var(--chora-radius-md);
        padding: var(--chora-space-lg);
        margin-bottom: var(--chora-space-xl);
        color: var(--chora-color-text-primary);
        line-height: 1.6;
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
export class PublicAtomViewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly bff = inject(BffClientService);

  readonly state = signal<AtomViewState>({ status: 'idle' });

  readonly atom = computed(() => {
    const s = this.state();
    return s.status === 'success' ? s.atom : null;
  });

  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  });

  private subscription = new Subscription();

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.state.set({ status: 'error', message: 'No atom ID provided' });
      return;
    }
    this.state.set({ status: 'loading' });
    this.subscription.add(
      this.bff
        .get<PublicAtomResponse>(`/api/v1/atoms/${encodeURIComponent(id)}/public`)
        .subscribe({
          next: (atom) => this.state.set({ status: 'success', atom }),
          error: () =>
            this.state.set({ status: 'error', message: 'This atom could not be loaded.' }),
        }),
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}
