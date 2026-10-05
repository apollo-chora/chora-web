/**
 * ProjectGroupsComponent — R+ Stage C-lite wave-2b (M15b) + create flow.
 *
 * Surfaces the chora-delivery ProjectGroup aggregate to the R+
 * instructor view. The component lists all in-tenant project groups
 * (optionally filtered by `?course_id=`) as glass-panel cards with a
 * state badge (FORMING / ACTIVE / SUBMITTED / GRADED), and drives the
 * real create + advance flows against chora-delivery via
 * ProjectGroupsService (BFF wired — no fixtures, no fakes, fail-loud per
 * `feedback_no_stubs_real_wiring`):
 *
 *   - CREATE  — a "New group" CTA opens an inline form (name + course ID
 *               + optional members, one GCID per line; the first is the
 *               leader). Submit POSTs /api/v1/project-groups via
 *               service.create(); on success the list refetches and the
 *               form closes; on error the HTTP status + message surface in
 *               a `role="alert"` panel (never swallowed).
 *   - SUBMIT  — visible only on ACTIVE groups; POSTs to
 *               /api/v1/project-groups/{id}/submit
 *   - GRADE   — visible only on SUBMITTED groups; POSTs to
 *               /api/v1/project-groups/{id}/grade (placeholder 100%
 *               score + empty feedback in wave-2b; a richer grading
 *               composer lands in wave-3)
 *
 * The list is a reloadKey-driven refetch (toObservable → switchMap), so a
 * successful create/submit/grade re-reads the canonical server state
 * (NOT an optimistic local mutation).
 *
 * Tablet-first responsive grid: 1 column at 768px, 2 columns at
 * 1280px, 3 columns at 1440px+. Glassmorphism + R+ amber accent.
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
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ProjectGroupsService } from './project-groups.service';
import {
  type ProjectGroup,
  badgeForState,
  canGrade,
  canSubmit,
  iconForState,
} from './project-groups.model';

/** Discriminated result of a list refetch — keeps fail-loud errors out of
 *  band from the (possibly empty) success projection. */
type ListResult =
  | { readonly ok: true; readonly items: readonly ProjectGroup[] }
  | { readonly ok: false; readonly error: string };

@Component({
  selector: 'chora-rplus-project-groups',
  imports: [TranslatePipe, DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-groups.component.html',
  styleUrl: './project-groups.component.scss',
})
export class ProjectGroupsComponent {
  private readonly service = inject(ProjectGroupsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Optional course filter, read once from the route query string. */
  private readonly courseId =
    this.route.snapshot.queryParamMap.get('course_id') ?? undefined;

  /**
   * Refetch trigger. Incrementing it re-runs `service.list()` via the
   * toObservable → switchMap pipeline below, so a successful
   * create/submit/grade reflects the canonical server state (NOT an
   * optimistic local mutation — fixes the prior bare-subscribe refetch
   * gap). Errors are caught in-stream so the pipeline stays alive for the
   * next reload.
   */
  private readonly reloadKey = signal(0);

  private readonly data = toSignal<ListResult | null>(
    toObservable(this.reloadKey).pipe(
      switchMap(() =>
        this.service.list(this.courseId).pipe(
          switchMap((items) => of<ListResult>({ ok: true, items })),
          catchError((err: HttpErrorResponse) =>
            of<ListResult>({ ok: false, error: describeHttpError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: null },
  );

  readonly isLoading = computed<boolean>(() => this.data() === null);
  readonly groups = computed<readonly ProjectGroup[]>(() => {
    const d = this.data();
    return d?.ok ? d.items : [];
  });
  readonly groupCount = computed<number>(() => this.groups().length);
  /** List-level fetch error (fail-loud) — distinct from action errors. */
  readonly listError = computed<string | null>(() => {
    const d = this.data();
    return d && !d.ok ? d.error : null;
  });

  // ── Search + latest-first sort + client-side pagination ─────────────
  /** Free-text filter over name / course / state. */
  readonly searchQuery = signal<string>('');
  private readonly PAGE_SIZE = 12;
  readonly visibleLimit = signal<number>(this.PAGE_SIZE);

  /** Search-filtered groups, newest-first (createdAt desc, id tiebreak). */
  readonly filteredGroups = computed<readonly ProjectGroup[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const rows = q
      ? this.groups().filter((g) =>
          [g.name, g.courseId, g.state].some((f) =>
            (f ?? '').toLowerCase().includes(q),
          ),
        )
      : this.groups();
    return [...rows].sort((a, b) =>
      (b.createdAt || b.id).localeCompare(a.createdAt || a.id),
    );
  });

  /** The cards actually rendered (paged slice). */
  readonly visibleGroups = computed<readonly ProjectGroup[]>(() =>
    this.filteredGroups().slice(0, this.visibleLimit()),
  );
  readonly hasMore = computed<boolean>(
    () => this.filteredGroups().length > this.visibleLimit(),
  );
  readonly hasGroups = computed<boolean>(() => this.groups().length > 0);
  /** Groups exist but the current search matched none. */
  readonly noMatch = computed<boolean>(
    () => this.groups().length > 0 && this.filteredGroups().length === 0,
  );

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.visibleLimit.set(this.PAGE_SIZE);
  }
  loadMore(): void {
    this.visibleLimit.update((n) => n + this.PAGE_SIZE);
  }

  /**
   * Re-fetch the project-group list after a list-load failure (fail-loud
   * retry). Bumps the reloadKey so the toObservable → switchMap pipeline
   * re-runs `service.list()` and re-reads canonical server state — mirrors
   * the catalog J2 retry affordance (CHO-1830).
   */
  onRetry(): void {
    this.reloadKey.update((n) => n + 1);
  }

  /** Group IDs currently waiting on a submit/grade POST (CTA disable). */
  private readonly pendingState = signal<readonly string[]>([]);
  /** Action-level error (submit / grade) — surfaced loud in the header. */
  private readonly actionErrorState = signal<string | null>(null);

  /** Combined error shown in the header alert — action error wins, else the
   *  list-fetch error. */
  readonly errorMessage = computed<string | null>(
    () => this.actionErrorState() ?? this.listError(),
  );

  // --- Create form state (signal-first) --------------------------------------
  readonly createFormOpen = signal(false);
  readonly formName = signal('');
  readonly formCourseId = signal('');
  readonly formMembers = signal('');
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);

  /** Submit gate: name + course id present and not mid-flight. */
  readonly canCreate = computed<boolean>(
    () =>
      this.formName().trim().length > 0 &&
      this.formCourseId().trim().length > 0 &&
      !this.creating(),
  );

  /** Open the create form, seeding the course id from any active filter. */
  onCreateClicked(): void {
    this.createError.set(null);
    if (this.courseId && this.formCourseId().trim().length === 0) {
      this.formCourseId.set(this.courseId);
    }
    this.createFormOpen.set(true);
  }

  /** Close + reset the create form. */
  onCancelCreate(): void {
    this.createFormOpen.set(false);
    this.createError.set(null);
    this.formName.set('');
    this.formCourseId.set('');
    this.formMembers.set('');
  }

  /**
   * Create the project group. Real POST /api/v1/project-groups via
   * service.create(); on success refetch + close, on failure surface the
   * status loud and keep the form open so the user can correct + retry.
   * Members are parsed one GCID per line (or comma-separated); the first
   * is the leader, the rest are members.
   */
  onCreateSubmit(): void {
    if (!this.canCreate()) return;
    const members = this.formMembers()
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((gcid, i) => ({
        gcid,
        role: (i === 0 ? 'leader' : 'member') as 'leader' | 'member',
      }));
    this.creating.set(true);
    this.createError.set(null);
    this.service
      .create({
        name: this.formName().trim(),
        courseId: this.formCourseId().trim(),
        members,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.onCancelCreate();
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.creating.set(false);
          this.createError.set(describeHttpError(err));
        },
      });
  }

  // --- Advance FSM (submit / grade) ------------------------------------------

  submit(g: ProjectGroup): void {
    if (!canSubmit(g) || this.isPending(g.id)) return;
    this.markPending(g.id);
    this.actionErrorState.set(null);
    this.service
      .submit(g.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearPending(g.id);
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.clearPending(g.id);
          this.actionErrorState.set(describeHttpError(err));
        },
      });
  }

  grade(g: ProjectGroup): void {
    if (!canGrade(g) || this.isPending(g.id)) return;
    this.markPending(g.id);
    this.actionErrorState.set(null);
    // Wave-2b: placeholder grade payload — a full grading composer
    // (score + rubric + feedback) lands in wave-3. The 100% / empty
    // feedback default exercises the wire path and lets the
    // instructor advance the FSM from the list view.
    this.service
      .grade(g.id, { scorePct: 100, feedback: '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearPending(g.id);
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.clearPending(g.id);
          this.actionErrorState.set(describeHttpError(err));
        },
      });
  }

  badgeClass(g: ProjectGroup): string {
    return badgeForState(g.state);
  }

  stateIcon(g: ProjectGroup): string {
    return iconForState(g.state);
  }

  canSubmitGroup(g: ProjectGroup): boolean {
    return canSubmit(g);
  }

  canGradeGroup(g: ProjectGroup): boolean {
    return canGrade(g);
  }

  isPending(id: string): boolean {
    return this.pendingState().includes(id);
  }

  shortGcid(gcid: string): string {
    // Show the first 8 chars + … to keep the row readable while
    // staying lossless under hover (FE shows full gcid in the
    // wave-3 detail drawer).
    if (gcid.length <= 12) return gcid;
    return gcid.slice(0, 8) + '…';
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private markPending(id: string): void {
    this.pendingState.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  private clearPending(id: string): void {
    this.pendingState.update((ids) => ids.filter((x) => x !== id));
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
