/**
 * ProjectGroupDetailComponent — R+ Wave-5 drill-down for a single
 * project group (`/r/project-groups/:id`).
 *
 * Drill-down from `/r/project-groups` queue. Renders the project group
 * with: state badge (FORMING / ACTIVE / SUBMITTED / GRADED), group name,
 * member list with role distinction (leader = crown icon), submission
 * timestamp + grader gcid + score + feedback (when terminal), and the
 * per-FSM action CTAs:
 *
 *   - SUBMIT — visible only on ACTIVE groups; POSTs to
 *              /api/v1/project-groups/{id}/submit
 *   - GRADE  — visible only on SUBMITTED groups; POSTs to
 *              /api/v1/project-groups/{id}/grade (placeholder 100%
 *              score + empty feedback per wave-2b; the richer grading
 *              composer is shared work with the list-view CTAs)
 *
 * Route: `/r/project-groups/:id` (route entry owned by master). The
 * `:id` route param is injected via `withComponentInputBinding()` per
 * chora-web/CLAUDE.md §8.
 *
 * Data path: ProjectGroupDetailService → BffClientService →
 * chora-gateway BFF → chora-delivery project_group_handler.go
 * (no fixtures, no mocks per feedback_no_stubs_real_wiring — failed
 * BE → fail-loud error banner; never fabricate a placeholder).
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
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ChoraEntityPickerComponent } from '../../../../shared/components/chora-entity-picker/entity-picker.component';
import { type EntityRef } from '../../../../shared/components/chora-entity-picker/entity-picker.model';
import { MemberEntitySearchPort } from '../../../../shared/components/transaction-history/adapters/member-entity-search.port';
import { ProjectGroupDetailService } from './project-group-detail.service';
import {
  type ProjectGroup,
  type ProjectGroupState,
  badgeForState,
  canGrade,
  canSubmit,
  iconForState,
  membersMutable,
} from './project-group-detail.model';

/** Discriminated AsyncState — loading / success / error. */
export type ProjectGroupDetailLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly group: ProjectGroup }
  | { readonly status: 'error'; readonly errorKey: string };

@Component({
  selector: 'chora-rplus-project-group-detail',
  imports: [DatePipe, RouterLink, TranslatePipe, ChoraEntityPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-group-detail.component.html',
  styleUrl: './project-group-detail.component.scss',
})
export class ProjectGroupDetailComponent {
  private readonly service = inject(ProjectGroupDetailService);
  private readonly destroyRef = inject(DestroyRef);

  /** Real tenant-member search adapter backing the add-member picker (name
   *  search, no raw-GCID paste) — bound via `[searchPortOverride]`. */
  protected readonly memberSearch = inject(MemberEntitySearchPort);

  /** `:id` route param wired via `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  /** Tracks whether a write CTA (Submit / Grade / member edit) is in flight. */
  private readonly writePending = signal<boolean>(false);

  /** Inline error for a failed add/remove — surfaced in the members block
   *  WITHOUT collapsing the whole panel into the load-error state. */
  private readonly memberEditErrorSignal = signal<string>('');

  private readonly loadStateSignal = signal<ProjectGroupDetailLoadState>({
    status: 'loading',
  });

  readonly loadState = computed<ProjectGroupDetailLoadState>(
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

  readonly group = computed<ProjectGroup | null>(() => {
    const s = this.loadStateSignal();
    return s.status === 'success' ? s.group : null;
  });

  readonly canSubmitGroup = computed<boolean>(() => {
    const g = this.group();
    return g ? canSubmit(g) : false;
  });

  readonly canGradeGroup = computed<boolean>(() => {
    const g = this.group();
    return g ? canGrade(g) : false;
  });

  readonly isWritePending = computed<boolean>(() => this.writePending());

  readonly memberEditError = computed<string>(() =>
    this.memberEditErrorSignal(),
  );

  /** Whether the roster may be edited (add/remove) — FORMING/ACTIVE only.
   *  Mirrors the BE `MembersMutable()` invariant. */
  readonly canEditMembers = computed<boolean>(() => {
    const g = this.group();
    return g ? membersMutable(g) : false;
  });

  constructor() {
    // Re-fetch whenever the :id route param changes (initial nav incl.).
    effect(() => {
      const id = this.id();
      this.loadGroup(id);
    });
  }

  badgeClass(state: ProjectGroupState): string {
    return badgeForState(state);
  }

  stateIcon(state: ProjectGroupState): string {
    return iconForState(state);
  }

  /** Retry the failing fetch using the current :id signal. */
  retry(): void {
    this.loadGroup(this.id());
  }

  /**
   * Trigger the BE Submit transition (ACTIVE → SUBMITTED). Mirrors the
   * list-view CTA — the BE invariant ErrNotActive rejects non-ACTIVE
   * with 409; the FE shows that as `errorConflict`.
   */
  submit(): void {
    const g = this.group();
    if (!g || !this.canSubmitGroup() || this.writePending()) return;
    this.writePending.set(true);
    this.service
      .submit(g.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.loadStateSignal.set({ status: 'success', group: updated });
          this.writePending.set(false);
        },
        error: (err: unknown) => {
          this.writePending.set(false);
          this.loadStateSignal.set({
            status: 'error',
            errorKey: this.errorKeyFor(err),
          });
        },
      });
  }

  /**
   * Trigger the BE Grade transition (SUBMITTED → GRADED). Uses the
   * placeholder 100% / empty-feedback payload mirroring the list-view
   * CTA — a richer grading composer (score + rubric + feedback) lands
   * in a follow-on iter. Per feedback_no_stubs_real_wiring we exercise
   * the wire path against live BE.
   */
  grade(): void {
    const g = this.group();
    if (!g || !this.canGradeGroup() || this.writePending()) return;
    this.writePending.set(true);
    this.service
      .grade(g.id, { scorePct: 100, feedback: '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.loadStateSignal.set({ status: 'success', group: updated });
          this.writePending.set(false);
        },
        error: (err: unknown) => {
          this.writePending.set(false);
          this.loadStateSignal.set({
            status: 'error',
            errorKey: this.errorKeyFor(err),
          });
        },
      });
  }

  /**
   * Add-member picker selection handler. POSTs the picked member (role
   * defaults to `member` — leader designation stays with the create flow).
   * A duplicate/locked add 409s and a missing group 404s, surfaced inline via
   * `memberEditError` so the panel stays visible.
   */
  onMemberPicked(ref: EntityRef): void {
    const g = this.group();
    if (!g || !this.canEditMembers() || this.writePending()) return;
    this.writePending.set(true);
    this.memberEditErrorSignal.set('');
    this.service
      .addMember(g.id, ref.id, 'member')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.loadStateSignal.set({ status: 'success', group: updated });
          this.writePending.set(false);
        },
        error: (err: unknown) => {
          this.writePending.set(false);
          this.memberEditErrorSignal.set(this.memberEditErrorKeyFor(err));
        },
      });
  }

  /**
   * Remove a member by gcid. A gcid that is no longer a member 404s and a
   * frozen roster 409s — both surface inline via `memberEditError`.
   */
  removeMember(gcid: string): void {
    const g = this.group();
    if (!g || !this.canEditMembers() || this.writePending() || !gcid) return;
    this.writePending.set(true);
    this.memberEditErrorSignal.set('');
    this.service
      .removeMember(g.id, gcid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.loadStateSignal.set({ status: 'success', group: updated });
          this.writePending.set(false);
        },
        error: (err: unknown) => {
          this.writePending.set(false);
          this.memberEditErrorSignal.set(this.memberEditErrorKeyFor(err));
        },
      });
  }

  private memberEditErrorKeyFor(err: unknown): string {
    const status = (err as { status?: number } | null)?.status;
    if (status === 409) return 'rplus.projectGroupDetail.members.errorConflict';
    if (status === 404) return 'rplus.projectGroupDetail.members.errorNotFound';
    if (status === 401 || status === 403) {
      return 'rplus.projectGroupDetail.members.errorUnauthorised';
    }
    return 'rplus.projectGroupDetail.members.errorGeneric';
  }

  shortGcid(gcid: string): string {
    if (gcid.length <= 12) return gcid;
    return gcid.slice(0, 8) + '…';
  }

  private loadGroup(id: string): void {
    this.loadStateSignal.set({ status: 'loading' });
    this.service
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (group) => this.loadStateSignal.set({ status: 'success', group }),
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
      if (status === 404) return 'rplus.projectGroupDetail.errorNotFound';
      if (status === 401 || status === 403) {
        return 'rplus.projectGroupDetail.errorUnauthorised';
      }
      if (status === 409) return 'rplus.projectGroupDetail.errorConflict';
      if (status >= 500) return 'rplus.projectGroupDetail.errorUpstream';
    }
    return 'rplus.projectGroupDetail.errorGeneric';
  }
}
