/**
 * SkillsFuturesClaimDetailComponent spec — R+ Wave-5 drill-down.
 *
 * Exercises the real `SkillsFuturesClaimDetailService` against
 * `HttpTestingController` so the BFF wire contract is asserted
 * end-to-end. No mocks, no stubs — per
 * `feedback_no_stubs_real_wiring`.
 *
 * Coverage matrix:
 *   - signal-input :id binding triggers the BFF GET
 *   - success branch renders all wire fields incl. NRIC truncation
 *     and SGD currency formatting
 *   - Approve / Reject CTAs visible only on PENDING; hidden otherwise
 *   - Approve CTA POSTs the BE endpoint + updates the local state
 *   - error branch + retry CTA
 *   - axe-core a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SkillsFuturesClaimDetailComponent } from './skillsfutures-claim-detail.component';
import { environment } from '../../../../../environments/environment';

interface BackendClaimStub {
  id: string;
  tenant_id: string;
  gcid: string;
  course_id: string;
  nric_hash: string;
  requested_amount_sgd_cents: number;
  approved_amount_sgd_cents: number;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISBURSED';
  submitted_at: string;
  decided_at?: string;
  decided_by_gcid?: string;
  rejection_reason?: string;
}

function backendStub(overrides: Partial<BackendClaimStub> = {}): BackendClaimStub {
  return {
    id: 'claim-001',
    tenant_id: 'tenant-001',
    gcid: 'gcid-phyllis',
    course_id: 'course-cspo',
    nric_hash: 'sha256:deadbeefcafe1234',
    requested_amount_sgd_cents: 50000,
    approved_amount_sgd_cents: 0,
    state: 'PENDING',
    submitted_at: '2026-05-20T10:00:00Z',
    ...overrides,
  };
}

function setup(id: string): {
  fixture: ComponentFixture<SkillsFuturesClaimDetailComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [SkillsFuturesClaimDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(SkillsFuturesClaimDetailComponent);
  fixture.componentRef.setInput('id', id);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock };
}

function url(id: string): string {
  return `${environment.bffBaseUrl}/api/v1/skillsfutures-claims/${encodeURIComponent(id)}`;
}

describe('SkillsFuturesClaimDetailComponent', () => {
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
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      const root = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="rplus-skillsfutures-claim-detail"]',
      );
      expect(root?.className).toContain('surface-rplus');
      httpMock.verify();
    });
  });

  describe('GET wiring', () => {
    it('issues GET /api/v1/skillsfutures-claims/{id} on initial render', () => {
      const { fixture, httpMock } = setup('claim-001');
      const req = httpMock.expectOne(url('claim-001'));
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

  describe('PENDING claim success branch', () => {
    let fixture: ComponentFixture<SkillsFuturesClaimDetailComponent>;
    let httpMock: HttpTestingController;
    let element: HTMLElement;

    beforeEach(() => {
      const built = setup('claim-001');
      fixture = built.fixture;
      httpMock = built.httpMock;
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the PENDING state badge', () => {
      const badge = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-state-claim-001"]',
      );
      // Badge text comes through the translate pipe; with no i18n loaded in the
      // unit env it emits the raw key (component selects the key; i18n resolves).
      expect(badge?.textContent?.trim()).toBe('rplus.skillsfuturesClaims.state.PENDING');
    });

    it('renders the learner gcid + course id', () => {
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-learner"]')?.textContent,
      ).toContain('gcid-phyllis');
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-course"]')?.textContent,
      ).toContain('course-cspo');
    });

    it('renders the truncated NRIC hash', () => {
      const nric = element.querySelector('[data-testid="skillsfutures-claim-detail-nric"]');
      // shortNricHash drops the `sha256:` prefix + truncates to 12 chars
      // → `deadbeefcafe…`.
      expect(nric?.textContent).toContain('deadbeefcafe');
      expect(nric?.textContent).toContain('…');
      // Full hash exposed on hover via the title attribute.
      expect(nric?.getAttribute('title')).toBe('sha256:deadbeefcafe1234');
    });

    it('renders the requested amount as SGD currency', () => {
      // 50000 SGD cents → $500.00 (en-SG locale).
      const requested = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-requested"]',
      );
      expect(requested?.textContent).toContain('500.00');
    });

    it('renders the back-to-list breadcrumb link', () => {
      const back = element.querySelector('[data-testid="skillsfutures-claim-detail-back-link"]');
      expect(back?.tagName).toBe('A');
      expect(back?.getAttribute('href')).toBe('/r/skillsfutures-claims');
    });

    it('exposes Approve + Reject CTAs on a PENDING claim', () => {
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-approve"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-reject"]'),
      ).not.toBeNull();
    });

    it('Approve CTA POSTs to /{id}/approve with requested amount', () => {
      const approve = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-approve"]',
      ) as HTMLButtonElement;
      approve.click();
      const req = httpMock.expectOne(url('claim-001') + '/approve');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ approved_amount_sgd_cents: 50000 });
      req.flush(
        backendStub({
          state: 'APPROVED',
          approved_amount_sgd_cents: 50000,
          decided_at: '2026-05-26T11:00:00Z',
          decided_by_gcid: 'gcid-admin',
        }),
      );
      fixture.detectChanges();
      const badge = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-state-claim-001"]',
      );
      expect(badge?.textContent?.trim()).toBe('rplus.skillsfuturesClaims.state.APPROVED');
      // Approve / Reject hidden post-transition.
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-approve"]'),
      ).toBeNull();
    });
  });

  describe('APPROVED claim branch', () => {
    it('hides Approve / Reject CTAs', () => {
      const { fixture, httpMock } = setup('claim-002');
      httpMock.expectOne(url('claim-002')).flush(
        backendStub({
          id: 'claim-002',
          state: 'APPROVED',
          approved_amount_sgd_cents: 40000,
          decided_at: '2026-05-22T12:00:00Z',
          decided_by_gcid: 'gcid-admin',
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-approve"]'),
      ).toBeNull();
      const approved = element.querySelector('[data-testid="skillsfutures-claim-detail-approved"]');
      // 40000 cents → $400.00.
      expect(approved?.textContent).toContain('400.00');
      const decidedBy = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-decided-by"]',
      );
      expect(decidedBy?.textContent).toContain('gcid-admin');
      httpMock.verify();
    });
  });

  describe('REJECTED claim branch', () => {
    it('shows the rejection reason', () => {
      const { fixture, httpMock } = setup('claim-003');
      httpMock.expectOne(url('claim-003')).flush(
        backendStub({
          id: 'claim-003',
          state: 'REJECTED',
          decided_at: '2026-05-23T12:00:00Z',
          decided_by_gcid: 'gcid-admin',
          rejection_reason: 'missing supporting docs',
        }),
      );
      fixture.detectChanges();
      const reason = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="skillsfutures-claim-detail-reason"]',
      );
      expect(reason?.textContent).toContain('missing supporting docs');
      httpMock.verify();
    });
  });

  describe('error branch', () => {
    it('renders the 404 not-found banner with Retry CTA', () => {
      const { fixture, httpMock } = setup('missing');
      httpMock.expectOne(url('missing')).flush('claim not found', {
        status: 404,
        statusText: 'Not Found',
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const err = element.querySelector('[data-testid="skillsfutures-claim-detail-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-retry"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('retry CTA refires the GET with the same id', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush('upstream', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      fixture.detectChanges();
      const retry = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="skillsfutures-claim-detail-retry"]',
      ) as HTMLButtonElement;
      retry.click();
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      const panel = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="skillsfutures-claim-detail-panel-claim-001"]',
      );
      expect(panel).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations', async () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
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

  describe('loading state', () => {
    it('renders the loading status before the GET resolves', () => {
      const { fixture, httpMock } = setup('claim-001');
      const element = fixture.nativeElement as HTMLElement;
      const loading = element.querySelector('[data-testid="skillsfutures-claim-detail-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      // isLoading()/isError()/claim() computed reflect the loading discriminant.
      expect(fixture.componentInstance.isLoading()).toBe(true);
      expect(fixture.componentInstance.isError()).toBe(false);
      expect(fixture.componentInstance.claim()).toBeNull();
      expect(fixture.componentInstance.loadState().status).toBe('loading');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      // Loading panel removed once the success branch renders.
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-loading"]'),
      ).toBeNull();
      httpMock.verify();
    });
  });

  describe('shell header (always rendered)', () => {
    it('echoes the :id signal-input in the claim-id code element', () => {
      const { fixture, httpMock } = setup('claim-777');
      const idCode = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="skillsfutures-claim-detail-id"]',
      );
      // Header renders the id even while loading (above the @if blocks).
      expect(idCode?.textContent?.trim()).toBe('claim-777');
      httpMock.expectOne(url('claim-777')).flush(backendStub({ id: 'claim-777' }));
      fixture.detectChanges();
      httpMock.verify();
    });

    it('renders the breadcrumb root + title + back CTA on success', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-title"]')?.textContent,
      ).toContain('rplus.skillsfuturesClaimDetail.title');
      const backCta = element.querySelector('[data-testid="skillsfutures-claim-detail-back-cta"]');
      expect(backCta?.tagName).toBe('A');
      expect(backCta?.getAttribute('href')).toBe('/r/skillsfutures-claims');
      httpMock.verify();
    });
  });

  describe('DISBURSED claim branch', () => {
    it('renders the badge-info variant + approved amount, hides CTAs', () => {
      const { fixture, httpMock } = setup('claim-d');
      httpMock.expectOne(url('claim-d')).flush(
        backendStub({
          id: 'claim-d',
          state: 'DISBURSED',
          approved_amount_sgd_cents: 30000,
          decided_at: '2026-05-24T12:00:00Z',
          decided_by_gcid: 'gcid-admin',
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const badge = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-state-claim-d"]',
      );
      expect(badge?.className).toContain('badge-info');
      expect(badge?.textContent?.trim()).toBe('rplus.skillsfuturesClaims.state.DISBURSED');
      // DISBURSED renders the approved amount (30000 cents → $300.00).
      const approved = element.querySelector('[data-testid="skillsfutures-claim-detail-approved"]');
      expect(approved?.textContent).toContain('300.00');
      // No decision CTAs on a non-PENDING claim.
      expect(fixture.componentInstance.canDecide()).toBe(false);
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-approve"]'),
      ).toBeNull();
      httpMock.verify();
    });
  });

  describe('badge() / sgd() / nric() helpers', () => {
    it('maps each state to its polyglass badge variant', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      expect(cmp.badge('PENDING')).toBe('badge-warning');
      expect(cmp.badge('APPROVED')).toBe('badge-success');
      expect(cmp.badge('REJECTED')).toBe('badge-neutral');
      expect(cmp.badge('DISBURSED')).toBe('badge-info');
      httpMock.verify();
    });

    it('formats SGD cents and truncates the NRIC hash', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      expect(cmp.sgd(50000)).toContain('500.00');
      expect(cmp.nric('sha256:deadbeefcafe1234')).toBe('deadbeefcafe…');
      // short body (≤12 after prefix) returns verbatim, no ellipsis.
      expect(cmp.nric('sha256:abc')).toBe('abc');
      httpMock.verify();
    });
  });

  describe('decidedAt rendering', () => {
    it('renders the decided-at time element on a decided claim', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(
        backendStub({
          state: 'APPROVED',
          approved_amount_sgd_cents: 50000,
          decided_at: '2026-05-26T11:00:00Z',
          decided_by_gcid: 'gcid-admin',
        }),
      );
      fixture.detectChanges();
      const decidedAt = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="skillsfutures-claim-detail-decided-at"]',
      );
      expect(decidedAt?.getAttribute('datetime')).toBe('2026-05-26T11:00:00Z');
      expect(decidedAt?.textContent).toContain('2026-05-26T11:00:00Z');
      httpMock.verify();
    });
  });

  describe('Reject CTA', () => {
    it('POSTs to /{id}/reject with a placeholder reason + updates state', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const reject = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-reject"]',
      ) as HTMLButtonElement;
      reject.click();
      const req = httpMock.expectOne(url('claim-001') + '/reject');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        rejection_reason: 'rejected via admin detail view',
      });
      req.flush(
        backendStub({
          state: 'REJECTED',
          decided_at: '2026-05-26T11:00:00Z',
          decided_by_gcid: 'gcid-admin',
          rejection_reason: 'rejected via admin detail view',
        }),
      );
      fixture.detectChanges();
      const badge = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-state-claim-001"]',
      );
      expect(badge?.textContent?.trim()).toBe('rplus.skillsfuturesClaims.state.REJECTED');
      // CTAs gone post-transition.
      expect(element.querySelector('[data-testid="skillsfutures-claim-detail-reject"]')).toBeNull();
      // Rejection reason surfaced.
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-reason"]')?.textContent,
      ).toContain('rejected via admin detail view');
      httpMock.verify();
    });
  });

  describe('write-pending gating', () => {
    it('disables both CTAs while a write is in flight, re-enables on error', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const cmp = fixture.componentInstance;
      const approve = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-approve"]',
      ) as HTMLButtonElement;
      const reject = element.querySelector(
        '[data-testid="skillsfutures-claim-detail-reject"]',
      ) as HTMLButtonElement;
      approve.click();
      expect(cmp.isWritePending()).toBe(true);
      fixture.detectChanges();
      // Both CTAs disabled mid-flight.
      expect(approve.disabled).toBe(true);
      expect(reject.disabled).toBe(true);
      // A second approve click while pending is a no-op (no extra request).
      approve.click();
      const inFlight = httpMock.expectOne(url('claim-001') + '/approve');
      // Resolve with a 500 → write-pending cleared, error branch shown.
      inFlight.flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(cmp.isWritePending()).toBe(false);
      expect(cmp.isError()).toBe(true);
      expect(cmp.errorKey()).toBe('rplus.skillsfuturesClaimDetail.errorUpstream');
      httpMock.verify();
    });
  });

  describe('approve / reject error paths', () => {
    it('surfaces a 409 conflict error when approve is rejected by the BE', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      fixture.componentInstance.approve();
      httpMock
        .expectOne(url('claim-001') + '/approve')
        .flush('conflict', { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe(
        'rplus.skillsfuturesClaimDetail.errorConflict',
      );
      httpMock.verify();
    });

    it('surfaces a 403 unauthorised error when reject lacks admin role', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      fixture.componentInstance.reject();
      httpMock
        .expectOne(url('claim-001') + '/reject')
        .flush('forbidden', { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe(
        'rplus.skillsfuturesClaimDetail.errorUnauthorised',
      );
      httpMock.verify();
    });
  });

  describe('decision guards (direct method calls)', () => {
    it('approve() is a no-op when the claim is not PENDING', () => {
      const { fixture, httpMock } = setup('claim-a');
      httpMock.expectOne(url('claim-a')).flush(
        backendStub({
          id: 'claim-a',
          state: 'APPROVED',
          approved_amount_sgd_cents: 50000,
          decided_at: '2026-05-26T11:00:00Z',
          decided_by_gcid: 'gcid-admin',
        }),
      );
      fixture.detectChanges();
      // canDecide() false → no write issued.
      fixture.componentInstance.approve();
      fixture.componentInstance.reject();
      httpMock.verify(); // verify() fails if any unexpected request was made
      expect(fixture.componentInstance.isWritePending()).toBe(false);
    });

    it('approve()/reject() are no-ops while in the error (no-claim) state', () => {
      const { fixture, httpMock } = setup('missing');
      httpMock.expectOne(url('missing')).flush('nope', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      expect(fixture.componentInstance.claim()).toBeNull();
      fixture.componentInstance.approve();
      fixture.componentInstance.reject();
      httpMock.verify(); // no write requests fired
    });
  });

  describe('error-key mapping (generic / 401)', () => {
    it('maps a 401 to the unauthorised key', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock
        .expectOne(url('claim-001'))
        .flush('no auth', { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe(
        'rplus.skillsfuturesClaimDetail.errorUnauthorised',
      );
      httpMock.verify();
    });

    it('maps an unclassified 4xx to the generic key', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock
        .expectOne(url('claim-001'))
        .flush('teapot', { status: 418, statusText: "I'm a teapot" });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(fixture.componentInstance.errorKey()).toBe(
        'rplus.skillsfuturesClaimDetail.errorGeneric',
      );
      expect(
        element.querySelector('[data-testid="skillsfutures-claim-detail-error"]'),
      ).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('effect re-fetch on :id change', () => {
    it('re-issues the GET when the :id signal-input changes', () => {
      const { fixture, httpMock } = setup('claim-001');
      httpMock.expectOne(url('claim-001')).flush(backendStub());
      fixture.detectChanges();
      // Change the route param → the effect re-fetches.
      fixture.componentRef.setInput('id', 'claim-002');
      fixture.detectChanges();
      httpMock
        .expectOne(url('claim-002'))
        .flush(backendStub({ id: 'claim-002', gcid: 'gcid-other' }));
      fixture.detectChanges();
      const learner = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="skillsfutures-claim-detail-learner"]',
      );
      expect(learner?.textContent).toContain('gcid-other');
      httpMock.verify();
    });
  });
});
