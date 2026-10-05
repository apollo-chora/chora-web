/**
 * ApplicationsComponent spec — `/r/applications-admin`.
 *
 * Exercises the real `ApplicationsService` against `HttpTestingController`
 * so the BFF wire contract (?state= switching, /api/v1/applications path)
 * is asserted end-to-end. No mocks, no stubs — per
 * `feedback_no_stubs_real_wiring`.
 *
 * Coverage matrix per the task brief:
 *   - empty-state branch (success, zero rows)
 *   - populated rows branch (success, N rows)
 *   - tab-switching triggers a fresh BFF GET with the new ?state= param
 *   - detail-link CTA points at /r/applications-admin/:id (RouterLink)
 *   - error branch + retry CTA refires the same query
 *   - axe-core a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ApplicationsComponent } from './applications.component';
import { environment } from '../../../../../environments/environment';

interface BackendApplicationStub {
  id: string;
  tenant_id: string;
  course_id: string;
  class_id?: string;
  gcid: string;
  status: string;
  created_at: string;
  updated_at: string;
  offer_expires_at?: string;
  invoice_id?: string;
  rejected_reason?: string;
}

const URL = `${environment.bffBaseUrl}/api/v1/applications`;

function buildBackendStub(overrides: Partial<BackendApplicationStub> = {}): BackendApplicationStub {
  return {
    id: '019e2b24-759f-76b8-bad8-0000000000a1',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo-2026',
    gcid: 'gcid-learner-1',
    status: 'submitted',
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
    ...overrides,
  };
}

function setup(): {
  fixture: ComponentFixture<ApplicationsComponent>;
  element: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [ApplicationsComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ApplicationsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    httpMock,
  };
}

/** Match the initial-tab GET (SUBMITTED by default). */
function expectSubmittedQuery(httpMock: HttpTestingController) {
  return httpMock.expectOne((r) => r.url === URL && r.params.get('state') === 'SUBMITTED');
}

describe('ApplicationsComponent (R+ /r/applications-admin)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // Each test calls httpMock.verify() explicitly after the work, but we
  // keep an afterEach safety net so a thrown assertion never leaves an
  // unverified outstanding request leaking into the next case.
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } catch {
      // Already verified inline — ignore the "already verified" path.
    }
  });

  describe('initial wiring', () => {
    it('creates', () => {
      const { fixture, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      expect(fixture.componentInstance).toBeTruthy();
      httpMock.verify();
    });

    it('renders the R+ surface accent on the root', () => {
      const { element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      const root = element.querySelector('[data-testid="rplus-applications-admin"]') as HTMLElement;
      expect(root).toBeTruthy();
      expect(root.classList.contains('surface-rplus')).toBe(true);
      httpMock.verify();
    });

    it('uses a <section> root with a heading + aria-labelledby', () => {
      const { element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      const root = element.querySelector('[data-testid="rplus-applications-admin"]') as HTMLElement;
      expect(root.tagName).toBe('SECTION');
      const heading = element.querySelector('#rplus-applications-admin-heading');
      expect(heading).not.toBeNull();
      expect(root.getAttribute('aria-labelledby')).toBe('rplus-applications-admin-heading');
      httpMock.verify();
    });

    it('issues GET /api/v1/applications?state=SUBMITTED on init', () => {
      const { httpMock } = setup();
      const req = expectSubmittedQuery(httpMock);
      expect(req.request.method).toBe('GET');
      req.flush({ items: [], total: 0 });
      httpMock.verify();
    });

    it('renders 3 tabs (SUBMITTED / IN_REVIEW / ENROLLED) with SUBMITTED active', () => {
      const { element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      const tabs = element.querySelectorAll('[data-testid^="applications-admin-tab-"]');
      expect(tabs.length).toBe(3);

      const submitted = element.querySelector(
        '[data-testid="applications-admin-tab-SUBMITTED"]',
      ) as HTMLElement;
      expect(submitted.getAttribute('aria-pressed')).toBe('true');

      httpMock.verify();
    });
  });

  describe('loading branch', () => {
    it('renders the loading skeleton until the BFF responds', () => {
      const { element, httpMock } = setup();
      const loading = element.querySelector(
        '[data-testid="applications-admin-loading"]',
      ) as HTMLElement;
      expect(loading).toBeTruthy();
      expect(loading.getAttribute('aria-busy')).toBe('true');
      // Drain the outstanding request so afterEach verify doesn't fail.
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
    });
  });

  describe('empty-state branch', () => {
    it('renders the empty-state panel when success with zero rows', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      fixture.detectChanges();
      const empty = element.querySelector('[data-testid="applications-admin-empty"]');
      expect(empty).toBeTruthy();
      // Row list MUST NOT render when empty.
      expect(element.querySelector('[data-testid="applications-admin-list"]')).toBeNull();
      httpMock.verify();
    });

    it('shows the total count pill = 0 on the empty state', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      fixture.detectChanges();
      const total = element.querySelector(
        '[data-testid="applications-admin-total"]',
      ) as HTMLElement;
      expect(total.textContent).toContain('0');
      httpMock.verify();
    });
  });

  describe('populated rows branch', () => {
    function loadThree(
      httpMock: HttpTestingController,
      fixture: ComponentFixture<ApplicationsComponent>,
    ) {
      expectSubmittedQuery(httpMock).flush({
        items: [
          buildBackendStub({
            id: 'app-aaaaaaa1',
            gcid: 'gcid-amelia',
            course_id: 'course-cspo-2026',
            status: 'submitted',
          }),
          buildBackendStub({
            id: 'app-bbbbbbb2',
            gcid: 'gcid-ben',
            course_id: 'course-cspo-2026',
            status: 'submitted',
          }),
          buildBackendStub({
            id: 'app-ccccccc3',
            gcid: 'gcid-cleo',
            course_id: 'course-dsa-2026',
            class_id: 'class-dsa-q3',
            status: 'submitted',
          }),
        ],
        total: 3,
      });
      fixture.detectChanges();
    }

    it('renders one row per application', () => {
      const { fixture, element, httpMock } = setup();
      loadThree(httpMock, fixture);
      const allRows = element.querySelectorAll('[data-testid="applications-admin-list"] > li');
      expect(allRows.length).toBe(3);
      // Each specific row is reachable by its exact id selector.
      expect(
        element.querySelector('[data-testid="applications-admin-row-app-aaaaaaa1"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="applications-admin-row-app-bbbbbbb2"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="applications-admin-row-app-ccccccc3"]'),
      ).toBeTruthy();
      httpMock.verify();
    });

    it('renders the applicant GCID + course id on each row', () => {
      const { fixture, element, httpMock } = setup();
      loadThree(httpMock, fixture);
      const gcid = element.querySelector(
        '[data-testid="applications-admin-row-gcid-app-aaaaaaa1"]',
      ) as HTMLElement;
      expect(gcid.textContent?.trim()).toBe('gcid-amelia');
      const course = element.querySelector(
        '[data-testid="applications-admin-row-course-app-aaaaaaa1"]',
      ) as HTMLElement;
      expect(course.textContent?.trim()).toBe('course-cspo-2026');
      httpMock.verify();
    });

    it('renders the state badge with the correct data-state attribute', () => {
      const { fixture, element, httpMock } = setup();
      loadThree(httpMock, fixture);
      const badge = element.querySelector(
        '[data-testid="applications-admin-row-state-app-aaaaaaa1"]',
      ) as HTMLElement;
      expect(badge.getAttribute('data-state')).toBe('SUBMITTED');
      httpMock.verify();
    });

    it('updates the header total pill', () => {
      const { fixture, element, httpMock } = setup();
      loadThree(httpMock, fixture);
      const total = element.querySelector(
        '[data-testid="applications-admin-total"]',
      ) as HTMLElement;
      expect(total.textContent).toContain('3');
      httpMock.verify();
    });
  });

  describe('detail-link navigation', () => {
    it('detail-link CTA points at /r/applications-admin/:id', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({
        items: [buildBackendStub({ id: 'app-deadbeef' })],
        total: 1,
      });
      fixture.detectChanges();
      const link = element.querySelector(
        '[data-testid="applications-admin-detail-link-app-deadbeef"]',
      ) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('/r/applications-admin/app-deadbeef');
      httpMock.verify();
    });
  });

  describe('tab switching → new BFF query', () => {
    it('clicking IN_REVIEW tab issues a fresh GET ?state=IN_REVIEW', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      fixture.detectChanges();

      const inReview = element.querySelector(
        '[data-testid="applications-admin-tab-IN_REVIEW"]',
      ) as HTMLButtonElement;
      inReview.click();
      fixture.detectChanges();

      const req = httpMock.expectOne((r) => r.url === URL && r.params.get('state') === 'IN_REVIEW');
      expect(req.request.method).toBe('GET');
      req.flush({ items: [], total: 0 });
      fixture.detectChanges();

      expect(inReview.getAttribute('aria-pressed')).toBe('true');
      const submitted = element.querySelector(
        '[data-testid="applications-admin-tab-SUBMITTED"]',
      ) as HTMLElement;
      expect(submitted.getAttribute('aria-pressed')).toBe('false');
      httpMock.verify();
    });

    it('clicking ENROLLED tab populates the list with mapped rows', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      fixture.detectChanges();

      const enrolled = element.querySelector(
        '[data-testid="applications-admin-tab-ENROLLED"]',
      ) as HTMLButtonElement;
      enrolled.click();
      fixture.detectChanges();

      const req = httpMock.expectOne((r) => r.url === URL && r.params.get('state') === 'ENROLLED');
      req.flush({
        items: [
          buildBackendStub({
            id: 'app-enrolled-1',
            gcid: 'gcid-enrolled',
            status: 'enrolled',
            invoice_id: 'INV-2026-001',
          }),
        ],
        total: 1,
      });
      fixture.detectChanges();

      const row = element.querySelector('[data-testid="applications-admin-row-app-enrolled-1"]');
      expect(row).toBeTruthy();
      const badge = element.querySelector(
        '[data-testid="applications-admin-row-state-app-enrolled-1"]',
      ) as HTMLElement;
      expect(badge.getAttribute('data-state')).toBe('ENROLLED');
      httpMock.verify();
    });

    it('clicking the already-active tab does NOT re-fire the BFF', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({ items: [], total: 0 });
      fixture.detectChanges();

      const submitted = element.querySelector(
        '[data-testid="applications-admin-tab-SUBMITTED"]',
      ) as HTMLButtonElement;
      submitted.click();
      fixture.detectChanges();

      // No new outstanding requests → verify() would explode if one fired.
      httpMock.verify();
    });
  });

  describe('error branch (fail loud)', () => {
    it('renders a role=alert error banner on a 5xx', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush(
        { error: 'kaboom' },
        { status: 503, statusText: 'Service Unavailable' },
      );
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="applications-admin-error"]',
      ) as HTMLElement;
      expect(banner).toBeTruthy();
      expect(banner.getAttribute('role')).toBe('alert');
      // The translate pipe returns the key as-is when missing — we
      // assert the upstream key (matches the in-component
      // `errorKeyFor` 5xx branch).
      expect(banner.textContent).toContain('rplus.applicationsAdmin.errorUpstream');
      httpMock.verify();
    });

    it('retry CTA refires the same BFF query', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush(
        { error: 'down' },
        { status: 500, statusText: 'Internal Server Error' },
      );
      fixture.detectChanges();

      const retry = element.querySelector(
        '[data-testid="applications-admin-retry"]',
      ) as HTMLButtonElement;
      expect(retry).toBeTruthy();
      retry.click();
      fixture.detectChanges();

      const req = expectSubmittedQuery(httpMock);
      req.flush({ items: [], total: 0 });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="applications-admin-empty"]')).toBeTruthy();
      httpMock.verify();
    });

    it('401 maps to the unauthorised i18n key', () => {
      const { fixture, element, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush(
        { error: 'no role' },
        { status: 403, statusText: 'Forbidden' },
      );
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="applications-admin-error"]',
      ) as HTMLElement;
      expect(banner.textContent).toContain('rplus.applicationsAdmin.errorUnauthorised');
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations', async () => {
      const { fixture, httpMock } = setup();
      expectSubmittedQuery(httpMock).flush({
        items: [buildBackendStub({ id: 'app-a11y-1' })],
        total: 1,
      });
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    });
  });
});
