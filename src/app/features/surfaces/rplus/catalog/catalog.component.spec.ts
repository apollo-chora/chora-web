import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { CatalogComponent } from './catalog.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

interface BackendCourseStub {
  id: string;
  title: string;
  description?: string;
  state: 'DRAFT' | 'AWAITING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  author_gcid?: string;
  test_set_ids?: string[];
  updated_at?: string;
}

const STUB_COURSES: readonly BackendCourseStub[] = [
  {
    id: 'cspo-2026',
    title: 'Certified Scrum Product Owner',
    description: 'Stakeholder alignment + value-driven release planning.',
    state: 'PUBLISHED',
    author_gcid: 'gcid-chen',
    test_set_ids: ['ts-a', 'ts-b', 'ts-c'],
    updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: 'adv-scrum-master-2026',
    title: 'Advanced ScrumMaster',
    description: 'Coaching mastery, scaled agile.',
    state: 'DRAFT',
    author_gcid: 'gcid-wong',
    test_set_ids: [],
    updated_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
  },
  {
    id: 'dsa-101-2026',
    title: 'Data Structures Algorithms 101',
    description: 'Foundational data structures.',
    state: 'PUBLISHED',
    author_gcid: 'gcid-chen',
    test_set_ids: ['ts-d', 'ts-e'],
    updated_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
  },
];

function setup(roles: readonly string[] = [], capabilities: readonly string[] = []): {
  fixture: ComponentFixture<CatalogComponent>;
  httpMock: HttpTestingController;
} {
  // The real RbacService over a faked AuthService signal, which is how the
  // offering workspace asserts role-gated visibility. Stubbing RbacService
  // itself would test the stub; this tests the capability lookup that ships.
  const user = signal<{ roles: readonly string[]; capabilities: readonly string[] }>({
    roles,
    capabilities,
  });
  TestBed.configureTestingModule({
    imports: [CatalogComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: user.asReadonly() } },
    ],
  });
  const tenants = TestBed.inject(TenantContextService);
  tenants.setCurrentTenant({
    id: 'tenant-001',
    name: 'MTM Singapore',
    slug: 'mtm',
    logoUrl: null,
  });
  const fixture = TestBed.createComponent(CatalogComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock
    .expectOne(
      (r) =>
        r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
        r.params.get('state') === 'PUBLISHED' &&
        r.params.get('page_size') === '50',
    )
    .flush({ items: STUB_COURSES });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('CatalogComponent, Create Course visibility (R44 / D9)', () => {
  // Owner R44 (D9): hide what the role cannot do. `course:author` is the gate
  // the ROUTE already enforces (`rplus.routes.ts` guards `catalog/new` with
  // `roleGuard('course:author')`), and the capability is admin-only by an owner
  // ruling recorded in `role-capabilities.ts:44-52`, which says in as many
  // words DO NOT widen it to instructor or author. Instructor is denied it
  // explicitly at `:111` ("Deliberately NO course:author").
  //
  // So the template was the only thing that failed to hide the CTA: it rendered
  // for every `delivery:ops` session and the guard bounced the click to
  // /unauthorized. A control whose only outcome is a refusal page.
  //
  // One test per role, which is this row's stated gate. The pair matters more
  // than either half: without the training-admin case a bug that hides the CTA
  // from everyone would pass.
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('hides Create Course from an instructor, who cannot reach the route', () => {
    const { fixture } = setup(['instructor'], ['delivery:ops', 'assessment:author']);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="catalog-create-cta"]')).toBeNull();
    // Totality: no link anywhere on the screen may reach the authoring route,
    // so re-adding the CTA under another testid still fails.
    const toNew = Array.from(el.querySelectorAll('a')).filter((a) =>
      (a.getAttribute('href') ?? '').includes('/r/catalog/new'),
    );
    expect(toNew).toEqual([]);
  });

  it('shows Create Course to a training administrator, who can', () => {
    const { fixture } = setup(
      ['training_admin'],
      ['delivery:ops', 'assessment:author', 'course:author'],
    );
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="catalog-create-cta"]')).not.toBeNull();
  });
});

describe('CatalogComponent', () => {
  let fixture: ComponentFixture<CatalogComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    // An ADMIN session for the shared fixture, since R44 (D9) made part of
    // this screen role-dependent. This block asserts what the catalog
    // CONTAINS; the visibility describe above asserts what each role SEES.
    // Leaving it capability-less would quietly turn the block into a
    // second, undeclared instructor test.
    const built = setup(['training_admin'], ['delivery:ops', 'course:author']);
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const root = element.querySelector('[data-testid="rplus-catalog"]');
      expect(root?.className).toContain('surface-rplus');
    });
  });

  describe('header', () => {
    it('shows the current tenant name from TenantContextService', () => {
      const tenant = element.querySelector('[data-testid="catalog-tenant"]');
      expect(tenant?.textContent).toContain('MTM Singapore');
    });

    it('shows total course count from the BFF response', () => {
      const count = element.querySelector('[data-testid="catalog-total"]');
      expect(count?.textContent).toContain('3');
    });

    it('renders a Create Course CTA that navigates to the authoring route', () => {
      // The CTA used to open an inline form that POSTed /api/v1/courses with a
      // free-text, comma-separated list of test-set UUIDs typed by hand. The
      // same POST is served by the course-authoring component at
      // /r/catalog/new, which loads the tenant's test-sets into a checkbox
      // picker and also carries cert config + the publish/release lifecycle.
      // Two front-doors onto one endpoint is the duplication CHO-2214 exists to
      // remove, so the CTA now navigates and the inline form is gone.
      //
      // Runs on the shared ADMIN fixture as of R44 (D9). It used to run on a
      // capability-less one and still pass, which is exactly the defect: the CTA
      // rendered for anyone. This asserts the SHAPE of the CTA; whether it
      // renders at all per role is asserted in the visibility describe above.
      const cta = element.querySelector('[data-testid="catalog-create-cta"]');
      expect(cta).not.toBeNull();
      // An <a>, not a <button>: it navigates. A button would break
      // middle-click / open-in-new-tab and lies to screen readers about role.
      expect(cta?.tagName).toBe('A');
      expect(cta?.getAttribute('href')).toBe('/r/catalog/new');
    });

    it('exposes no inline create-form API — the second path is removed, not just hidden', () => {
      // NOT `querySelector('form') === null`: the form was always behind
      // `@if (createFormOpen())`, which is false on load, so a DOM-absence
      // assertion passes identically before and after the removal — it would
      // certify the deletion without ever checking it. Assert the API is gone
      // instead, which is false today and true only once the path is really cut.
      const component = fixture.componentInstance as unknown as Record<
        string,
        unknown
      >;
      for (const member of [
        'createFormOpen',
        'onCreateClicked',
        'onCreateSubmit',
        'onCancelCreate',
        'canSubmit',
        'formTitle',
        'formTestSetIds',
        'submitting',
        'createError',
      ]) {
        expect(
          member in component,
          `${member} still exists — the inline create path is only hidden, not removed`,
        ).toBe(false);
      }
    });
  });

  describe('catalog grid', () => {
    it('renders one card per course (3 total)', () => {
      const cards = element.querySelectorAll('[data-testid^="catalog-card-"]');
      expect(cards.length).toBe(3);
    });

    it('renders CSPO card with title + Published badge', () => {
      const card = element.querySelector('[data-testid="catalog-card-cspo-2026"]');
      expect(card?.textContent).toContain('Scrum Product Owner');
      const badge = card?.querySelector('[data-testid="status-cspo-2026"]');
      expect(badge?.textContent?.trim()).toBe('Published');
    });

    it('renders Advanced ScrumMaster as Draft', () => {
      const badge = element.querySelector('[data-testid="status-adv-scrum-master-2026"]');
      expect(badge?.textContent?.trim()).toBe('Draft');
    });

    it('exposes a per-card Edit CTA, and NO Archive', () => {
      // R1 slice 2. Archive is gone rather than wired, because there is nothing
      // to wire it to: `/api/v1/courses/{id}/{action}` dispatches exactly
      // `publish`, `release` and `reject` (`course_cj2_handler.go:196-215`).
      // ARCHIVED is a reachable STATE (the list filters by it) but no endpoint
      // transitions a course into it anywhere on the delivery course surface.
      //
      // The button also bound no `(click)` and the component had no archive
      // method, so it did nothing even in principle. This spec used to assert
      // it RENDERS, which is how a control that could never work stayed on the
      // screen with a green test beside it.
      const edit = element.querySelector('[data-testid="catalog-edit-cspo-2026"]');
      expect(edit).not.toBeNull();
      expect(
        element.querySelector('[data-testid="catalog-archive-cspo-2026"]'),
      ).toBeNull();
      // Totality over every card, so re-adding it on a different course fails.
      expect(element.querySelectorAll('[data-testid^="catalog-archive-"]').length).toBe(0);
    });
  });

  describe('metrics that no read can serve (R1 slice 3a)', () => {
    // The row's gate is "a metric is served or absent". `cohortCount` and
    // `enrolments` were HARDCODED 0 in the mapper (`catalog.service.ts:115`
    // and `:117`), so every card in every tenant read 0 forever, and a zero
    // meaning "this feature was never built" is indistinguishable from a zero
    // meaning "none yet". Nothing answers either question: offerings are the
    // cohorts and the offering handler exposes no course filter, and there is
    // no per-course enrolment read for an admin.
    //
    // `atomCount` STAYS, because it is real: derived from `test_set_ids.length`
    // (`catalog.service.ts:116`). Asserting it still renders is the positive
    // control, without which a change that stripped the whole metric row would
    // pass this test.
    it('prints the atom count and neither of the unservable metrics', () => {
      const labels = Array.from(
        element.querySelectorAll('.catalog__metric dt'),
      ).map((dt) => (dt.textContent ?? '').trim());
      expect(labels).toContain('rplus.catalog.metric.atoms');
      expect(labels).not.toContain('rplus.catalog.metric.cohorts');
      expect(labels).not.toContain('rplus.catalog.metric.enrolments');
    });
  });

  describe('a11y', () => {
    it('uses semantic <section> root', () => {
      const main = element.querySelector('[data-testid="rplus-catalog"]');
      expect(main?.tagName).toBe('SECTION');
    });

    it('renders cards with a heading per card', () => {
      const cards = element.querySelectorAll('[data-testid^="catalog-card-"]');
      cards.forEach((card) => {
        const heading = card.querySelector('h2, h3');
        expect(heading).not.toBeNull();
      });
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

// --- describeHttpError() branch characterization --------------------------
// These branches used to be driven through the inline create form's POST. The
// form is gone (CHO-2214: one course-create path, at /r/catalog/new), but
// describeHttpError() is NOT — the catalog list's catchError still renders
// every load failure through it. So the cases are retargeted onto the surviving
// caller rather than deleted with the form: the function is live code and these
// are its only tests for the non-`message` bodies.
describe('CatalogComponent: list error shapes', () => {
  let fixture: ComponentFixture<CatalogComponent>;
  let httpMock: HttpTestingController;
  let component: CatalogComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-004',
      name: 'Error Tenant',
      slug: 'err',
      logoUrl: null,
    });
    fixture = TestBed.createComponent(CatalogComponent);
    httpMock = TestBed.inject(HttpTestingController);
    component = fixture.componentInstance;
    fixture.detectChanges(); // initial GET in flight
  });

  afterEach(() => httpMock.verify());

  function flushListError(
    body: string | object | null,
    status: number,
    statusText: string,
  ): void {
    httpMock
      .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
      .flush(body, { status, statusText });
    fixture.detectChanges();
  }

  it('uses body.error when the JSON body has no message (?? error fallback)', () => {
    flushListError({ error: 'tenant quota exceeded' }, 409, 'Conflict');
    expect(component.loadError()).toBe('409: tenant quota exceeded');
  });

  it('uses a non-empty string body verbatim (string-body branch)', () => {
    flushListError('plain text failure', 500, 'Server Error');
    expect(component.loadError()).toBe('500: plain text failure');
  });

  it('falls back to the generated HttpErrorResponse message for an empty string body', () => {
    flushListError('   ', 502, 'Bad Gateway');
    // body.trim() is falsy → string branch skipped → message stays the
    // Angular-generated err.message. status 502 is truthy so it is prefixed.
    const err = component.loadError();
    expect(err).not.toBeNull();
    expect(err).toContain('502: ');
    expect(err).not.toContain('   ');
  });

  it('falls back to the generated message when the JSON body is null', () => {
    flushListError(null, 404, 'Not Found');
    const err = component.loadError();
    expect(err).not.toBeNull();
    expect(err).toContain('404: ');
  });

  it('omits the status prefix when status is 0 (network error, status ? falsy arm)', () => {
    // A transport-level error yields status 0 → `status ? ... : message` takes
    // the falsy arm (no "0: " prefix) and err.error is a ProgressEvent (an
    // object lacking message/error → message stays err.message).
    httpMock
      .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
      .error(new ProgressEvent('error'));
    fixture.detectChanges();
    const err = component.loadError();
    expect(err).not.toBeNull();
    expect(err).not.toMatch(/^0: /);
  });
});

// --- empty-catalog @for/@empty + null-data fallback branches --------------
describe('CatalogComponent: empty catalog', () => {
  let fixture: ComponentFixture<CatalogComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: CatalogComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-002',
      name: 'Empty Tenant',
      slug: 'empty',
      logoUrl: null,
    });
    fixture = TestBed.createComponent(CatalogComponent);
    httpMock = TestBed.inject(HttpTestingController);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
      .flush({ items: [] });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders the @empty placeholder when the catalog is empty (loop empty arm)', () => {
    const cards = element.querySelectorAll('[data-testid^="catalog-card-"]');
    expect(cards.length).toBe(0);
    expect(element.querySelector('.catalog__empty')).not.toBeNull();
    expect(component.courses().length).toBe(0);
    expect(component.totalCourses()).toBe(0);
  });
});

// --- J1 (CHO-1829) — navigation + draft-view status filter -----------------
describe('CatalogComponent: navigation + draft view (J1)', () => {
  let fixture: ComponentFixture<CatalogComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup(); // initial PUBLISHED GET flushed with STUB_COURSES
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders each course title as a link to its detail page (NAV)', () => {
    const link = element.querySelector(
      '[data-testid="catalog-title-link-cspo-2026"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.tagName).toBe('A');
    expect(link!.getAttribute('href')).toBe('/r/catalog/cspo-2026');
    expect(link!.textContent).toContain('Scrum Product Owner');
  });

  it('wires the Edit control to the curriculum editor: no dead button (EDIT-1)', () => {
    const edit = element.querySelector(
      '[data-testid="catalog-edit-cspo-2026"]',
    ) as HTMLAnchorElement | null;
    expect(edit).not.toBeNull();
    // UX-first (owner steer 2026-06-23): Edit is a DISTINCT affordance from the
    // title — it opens the curriculum editor, not the same detail page.
    expect(edit!.tagName).toBe('A');
    expect(edit!.getAttribute('href')).toBe('/r/catalog/cspo-2026/content');
  });

  it('exposes a status filter and refetches with state=DRAFT when Draft is selected (CATALOG-1)', () => {
    const draftBtn = element.querySelector(
      '[data-testid="catalog-filter-DRAFT"]',
    ) as HTMLButtonElement | null;
    expect(draftBtn).not.toBeNull();

    draftBtn!.click();
    fixture.detectChanges();

    httpMock
      .expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` && r.params.get('state') === 'DRAFT',
      )
      .flush({ items: [{ id: 'draft-x', title: 'Draft X', state: 'DRAFT' }] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="catalog-card-draft-x"]')).not.toBeNull();
  });

  it('marks the active status filter with aria-pressed for a11y', () => {
    const published = element.querySelector('[data-testid="catalog-filter-PUBLISHED"]');
    expect(published?.getAttribute('aria-pressed')).toBe('true');
    const draft = element.querySelector('[data-testid="catalog-filter-DRAFT"]');
    expect(draft?.getAttribute('aria-pressed')).toBe('false');
  });
});

// --- J1 error state + J2 loading skeletons ---------------------------------
describe('CatalogComponent: loading + error states (J1 error / J2 skeleton)', () => {
  function buildPending(): {
    fixture: ComponentFixture<CatalogComponent>;
    httpMock: HttpTestingController;
    element: HTMLElement;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-003',
      name: 'Pending Tenant',
      slug: 'pending',
      logoUrl: null,
    });
    const fixture = TestBed.createComponent(CatalogComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // initial GET now in flight (not yet flushed)
    return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
  }

  it('shows loading skeletons while the catalog GET is in flight, not an empty-state (J2)', () => {
    const { fixture, httpMock, element } = buildPending();

    expect(element.querySelector('[data-testid="catalog-loading"]')).not.toBeNull();
    expect(element.querySelector('.catalog__grid')).toBeNull();
    expect(element.querySelector('.catalog__empty')).toBeNull();

    httpMock
      .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
      .flush({ items: [{ id: 'c1', title: 'C1', state: 'PUBLISHED' }] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="catalog-loading"]')).toBeNull();
    expect(element.querySelector('[data-testid="catalog-card-c1"]')).not.toBeNull();
    httpMock.verify();
  });

  it('shows a fail-loud error banner when the catalog GET fails (no silent empty)', () => {
    const { fixture, httpMock, element } = buildPending();

    httpMock
      .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
      .flush(
        { message: 'downstream delivery unavailable' },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    const banner = element.querySelector('[data-testid="catalog-error"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('500');
    // grid + empty-state must NOT render on error (fail-loud, not fail-silent).
    expect(element.querySelector('.catalog__grid')).toBeNull();
    expect(element.querySelector('.catalog__empty')).toBeNull();
    httpMock.verify();
  });

  it('recovers to the grid when a retry succeeds after an error', () => {
    const { fixture, httpMock, element } = buildPending();

    httpMock
      .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
      .flush({ message: 'boom' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    const retry = element.querySelector(
      '[data-testid="catalog-retry"]',
    ) as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    retry!.click();
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
      .flush({ items: [{ id: 'ok-1', title: 'Recovered', state: 'PUBLISHED' }] });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="catalog-error"]')).toBeNull();
    expect(element.querySelector('[data-testid="catalog-card-ok-1"]')).not.toBeNull();
    httpMock.verify();
  });
});

// --- per-course Review CTA (Awaiting Review → detail page) ------------------
// The R+ Course Review queue moved from a global sidebar route onto the
// per-course detail page. An 'Awaiting Review' card links to /r/catalog/{id}
// where the training-admin releases or rejects it; other states do not.
describe('CatalogComponent: per-course Review CTA', () => {
  let fixture: ComponentFixture<CatalogComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-006',
      name: 'Review Tenant',
      slug: 'review',
      logoUrl: null,
    });
    fixture = TestBed.createComponent(CatalogComponent);
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
      .flush({
        items: [
          { id: 'await-1', title: 'Pending Course', state: 'AWAITING_REVIEW', author_gcid: 'gcid-x' },
          { id: 'pub-1', title: 'Live Course', state: 'PUBLISHED', author_gcid: 'gcid-y' },
        ],
      });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders a Review CTA on an Awaiting Review card linking to the detail page', () => {
    const cta = element.querySelector(
      '[data-testid="catalog-review-await-1"]',
    ) as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.tagName).toBe('A');
    expect(cta!.getAttribute('href')).toBe('/r/catalog/await-1');
  });

  it('does NOT render a Review CTA on a Published card', () => {
    expect(element.querySelector('[data-testid="catalog-review-pub-1"]')).toBeNull();
  });
});
