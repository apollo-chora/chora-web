import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ExamsService } from './exams.service';
import { environment } from '../../../../../environments/environment';

const EXAM_ID = '719e9e93-dbc4-4a87-9eac-18b4fac9fd6e';
const GCID = '00000000-0000-7000-8000-000000001999';
const BASE = `${environment.bffBaseUrl}/api/v1/exams/${EXAM_ID}`;

describe('ExamsService — exam workspace (W4 drill-down)', () => {
  let service: ExamsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExamsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getExam GETs /api/v1/exams/{id} and maps to ExamDetail', async () => {
    const promise = firstValueFrom(service.getExam(EXAM_ID));
    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/exams/${EXAM_ID}`);
    expect(req.request.method).toBe('GET');
    req.flush({
      id: EXAM_ID,
      title: 'CSPO Certification',
      course_id: 'course-1',
      scheduled_at: '2026-07-15T09:00:00Z',
      duration_minutes: 90,
      capacity: 30,
      enrolled_count: 4,
      state: 'SCHEDULED',
      proctor_method: 'PROCTOR_METHOD_HUMAN_LIVE',
    });
    const exam = await promise;
    expect(exam.examId).toBe(EXAM_ID);
    expect(exam.title).toBe('CSPO Certification');
    expect(exam.state).toBe('SCHEDULED');
    expect(exam.durationMinutes).toBe(90);
    expect(exam.scheduledLabel).not.toBe('');
  });

  it('listCandidates GETs {id}/candidates and maps the {items} envelope', async () => {
    const promise = firstValueFrom(service.listCandidates(EXAM_ID));
    const req = httpMock.expectOne(`${BASE}/candidates`);
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        { id: 'c1', gcid: GCID, state: 'ADMITTED', verification_status: 'VERIFIED', created_at: '2026-07-10T03:18:06Z' },
        { id: 'c2', gcid: 'g2', state: 'ALLOCATED', verification_status: 'UNVERIFIED' },
      ],
    });
    const rows = await promise;
    expect(rows.length).toBe(2);
    expect(rows[0].state).toBe('ADMITTED');
    expect(rows[0].verificationStatus).toBe('VERIFIED');
    expect(rows[1].state).toBe('ALLOCATED');
    expect(rows[1].verificationStatus).toBe('UNVERIFIED');
  });

  it('allocateCandidate POSTs {gcid} to {id}/candidates', async () => {
    const promise = firstValueFrom(service.allocateCandidate(EXAM_ID, GCID));
    const req = httpMock.expectOne(`${BASE}/candidates`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ gcid: GCID });
    req.flush({ id: 'c1', gcid: GCID, state: 'ALLOCATED', verification_status: 'UNVERIFIED' });
    const c = await promise;
    expect(c.gcid).toBe(GCID);
    expect(c.state).toBe('ALLOCATED');
  });

  it('verifyCandidate POSTs to {id}/candidates/{gcid}/verify', async () => {
    const promise = firstValueFrom(service.verifyCandidate(EXAM_ID, GCID));
    const req = httpMock.expectOne(`${BASE}/candidates/${GCID}/verify`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'c1', gcid: GCID, state: 'ID_VERIFIED', verification_status: 'VERIFIED' });
    const c = await promise;
    expect(c.state).toBe('ID_VERIFIED');
  });

  it('admitCandidate POSTs to {id}/candidates/{gcid}/admit', async () => {
    const promise = firstValueFrom(service.admitCandidate(EXAM_ID, GCID));
    const req = httpMock.expectOne(`${BASE}/candidates/${GCID}/admit`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'c1', gcid: GCID, state: 'ADMITTED', verification_status: 'VERIFIED' });
    const c = await promise;
    expect(c.state).toBe('ADMITTED');
  });

  // ── Admin KYC review (manual-doc prerequisite — CHO-2103 FE) ─────────────
  // Person-scoped (NOT exam-scoped): POST /api/v1/admin/kyc/{gcid}/{verify|reject}.

  it('verifyKyc POSTs {} to /api/v1/admin/kyc/{gcid}/verify and maps the result', async () => {
    const promise = firstValueFrom(service.verifyKyc(GCID));
    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/admin/kyc/${GCID}/verify`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ verification_id: 'v1', gcid: GCID, status: 'verified', method: 'manual_doc' });
    const res = await promise;
    expect(res.verificationId).toBe('v1');
    expect(res.status).toBe('verified');
    expect(res.method).toBe('manual_doc');
    expect(res.retryAllowed).toBe(false);
  });

  it('rejectKyc POSTs the snake_case body to /api/v1/admin/kyc/{gcid}/reject and maps the rejection', async () => {
    const promise = firstValueFrom(
      service.rejectKyc(GCID, { code: 'DOC_UNREADABLE', notes: 'blurry scan', retryAllowed: true }),
    );
    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/admin/kyc/${GCID}/reject`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: 'DOC_UNREADABLE', notes: 'blurry scan', retry_allowed: true });
    req.flush({
      verification_id: 'v1',
      gcid: GCID,
      status: 'rejected',
      method: 'manual_doc',
      rejection_code: 'DOC_UNREADABLE',
      retry_allowed: true,
    });
    const res = await promise;
    expect(res.status).toBe('rejected');
    expect(res.rejectionCode).toBe('DOC_UNREADABLE');
    expect(res.retryAllowed).toBe(true);
  });

  it('listForms GETs {id}/forms and maps items + cut score', async () => {
    const promise = firstValueFrom(service.listForms(EXAM_ID));
    const req = httpMock.expectOne(`${BASE}/forms`);
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        {
          id: 'f1',
          exam_id: EXAM_ID,
          item_bank_id: 'bank-1',
          state: 'ASSEMBLED',
          items: [
            { item_id: 'i2', atom_revision_id: 'r2', position: 2 },
            { item_id: 'i1', atom_revision_id: 'r1', position: 1 },
          ],
          cut_score: { mode: 'RAW', max_score: 20, pass_mark: 12, percent: 60 },
        },
      ],
    });
    const forms = await promise;
    expect(forms.length).toBe(1);
    expect(forms[0].itemCount).toBe(2);
    // items are position-sorted
    expect(forms[0].items.map((i) => i.position)).toEqual([1, 2]);
    expect(forms[0].cutScore?.passMark).toBe(12);
  });

  // ── Sittings / Invigilators / Incidents / Results (slice 2) ──────────────

  it('listSittings GETs {id}/sittings and maps the {items} envelope', async () => {
    const promise = firstValueFrom(service.listSittings(EXAM_ID));
    const req = httpMock.expectOne(`${BASE}/sittings`);
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        { id: 's1', starts_at: '2026-07-20T09:00:00Z', ends_at: '2026-07-20T10:30:00Z', capacity: 20, state: 'OPEN', room_id: 'R1' },
      ],
    });
    const rows = await promise;
    expect(rows.length).toBe(1);
    expect(rows[0].sittingId).toBe('s1');
    expect(rows[0].state).toBe('OPEN');
    expect(rows[0].roomId).toBe('R1');
  });

  it('createSitting POSTs the snake_case body to {id}/sittings', async () => {
    const promise = firstValueFrom(
      service.createSitting(EXAM_ID, { startsAt: '2026-07-20T09:00:00Z', endsAt: '2026-07-20T10:30:00Z', capacity: 20 }),
    );
    const req = httpMock.expectOne(`${BASE}/sittings`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ starts_at: '2026-07-20T09:00:00Z', ends_at: '2026-07-20T10:30:00Z', capacity: 20 });
    req.flush({ id: 's1', starts_at: '2026-07-20T09:00:00Z', ends_at: '2026-07-20T10:30:00Z', capacity: 20, state: 'SCHEDULED' });
    expect((await promise).state).toBe('SCHEDULED');
  });

  it('sittingAction POSTs to {id}/sittings/{sid}/{action}', async () => {
    const promise = firstValueFrom(service.sittingAction(EXAM_ID, 's1', 'open'));
    const req = httpMock.expectOne(`${BASE}/sittings/s1/open`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 's1', starts_at: '', ends_at: '', capacity: 20, state: 'OPEN' });
    expect((await promise).state).toBe('OPEN');
  });

  it('listInvigilators GETs the roster and preserves lowercase rank', async () => {
    const promise = firstValueFrom(service.listInvigilators(EXAM_ID, 's1'));
    const req = httpMock.expectOne(`${BASE}/sittings/s1/invigilators`);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [{ id: 'iv1', invigilator_gcid: 'g1', rank: 'chief_invigilator' }] });
    const rows = await promise;
    expect(rows[0].rank).toBe('chief_invigilator');
    expect(rows[0].invigilatorGcid).toBe('g1');
  });

  it('assignInvigilator POSTs invigilator_gcid + rank', async () => {
    const promise = firstValueFrom(service.assignInvigilator(EXAM_ID, 's1', 'g1', 'observer'));
    const req = httpMock.expectOne(`${BASE}/sittings/s1/invigilators`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ invigilator_gcid: 'g1', rank: 'observer' });
    req.flush({ id: 'iv1', invigilator_gcid: 'g1', rank: 'observer' });
    expect((await promise).rank).toBe('observer');
  });

  it('removeInvigilator DELETEs .../invigilators/{id}', async () => {
    const promise = firstValueFrom(service.removeInvigilator(EXAM_ID, 's1', 'iv1'));
    const req = httpMock.expectOne(`${BASE}/sittings/s1/invigilators/iv1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ id: 'iv1', invigilator_gcid: 'g1', rank: 'invigilator' });
    expect((await promise).invigilatorId).toBe('iv1');
  });

  it('listIncidents GETs the sitting audit trail', async () => {
    const promise = firstValueFrom(service.listIncidents(EXAM_ID, 's1'));
    const req = httpMock.expectOne(`${BASE}/sittings/s1/incidents`);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [{ id: 'in1', reported_by_gcid: 'g1', kind: 'device_violation', narrative: 'phone out', occurred_at: '2026-07-20T09:15:00Z' }] });
    const rows = await promise;
    expect(rows[0].kind).toBe('device_violation');
    expect(rows[0].narrative).toBe('phone out');
  });

  it('fileIncident POSTs kind + narrative (+ candidate_ref)', async () => {
    const promise = firstValueFrom(
      service.fileIncident(EXAM_ID, 's1', { kind: 'medical_emergency', narrative: 'fainted', candidateRef: GCID }),
    );
    const req = httpMock.expectOne(`${BASE}/sittings/s1/incidents`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ kind: 'medical_emergency', narrative: 'fainted', candidate_ref: GCID });
    req.flush({ id: 'in1', reported_by_gcid: 'g1', kind: 'medical_emergency', narrative: 'fainted' });
    expect((await promise).kind).toBe('medical_emergency');
  });

  it('recordResult POSTs to {id}/results and maps outcome', async () => {
    const promise = firstValueFrom(
      service.recordResult(EXAM_ID, { formId: 'f1', candidateRef: GCID, rawScore: 15 }),
    );
    const req = httpMock.expectOne(`${BASE}/results`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ form_id: 'f1', candidate_ref: GCID, raw_score: 15 });
    req.flush({ id: 'r1', candidate_ref: GCID, raw_score: 15, max_score: 20, pass_mark: 12, outcome: 'PASS', scored_at: '2026-07-20T11:00:00Z' });
    const res = await promise;
    expect(res.outcome).toBe('PASS');
    expect(res.passMark).toBe(12);
  });

  it('listResults GETs {id}/results and maps the roster (pass_mark omitted -> 0)', async () => {
    const promise = firstValueFrom(service.listResults(EXAM_ID));
    const req = httpMock.expectOne(`${BASE}/results`);
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        { id: 'r1', candidate_ref: GCID, raw_score: 15, max_score: 20, outcome: 'PASS', scored_at: '2026-07-20T11:00:00Z' },
        { id: 'r2', candidate_ref: 'g2', raw_score: 8, max_score: 20, outcome: 'FAIL' },
      ],
    });
    const rows = await promise;
    expect(rows.length).toBe(2);
    expect(rows[0].outcome).toBe('PASS');
    expect(rows[0].passMark).toBe(0); // roster omits pass_mark → mapper defaults 0
    expect(rows[1].outcome).toBe('FAIL');
  });
});
