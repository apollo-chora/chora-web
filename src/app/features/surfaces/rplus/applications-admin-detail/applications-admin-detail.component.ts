/**
 * ApplicationsAdminDetailComponent — R+ Wave-5 drill-down (`/r/applications-admin/:id`).
 *
 * Read-only admin view of a single Course Application. The admin-side
 * endpoint `/api/v1/applications/{id}` is GET-only — the lifecycle
 * action endpoints (accept-offer / withdraw / etc.) live on the
 * learner-side `/v1/me/applications/{id}/*` surface and are NOT exposed
 * here. The screen renders the canonical row metadata, the optional
 * funding-line breakdown, and the append-only state-transition history.
 *
 * Route: `/r/applications-admin/:id` (route entry owned by master). The
 * `:id` route param is injected via `withComponentInputBinding()` per
 * chora-web/CLAUDE.md §8 — the signal input pattern keeps the component
 * standalone + reactive without a manual ActivatedRoute subscription.
 *
 * Data path: ApplicationsAdminDetailService → BffClientService →
 * chora-gateway BFF → chora-delivery applications_admin_handler.go
 * (no fixtures, no mocks per feedback_no_stubs_real_wiring).
 *
 * Three render branches (discriminated AsyncState):
 *   - loading → role="status" + aria-busy
 *   - error   → role="alert" banner + Retry CTA (incl. 404 not-found)
 *   - success → full glass-panel detail with history timeline
 *
 * Surface: R+ Rhythm+ (.surface-rplus accent). Tablet-first: ≥768px
 * primary, ≥1280px desktop enhanced (2-column field grid).
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ApplicationsAdminDetailService } from './applications-admin-detail.service';
import {
  type ApplicationDetail,
  type ApplicationStatus,
  type ApplicationStatusBadge,
  applicationStatusBadge,
} from './applications-admin-detail.model';

/** Discriminated AsyncState — loading / success / error. */
export type ApplicationsAdminDetailLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly detail: ApplicationDetail }
  | { readonly status: 'error'; readonly errorKey: string };

@Component({
  selector: 'chora-rplus-applications-admin-detail',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './applications-admin-detail.component.html',
  styleUrl: './applications-admin-detail.component.scss',
})
export class ApplicationsAdminDetailComponent {
  private readonly service = inject(ApplicationsAdminDetailService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * `:id` route param wired via `withComponentInputBinding()` —
   * provideRouter is already configured with that feature at the app
   * root per chora-web/CLAUDE.md §8.
   */
  readonly id = input.required<string>();

  private readonly loadStateSignal =
    signal<ApplicationsAdminDetailLoadState>({ status: 'loading' });

  readonly loadState = computed<ApplicationsAdminDetailLoadState>(
    () => this.loadStateSignal(),
  );

  readonly isLoading = computed<boolean>(
    () => this.loadStateSignal().status === 'loading',
  );

  readonly isError = computed<boolean>(
    () => this.loadStateSignal().status === 'error',
  );

  readonly errorKey = computed<string>(() => {
    const s = this.loadStateSignal();
    return s.status === 'error' ? s.errorKey : '';
  });

  readonly detail = computed<ApplicationDetail | null>(() => {
    const s = this.loadStateSignal();
    return s.status === 'success' ? s.detail : null;
  });

  constructor() {
    // Re-fetch whenever the :id route param changes (initial nav incl.).
    effect(() => {
      const id = this.id();
      this.loadDetail(id);
    });
  }

  badge(state: ApplicationStatus): ApplicationStatusBadge {
    return applicationStatusBadge(state);
  }

  /** Retry the failing fetch using the current :id signal. */
  retry(): void {
    this.loadDetail(this.id());
  }

  /** Format SGD cents as a SGD currency string (e.g., `$500.00`). */
  formatSgd(cents: number): string {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  }

  private loadDetail(id: string): void {
    this.loadStateSignal.set({ status: 'loading' });
    this.service
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) =>
          this.loadStateSignal.set({ status: 'success', detail }),
        error: (err: unknown) =>
          this.loadStateSignal.set({
            status: 'error',
            errorKey: this.errorKeyFor(err),
          }),
      });
  }

  private errorKeyFor(err: unknown): string {
    const status = (err as { status?: number } | null)?.status;
    if (typeof status === 'number') {
      if (status === 404) return 'rplus.applicationsAdminDetail.errorNotFound';
      if (status === 401 || status === 403) {
        return 'rplus.applicationsAdminDetail.errorUnauthorised';
      }
      if (status >= 500) {
        return 'rplus.applicationsAdminDetail.errorUpstream';
      }
    }
    return 'rplus.applicationsAdminDetail.errorGeneric';
  }
}
