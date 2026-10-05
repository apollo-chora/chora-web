import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'chora-not-found',
  imports: [RouterLink],
  template: `
    <div class="not-found" data-testid="not-found-page">
      <h1 class="not-found__code">404</h1>
      <h2 class="not-found__title">Page Not Found</h2>
      <p class="not-found__message">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <a routerLink="/" class="not-found__link" data-testid="not-found-home-link">Go Home</a>
    </div>
  `,
  styles: [
    `
      .not-found {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        text-align: center;
        padding: var(--chora-space-2xl);

        &__code {
          font-size: 96px;
          font-weight: 800;
          color: var(--chora-color-primary);
          line-height: 1;
          margin-bottom: var(--chora-space-sm);
        }

        &__title {
          font-size: 24px;
          font-weight: 600;
          color: var(--chora-color-text-primary);
          margin-bottom: var(--chora-space-md);
        }

        &__message {
          color: var(--chora-color-text-secondary);
          margin-bottom: var(--chora-space-xl);
          max-width: 400px;
        }

        &__link {
          color: var(--chora-color-primary);
          text-decoration: none;
          font-weight: 600;
          padding: var(--chora-space-sm) var(--chora-space-lg);
          border: 2px solid var(--chora-color-primary);
          border-radius: var(--chora-radius-md);
          transition: all var(--chora-transition-fast);

          &:hover {
            background: var(--chora-color-primary);
            color: var(--chora-color-on-primary);
          }
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
