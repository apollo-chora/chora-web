/**
 * CertificationsService spec — R+ /r/certifications (real BFF wiring).
 *
 * Verifies the service issues GET /api/v1/certifications on the BFF
 * with optional `learner_gcid` + `course_id` filter params + maps the
 * backend snake-case wire envelope into the camelCase Certification
 * model. No fixtures: HttpTestingController flushes real envelopes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { CertificationsService } from './certifications.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

describe('CertificationsService', () => {
  let service: CertificationsService;
  let httpMock: HttpTestingController;
  let tenants: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CertificationsService);
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

  it('GETs /api/v1/certifications on the BFF (no filters)', async () => {
    const promise = firstValueFrom(service.list());

    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/certifications`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ items: [] });

    const out = await promise;
    expect(out.totalCertifications).toBe(0);
    expect(out.items).toEqual([]);
  });

  it('maps backend cert envelope into the typed Certification model', async () => {
    const promise = firstValueFrom(service.list());
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/certifications`,
    );
    req.flush({
      items: [
        {
          id: 'cert-001',
          tenant_id: 'tenant-001',
          learner_gcid: 'gcid-phyllis',
          course_id: 'course-cspo',
          accomplishments: ['atom-1:passed', 'exam:passed'],
          hash: 'deadbeef',
          issued_at: '2026-05-26T10:00:00Z',
        },
      ],
    });

    const out = await promise;
    expect(out.totalCertifications).toBe(1);
    const cert = out.items[0]!;
    expect(cert.id).toBe('cert-001');
    expect(cert.tenantId).toBe('tenant-001');
    expect(cert.learnerGcid).toBe('gcid-phyllis');
    expect(cert.courseId).toBe('course-cspo');
    expect(cert.accomplishments).toEqual(['atom-1:passed', 'exam:passed']);
    expect(cert.hash).toBe('deadbeef');
    expect(cert.issuedAt).toBe('2026-05-26T10:00:00Z');
    expect(cert.status).toBe('Active');
  });

  it('forwards learner_gcid + course_id query params', async () => {
    const promise = firstValueFrom(
      service.list({ learnerGcid: 'gcid-phyllis', courseId: 'course-cspo' }),
    );
    const req = httpMock.expectOne(
      (r) =>
        r.url === `${environment.bffBaseUrl}/api/v1/certifications` &&
        r.params.get('learner_gcid') === 'gcid-phyllis' &&
        r.params.get('course_id') === 'course-cspo',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ items: [] });
    await promise;
  });

  it('omits query params when filters not supplied', async () => {
    const promise = firstValueFrom(service.list());
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/certifications`,
    );
    expect(req.request.params.has('learner_gcid')).toBe(false);
    expect(req.request.params.has('course_id')).toBe(false);
    req.flush({ items: [] });
    await promise;
  });

  it('pulls tenantName from TenantContextService', async () => {
    tenants.setCurrentTenant({
      id: 'tenant-009',
      name: 'Acme Learning Co',
      slug: 'acme',
      logoUrl: null,
    });
    const promise = firstValueFrom(service.list());
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
      .flush({ items: [] });
    const out = await promise;
    expect(out.tenantName).toBe('Acme Learning Co');
  });

  it('issues POST /api/certifications when minting a new cert', async () => {
    const promise = firstValueFrom(
      service.issue({
        learnerGcid: 'gcid-phyllis',
        courseId: 'course-cspo',
        accomplishments: ['atom-1:passed'],
      }),
    );
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/certifications`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      learner_gcid: 'gcid-phyllis',
      course_id: 'course-cspo',
      accomplishments: ['atom-1:passed'],
    });
    req.flush({
      id: 'cert-new',
      tenant_id: 'tenant-001',
      learner_gcid: 'gcid-phyllis',
      course_id: 'course-cspo',
      accomplishments: ['atom-1:passed'],
      hash: 'abc',
      issued_at: '2026-05-26T10:00:00Z',
    });
    const cert = await promise;
    expect(cert.id).toBe('cert-new');
    expect(cert.status).toBe('Active');
  });

  it('issues DELETE /api/certifications/{id} when revoking', async () => {
    const promise = firstValueFrom(service.revoke('cert-to-revoke'));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/certifications/cert-to-revoke`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    await promise;
  });

  it('defaults tenantName to "Current tenant" when no tenant context', async () => {
    tenants.setCurrentTenant(null as never);
    const promise = firstValueFrom(service.list());
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
      .flush({ items: [] });
    const out = await promise;
    expect(out.tenantName).toBe('Current tenant');
  });
});
