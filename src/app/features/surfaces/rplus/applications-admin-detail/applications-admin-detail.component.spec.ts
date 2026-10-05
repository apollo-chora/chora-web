/**
 * ApplicationsAdminDetailComponent spec — R+ Wave-5 drill-down.
 *
 * Exercises the real `ApplicationsAdminDetailService` against
 * `HttpTestingController` so the BFF wire contract is asserted
 * end-to-end. No mocks, no stubs — per
 * `feedback_no_stubs_real_wiring`.
 *
 * Coverage matrix:
 *   - signal-input :id binding triggers the BFF GET
 *   - success branch renders all wire fields incl. history timeline
 *   - history-empty branch shows the empty message
 *   - funding-lines section shows only when present
 *   - error branch + retry CTA
 *   - axe-core a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ApplicationsAdminDetailComponent } from './applications-admin-detail.component';
import { environment } from '../../../../../environments/environment';

interface BackendApplicationDetailStub {
  id: string;
  tenant_id: string;
  course_id: string;
  class_id?: string;
  gcid: string;
  status: string;
  created_at: string;
  updated_at: string;
  offer_expires_at?: string;
  stripe_payment_intent_id?: string;
  invoice_id?: string;
  rejected_reason?: string;
  withdrawn_reason?: string;
  history?: Array<{ from: string; to: string; at: string; reason?: string }>;
  funding_lines?: Array<{
    source: string;
    amount_sgd_cents: number;
    reference?: string;
  }>;
}

function backendStub(
  overrides: Partial<BackendApplicationDetailStub> = {},
): BackendApplicationDetailStub {
  return {
    id: 'app-99',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    gcid: 'gcid-phyllis',
    status: 'submitted',
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
    history: [{ from: '', to: 'submitted', at: '2026-05-26T10:00:00Z' }],
    ...overrides,
  };
}

function setup(id: string): {
  fixture: ComponentFixture<ApplicationsAdminDetailComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [ApplicationsAdminDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ApplicationsAdminDetailComponent);
  fixture.componentRef.setInput('id', id);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock };
}

function url(id: string): string {
  return `${environment.bffBaseUrl}/api/v1/applications/${encodeURIComponent(id)}`;
}

describe('ApplicationsAdminDetailComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } catch {
      /* explicit verify already happened in the test body */
    }
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const { fixture, httpMock } = setup('app-99');
      httpMock.expectOne(url('app-99')).flush(backendStub());
      fixture.detectChanges();
      const root = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="rplus-applications-admin-detail"]',
      );
      expect(root?.className).toContain('surface-rplus');
      httpMock.verify();
    });
  });

  describe('GET wiring', () => {
    it('issues GET /api/v1/applications/{id} on initial render', () => {
      const { fixture, httpMock } = setup('app-99');
      const req = httpMock.expectOne(url('app-99'));
      expect(req.request.method).toBe('GET');
      req.flush(backendStub());
      fixture.detectChanges();
      httpMock.verify();
    });

    it('URL-encodes the id segment', () => {
      const { fixture, httpMock } = setup('with/slash');
      httpMock.expectOne(url('with/slash')).flush(backendStub({ id: 'with/slash' }));
      fixture.detectChanges();
      httpMock.verify();
    });
  });

  describe('success branch', () => {
    let fixture: ComponentFixture<ApplicationsAdminDetailComponent>;
    let httpMock: HttpTestingController;
    let element: HTMLElement;

    beforeEach(() => {
      const built = setup('app-99');
      fixture = built.fixture;
      httpMock = built.httpMock;
      httpMock.expectOne(url('app-99')).flush(
        backendStub({
          id: 'app-99',
          status: 'under_review',
          class_id: 'class-Sep2026',
          invoice_id: 'CHO-INV-001',
          history: [
            { from: '', to: 'submitted', at: '2026-05-26T10:00:00Z' },
            {
              from: 'submitted',
              to: 'under_review',
              at: '2026-05-27T09:30:00Z',
            },
          ],
        }),
      );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the IN_REVIEW state badge (normalised from under_review)', () => {
      const badge = element.querySelector('[data-testid="applications-admin-detail-state-app-99"]');
      expect(badge?.getAttribute('data-state')).toBe('IN_REVIEW');
    });

    it('renders the applicant gcid', () => {
      const gcid = element.querySelector('[data-testid="applications-admin-detail-gcid"]');
      expect(gcid?.textContent).toContain('gcid-phyllis');
    });

    it('renders the course + class metadata', () => {
      expect(
        element.querySelector('[data-testid="applications-admin-detail-course"]')?.textContent,
      ).toContain('course-cspo');
      expect(
        element.querySelector('[data-testid="applications-admin-detail-class"]')?.textContent,
      ).toContain('class-Sep2026');
    });

    it('renders the invoice id when supplied', () => {
      expect(
        element.querySelector('[data-testid="applications-admin-detail-invoice"]')?.textContent,
      ).toContain('CHO-INV-001');
    });

    it('renders the back-to-list breadcrumb link', () => {
      const back = element.querySelector('[data-testid="applications-admin-detail-back-link"]');
      expect(back?.tagName).toBe('A');
      expect(back?.getAttribute('href')).toBe('/r/applications-admin');
    });

    it('renders the bottom back CTA', () => {
      const back = element.querySelector('[data-testid="applications-admin-detail-back-cta"]');
      expect(back).not.toBeNull();
    });

    it('renders the history timeline with two entries', () => {
      const list = element.querySelector('[data-testid="applications-admin-detail-history-list"]');
      expect(list?.tagName).toBe('OL');
      const rows = element.querySelectorAll('[data-testid^="applications-admin-detail-history-"]');
      // 2 rows + 1 list container (matches data-testid prefix)
      // Filter to just rows by checking for a trailing numeric index.
      const onlyRows = Array.from(rows).filter((r) =>
        /-history-\d+$/.test(r.getAttribute('data-testid') ?? ''),
      );
      expect(onlyRows.length).toBe(2);
    });
  });

  describe('history-empty branch', () => {
    it('shows the history-empty message when history[] is empty', () => {
      const { fixture, httpMock } = setup('app-1');
      httpMock.expectOne(url('app-1')).flush(
        backendStub({
          id: 'app-1',
          status: 'submitted',
          history: [],
        }),
      );
      fixture.detectChanges();
      const empty = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-history-empty"]',
      );
      expect(empty).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('funding-lines section', () => {
    it('renders funding lines + SGD-formatted amount when present', () => {
      const { fixture, httpMock } = setup('app-5');
      httpMock.expectOne(url('app-5')).flush(
        backendStub({
          id: 'app-5',
          status: 'offer_made',
          funding_lines: [
            {
              source: 'SkillsFutures Credit',
              amount_sgd_cents: 50000,
              reference: 'sf-claim-001',
            },
          ],
        }),
      );
      fixture.detectChanges();
      const list = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-funding-list"]',
      );
      expect(list).not.toBeNull();
      const row = list?.querySelector('[data-testid="applications-admin-detail-funding-0"]');
      // 50000 SGD cents → $500.00 in en-SG locale.
      expect(row?.textContent).toContain('500.00');
      httpMock.verify();
    });

    it('omits the funding section when funding_lines is empty', () => {
      const { fixture, httpMock } = setup('app-6');
      httpMock.expectOne(url('app-6')).flush(backendStub({ id: 'app-6' }));
      fixture.detectChanges();
      const list = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-funding-list"]',
      );
      expect(list).toBeNull();
      httpMock.verify();
    });
  });

  describe('error branch', () => {
    it('renders the 404 not-found banner with Retry CTA', () => {
      const { fixture, httpMock } = setup('missing');
      httpMock.expectOne(url('missing')).flush('not found', {
        status: 404,
        statusText: 'Not Found',
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const err = element.querySelector('[data-testid="applications-admin-detail-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(
        element.querySelector('[data-testid="applications-admin-detail-retry"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('retry CTA refires the GET with the same id', () => {
      const { fixture, httpMock } = setup('app-1');
      httpMock.expectOne(url('app-1')).flush('upstream', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      fixture.detectChanges();
      const retry = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-retry"]',
      ) as HTMLButtonElement;
      retry.click();
      httpMock.expectOne(url('app-1')).flush(backendStub({ id: 'app-1' }));
      fixture.detectChanges();
      const panel = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-panel-app-1"]',
      );
      expect(panel).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('error branch — errorKeyFor arms', () => {
    it('maps 401 to the unauthorised key', () => {
      const { fixture, httpMock } = setup('app-401');
      httpMock.expectOne(url('app-401')).flush('no', {
        status: 401,
        statusText: 'Unauthorized',
      });
      fixture.detectChanges();
      const err = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-error"]',
      );
      expect(err).not.toBeNull();
      // 401 → errorUnauthorised; translate pipe echoes the key when unmapped.
      expect(err?.textContent).toContain('rplus.applicationsAdminDetail.errorUnauthorised');
      httpMock.verify();
    });

    it('maps 403 to the unauthorised key', () => {
      const { fixture, httpMock } = setup('app-403');
      httpMock.expectOne(url('app-403')).flush('forbidden', {
        status: 403,
        statusText: 'Forbidden',
      });
      fixture.detectChanges();
      const err = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-error"]',
      );
      expect(err?.textContent).toContain('rplus.applicationsAdminDetail.errorUnauthorised');
      httpMock.verify();
    });

    it('maps an upstream 500 to the upstream key', () => {
      const { fixture, httpMock } = setup('app-500');
      httpMock.expectOne(url('app-500')).flush('boom', {
        status: 500,
        statusText: 'Internal Server Error',
      });
      fixture.detectChanges();
      const err = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-error"]',
      );
      expect(err?.textContent).toContain('rplus.applicationsAdminDetail.errorUpstream');
      httpMock.verify();
    });

    it('maps a non-special 4xx (400) to the generic key', () => {
      const { fixture, httpMock } = setup('app-400');
      httpMock.expectOne(url('app-400')).flush('bad', {
        status: 400,
        statusText: 'Bad Request',
      });
      fixture.detectChanges();
      const err = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-error"]',
      );
      // 400 is not 404/401/403 and not >=500 → falls through to errorGeneric.
      expect(err?.textContent).toContain('rplus.applicationsAdminDetail.errorGeneric');
      httpMock.verify();
    });

    it('maps an error with no numeric status to the generic key', () => {
      const { fixture, httpMock } = setup('app-net');
      // status 0 (network/CORS) — HttpErrorResponse exposes status 0, which
      // is a number but matches none of the mapped codes → errorGeneric.
      httpMock
        .expectOne(url('app-net'))
        .error(new ProgressEvent('error'), { status: 0, statusText: '' });
      fixture.detectChanges();
      const err = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-error"]',
      );
      expect(err?.textContent).toContain('rplus.applicationsAdminDetail.errorGeneric');
      httpMock.verify();
    });
  });

  describe('optional field render arms', () => {
    it('renders offer-expiry, stripe-intent, rejected + withdrawn reasons when present', () => {
      const { fixture, httpMock } = setup('app-opt');
      httpMock.expectOne(url('app-opt')).flush(
        backendStub({
          id: 'app-opt',
          status: 'rejected',
          offer_expires_at: '2026-06-10T00:00:00Z',
          stripe_payment_intent_id: 'pi_test_123',
          rejected_reason: 'Incomplete portfolio',
          withdrawn_reason: 'Changed plans',
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="applications-admin-detail-rejected-reason"]')
          ?.textContent,
      ).toContain('Incomplete portfolio');
      expect(
        element.querySelector('[data-testid="applications-admin-detail-withdrawn-reason"]')
          ?.textContent,
      ).toContain('Changed plans');
      // stripe intent code renders (no dedicated testid — assert by content).
      expect(element.textContent).toContain('pi_test_123');
      expect(element.textContent).toContain('2026-06-10T00:00:00Z');
      httpMock.verify();
    });

    it('omits the class field when class_id is absent', () => {
      const { fixture, httpMock } = setup('app-noclass');
      httpMock.expectOne(url('app-noclass')).flush(backendStub({ id: 'app-noclass' }));
      fixture.detectChanges();
      const cls = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-class"]',
      );
      expect(cls).toBeNull();
      httpMock.verify();
    });
  });

  describe('history transition arms', () => {
    it('renders the from→to arrow only on non-genesis rows and reasons when present', () => {
      const { fixture, httpMock } = setup('app-hist');
      httpMock.expectOne(url('app-hist')).flush(
        backendStub({
          id: 'app-hist',
          status: 'rejected',
          history: [
            // genesis row: empty `from` → no arrow branch
            { from: '', to: 'submitted', at: '2026-05-26T10:00:00Z' },
            // non-genesis WITH reason → arrow branch + reason branch
            {
              from: 'submitted',
              to: 'rejected',
              at: '2026-05-27T09:30:00Z',
              reason: 'Did not meet criteria',
            },
          ],
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const genesis = element.querySelector('[data-testid="applications-admin-detail-history-0"]');
      const second = element.querySelector('[data-testid="applications-admin-detail-history-1"]');
      // genesis row has no `from` code chip
      expect(genesis?.querySelector('.applications-admin-detail__history-from')).toBeNull();
      // non-genesis row has a from chip + arrow
      expect(
        second?.querySelector('.applications-admin-detail__history-from')?.textContent,
      ).toContain('submitted');
      // reason renders on the second row
      expect(second?.textContent).toContain('Did not meet criteria');
      httpMock.verify();
    });
  });

  describe('funding-line reference arm', () => {
    it('renders a funding line without a reference code chip', () => {
      const { fixture, httpMock } = setup('app-noref');
      httpMock.expectOne(url('app-noref')).flush(
        backendStub({
          id: 'app-noref',
          status: 'offer_made',
          funding_lines: [{ source: 'Self-pay', amount_sgd_cents: 12345 }],
        }),
      );
      fixture.detectChanges();
      const row = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="applications-admin-detail-funding-0"]',
      );
      expect(row).not.toBeNull();
      // 12345 cents → $123.45
      expect(row?.textContent).toContain('123.45');
      // no reference → the ref code chip is absent
      expect(row?.querySelector('.applications-admin-detail__funding-ref')).toBeNull();
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations', async () => {
      const { fixture, httpMock } = setup('app-99');
      httpMock.expectOne(url('app-99')).flush(backendStub());
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);
  });
});
