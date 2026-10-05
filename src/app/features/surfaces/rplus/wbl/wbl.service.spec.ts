/**
 * WblService spec — R+ /r/wbl (real BFF wiring).
 *
 * Verifies the service issues:
 *   - GET    /api/v1/wbl-placements   (+ optional state filter)
 *   - GET    /api/v1/wbl-placements/{id}
 *   - POST   /api/v1/wbl-placements
 *   - PATCH  /api/v1/wbl-placements/{id}
 *   - DELETE /api/v1/wbl-placements/{id}
 *
 * + maps the backend snake-case wire envelope into the camelCase
 * Placement model. No fixtures: HttpTestingController flushes real
 * envelopes per chora-web/CLAUDE.md §6.
 *
 * Pattern mirrors certifications.service.spec.ts:
 *   - provideHttpClient() + provideHttpClientTesting()
 *   - TenantContextService set via setCurrentTenant()
 *   - httpMock.verify() in afterEach
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { WblService } from './wbl.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

const PLACEMENT_PATH = `${environment.bffBaseUrl}/api/v1/wbl-placements`;

interface BackendPlacementStub {
  id: string;
  tenant_id: string;
  gcid: string;
  course_id: string;
  host_org_name: string;
  supervisor_name: string;
  supervisor_email: string;
  start_date: string;
  end_date: string;
  hours_required: number;
  hours_completed: number;
  state: string;
  evaluator_notes?: string;
  /** CHO-2335: resolved display fields, omitted by BE when unresolved. */
  learner_name?: string;
  course_title?: string;
  created_at: string;
  updated_at: string;
}

function backendStub(
  overrides: Partial<BackendPlacementStub> = {},
): BackendPlacementStub {
  return {
    id: 'p-1',
    tenant_id: 'tenant-001',
    gcid: 'gcid-phyllis',
    course_id: 'course-cspo',
    host_org_name: 'Acme Pte Ltd',
    supervisor_name: 'Jane Tan',
    supervisor_email: 'jane.tan@acme.example',
    start_date: '2026-06-01T00:00:00Z',
    end_date: '2026-08-31T00:00:00Z',
    hours_required: 240,
    hours_completed: 0,
    state: 'SCHEDULED',
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
    ...overrides,
  };
}

describe('WblService', () => {
  let service: WblService;
  let httpMock: HttpTestingController;
  let tenants: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WblService);
    httpMock = TestBed.inject(HttpTestingController);
    tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-001',
      name: 'MTM Singapore',
      slug: 'mtm',
      logoUrl: null,
    });
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('GETs /api/v1/wbl-placements on the BFF (no filters)', async () => {
      const promise = firstValueFrom(service.list());

      const req = httpMock.expectOne(PLACEMENT_PATH);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('state')).toBe(false);
      req.flush({ items: [] });

      const out = await promise;
      expect(out.totalPlacements).toBe(0);
      expect(out.items).toEqual([]);
    });

    it('forwards `state` query param when supplied', async () => {
      const promise = firstValueFrom(
        service.list({ state: 'IN_PROGRESS' }),
      );
      const req = httpMock.expectOne(
        (r) =>
          r.url === PLACEMENT_PATH &&
          r.params.get('state') === 'IN_PROGRESS',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ items: [] });
      await promise;
    });

    it('maps the backend envelope into the typed Placement model', async () => {
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(PLACEMENT_PATH).flush({
        items: [
          backendStub({
            id: 'p-cspo-001',
            host_org_name: 'Acme Pte Ltd',
            supervisor_name: 'Jane Tan',
            supervisor_email: 'jane.tan@acme.example',
            hours_required: 240,
            hours_completed: 80,
            state: 'IN_PROGRESS',
          }),
        ],
      });

      const out = await promise;
      expect(out.totalPlacements).toBe(1);
      const p = out.items[0]!;
      expect(p.id).toBe('p-cspo-001');
      expect(p.tenantId).toBe('tenant-001');
      expect(p.gcid).toBe('gcid-phyllis');
      expect(p.courseId).toBe('course-cspo');
      expect(p.hostOrgName).toBe('Acme Pte Ltd');
      expect(p.supervisorName).toBe('Jane Tan');
      expect(p.supervisorEmail).toBe('jane.tan@acme.example');
      expect(p.hoursRequired).toBe(240);
      expect(p.hoursCompleted).toBe(80);
      expect(p.state).toBe('IN_PROGRESS');
      // BE omits evaluator_notes when empty; mapper defaults to ''.
      expect(p.evaluatorNotes).toBe('');
    });

    it('maps learner_name → learnerName and course_title → courseTitle (CHO-2335)', async () => {
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(PLACEMENT_PATH).flush({
        items: [
          backendStub({
            id: 'p-enriched',
            learner_name: 'Alice Tan',
            course_title: 'Intro to Robotics',
          }),
        ],
      });
      const out = await promise;
      const p = out.items[0]!;
      expect(p.learnerName).toBe('Alice Tan');
      expect(p.courseTitle).toBe('Intro to Robotics');
      // Raw ids still ride the model (backward-compat / fallback source).
      expect(p.gcid).toBe('gcid-phyllis');
      expect(p.courseId).toBe('course-cspo');
    });

    it('leaves learnerName/courseTitle empty when the BE omits them', async () => {
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(PLACEMENT_PATH).flush({
        items: [backendStub({ id: 'p-raw' })],
      });
      const out = await promise;
      const p = out.items[0]!;
      // Absent ⇒ falsy (undefined or ''), so the template falls back to the id.
      expect(p.learnerName ?? '').toBe('');
      expect(p.courseTitle ?? '').toBe('');
    });

    it('preserves evaluator_notes when the BE supplies it', async () => {
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(PLACEMENT_PATH).flush({
        items: [
          backendStub({
            id: 'p-withdrawn',
            state: 'WITHDRAWN',
            evaluator_notes: '[WITHDRAWN] learner moved abroad',
          }),
        ],
      });
      const out = await promise;
      expect(out.items[0]!.evaluatorNotes).toContain('[WITHDRAWN]');
    });

    it('pulls tenantName from TenantContextService', async () => {
      tenants.setCurrentTenant({
        id: 'tenant-009',
        name: 'Acme Learning Co',
        slug: 'acme',
        logoUrl: null,
      });
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(PLACEMENT_PATH).flush({ items: [] });
      const out = await promise;
      expect(out.tenantName).toBe('Acme Learning Co');
    });

    it('defaults tenantName to "Current tenant" when no tenant context', async () => {
      tenants.setCurrentTenant(null as never);
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(PLACEMENT_PATH).flush({ items: [] });
      const out = await promise;
      expect(out.tenantName).toBe('Current tenant');
    });

    it('returns an empty list when the backend has no placements', async () => {
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(PLACEMENT_PATH).flush({ items: [] });
      const out = await promise;
      expect(out.items).toHaveLength(0);
      // Per feedback_no_stubs_real_wiring: empty BE ⇒ empty FE (the
      // component renders the empty state — no inline fixture).
    });
  });

  describe('get(id)', () => {
    it('GETs /api/v1/wbl-placements/{id}', async () => {
      const promise = firstValueFrom(service.get('p-cspo-001'));
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-cspo-001`);
      expect(req.request.method).toBe('GET');
      req.flush(backendStub({ id: 'p-cspo-001' }));
      const p = await promise;
      expect(p.id).toBe('p-cspo-001');
    });

    it('URL-encodes the id', async () => {
      const promise = firstValueFrom(service.get('p with space'));
      httpMock
        .expectOne(`${PLACEMENT_PATH}/p%20with%20space`)
        .flush(backendStub({ id: 'p with space' }));
      await promise;
    });
  });

  describe('create', () => {
    it('POSTs the snake-case payload to /api/v1/wbl-placements', async () => {
      const promise = firstValueFrom(
        service.create({
          gcid: 'gcid-phyllis',
          courseId: 'course-cspo',
          hostOrgName: 'Acme Pte Ltd',
          supervisorName: 'Jane Tan',
          supervisorEmail: 'jane.tan@acme.example',
          startDate: '2026-06-01T00:00:00Z',
          endDate: '2026-08-31T00:00:00Z',
          hoursRequired: 240,
        }),
      );
      const req = httpMock.expectOne(PLACEMENT_PATH);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        gcid: 'gcid-phyllis',
        course_id: 'course-cspo',
        host_org_name: 'Acme Pte Ltd',
        supervisor_name: 'Jane Tan',
        supervisor_email: 'jane.tan@acme.example',
        start_date: '2026-06-01T00:00:00Z',
        end_date: '2026-08-31T00:00:00Z',
        hours_required: 240,
      });
      req.flush(backendStub({ id: 'p-new' }));
      const p = await promise;
      expect(p.id).toBe('p-new');
      expect(p.state).toBe('SCHEDULED');
    });

    it('widens date-only `<input type=date>` values to RFC3339 start-of-day UTC', async () => {
      // The composer ReactiveForm binds `<input type=date>` which yields a
      // bare `YYYY-MM-DD` string. chora-delivery's wbl_handler decodes
      // start_date/end_date into time.Time (RFC3339) — a date-only value
      // 400s with `cannot parse "" as "T"`. The service MUST widen both.
      const promise = firstValueFrom(
        service.create({
          gcid: 'gcid-phyllis',
          courseId: 'course-cspo',
          hostOrgName: 'Acme Pte Ltd',
          supervisorName: 'Jane Tan',
          supervisorEmail: 'jane.tan@acme.example',
          startDate: '2026-07-01',
          endDate: '2026-09-30',
          hoursRequired: 240,
        }),
      );
      const req = httpMock.expectOne(PLACEMENT_PATH);
      expect(req.request.method).toBe('POST');
      const body = req.request.body as { start_date: string; end_date: string };
      // Both dates carry the full RFC3339 datetime the BE time.Time decoder
      // demands — start-of-day UTC. The BE only enforces end >= start (no
      // end-of-day semantics — see wbl/placement.go NewPlacement).
      expect(body.start_date).toBe('2026-07-01T00:00:00Z');
      expect(body.end_date).toBe('2026-09-30T00:00:00Z');
      req.flush(backendStub({ id: 'p-new' }));
      await promise;
    });

    it('passes an already-RFC3339 date through unchanged (no double-encode)', async () => {
      const promise = firstValueFrom(
        service.create({
          gcid: 'gcid-phyllis',
          courseId: 'course-cspo',
          hostOrgName: 'Acme Pte Ltd',
          supervisorName: 'Jane Tan',
          supervisorEmail: 'jane.tan@acme.example',
          startDate: '2026-06-01T00:00:00Z',
          endDate: '2026-08-31T09:30:00Z',
          hoursRequired: 240,
        }),
      );
      const req = httpMock.expectOne(PLACEMENT_PATH);
      const body = req.request.body as { start_date: string; end_date: string };
      // No `T00:00:00ZT...` mangling — an RFC3339 input is forwarded verbatim.
      expect(body.start_date).toBe('2026-06-01T00:00:00Z');
      expect(body.end_date).toBe('2026-08-31T09:30:00Z');
      req.flush(backendStub({ id: 'p-new' }));
      await promise;
    });
  });

  describe('update', () => {
    it('PATCHes only hours_completed when only that field is supplied', async () => {
      const promise = firstValueFrom(
        service.update('p-1', { hoursCompleted: 120 }),
      );
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ hours_completed: 120 });
      req.flush(
        backendStub({ id: 'p-1', hours_completed: 120, state: 'IN_PROGRESS' }),
      );
      const p = await promise;
      expect(p.hoursCompleted).toBe(120);
    });

    it('PATCHes only evaluator_notes when only that field is supplied', async () => {
      const promise = firstValueFrom(
        service.update('p-1', { evaluatorNotes: 'mid-term review note' }),
      );
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        evaluator_notes: 'mid-term review note',
      });
      req.flush(
        backendStub({ id: 'p-1', evaluator_notes: 'mid-term review note' }),
      );
      const p = await promise;
      expect(p.evaluatorNotes).toBe('mid-term review note');
    });

    it('PATCHes both fields when both supplied', async () => {
      const promise = firstValueFrom(
        service.update('p-1', {
          hoursCompleted: 240,
          evaluatorNotes: 'done',
        }),
      );
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      expect(req.request.body).toEqual({
        hours_completed: 240,
        evaluator_notes: 'done',
      });
      req.flush(
        backendStub({
          id: 'p-1',
          hours_completed: 240,
          evaluator_notes: 'done',
        }),
      );
      await promise;
    });

    it('sends an empty body when no fields are supplied (no-op patch)', async () => {
      const promise = firstValueFrom(service.update('p-1', {}));
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      expect(req.request.body).toEqual({});
      req.flush(backendStub({ id: 'p-1' }));
      await promise;
    });
  });

  describe('withdraw', () => {
    it('issues DELETE /api/v1/wbl-placements/{id} (soft-delete)', async () => {
      const promise = firstValueFrom(service.withdraw('p-1'));
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(
        backendStub({
          id: 'p-1',
          state: 'WITHDRAWN',
          evaluator_notes: '[WITHDRAWN] DELETE /api/v1/wbl-placements',
        }),
      );
      const p = await promise;
      expect(p.state).toBe('WITHDRAWN');
      expect(p.evaluatorNotes).toContain('[WITHDRAWN]');
    });
  });
});
