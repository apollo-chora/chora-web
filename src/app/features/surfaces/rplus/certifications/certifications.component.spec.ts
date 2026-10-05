/**
 * CertificationsComponent spec — R+ /r/certifications.
 *
 * Verifies the screen: renders surface-rplus accent, pulls tenant name
 * + total count from the BFF response, renders one row per cert with
 * Active badge + Revoke CTA. Uses the real HttpTestingController +
 * BffClientService wiring (no service-level mocks per
 * feedback_no_stubs_real_wiring).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CertificationsComponent } from './certifications.component';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

interface BackendCertStub {
  id: string;
  tenant_id: string;
  learner_gcid: string;
  course_id: string;
  accomplishments?: string[];
  hash: string;
  issued_at: string;
}

const STUB_CERTS: readonly BackendCertStub[] = [
  {
    id: 'cert-cspo-001',
    tenant_id: 'tenant-001',
    learner_gcid: 'gcid-phyllis',
    course_id: 'course-cspo',
    accomplishments: ['atom-1:passed', 'exam:passed'],
    hash: 'deadbeef',
    issued_at: '2026-05-26T10:00:00Z',
  },
  {
    id: 'cert-dsa-002',
    tenant_id: 'tenant-001',
    learner_gcid: 'gcid-mei',
    course_id: 'course-dsa-101',
    accomplishments: ['atom-1:passed', 'atom-2:passed', 'exam:passed'],
    hash: 'cafebabe',
    issued_at: '2026-05-25T15:30:00Z',
  },
];

function setup(): {
  fixture: ComponentFixture<CertificationsComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [CertificationsComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const tenants = TestBed.inject(TenantContextService);
  tenants.setCurrentTenant({
    id: 'tenant-001',
    name: 'MTM Singapore',
    slug: 'mtm',
    logoUrl: null,
  });
  const fixture = TestBed.createComponent(CertificationsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock
    .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
    .flush({ items: STUB_CERTS });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('CertificationsComponent', () => {
  let fixture: ComponentFixture<CertificationsComponent>;
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
      const root = element.querySelector('[data-testid="rplus-certifications"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('uses a semantic <section> root', () => {
      const root = element.querySelector('[data-testid="rplus-certifications"]');
      expect(root?.tagName).toBe('SECTION');
    });
  });

  describe('header', () => {
    it('shows the current tenant name from TenantContextService', () => {
      const tenant = element.querySelector('[data-testid="certifications-tenant"]');
      expect(tenant?.textContent).toContain('MTM Singapore');
    });

    it('shows total cert count from the BFF response', () => {
      const total = element.querySelector('[data-testid="certifications-total"]');
      expect(total?.textContent).toContain('2');
    });

    it('renders an Issue Certification CTA', () => {
      const cta = element.querySelector('[data-testid="certifications-issue-cta"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('BUTTON');
    });
  });

  describe('list', () => {
    it('renders one row per certification (2 total)', () => {
      const rows = element.querySelectorAll('[data-testid^="certifications-row-"]');
      expect(rows.length).toBe(2);
    });

    it('renders the CSPO cert with course id + learner GCID', () => {
      const row = element.querySelector('[data-testid="certifications-row-cert-cspo-001"]');
      expect(row?.textContent).toContain('course-cspo');
      expect(row?.textContent).toContain('gcid-phyllis');
    });

    it('renders an Active status badge by default', () => {
      const badge = element.querySelector('[data-testid="certifications-status-cert-cspo-001"]');
      expect(badge?.textContent?.trim()).toBe('Active');
    });

    it('exposes per-row Revoke CTA', () => {
      const cta = element.querySelector('[data-testid="certifications-revoke-cert-cspo-001"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('BUTTON');
    });
  });

  describe('a11y', () => {
    it('renders a heading per surface', () => {
      const heading = element.querySelector('h1');
      expect(heading).not.toBeNull();
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

describe('CertificationsComponent — empty state', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CertificationsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-001',
      name: 'MTM Singapore',
      slug: 'mtm',
      logoUrl: null,
    });
    const fixture = TestBed.createComponent(CertificationsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/certifications`).flush({ items: [] });
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders an empty-state message when no certs are issued', () => {
    const empty = element.querySelector('[data-testid="certifications-empty"]');
    expect(empty).not.toBeNull();
  });

  it('shows total count of 0', () => {
    const total = element.querySelector('[data-testid="certifications-total"]');
    expect(total?.textContent).toContain('0');
  });
});

describe('CertificationsComponent — issue flow', () => {
  let fixture: ComponentFixture<CertificationsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: CertificationsComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup(); // initial GET flushed with STUB_CERTS
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('opens the issue form only after the Issue CTA is clicked', () => {
    expect(element.querySelector('[data-testid="certifications-issue-form"]')).toBeNull();
    (
      element.querySelector('[data-testid="certifications-issue-cta"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="certifications-issue-form"]')).not.toBeNull();
  });

  it('POSTs the issue request, refetches the list, and closes the form on success', () => {
    component.onIssueClicked();
    component.formLearnerGcid.set('gcid-new');
    component.formCourseId.set('course-new');
    component.formAccomplishments.set('atom-1:passed\nexam:passed');
    fixture.detectChanges();

    component.onIssueSubmit();

    const post = httpMock.expectOne(`${environment.bffBaseUrl}/api/certifications`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      learner_gcid: 'gcid-new',
      course_id: 'course-new',
      accomplishments: ['atom-1:passed', 'exam:passed'],
    });
    post.flush({
      id: 'cert-new-003',
      tenant_id: 'tenant-001',
      learner_gcid: 'gcid-new',
      course_id: 'course-new',
      accomplishments: ['atom-1:passed', 'exam:passed'],
      hash: 'feedface',
      issued_at: '2026-06-02T00:00:00Z',
    });

    // success → reloadKey bump → real refetch. The reloadKey signal feeds a
    // toObservable→switchMap GET, which only fires on the next change-detection
    // cycle, so flush the CD tick before expecting the refetch.
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
      .flush({ items: STUB_CERTS });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="certifications-issue-form"]')).toBeNull();
  });

  it('surfaces a loud error and keeps the form open when the issue POST fails', () => {
    component.onIssueClicked();
    component.formLearnerGcid.set('gcid-new');
    component.formCourseId.set('course-missing');
    fixture.detectChanges();

    component.onIssueSubmit();

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/certifications`)
      .flush({ message: 'course not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="certifications-issue-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('404');
    // No refetch fired (verify() in afterEach asserts no stray GET) and the
    // form stays open so the user can correct + retry.
    expect(element.querySelector('[data-testid="certifications-issue-form"]')).not.toBeNull();
  });
});

// --- J2 loading skeletons + J1 fail-loud error/retry (CHO-1830) ------------
// Mirrors the catalog screen treatment: while the list GET is in flight the
// screen shows skeleton placeholders (NOT the empty-state), and an HTTP
// failure surfaces a loud retry-able error banner instead of a silent empty
// list (per feedback_no_stubs_real_wiring — fail-loud).
describe('CertificationsComponent — loading + error states (CHO-1830)', () => {
  function certStub(id: string): BackendCertStub {
    return {
      id,
      tenant_id: 'tenant-003',
      learner_gcid: 'gcid-x',
      course_id: 'course-x',
      accomplishments: [],
      hash: 'hash-x',
      issued_at: '2026-06-02T00:00:00Z',
    };
  }

  function buildPending(): {
    fixture: ComponentFixture<CertificationsComponent>;
    httpMock: HttpTestingController;
    element: HTMLElement;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CertificationsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-003',
      name: 'Pending Tenant',
      slug: 'pending',
      logoUrl: null,
    });
    const fixture = TestBed.createComponent(CertificationsComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // initial GET now in flight (not yet flushed)
    return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
  }

  it('shows loading skeletons while the certifications GET is in flight, not an empty-state (J2)', () => {
    const { fixture, httpMock, element } = buildPending();

    expect(element.querySelector('[data-testid="certifications-loading"]')).not.toBeNull();
    // The still-loading list must NOT render the zero-item empty-state, and no
    // rows are present yet.
    expect(element.querySelector('[data-testid="certifications-empty"]')).toBeNull();
    expect(element.querySelector('[data-testid^="certifications-row-"]')).toBeNull();

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
      .flush({ items: [certStub('c1')] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="certifications-loading"]')).toBeNull();
    expect(element.querySelector('[data-testid="certifications-row-c1"]')).not.toBeNull();
    httpMock.verify();
  });

  it('renders list content (no skeleton) once the GET resolves', () => {
    const { fixture, httpMock, element } = buildPending();

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
      .flush({ items: [certStub('loaded-1')] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="certifications-loading"]')).toBeNull();
    expect(element.querySelector('[data-testid="certifications-error"]')).toBeNull();
    expect(element.querySelector('[data-testid="certifications-row-loaded-1"]')).not.toBeNull();
    httpMock.verify();
  });

  it('shows a fail-loud error banner when the certifications GET fails (no silent empty) (J1)', () => {
    const { fixture, httpMock, element } = buildPending();

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
      .flush(
        { message: 'downstream delivery unavailable' },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    const banner = element.querySelector('[data-testid="certifications-error"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('500');
    // list + empty-state must NOT render on error (fail-loud, not fail-silent).
    expect(element.querySelector('[data-testid="certifications-empty"]')).toBeNull();
    expect(element.querySelector('[data-testid^="certifications-row-"]')).toBeNull();
    httpMock.verify();
  });

  it('recovers to the list when a retry succeeds after an error', () => {
    const { fixture, httpMock, element } = buildPending();

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
      .flush({ message: 'boom' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    const retry = element.querySelector(
      '[data-testid="certifications-retry"]',
    ) as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    retry!.click();
    fixture.detectChanges();

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/certifications`)
      .flush({ items: [certStub('ok-1')] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="certifications-error"]')).toBeNull();
    expect(element.querySelector('[data-testid="certifications-row-ok-1"]')).not.toBeNull();
    httpMock.verify();
  });
});
