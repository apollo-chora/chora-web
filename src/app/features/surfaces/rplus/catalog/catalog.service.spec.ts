import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { CatalogService } from './catalog.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

describe('CatalogService', () => {
  let service: CatalogService;
  let httpMock: HttpTestingController;
  let tenants: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogService);
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

  it('GETs /api/v1/courses?state=PUBLISHED&page_size=50 on the BFF', async () => {
    const promise = firstValueFrom(service.getCatalog());

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
        r.params.get('state') === 'PUBLISHED' &&
        r.params.get('page_size') === '50',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ items: [] });

    const catalog = await promise;
    expect(catalog.totalCourses).toBe(0);
    expect(catalog.courses).toEqual([]);
  });

  // J1 (CHO-1829) — draft visibility: the catalog is no longer PUBLISHED-only.
  // getCatalog(state) parameterises the CJ#2 `state` query param so the admin
  // can view DRAFT / AWAITING_REVIEW / ARCHIVED courses too.
  it('GETs ?state=DRAFT&page_size=50 when a DRAFT filter is passed', async () => {
    const promise = firstValueFrom(service.getCatalog('DRAFT'));

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
        r.params.get('state') === 'DRAFT' &&
        r.params.get('page_size') === '50',
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [{ id: 'draft-1', title: 'Draft One', state: 'DRAFT' }],
    });

    const catalog = await promise;
    expect(catalog.courses[0]!.status).toBe('Draft');
  });

  it('maps backend Course shape to CatalogCourse', async () => {
    const promise = firstValueFrom(service.getCatalog());

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
        r.params.get('state') === 'PUBLISHED',
    );
    req.flush({
      items: [
        {
          id: 'course-1',
          tenant_id: 'tenant-001',
          title: 'Certified Scrum Product Owner',
          description: 'Stakeholder alignment + value-driven release planning.',
          state: 'PUBLISHED',
          author_gcid: 'gcid-chen',
          test_set_ids: ['ts-a', 'ts-b', 'ts-c'],
          updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        },
      ],
    });

    const catalog = await promise;
    expect(catalog.totalCourses).toBe(1);
    const c = catalog.courses[0]!;
    expect(c.courseId).toBe('course-1');
    expect(c.title).toBe('Certified Scrum Product Owner');
    expect(c.code).toBe('CSPO');
    expect(c.summary).toContain('Stakeholder');
    expect(c.status).toBe('Published');
    expect(c.atomCount).toBe(3);
    expect(c.owner).toBe('gcid-chen');
    expect(c.lastUpdated).toContain('h ago');
  });

  it('renders Awaiting Review as a distinct status', async () => {
    const promise = firstValueFrom(service.getCatalog());

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
        r.params.get('state') === 'PUBLISHED',
    );
    req.flush({
      items: [
        {
          id: 'course-2',
          title: 'Advanced ScrumMaster',
          state: 'AWAITING_REVIEW',
        },
      ],
    });

    const catalog = await promise;
    expect(catalog.courses[0]!.status).toBe('Awaiting Review');
  });

  it('pulls tenantName from TenantContextService', async () => {
    tenants.setCurrentTenant({
      id: 'tenant-009',
      name: 'Acme Learning Co',
      slug: 'acme',
      logoUrl: null,
    });
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({ items: [] });
    const catalog = await promise;
    expect(catalog.tenantName).toBe('Acme Learning Co');
  });

  it('defaults tenantName to "Current tenant" when no tenant is set', async () => {
    tenants.setCurrentTenant(null as never);
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({ items: [] });
    const catalog = await promise;
    expect(catalog.tenantName).toBe('Current tenant');
  });

  it('defaults owner to "—" when author_gcid is missing', async () => {
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [{ id: 'course-3', title: 'Foundations 101', state: 'DRAFT' }],
      });
    const catalog = await promise;
    expect(catalog.courses[0]!.owner).toBe('–');
  });

  it('renders Archived as a distinct status (mapStatus ARCHIVED arm)', async () => {
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [{ id: 'course-arc', title: 'Legacy Course', state: 'ARCHIVED' }],
      });
    const catalog = await promise;
    expect(catalog.courses[0]!.status).toBe('Archived');
  });

  it('defaults summary to "" and atomCount to 0 when description + test_set_ids absent', async () => {
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [{ id: 'course-bare', title: 'Solo', state: 'PUBLISHED' }],
      });
    const catalog = await promise;
    expect(catalog.courses[0]!.summary).toBe('');
    expect(catalog.courses[0]!.atomCount).toBe(0);
  });

  // deriveCode FALSE path: fewer than 2 capitalised words → first-8-chars fallback.
  it('derives code from first 8 upper-cased chars when title has < 2 capitalised words', async () => {
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [
          { id: 'course-lc', title: 'introduction', state: 'PUBLISHED' },
        ],
      });
    const catalog = await promise;
    // 'introduction'.slice(0,8) = 'introduc' → 'INTRODUC'
    expect(catalog.courses[0]!.code).toBe('INTRODUC');
  });

  // formatRelative: invalid date string → NaN getTime → '—'.
  it('returns "—" for an unparseable updated_at (NaN date guard)', async () => {
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [
          {
            id: 'course-bad',
            title: 'Bad Timestamp',
            state: 'PUBLISHED',
            updated_at: 'not-a-real-date',
          },
        ],
      });
    const catalog = await promise;
    expect(catalog.courses[0]!.lastUpdated).toBe('–');
  });

  // formatRelative: diffMin < 1 → 'just now'.
  it('renders "just now" for a freshly-updated course', async () => {
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [
          {
            id: 'course-now',
            title: 'Just Now',
            state: 'PUBLISHED',
            updated_at: new Date().toISOString(),
          },
        ],
      });
    const catalog = await promise;
    expect(catalog.courses[0]!.lastUpdated).toBe('just now');
  });

  // formatRelative: 1 <= diffMin < 60 → 'Nm ago'.
  it('renders minutes-ago for a course updated within the hour', async () => {
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [
          {
            id: 'course-min',
            title: 'Minutes Ago',
            state: 'PUBLISHED',
            updated_at: new Date(Date.now() - 5 * 60000).toISOString(),
          },
        ],
      });
    const catalog = await promise;
    expect(catalog.courses[0]!.lastUpdated).toBe('5m ago');
  });

  // formatRelative: 1 <= diffD < 7 → 'Nd ago'.
  it('renders days-ago for a course updated within the week', async () => {
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [
          {
            id: 'course-day',
            title: 'Days Ago',
            state: 'PUBLISHED',
            updated_at: new Date(
              Date.now() - 3 * 24 * 3600 * 1000,
            ).toISOString(),
          },
        ],
      });
    const catalog = await promise;
    expect(catalog.courses[0]!.lastUpdated).toBe('3d ago');
  });

  // formatRelative: diffD >= 7 → absolute toLocaleDateString fallback.
  it('renders an absolute date for a course updated over a week ago', async () => {
    const old = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const promise = firstValueFrom(service.getCatalog());
    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      )
      .flush({
        items: [
          {
            id: 'course-old',
            title: 'Long Ago',
            state: 'PUBLISHED',
            updated_at: old.toISOString(),
          },
        ],
      });
    const catalog = await promise;
    expect(catalog.courses[0]!.lastUpdated).toBe(old.toLocaleDateString());
    expect(catalog.courses[0]!.lastUpdated).not.toContain('ago');
  });
});
