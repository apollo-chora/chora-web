/**
 * ExamWorkspaceComponent — the R+ drill-down for one exam (W4 Exam BC).
 *
 * Reached from the exams list (/r/exams → row → /r/exams/:id). Mirrors the
 * offering-workspace architecture (object-derived tabs, no toggle per ADR-141)
 * but for the SEPARATE exam bounded context: its tab set is derived from the
 * VIEWER's role, not a delivery_type (see exam-workspace.tabs.ts).
 *
 * This slice wires Overview + Form/items + Candidates. Candidates carries the
 * allocate → verify → admit flow now unblocked by the durable Identity KYC
 * repo (CHO-2100): admit resolves the live VERIFIED claim (200) or refuses (403).
 */
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import { RbacService } from '../../../../core/services/rbac.service';
import { ExamsService } from './exams.service';
import {
  examWorkspaceTabs,
  type ExamTab,
  type ExamTabId,
} from './exam-workspace.tabs';
import type {
  ExamCandidate,
  ExamDetail,
  ExamForm,
  ExamIncident,
  ExamInvigilator,
  ExamResultRecord,
  ExamSittingRow,
  IncidentKind,
  InvigilatorRank,
  SittingActionKind,
} from './exams.model';
import {
  INCIDENT_KINDS,
  INVIGILATOR_RANKS,
  sittingActionsFor,
} from './exams.model';

/** Exam-admin roles — mirrors chora-delivery `hasExamAdminRole`. */
const EXAM_ADMIN_ROLES = [
  'instructor',
  'admin',
  'training_admin',
  'tenant_admin',
  'owner',
  'PLATFORM_OPERATOR',
] as const;

/** Generic discriminated load state for a panel's data. */
type LoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly errorKey: string; readonly notFound: boolean };

/**
 * Per-row KYC-review outcome shown under a candidate's actions. A translated
 * `key` for the success ('verified'/'rejected') and benign ('nothing pending')
 * cases; a `raw` BE message (tone 'error', role="alert") for a genuine failure.
 */
type KycNotice =
  | { readonly gcid: string; readonly kind: 'key'; readonly messageKey: string; readonly tone: 'ok' | 'info' }
  | { readonly gcid: string; readonly kind: 'raw'; readonly message: string; readonly tone: 'error' };

@Component({
  selector: 'chora-rplus-exam-workspace',
  standalone: true,
  imports: [RouterLink, DatePipe, TranslatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exam-workspace.component.html',
  styleUrl: './exam-workspace.component.scss',
})
export class ExamWorkspaceComponent {
  private readonly service = inject(ExamsService);
  private readonly rbac = inject(RbacService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** `:id` path param — the examID (withComponentInputBinding). */
  readonly id = input.required<string>();
  /** `?tab=` query param — normalised against the derived set. */
  readonly tab = input<string | undefined>(undefined);

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  // ── Exam detail (header + overview) ────────────────────────────────────
  private readonly examStateSignal = signal<LoadState<ExamDetail>>({ status: 'loading' });
  readonly examState = computed(() => this.examStateSignal());
  readonly exam = computed<ExamDetail | null>(() => {
    const s = this.examStateSignal();
    return s.status === 'success' ? s.data : null;
  });
  readonly isLoading = computed(() => this.examStateSignal().status === 'loading');
  readonly isError = computed(() => this.examStateSignal().status === 'error');
  readonly isNotFound = computed(() => {
    const s = this.examStateSignal();
    return s.status === 'error' && s.notFound;
  });

  // ── Viewer role → object-derived tab shell ─────────────────────────────
  readonly isExamAdmin = computed(() =>
    EXAM_ADMIN_ROLES.some((r) => this.rbac.hasRole(r)),
  );
  readonly isProctor = computed(
    () => this.rbac.hasRole('PROCTOR') || this.rbac.hasCapability('exam:sitting_check_in'),
  );
  readonly tabList = computed<readonly ExamTab[]>(() =>
    examWorkspaceTabs({ isExamAdmin: this.isExamAdmin(), isProctor: this.isProctor() }),
  );
  /** `true` when the viewer has NO exam role at all — renders unauthorized. */
  readonly isUnauthorized = computed(() => this.tabList().length === 0);
  readonly activeTabId = computed<ExamTabId | null>(() => {
    const tabs = this.tabList();
    const param = this.tab();
    return tabs.find((t) => t.id === param)?.id ?? tabs[0]?.id ?? null;
  });
  readonly activeTab = computed<ExamTab | null>(
    () => this.tabList().find((t) => t.id === this.activeTabId()) ?? null,
  );
  readonly isOverviewActive = computed(() => this.activeTabId() === 'overview');
  readonly isFormActive = computed(() => this.activeTabId() === 'form');
  readonly isCandidatesActive = computed(() => this.activeTabId() === 'candidates');
  readonly isProctorsActive = computed(() => this.activeTabId() === 'proctors');
  readonly isIncidentsActive = computed(() => this.activeTabId() === 'incidents');
  readonly isResultsActive = computed(() => this.activeTabId() === 'results');
  /** Sittings power BOTH Proctors + Incidents (invigilators/incidents nest under a sitting). */
  private readonly needsSittings = computed(() => this.isProctorsActive() || this.isIncidentsActive());

  // ── Candidates panel ───────────────────────────────────────────────────
  private readonly candidatesStateSignal = signal<LoadState<readonly ExamCandidate[]>>({ status: 'loading' });
  private readonly candidatesLoadedForId = signal<string | null>(null);
  readonly candidatesState = computed(() => this.candidatesStateSignal());
  readonly candidates = computed<readonly ExamCandidate[]>(() => {
    const s = this.candidatesStateSignal();
    return s.status === 'success' ? s.data : [];
  });
  /** Real allocated-candidate count for the Overview (not exam.enrolledCount). */
  readonly candidateCount = computed<number>(() => this.candidates().length);
  readonly newCandidateGcid = signal<string>('');
  private readonly allocatingSignal = signal<boolean>(false);
  readonly isAllocating = computed(() => this.allocatingSignal());
  private readonly allocateErrorSignal = signal<string>('');
  readonly allocateError = computed(() => this.allocateErrorSignal());
  /** GCID whose per-row verify/admit is in flight (busy + re-entrancy guard). */
  private readonly actingGcidSignal = signal<string | null>(null);
  readonly actingGcid = computed(() => this.actingGcidSignal());
  private readonly rowErrorSignal = signal<{ gcid: string; message: string } | null>(null);
  readonly rowError = computed(() => this.rowErrorSignal());

  // ── Admin KYC review (manual-doc prerequisite — CHO-2103) ──────────────
  /** GCID whose KYC verify/reject is in flight (separate busy guard from actingGcid). */
  private readonly kycActingGcidSignal = signal<string | null>(null);
  readonly kycActingGcid = computed(() => this.kycActingGcidSignal());
  /** GCID whose inline reject form is expanded (null = none open). */
  readonly kycRejectingGcid = signal<string | null>(null);
  /** Reject-form fields (only one row's form is open at a time). */
  readonly kycRejectCode = signal<string>('');
  readonly kycRejectNotes = signal<string>('');
  readonly kycRejectRetry = signal<boolean>(true);
  /** Per-row KYC notice (success / benign nothing-pending / raw failure). */
  private readonly kycNoticeSignal = signal<KycNotice | null>(null);
  readonly kycNotice = computed(() => this.kycNoticeSignal());

  // ── Form panel ─────────────────────────────────────────────────────────
  private readonly formsStateSignal = signal<LoadState<readonly ExamForm[]>>({ status: 'loading' });
  private readonly formsLoadedForId = signal<string | null>(null);
  readonly formsState = computed(() => this.formsStateSignal());
  readonly forms = computed<readonly ExamForm[]>(() => {
    const s = this.formsStateSignal();
    return s.status === 'success' ? s.data : [];
  });

  // ── Sittings + Invigilators (Proctors tab) ─────────────────────────────
  private readonly sittingsStateSignal = signal<LoadState<readonly ExamSittingRow[]>>({ status: 'loading' });
  private readonly sittingsLoadedForId = signal<string | null>(null);
  readonly sittingsState = computed(() => this.sittingsStateSignal());
  readonly sittings = computed<readonly ExamSittingRow[]>(() => {
    const s = this.sittingsStateSignal();
    return s.status === 'success' ? s.data : [];
  });
  /** The sitting selected for its invigilators (Proctors) / incidents (Incidents). */
  readonly selectedSittingId = signal<string>('');
  readonly actionsFor = sittingActionsFor; // template helper
  readonly rankOptions = INVIGILATOR_RANKS;
  readonly kindOptions = INCIDENT_KINDS;
  /** GCID whose sitting action / invigilator op is in flight. */
  private readonly sittingBusySignal = signal<string>('');
  readonly sittingBusy = computed(() => this.sittingBusySignal());
  private readonly sittingErrorSignal = signal<string>('');
  readonly sittingError = computed(() => this.sittingErrorSignal());
  // create-sitting form
  readonly newSittingStartsAt = signal<string>('');
  readonly newSittingEndsAt = signal<string>('');
  readonly newSittingCapacity = signal<number | null>(null);
  private readonly creatingSittingSignal = signal<boolean>(false);
  readonly isCreatingSitting = computed(() => this.creatingSittingSignal());

  private readonly invigilatorsStateSignal = signal<LoadState<readonly ExamInvigilator[]>>({ status: 'loading' });
  private readonly invigilatorsLoadedForSitting = signal<string | null>(null);
  readonly invigilatorsState = computed(() => this.invigilatorsStateSignal());
  readonly invigilators = computed<readonly ExamInvigilator[]>(() => {
    const s = this.invigilatorsStateSignal();
    return s.status === 'success' ? s.data : [];
  });
  readonly newInvigilatorGcid = signal<string>('');
  readonly newInvigilatorRank = signal<InvigilatorRank>('invigilator');
  private readonly assigningSignal = signal<boolean>(false);
  readonly isAssigning = computed(() => this.assigningSignal());

  // ── Incidents (Incidents tab, per selected sitting) ────────────────────
  private readonly incidentsStateSignal = signal<LoadState<readonly ExamIncident[]>>({ status: 'loading' });
  private readonly incidentsLoadedForSitting = signal<string | null>(null);
  readonly incidentsState = computed(() => this.incidentsStateSignal());
  readonly incidents = computed<readonly ExamIncident[]>(() => {
    const s = this.incidentsStateSignal();
    return s.status === 'success' ? s.data : [];
  });
  readonly newIncidentKind = signal<IncidentKind>('other');
  readonly newIncidentNarrative = signal<string>('');
  readonly newIncidentCandidateRef = signal<string>('');
  private readonly filingSignal = signal<boolean>(false);
  readonly isFiling = computed(() => this.filingSignal());

  // ── Results (Results tab — roster + record) ────────────────────────────
  private readonly resultsListStateSignal = signal<LoadState<readonly ExamResultRecord[]>>({ status: 'loading' });
  private readonly resultsLoadedForId = signal<string | null>(null);
  readonly resultsListState = computed(() => this.resultsListStateSignal());
  readonly resultsList = computed<readonly ExamResultRecord[]>(() => {
    const s = this.resultsListStateSignal();
    return s.status === 'success' ? s.data : [];
  });
  readonly resultFormId = signal<string>('');
  readonly resultCandidateRef = signal<string>('');
  readonly resultRawScore = signal<number | null>(null);
  private readonly recordingSignal = signal<boolean>(false);
  readonly isRecording = computed(() => this.recordingSignal());
  private readonly resultErrorSignal = signal<string>('');
  readonly resultError = computed(() => this.resultErrorSignal());
  private readonly lastResultSignal = signal<ExamResultRecord | null>(null);
  readonly lastResult = computed(() => this.lastResultSignal());

  constructor() {
    // Load the exam whenever the :id changes.
    effect(() => {
      const examId = this.id();
      untracked(() => this.loadExam(examId));
    });
    // Candidates load EAGERLY on open (guarded once per exam) so the Overview
    // can show the real allocated-candidate count — the exam aggregate's
    // enrolled_count is a distinct self-enrolment metric and stays 0 for
    // admin-allocated candidates (chora-delivery candidate.go:34 follow-up).
    effect(() => {
      const examId = this.id();
      untracked(() => {
        if (this.candidatesLoadedForId() !== examId) {
          this.loadCandidates(examId);
        }
      });
    });
    // Forms power the Form tab AND the Results form-picker.
    effect(() => {
      const examId = this.id();
      const active = this.isFormActive() || this.isResultsActive();
      untracked(() => {
        if (active && this.formsLoadedForId() !== examId) {
          this.loadForms(examId);
        }
      });
    });
    // Sittings power Proctors + Incidents (invigilators/incidents nest under one).
    effect(() => {
      const examId = this.id();
      const active = this.needsSittings();
      untracked(() => {
        if (active && this.sittingsLoadedForId() !== examId) {
          this.loadSittings(examId);
        }
      });
    });
    // Invigilators for the selected sitting (Proctors tab).
    effect(() => {
      const examId = this.id();
      const sittingId = this.selectedSittingId();
      const active = this.isProctorsActive();
      untracked(() => {
        if (active && sittingId && this.invigilatorsLoadedForSitting() !== sittingId) {
          this.loadInvigilators(examId, sittingId);
        }
      });
    });
    // Incidents for the selected sitting (Incidents tab).
    effect(() => {
      const examId = this.id();
      const sittingId = this.selectedSittingId();
      const active = this.isIncidentsActive();
      untracked(() => {
        if (active && sittingId && this.incidentsLoadedForSitting() !== sittingId) {
          this.loadIncidents(examId, sittingId);
        }
      });
    });
    // Results roster (CHO-2104) — load when the Results tab is active.
    effect(() => {
      const examId = this.id();
      const active = this.isResultsActive();
      untracked(() => {
        if (active && this.resultsLoadedForId() !== examId) {
          this.loadResults(examId);
        }
      });
    });
  }

  // ── Sitting selection + actions ────────────────────────────────────────
  selectSitting(sittingId: string): void {
    this.selectedSittingId.set(sittingId);
    this.sittingErrorSignal.set('');
  }

  createSitting(): void {
    const examId = this.id();
    const startsAt = this.newSittingStartsAt().trim();
    const endsAt = this.newSittingEndsAt().trim();
    const capacity = this.newSittingCapacity();
    if (!startsAt || !endsAt || !capacity || capacity <= 0 || this.creatingSittingSignal()) return;
    this.creatingSittingSignal.set(true);
    this.sittingErrorSignal.set('');
    this.service
      .createSitting(examId, { startsAt: toRfc3339(startsAt), endsAt: toRfc3339(endsAt), capacity })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creatingSittingSignal.set(false);
          this.newSittingStartsAt.set('');
          this.newSittingEndsAt.set('');
          this.newSittingCapacity.set(null);
          this.loadSittings(examId);
        },
        error: (err: unknown) => {
          this.creatingSittingSignal.set(false);
          this.sittingErrorSignal.set(errorMessage(err));
        },
      });
  }

  runSittingAction(sittingId: string, action: SittingActionKind): void {
    const examId = this.id();
    if (this.sittingBusySignal()) return;
    this.sittingBusySignal.set(sittingId);
    this.sittingErrorSignal.set('');
    this.service
      .sittingAction(examId, sittingId, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.sittingBusySignal.set('');
          this.loadSittings(examId);
        },
        error: (err: unknown) => {
          this.sittingBusySignal.set('');
          this.sittingErrorSignal.set(errorMessage(err));
        },
      });
  }

  assignInvigilator(): void {
    const examId = this.id();
    const sittingId = this.selectedSittingId();
    const gcid = this.newInvigilatorGcid().trim();
    if (!sittingId || !gcid || this.assigningSignal()) return;
    this.assigningSignal.set(true);
    this.sittingErrorSignal.set('');
    this.service
      .assignInvigilator(examId, sittingId, gcid, this.newInvigilatorRank())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.assigningSignal.set(false);
          this.newInvigilatorGcid.set('');
          this.loadInvigilators(examId, sittingId);
        },
        error: (err: unknown) => {
          this.assigningSignal.set(false);
          this.sittingErrorSignal.set(errorMessage(err));
        },
      });
  }

  removeInvigilator(invigilatorId: string): void {
    const examId = this.id();
    const sittingId = this.selectedSittingId();
    if (!sittingId || this.sittingBusySignal()) return;
    this.sittingBusySignal.set(invigilatorId);
    this.sittingErrorSignal.set('');
    this.service
      .removeInvigilator(examId, sittingId, invigilatorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.sittingBusySignal.set('');
          this.loadInvigilators(examId, sittingId);
        },
        error: (err: unknown) => {
          this.sittingBusySignal.set('');
          this.sittingErrorSignal.set(errorMessage(err));
        },
      });
  }

  fileIncident(): void {
    const examId = this.id();
    const sittingId = this.selectedSittingId();
    const narrative = this.newIncidentNarrative().trim();
    if (!sittingId || !narrative || this.filingSignal()) return;
    this.filingSignal.set(true);
    this.sittingErrorSignal.set('');
    this.service
      .fileIncident(examId, sittingId, {
        kind: this.newIncidentKind(),
        narrative,
        candidateRef: this.newIncidentCandidateRef().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.filingSignal.set(false);
          this.newIncidentNarrative.set('');
          this.newIncidentCandidateRef.set('');
          this.loadIncidents(examId, sittingId);
        },
        error: (err: unknown) => {
          this.filingSignal.set(false);
          this.sittingErrorSignal.set(errorMessage(err));
        },
      });
  }

  recordResult(): void {
    const examId = this.id();
    const formId = this.resultFormId().trim();
    const candidateRef = this.resultCandidateRef().trim();
    const rawScore = this.resultRawScore();
    if (!formId || !candidateRef || rawScore === null || rawScore < 0 || this.recordingSignal()) return;
    this.recordingSignal.set(true);
    this.resultErrorSignal.set('');
    this.service
      .recordResult(examId, { formId, candidateRef, rawScore })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.recordingSignal.set(false);
          this.lastResultSignal.set(res);
          this.resultCandidateRef.set('');
          this.resultRawScore.set(null);
          this.loadResults(examId); // refresh the roster with the new row
        },
        error: (err: unknown) => {
          this.recordingSignal.set(false);
          this.resultErrorSignal.set(errorMessage(err));
        },
      });
  }

  // ── Tab selection + roving-tabindex keyboard nav ───────────────────────
  selectTab(id: ExamTabId): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onTabKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.tabList();
    if (tabs.length === 0) return;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.selectTab(tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  // ── Candidate actions ──────────────────────────────────────────────────
  allocateCandidate(): void {
    const examId = this.id();
    const gcid = this.newCandidateGcid().trim();
    if (!gcid || this.allocatingSignal()) return;
    this.allocatingSignal.set(true);
    this.allocateErrorSignal.set('');
    this.service
      .allocateCandidate(examId, gcid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.allocatingSignal.set(false);
          this.newCandidateGcid.set('');
          this.loadCandidates(examId);
        },
        error: (err: unknown) => {
          this.allocatingSignal.set(false);
          this.allocateErrorSignal.set(errorMessage(err));
        },
      });
  }

  verifyCandidate(gcid: string): void {
    this.runRowAction(gcid, (examId) => this.service.verifyCandidate(examId, gcid));
  }

  admitCandidate(gcid: string): void {
    this.runRowAction(gcid, (examId) => this.service.admitCandidate(examId, gcid));
  }

  private runRowAction(
    gcid: string,
    call: (examId: string) => ReturnType<ExamsService['admitCandidate']>,
  ): void {
    const examId = this.id();
    if (this.actingGcidSignal()) return;
    this.actingGcidSignal.set(gcid);
    this.rowErrorSignal.set(null);
    call(examId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actingGcidSignal.set(null);
          this.loadCandidates(examId);
        },
        error: (err: unknown) => {
          this.actingGcidSignal.set(null);
          this.rowErrorSignal.set({ gcid, message: errorMessage(err) });
        },
      });
  }

  // ── Admin KYC review (manual-doc prerequisite — CHO-2103) ──────────────
  // KYC-verify completes the Identity Verification (submitted→verified) so the
  // learner's exam candidate can then resolve VERIFIED via verifyCandidate().
  // The candidate projection does NOT change from this action, so a success
  // notice ("now verify the candidate") is the real feedback; we still refresh
  // the roster per the flow. A 409/404 = nothing pending to review (benign).

  /** Complete a submitted manual-doc KYC for the candidate (prerequisite step). */
  verifyKyc(gcid: string): void {
    if (this.kycActingGcidSignal()) return;
    this.kycActingGcidSignal.set(gcid);
    this.kycNoticeSignal.set(null);
    this.rowErrorSignal.set(null);
    this.service
      .verifyKyc(gcid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.kycActingGcidSignal.set(null);
          this.kycNoticeSignal.set({
            gcid,
            kind: 'key',
            messageKey: 'rplus.exams.workspace.candidates.kyc.verified',
            tone: 'ok',
          });
          this.loadCandidates(this.id());
        },
        error: (err: unknown) => {
          this.kycActingGcidSignal.set(null);
          this.applyKycError(gcid, err);
        },
      });
  }

  /** Reveal the inline reject form for a candidate row (resets its fields). */
  openKycReject(gcid: string): void {
    this.kycRejectingGcid.set(gcid);
    this.kycRejectCode.set('');
    this.kycRejectNotes.set('');
    this.kycRejectRetry.set(true);
    this.kycNoticeSignal.set(null);
    this.rowErrorSignal.set(null);
  }

  /** Dismiss the inline reject form without sending. */
  cancelKycReject(): void {
    this.kycRejectingGcid.set(null);
  }

  /** Reject a submitted manual-doc KYC with an optional code/notes + retry policy. */
  submitKycReject(gcid: string): void {
    if (this.kycActingGcidSignal()) return;
    this.kycActingGcidSignal.set(gcid);
    this.kycNoticeSignal.set(null);
    this.rowErrorSignal.set(null);
    this.service
      .rejectKyc(gcid, {
        code: this.kycRejectCode().trim() || undefined,
        notes: this.kycRejectNotes().trim() || undefined,
        retryAllowed: this.kycRejectRetry(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.kycActingGcidSignal.set(null);
          this.kycRejectingGcid.set(null);
          this.kycNoticeSignal.set({
            gcid,
            kind: 'key',
            messageKey: 'rplus.exams.workspace.candidates.kyc.rejected',
            tone: 'info',
          });
          this.loadCandidates(this.id());
        },
        error: (err: unknown) => {
          this.kycActingGcidSignal.set(null);
          this.applyKycError(gcid, err);
        },
      });
  }

  /**
   * A 409 KYC_INVALID_TRANSITION or 404 means there's no submitted KYC to act
   * on (already verified, or the learner never uploaded a manual doc) — the
   * common "nothing to do" case, shown as a friendly notice, not a scary error.
   * Any other failure surfaces the raw BE message loudly.
   */
  private applyKycError(gcid: string, err: unknown): void {
    const status = httpErrorView(err)?.status;
    if (status === 409 || status === 404) {
      this.kycNoticeSignal.set({
        gcid,
        kind: 'key',
        messageKey: 'rplus.exams.workspace.candidates.kyc.none_pending',
        tone: 'info',
      });
      return;
    }
    this.kycNoticeSignal.set({ gcid, kind: 'raw', message: errorMessage(err), tone: 'error' });
  }

  // ── Presentation helpers (badge classes) ──────────────────────────────
  examStateBadge(state: string): string {
    switch (state) {
      case 'OPEN':
        return 'badge-success';
      case 'CLOSED':
      case 'GRADED':
        return 'badge-neutral';
      default:
        return 'badge-info';
    }
  }

  candidateStateBadge(state: string): string {
    switch (state) {
      case 'ADMITTED':
        return 'badge-success';
      case 'ID_VERIFIED':
        return 'badge-info';
      case 'REJECTED':
      case 'WITHDRAWN':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
  }

  verificationBadge(status: string): string {
    return status === 'VERIFIED' ? 'badge-success' : 'badge-warning';
  }

  sittingStateBadge(state: string): string {
    switch (state) {
      case 'OPEN':
      case 'IN_PROGRESS':
        return 'badge-success';
      case 'CLOSED':
        return 'badge-neutral';
      case 'CANCELLED':
        return 'badge-warning';
      default:
        return 'badge-info'; // SCHEDULED
    }
  }

  outcomeBadge(outcome: string): string {
    return outcome === 'PASS' ? 'badge-success' : 'badge-warning';
  }

  // ── Loaders ────────────────────────────────────────────────────────────
  private loadExam(examId: string): void {
    this.examStateSignal.set({ status: 'loading' });
    this.service
      .getExam(examId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.examStateSignal.set({ status: 'success', data }),
        error: (err: unknown) =>
          this.examStateSignal.set({
            status: 'error',
            errorKey: 'rplus.exams.workspace.load_error',
            notFound: isNotFound(err),
          }),
      });
  }

  private loadCandidates(examId: string): void {
    this.candidatesStateSignal.set({ status: 'loading' });
    this.candidatesLoadedForId.set(examId);
    this.service
      .listCandidates(examId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.candidatesStateSignal.set({ status: 'success', data }),
        error: () =>
          this.candidatesStateSignal.set({
            status: 'error',
            errorKey: 'rplus.exams.workspace.candidates.load_error',
            notFound: false,
          }),
      });
  }

  private loadForms(examId: string): void {
    this.formsStateSignal.set({ status: 'loading' });
    this.formsLoadedForId.set(examId);
    this.service
      .listForms(examId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.formsStateSignal.set({ status: 'success', data }),
        error: () =>
          this.formsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.exams.workspace.form.load_error',
            notFound: false,
          }),
      });
  }

  private loadSittings(examId: string): void {
    this.sittingsStateSignal.set({ status: 'loading' });
    this.sittingsLoadedForId.set(examId);
    this.service
      .listSittings(examId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.sittingsStateSignal.set({ status: 'success', data }),
        error: () =>
          this.sittingsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.exams.workspace.sittings.load_error',
            notFound: false,
          }),
      });
  }

  private loadInvigilators(examId: string, sittingId: string): void {
    this.invigilatorsStateSignal.set({ status: 'loading' });
    this.invigilatorsLoadedForSitting.set(sittingId);
    this.service
      .listInvigilators(examId, sittingId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.invigilatorsStateSignal.set({ status: 'success', data }),
        error: () =>
          this.invigilatorsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.exams.workspace.proctors.load_error',
            notFound: false,
          }),
      });
  }

  private loadIncidents(examId: string, sittingId: string): void {
    this.incidentsStateSignal.set({ status: 'loading' });
    this.incidentsLoadedForSitting.set(sittingId);
    this.service
      .listIncidents(examId, sittingId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.incidentsStateSignal.set({ status: 'success', data }),
        error: () =>
          this.incidentsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.exams.workspace.incidents.load_error',
            notFound: false,
          }),
      });
  }

  private loadResults(examId: string): void {
    this.resultsListStateSignal.set({ status: 'loading' });
    this.resultsLoadedForId.set(examId);
    this.service
      .listResults(examId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.resultsListStateSignal.set({ status: 'success', data }),
        error: () =>
          this.resultsListStateSignal.set({
            status: 'error',
            errorKey: 'rplus.exams.workspace.results.load_error',
            notFound: false,
          }),
      });
  }
}

/**
 * Widen a `datetime-local` value (`2026-07-20T09:00`, no zone) to an RFC3339
 * UTC timestamp the BE decodes — mirrors the sittings/exams create forms.
 */
function toRfc3339(local: string): string {
  if (!local) return '';
  // Already zoned? pass through. Else append seconds+Z (treats input as UTC).
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(local)) return local;
  return local.length === 16 ? `${local}:00Z` : `${local}Z`;
}

/**
 * Narrow to 404-ness via httpErrorView — at runtime the errorInterceptor
 * converts every HTTP failure to ApiError (never a bare HttpErrorResponse),
 * so `err.status` alone is unreliable across contexts.
 */
function isNotFound(err: unknown): boolean {
  return httpErrorView(err)?.status === 404;
}

/**
 * Human message from the BFF error, verbatim. Reads the RAW body via
 * httpErrorView (the interceptor stows it on ApiError.body) so the delivery
 * services' flat `{error, message}` shape surfaces the real reason rather than
 * Angular's generic "Http failure response …" text (walk-caught, see
 * reusable_fe_error_detail_apierror_body_not_error).
 */
function errorMessage(err: unknown): string {
  const body = httpErrorView(err)?.body;
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; error?: unknown };
    if (typeof b.message === 'string' && b.message) return b.message;
    if (typeof b.error === 'string' && b.error) return b.error;
  }
  if (typeof body === 'string' && body) return body;
  if (err instanceof Error && err.message) return err.message;
  return 'request failed';
}
