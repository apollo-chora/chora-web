/**
 * ProjectGroupDetailService spec — R+ Wave-5 drill-down.
 *
 * Verifies:
 *   - GET  /api/v1/project-groups/{id}
 *   - POST /api/v1/project-groups/{id}/submit
 *   - POST /api/v1/project-groups/{id}/grade
 *   - snake_case → camelCase wire mapping incl. members[]
 *   - 404 + 5xx propagate to the caller (fail-loud per
 *     feedback_no_stubs_real_wiring)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ProjectGroupDetailService } from './project-group-detail.service';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}/api/v1/project-groups`;

interface BackendGroupStub {
  id: string;
  tenant_id: string;
  course_id: string;
  name: string;
  state: 'FORMING' | 'ACTIVE' | 'SUBMITTED' | 'GRADED';
  members: Array<{ gcid: string; role: string }>;
  submitted_at?: string;
  score_pct?: number;
  grader_gcid?: string;
  graded_at?: string;
  feedback?: string;
  created_at: string;
  updated_at: string;
}

function backendStub(overrides: Partial<BackendGroupStub> = {}): BackendGroupStub {
  return {
    id: 'pg-001',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    name: 'Alpha Group',
    state: 'ACTIVE',
    members: [
      { gcid: 'gcid-leader', role: 'leader' },
      { gcid: 'gcid-member-1', role: 'member' },
      { gcid: 'gcid-member-2', role: 'member' },
    ],
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-26T11:00:00Z',
    ...overrides,
  };
}

describe('ProjectGroupDetailService', () => {
  let service: ProjectGroupDetailService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProjectGroupDetailService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('get(id)', () => {
    it('GETs /api/v1/project-groups/{id} on the BFF', async () => {
      const promise = firstValueFrom(service.get('pg-001'));
      const req = httpMock.expectOne(`${BASE}/pg-001`);
      expect(req.request.method).toBe('GET');
      req.flush(backendStub());
      const g = await promise;
      expect(g.id).toBe('pg-001');
      expect(g.state).toBe('ACTIVE');
      expect(g.members.length).toBe(3);
      expect(g.members[0]!.role).toBe('leader');
      expect(g.members[1]!.role).toBe('member');
    });

    it('URL-encodes the id segment', async () => {
      const promise = firstValueFrom(service.get('pg with space'));
      httpMock
        .expectOne(`${BASE}/${encodeURIComponent('pg with space')}`)
        .flush(backendStub({ id: 'pg with space' }));
      await promise;
    });

    it('maps GRADED rows with optional score / grader / graded_at / feedback', async () => {
      const promise = firstValueFrom(service.get('pg-graded'));
      httpMock.expectOne(`${BASE}/pg-graded`).flush(
        backendStub({
          id: 'pg-graded',
          state: 'GRADED',
          submitted_at: '2026-05-25T10:00:00Z',
          score_pct: 88,
          grader_gcid: 'gcid-instructor',
          graded_at: '2026-05-26T12:00:00Z',
          feedback: 'Strong synthesis, weak references',
        }),
      );
      const g = await promise;
      expect(g.state).toBe('GRADED');
      expect(g.submittedAt).toBe('2026-05-25T10:00:00Z');
      expect(g.scorePct).toBe(88);
      expect(g.graderGcid).toBe('gcid-instructor');
      expect(g.gradedAt).toBe('2026-05-26T12:00:00Z');
      expect(g.feedback).toBe('Strong synthesis, weak references');
    });

    it('propagates 404 errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.get('missing'));
      httpMock.expectOne(`${BASE}/missing`).flush('project group not found', {
        status: 404,
        statusText: 'Not Found',
      });
      await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });

    it('propagates 5xx errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.get('pg-1'));
      httpMock.expectOne(`${BASE}/pg-1`).flush('upstream', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('submit(id)', () => {
    it('POSTs to /{id}/submit with empty body', async () => {
      const promise = firstValueFrom(service.submit('pg-001'));
      const req = httpMock.expectOne(`${BASE}/pg-001/submit`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(
        backendStub({
          id: 'pg-001',
          state: 'SUBMITTED',
          submitted_at: '2026-05-26T11:00:00Z',
        }),
      );
      const g = await promise;
      expect(g.state).toBe('SUBMITTED');
    });
  });

  describe('grade(id, …)', () => {
    it('POSTs to /{id}/grade with score_pct + feedback', async () => {
      const promise = firstValueFrom(
        service.grade('pg-001', {
          scorePct: 95,
          feedback: 'excellent',
        }),
      );
      const req = httpMock.expectOne(`${BASE}/pg-001/grade`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        score_pct: 95,
        feedback: 'excellent',
      });
      req.flush(
        backendStub({
          id: 'pg-001',
          state: 'GRADED',
          submitted_at: '2026-05-25T10:00:00Z',
          score_pct: 95,
          grader_gcid: 'gcid-instructor',
          graded_at: '2026-05-26T12:00:00Z',
          feedback: 'excellent',
        }),
      );
      const g = await promise;
      expect(g.state).toBe('GRADED');
      expect(g.scorePct).toBe(95);
    });

    it('defaults feedback to empty string when omitted', async () => {
      const promise = firstValueFrom(service.grade('pg-001', { scorePct: 80 }));
      const req = httpMock.expectOne(`${BASE}/pg-001/grade`);
      expect(req.request.body).toEqual({
        score_pct: 80,
        feedback: '',
      });
      req.flush(
        backendStub({
          id: 'pg-001',
          state: 'GRADED',
          score_pct: 80,
          grader_gcid: 'gcid-instructor',
          graded_at: '2026-05-26T12:00:00Z',
        }),
      );
      await promise;
    });
  });

  describe('addMember(id, gcid, role)', () => {
    it('POSTs to /{id}/members with gcid + role', async () => {
      const promise = firstValueFrom(
        service.addMember('pg-001', 'gcid-new', 'member'),
      );
      const req = httpMock.expectOne(`${BASE}/pg-001/members`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ gcid: 'gcid-new', role: 'member' });
      req.flush(
        backendStub({
          members: [
            { gcid: 'gcid-leader', role: 'leader' },
            { gcid: 'gcid-member-1', role: 'member' },
            { gcid: 'gcid-member-2', role: 'member' },
            { gcid: 'gcid-new', role: 'member' },
          ],
        }),
      );
      const g = await promise;
      expect(g.members.length).toBe(4);
      expect(g.members[3]!.gcid).toBe('gcid-new');
    });

    it('propagates 409 (locked / duplicate) fail-loud', async () => {
      const promise = firstValueFrom(
        service.addMember('pg-001', 'dup', 'member'),
      );
      httpMock
        .expectOne(`${BASE}/pg-001/members`)
        .flush('conflict', { status: 409, statusText: 'Conflict' });
      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('removeMember(id, gcid)', () => {
    it('DELETEs /{id}/members/{gcid}', async () => {
      const promise = firstValueFrom(
        service.removeMember('pg-001', 'gcid-member-1'),
      );
      const req = httpMock.expectOne(`${BASE}/pg-001/members/gcid-member-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(
        backendStub({
          members: [
            { gcid: 'gcid-leader', role: 'leader' },
            { gcid: 'gcid-member-2', role: 'member' },
          ],
        }),
      );
      const g = await promise;
      expect(g.members.length).toBe(2);
    });

    it('URL-encodes the gcid segment', async () => {
      const promise = firstValueFrom(service.removeMember('pg-001', 'g/c id'));
      httpMock
        .expectOne(`${BASE}/pg-001/members/${encodeURIComponent('g/c id')}`)
        .flush(backendStub());
      await promise;
    });

    it('propagates 404 (member not found) fail-loud', async () => {
      const promise = firstValueFrom(service.removeMember('pg-001', 'ghost'));
      httpMock
        .expectOne(`${BASE}/pg-001/members/ghost`)
        .flush('not found', { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });
});
