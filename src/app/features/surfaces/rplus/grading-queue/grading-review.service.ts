/**
 * GradingReviewService — R+ instructor grading queue (ADR-172 HITL grading).
 *
 * Sole provider for the instructor-facing R+ grading-review surfaces. Calls
 * the real BFF routes per `chora-contracts/openapi/delivery-assessments.yaml`
 * (the gateway forwards verbatim to chora-delivery) — no mock fallback
 * (no-stubs / no-debts directive 2026-05-14, memory `feedback_no_stubs_real_wiring`).
 *
 * Exposes per-call AsyncState discriminated signals so components render
 * fail-loud banners rather than hang on loading branches. Each mutation
 * (edit-grades / edit-overall-comment / approve / approve-all / release)
 * has its own discriminated state signal — components observe the transition
 * (idle → submitting → success | error) for confirmation / retry UX.
 *
 * Injection + http pattern mirror AssessmentMonitorService exactly
 * (BffClientService + take(1)/map/catchError/subscribe-to-signal).
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  ApproveAllRequest,
  ApproveAllResponse,
  ApproveAllState,
  ApproveSubmissionState,
  EditGradesRequest,
  EditOverallCommentRequest,
  GradingDetailLoadState,
  GradingMutationState,
  GradingReviewDetail,
  ReleaseResultsState,
} from './grading-review.model';

@Injectable({ providedIn: 'root' })
export class GradingReviewService {
  private readonly bff = inject(BffClientService);

  // ── Grading-detail load state (GET .../grading) ────────────────────
  private readonly _detailState = signal<GradingDetailLoadState>({
    status: 'idle',
  });
  readonly detailState = this._detailState.asReadonly();
  readonly detail = computed<GradingReviewDetail | null>(() => {
    const s = this._detailState();
    return s.status === 'success' ? s.detail : null;
  });

  // ── Mutation states (one per CTA) ──────────────────────────────────
  private readonly _editGradesState = signal<GradingMutationState>({
    status: 'idle',
  });
  readonly editGradesState = this._editGradesState.asReadonly();

  private readonly _editOverallCommentState = signal<GradingMutationState>({
    status: 'idle',
  });
  readonly editOverallCommentState = this._editOverallCommentState.asReadonly();

  private readonly _approveState = signal<ApproveSubmissionState>({
    status: 'idle',
  });
  readonly approveState = this._approveState.asReadonly();

  private readonly _approveAllState = signal<ApproveAllState>({
    status: 'idle',
  });
  readonly approveAllState = this._approveAllState.asReadonly();

  private readonly _releaseState = signal<ReleaseResultsState>({
    status: 'idle',
  });
  readonly releaseState = this._releaseState.asReadonly();

  // ── Grading-detail loader ──────────────────────────────────────────

  /**
   * Fetch one submission's full grading-review detail. Idempotent —
   * recallable for retry + post-mutation refresh.
   */
  loadGradingDetail(assessmentId: string, submissionId: string): void {
    this._detailState.set({ status: 'loading' });
    this.bff
      .get<GradingReviewDetail>(this.gradingPath(assessmentId, submissionId))
      .pipe(
        take(1),
        map(
          (detail): GradingDetailLoadState => ({
            status: 'success',
            detail,
          }),
        ),
        catchError((err: unknown) =>
          of<GradingDetailLoadState>({
            status: 'error',
            error: this.detailErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._detailState.set(s));
  }

  /** Reset the detail panel state (on close). */
  clearDetail(): void {
    this._detailState.set({ status: 'idle' });
    this._editGradesState.set({ status: 'idle' });
    this._editOverallCommentState.set({ status: 'idle' });
    this._approveState.set({ status: 'idle' });
  }

  /**
   * Reset ONLY the per-candidate approve CTA latch, after the drawer has
   * consumed the `success` (one toast + one `(approved)` emit). Mirrors the
   * bulk path's clearBulkStates(). Deliberately leaves `_detailState` intact so
   * the post-approve detail refresh (APPROVED badge) still renders — unlike
   * clearDetail(). Without this reset the shared singleton `_approveState` stays
   * `success` while the drawer is open, so the child's approve effect re-fires on
   * every change-detection flush → toast/emit storm → /submissions+/grading flood
   * → Cloud Armor rate-limit. See grading bug #1 (2026-06-03).
   */
  clearApproveState(): void {
    this._approveState.set({ status: 'idle' });
  }

  // ── Per-question grade edits (PATCH .../grades) ────────────────────

  /**
   * Apply per-question OE overrides. On success the response is the refreshed
   * GradingReviewDetail (provenance flipped AI→HUMAN for edited artifacts) —
   * pushed into BOTH the mutation signal and the canonical detail signal so
   * the panel re-renders with flipped badges without a second GET.
   */
  editGrades(
    assessmentId: string,
    submissionId: string,
    body: EditGradesRequest,
  ): void {
    this._editGradesState.set({ status: 'submitting' });
    this.bff
      .patch<GradingReviewDetail>(
        this.gradesPath(assessmentId, submissionId),
        body,
      )
      .pipe(
        take(1),
        map(
          (detail): GradingMutationState => ({
            status: 'success',
            detail,
          }),
        ),
        catchError((err: unknown) =>
          of<GradingMutationState>({
            status: 'error',
            error: this.mutationErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => {
        this._editGradesState.set(s);
        if (s.status === 'success') {
          this._detailState.set({ status: 'success', detail: s.detail });
        }
      });
  }

  // ── Overall-comment edit (PATCH .../overall-comment) ───────────────

  /** Override the whole-assessment overall comment. Provenance flips AI→HUMAN. */
  editOverallComment(
    assessmentId: string,
    submissionId: string,
    body: EditOverallCommentRequest,
  ): void {
    this._editOverallCommentState.set({ status: 'submitting' });
    this.bff
      .patch<GradingReviewDetail>(
        this.overallCommentPath(assessmentId, submissionId),
        body,
      )
      .pipe(
        take(1),
        map(
          (detail): GradingMutationState => ({
            status: 'success',
            detail,
          }),
        ),
        catchError((err: unknown) =>
          of<GradingMutationState>({
            status: 'error',
            error: this.mutationErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => {
        this._editOverallCommentState.set(s);
        if (s.status === 'success') {
          this._detailState.set({ status: 'success', detail: s.detail });
        }
      });
  }

  // ── Per-candidate approve (POST .../approve) ───────────────────────

  /**
   * Approve one submission's grading (review_status → APPROVED). Idempotent on
   * an already-APPROVED submission. Returns the Submission echo; we refresh the
   * detail afterward so the panel reflects the new review_status.
   */
  approveSubmission(assessmentId: string, submissionId: string): void {
    this._approveState.set({ status: 'submitting' });
    this.bff
      .post<{ review_status?: unknown }>(
        this.approvePath(assessmentId, submissionId),
        {},
      )
      .pipe(
        take(1),
        map(
          (res): ApproveSubmissionState => ({
            status: 'success',
            // Echo the resulting gate so the panel can tell a real approval
            // (→ APPROVED) from a BE no-op (MCQ-only / already-RELEASED returns
            // review_status unchanged "") and not toast a false success
            // (CHO-2343 bug #2).
            reviewStatus:
              res.review_status === 'APPROVED'
                ? 'APPROVED'
                : res.review_status === 'PENDING_REVIEW'
                  ? 'PENDING_REVIEW'
                  : '',
          }),
        ),
        catchError((err: unknown) =>
          of<ApproveSubmissionState>({
            status: 'error',
            error: this.mutationErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => {
        this._approveState.set(s);
        if (s.status === 'success') {
          this.loadGradingDetail(assessmentId, submissionId);
        }
      });
  }

  // ── Assessment-wide approve-all (POST .../approve-all) ─────────────

  /**
   * Bulk-approve every GRADED submission. When `release: true`, the BE chains
   * directly to release-results (combined approve-and-release).
   */
  approveAll(assessmentId: string, body: ApproveAllRequest = {}): void {
    this._approveAllState.set({ status: 'submitting' });
    this.bff
      .post<ApproveAllResponse>(this.approveAllPath(assessmentId), body)
      .pipe(
        take(1),
        map(
          (result): ApproveAllState => ({
            status: 'success',
            result,
          }),
        ),
        catchError((err: unknown) =>
          of<ApproveAllState>({
            status: 'error',
            error: this.mutationErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._approveAllState.set(s));
  }

  // ── Release results (POST .../release-results) ─────────────────────

  /**
   * Release results to all invited learners. Gate (ADR-172): the caller must
   * confirm every graded submission is APPROVED before invoking — the BE
   * rejects with 409 otherwise (surfaced via the release error key).
   */
  releaseResults(assessmentId: string): void {
    this._releaseState.set({ status: 'submitting' });
    this.bff
      .post<unknown>(this.releasePath(assessmentId), {})
      .pipe(
        take(1),
        map((): ReleaseResultsState => ({ status: 'success' })),
        catchError((err: unknown) =>
          of<ReleaseResultsState>({
            status: 'error',
            error: this.mutationErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._releaseState.set(s));
  }

  /** Reset the approve-all + release CTA states (post-toast acknowledgement). */
  clearBulkStates(): void {
    this._approveAllState.set({ status: 'idle' });
    this._releaseState.set({ status: 'idle' });
  }

  // ── Path builders ──────────────────────────────────────────────────

  private subBase(assessmentId: string, submissionId: string): string {
    return (
      '/api/v1/assessments/' +
      encodeURIComponent(assessmentId) +
      '/submissions/' +
      encodeURIComponent(submissionId)
    );
  }

  private gradingPath(assessmentId: string, submissionId: string): string {
    return this.subBase(assessmentId, submissionId) + '/grading';
  }

  private gradesPath(assessmentId: string, submissionId: string): string {
    return this.subBase(assessmentId, submissionId) + '/grades';
  }

  private overallCommentPath(
    assessmentId: string,
    submissionId: string,
  ): string {
    return this.subBase(assessmentId, submissionId) + '/overall-comment';
  }

  private approvePath(assessmentId: string, submissionId: string): string {
    return this.subBase(assessmentId, submissionId) + '/approve';
  }

  private approveAllPath(assessmentId: string): string {
    return (
      '/api/v1/assessments/' +
      encodeURIComponent(assessmentId) +
      '/approve-all'
    );
  }

  private releasePath(assessmentId: string): string {
    return (
      '/api/v1/assessments/' +
      encodeURIComponent(assessmentId) +
      '/release-results'
    );
  }

  // ── Error-key mappers (i18n keys under rplus.grading_queue.*) ──────

  private detailErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'rplus.grading_queue.error_not_found';
      if (e.status >= 500) return 'rplus.grading_queue.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'rplus.grading_queue.error_unauthorised';
      }
    }
    return 'rplus.grading_queue.error_generic';
  }

  private mutationErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 409) return 'rplus.grading_queue.error_conflict';
      if (e.status === 404) return 'rplus.grading_queue.error_not_found';
      if (e.status >= 500) return 'rplus.grading_queue.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'rplus.grading_queue.error_unauthorised';
      }
    }
    return 'rplus.grading_queue.error_generic';
  }
}
