/**
 * SkillsFuturesClaimsComponent spec — R+ /r/skillsfutures-claims.
 *
 * Verifies the screen wires the BFF list response into the polyglass row
 * layout: tenant pill, total count, per-row Approve+Reject CTAs only on
 * PENDING rows, SSG shield pill, NRIC truncation. Uses HttpTestingController
 * (real BFF wiring) per feedback_no_stubs_real_wiring.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SkillsFuturesClaimsComponent } from './skillsfutures-claims.component';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}/api/v1/skillsfutures-claims`;

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

const STUB_CLAIMS: readonly BackendClaimStub[] = [
  {
    id: 'claim-pending-001',
    tenant_id: 'tenant-001',
    gcid: 'gcid-phyllis',
    course_id: 'course-cspo',
    nric_hash: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    requested_amount_sgd_cents: 50000,
    approved_amount_sgd_cents: 0,
    state: 'PENDING',
    submitted_at: '2026-05-26T09:00:00Z',
  },
  {
    id: 'claim-approved-002',
    tenant_id: 'tenant-001',
    gcid: 'gcid-mei',
    course_id: 'course-dsa-101',
    nric_hash: 'sha256:f00ba4f00ba4f00ba4',
    requested_amount_sgd_cents: 30000,
    approved_amount_sgd_cents: 25000,
    state: 'APPROVED',
    submitted_at: '2026-05-20T10:00:00Z',
    decided_at: '2026-05-22T12:00:00Z',
    decided_by_gcid: 'gcid-admin',
  },
  {
    id: 'claim-rejected-003',
    tenant_id: 'tenant-001',
    gcid: 'gcid-ren',
    course_id: 'course-asm-2',
    nric_hash: 'sha256:cafebabecafe',
    requested_amount_sgd_cents: 40000,
    approved_amount_sgd_cents: 0,
    state: 'REJECTED',
    submitted_at: '2026-05-19T08:00:00Z',
    decided_at: '2026-05-21T14:00:00Z',
    decided_by_gcid: 'gcid-admin',
    rejection_reason: 'Missing supporting documents',
  },
];

function setup(): {
  fixture: ComponentFixture<SkillsFuturesClaimsComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [SkillsFuturesClaimsComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const tenants = TestBed.inject(TenantContextService);
  tenants.setCurrentTenant({
    id: 'tenant-001',
    name: 'MTM Singapore',
    slug: 'mtm',
    logoUrl: null,
  });
  const fixture = TestBed.createComponent(SkillsFuturesClaimsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock.expectOne(BASE).flush({ items: STUB_CLAIMS });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('SkillsFuturesClaimsComponent', () => {
  let fixture: ComponentFixture<SkillsFuturesClaimsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const root = element.querySelector('[data-testid="rplus-skillsfutures-claims"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('uses a semantic <section> root', () => {
      const root = element.querySelector('[data-testid="rplus-skillsfutures-claims"]');
      expect(root?.tagName).toBe('SECTION');
    });

    it('renders the SkillsFutures-aligned shield pill', () => {
      const pill = element.querySelector('[data-testid="skillsfutures-claims-pill"]');
      expect(pill).not.toBeNull();
    });
  });

  describe('header', () => {
    it('shows the current tenant name from TenantContextService', () => {
      const tenant = element.querySelector('[data-testid="skillsfutures-claims-tenant"]');
      expect(tenant?.textContent).toContain('MTM Singapore');
    });

    it('shows total claims count from the BFF response', () => {
      const total = element.querySelector('[data-testid="skillsfutures-claims-total"]');
      expect(total?.textContent).toContain('3');
    });

    it('renders a state filter dropdown', () => {
      const filter = element.querySelector<HTMLSelectElement>(
        '[data-testid="skillsfutures-claims-state-filter"]',
      );
      expect(filter).not.toBeNull();
      expect(filter?.tagName).toBe('SELECT');
      const options = filter?.querySelectorAll('option') ?? [];
      // 1 "All" + 4 canonical states
      expect(options.length).toBe(5);
    });
  });

  describe('list', () => {
    it('renders one row per claim (3 total)', () => {
      const rows = element.querySelectorAll('[data-testid^="skillsfutures-claims-row-"]');
      expect(rows.length).toBe(3);
    });

    it('renders the PENDING claim with learner gcid and course id', () => {
      const row = element.querySelector(
        '[data-testid="skillsfutures-claims-row-claim-pending-001"]',
      );
      expect(row?.textContent).toContain('gcid-phyllis');
      expect(row?.textContent).toContain('course-cspo');
    });

    it('renders the PENDING badge for awaiting decisions', () => {
      const badge = element.querySelector(
        '[data-testid="skillsfutures-claims-state-claim-pending-001"]',
      );
      // The badge renders via the translate pipe; with no i18n loaded in the
      // unit env it emits the raw key. The component's unit responsibility is
      // selecting the correct state key — resolution is i18n's concern.
      expect(badge?.textContent?.trim()).toBe('rplus.skillsfuturesClaims.state.PENDING');
    });

    it('renders the APPROVED badge + approved amount for decided claims', () => {
      const badge = element.querySelector(
        '[data-testid="skillsfutures-claims-state-claim-approved-002"]',
      );
      expect(badge?.textContent?.trim()).toBe('rplus.skillsfuturesClaims.state.APPROVED');
      const approved = element.querySelector(
        '[data-testid="skillsfutures-claims-approved-claim-approved-002"]',
      );
      // formatSGD renders "S$250.00" or "SGD 250.00" depending on Intl
      // locale data — assert the numeric portion only to stay portable.
      expect(approved?.textContent).toContain('250.00');
    });

    it('renders the rejection_reason on REJECTED claims', () => {
      const reason = element.querySelector(
        '[data-testid="skillsfutures-claims-reason-claim-rejected-003"]',
      );
      expect(reason?.textContent).toContain('Missing supporting documents');
    });

    it('renders the requested amount on every row', () => {
      const requested = element.querySelector(
        '[data-testid="skillsfutures-claims-requested-claim-pending-001"]',
      );
      // 50000 cents → 500.00 SGD
      expect(requested?.textContent).toContain('500.00');
    });

    it('exposes Approve+Reject CTAs ONLY on PENDING rows', () => {
      // PENDING row has both buttons.
      expect(
        element.querySelector('[data-testid="skillsfutures-claims-approve-claim-pending-001"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="skillsfutures-claims-reject-claim-pending-001"]'),
      ).not.toBeNull();

      // APPROVED / REJECTED rows do NOT (decision already made).
      expect(
        element.querySelector('[data-testid="skillsfutures-claims-approve-claim-approved-002"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="skillsfutures-claims-reject-claim-rejected-003"]'),
      ).toBeNull();
    });

    it('truncates the NRIC hash for the row display', () => {
      const row = element.querySelector(
        '[data-testid="skillsfutures-claims-row-claim-pending-001"]',
      );
      // First 12 chars of the hash body (post-sha256: prefix) + ellipsis.
      expect(row?.textContent).toContain('0123456789ab');
      expect(row?.textContent).not.toContain('0123456789abcdef0123456789abcdef');
    });
  });

  describe('a11y', () => {
    it('renders a single h1 heading for the surface', () => {
      const heading = element.querySelector('h1');
      expect(heading).not.toBeNull();
    });

    it('labels the state-filter select with a <label for=>', () => {
      const select = element.querySelector('[data-testid="skillsfutures-claims-state-filter"]');
      const id = select?.getAttribute('id');
      expect(id).toBeTruthy();
      const label = element.querySelector(`label[for="${id}"]`);
      expect(label).not.toBeNull();
    });

    it('has zero critical/serious WCAG violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});

describe('SkillsFuturesClaimsComponent — empty state', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SkillsFuturesClaimsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-001',
      name: 'MTM Singapore',
      slug: 'mtm',
      logoUrl: null,
    });
    const fixture = TestBed.createComponent(SkillsFuturesClaimsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(BASE).flush({ items: [] });
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders an empty-state message when no claims exist', () => {
    const empty = element.querySelector('[data-testid="skillsfutures-claims-empty"]');
    expect(empty).not.toBeNull();
  });

  it('shows total count of 0', () => {
    const total = element.querySelector('[data-testid="skillsfutures-claims-total"]');
    expect(total?.textContent).toContain('0');
  });
});
