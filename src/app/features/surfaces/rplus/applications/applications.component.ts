/**
 * ApplicationsComponent — R+ training-admin Course Applications review queue.
 *
 * Route: `/r/applications-admin`.
 *
 * Lists the tenant's Course Applications grouped by lifecycle state per
 * ADR-164 (chora-payments) — Submitted / In Review / Enrolled tabs are
 * the wave-4 default; the underlying `ApplicationStateFilter` supports
 * the full state vocabulary if a future wave adds more tabs.
 *
 * Per `chora-web/CLAUDE.md` §6 + §7:
 *   - standalone + `ChangeDetectionStrategy.OnPush`
 *   - signals only (signal + computed + toSignal); no BehaviorSubject
 *   - `BffClientService` is the sole HTTP adapter (wired via
 *     `ApplicationsService`)
 *   - tablet-first layout (>= 768px primary, >= 1280px desktop enhanced)
 *
 * Per `feedback_no_stubs_real_wiring`: this view always renders the live
 * BFF response; no fixtures, no in-memory fakes. Empty rows = the
 * tenant has zero applications in the current state, not a faked row.
 * Errors surface as a `role="alert"` banner with a retry CTA.
 *
 * RBAC is enforced downstream (training-admin / admin / instructor) —
 * a 401/403 is shown as a single i18n key + retry, per the integrative
 * UI mandate (no UI-side role gates).
 *
 * Each row links to `/r/applications-admin/{id}` via the routerLink CTA
 * — the detail screen is wave 5; pre-wiring the link keeps a follow-on
 * PR scoped to a single file.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ApplicationsService } from './applications.service';
import {
  applicationStatusBadge,
  type ApplicationQueue,
  type ApplicationRow,
  type ApplicationStateFilter,
  type ApplicationStatusBadge,
} from './applications.model';

/** Tabs surfaced in the wave-4 admin queue (per task brief). */
export type ApplicationsAdminTab = 'SUBMITTED' | 'IN_REVIEW' | 'ENROLLED';

export const APPLICATIONS_ADMIN_TABS: readonly ApplicationsAdminTab[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'ENROLLED',
];

/** Discriminated AsyncState — loading / success / error. */
export type ApplicationsLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly queue: ApplicationQueue }
  | { readonly status: 'error'; readonly error: string };

@Component({
  selector: 'chora-rplus-applications',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './applications.component.html',
  styleUrl: './applications.component.scss',
})
export class ApplicationsComponent {
  private readonly service = inject(ApplicationsService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Tabs ────────────────────────────────────────────────────────────
  readonly tabs = APPLICATIONS_ADMIN_TABS;
  readonly activeTab = signal<ApplicationsAdminTab>('SUBMITTED');

  /**
   * The wire-form state filter sent to the BFF mirrors the active tab
   * 1:1 — the tab list is a SUBSET of `ApplicationStateFilter`. Keeping
   * them in a computed (rather than directly typing the signal as
   * `ApplicationStateFilter`) makes a future wave's tab/non-tab states
   * (e.g. WITHDRAWN) trivial to add without widening the tab union.
   */
  readonly filter = computed<ApplicationStateFilter>(() => this.activeTab());

  // ── Load state ──────────────────────────────────────────────────────
  readonly loadState = signal<ApplicationsLoadState>({ status: 'loading' });

  readonly isLoading = computed<boolean>(
    () => this.loadState().status === 'loading',
  );
  readonly isError = computed<boolean>(
    () => this.loadState().status === 'error',
  );
  readonly errorKey = computed<string>(() => {
    const s = this.loadState();
    return s.status === 'error' ? s.error : '';
  });

  readonly applications = computed<readonly ApplicationRow[]>(() => {
    const s = this.loadState();
    return s.status === 'success' ? s.queue.applications : [];
  });

  readonly total = computed<number>(() => {
    const s = this.loadState();
    return s.status === 'success' ? s.queue.total : 0;
  });

  readonly isEmpty = computed<boolean>(
    () =>
      this.loadState().status === 'success' && this.applications().length === 0,
  );

  constructor() {
    // Re-fetch whenever the active tab changes (initial load included).
    effect(() => {
      const filter = this.filter();
      this.loadQueue(filter);
    });
  }

  selectTab(tab: ApplicationsAdminTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
  }

  retry(): void {
    this.loadQueue(this.filter());
  }

  badge(state: ApplicationRow['state']): ApplicationStatusBadge {
    return applicationStatusBadge(state);
  }

  private loadQueue(filter: ApplicationStateFilter): void {
    this.loadState.set({ status: 'loading' });
    this.service
      .getQueue(filter)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (queue) => this.loadState.set({ status: 'success', queue }),
        error: (err: unknown) =>
          this.loadState.set({ status: 'error', error: this.errorKeyFor(err) }),
      });
  }

  private errorKeyFor(err: unknown): string {
    const status = (err as { status?: number } | null)?.status;
    if (typeof status === 'number') {
      if (status === 401 || status === 403) {
        return 'rplus.applicationsAdmin.errorUnauthorised';
      }
      if (status >= 500) {
        return 'rplus.applicationsAdmin.errorUpstream';
      }
    }
    return 'rplus.applicationsAdmin.errorGeneric';
  }
}
