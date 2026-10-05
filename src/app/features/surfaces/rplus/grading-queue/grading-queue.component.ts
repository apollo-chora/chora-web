/**
 * GradingQueueComponent — R+ instructor grading queue (ADR-172 HITL grading).
 *
 * Route component at `/r/assessments/:assessmentId/grading-queue`.
 *
 * Lists the assessment's submissions (reuses AssessmentMonitorService's
 * list-submissions loader — the canonical submissions source for R+) with each
 * row's review_status + a "Review" action. Selecting a row opens the
 * SubmissionGradingDetailComponent panel inline.
 *
 * Bulk actions:
 *   - "Approve all"        → approveAll (every GRADED submission → APPROVED)
 *   - "Approve & release"  → approveAll({ release: true }) (chains to release)
 *   - "Release results"    → ENABLED only when every graded submission is
 *     APPROVED (per-row review_status gate, ADR-172).
 *
 * Confirm dialog wraps the bulk "Approve & release" + "Release results"
 * destructive actions (shared ConfirmDialogService).
 *
 * Fail-loud per `feedback_no_stubs_real_wiring`. No `any` (chora-web CLAUDE.md §2).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ChoraEmptyStateComponent } from '../../../../shared/components/chora-empty-state/chora-empty-state.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AssessmentMonitorService } from '../assessment-monitor/assessment-monitor.service';
import { submissionStateBadgeVariant } from '../assessment-monitor/assessment-monitor.model';
import type {
  Submission,
  SubmissionState,
} from '../assessment-monitor/assessment-monitor.model';
import { GradingReviewService } from './grading-review.service';
import { SubmissionGradingDetailComponent } from './submission-grading-detail.component';
import {
  isGradedState,
  isReleaseEnabledForQueue,
  isReviewGateApproved,
  reviewGateBadgeVariant,
  reviewGateLabelKey,
  reviewGateStateOf,
  type GradingQueueRow,
  type ReviewGateState,
} from './grading-review.model';

@Component({
  selector: 'chora-rplus-grading-queue',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    ChoraEmptyStateComponent,
    SubmissionGradingDetailComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grading-queue.component.html',
  styleUrl: './grading-queue.component.scss',
})
export class GradingQueueComponent {
  private readonly monitorService = inject(AssessmentMonitorService);
  private readonly gradingService = inject(GradingReviewService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  /**
   * Resolved assessment id from the route param. Guarded against literal
   * `{id}` placeholder strings (FE-BUG-RPLUS-ROUTE-PLACEHOLDER, 2026-05-16) —
   * a non-UUIDv4-like string yields an empty id and short-circuits the load,
   * preventing `%7Bid%7D` leaking into chora-delivery's pg uuid cast.
   */
  readonly assessmentId = (() => {
    const raw = this.route.snapshot.paramMap.get('assessmentId') ?? '';
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_RE.test(raw) ? raw : '';
  })();

  // ── List state (reuse the monitor service's submissions loader) ────
  readonly submissionsState = this.monitorService.submissionsState;
  readonly submissions = this.monitorService.submissions;

  // ── Bulk mutation state ────────────────────────────────────────────
  readonly approveAllState = this.gradingService.approveAllState;
  readonly releaseState = this.gradingService.releaseState;

  // ── Selected submission (opens the detail panel) ───────────────────
  private readonly _selectedSubmissionId = signal<string | null>(null);
  readonly selectedSubmissionId = this._selectedSubmissionId.asReadonly();

  // ── Derived view state ─────────────────────────────────────────────
  readonly isLoading = computed<boolean>(
    () => this.submissionsState().status === 'loading',
  );
  readonly isError = computed<boolean>(
    () => this.submissionsState().status === 'error',
  );
  readonly errorKey = computed<string>(() => {
    const s = this.submissionsState();
    return s.status === 'error' ? s.error : '';
  });

  /** Flatten submissions into grading-queue rows (display + gating only). */
  readonly rows = computed<readonly GradingQueueRow[]>(() =>
    this.submissions().map((s) => this.toRow(s)),
  );

  /**
   * Count of graded submissions that REQUIRE a human review (PENDING_REVIEW or
   * APPROVED). NOT_REQUIRED (MCQ-only auto-graded) rows are excluded — they have
   * no gate, so they must not inflate the "awaiting approval" denominator or the
   * bulk-CTA enablement (CHO-2343 bug #2).
   */
  readonly gradedCount = computed<number>(
    () =>
      this.rows().filter(
        (r) => isGradedState(r.state) && r.review_gate !== 'NOT_REQUIRED',
      ).length,
  );

  readonly approvedCount = computed<number>(
    () => this.rows().filter((r) => isReviewGateApproved(r.review_gate)).length,
  );

  readonly releaseEnabled = computed<boolean>(() => {
    if (this.releaseState().status === 'submitting') return false;
    if (this.approveAllState().status === 'submitting') return false;
    return isReleaseEnabledForQueue(this.rows());
  });

  readonly approveAllSubmitting = computed<boolean>(
    () => this.approveAllState().status === 'submitting',
  );

  readonly releaseSubmitting = computed<boolean>(
    () => this.releaseState().status === 'submitting',
  );

  readonly bulkErrorKey = computed<string>(() => {
    const a = this.approveAllState();
    if (a.status === 'error') return a.error;
    const r = this.releaseState();
    if (r.status === 'error') return r.error;
    return '';
  });

  constructor() {
    if (this.assessmentId) {
      this.monitorService.loadSubmissions(this.assessmentId);
    }

    // Refresh the list + toast after a bulk approve-all (and chained release).
    effect(() => {
      const s = this.approveAllState();
      if (s.status === 'success') {
        this.monitorService.loadSubmissions(this.assessmentId);
        this.toast.show(
          s.result.released
            ? 'rplus.grading_queue.toast_approved_released'
            : 'rplus.grading_queue.toast_approved_all',
          'success',
        );
        this.gradingService.clearBulkStates();
      }
    });

    // Refresh + toast after a standalone release.
    effect(() => {
      const s = this.releaseState();
      if (s.status === 'success') {
        this.monitorService.loadSubmissions(this.assessmentId);
        this.toast.show('rplus.grading_queue.toast_released', 'success');
        this.gradingService.clearBulkStates();
      }
    });
  }

  // ── Row interaction ────────────────────────────────────────────────

  reviewRow(submissionId: string): void {
    this._selectedSubmissionId.set(submissionId);
  }

  onDetailClosed(): void {
    this._selectedSubmissionId.set(null);
  }

  /** A per-candidate approve inside the panel — refresh the list gating. */
  onSubmissionApproved(): void {
    if (!this.assessmentId) return;
    // De-dupe re-entrant reloads: if a submissions load is already in flight,
    // skip — the in-flight GET already reflects the latest approvals once it
    // settles. Hardens against any emitter that fires mid-load (grading bug #1).
    if (this.submissionsState().status === 'loading') return;
    this.monitorService.loadSubmissions(this.assessmentId);
  }

  retry(): void {
    if (this.assessmentId) {
      this.monitorService.loadSubmissions(this.assessmentId);
    }
  }

  // ── Bulk CTAs ──────────────────────────────────────────────────────

  approveAll(): void {
    if (!this.assessmentId) return;
    this.gradingService.approveAll(this.assessmentId, { release: false });
  }

  async approveAndRelease(): Promise<void> {
    if (!this.assessmentId) return;
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.grading_queue.approve_release_confirm_title',
      message: 'rplus.grading_queue.approve_release_confirm_body',
      confirmText: 'rplus.grading_queue.approve_release_confirm_confirm',
      cancelText: 'rplus.grading_queue.confirm_cancel',
      variant: 'warning',
    });
    if (ok) {
      this.gradingService.approveAll(this.assessmentId, { release: true });
    }
  }

  async releaseResults(): Promise<void> {
    if (!this.assessmentId) return;
    if (!this.releaseEnabled()) return;
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.grading_queue.release_confirm_title',
      message: 'rplus.grading_queue.release_confirm_body',
      confirmText: 'rplus.grading_queue.release_confirm_confirm',
      cancelText: 'rplus.grading_queue.confirm_cancel',
      variant: 'warning',
    });
    if (ok) {
      this.gradingService.releaseResults(this.assessmentId);
    }
  }

  // ── View helpers ───────────────────────────────────────────────────

  reviewGateBadgeClass(gate: ReviewGateState): string {
    return reviewGateBadgeVariant(gate);
  }

  submissionBadgeClass(state: SubmissionState): string {
    return submissionStateBadgeVariant(state);
  }

  /** i18n key fragment for the per-row review-gate label (NotRequired-aware). */
  reviewGateLabelKey(gate: ReviewGateState): string {
    return reviewGateLabelKey(gate);
  }

  trackByRow(_i: number, r: GradingQueueRow): string {
    return r.submission_id;
  }

  isGraded(state: SubmissionState): boolean {
    return isGradedState(state);
  }

  // ── Internal ──────────────────────────────────────────────────────

  private toRow(s: Submission): GradingQueueRow {
    return {
      submission_id: s.submission_id,
      learner_gcid: s.learner_gcid,
      learner_display_name: s.learner_display_name,
      state: s.state,
      review_gate: reviewGateStateOf(this.rawReviewStatus(s)),
    };
  }

  /**
   * The Submission DTO carries `review_status` per the contract ("" |
   * PENDING_REVIEW | APPROVED). Read it defensively (without `any`) and let
   * reviewGateStateOf normalise it — "" → NOT_REQUIRED, everything else → its
   * gate — so an MCQ-only auto-graded row never renders as pending (CHO-2343).
   */
  private rawReviewStatus(s: Submission): unknown {
    return (s as { review_status?: unknown }).review_status;
  }
}
