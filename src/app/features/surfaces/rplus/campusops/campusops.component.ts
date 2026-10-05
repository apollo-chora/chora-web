/**
 * CampusopsComponent — R+ M15a /r/campusops route entry point.
 *
 * Surfaces the list of Campus aggregates owned by the current tenant
 * (chora-delivery domain/campusops) and drives the real create flow
 * against chora-delivery via CampusopsService (BFF wired — no fixtures,
 * no fakes, fail-loud per feedback_no_stubs_real_wiring). The screen is
 * the R+ Rhythm+ admin entry point for Campus Operations — rooms /
 * equipment / incidents are future M15a+ waves on this same route.
 *
 *   - "Add Campus" opens an inline form (name + country required; address
 *     lines + city optional). Submit POSTs /v1/campus via service.create();
 *     on success the list refetches and the form closes; on error the HTTP
 *     status + message surface in a `role="alert"` panel (never swallowed).
 *   - The list is a reloadKey-driven refetch (toObservable → switchMap), so
 *     a successful create re-reads the canonical server state rather than
 *     optimistically mutating an in-memory copy.
 *
 * Polyglassmorphism design system: tablet-first (≥768px primary,
 * ≥1280px desktop enhancement), surface-rplus amber accent, no mobile
 * breakpoints per chora-web/CLAUDE.md §16.
 *
 * Standalone component, OnPush, Signals — per chora-web/CLAUDE.md §3.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CampusopsService } from './campusops.service';
import type { Campus } from './campusops.model';

@Component({
  selector: 'chora-rplus-campusops',
  imports: [TranslatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campusops.component.html',
  styleUrl: './campusops.component.scss',
})
export class CampusopsComponent {
  private readonly campusopsService = inject(CampusopsService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Refetch trigger. Incrementing it re-runs `getCampuses()` via the
   * toObservable → switchMap pipeline below, so a successful create
   * reflects the canonical server state (NOT an optimistic local insert).
   */
  private readonly reloadKey = signal(0);

  private readonly data = toSignal(
    toObservable(this.reloadKey).pipe(
      switchMap(() => this.campusopsService.getCampuses()),
    ),
    { initialValue: null },
  );

  readonly tenantName = computed<string>(() => this.data()?.tenantName ?? '');
  readonly totalCampuses = computed<number>(
    () => this.data()?.totalCampuses ?? 0,
  );
  readonly campuses = computed<readonly Campus[]>(
    () => this.data()?.campuses ?? [],
  );

  // --- Create form state (signal-first) --------------------------------------
  readonly createFormOpen = signal(false);
  readonly formName = signal('');
  readonly formAddressLine1 = signal('');
  readonly formAddressLine2 = signal('');
  readonly formCity = signal('');
  readonly formCountry = signal('');
  readonly submitting = signal(false);
  readonly createError = signal<string | null>(null);

  /**
   * Submit gate: name present + country a 2-letter ISO 3166-1 alpha-2
   * code (mirrors the chora-delivery NewCampus validation so the button
   * stays disabled for inputs the backend would reject) + not mid-flight.
   */
  readonly canSubmit = computed<boolean>(
    () =>
      this.formName().trim().length > 0 &&
      /^[A-Za-z]{2}$/.test(this.formCountry().trim()) &&
      !this.submitting(),
  );

  /** Short ID rendered as the card's monospaced code badge. */
  shortId(campusId: string): string {
    return campusId.slice(0, 8);
  }

  /** Open the create form. */
  onCreateClicked(): void {
    this.createError.set(null);
    this.createFormOpen.set(true);
  }

  /** Close + reset the create form. */
  onCancelCreate(): void {
    this.createFormOpen.set(false);
    this.createError.set(null);
    this.formName.set('');
    this.formAddressLine1.set('');
    this.formAddressLine2.set('');
    this.formCity.set('');
    this.formCountry.set('');
  }

  /**
   * Create the campus. Real POST /v1/campus via service.create(); on
   * success refetch + close, on failure surface the HTTP status loud.
   */
  onCreateSubmit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.createError.set(null);
    this.campusopsService
      .create({
        name: this.formName().trim(),
        addressLine1: this.formAddressLine1().trim(),
        addressLine2: this.formAddressLine2().trim(),
        city: this.formCity().trim(),
        country: this.formCountry().trim().toUpperCase(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.onCancelCreate();
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.createError.set(describeHttpError(err));
        },
      });
  }
}

/** Render an HTTP error as a "<status> — <message>" string for the alert panel. */
function describeHttpError(err: HttpErrorResponse): string {
  const status = err.status ?? 0;
  const body = err.error as { message?: string; error?: string } | string | null;
  let message = err.message || 'Request failed';
  if (body && typeof body === 'object') {
    message = body.message ?? body.error ?? message;
  } else if (typeof body === 'string' && body.trim()) {
    message = body;
  }
  return status ? `${status}: ${message}` : message;
}
