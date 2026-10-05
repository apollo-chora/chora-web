import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ApplicationsService } from './applications.service';
import { environment } from '../../../../../environments/environment';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApplicationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getQueue', () => {
    it('GETs /api/v1/applications on the BFF with no ?state= when filter=ALL', async () => {
      const promise = firstValueFrom(service.getQueue('ALL'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/applications`,
      );
      expect(req.request.method).toBe('GET');
      // ALL → no query param (matches backend's "no filter" semantic).
      expect(req.request.params.has('state')).toBe(false);
      req.flush({ items: [], total: 0 });

      const queue = await promise;
      expect(queue.total).toBe(0);
      expect(queue.applications).toEqual([]);
      expect(queue.filter).toBe('ALL');
    });

    it('appends ?state=SUBMITTED to the BFF call when filter=SUBMITTED', async () => {
      const promise = firstValueFrom(service.getQueue('SUBMITTED'));
      const req = httpMock.expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/applications` &&
          r.params.get('state') === 'SUBMITTED',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ items: [], total: 0 });

      const queue = await promise;
      expect(queue.filter).toBe('SUBMITTED');
    });

    it('maps backend lowercase status to canonical UPPER_SNAKE wire form', async () => {
      const promise = firstValueFrom(service.getQueue('ALL'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/applications`,
      );
      req.flush({
        items: [
          {
            id: 'app-1',
            tenant_id: 'tenant-001',
            course_id: 'course-1',
            gcid: 'gcid-learner-1',
            status: 'submitted',
            created_at: '2026-05-26T10:00:00Z',
            updated_at: '2026-05-26T10:00:00Z',
          },
          {
            id: 'app-2',
            tenant_id: 'tenant-001',
            course_id: 'course-1',
            gcid: 'gcid-learner-2',
            status: 'under_review',
            created_at: '2026-05-26T10:00:00Z',
            updated_at: '2026-05-26T11:00:00Z',
          },
          {
            id: 'app-3',
            tenant_id: 'tenant-001',
            course_id: 'course-1',
            gcid: 'gcid-learner-3',
            status: 'offer_made',
            created_at: '2026-05-26T10:00:00Z',
            updated_at: '2026-05-26T12:00:00Z',
            offer_expires_at: '2026-06-09T12:00:00Z',
          },
        ],
        total: 3,
      });

      const queue = await promise;
      expect(queue.total).toBe(3);
      expect(queue.applications[0]!.state).toBe('SUBMITTED');
      expect(queue.applications[1]!.state).toBe('IN_REVIEW');
      expect(queue.applications[2]!.state).toBe('OFFER_MADE');
      expect(queue.applications[2]!.offerExpiresAt).toBe(
        '2026-06-09T12:00:00Z',
      );
    });

    it('passes through omitted optional fields as null', async () => {
      const promise = firstValueFrom(service.getQueue('ALL'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/applications`,
      );
      req.flush({
        items: [
          {
            id: 'app-1',
            tenant_id: 'tenant-001',
            course_id: 'course-1',
            gcid: 'gcid-learner-1',
            status: 'submitted',
            created_at: '2026-05-26T10:00:00Z',
            updated_at: '2026-05-26T10:00:00Z',
          },
        ],
        total: 1,
      });

      const queue = await promise;
      const row = queue.applications[0]!;
      expect(row.classId).toBeNull();
      expect(row.offerExpiresAt).toBeNull();
      expect(row.stripePaymentIntentId).toBeNull();
      expect(row.invoiceId).toBeNull();
      expect(row.rejectedReason).toBeNull();
      expect(row.withdrawnReason).toBeNull();
    });

    it('exposes total separately from row count for header pill display', async () => {
      const promise = firstValueFrom(service.getQueue('IN_REVIEW'));
      const req = httpMock.expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/applications` &&
          r.params.get('state') === 'IN_REVIEW',
      );
      // The backend returns total=12 but the page contains only 5 rows
      // (the FE could be paginating in a future wave).
      req.flush({
        items: [
          buildBackendStub('app-1'),
          buildBackendStub('app-2'),
          buildBackendStub('app-3'),
          buildBackendStub('app-4'),
          buildBackendStub('app-5'),
        ],
        total: 12,
      });

      const queue = await promise;
      expect(queue.total).toBe(12);
      expect(queue.applications.length).toBe(5);
    });
  });

  describe('getDetail', () => {
    it('GETs /api/v1/applications/{id}', async () => {
      const promise = firstValueFrom(service.getDetail('app-99'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/applications/app-99`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildBackendStub('app-99'));

      const row = await promise;
      expect(row.id).toBe('app-99');
    });
  });
});

function buildBackendStub(id: string): {
  id: string;
  tenant_id: string;
  course_id: string;
  gcid: string;
  status: string;
  created_at: string;
  updated_at: string;
} {
  return {
    id,
    tenant_id: 'tenant-001',
    course_id: 'course-1',
    gcid: 'gcid-learner-' + id,
    status: 'submitted',
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
  };
}
