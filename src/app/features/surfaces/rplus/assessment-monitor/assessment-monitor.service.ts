/**
 * AssessmentMonitorService — R+ Phase X.5 (ADR-155 D7 + D8 + D9).
 *
 * Sole provider for the instructor-facing R+ assessment monitor + list
 * surfaces. Calls the real BFF routes per
 * `chora-contracts/openapi/delivery-assessments.yaml` — no mock fallback
 * (no-stubs / no-debts directive 2026-05-14, memory `feedback_no_stubs_real_wiring`).
 *
 * Exposes per-call AsyncState discriminated signals so components render
 * fail-loud banners rather than hang on loading branches. Lifecycle CTAs
 * (publish / force-close / release-results / archive) each have their own
 * mutation-state signal — components observe the discriminated transition
 * (idle → submitting → success | error) for confirmation / retry UX.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  toQuestionReview,
  type AuthorQuestionRaw,
  type QuestionReview,
} from '../../../../shared/components/chora-question-review/chora-question-review.model';
import type {
  Assessment,
  AssessmentActionState,
  AssessmentListLoadState,
  AssessmentListResponse,
  AssessmentLoadState,
  AssessmentMonitor,
  MonitorLoadState,
  MonitorTestSet,
  MonitorTestSetLoadState,
  Submission,
  SubmissionListResponse,
  SubmissionsLoadState,
} from './assessment-monitor.model';

@Injectable({ providedIn: 'root' })
export class AssessmentMonitorService {
  private readonly bff = inject(BffClientService);

  // ── List state (GET /api/v1/assessments) ─────────────────────────────
  private readonly _listState = signal<AssessmentListLoadState>({
    status: 'loading',
  });
  readonly listState = this._listState.asReadonly();
  readonly assessments = computed<readonly Assessment[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.assessments : [];
  });

  // ── Single-assessment state (GET /api/v1/assessments/{id}) ───────────
  private readonly _assessmentState = signal<AssessmentLoadState>({
    status: 'loading',
  });
  readonly assessmentState = this._assessmentState.asReadonly();
  readonly assessment = computed<Assessment | null>(() => {
    const s = this._assessmentState();
    return s.status === 'success' ? s.assessment : null;
  });

  // ── Monitor envelope state (GET /api/v1/assessments/{id}/monitor) ────
  private readonly _monitorState = signal<MonitorLoadState>({
    status: 'loading',
  });
  readonly monitorState = this._monitorState.asReadonly();
  readonly monitor = computed<AssessmentMonitor | null>(() => {
    const s = this._monitorState();
    return s.status === 'success' ? s.monitor : null;
  });

  // ── Submissions list state (GET /api/v1/assessments/{id}/submissions)
  private readonly _submissionsState = signal<SubmissionsLoadState>({
    status: 'loading',
  });
  readonly submissionsState = this._submissionsState.asReadonly();
  readonly submissions = computed<readonly Submission[]>(() => {
    const s = this._submissionsState();
    return s.status === 'success' ? s.submissions : [];
  });

  // ── Test-set state (GET /api/v1/test-sets/{id}) — questions panel ────
  private readonly _testSetState = signal<MonitorTestSetLoadState>({
    status: 'idle',
  });
  readonly testSetState = this._testSetState.asReadonly();
  readonly testSet = computed<MonitorTestSet | null>(() => {
    const s = this._testSetState();
    return s.status === 'success' ? s.testSet : null;
  });

  // ── Lifecycle mutation states (one per CTA) ───────────────────────
  private readonly _publishState = signal<AssessmentActionState>({
    status: 'idle',
  });
  readonly publishState = this._publishState.asReadonly();

  private readonly _forceCloseState = signal<AssessmentActionState>({
    status: 'idle',
  });
  readonly forceCloseState = this._forceCloseState.asReadonly();

  private readonly _releaseState = signal<AssessmentActionState>({
    status: 'idle',
  });
  readonly releaseState = this._releaseState.asReadonly();

  private readonly _archiveState = signal<AssessmentActionState>({
    status: 'idle',
  });
  readonly archiveState = this._archiveState.asReadonly();

  // ── List loader ───────────────────────────────────────────────────

  /** Fetch the caller's assessments list. Idempotent — recallable for retry. */
  loadList(): void {
    this._listState.set({ status: 'loading' });
    this.bff
      .get<AssessmentListResponse>('/api/v1/assessments')
      .pipe(
        take(1),
        map(
          (body): AssessmentListLoadState => ({
            status: 'success',
            assessments: body.items,
          }),
        ),
        catchError((err: unknown) =>
          of<AssessmentListLoadState>({
            status: 'error',
            error: this.listErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._listState.set(s));
  }

  // ── Assessment-detail loader ──────────────────────────────────────

  /** Fetch a single assessment's metadata. Idempotent. */
  loadAssessment(assessmentId: string): void {
    this._assessmentState.set({ status: 'loading' });
    this.bff
      .get<Assessment>(
        '/api/v1/assessments/' + encodeURIComponent(assessmentId),
      )
      .pipe(
        take(1),
        map(
          (assessment): AssessmentLoadState => ({
            status: 'success',
            assessment,
          }),
        ),
        catchError((err: unknown) =>
          of<AssessmentLoadState>({
            status: 'error',
            error: this.monitorErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._assessmentState.set(s));
  }

  // ── Monitor envelope loader ──────────────────────────────────────

  /** Fetch the monitor envelope. Idempotent — pollable every 10-30s for OPEN state. */
  loadMonitor(assessmentId: string): void {
    this._monitorState.set({ status: 'loading' });
    this.bff
      .get<AssessmentMonitor>(
        '/api/v1/assessments/' + encodeURIComponent(assessmentId) + '/monitor',
      )
      .pipe(
        take(1),
        map(
          (monitor): MonitorLoadState => ({
            status: 'success',
            monitor,
          }),
        ),
        catchError((err: unknown) =>
          of<MonitorLoadState>({
            status: 'error',
            error: this.monitorErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._monitorState.set(s));
  }

  // ── Submissions list loader ──────────────────────────────────────

  /** Fetch the per-learner submissions for an assessment. Idempotent. */
  loadSubmissions(assessmentId: string): void {
    this._submissionsState.set({ status: 'loading' });
    this.bff
      .get<SubmissionListResponse>(
        '/api/v1/assessments/' +
          encodeURIComponent(assessmentId) +
          '/submissions',
      )
      .pipe(
        take(1),
        map(
          (body): SubmissionsLoadState => ({
            status: 'success',
            submissions: body.items,
          }),
        ),
        catchError((err: unknown) =>
          of<SubmissionsLoadState>({
            status: 'error',
            error: this.monitorErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._submissionsState.set(s));
  }

  // ── Test-set + per-question detail (questions panel) ─────────────

  /**
   * Fetch the assigned test-set so the monitor can list the assessment's
   * questions (the Assessment carries only `test_set_id` + counts). Fail-soft
   * for the panel — the rest of the monitor still renders if this 403/404s
   * (e.g. a non-author instructor without test-set read scope).
   */
  loadTestSet(testSetId: string): void {
    this._testSetState.set({ status: 'loading' });
    this.bff
      .get<MonitorTestSet>('/api/v1/test-sets/' + encodeURIComponent(testSetId))
      .pipe(
        take(1),
        map(
          (testSet): MonitorTestSetLoadState => ({
            status: 'success',
            testSet,
          }),
        ),
        catchError((err: unknown) =>
          of<MonitorTestSetLoadState>({
            status: 'error',
            error: this.monitorErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._testSetState.set(s));
  }

  /**
   * Fetch + normalise the AUTHOR question projection so the questions panel
   * can reveal the correct answer + per-option grounding (and OE model answer
   * / rubric). Shared parser with the A+ test-set editor. Instructor surface —
   * the answer key is in-scope here.
   */
  getQuestionDetail(
    atomId: string,
    questionId: string,
  ): Observable<QuestionReview> {
    return this.bff
      .get<AuthorQuestionRaw>(
        '/api/atoms/' +
          encodeURIComponent(atomId) +
          '/questions/' +
          encodeURIComponent(questionId),
      )
      .pipe(map((res) => toQuestionReview(res)));
  }

  // ── Lifecycle CTAs ───────────────────────────────────────────────

  /** DRAFT → SCHEDULED (publish). */
  publish(assessmentId: string): void {
    this.runAction(assessmentId, 'publish', this._publishState);
  }

  /** OPEN → CLOSED (force-close). */
  forceClose(assessmentId: string): void {
    this.runAction(assessmentId, 'force-close', this._forceCloseState);
  }

  /**
   * CLOSED → RELEASED — THE CRITICAL DEMO CTA.
   * Per ADR-155 D9 the flip is atomic across all submitted learners.
   */
  releaseResults(assessmentId: string): void {
    this.runAction(assessmentId, 'release-results', this._releaseState);
  }

  /** any → ARCHIVED. */
  archive(assessmentId: string): void {
    this.runAction(assessmentId, 'archive', this._archiveState);
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private runAction(
    assessmentId: string,
    action: 'publish' | 'force-close' | 'release-results' | 'archive',
    target: ReturnType<typeof signal<AssessmentActionState>>,
  ): void {
    target.set({ status: 'submitting' });
    this.bff
      .post<Assessment>(
        '/api/v1/assessments/' +
          encodeURIComponent(assessmentId) +
          '/' +
          action,
        {},
      )
      .pipe(
        take(1),
        map(
          (assessment): AssessmentActionState => ({
            status: 'success',
            assessment,
          }),
        ),
        catchError((err: unknown) =>
          of<AssessmentActionState>({
            status: 'error',
            error: this.actionErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => target.set(s));
  }

  private listErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status >= 500) return 'rplus.assessment_list.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'rplus.assessment_list.error_unauthorised';
      }
    }
    return 'rplus.assessment_list.error_generic';
  }

  private monitorErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'rplus.assessment_monitor.error_not_found';
      if (e.status >= 500) return 'rplus.assessment_monitor.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'rplus.assessment_monitor.error_unauthorised';
      }
    }
    return 'rplus.assessment_monitor.error_generic';
  }

  private actionErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 409) return 'rplus.assessment_monitor.error_conflict';
      if (e.status === 404) return 'rplus.assessment_monitor.error_not_found';
      if (e.status >= 500) return 'rplus.assessment_monitor.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'rplus.assessment_monitor.error_unauthorised';
      }
    }
    return 'rplus.assessment_monitor.error_generic';
  }
}
