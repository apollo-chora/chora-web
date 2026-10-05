/**
 * PublicContentPreviewComponent — Generic content preview that resolves
 * a slug to an atom, topic, or path and displays a preview with sign-up CTA.
 *
 * Route: /p/:slug
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

type ContentType = 'atom' | 'topic' | 'path';

interface PublicContentResponse {
  id: string;
  content_type: ContentType;
  title: string;
  preview_text: string;
  slug: string;
}

type ContentPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; content: PublicContentResponse }
  | { status: 'error'; message: string };

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  atom: 'Learning Atom',
  topic: 'Topic',
  path: 'Learning Path',
};

@Component({
  selector: 'chora-public-content-preview',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="content-preview" data-testid="public-content-preview">
      @if (state().status === 'loading') {
        <div class="content-preview__loading" data-testid="content-loading">
          <p>Loading content...</p>
        </div>
      } @else if (state().status === 'error') {
        <div class="content-preview__error" data-testid="content-error">
          <h2>Content not found</h2>
          <p>{{ errorMessage() }}</p>
          <a routerLink="/register" class="content-preview__cta" data-testid="content-error-cta">
            Join Chora to explore
          </a>
        </div>
      } @else if (state().status === 'success') {
        <span class="content-preview__type-indicator" data-testid="content-type-indicator">
          {{ contentTypeLabel() }}
        </span>

        <h1 class="content-preview__title" data-testid="content-title">
          {{ content()!.title }}
        </h1>

        <section class="content-preview__body" data-testid="content-preview-text">
          <p>{{ content()!.preview_text }}</p>
        </section>

        <div class="content-preview__cta-container">
          <a routerLink="/register" class="content-preview__cta" data-testid="content-signup-cta">
            Join Chora to continue
          </a>
        </div>
      }
    </article>
  `,
  styles: [`
    .content-preview {
      max-width: 720px;
      margin: 0 auto;
      padding: var(--chora-space-xl);

      &__loading, &__error {
        text-align: center;
        padding: var(--chora-space-2xl);
        color: var(--chora-color-text-secondary);
      }

      &__type-indicator {
        display: inline-block;
        padding: var(--chora-space-xs) var(--chora-space-sm);
        background: var(--chora-color-surface-1, #f8f9fa);
        border-radius: var(--chora-radius-sm);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--chora-color-text-secondary);
        margin-bottom: var(--chora-space-md);
      }

      &__title {
        font-size: 28px;
        font-weight: 700;
        color: var(--chora-color-text-primary);
        margin-bottom: var(--chora-space-lg);
      }

      &__body {
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
export class PublicContentPreviewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly bff = inject(BffClientService);

  readonly state = signal<ContentPreviewState>({ status: 'idle' });

  readonly content = computed(() => {
    const s = this.state();
    return s.status === 'success' ? s.content : null;
  });

  readonly contentTypeLabel = computed(() => {
    const c = this.content();
    return c ? CONTENT_TYPE_LABELS[c.content_type] : '';
  });

  readonly errorMessage = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : '';
  });

  private subscription = new Subscription();

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) {
      this.state.set({ status: 'error', message: 'No content slug provided' });
      return;
    }
    this.state.set({ status: 'loading' });
    this.subscription.add(
      this.bff
        .get<PublicContentResponse>(`/api/v1/content/${encodeURIComponent(slug)}`)
        .subscribe({
          next: (content) => this.state.set({ status: 'success', content }),
          error: () =>
            this.state.set({ status: 'error', message: 'This content could not be found.' }),
        }),
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}
