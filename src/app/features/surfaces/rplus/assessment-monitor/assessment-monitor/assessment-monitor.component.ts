/**
 * AssessmentMonitorComponent — R+ Phase X.5 — `/r/assessments/:id/monitor`.
 *
 * Single-page instructor monitor for an Assessment. Wires three BFF loads
 * on init via `AssessmentMonitorService` (assessment metadata + monitor
 * envelope + submissions list) and hosts the four lifecycle CTAs (publish
 * / force-close / release-results / archive). Per ADR-155 D9 the
 * release-results CTA is THE critical demo action — atomic visibility flip
 * across all submitted learners.
 *
 * UX rules per state (D7 FSM):
 *   - DRAFT → "Publish" CTA visible (DRAFT → SCHEDULED)
 *   - OPEN → "Force close" CTA visible (OPEN → CLOSED)
 *   - CLOSED → "Release results" CTA visible (CLOSED → RELEASED); disabled
 *     when monitor reports zero submitted (no-op guard)
 *   - RELEASED → success badge; CTAs hidden; submissions show score column
 *   - ARCHIVED → archive badge; ALL CTAs hidden / disabled
 *
 * Confirm dialog wraps the destructive Release Results + Archive actions
 * (the shared ConfirmDialogService at `shared/components/confirm-dialog/`
 * resolves a Promise<boolean>).
 *
 * Fail-loud per `feedback_no_stubs_real_wiring`.
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
import { take } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ChoraStatCardComponent } from '../../../../../shared/components/chora-stat-card/chora-stat-card.component';
import { ChoraEmptyStateComponent } from '../../../../../shared/components/chora-empty-state/chora-empty-state.component';
import { ChoraQuestionReviewComponent } from '../../../../../shared/components/chora-question-review/chora-question-review.component';
import type { QuestionReview } from '../../../../../shared/components/chora-question-review/chora-question-review.model';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import { AssessmentMonitorService } from '../assessment-monitor.service';
import {
  isReleaseEnabled,
  stateBadgeVariant,
  submissionStateBadgeVariant,
  type Assessment,
  type AssessmentMonitor,
  type MonitorTestSetQuestion,
  type Submission,
  type SubmissionState,
} from '../assessment-monitor.model';

@Component({
  selector: 'chora-rplus-assessment-monitor',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    ChoraStatCardComponent,
    ChoraEmptyStateComponent,
    ChoraQuestionReviewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assessment-monitor.component.html',
  styleUrl: './assessment-monitor.component.scss',
})
export class AssessmentMonitorComponent {
  private readonly monitorService = inject(AssessmentMonitorService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly translateService = inject(TranslateService);

  /**
   * Resolved assessment id from the route param.
   * Guarded against literal `{id}` placeholder strings observed in the
   * CJ#1 manual smoke 2026-05-16 (FE-BUG-RPLUS-ROUTE-PLACEHOLDER) —
   * source unconfirmed but defensive: a non-UUIDv4-like string here
   * yields empty assessmentId, and the constructor short-circuits
   * `fanOutLoad`. Prevents the literal `{id}` from URL-encoded leaking
   * into chora-delivery as `%7Bid%7D` and crashing the pg uuid cast.
   */
  readonly assessmentId = (() => {
    const raw = this.route.snapshot.paramMap.get('assessmentId') ?? '';
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_RE.test(raw) ? raw : '';
  })();

  // ── Service state signals ────────────────────────────────────────
  readonly assessmentState = this.monitorService.assessmentState;
  readonly monitorState = this.monitorService.monitorState;
  readonly submissionsState = this.monitorService.submissionsState;

  readonly publishState = this.monitorService.publishState;
  readonly forceCloseState = this.monitorService.forceCloseState;
  readonly releaseState = this.monitorService.releaseState;
  readonly archiveState = this.monitorService.archiveState;

  readonly assessment = this.monitorService.assessment;
  readonly monitor = this.monitorService.monitor;
  readonly submissions = this.monitorService.submissions;

  // ── Questions panel (assigned test-set + per-question answer key) ──
  readonly testSetState = this.monitorService.testSetState;
  readonly testSet = this.monitorService.testSet;
  readonly testSetQuestions = computed<readonly MonitorTestSetQuestion[]>(
    () => this.testSet()?.questions ?? [],
  );
  readonly testSetIsLoading = computed<boolean>(
    () => this.testSetState().status === 'loading',
  );
  readonly testSetIsError = computed<boolean>(
    () => this.testSetState().status === 'error',
  );

  /** Per-atom answer-key cache for the expandable question reveals. */
  private readonly _questionDetails = signal<
    Readonly<Record<string, QuestionReview>>
  >({});

  /** Dedupe guard so the test-set loads once per resolved test_set_id. */
  private loadedTestSetId: string | null = null;

  // ── Composite loading / error ────────────────────────────────────
  readonly isLoading = computed<boolean>(
    () =>
      this.assessmentState().status === 'loading' ||
      this.monitorState().status === 'loading' ||
      this.submissionsState().status === 'loading',
  );

  readonly isError = computed<boolean>(
    () =>
      this.assessmentState().status === 'error' ||
      this.monitorState().status === 'error' ||
      this.submissionsState().status === 'error',
  );

  readonly errorKey = computed<string>(() => {
    const a = this.assessmentState();
    if (a.status === 'error') return a.error;
    const m = this.monitorState();
    if (m.status === 'error') return m.error;
    const s = this.submissionsState();
    if (s.status === 'error') return s.error;
    return '';
  });

  // ── Derived state for CTA gating ─────────────────────────────────
  readonly currentState = computed<Assessment['state'] | null>(
    () => this.assessment()?.state ?? null,
  );

  readonly showPublishCta = computed<boolean>(
    () => this.currentState() === 'DRAFT',
  );

  readonly showForceCloseCta = computed<boolean>(
    () => this.currentState() === 'OPEN',
  );

  // 2026-05-16: BE accepts POST `/release-results` directly from OPEN
  // state (curl-smoked — see docs/m13/be-cj1-specifics-2026-05-16.md).
  // Loosen FE gate to match. Force-close is still useful for closing
  // the submission window without releasing; release-results includes
  // an implicit close (per `releaseAssessmentResults` outcome).
  readonly showReleaseCta = computed<boolean>(() => {
    const s = this.currentState();
    return s === 'OPEN' || s === 'CLOSED';
  });

  readonly showReleasedBadge = computed<boolean>(
    () => this.currentState() === 'RELEASED',
  );

  readonly showArchivedBadge = computed<boolean>(
    () => this.currentState() === 'ARCHIVED',
  );

  readonly showArchiveCta = computed<boolean>(
    () =>
      this.currentState() !== null && this.currentState() !== 'ARCHIVED',
  );

  /**
   * Any submission still awaiting OE instructor approval (ADR-172 HITL gate).
   * Releasing while one is PENDING_REVIEW silently releases ZERO of them (the
   * per-submission release SQL skips non-APPROVED rows), so it gates the CTA.
   */
  readonly hasPendingReview = computed<boolean>(() =>
    this.submissions().some((s) => s.review_status === 'PENDING_REVIEW'),
  );

  /** How many submissions are awaiting OE review — drives the grading-queue
   *  CTA emphasis + count badge (the obvious gated step to complete). */
  readonly pendingReviewCount = computed<number>(
    () =>
      this.submissions().filter((s) => s.review_status === 'PENDING_REVIEW')
        .length,
  );

  /**
   * Graded submissions NOT yet released to learners while the assessment
   * lifecycle is already RELEASED (e.g. OE awaiting approval) — drives the
   * results-release disambiguation indicator next to the RELEASED badge.
   */
  readonly unreleasedGradedCount = computed<number>(() => {
    const m = this.monitor();
    if (!m || this.currentState() !== 'RELEASED') return 0;
    return Math.max(0, m.total_graded - m.total_released);
  });

  readonly releaseEnabled = computed<boolean>(() => {
    if (this.releaseState().status === 'submitting') return false;
    // Gate on review like the grading queue — don't let a release silently
    // skip a graded-but-unapproved OE submission.
    if (this.hasPendingReview()) return false;
    return isReleaseEnabled(this.monitor());
  });

  readonly publishSubmitting = computed<boolean>(
    () => this.publishState().status === 'submitting',
  );

  readonly forceCloseSubmitting = computed<boolean>(
    () => this.forceCloseState().status === 'submitting',
  );

  readonly archiveSubmitting = computed<boolean>(
    () => this.archiveState().status === 'submitting',
  );

  readonly releaseSubmitting = computed<boolean>(
    () => this.releaseState().status === 'submitting',
  );

  readonly releaseErrorKey = computed<string>(() => {
    const s = this.releaseState();
    return s.status === 'error' ? s.error : '';
  });

  // ── Cohort progress helpers ──────────────────────────────────────
  /** Abandoned = invited - started; floored at 0 to defend against drift. */
  readonly abandonedCount = computed<number>(() => {
    const m = this.monitor();
    if (!m) return 0;
    return Math.max(0, m.total_invited - m.total_started);
  });

  /**
   * Whether per-submission + cohort scores are pending-release.
   * P1 design refinement (CJ#1 smoke #4, 2026-05-17): BE doesn't backfill
   * score_percent / average_score_percent until the assessment reaches
   * RELEASED. Pre-RELEASED, rendering "0%" is misleading UX — instead, the
   * stat-card shows state="pending" (em-dash placeholder) and the
   * submissions table shows a "Pending release" chip.
   */
  readonly scoreIsPending = computed<boolean>(() => {
    const s = this.currentState();
    if (s === null) return true;
    return s !== 'RELEASED';
  });

  /** Stat-card `state` input binding for the Average score card. */
  readonly averageScoreCardState = computed<'value' | 'pending'>(() =>
    this.scoreIsPending() ? 'pending' : 'value',
  );

  constructor() {
    // Initial fan-out
    if (this.assessmentId) {
      this.fanOutLoad();
    }

    // Effect: when releaseState flips to success, refresh + toast.
    effect(() => {
      const s = this.releaseState();
      if (s.status === 'success') {
        this.fanOutLoad();
        this.toast.show('rplus.assessment_monitor.toast_released', 'success');
      }
    });

    // Effect: once the assessment resolves its test_set_id, load the assigned
    // test-set so the questions panel can list the questions. Guarded so it
    // fires once per test_set_id (assessment refreshes on CTA success).
    effect(() => {
      const a = this.assessment();
      const tsid = a?.test_set_id;
      if (tsid && this.loadedTestSetId !== tsid) {
        this.loadedTestSetId = tsid;
        this.monitorService.loadTestSet(tsid);
      }
    });

    // Effect: hydrate each question's answer key for the expandable reveal.
    effect(() => {
      const questions = this.testSetQuestions();
      const cache = this._questionDetails();
      for (const q of questions) {
        if (!q.question_id) continue;
        if (cache[q.question_atom_id]) continue;
        this.monitorService
          .getQuestionDetail(q.question_atom_id, q.question_id)
          .pipe(take(1))
          .subscribe({
            next: (review) =>
              this._questionDetails.set({
                ...this._questionDetails(),
                [q.question_atom_id]: review,
              }),
            error: () => {
              // Fail-soft — the question still lists; the reveal stays empty.
            },
          });
      }
    });

    // Effect: when publish / forceClose / archive succeed, refresh.
    effect(() => {
      const s = this.publishState();
      if (s.status === 'success') {
        this.fanOutLoad();
      }
    });
    effect(() => {
      const s = this.forceCloseState();
      if (s.status === 'success') {
        this.fanOutLoad();
      }
    });
    effect(() => {
      const s = this.archiveState();
      if (s.status === 'success') {
        this.fanOutLoad();
      }
    });
  }

  retry(): void {
    this.fanOutLoad();
  }

  publish(): void {
    if (!this.assessmentId) return;
    this.monitorService.publish(this.assessmentId);
  }

  forceClose(): void {
    if (!this.assessmentId) return;
    this.monitorService.forceClose(this.assessmentId);
  }

  /** THE critical demo CTA — flips the per-submission visibility atomically. */
  async openReleaseConfirm(): Promise<void> {
    if (!this.assessmentId) return;
    if (!this.releaseEnabled()) return;
    const m = this.monitor();
    const submittedCount = m?.total_submitted ?? 0;
    // Resolve the ICU plural template for `body` against `submittedCount`.
    // The in-house TranslateService is a flat lookup with no params support,
    // so we resolve singular/plural + interpolate `{count}` here at the call
    // site and pass the final sentence to the dialog. The dialog template
    // pipes `message` through `translate` which falls back to the literal
    // string when no key matches (identity).
    const bodyTemplate = this.translateService.instant(
      'rplus.release_confirm.body',
    );
    const message = this.resolveIcuPlural(bodyTemplate, submittedCount);
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.release_confirm.title',
      message,
      confirmText: 'rplus.release_confirm.confirm',
      cancelText: 'rplus.release_confirm.cancel',
      variant: 'warning',
    });
    if (ok) {
      this.monitorService.releaseResults(this.assessmentId);
    }
  }

  /**
   * Minimal ICU plural resolver for `{count, plural, =N {…} other {…}}`.
   * Picks the matching branch for `count`, then substitutes `{count}` in
   * the branch body. Falls back to `template|count` when not ICU-shaped
   * AND the template lacks any `{count}` placeholder — this preserves the
   * count for transparency even when translations have not been loaded
   * (e.g., unit tests, fallback locale).
   */
  private resolveIcuPlural(template: string, count: number): string {
    const icu = template.match(
      /^\{count,\s*plural,\s*(.*)\}$/s,
    );
    if (!icu) {
      // Non-ICU template — substitute {count} if present, else append for
      // transparency (covers the case where translations are not loaded).
      if (template.includes('{count}')) {
        return template.replace(/\{count\}/g, String(count));
      }
      return `${template}|${count}`;
    }
    const body = icu[1];
    // Match each `=N {…}` and `other {…}` branch.
    const branches: { selector: string; text: string }[] = [];
    const branchRe = /(=\d+|other)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
    let bm: RegExpExecArray | null;
    while ((bm = branchRe.exec(body)) !== null) {
      branches.push({ selector: bm[1], text: bm[2] });
    }
    const exact = branches.find((b) => b.selector === `=${count}`);
    const other = branches.find((b) => b.selector === 'other');
    const chosen = exact?.text ?? other?.text ?? template;
    return chosen.replace(/\{count\}/g, String(count));
  }

  async openArchiveConfirm(): Promise<void> {
    if (!this.assessmentId) return;
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.archive_confirm.title',
      message: 'rplus.archive_confirm.body',
      confirmText: 'rplus.archive_confirm.confirm',
      cancelText: 'rplus.archive_confirm.cancel',
      variant: 'danger',
    });
    if (ok) {
      this.monitorService.archive(this.assessmentId);
    }
  }

  // ── View helpers ─────────────────────────────────────────────────

  badgeClass(state: Assessment['state']): string {
    return stateBadgeVariant(state);
  }

  submissionBadgeClass(state: SubmissionState): string {
    return submissionStateBadgeVariant(state);
  }

  trackBySubmissionId(_i: number, s: Submission): string {
    return s.submission_id;
  }

  /**
   * Format the score column post-RELEASED only.
   *
   * Pre-RELEASED (OPEN/CLOSED/GRADING/GRADED): the template renders a
   * "Pending release" chip — `formatScore` is NOT called.
   *
   * Post-RELEASED: returns the BE-supplied percent. Defaults to "0%" if
   * the BE forgot to backfill (defensive — should not happen per ADR-155).
   */
  formatScore(s: Submission): string {
    if (s.score_percent === null || s.score_percent === undefined) {
      return '0%';
    }
    return `${s.score_percent}%`;
  }

  /**
   * Per-submission score-cell decision (NOT the assessment-level
   * `scoreIsPending`). The assessment can be RELEASED while an individual
   * OE submission is still GRADED + PENDING_REVIEW (ADR-172 HITL gate) — its
   * score is withheld, so rendering the assessment-wide "released" path gives
   * a misleading "0%". Decide off the ROW's own state + review status:
   *   - `score`           → this submission is RELEASED (show formatScore)
   *   - `pending_review`  → graded but awaiting instructor approval
   *   - `pending_release` → submitted/graded, approved-or-not, not yet released
   */
  scoreCellKind(s: Submission): 'score' | 'pending_review' | 'pending_release' {
    if (s.state === 'RELEASED') return 'score';
    if (s.review_status === 'PENDING_REVIEW') return 'pending_review';
    return 'pending_release';
  }

  /**
   * Translated "Pending release" label for the submissions-table chip
   * (pre-RELEASED only). Returns the key itself if the translation is
   * missing — fail-loud per `feedback_no_stubs_real_wiring`.
   */
  pendingReleaseLabel(): string {
    return this.translateService.instant(
      'rplus.assessment_monitor.score_pending_release',
    );
  }

  /** Optional cohort progress getter — typed as helper, not signal. */
  cohort(): AssessmentMonitor | null {
    return this.monitor();
  }

  // ── Questions panel helpers ──────────────────────────────────────

  trackByQuestion(_i: number, q: MonitorTestSetQuestion): string {
    return q.test_set_question_id;
  }

  /** Resolved question type label (snapshot wins, falls back to row field). */
  questionType(q: MonitorTestSetQuestion): string {
    return q.snapshot?.question_type ?? q.question_type ?? 'mcq';
  }

  /**
   * Best available stem text for the listing summary. Prefers the publish-time
   * snapshot; falls back to the prompt from the hydrated answer-key projection
   * (test-sets built before snapshots were captured have no prompt_preview).
   */
  questionStem(q: MonitorTestSetQuestion): string {
    return (
      q.snapshot?.prompt_preview?.trim() ||
      q.snapshot?.atom_title?.trim() ||
      this.questionReviewFor(q)?.prompt?.trim() ||
      ''
    );
  }

  /** Answer-key reveal for a question row, or null until hydrated. */
  questionReviewFor(q: MonitorTestSetQuestion): QuestionReview | null {
    return this._questionDetails()[q.question_atom_id] ?? null;
  }

  // ── Private ──────────────────────────────────────────────────────
  private fanOutLoad(): void {
    if (!this.assessmentId) return;
    this.monitorService.loadAssessment(this.assessmentId);
    this.monitorService.loadMonitor(this.assessmentId);
    this.monitorService.loadSubmissions(this.assessmentId);
  }
}
