/**
 * WblDetailService spec — R+ Wave-5 drill-down (real BFF wiring).
 *
 * Verifies the service issues:
 *   - GET    /api/v1/wbl-placements/{id}
 *   - DELETE /api/v1/wbl-placements/{id}   (soft-delete)
 *
 * + maps the backend snake-case wire envelope into the camelCase
 * Placement model. No fixtures: HttpTestingController flushes real
 * envelopes per chora-web/CLAUDE.md §6.
 *
 * Coverage: happy path + 404 + 5xx for GET; happy path for DELETE.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { WblDetailService } from './wbl-detail.service';
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

describe('WblDetailService', () => {
  let service: WblDetailService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WblDetailService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('get(id)', () => {
    it('GETs /api/v1/wbl-placements/{id} on the BFF', async () => {
      const promise = firstValueFrom(service.get('p-cspo-001'));
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-cspo-001`);
      expect(req.request.method).toBe('GET');
      req.flush(backendStub({ id: 'p-cspo-001' }));
      const out = await promise;
      expect(out.id).toBe('p-cspo-001');
    });

    it('URL-encodes the id segment', async () => {
      const promise = firstValueFrom(service.get('p with space'));
      httpMock
        .expectOne(`${PLACEMENT_PATH}/p%20with%20space`)
        .flush(backendStub({ id: 'p with space' }));
      await promise;
    });

    it('maps the backend snake_case envelope into the typed Placement', async () => {
      const promise = firstValueFrom(service.get('p-cspo-001'));
      httpMock.expectOne(`${PLACEMENT_PATH}/p-cspo-001`).flush(
        backendStub({
          id: 'p-cspo-001',
          host_org_name: 'Acme Pte Ltd',
          supervisor_name: 'Jane Tan',
          supervisor_email: 'jane.tan@acme.example',
          hours_required: 240,
          hours_completed: 80,
          state: 'IN_PROGRESS',
        }),
      );
      const p = await promise;
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

    it('preserves evaluator_notes when the BE supplies it', async () => {
      const promise = firstValueFrom(service.get('p-withdrawn'));
      httpMock.expectOne(`${PLACEMENT_PATH}/p-withdrawn`).flush(
        backendStub({
          id: 'p-withdrawn',
          state: 'WITHDRAWN',
          evaluator_notes: '[WITHDRAWN] learner moved abroad',
        }),
      );
      const out = await promise;
      expect(out.evaluatorNotes).toContain('[WITHDRAWN]');
    });

    it('propagates 404 errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.get('missing'));
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/missing`);
      req.flush('placement not found', {
        status: 404,
        statusText: 'Not Found',
      });
      await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });

    it('propagates 5xx errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.get('p-1'));
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      req.flush('upstream blew up', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('update(id, patch)', () => {
    it('issues PATCH /api/v1/wbl-placements/{id} with both fields', async () => {
      const promise = firstValueFrom(
        service.update('p-1', {
          hoursCompleted: 160,
          evaluatorNotes: 'midpoint review',
        }),
      );
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        hours_completed: 160,
        evaluator_notes: 'midpoint review',
      });
      req.flush(
        backendStub({
          id: 'p-1',
          hours_completed: 160,
          state: 'IN_PROGRESS',
          evaluator_notes: 'midpoint review',
        }),
      );
      const p = await promise;
      expect(p.hoursCompleted).toBe(160);
      expect(p.evaluatorNotes).toBe('midpoint review');
    });

    it('forwards only the supplied field (hours-only patch)', async () => {
      const promise = firstValueFrom(
        service.update('p-1', { hoursCompleted: 40 }),
      );
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      expect(req.request.body).toEqual({ hours_completed: 40 });
      req.flush(backendStub({ id: 'p-1', hours_completed: 40 }));
      await promise;
    });

    it('forwards only the supplied field (notes-only patch)', async () => {
      const promise = firstValueFrom(
        service.update('p-1', { evaluatorNotes: 'signed off' }),
      );
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      expect(req.request.body).toEqual({ evaluator_notes: 'signed off' });
      req.flush(backendStub({ id: 'p-1', evaluator_notes: 'signed off' }));
      await promise;
    });

    it('propagates 409 CONFLICT to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(
        service.update('p-1', { hoursCompleted: 9999 }),
      );
      const req = httpMock.expectOne(`${PLACEMENT_PATH}/p-1`);
      req.flush(
        { error: 'wbl: hours_completed exceeds hours_required' },
        { status: 409, statusText: 'Conflict' },
      );
      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('withdraw(id)', () => {
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
