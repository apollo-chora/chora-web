/**
 * MeAssessmentsService — A+ Learner Submission Flow (Phase X.3 / ADR-155).
 *
 * Sole HTTP surface for the learner-side `/me/assessments/*` ops in
 * `chora-contracts/openapi/delivery-assessments.yaml`. Real wiring only
 * — no stubs, no fixtures. All calls go through `BffClientService`.
 *
 * Per ADR-155 D8 the v1 demo path is MCQ-only for grading; OE rows in
 * the result envelope are marked `oe_batch_pending` when the LLM batched
 * grader hasn't filled in `criterion_scores`.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AutosaveRequest,
  AutosaveState,
  LearnerAssessmentDetail,
  LearnerAssessmentListResponse,
  LearnerAssessmentSummary,
  LearnerQuestionGrade,
  MeAssessmentDetailLoadState,
  MeAssessmentsListState,
  MySubmissionResultResponse,
  ResultState,
  StartSubmissionState,
  Submission,
  SubmissionLoadState,
  SubmissionResult,
  SubmissionStartedResponse,
  SubmissionSubmittedResponse,
  SubmitFinalState,
} from './me-assessments.model';

/** Options for `listAssessments()` (CR2-C2 pagination). */
interface ListAssessmentsOpts {
  pageSize?: number;
  pageToken?: string;
  /** When true, concatenates new items onto the existing list instead of replacing. */
  append?: boolean;
}

@Injectable({ providedIn: 'root' })
export class MeAssessmentsService {
  private readonly bff = inject(BffClientService);

  // ── List state (GET /api/v1/me/assessments) ──────────────────────────
  private readonly _listState = signal<MeAssessmentsListState>({
    status: 'loading',
  });
  readonly listState = this._listState.asReadonly();
  readonly items = computed<readonly LearnerAssessmentSummary[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.items : [];
  });

  // ── Detail state (GET /api/v1/me/assessments/{id}) ───────────────────
  private readonly _detailState = signal<MeAssessmentDetailLoadState>({
    status: 'loading',
  });
  readonly detailState = this._detailState.asReadonly();
  readonly detail = computed<LearnerAssessmentDetail | null>(() => {
    const s = this._detailState();
    return s.status === 'success' ? s.detail : null;
  });

  // ── Start state (POST .../submissions) ────────────────────────────
  private readonly _startState = signal<StartSubmissionState>({ status: 'idle' });
  readonly startState = this._startState.asReadonly();
  readonly started = computed<SubmissionStartedResponse | null>(() => {
    const s = this._startState();
    return s.status === 'started' ? s.started : null;
  });

  // ── Submission load (GET .../submissions/{subId}) ─────────────────
  private readonly _submissionState = signal<SubmissionLoadState>({
    status: 'idle',
  });
  readonly submissionState = this._submissionState.asReadonly();
  readonly submission = computed<Submission | null>(() => {
    const s = this._submissionState();
    return s.status === 'success' ? s.submission : null;
  });

  // ── Autosave (PATCH .../submissions/{subId}) ──────────────────────
  private readonly _autosaveState = signal<AutosaveState>({ status: 'idle' });
  readonly autosaveState = this._autosaveState.asReadonly();

  // ── Submit final (POST .../submissions/{subId}/submit) ────────────
  private readonly _submitFinalState = signal<SubmitFinalState>({
    status: 'idle',
  });
  readonly submitFinalState = this._submitFinalState.asReadonly();

  // ── Result state (GET .../submissions/{subId}/result) ─────────────
  private readonly _resultState = signal<ResultState>({ status: 'loading' });
  readonly resultState = this._resultState.asReadonly();

  // ── Path helpers ──────────────────────────────────────────────────

  private listPath(): string {
    return '/api/v1/me/assessments';
  }

  private detailPath(assessmentId: string): string {
    return '/api/v1/me/assessments/' + encodeURIComponent(assessmentId);
  }

  private submissionsPath(assessmentId: string): string {
    return this.detailPath(assessmentId) + '/submissions';
  }

  private submissionPath(assessmentId: string, submissionId: string): string {
    return (
      this.submissionsPath(assessmentId) +
      '/' +
      encodeURIComponent(submissionId)
    );
  }

  private submitPath(assessmentId: string, submissionId: string): string {
    return this.submissionPath(assessmentId, submissionId) + '/submit';
  }

  private resultPath(assessmentId: string, submissionId: string): string {
    return this.submissionPath(assessmentId, submissionId) + '/result';
  }

  // ── Operations ────────────────────────────────────────────────────

  listAssessments(opts: ListAssessmentsOpts = {}): void {
    if (!opts.append) {
      this._listState.set({ status: 'loading' });
    }

    let params = new HttpParams();
    if (opts.pageSize) {
      params = params.set('page_size', String(opts.pageSize));
    }
    if (opts.pageToken) {
      params = params.set('page_token', opts.pageToken);
    }

    const currentState = this._listState();
    const existingItems: readonly LearnerAssessmentSummary[] =
      opts.append && currentState.status === 'success' ? currentState.items : [];

    this.bff
      .get<LearnerAssessmentListResponse>(this.listPath(), params)
      .pipe(take(1))
      .subscribe({
        next: (resp) => {
          this._listState.set({
            status: 'success',
            items: [...existingItems, ...(resp.items ?? [])],
            nextPageToken: resp.next_page_token ?? null,
          });
        },
        error: (err: unknown) => {
          this._listState.set({
            status: 'error',
            error: this.listErrorKey(err),
          });
        },
      });
  }

  loadAssessment(assessmentId: string): void {
    this._detailState.set({ status: 'loading' });
    this.bff
      .get<LearnerAssessmentDetail>(this.detailPath(assessmentId))
      .pipe(
        take(1),
        map(
          (detail): MeAssessmentDetailLoadState => ({
            status: 'success',
            detail,
          }),
        ),
        catchError((err: unknown) =>
          of<MeAssessmentDetailLoadState>({
            status: 'error',
            error: this.detailErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._detailState.set(s));
  }

  startSubmission(assessmentId: string): void {
    this._startState.set({ status: 'starting' });
    this.bff
      .post<SubmissionStartedResponse>(this.submissionsPath(assessmentId), {})
      .pipe(
        take(1),
        map(
          (started): StartSubmissionState => ({
            status: 'started',
            started,
          }),
        ),
        catchError((err: unknown) =>
          of<StartSubmissionState>({
            status: 'error',
            error: this.startErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._startState.set(s));
  }

  loadSubmission(assessmentId: string, submissionId: string): void {
    this._submissionState.set({ status: 'loading' });
    this.bff
      .get<Submission>(this.submissionPath(assessmentId, submissionId))
      .pipe(
        take(1),
        map(
          (submission): SubmissionLoadState => ({
            status: 'success',
            submission,
          }),
        ),
        catchError((err: unknown) =>
          of<SubmissionLoadState>({
            status: 'error',
            error: this.submissionErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._submissionState.set(s));
  }

  autosave(
    assessmentId: string,
    submissionId: string,
    body: AutosaveRequest,
  ): void {
    this._autosaveState.set({ status: 'saving' });
    this.bff
      .patch<Submission>(
        this.submissionPath(assessmentId, submissionId),
        body,
      )
      .pipe(
        take(1),
        map(
          (sub): AutosaveState => ({
            status: 'saved',
            saved_at: sub.last_saved_at ?? new Date().toISOString(),
          }),
        ),
        catchError((err: unknown) =>
          of<AutosaveState>({
            status: 'error',
            error: this.autosaveErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._autosaveState.set(s));
  }

  submitFinal(assessmentId: string, submissionId: string): void {
    this._submitFinalState.set({ status: 'submitting' });
    this.bff
      .post<SubmissionSubmittedResponse>(
        this.submitPath(assessmentId, submissionId),
        {},
      )
      .pipe(
        take(1),
        map(
          (response): SubmitFinalState => ({
            status: 'submitted',
            response,
          }),
        ),
        catchError((err: unknown) =>
          of<SubmitFinalState>({
            status: 'error',
            error: this.submitFinalErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._submitFinalState.set(s));
  }

  loadResult(assessmentId: string, submissionId: string): void {
    this._resultState.set({ status: 'loading' });
    this.bff
      .get<MySubmissionResultResponse>(
        this.resultPath(assessmentId, submissionId),
      )
      .pipe(
        take(1),
        map((envelope): ResultState => this.mapResultEnvelope(envelope)),
        catchError((err: unknown) =>
          of<ResultState>({
            status: 'error',
            error: this.resultErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._resultState.set(s));
  }

  resetAutosaveIdle(): void {
    this._autosaveState.set({ status: 'idle' });
  }

  // ── Result envelope mapper ─────────────────────────────────────────

  private mapResultEnvelope(env: MySubmissionResultResponse): ResultState {
    if (env.state === 'PENDING_RELEASE') {
      return {
        status: 'pending',
        message:
          env.message ??
          'Your submission has been graded. Results will be released by your instructor.',
      };
    }
    if (env.state === 'RELEASED' && env.result) {
      return {
        status: 'released',
        result: this.flagOePendingRows(env.result),
      };
    }
    return {
      status: 'error',
      error: 'aplus.me_assessments.result.error_generic',
    };
  }

  private flagOePendingRows(result: SubmissionResult): SubmissionResult {
    const grades: readonly LearnerQuestionGrade[] = result.per_question_grades.map(
      (g) => {
        const isOe = g.question_type === 'oe';
        const isLlm = g.grading_dispatch === 'LLM_EVALUATOR';
        const hasScores = !!(
          g.oe_post_grade && (g.oe_post_grade.criterion_scores?.length ?? 0) > 0
        );
        const oe_batch_pending = isOe && isLlm && !hasScores;
        return oe_batch_pending ? { ...g, oe_batch_pending: true } : g;
      },
    );
    return { ...result, per_question_grades: grades };
  }

  // ── Error key mappers ─────────────────────────────────────────────

  private listErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401 || e.status === 403) {
        return 'aplus.me_assessments.list.error_unauthorised';
      }
      if (e.status >= 500) return 'aplus.me_assessments.list.error_upstream';
    }
    return 'aplus.me_assessments.list.error_generic';
  }

  private detailErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.me_assessments.detail.error_not_found';
      if (e.status === 403) return 'aplus.me_assessments.detail.error_forbidden';
      if (e.status === 401) return 'aplus.me_assessments.detail.error_unauthorised';
      if (e.status >= 500) return 'aplus.me_assessments.detail.error_upstream';
    }
    return 'aplus.me_assessments.detail.error_generic';
  }

  private startErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 403) return 'aplus.me_assessments.start.error_not_invited';
      if (e.status === 409) return 'aplus.me_assessments.start.error_conflict';
      if (e.status === 404) return 'aplus.me_assessments.start.error_not_found';
      if (e.status >= 500) return 'aplus.me_assessments.start.error_upstream';
    }
    return 'aplus.me_assessments.start.error_generic';
  }

  private submissionErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.me_assessments.submission.error_not_found';
      if (e.status >= 500) return 'aplus.me_assessments.submission.error_upstream';
    }
    return 'aplus.me_assessments.submission.error_generic';
  }

  private autosaveErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 409) {
        return 'aplus.me_assessments.autosave.error_window_closed';
      }
      if (e.status === 404) return 'aplus.me_assessments.autosave.error_not_found';
      if (e.status >= 500) return 'aplus.me_assessments.autosave.error_save_failed';
    }
    return 'aplus.me_assessments.autosave.error_save_failed';
  }

  private submitFinalErrorKey(err: unknown): string {
    const e = err as {
      status?: number;
      error?: { error?: { code?: string } } | unknown;
    };
    if (typeof e?.status === 'number') {
      if (e.status === 409) {
        const body = e.error as { error?: { code?: string } } | undefined;
        const code = body?.error?.code;
        if (code === 'DELIVERY_SUBMISSION_REQUIRED_QUESTIONS_UNANSWERED') {
          return 'aplus.me_assessments.submit.error_required_unanswered';
        }
        return 'aplus.me_assessments.submit.error_conflict';
      }
      if (e.status === 404) return 'aplus.me_assessments.submit.error_not_found';
      if (e.status >= 500) return 'aplus.me_assessments.submit.error_upstream';
    }
    return 'aplus.me_assessments.submit.error_generic';
  }

  private resultErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.me_assessments.result.error_not_found';
      if (e.status >= 500) return 'aplus.me_assessments.result.error_upstream';
    }
    return 'aplus.me_assessments.result.error_generic';
  }
}
