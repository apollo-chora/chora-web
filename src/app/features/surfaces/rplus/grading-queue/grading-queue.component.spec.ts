/**
 * GradingQueueComponent spec — R+ /r/assessments/:assessmentId/grading-queue
 * (ADR-172 HITL grading queue).
 *
 * Characterizes the route component's shell render + every meaningful state
 * (route-guard short-circuit / loading / error+retry / empty / populated list),
 * the per-row review gating, the bulk CTAs (approve-all, approve-and-release via
 * confirm dialog, release-results gate), the success effects (list refetch +
 * toast + clearBulkStates) and the bulk error banner.
 *
 * Uses the real HttpTestingController + BffClientService wiring — the component
 * leans on AssessmentMonitorService + GradingReviewService, both of which hit
 * absolute BFF urls under environment.bffBaseUrl. No service-level mocks
 * (feedback_no_stubs_real_wiring). ConfirmDialogService is driven directly so we
 * control the confirm/cancel resolution without rendering the dialog component.
 *
 * House conventions per ADR-176: GLOBAL Vitest API (no `vitest` imports), zone
 * mode (no initTestEnvironment), standalone import + provideHttpClientTesting,
 * detectChanges after each flush, Translate pipe returns the raw i18n key.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';

import { GradingQueueComponent } from './grading-queue.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import type {
  Submission,
  SubmissionState,
} from '../assessment-monitor/assessment-monitor.model';

const ASSESSMENT_ID = '11111111-2222-4333-8444-555555555555';

const BASE = environment.bffBaseUrl;
const SUBMISSIONS_URL = `${BASE}/api/v1/assessments/${ASSESSMENT_ID}/submissions`;
const APPROVE_ALL_URL = `${BASE}/api/v1/assessments/${ASSESSMENT_ID}/approve-all`;
const RELEASE_URL = `${BASE}/api/v1/assessments/${ASSESSMENT_ID}/release-results`;

/** Build a Submission wire DTO with only the fields the queue row reads. */
function makeSubmission(
  partial: Partial<Submission> & {
    submission_id: string;
    state: SubmissionState;
  },
): Submission {
  return {
    assessment_id: ASSESSMENT_ID,
    tenant_id: 'tenant-001',
    learner_gcid: partial.learner_gcid ?? 'gcid-' + partial.submission_id,
    attempt_number: 1,
    started_at: '2026-06-01T00:00:00Z',
    submitted_at: '2026-06-01T01:00:00Z',
    last_saved_at: null,
    answers: [],
    ...partial,
  } as Submission;
}

/** Two graded submissions: one PENDING_REVIEW, one APPROVED + one in-progress. */
const STUB_SUBMISSIONS: readonly Submission[] = [
  {
    ...makeSubmission({
      submission_id: 'sub-graded-pending',
      state: 'GRADED',
      learner_display_name: 'Phyllis Tan',
    }),
    review_status: 'PENDING_REVIEW',
  } as Submission,
  {
    ...makeSubmission({
      submission_id: 'sub-graded-approved',
      state: 'GRADED',
      learner_gcid: 'gcid-mei',
    }),
    review_status: 'APPROVED',
  } as Submission,
  makeSubmission({
    submission_id: 'sub-in-progress',
    state: 'IN_PROGRESS',
    learner_display_name: 'Sam Lim',
  }),
];

function configure(routeParams: Record<string, string>): void {
  TestBed.configureTestingModule({
    imports: [GradingQueueComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap(routeParams) },
        },
      },
    ],
  });
}

/** Standard setup with a valid assessmentId — flushes the initial GET. */
function setup(
  submissions: readonly Submission[] = STUB_SUBMISSIONS,
): {
  fixture: ComponentFixture<GradingQueueComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
  component: GradingQueueComponent;
} {
  configure({ assessmentId: ASSESSMENT_ID });
  const fixture = TestBed.createComponent(GradingQueueComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock
    .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
    .flush({ items: submissions });
  fixture.detectChanges();
  return {
    fixture,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('GradingQueueComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('route-param guard', () => {
    it('resolves a valid UUID assessmentId from the route and loads submissions', () => {
      const { component, httpMock } = setup();
      expect(component.assessmentId).toBe(ASSESSMENT_ID);
      httpMock.verify();
    });

    it('short-circuits on a literal {id} placeholder (no GET fires)', () => {
      configure({ assessmentId: '{id}' });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      expect(fixture.componentInstance.assessmentId).toBe('');
      httpMock.verify(); // no outstanding request
    });

    it('short-circuits on a missing assessmentId param', () => {
      configure({});
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      expect(fixture.componentInstance.assessmentId).toBe('');
      httpMock.verify();
    });

    it('short-circuits on a non-UUID string assessmentId', () => {
      configure({ assessmentId: 'not-a-uuid' });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      expect(fixture.componentInstance.assessmentId).toBe('');
      httpMock.verify();
    });
  });

  describe('shell render', () => {
    it('renders the surface-rplus accent on the section root', () => {
      const { element, httpMock } = setup();
      const root = element.querySelector('[data-testid="rplus-grading-queue"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.className).toContain('surface-rplus');
      httpMock.verify();
    });

    it('renders the back-to-monitor breadcrumb when an assessmentId is present', () => {
      const { element, httpMock } = setup();
      const nav = element.querySelector('.grading-queue__breadcrumbs');
      expect(nav?.textContent).toContain(
        'rplus.grading_queue.back_to_monitor',
      );
      httpMock.verify();
    });

    it('renders the back-to-list breadcrumb when the assessmentId is empty', () => {
      configure({ assessmentId: '{id}' });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      const nav = (fixture.nativeElement as HTMLElement).querySelector(
        '.grading-queue__breadcrumbs',
      );
      expect(nav?.textContent).toContain('rplus.grading_queue.back_to_list');
    });

    it('renders the title + the three bulk CTAs', () => {
      const { element, httpMock } = setup();
      expect(
        element.querySelector('[data-testid="grading-queue-approve-all"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="grading-queue-approve-release"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="grading-queue-release"]'),
      ).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('loading + error + retry', () => {
    it('shows the loading panel before the GET settles', () => {
      configure({ assessmentId: ASSESSMENT_ID });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      const loading = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="grading-queue-loading"]',
      );
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('aria-busy')).toBe('true');

      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ items: [] });
      fixture.detectChanges();
    });

    it('renders the error banner + retry button on a 5xx and characterizes the upstream error key', () => {
      configure({ assessmentId: ASSESSMENT_ID });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ error: 'boom' }, { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      const err = element.querySelector('[data-testid="grading-queue-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(err?.textContent).toContain(
        'rplus.assessment_monitor.error_upstream',
      );
      expect(fixture.componentInstance.isError()).toBe(true);
      expect(fixture.componentInstance.errorKey()).toBe(
        'rplus.assessment_monitor.error_upstream',
      );
    });

    it('retry() re-issues the submissions GET and recovers to the list', () => {
      configure({ assessmentId: ASSESSMENT_ID });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ error: 'x' }, { status: 500, statusText: 'Error' });
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      (
        element.querySelector(
          '[data-testid="grading-queue-retry"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ items: STUB_SUBMISSIONS });
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="grading-queue-error"]'),
      ).toBeNull();
      expect(
        element.querySelectorAll('.grading-queue-table tbody tr').length,
      ).toBe(3);
      httpMock.verify();
    });

    it('errorKey() is empty while not in an error state', () => {
      const { component, httpMock } = setup();
      expect(component.isError()).toBe(false);
      expect(component.errorKey()).toBe('');
      httpMock.verify();
    });
  });

  describe('empty state', () => {
    it('renders the empty-state component when there are no submissions', () => {
      const { element, httpMock } = setup([]);
      expect(
        element.querySelector('[data-testid="grading-queue-empty"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('.grading-queue-table'),
      ).toBeNull();
      httpMock.verify();
    });
  });

  describe('submissions list rendering', () => {
    it('renders one row per submission (3 total)', () => {
      const { element, httpMock } = setup();
      const rows = element.querySelectorAll('.grading-queue-table tbody tr');
      expect(rows.length).toBe(3);
      httpMock.verify();
    });

    it('shows the learner display name when present and falls back to gcid otherwise', () => {
      const { element, httpMock } = setup();
      const pendingLearner = element
        .querySelector(
          '[data-testid="grading-queue-row-sub-graded-pending"]',
        )
        ?.querySelector('[data-testid="grading-queue-row-learner"]');
      expect(pendingLearner?.textContent).toContain('Phyllis Tan');

      // sub-graded-approved has no display name → falls back to learner_gcid
      const approvedLearner = element
        .querySelector(
          '[data-testid="grading-queue-row-sub-graded-approved"]',
        )
        ?.querySelector('[data-testid="grading-queue-row-learner"]');
      expect(approvedLearner?.textContent).toContain('gcid-mei');
      httpMock.verify();
    });

    it('renders the per-row review-status pill only for graded rows', () => {
      const { element, httpMock } = setup();
      // graded-pending row has the review-status chip
      const pendingChip = element
        .querySelector(
          '[data-testid="grading-queue-row-sub-graded-pending"]',
        )
        ?.querySelector('[data-testid="grading-queue-row-review-status"]');
      expect(pendingChip).not.toBeNull();
      expect(pendingChip?.getAttribute('data-review-status')).toBe(
        'PENDING_REVIEW',
      );
      expect(pendingChip?.textContent).toContain(
        'rplus.grading_queue.review_status_PENDING_REVIEW',
      );

      // approved row chip
      const approvedChip = element
        .querySelector(
          '[data-testid="grading-queue-row-sub-graded-approved"]',
        )
        ?.querySelector('[data-testid="grading-queue-row-review-status"]');
      expect(approvedChip?.getAttribute('data-review-status')).toBe('APPROVED');

      // in-progress row → no chip (shows "not yet graded" muted text instead)
      const inProgressChip = element
        .querySelector('[data-testid="grading-queue-row-sub-in-progress"]')
        ?.querySelector('[data-testid="grading-queue-row-review-status"]');
      expect(inProgressChip).toBeNull();
      httpMock.verify();
    });

    it('disables the per-row Review button for non-graded submissions', () => {
      const { element, httpMock } = setup();
      const inProgressBtn = element.querySelector(
        '[data-testid="grading-queue-row-review-sub-in-progress"]',
      ) as HTMLButtonElement;
      expect(inProgressBtn.disabled).toBe(true);

      const gradedBtn = element.querySelector(
        '[data-testid="grading-queue-row-review-sub-graded-pending"]',
      ) as HTMLButtonElement;
      expect(gradedBtn.disabled).toBe(false);
      httpMock.verify();
    });
  });

  describe('gate hint + derived counts', () => {
    it('renders approvedCount / gradedCount in the gate hint', () => {
      const { element, component, httpMock } = setup();
      expect(component.gradedCount()).toBe(2);
      expect(component.approvedCount()).toBe(1);
      const hint = element.querySelector(
        '[data-testid="grading-queue-gate-hint"]',
      );
      expect(hint?.textContent).toContain('1 / 2');
      httpMock.verify();
    });
  });

  describe('bulk CTA disabled-state gating', () => {
    it('disables approve-all + approve-release when no graded submissions exist', () => {
      const { element, httpMock } = setup([
        makeSubmission({ submission_id: 'only-ip', state: 'IN_PROGRESS' }),
      ]);
      expect(
        (
          element.querySelector(
            '[data-testid="grading-queue-approve-all"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(
        (
          element.querySelector(
            '[data-testid="grading-queue-approve-release"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      httpMock.verify();
    });

    it('disables release when at least one graded submission is still pending', () => {
      const { element, component, httpMock } = setup();
      expect(component.releaseEnabled()).toBe(false);
      expect(
        (
          element.querySelector(
            '[data-testid="grading-queue-release"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      httpMock.verify();
    });

    it('enables release when every graded submission is APPROVED', () => {
      const { element, component, httpMock } = setup([
        {
          ...makeSubmission({ submission_id: 'g1', state: 'GRADED' }),
          review_status: 'APPROVED',
        } as Submission,
        {
          ...makeSubmission({ submission_id: 'g2', state: 'RELEASED' }),
          review_status: 'APPROVED',
        } as Submission,
        makeSubmission({ submission_id: 'ip', state: 'IN_PROGRESS' }),
      ]);
      expect(component.releaseEnabled()).toBe(true);
      expect(
        (
          element.querySelector(
            '[data-testid="grading-queue-release"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
      httpMock.verify();
    });
  });

  describe('approveAll() bulk action', () => {
    it('POSTs approve-all with release:false, then refetches + toasts on success', () => {
      const { component, fixture, httpMock } = setup();
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      component.approveAll();

      const post = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url === APPROVE_ALL_URL,
      );
      expect(post.request.body).toEqual({ release: false });
      expect(component.approveAllSubmitting()).toBe(true);

      post.flush({
        assessment_id: ASSESSMENT_ID,
        approved_submission_count: 2,
        released: false,
      });
      // success effect → loadSubmissions refetch fires on the next CD cycle
      fixture.detectChanges();

      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ items: STUB_SUBMISSIONS });
      fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith(
        'rplus.grading_queue.toast_approved_all',
        'success',
      );
      httpMock.verify();
    });

    it('uses the toast_approved_released key when the response reports released:true', () => {
      const { component, fixture, httpMock } = setup();
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      component.approveAll();
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url === APPROVE_ALL_URL)
        .flush({
          assessment_id: ASSESSMENT_ID,
          approved_submission_count: 2,
          released: true,
        });
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ items: STUB_SUBMISSIONS });
      fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith(
        'rplus.grading_queue.toast_approved_released',
        'success',
      );
      httpMock.verify();
    });

    it('surfaces the bulk error banner on a 409 conflict and characterizes the conflict key', () => {
      const { component, fixture, element, httpMock } = setup();

      component.approveAll();
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url === APPROVE_ALL_URL)
        .flush({ error: 'conflict' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      const banner = element.querySelector(
        '[data-testid="grading-queue-bulk-error"]',
      );
      expect(banner).not.toBeNull();
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain(
        'rplus.grading_queue.error_conflict',
      );
      expect(component.bulkErrorKey()).toBe('rplus.grading_queue.error_conflict');
      // no refetch should fire on the error path
      httpMock.verify();
    });

    it('approveAll() is a no-op when the assessmentId is empty', () => {
      configure({ assessmentId: '{id}' });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      fixture.componentInstance.approveAll();
      httpMock.verify(); // no POST fired
    });
  });

  describe('approveAndRelease() confirm flow', () => {
    it('opens a warning confirm dialog and POSTs approve-all with release:true on confirm', async () => {
      const { component, fixture, httpMock } = setup();
      const confirm = TestBed.inject(ConfirmDialogService);
      const confirmSpy = vi
        .spyOn(confirm, 'confirm')
        .mockResolvedValue(true);

      const promise = component.approveAndRelease();
      await promise;

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'rplus.grading_queue.approve_release_confirm_title',
          variant: 'warning',
        }),
      );

      const post = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url === APPROVE_ALL_URL,
      );
      expect(post.request.body).toEqual({ release: true });
      post.flush({
        assessment_id: ASSESSMENT_ID,
        approved_submission_count: 2,
        released: true,
      });
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ items: STUB_SUBMISSIONS });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('does NOT POST when the confirm dialog is cancelled', async () => {
      const { component, httpMock } = setup();
      const confirm = TestBed.inject(ConfirmDialogService);
      vi.spyOn(confirm, 'confirm').mockResolvedValue(false);

      await component.approveAndRelease();

      httpMock.verify(); // no approve-all POST
    });

    it('is a no-op (no confirm) when the assessmentId is empty', async () => {
      configure({ assessmentId: '{id}' });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      const confirm = TestBed.inject(ConfirmDialogService);
      const confirmSpy = vi.spyOn(confirm, 'confirm');

      await fixture.componentInstance.approveAndRelease();

      expect(confirmSpy).not.toHaveBeenCalled();
      httpMock.verify();
    });
  });

  describe('releaseResults() confirm flow', () => {
    /** All-approved fixture so the release gate is open. */
    const ALL_APPROVED: readonly Submission[] = [
      {
        ...makeSubmission({ submission_id: 'g1', state: 'GRADED' }),
        review_status: 'APPROVED',
      } as Submission,
      {
        ...makeSubmission({ submission_id: 'g2', state: 'GRADED' }),
        review_status: 'APPROVED',
      } as Submission,
    ];

    it('opens a confirm dialog and POSTs release-results, then refetches + toasts on confirm', async () => {
      const { component, fixture, httpMock } = setup(ALL_APPROVED);
      const confirm = TestBed.inject(ConfirmDialogService);
      vi.spyOn(confirm, 'confirm').mockResolvedValue(true);
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      await component.releaseResults();

      const post = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url === RELEASE_URL,
      );
      expect(post.request.body).toEqual({});
      post.flush({});
      fixture.detectChanges();

      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ items: ALL_APPROVED });
      fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith(
        'rplus.grading_queue.toast_released',
        'success',
      );
      httpMock.verify();
    });

    it('is a no-op when the release gate is closed (pending submissions present)', async () => {
      const { component, httpMock } = setup(); // STUB has a PENDING_REVIEW graded row
      const confirm = TestBed.inject(ConfirmDialogService);
      const confirmSpy = vi.spyOn(confirm, 'confirm');

      await component.releaseResults();

      expect(confirmSpy).not.toHaveBeenCalled();
      httpMock.verify();
    });

    it('does NOT POST when the release confirm is cancelled', async () => {
      const { component, httpMock } = setup(ALL_APPROVED);
      const confirm = TestBed.inject(ConfirmDialogService);
      vi.spyOn(confirm, 'confirm').mockResolvedValue(false);

      await component.releaseResults();

      httpMock.verify();
    });

    it('surfaces the bulk error banner when release-results fails with 409', async () => {
      const { component, fixture, element, httpMock } = setup(ALL_APPROVED);
      const confirm = TestBed.inject(ConfirmDialogService);
      vi.spyOn(confirm, 'confirm').mockResolvedValue(true);

      await component.releaseResults();
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url === RELEASE_URL)
        .flush({ error: 'gate' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="grading-queue-bulk-error"]')
          ?.textContent,
      ).toContain('rplus.grading_queue.error_conflict');
      expect(component.bulkErrorKey()).toBe(
        'rplus.grading_queue.error_conflict',
      );
      httpMock.verify();
    });
  });

  describe('row interaction + detail panel', () => {
    it('reviewRow() opens the grading-detail panel, which loads its own detail GET', () => {
      const { component, fixture, element, httpMock } = setup();

      component.reviewRow('sub-graded-pending');
      fixture.detectChanges();

      // The child panel loads the grading detail for the selected submission.
      const detailUrl = `${SUBMISSIONS_URL}/sub-graded-pending/grading`;
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === detailUrl)
        .flush({
          submission_id: 'sub-graded-pending',
          assessment_id: ASSESSMENT_ID,
          learner_gcid: 'gcid-phyllis',
          state: 'GRADED',
          review_status: 'PENDING_REVIEW',
          total_points_earned: 8,
          total_points_possible: 10,
          passing_threshold_percent: 50,
          questions: [],
        });
      fixture.detectChanges();

      expect(component.selectedSubmissionId()).toBe('sub-graded-pending');
      expect(
        element.querySelector('chora-rplus-submission-grading-detail'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('onDetailClosed() clears the selection and removes the panel', () => {
      const { component, fixture, element, httpMock } = setup();

      component.reviewRow('sub-graded-pending');
      fixture.detectChanges();
      const detailUrl = `${SUBMISSIONS_URL}/sub-graded-pending/grading`;
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === detailUrl)
        .flush({
          submission_id: 'sub-graded-pending',
          assessment_id: ASSESSMENT_ID,
          learner_gcid: 'gcid-phyllis',
          state: 'GRADED',
          review_status: 'PENDING_REVIEW',
          total_points_earned: 8,
          total_points_possible: 10,
          passing_threshold_percent: 50,
          questions: [],
        });
      fixture.detectChanges();

      component.onDetailClosed();
      fixture.detectChanges();

      expect(component.selectedSubmissionId()).toBeNull();
      expect(
        element.querySelector('chora-rplus-submission-grading-detail'),
      ).toBeNull();
      httpMock.verify();
    });

    it('onSubmissionApproved() refetches the submissions list when idle', () => {
      const { component, fixture, httpMock } = setup();

      component.onSubmissionApproved();
      fixture.detectChanges();

      httpMock
        .expectOne((r) => r.method === 'GET' && r.url === SUBMISSIONS_URL)
        .flush({ items: STUB_SUBMISSIONS });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('onSubmissionApproved() is a no-op when the assessmentId is empty', () => {
      configure({ assessmentId: '{id}' });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      fixture.componentInstance.onSubmissionApproved();
      httpMock.verify();
    });

    it('onSubmissionApproved() skips the refetch while a load is already in flight', () => {
      configure({ assessmentId: ASSESSMENT_ID });
      const fixture = TestBed.createComponent(GradingQueueComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      // The initial load GET is still in flight (not flushed) → state is 'loading'.
      const inFlight = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url === SUBMISSIONS_URL,
      );
      expect(fixture.componentInstance.submissionsState().status).toBe(
        'loading',
      );

      // De-dupe guard: no SECOND GET is issued while loading.
      fixture.componentInstance.onSubmissionApproved();
      httpMock.verify(); // only the single in-flight GET exists

      inFlight.flush({ items: [] });
    });
  });

  describe('view helper methods', () => {
    it('reviewGateBadgeClass maps gates to badge variant fragments', () => {
      const { component, httpMock } = setup();
      expect(component.reviewGateBadgeClass('APPROVED')).toBe('badge-success');
      expect(component.reviewGateBadgeClass('PENDING_REVIEW')).toBe(
        'badge-warning',
      );
      expect(component.reviewGateBadgeClass('NOT_REQUIRED')).toBe(
        'badge-neutral',
      );
      httpMock.verify();
    });

    it('submissionBadgeClass maps submission states to badge variant fragments', () => {
      const { component, httpMock } = setup();
      expect(component.submissionBadgeClass('GRADED')).toBe('badge-info');
      expect(component.submissionBadgeClass('RELEASED')).toBe('badge-success');
      expect(component.submissionBadgeClass('SUBMITTED')).toBe('badge-warning');
      httpMock.verify();
    });

    it('reviewGateLabelKey maps each gate to its i18n key', () => {
      const { component, httpMock } = setup();
      expect(component.reviewGateLabelKey('NOT_REQUIRED')).toBe(
        'rplus.grading_queue.review_status_NOT_REQUIRED',
      );
      expect(component.reviewGateLabelKey('PENDING_REVIEW')).toBe(
        'rplus.grading_queue.review_status_PENDING_REVIEW',
      );
      expect(component.reviewGateLabelKey('APPROVED')).toBe(
        'rplus.grading_queue.review_status_APPROVED',
      );
      httpMock.verify();
    });

    it('isGraded reflects only GRADED / RELEASED states', () => {
      const { component, httpMock } = setup();
      expect(component.isGraded('GRADED')).toBe(true);
      expect(component.isGraded('RELEASED')).toBe(true);
      expect(component.isGraded('IN_PROGRESS')).toBe(false);
      expect(component.isGraded('SUBMITTED')).toBe(false);
      httpMock.verify();
    });

    it('trackByRow returns the submission id', () => {
      const { component, httpMock } = setup();
      expect(
        component.trackByRow(0, {
          submission_id: 'abc',
          learner_gcid: 'g',
          state: 'GRADED',
          review_gate: 'NOT_REQUIRED',
        }),
      ).toBe('abc');
      httpMock.verify();
    });
  });

  describe('reviewGateStateOf defensive parsing', () => {
    it('treats an unexpected review_status value conservatively as PENDING_REVIEW', () => {
      const { element, httpMock } = setup([
        {
          ...makeSubmission({ submission_id: 'weird', state: 'GRADED' }),
          // a value outside the allowed enum — only "" declares NotRequired, so
          // an unknown value falls to the conservative pending gate (never
          // auto-skips a review we cannot classify).
          review_status: 'SOMETHING_ELSE',
        } as unknown as Submission,
      ]);
      const chip = element
        .querySelector('[data-testid="grading-queue-row-weird"]')
        ?.querySelector('[data-testid="grading-queue-row-review-status"]');
      expect(chip?.getAttribute('data-review-status')).toBe('PENDING_REVIEW');
      httpMock.verify();
    });
  });

  // ── NotRequired (MCQ-only / auto-graded) rows — CHO-2343 bug #2 ────────
  describe('NotRequired (MCQ-only) rows', () => {
    // A graded+released MCQ-only submission whose wire review_status is ""
    // (ReviewStatusNotRequired): NO human gate.
    const MCQ_ONLY: readonly Submission[] = [
      {
        ...makeSubmission({
          submission_id: 'mcq-released',
          state: 'RELEASED',
          learner_display_name: 'Ivy Wong',
        }),
        review_status: '',
      } as unknown as Submission,
    ];

    it('renders "No review needed" (NOT "Pending review") for a NotRequired row', () => {
      const { element, httpMock } = setup(MCQ_ONLY);
      const chip = element
        .querySelector('[data-testid="grading-queue-row-mcq-released"]')
        ?.querySelector('[data-testid="grading-queue-row-review-status"]');
      expect(chip).not.toBeNull();
      expect(chip?.getAttribute('data-review-status')).toBe('NOT_REQUIRED');
      expect(chip?.textContent).toContain(
        'rplus.grading_queue.review_status_NOT_REQUIRED',
      );
      expect(chip?.textContent).not.toContain(
        'rplus.grading_queue.review_status_PENDING_REVIEW',
      );
      httpMock.verify();
    });

    it('excludes NotRequired from approval counts + disables the bulk CTAs', () => {
      const { element, component, httpMock } = setup(MCQ_ONLY);
      // NotRequired is graded-state but requires no review → not counted.
      expect(component.gradedCount()).toBe(0);
      expect(component.approvedCount()).toBe(0);
      expect(
        (
          element.querySelector(
            '[data-testid="grading-queue-approve-all"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(
        (
          element.querySelector(
            '[data-testid="grading-queue-approve-release"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      httpMock.verify();
    });
  });
});
