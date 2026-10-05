import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-access-denied',
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="access-denied" data-testid="access-denied-page" role="main">
      <div class="access-denied__icon" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="96"
          height="96"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <line x1="12" y1="16" x2="12" y2="19" />
        </svg>
      </div>
      <h1 class="access-denied__code">403</h1>
      <h2 class="access-denied__title">{{ 'errors.access_denied.title' | translate }}</h2>
      <p class="access-denied__message">
        {{ 'errors.access_denied.message' | translate }}
      </p>
      @if (correlationId()) {
        <p class="access-denied__correlation" data-testid="correlation-id">
          {{ 'errors.access_denied.correlation' | translate }}: {{ correlationId() }}
        </p>
      }
      <a
        routerLink="/dashboard"
        class="access-denied__link"
        data-testid="access-denied-dashboard-link">
        {{ 'errors.access_denied.go_dashboard' | translate }}
      </a>
    </div>
  `,
  styleUrl: './access-denied.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessDeniedComponent {
  private readonly route = inject(ActivatedRoute);

  readonly correlationId = computed((): string | null => {
    const snapshot = this.route.snapshot;
    const fromQuery = snapshot.queryParamMap.get('correlationId');
    if (fromQuery) {
      return fromQuery;
    }
    const fromData = (snapshot.data as Record<string, unknown>)['correlationId'];
    if (typeof fromData === 'string') {
      return fromData;
    }
    return null;
  });
}
