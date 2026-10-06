import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError, Observable } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

import { ExamWorkspaceComponent } from './exam-workspace.component';
import { ExamsService } from './exams.service';
import { RbacService } from '../../../../core/services/rbac.service';
import { ApiError } from '../../../../core/interceptors/api-error.model';
import type {
  ExamCandidate,
  ExamDetail,
  ExamForm,
  ExamIncident,
  ExamInvigilator,
  ExamResultRecord,
  ExamSittingRow,
} from './exams.model';

const EXAM: ExamDetail = {
  examId: 'exam-1',
  title: 'CSPO Certification',
  courseId: 'course-1',
  scheduledAtIso: '2026-07-15T09:00:00Z',
  scheduledLabel: '15 Jul 2026',
  durationMinutes: 90,
  capacity: 30,
  enrolledCount: 7, // distinct from the 2 allocated candidates — Overview must show 2, not 7
  state: 'SCHEDULED',
  proctorMethod: 'PROCTOR_METHOD_HUMAN_LIVE',
};

const CANDIDATES: ExamCandidate[] = [
  { candidateId: 'c1', gcid: 'g-verified', state: 'ID_VERIFIED', verificationStatus: 'VERIFIED', createdAtIso: '' },
  { candidateId: 'c2', gcid: 'g-new', state: 'ALLOCATED', verificationStatus: 'UNVERIFIED', createdAtIso: '' },
];

const FORMS: ExamForm[] = [
  { formId: 'f1', itemBankId: 'b1', state: 'ASSEMBLED', itemCount: 3, items: [], cutScore: null },
];
const SITTINGS: ExamSittingRow[] = [
  { sittingId: 's1', startsAtIso: '2026-07-20T09:00:00Z', startsLabel: '20 Jul 2026', endsAtIso: '2026-07-20T10:30:00Z', capacity: 20, state: 'OPEN', examFormId: '', roomId: 'R1' },
];
const INVIGILATORS: ExamInvigilator[] = [
  { invigilatorId: 'iv1', invigilatorGcid: 'g-chief', rank: 'chief_invigilator' },
];
const INCIDENTS: ExamIncident[] = [
  { incidentId: 'in1', reportedByGcid: 'g1', kind: 'device_violation', narrative: 'phone out', occurredAtIso: '', candidateRef: '' },
];
const RESULT: ExamResultRecord = {
  resultId: 'r1', candidateRef: 'g-verified', rawScore: 15, maxScore: 20, passMark: 12, outcome: 'PASS', scoredAtIso: '',
};

function makeServiceMock() {
  return {
    getExam: vi.fn(() => of(EXAM)),
    listCandidates: vi.fn(() => of(CANDIDATES as readonly ExamCandidate[])),
    listForms: vi.fn(() => of(FORMS as readonly ExamForm[])),
    allocateCandidate: vi.fn(() => of(CANDIDATES[1])),
    verifyCandidate: vi.fn(() => of(CANDIDATES[0])),
    admitCandidate: vi.fn(() => of({ ...CANDIDATES[0], state: 'ADMITTED' as const })),
    verifyKyc: vi.fn(() =>
      of({ verificationId: 'v1', gcid: 'g-new', status: 'verified' as const, method: 'manual_doc', rejectionCode: '', retryAllowed: false }),
    ),
    rejectKyc: vi.fn(() =>
      of({ verificationId: 'v1', gcid: 'g-new', status: 'rejected' as const, method: 'manual_doc', rejectionCode: 'DOC_UNREADABLE', retryAllowed: true }),
    ),
    listSittings: vi.fn(() => of(SITTINGS as readonly ExamSittingRow[])),
    createSitting: vi.fn(() => of(SITTINGS[0])),
    sittingAction: vi.fn(() => of({ ...SITTINGS[0], state: 'IN_PROGRESS' as const })),
    listInvigilators: vi.fn(() => of(INVIGILATORS as readonly ExamInvigilator[])),
    assignInvigilator: vi.fn(() => of(INVIGILATORS[0])),
    removeInvigilator: vi.fn(() => of(INVIGILATORS[0])),
    listIncidents: vi.fn(() => of(INCIDENTS as readonly ExamIncident[])),
    fileIncident: vi.fn(() => of(INCIDENTS[0])),
    recordResult: vi.fn(() => of(RESULT)),
    listResults: vi.fn(() => of([RESULT] as readonly ExamResultRecord[])),
  };
}

function makeRbacMock(roles: string[], caps: string[] = []) {
  return {
    hasRole: (r: string) => roles.includes(r),
    hasCapability: (c: string) => caps.includes(c),
  };
}

async function setup(
  rbac: ReturnType<typeof makeRbacMock>,
  service = makeServiceMock(),
  tab?: string,
) {
  TestBed.configureTestingModule({
    imports: [ExamWorkspaceComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: ExamsService, useValue: service },
      { provide: RbacService, useValue: rbac },
    ],
  });
  const fixture = TestBed.createComponent(ExamWorkspaceComponent);
  fixture.componentRef.setInput('id', 'exam-1');
  if (tab) fixture.componentRef.setInput('tab', tab);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, service };
}

describe('ExamWorkspaceComponent', () => {
  let adminRbac: ReturnType<typeof makeRbacMock>;

  beforeEach(() => {
    adminRbac = makeRbacMock(['admin']);
  });

  it('loads the exam and renders its title + state for an admin', async () => {
    const { fixture, service } = await setup(adminRbac);
    expect(service.getExam).toHaveBeenCalledWith('exam-1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="exam-ws-title"]')?.textContent).toContain('CSPO');
    expect(el.querySelector('[data-testid="exam-ws-state"]')?.textContent).toContain('SCHEDULED');
  });

  it('shows the real allocated-candidate count in Overview, not exam.enrolledCount', async () => {
    // EXAM.enrolledCount is 7 but the CANDIDATES mock has 2 rows; the Overview
    // must reflect the allocated-candidate count against capacity (2 / 30).
    const { fixture, service } = await setup(adminRbac);
    expect(service.listCandidates).toHaveBeenCalledWith('exam-1'); // eager, not tab-gated
    const overview = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="exam-ws-overview"]');
    expect(overview?.textContent).toContain('2 / 30');
    expect(overview?.textContent).not.toContain('7 / 30');
  });

  it('renders the full admin tab set including form + results', async () => {
    const { fixture } = await setup(adminRbac);
    const el = fixture.nativeElement as HTMLElement;
    const tabIds = [...el.querySelectorAll('[role="tab"]')].map((b) => b.getAttribute('data-testid'));
    expect(tabIds).toContain('exam-ws-tab-form');
    expect(tabIds).toContain('exam-ws-tab-results');
    expect(tabIds).toContain('exam-ws-tab-candidates');
  });

  it('embargoes form + results tabs from a PROCTOR', async () => {
    const proctorRbac = makeRbacMock(['PROCTOR'], ['exam:sitting_check_in']);
    const { fixture } = await setup(proctorRbac);
    const el = fixture.nativeElement as HTMLElement;
    const tabIds = [...el.querySelectorAll('[role="tab"]')].map((b) => b.getAttribute('data-testid'));
    expect(tabIds).toContain('exam-ws-tab-candidates');
    expect(tabIds).not.toContain('exam-ws-tab-form');
    expect(tabIds).not.toContain('exam-ws-tab-results');
  });

  it('renders an unauthorized state for a viewer with no exam role', async () => {
    const { fixture, service } = await setup(makeRbacMock(['learner']));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="exam-ws-unauthorized"]')).toBeTruthy();
    // never fetches the exam for an unauthorized viewer's tab set, but still loads header
    expect(service.getExam).toHaveBeenCalled();
  });

  it('lazy-loads candidates when the candidates tab is active + admits a verified candidate', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'candidates');
    expect(service.listCandidates).toHaveBeenCalledWith('exam-1');
    const el = fixture.nativeElement as HTMLElement;
    const admitBtn = el.querySelector('[data-testid="exam-ws-admit-g-verified"]') as HTMLButtonElement;
    expect(admitBtn).toBeTruthy();
    admitBtn.click();
    expect(service.admitCandidate).toHaveBeenCalledWith('exam-1', 'g-verified');
  });

  it('offers Verify KYC / Reject KYC only for an ALLOCATED unverified candidate and verifies the KYC', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'candidates');
    const el = fixture.nativeElement as HTMLElement;
    const verifyKycBtn = el.querySelector('[data-testid="exam-ws-kyc-verify-g-new"]') as HTMLButtonElement;
    expect(verifyKycBtn).toBeTruthy();
    // NOT offered for the already-verified candidate (g-verified is ID_VERIFIED/VERIFIED)
    expect(el.querySelector('[data-testid="exam-ws-kyc-verify-g-verified"]')).toBeNull();
    verifyKycBtn.click();
    expect(service.verifyKyc).toHaveBeenCalledWith('g-new');
    // refreshes the roster (eager load + post-verify refresh) so the operator can then run candidate-verify → admit
    expect(service.listCandidates).toHaveBeenCalledTimes(2);
  });

  it('shows a benign "nothing to review" notice (not an error) on 409 KYC_INVALID_TRANSITION', async () => {
    const service = makeServiceMock();
    service.verifyKyc = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            409,
            { code: 'KYC_INVALID_TRANSITION', message: '', correlation_id: '' },
            { error: 'KYC_INVALID_TRANSITION', message: 'kyc is not in submitted state' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-kyc-verify-g-new"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const notice = el.querySelector('[data-testid="exam-ws-kyc-notice-g-new"]');
    expect(notice).toBeTruthy();
    // benign, not the scary raw error — rendered as a status, never role="alert"
    expect(notice?.getAttribute('role')).toBe('status');
  });

  it('rejects a KYC via the inline reject form (code + notes + retry)', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'candidates');
    const comp = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-kyc-reject-open-g-new"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    comp.kycRejectCode.set('DOC_UNREADABLE');
    comp.kycRejectNotes.set('blurry scan');
    comp.kycRejectRetry.set(true);
    fixture.detectChanges();
    (el.querySelector('[data-testid="exam-ws-kyc-reject-submit-g-new"]') as HTMLButtonElement).click();
    expect(service.rejectKyc).toHaveBeenCalledWith('g-new', {
      code: 'DOC_UNREADABLE',
      notes: 'blurry scan',
      retryAllowed: true,
    });
  });

  it('surfaces the raw BE message (role=alert) on a non-benign KYC failure', async () => {
    const service = makeServiceMock();
    service.verifyKyc = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            500,
            { code: 'INTERNAL', message: '', correlation_id: '' },
            { error: 'INTERNAL', message: 'identity upstream unavailable' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-kyc-verify-g-new"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const notice = el.querySelector('[data-testid="exam-ws-kyc-notice-g-new"]');
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(notice?.textContent).toContain('identity upstream unavailable');
  });

  it('cancels the inline KYC reject form without sending', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'candidates');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-kyc-reject-open-g-new"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="exam-ws-kyc-reject-form-g-new"]')).toBeTruthy();
    (el.querySelector('[data-testid="exam-ws-kyc-reject-cancel-g-new"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="exam-ws-kyc-reject-form-g-new"]')).toBeNull();
    expect(service.rejectKyc).not.toHaveBeenCalled();
  });

  it('surfaces the 403 refusal message on the offending row', async () => {
    const service = makeServiceMock();
    // Runtime shape: the errorInterceptor wraps failures into ApiError with the
    // raw delivery body ({error,message}) on `.body` — a plain {error:{…}} would
    // NOT reproduce the walk-caught generic-message bug.
    service.admitCandidate = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            403,
            { code: 'FORBIDDEN', message: '', correlation_id: '' },
            { error: 'Forbidden', message: 'admission refused' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-admit-g-verified"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="exam-ws-rowerror-g-verified"]')?.textContent).toContain(
      'admission refused',
    );
  });

  it('shows a 404 not-found state when the exam is missing', async () => {
    const service = makeServiceMock();
    service.getExam = vi.fn(() =>
      throwError(() => new ApiError(404, { code: 'NOT_FOUND', message: '', correlation_id: '' }, null)),
    );
    const { fixture } = await setup(adminRbac, service);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="exam-ws-notfound"]')).toBeTruthy();
  });

  it('Proctors tab: lists sittings + runs a state-appropriate action', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'proctors');
    expect(service.listSittings).toHaveBeenCalledWith('exam-1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="exam-ws-sitting-s1"]')).toBeTruthy();
    // OPEN sitting → begin/close/cancel; NOT open (already open)
    expect(el.querySelector('[data-testid="exam-ws-sitting-open-s1"]')).toBeNull();
    const begin = el.querySelector('[data-testid="exam-ws-sitting-begin-s1"]') as HTMLButtonElement;
    expect(begin).toBeTruthy();
    begin.click();
    expect(service.sittingAction).toHaveBeenCalledWith('exam-1', 's1', 'begin');
  });

  it('Proctors tab: selecting a sitting loads + shows its invigilators', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'proctors');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-sitting-manage-s1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.listInvigilators).toHaveBeenCalledWith('exam-1', 's1');
    expect(el.querySelector('[data-testid="exam-ws-invig-iv1"]')?.textContent).toContain('g-chief');
  });

  it('Incidents tab: selecting a sitting loads its incident trail', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'incidents');
    fixture.componentInstance.selectSitting('s1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.listIncidents).toHaveBeenCalledWith('exam-1', 's1');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="exam-ws-incident-in1"]')?.textContent).toContain('phone out');
  });

  it('Results tab: lists the recorded results roster (CHO-2104)', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'results');
    expect(service.listResults).toHaveBeenCalledWith('exam-1');
    const el = fixture.nativeElement as HTMLElement;
    const row = el.querySelector('[data-testid="exam-ws-result-r1"]');
    expect(row?.textContent).toContain('PASS');
    expect(row?.textContent).toContain('g-verified');
  });

  it('Results tab: records a result and shows the PASS/FAIL outcome', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'results');
    const comp = fixture.componentInstance;
    comp.resultFormId.set('f1');
    comp.resultCandidateRef.set('g-verified');
    comp.resultRawScore.set(15);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-result-record"]') as HTMLButtonElement).click();
    expect(service.recordResult).toHaveBeenCalledWith('exam-1', { formId: 'f1', candidateRef: 'g-verified', rawScore: 15 });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="exam-ws-result-outcome"]')?.textContent).toContain('PASS');
  });

  it('has no critical/serious accessibility violations (admin, candidates tab)', async () => {
    const { fixture } = await setup(adminRbac, makeServiceMock(), 'candidates');
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const blocking = results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''));
    expect(blocking).toEqual([]);
  });

  // ── Sitting create/action branches ──────────────────────────────────────
  it('Proctors tab: creates a sitting (RFC3339-widened window) and refreshes the list', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'proctors');
    const comp = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    comp.newSittingStartsAt.set('2026-07-20T09:00');
    comp.newSittingEndsAt.set('2026-07-20T10:30');
    comp.newSittingCapacity.set(20);
    fixture.detectChanges();
    (el.querySelector('[data-testid="exam-ws-sitting-create"]') as HTMLButtonElement).click();
    expect(service.createSitting).toHaveBeenCalledWith('exam-1', {
      startsAt: '2026-07-20T09:00:00Z',
      endsAt: '2026-07-20T10:30:00Z',
      capacity: 20,
    });
    // Success clears the form fields + refreshes the sittings list.
    expect(comp.newSittingStartsAt()).toBe('');
    expect(comp.newSittingEndsAt()).toBe('');
    expect(comp.newSittingCapacity()).toBeNull();
    expect(service.listSittings).toHaveBeenCalledTimes(2);
  });

  it('createSitting guards: missing/zero capacity or a zoned value pass-through', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'proctors');
    const comp = fixture.componentInstance;
    comp.newSittingStartsAt.set('2026-07-20T09:00');
    comp.newSittingEndsAt.set('2026-07-20T10:30');
    comp.newSittingCapacity.set(0); // falsy guard — no POST
    comp.createSitting();
    expect(service.createSitting).not.toHaveBeenCalled();
    // Already-zoned values pass through unchanged (no :00Z widening).
    comp.newSittingCapacity.set(20);
    comp.newSittingStartsAt.set('2026-07-20T09:00+08:00');
    comp.newSittingEndsAt.set('2026-07-20T10:30:00Z');
    comp.createSitting();
    expect(service.createSitting).toHaveBeenCalledWith('exam-1', {
      startsAt: '2026-07-20T09:00+08:00',
      endsAt: '2026-07-20T10:30:00Z',
      capacity: 20,
    });
  });

  it('createSitting surfaces the BE message fail-loud (form stays open)', async () => {
    const service = makeServiceMock();
    service.createSitting = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            409,
            { code: 'WINDOW_OVERLAP', message: '', correlation_id: '' },
            { error: 'Conflict', message: 'window overlaps an existing sitting' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'proctors');
    const comp = fixture.componentInstance;
    comp.newSittingStartsAt.set('2026-07-20T09:00');
    comp.newSittingEndsAt.set('2026-07-20T10:30');
    comp.newSittingCapacity.set(20);
    comp.createSitting();
    fixture.detectChanges();
    expect(comp.sittingError()).toContain('window overlaps an existing sitting');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="exam-ws-sitting-error"]')
        ?.textContent,
    ).toContain('window overlaps an existing sitting');
  });

  it('runSittingAction surfaces the BE message on failure and clears busy', async () => {
    const service = makeServiceMock();
    service.sittingAction = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            403,
            { code: 'FORBIDDEN', message: '', correlation_id: '' },
            { error: 'Forbidden', message: 'sitting is no longer open' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'proctors');
    const comp = fixture.componentInstance;
    comp.runSittingAction('s1', 'begin');
    fixture.detectChanges();
    expect(comp.sittingError()).toContain('sitting is no longer open');
    expect(comp.sittingBusy()).toBe('');
  });

  it('runSittingAction ignores a second call while one is in flight', async () => {
    const service = makeServiceMock();
    service.sittingAction = vi.fn(() => new Observable(() => { /* noop */ })); // never resolves
    const { fixture } = await setup(adminRbac, service, 'proctors');
    const comp = fixture.componentInstance;
    comp.runSittingAction('s1', 'begin');
    expect(comp.sittingBusy()).toBe('s1');
    comp.runSittingAction('s1', 'cancel'); // busy guard → early return
    expect(service.sittingAction).toHaveBeenCalledTimes(1);
  });

  // ── Invigilator assign/remove branches ──────────────────────────────────
  it('Proctors tab: assigns an invigilator (gcid + rank) and refreshes the list', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'proctors');
    const comp = fixture.componentInstance;
    comp.selectSitting('s1');
    comp.newInvigilatorGcid.set('g-chief-new');
    comp.newInvigilatorRank.set('chief_invigilator');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-invig-assign"]') as HTMLButtonElement).click();
    expect(service.assignInvigilator).toHaveBeenCalledWith('exam-1', 's1', 'g-chief-new', 'chief_invigilator');
    expect(comp.newInvigilatorGcid()).toBe('');
    expect(service.listInvigilators).toHaveBeenCalledWith('exam-1', 's1');
  });

  it('assignInvigilator guards: no sitting or blank gcid fires no POST; error surfaces', async () => {
    const service = makeServiceMock();
    service.assignInvigilator = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            400,
            { code: 'INVIGILATOR_NOT_FOUND', message: '', correlation_id: '' },
            { error: 'Bad Request', message: 'no matching learner' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'proctors');
    const comp = fixture.componentInstance;
    comp.newInvigilatorGcid.set('g-x');
    comp.assignInvigilator(); // no selected sitting
    expect(service.assignInvigilator).not.toHaveBeenCalled();
    comp.selectSitting('s1');
    comp.newInvigilatorGcid.set('g-missing');
    comp.assignInvigilator();
    fixture.detectChanges();
    expect(service.assignInvigilator).toHaveBeenCalledWith('exam-1', 's1', 'g-missing', 'invigilator');
    expect(comp.sittingError()).toContain('no matching learner');
  });

  it('Proctors tab: removes an invigilator from the selected sitting', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'proctors');
    fixture.componentInstance.selectSitting('s1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-invig-remove-iv1"]') as HTMLButtonElement).click();
    expect(service.removeInvigilator).toHaveBeenCalledWith('exam-1', 's1', 'iv1');
    expect(service.listInvigilators).toHaveBeenCalled();
  });

  // ── Incident filing branches ────────────────────────────────────────────
  it('Incidents tab: files an incident (kind + narrative + optional candidate ref)', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'incidents');
    const comp = fixture.componentInstance;
    comp.selectSitting('s1');
    comp.newIncidentKind.set('device_violation');
    comp.newIncidentNarrative.set('phone out');
    comp.newIncidentCandidateRef.set('g-verified');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-incident-file"]') as HTMLButtonElement).click();
    expect(service.fileIncident).toHaveBeenCalledWith('exam-1', 's1', {
      kind: 'device_violation',
      narrative: 'phone out',
      candidateRef: 'g-verified',
    });
    // Success clears the narrative/ref and refreshes the incident trail.
    expect(comp.newIncidentNarrative()).toBe('');
    expect(comp.newIncidentCandidateRef()).toBe('');
    expect(service.listIncidents).toHaveBeenCalledWith('exam-1', 's1');
  });

  it('fileIncident omits an empty candidate ref and surfaces a fail-loud error', async () => {
    const service = makeServiceMock();
    service.fileIncident = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            409,
            { code: 'SITTING_CLOSED', message: '', correlation_id: '' },
            { error: 'Conflict', message: 'sitting already closed' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'incidents');
    const comp = fixture.componentInstance;
    comp.selectSitting('s1');
    comp.newIncidentNarrative.set('narrative');
    comp.newIncidentCandidateRef.set('   '); // blank → undefined in the payload
    comp.fileIncident();
    expect(service.fileIncident).toHaveBeenCalledWith('exam-1', 's1', {
      kind: 'other',
      narrative: 'narrative',
      candidateRef: undefined,
    });
    fixture.detectChanges();
    expect(comp.sittingError()).toContain('sitting already closed');
    // Blank narrative guard → no POST.
    service.fileIncident.mockClear();
    comp.newIncidentNarrative.set('');
    comp.fileIncident();
    expect(service.fileIncident).not.toHaveBeenCalled();
  });

  // ── Result-record band ──────────────────────────────────────────────────
  it('Results tab: guards an incomplete result form and surfaces a fail-loud error', async () => {
    const service = makeServiceMock();
    service.recordResult = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            409,
            { code: 'DUPLICATE_RESULT', message: '', correlation_id: '' },
            { error: 'Conflict', message: 'result already recorded for that candidate' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'results');
    const comp = fixture.componentInstance;
    comp.recordResult(); // empty form → no POST
    expect(service.recordResult).not.toHaveBeenCalled();
    comp.resultFormId.set('f1');
    comp.resultCandidateRef.set('g-verified');
    comp.resultRawScore.set(15);
    comp.recordResult();
    fixture.detectChanges();
    expect(service.recordResult).toHaveBeenCalledWith('exam-1', { formId: 'f1', candidateRef: 'g-verified', rawScore: 15 });
    expect(comp.resultError()).toContain('result already recorded for that candidate');
    // Negative raw score guard → no POST.
    service.recordResult.mockClear();
    comp.resultRawScore.set(-1);
    comp.recordResult();
    expect(service.recordResult).not.toHaveBeenCalled();
  });

  // ── Allocation / row-action branches ────────────────────────────────────
  it('allocates a candidate from the allocate form (success clears + refreshes)', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'candidates');
    const comp = fixture.componentInstance;
    comp.newCandidateGcid.set('g-fresh');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-allocate-cta"]') as HTMLButtonElement).click();
    expect(service.allocateCandidate).toHaveBeenCalledWith('exam-1', 'g-fresh');
    expect(comp.newCandidateGcid()).toBe('');
    expect(comp.allocateError()).toBe('');
  });

  it('allocateCandidate: blank-gcid guard fires no POST; a failure surfaces fail-loud', async () => {
    const service = makeServiceMock();
    service.allocateCandidate = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            400,
            { code: 'USER_NOT_FOUND', message: '', correlation_id: '' },
            { error: 'Bad Request', message: 'no such learner gcid' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const comp = fixture.componentInstance;
    comp.allocateCandidate(); // empty gcid
    expect(service.allocateCandidate).not.toHaveBeenCalled();
    comp.newCandidateGcid.set('g-ghost');
    comp.allocateCandidate();
    fixture.detectChanges();
    expect(comp.allocateError()).toContain('no such learner gcid');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="exam-ws-allocate-error"]')
        ?.textContent,
    ).toContain('no such learner gcid');
  });

  it('verify-candidate completes the row action and refreshes the roster', async () => {
    const { fixture, service } = await setup(adminRbac, makeServiceMock(), 'candidates');
    const el = fixture.nativeElement as HTMLElement;
    // The claim-resolve verify button renders per ALLOCATED row (not ID_VERIFIED).
    (el.querySelector('[data-testid="exam-ws-verify-g-new"]') as HTMLButtonElement).click();
    expect(service.verifyCandidate).toHaveBeenCalledWith('exam-1', 'g-new');
    expect(service.listCandidates).toHaveBeenCalled();
  });

  it('row-action failures fall back to the Error message / default text', async () => {
    const service = makeServiceMock();
    service.admitCandidate = vi.fn(() => throwError(() => new Error('boom')));
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const comp = fixture.componentInstance;
    comp.admitCandidate('g-verified');
    fixture.detectChanges();
    expect(comp.rowError()?.message).toBe('boom');
    service.admitCandidate.mockReturnValueOnce(throwError(() => 'opaque'));
    comp.admitCandidate('g-verified');
    fixture.detectChanges();
    expect(comp.rowError()?.message).toBe('request failed');
  });

  it('row-action failures surface a STRING response body verbatim', async () => {
    const service = makeServiceMock();
    service.admitCandidate = vi.fn(() =>
      throwError(() => new ApiError(502, { code: 'UPSTREAM', message: '', correlation_id: '' }, 'plain upstream text')),
    );
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const comp = fixture.componentInstance;
    comp.admitCandidate('g-verified');
    fixture.detectChanges();
    expect(comp.rowError()?.message).toBe('plain upstream text');
  });

  it('row-action failures fall back to the flat {error} field when no message exists', async () => {
    const service = makeServiceMock();
    service.admitCandidate = vi.fn(() =>
      throwError(() => new ApiError(500, { code: 'INTERNAL', message: '', correlation_id: '' }, { error: 'FlatOnly' })),
    );
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const comp = fixture.componentInstance;
    comp.admitCandidate('g-verified');
    fixture.detectChanges();
    expect(comp.rowError()?.message).toBe('FlatOnly');
  });

  it('re-entrancy: a second row action while one is in flight is ignored', async () => {
    const service = makeServiceMock();
    service.verifyCandidate = vi.fn(() => new Observable(() => { /* noop */ })); // never resolves
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const comp = fixture.componentInstance;
    comp.verifyCandidate('g-new');
    expect(comp.actingGcid()).toBe('g-new');
    comp.admitCandidate('g-verified'); // busy guard → early return
    expect(service.admitCandidate).not.toHaveBeenCalled();
    expect(service.verifyCandidate).toHaveBeenCalledTimes(1);
  });

  it('re-entrancy: verifyKyc + submitKycReject are ignored while a KYC op is in flight', async () => {
    const service = makeServiceMock();
    service.verifyKyc = vi.fn(() => new Observable(() => { /* noop */ })); // in flight forever
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const comp = fixture.componentInstance;
    comp.verifyKyc('g-new');
    expect(comp.kycActingGcid()).toBe('g-new');
    comp.verifyKyc('g-new'); // guard → no second call
    expect(service.verifyKyc).toHaveBeenCalledTimes(1);
    comp.submitKycReject('g-new'); // busy guard → rejectKyc never fires
    expect(service.rejectKyc).not.toHaveBeenCalled();
  });

  it('surfaces the raw BE message on a non-benign KYC REJECT failure (role=alert)', async () => {
    const service = makeServiceMock();
    service.rejectKyc = vi.fn(() =>
      throwError(
        () =>
          new ApiError(
            500,
            { code: 'INTERNAL', message: '', correlation_id: '' },
            { error: 'Internal', message: 'kyc store unavailable' },
          ),
      ),
    );
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const comp = fixture.componentInstance;
    comp.kycRejectCode.set('DOC_UNREADABLE');
    comp.submitKycReject('g-new');
    fixture.detectChanges();
    const notice = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="exam-ws-kyc-notice-g-new"]',
    );
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(comp.kycNotice()?.kind).toBe('raw');
    expect(notice?.textContent).toContain('kyc store unavailable');
  });

  it('maps a non-success exam state for the public exam() projection', async () => {
    const service = makeServiceMock();
    service.getExam = vi.fn(() =>
      throwError(() => new ApiError(500, { code: 'INTERNAL', message: '', correlation_id: '' }, null)),
    );
    const { fixture } = await setup(adminRbac, service);
    expect(fixture.componentInstance.exam()).toBeNull();
  });

  // ── Tab navigation + roving keyboard ────────────────────────────────────
  it('selects a tab by writing the ?tab= query param (URL-synced)', async () => {
    const { fixture } = await setup(adminRbac);
    const router = TestBed.inject(Router);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-tab-form"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(router.url).toContain('tab=form');
  });

  it('roving-tabindex keyboard nav: arrows wrap, Home/End jump, unknown keys no-op', async () => {
    const { fixture } = await setup(adminRbac);
    const comp = fixture.componentInstance;
    const selectSpy = vi.spyOn(comp, 'selectTab');
    comp.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }), 0);
    expect(selectSpy).toHaveBeenCalledWith('form');
    comp.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }), 0);
    expect(selectSpy).toHaveBeenCalledWith('results'); // wraps to the last of 6
    comp.onTabKeydown(new KeyboardEvent('keydown', { key: 'Home', cancelable: true }), 3);
    expect(selectSpy).toHaveBeenCalledWith('overview');
    comp.onTabKeydown(new KeyboardEvent('keydown', { key: 'End', cancelable: true }), 0);
    expect(selectSpy).toHaveBeenCalledWith('results');
    comp.onTabKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }), 1);
    expect(selectSpy).toHaveBeenCalledTimes(4);
  });

  it('keyboard nav on an empty tab set (unauthorized viewer) is a no-op', async () => {
    const { fixture } = await setup(makeRbacMock(['learner']));
    const comp = fixture.componentInstance;
    const selectSpy = vi.spyOn(comp, 'selectTab');
    comp.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }), 0);
    expect(selectSpy).not.toHaveBeenCalled();
  });

  // ── Presentation badge helpers ──────────────────────────────────────────
  it('badge helpers map every state to the design-system variant', async () => {
    const { fixture } = await setup(adminRbac);
    const c = fixture.componentInstance;
    expect(c.examStateBadge('OPEN')).toBe('badge-success');
    expect(c.examStateBadge('CLOSED')).toBe('badge-neutral');
    expect(c.examStateBadge('GRADED')).toBe('badge-neutral');
    expect(c.examStateBadge('SCHEDULED')).toBe('badge-info');
    expect(c.candidateStateBadge('ADMITTED')).toBe('badge-success');
    expect(c.candidateStateBadge('ID_VERIFIED')).toBe('badge-info');
    expect(c.candidateStateBadge('REJECTED')).toBe('badge-warning');
    expect(c.candidateStateBadge('WITHDRAWN')).toBe('badge-warning');
    expect(c.candidateStateBadge('ALLOCATED')).toBe('badge-neutral');
    expect(c.verificationBadge('VERIFIED')).toBe('badge-success');
    expect(c.verificationBadge('UNVERIFIED')).toBe('badge-warning');
    expect(c.sittingStateBadge('OPEN')).toBe('badge-success');
    expect(c.sittingStateBadge('IN_PROGRESS')).toBe('badge-success');
    expect(c.sittingStateBadge('CLOSED')).toBe('badge-neutral');
    expect(c.sittingStateBadge('CANCELLED')).toBe('badge-warning');
    expect(c.sittingStateBadge('SCHEDULED')).toBe('badge-info');
    expect(c.outcomeBadge('PASS')).toBe('badge-success');
    expect(c.outcomeBadge('FAIL')).toBe('badge-warning');
  });

  // ── Load-everything error paths ─────────────────────────────────────────
  it('maps a non-404 exam load failure to the generic error state (not not-found)', async () => {
    const service = makeServiceMock();
    service.getExam = vi.fn(() =>
      throwError(() => new ApiError(500, { code: 'INTERNAL', message: '', correlation_id: '' }, null)),
    );
    const { fixture } = await setup(adminRbac, service);
    const comp = fixture.componentInstance;
    expect(comp.isError()).toBe(true);
    expect(comp.isNotFound()).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="exam-ws-error"]'),
    ).toBeTruthy();
  });

  it('maps a candidates load failure to the candidates error state', async () => {
    const service = makeServiceMock();
    service.listCandidates = vi.fn(() => throwError(() => new Error('boom')));
    const { fixture } = await setup(adminRbac, service);
    expect(fixture.componentInstance.candidatesState().status).toBe('error');
  });

  it('maps a forms load failure to the forms error state', async () => {
    const service = makeServiceMock();
    service.listForms = vi.fn(() => throwError(() => new Error('boom')));
    const { fixture } = await setup(adminRbac, service, 'form');
    const comp = fixture.componentInstance;
    expect(comp.formsState().status).toBe('error');
    expect(comp.forms()).toEqual([]); // non-success projection
  });

  it('maps a sittings load failure to the sittings error state', async () => {
    const service = makeServiceMock();
    service.listSittings = vi.fn(() => throwError(() => new Error('boom')));
    const { fixture } = await setup(adminRbac, service, 'proctors');
    expect(fixture.componentInstance.sittingsState().status).toBe('error');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="exam-ws-sittings-error"]'),
    ).toBeTruthy();
  });

  it('maps an invigilators load failure to the invigilators error state', async () => {
    const service = makeServiceMock();
    service.listInvigilators = vi.fn(() => throwError(() => new Error('boom')));
    const { fixture } = await setup(adminRbac, service, 'proctors');
    fixture.componentInstance.selectSitting('s1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.invigilatorsState().status).toBe('error');
  });

  it('maps an incidents load failure to the incidents error state', async () => {
    const service = makeServiceMock();
    service.listIncidents = vi.fn(() => throwError(() => new Error('boom')));
    const { fixture } = await setup(adminRbac, service, 'incidents');
    fixture.componentInstance.selectSitting('s1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.incidentsState().status).toBe('error');
  });

  it('maps a results roster load failure to the results error state', async () => {
    const service = makeServiceMock();
    service.listResults = vi.fn(() => throwError(() => new Error('boom')));
    const { fixture } = await setup(adminRbac, service, 'results');
    expect(fixture.componentInstance.resultsListState().status).toBe('error');
  });

  it('treats a 404 KYC verify as a benign nothing-pending notice (status, not alert)', async () => {
    const service = makeServiceMock();
    service.verifyKyc = vi.fn(() =>
      throwError(() => new ApiError(404, { code: 'NOT_FOUND', message: '', correlation_id: '' }, null)),
    );
    const { fixture } = await setup(adminRbac, service, 'candidates');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="exam-ws-kyc-verify-g-new"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const notice = el.querySelector('[data-testid="exam-ws-kyc-notice-g-new"]');
    expect(notice?.getAttribute('role')).toBe('status');
    // KycNotice is a discriminated union and messageKey lives only on the
    // 'key' arm, so narrow before reading it rather than asserting the kind
    // in a separate statement, which does not narrow.
    const kycNotice = fixture.componentInstance.kycNotice();
    expect(kycNotice?.kind).toBe('key');
    if (kycNotice?.kind !== 'key') {
      throw new Error(`expected a key notice, got ${JSON.stringify(kycNotice)}`);
    }
    expect(kycNotice.messageKey).toContain('none_pending');
  });
});
