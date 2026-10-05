/**
 * CertificationsComponent — R+ /r/certifications surface (M12 R+ buildout).
 *
 * Renders the issued certifications for the current tenant and drives the
 * real issue + revoke flows against chora-delivery via CertificationsService
 * (BFF wired — no fixtures, no fakes, fail-loud per feedback_no_stubs_real_wiring).
 *
 *   - Issue CTA opens an inline form (learner GCID + course ID + optional
 *     accomplishments). Submit POSTs /api/certifications via service.issue();
 *     on success the list refetches and the form closes; on error the HTTP
 *     status + message surface in a `role="alert"` panel (never swallowed).
 *   - Revoke calls service.revoke() (DELETE) for real; the error surfaces
 *     loud if the backend rejects it rather than faking an in-memory revoke.
 *   - The list is a reloadKey-driven refetch (toObservable → switchMap), so a
 *     successful issue/revoke re-reads the canonical server state.
 *
 * Surface: R+ Rhythm+ — amber accent (`#b45309` / `#ea580c`).
 * Tablet-first: ≥768px primary, ≥1280px desktop enhanced.
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
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CertificationsService } from './certifications.service';
import {
  Certification,
  CertificationStatus,
  statusBadgeVariant,
} from './certifications.model';

@Component({
  selector: 'chora-rplus-certifications',
  imports: [TranslatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './certifications.component.html',
  styleUrl: './certifications.component.scss',
})
export class CertificationsComponent {
  private readonly service = inject(CertificationsService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Refetch trigger. Incrementing it re-runs `service.list()` via the
   * toObservable → switchMap pipeline below, so a successful issue/revoke —
   * or a retry after a load error — reflects the canonical server state (NOT
   * an optimistic local mutation).
   */
  private readonly reloadKey = signal(0);

  /**
   * Single source of async truth. Every reloadKey change re-fetches and the
   * stream EMITS its own load state: `startWith(loading)` shows skeletons on
   * each (re)fetch (J2 / CHO-1830) and `catchError` turns an HTTP failure into
   * a fail-loud error state rather than a silent empty list. The state is
   * emitted by the stream (never written to a signal inside the subscription),
   * so there is no write-during-effect hazard.
   */
  private readonly result = toSignal(
    toObservable(this.reloadKey).pipe(
      switchMap(() =>
        this.service.list().pipe(
          map((data) => ({ status: 'loaded' as const, data, error: null })),
          startWith({ status: 'loading' as const, data: null, error: null }),
          catchError((err: HttpErrorResponse) =>
            of({
              status: 'error' as const,
              data: null,
              error: describeHttpError(err),
            }),
          ),
        ),
      ),
    ),
    {
      initialValue: { status: 'loading' as const, data: null, error: null },
    },
  );

  /** 'loading' | 'loaded' | 'error' — drives the skeleton / list / banner. */
  readonly loadState = computed(() => this.result().status);
  readonly loadError = computed<string | null>(() => this.result().error);
  private readonly data = computed(() => this.result().data);

  readonly tenantName = computed<string>(() => this.data()?.tenantName ?? '');
  readonly totalCertifications = computed<number>(
    () => this.data()?.totalCertifications ?? 0,
  );
  readonly items = computed<readonly Certification[]>(
    () => this.data()?.items ?? [],
  );

  // --- Issue form state (signal-first) ---------------------------------------
  readonly issueFormOpen = signal(false);
  readonly formLearnerGcid = signal('');
  readonly formCourseId = signal('');
  readonly formAccomplishments = signal('');
  readonly submitting = signal(false);
  readonly issueError = signal<string | null>(null);

  /** Submit gate: both ids present and not mid-flight. */
  readonly canSubmit = computed<boolean>(
    () =>
      this.formLearnerGcid().trim().length > 0 &&
      this.formCourseId().trim().length > 0 &&
      !this.submitting(),
  );

  // --- Revoke state ----------------------------------------------------------
  /** certId currently being revoked (null when idle) — drives the row spinner. */
  readonly revokingId = signal<string | null>(null);
  readonly revokeError = signal<string | null>(null);

  badge(status: CertificationStatus): string {
    return statusBadgeVariant(status);
  }

  /** Re-fetch the certifications list after a load error (fail-loud retry). */
  onRetry(): void {
    this.reloadKey.update((n) => n + 1);
  }

  /** Open the issue form. */
  onIssueClicked(): void {
    this.issueError.set(null);
    this.issueFormOpen.set(true);
  }

  /** Close + reset the issue form. */
  onCancelIssue(): void {
    this.issueFormOpen.set(false);
    this.issueError.set(null);
    this.formLearnerGcid.set('');
    this.formCourseId.set('');
    this.formAccomplishments.set('');
  }

  /**
   * Issue the certificate. Real POST /api/certifications via service.issue();
   * on success refetch + close, on failure surface the status loud.
   */
  onIssueSubmit(): void {
    if (!this.canSubmit()) return;
    const accomplishments = this.formAccomplishments()
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    this.submitting.set(true);
    this.issueError.set(null);
    this.service
      .issue({
        learnerGcid: this.formLearnerGcid().trim(),
        courseId: this.formCourseId().trim(),
        accomplishments,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.onCancelIssue();
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.issueError.set(describeHttpError(err));
        },
      });
  }

  /**
   * Revoke a certificate for real (DELETE). No optimistic/in-memory fake —
   * if the backend rejects the call the error surfaces loud and the list is
   * left untouched.
   */
  onRevokeClicked(certId: string): void {
    if (this.revokingId()) return;
    this.revokeError.set(null);
    this.revokingId.set(certId);
    this.service
      .revoke(certId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.revokingId.set(null);
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.revokingId.set(null);
          this.revokeError.set(describeHttpError(err));
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
