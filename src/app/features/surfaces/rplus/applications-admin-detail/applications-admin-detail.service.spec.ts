/**
 * ApplicationsAdminDetailService spec — R+ Wave-5 drill-down.
 *
 * Verifies:
 *   - GET /api/v1/applications/{id} on the BFF
 *   - snake_case → camelCase mapping incl. history[] + funding_lines[]
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
import { ApplicationsAdminDetailService } from './applications-admin-detail.service';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}/api/v1/applications`;

describe('ApplicationsAdminDetailService', () => {
  let service: ApplicationsAdminDetailService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApplicationsAdminDetailService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs /api/v1/applications/{id} on the BFF', async () => {
    const promise = firstValueFrom(service.get('app-99'));
    const req = httpMock.expectOne(`${BASE}/app-99`);
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'app-99',
      tenant_id: 'tenant-001',
      course_id: 'course-cspo',
      gcid: 'gcid-learner-1',
      status: 'submitted',
      created_at: '2026-05-26T10:00:00Z',
      updated_at: '2026-05-26T10:00:00Z',
      history: [],
    });
    const detail = await promise;
    expect(detail.id).toBe('app-99');
    expect(detail.state).toBe('SUBMITTED');
    expect(detail.history).toEqual([]);
    expect(detail.fundingLines).toEqual([]);
  });

  it('URL-encodes the id segment', async () => {
    const id = 'with/slash';
    const promise = firstValueFrom(service.get(id));
    httpMock.expectOne(`${BASE}/${encodeURIComponent(id)}`).flush({
      id,
      tenant_id: 'tenant-001',
      course_id: 'course-1',
      gcid: 'gcid-1',
      status: 'submitted',
      created_at: '2026-05-26T10:00:00Z',
      updated_at: '2026-05-26T10:00:00Z',
    });
    await promise;
  });

  it('maps lowercase status to canonical UPPER_SNAKE wire form', async () => {
    const promise = firstValueFrom(service.get('app-2'));
    httpMock.expectOne(`${BASE}/app-2`).flush({
      id: 'app-2',
      tenant_id: 'tenant-001',
      course_id: 'course-cspo',
      gcid: 'gcid-learner-2',
      status: 'under_review',
      created_at: '2026-05-26T10:00:00Z',
      updated_at: '2026-05-26T11:00:00Z',
    });
    const d = await promise;
    expect(d.state).toBe('IN_REVIEW');
  });

  it('maps history[] entries preserving from/to/at/reason', async () => {
    const promise = firstValueFrom(service.get('app-3'));
    httpMock.expectOne(`${BASE}/app-3`).flush({
      id: 'app-3',
      tenant_id: 'tenant-001',
      course_id: 'course-x',
      gcid: 'gcid-x',
      status: 'rejected',
      created_at: '2026-05-20T10:00:00Z',
      updated_at: '2026-05-26T11:00:00Z',
      history: [
        { from: '', to: 'submitted', at: '2026-05-20T10:00:00Z' },
        {
          from: 'submitted',
          to: 'under_review',
          at: '2026-05-21T09:00:00Z',
        },
        {
          from: 'under_review',
          to: 'rejected',
          at: '2026-05-26T11:00:00Z',
          reason: 'fails eligibility',
        },
      ],
      rejected_reason: 'fails eligibility',
    });
    const d = await promise;
    expect(d.history.length).toBe(3);
    expect(d.history[0]!.from).toBe('');
    expect(d.history[0]!.to).toBe('submitted');
    expect(d.history[2]!.reason).toBe('fails eligibility');
    expect(d.history[1]!.reason).toBeNull();
    expect(d.rejectedReason).toBe('fails eligibility');
  });

  it('maps funding_lines[] when present', async () => {
    const promise = firstValueFrom(service.get('app-4'));
    httpMock.expectOne(`${BASE}/app-4`).flush({
      id: 'app-4',
      tenant_id: 'tenant-001',
      course_id: 'course-cspo',
      gcid: 'gcid-y',
      status: 'offer_made',
      created_at: '2026-05-20T10:00:00Z',
      updated_at: '2026-05-26T11:00:00Z',
      funding_lines: [
        {
          source: 'SkillsFutures Credit',
          amount_sgd_cents: 50000,
          reference: 'sf-claim-001',
        },
        { source: 'Self-pay', amount_sgd_cents: 12345 },
      ],
    });
    const d = await promise;
    expect(d.fundingLines.length).toBe(2);
    expect(d.fundingLines[0]!.source).toBe('SkillsFutures Credit');
    expect(d.fundingLines[0]!.amountSgdCents).toBe(50000);
    expect(d.fundingLines[0]!.reference).toBe('sf-claim-001');
    expect(d.fundingLines[1]!.reference).toBeNull();
  });

  it('coerces missing optional fields to null', async () => {
    const promise = firstValueFrom(service.get('app-5'));
    httpMock.expectOne(`${BASE}/app-5`).flush({
      id: 'app-5',
      tenant_id: 'tenant-001',
      course_id: 'course-1',
      gcid: 'gcid-z',
      status: 'submitted',
      created_at: '2026-05-26T10:00:00Z',
      updated_at: '2026-05-26T10:00:00Z',
    });
    const d = await promise;
    expect(d.classId).toBeNull();
    expect(d.offerExpiresAt).toBeNull();
    expect(d.stripePaymentIntentId).toBeNull();
    expect(d.invoiceId).toBeNull();
    expect(d.rejectedReason).toBeNull();
    expect(d.withdrawnReason).toBeNull();
    expect(d.history).toEqual([]);
    expect(d.fundingLines).toEqual([]);
  });

  it('propagates 404 errors to the caller (fail-loud)', async () => {
    const promise = firstValueFrom(service.get('missing'));
    httpMock.expectOne(`${BASE}/missing`).flush('not found', {
      status: 404,
      statusText: 'Not Found',
    });
    await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
    await expect(promise).rejects.toMatchObject({ status: 404 });
  });

  it('propagates 5xx errors to the caller (fail-loud)', async () => {
    const promise = firstValueFrom(service.get('app-1'));
    httpMock.expectOne(`${BASE}/app-1`).flush('upstream', {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await expect(promise).rejects.toMatchObject({ status: 503 });
  });
});
