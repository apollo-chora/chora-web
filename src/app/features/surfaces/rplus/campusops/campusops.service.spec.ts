import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { CampusopsService } from './campusops.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

describe('CampusopsService', () => {
  let service: CampusopsService;
  let httpMock: HttpTestingController;
  let tenants: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CampusopsService);
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

  it('GETs /v1/campus on the BFF', async () => {
    const promise = firstValueFrom(service.getCampuses());

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [] });

    const list = await promise;
    expect(list.totalCampuses).toBe(0);
    expect(list.campuses).toEqual([]);
  });

  it('maps backend Campus shape to Campus FE model', async () => {
    const promise = firstValueFrom(service.getCampuses());

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`);
    req.flush({
      items: [
        {
          id: 'campus-1',
          tenant_id: 'tenant-001',
          name: 'MTM SG — Bras Basah',
          address_l1: '123 Bras Basah Rd',
          address_l2: '',
          city: 'Singapore',
          country: 'SG',
          created_at: '2026-05-26T00:00:00Z',
          updated_at: '2026-05-26T00:00:00Z',
        },
      ],
    });

    const list = await promise;
    expect(list.totalCampuses).toBe(1);
    const c = list.campuses[0]!;
    expect(c.campusId).toBe('campus-1');
    expect(c.tenantId).toBe('tenant-001');
    expect(c.name).toBe('MTM SG — Bras Basah');
    expect(c.addressLine1).toBe('123 Bras Basah Rd');
    expect(c.city).toBe('Singapore');
    expect(c.country).toBe('SG');
    expect(c.displayAddress).toBe('123 Bras Basah Rd, Singapore, SG');
  });

  it('strips empty address fields from displayAddress', async () => {
    const promise = firstValueFrom(service.getCampuses());

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`);
    req.flush({
      items: [
        {
          id: 'campus-2',
          tenant_id: 'tenant-001',
          name: 'MTM SG — Pop-up',
          address_l1: '',
          address_l2: '',
          city: 'Singapore',
          country: 'SG',
          created_at: '2026-05-26T00:00:00Z',
          updated_at: '2026-05-26T00:00:00Z',
        },
      ],
    });

    const list = await promise;
    expect(list.campuses[0]!.displayAddress).toBe('Singapore, SG');
  });

  it('pulls tenantName from TenantContextService', async () => {
    tenants.setCurrentTenant({
      id: 'tenant-009',
      name: 'Acme Learning Co',
      slug: 'acme',
      logoUrl: null,
    });
    const promise = firstValueFrom(service.getCampuses());
    httpMock
      .expectOne(`${environment.bffBaseUrl}/v1/campus`)
      .flush({ items: [] });
    const list = await promise;
    expect(list.tenantName).toBe('Acme Learning Co');
  });

  it('defaults tenantName to "Current tenant" when no tenant is set', async () => {
    tenants.setCurrentTenant(null as never);
    const promise = firstValueFrom(service.getCampuses());
    httpMock
      .expectOne(`${environment.bffBaseUrl}/v1/campus`)
      .flush({ items: [] });
    const list = await promise;
    expect(list.tenantName).toBe('Current tenant');
  });

  it('preserves backend ordering (newest-first per ListByTenant)', async () => {
    const promise = firstValueFrom(service.getCampuses());

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`);
    req.flush({
      items: [
        {
          id: 'campus-newest',
          tenant_id: 'tenant-001',
          name: 'Newest',
          address_l1: '',
          address_l2: '',
          city: 'Singapore',
          country: 'SG',
          created_at: '2026-05-26T10:00:00Z',
          updated_at: '2026-05-26T10:00:00Z',
        },
        {
          id: 'campus-oldest',
          tenant_id: 'tenant-001',
          name: 'Oldest',
          address_l1: '',
          address_l2: '',
          city: 'Singapore',
          country: 'SG',
          created_at: '2026-05-26T01:00:00Z',
          updated_at: '2026-05-26T01:00:00Z',
        },
      ],
    });

    const list = await promise;
    expect(list.campuses.map((c) => c.campusId)).toEqual([
      'campus-newest',
      'campus-oldest',
    ]);
  });

  it('POSTs /v1/campus with the snake_case payload (no tenant_id on the wire)', async () => {
    const promise = firstValueFrom(
      service.create({
        name: 'MTM SG — Jurong',
        addressLine1: '789 Jurong West St',
        addressLine2: '',
        city: 'Singapore',
        country: 'SG',
      }),
    );

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'MTM SG — Jurong',
      address_l1: '789 Jurong West St',
      address_l2: '',
      city: 'Singapore',
      country: 'SG',
    });
    expect(
      Object.prototype.hasOwnProperty.call(req.request.body, 'tenant_id'),
    ).toBe(false);

    req.flush(
      {
        id: 'campus-jurong-003',
        tenant_id: 'tenant-001',
        name: 'MTM SG — Jurong',
        address_l1: '789 Jurong West St',
        address_l2: '',
        city: 'Singapore',
        country: 'SG',
        created_at: '2026-06-02T00:00:00Z',
        updated_at: '2026-06-02T00:00:00Z',
      },
      { status: 201, statusText: 'Created' },
    );

    const created = await promise;
    expect(created.campusId).toBe('campus-jurong-003');
    expect(created.name).toBe('MTM SG — Jurong');
    expect(created.country).toBe('SG');
    expect(created.displayAddress).toBe('789 Jurong West St, Singapore, SG');
  });

  it('propagates a backend 400 (invalid country) so the caller fails loud', async () => {
    const promise = firstValueFrom(
      service.create({
        name: 'Bad Campus',
        addressLine1: '',
        addressLine2: '',
        city: '',
        country: 'ZZ',
      }),
    ).catch((e: unknown) => e);

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`);
    expect(req.request.method).toBe('POST');
    req.flush(
      { error: 'country must be ISO 3166-1 alpha-2 (e.g., SG)' },
      { status: 400, statusText: 'Bad Request' },
    );

    const err = await promise;
    expect((err as { status?: number }).status).toBe(400);
  });
});
