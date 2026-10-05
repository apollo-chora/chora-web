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

const URL = `${environment.bffBaseUrl}/api/v1/exams`;

describe('ExamsService (real BFF wiring)', () => {
  let service: ExamsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExamsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs /api/v1/exams on the BFF', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [] });

    const list = await promise;
    expect(list.totalSittings).toBe(0);
    expect(list.sittings).toEqual([]);
  });

  it('renders empty list with totalSittings=0 when BE returns no items', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());
    httpMock.expectOne(URL).flush({ items: [] });

    const list = await promise;
    expect(list.totalSittings).toBe(0);
    expect(list.sittings).toHaveLength(0);
  });

  it('maps BE exam → ExamSitting with BE → FE field translation', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());

    httpMock.expectOne(URL).flush({
      items: [
        {
          id: 'exam-cspo-001',
          tenant_id: 'tenant-001',
          course_id: 'course-cspo',
          title: 'Certified Scrum Product Owner',
          scheduled_at: '2026-06-12T09:00:00Z',
          duration_minutes: 120,
          capacity: 30,
          enrolled_count: 22,
          proctor_method: 'ROOM:Exam Lab A',
          state: 'OPEN',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-20T00:00:00Z',
        },
      ],
    });

    const list = await promise;
    expect(list.totalSittings).toBe(1);
    const s = list.sittings[0]!;
    expect(s.sittingId).toBe('exam-cspo-001');
    expect(s.certTitle).toBe('Certified Scrum Product Owner');
    // R6 D1: certCode is DROPPED, not blanked. No cert short-code exists
    // anywhere in chora-delivery (the exam DTO at exam_handler.go:210-229 has
    // no such field, and no read serves one), so a field that can only ever be
    // '' is a column promising data the wire cannot carry.
    expect('certCode' in s).toBe(false);
    expect(s.dateIso).toBe('2026-06-12');
    expect(s.dateLabel).toBe('12 Jun 2026');
    expect(s.venue).toBe('ROOM:Exam Lab A');
    expect(s.capacity).toBe(30);
    expect(s.registered).toBe(22);
    // R6 D1: proctor is DROPPED. The exam DTO carries no proctor, and the only
    // invigilator read serves `invigilator_gcid` + `rank` with NO name, so
    // there is no name to show and a GCID is not one.
    expect('proctor' in s).toBe(false);
    expect(s.status).toBe('Open for registration');
    // R6 D1: skillsFutureAligned is DROPPED. It was hardcoded true, painting
    // the badge on every sitting in every tenant. The data exists as
    // Course.SFEligible but no read joins it onto an exam, so it is absent
    // rather than faked (the missing read is reported, not built, under R6).
    expect('skillsFutureAligned' in s).toBe(false);
  });

  it('coerces missing optional fields to safe defaults', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());

    httpMock.expectOne(URL).flush({
      items: [
        {
          id: 'exam-min',
          title: 'Minimal Exam',
        },
      ],
    });

    const list = await promise;
    const s = list.sittings[0]!;
    expect(s.sittingId).toBe('exam-min');
    expect(s.certTitle).toBe('Minimal Exam');
    expect(s.dateIso).toBe('');
    expect(s.dateLabel).toBe('');
    expect(s.venue).toBe('');
    expect(s.capacity).toBe(0);
    expect(s.registered).toBe(0);
    // R6 D1: proctor is DROPPED. The exam DTO carries no proctor, and the only
    // invigilator read serves `invigilator_gcid` + `rank` with NO name, so
    // there is no name to show and a GCID is not one.
    expect('proctor' in s).toBe(false);
    // missing state defaults to Scheduled (forward-compat with PUBLISHED)
    expect(s.status).toBe('Scheduled');
    // R6 D1: skillsFutureAligned is DROPPED. It was hardcoded true, painting
    // the badge on every sitting in every tenant. The data exists as
    // Course.SFEligible but no read joins it onto an exam, so it is absent
    // rather than faked (the missing read is reported, not built, under R6).
    expect('skillsFutureAligned' in s).toBe(false);
  });

  it('coerces missing items field to empty list (defensive)', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());
    // BE always emits {items: []} but the adapter tolerates a stray
    // {} response (e.g. mis-shaped staging fixture) without throwing.
    httpMock.expectOne(URL).flush({});

    const list = await promise;
    expect(list.totalSittings).toBe(0);
    expect(list.sittings).toEqual([]);
  });

  describe('BE state → FE SittingStatus mapping', () => {
    async function statusFor(state: string): Promise<string> {
      const promise = firstValueFrom(service.getUpcomingSittings());
      httpMock.expectOne(URL).flush({
        items: [{ id: 'e1', title: 'T', state }],
      });
      const list = await promise;
      return list.sittings[0]!.status;
    }

    it('OPEN → Open for registration', async () => {
      expect(await statusFor('OPEN')).toBe('Open for registration');
    });

    it('CLOSED → Closed', async () => {
      expect(await statusFor('CLOSED')).toBe('Closed');
    });

    it('GRADED → Closed', async () => {
      expect(await statusFor('GRADED')).toBe('Closed');
    });

    it('DRAFT → Scheduled', async () => {
      expect(await statusFor('DRAFT')).toBe('Scheduled');
    });

    it('SCHEDULED → Scheduled', async () => {
      expect(await statusFor('SCHEDULED')).toBe('Scheduled');
    });

    it('PUBLISHED (forward-compat) → Scheduled', async () => {
      expect(await statusFor('PUBLISHED')).toBe('Scheduled');
    });

    it('unknown / empty state → Scheduled', async () => {
      expect(await statusFor('')).toBe('Scheduled');
    });
  });

  // ── sf_eligible: served since 27ba3e6be (R6 D1 backend half) ─────────
  //
  // The list omits the field when the exam's course cannot be resolved, so the
  // mapper must keep three states apart: funded, not funded, and NOT KNOWN.
  // Coercing absent to false would re-create the original bug in mirror image:
  // a default that looks like data.
  const wireExam = () => ({
    id: 'exam-1',
    title: 'Certified Scrum Product Owner',
    scheduled_at: '2026-06-12T09:00:00Z',
    capacity: 30,
    enrolled_count: 22,
    proctor_method: 'ROOM:Exam Lab A',
    state: 'OPEN',
  });

  it('reads sf_eligible true as the served flag', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());
    httpMock
      .expectOne((r) => r.url === URL)
      .flush({ items: [{ ...wireExam(), sf_eligible: true }] });

    expect((await promise).sittings[0].skillsFutureAligned).toBe(true);
  });

  it('keeps a served false as false, not as absent', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());
    httpMock
      .expectOne((r) => r.url === URL)
      .flush({ items: [{ ...wireExam(), sf_eligible: false }] });

    expect((await promise).sittings[0].skillsFutureAligned).toBe(false);
  });

  it('keeps an ABSENT flag undefined, never coerced to false', async () => {
    // The unresolved-course case. "Not known" is not "not funded".
    const promise = firstValueFrom(service.getUpcomingSittings());
    httpMock.expectOne((r) => r.url === URL).flush({ items: [wireExam()] });

    expect((await promise).sittings[0].skillsFutureAligned).toBeUndefined();
  });

  it('accepts `status` as a fallback when BE renames `state` (forward-compat)', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());
    httpMock.expectOne(URL).flush({
      items: [{ id: 'e1', title: 'T', status: 'OPEN' }],
    });
    const list = await promise;
    expect(list.sittings[0]!.status).toBe('Open for registration');
  });

  it('slices scheduled_at without time component (date-only input)', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());
    httpMock.expectOne(URL).flush({
      items: [{ id: 'e1', title: 'T', scheduled_at: '2026-07-01' }],
    });
    const list = await promise;
    expect(list.sittings[0]!.dateIso).toBe('2026-07-01');
    expect(list.sittings[0]!.dateLabel).toBe('01 Jul 2026');
  });

  it('returns dateLabel="" for an unparseable scheduled_at', async () => {
    const promise = firstValueFrom(service.getUpcomingSittings());
    httpMock.expectOne(URL).flush({
      items: [{ id: 'e1', title: 'T', scheduled_at: 'not-a-date' }],
    });
    const list = await promise;
    expect(list.sittings[0]!.dateLabel).toBe('');
    // sliceIsoDate falls back to slice(0,10) for non-T inputs;
    // 'not-a-date' is exactly 10 chars so it is returned unchanged.
    expect(list.sittings[0]!.dateIso).toBe('not-a-date');
  });
});
