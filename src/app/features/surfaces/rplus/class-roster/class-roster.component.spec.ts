/**
 * ClassRosterComponent spec — R+ /r/roster single-course learner roster.
 *
 * Real HttpTestingController + BffClientService wiring (no service stubs per
 * `feedback_no_stubs_real_wiring`). The screen resolves the instructor's first
 * course via GET /api/v1/instructors/{gcid}/courses then fetches
 * GET /api/v1/rosters/{courseId}; this spec drives both legs and asserts the
 * populated table, the honest empty/error/no-course states, sorting, the
 * cert-preview modal, and a11y. There is NO DSA-101 / Mr. Chen fixture.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, of } from 'rxjs';
import { ClassRosterComponent } from './class-roster.component';
import { ClassRosterService } from './class-roster.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';
import type { CohortRoster, RosterLearner } from './class-roster.model';

const GCID = '00000000-0000-7000-8000-000000001999';
const COURSE_ID = '019e30da-923e-7da2-a8e7-ef2dad3137a0';

interface LearnerStub {
  gcid: string;
  display_name: string;
  progress_pct: number;
  enrolled_at: string;
}

const LEARNERS: readonly LearnerStub[] = [
  {
    gcid: 'gcid-zara',
    display_name: 'Zara Okoro',
    progress_pct: 100,
    enrolled_at: '2026-05-26T09:00:00Z',
  },
  {
    gcid: 'gcid-mei',
    display_name: 'Mei Lin',
    progress_pct: 40,
    enrolled_at: '2026-05-26T11:00:00Z',
  },
  {
    gcid: 'gcid-amir',
    display_name: 'Amir Patel',
    progress_pct: 0,
    enrolled_at: '2026-05-26T10:00:00Z',
  },
];

const coursesUrl = `${environment.bffBaseUrl}/api/v1/instructors/${encodeURIComponent(
  GCID,
)}/courses`;
const rosterUrl = `${environment.bffBaseUrl}/api/v1/rosters/${COURSE_ID}`;

function configure(authenticated = true): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [ClassRosterComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const tenants = TestBed.inject(TenantContextService);
  tenants.setCurrentTenant({
    id: 'tenant-001',
    name: 'MTM Singapore',
    slug: 'mtm',
    logoUrl: null,
  });
  if (authenticated) {
    TestBed.inject(AuthService).setUser(
      {
        gcid: GCID,
        tenantId: 'tenant-001',
        roles: ['INSTRUCTOR'],
        capabilities: [],
        displayName: 'Test Instructor',
        email: 'inst@example.com',
      },
      'fake-jwt',
    );
  }
  return TestBed.inject(HttpTestingController);
}

/** Build + flush both legs (courses then roster) and settle the view. */
function setupPopulated(learners: readonly LearnerStub[]): {
  fixture: ComponentFixture<ClassRosterComponent>;
  httpMock: HttpTestingController;
} {
  const httpMock = configure();
  const fixture = TestBed.createComponent(ClassRosterComponent);
  fixture.detectChanges();
  httpMock.expectOne(coursesUrl).flush({
    items: [
      {
        id: COURSE_ID,
        tenant_id: 'tenant-001',
        title: 'CJ2 E2E Foundations',
        instructor_name: '',
        enrolled_count: learners.length,
      },
    ],
    total: 1,
  });
  fixture.detectChanges();
  httpMock.expectOne(rosterUrl).flush({
    course_id: COURSE_ID,
    tenant_id: 'tenant-001',
    learners,
    learner_count: learners.length,
  });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('ClassRosterComponent — populated course', () => {
  let fixture: ComponentFixture<ClassRosterComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupPopulated(LEARNERS);
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  describe('surface root', () => {
    it('renders with the surface-rplus accent class', () => {
      const root = element.querySelector('[data-testid="rplus-class-roster"]');
      expect(root?.className).toContain('surface-rplus');
    });
  });

  describe('cohort header (real course context)', () => {
    it('shows the real course title from the wire (NOT DSA-101)', () => {
      const title = element.querySelector('[data-testid="cohort-title"]');
      expect(title?.textContent).toContain('CJ2 E2E Foundations');
      expect(title?.textContent).not.toContain('DSA-101');
    });

    it('derives the course code from the title', () => {
      const code = element.querySelector('[data-testid="cohort-course-code"]');
      expect(code?.textContent?.trim()).toBe('CEF');
    });

    it('shows the instructor resolved off AuthService (NOT Mr. Chen)', () => {
      const inst = element.querySelector('[data-testid="cohort-instructor"]');
      expect(inst?.textContent).toContain('Test Instructor');
      expect(inst?.textContent).not.toContain('Mr. Chen');
    });

    it('shows the real roster size summary (3 learners)', () => {
      const summary = element.querySelector('[data-testid="roster-size-summary"]');
      expect(summary?.textContent).toContain('3');
    });
  });

  describe('roster table', () => {
    it('renders the table with an aria-label', () => {
      const table = element.querySelector('[data-testid="roster-table"]');
      expect(table?.tagName).toBe('TABLE');
      expect(table?.hasAttribute('aria-label')).toBe(true);
    });

    it('renders one row per learner (3 total)', () => {
      const rows = element.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
    });

    it('renders the real learner display name from the wire', () => {
      const row = element.querySelector('[data-testid="roster-row-gcid-mei"]');
      expect(row?.textContent).toContain('Mei Lin');
    });

    it('renders progress percent from the progress_pct proxy', () => {
      const progress = element.querySelector('[data-testid="progress-gcid-mei"]');
      expect(progress?.textContent?.trim()).toBe('40%');
    });

    it('maps a 100% learner to a Completed status badge', () => {
      const status = element.querySelector('[data-testid="status-gcid-zara"]');
      expect(status?.textContent?.trim()).toBe('Completed');
    });

    it('renders a progressbar role with valid ARIA bounds per row', () => {
      const bars = element.querySelectorAll('[role="progressbar"]');
      expect(bars.length).toBe(3);
      bars.forEach((bar) => {
        expect(bar.hasAttribute('aria-valuenow')).toBe(true);
        expect(bar.getAttribute('aria-valuemin')).toBe('0');
        expect(bar.getAttribute('aria-valuemax')).toBe('100');
      });
    });
  });

  describe('cert preview CTA + modal', () => {
    it('enables the Cert Preview CTA only for a completed learner', () => {
      const enabled = element.querySelector(
        '[data-testid="cert-preview-cta-gcid-zara"]',
      ) as HTMLButtonElement;
      const disabled = element.querySelector(
        '[data-testid="cert-preview-cta-gcid-mei"]',
      ) as HTMLButtonElement;
      expect(enabled.disabled).toBe(false);
      expect(disabled.disabled).toBe(true);
    });

    it('opens the cert preview modal for the completed learner', () => {
      expect(element.querySelector('[data-testid="cert-preview-overlay"]')).toBeNull();
      const cta = element.querySelector(
        '[data-testid="cert-preview-cta-gcid-zara"]',
      ) as HTMLButtonElement;
      cta.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="cert-preview-overlay"]')).not.toBeNull();
    });

    it('does NOT open the modal when a disabled CTA is clicked', () => {
      const cta = element.querySelector(
        '[data-testid="cert-preview-cta-gcid-mei"]',
      ) as HTMLButtonElement;
      cta.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="cert-preview-overlay"]')).toBeNull();
    });
  });

  describe('sortable column headers', () => {
    it('renders ascending aria-sort on the name column by default', () => {
      const nameTh = element.querySelector('[data-testid="sort-button-name"]')?.closest('th');
      expect(nameTh?.getAttribute('aria-sort')).toBe('ascending');
    });

    it('toggles direction when the same column is clicked twice', () => {
      const btn = element.querySelector('[data-testid="sort-button-name"]') as HTMLButtonElement;
      const th = btn.closest('th') as HTMLElement;
      btn.click();
      fixture.detectChanges();
      expect(th.getAttribute('aria-sort')).toBe('descending');
      btn.click();
      fixture.detectChanges();
      expect(th.getAttribute('aria-sort')).toBe('ascending');
    });

    it('sorts by progress when the progress header is clicked', () => {
      const btn = element.querySelector(
        '[data-testid="sort-button-progress"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      // ascending progress: Amir (0), Mei (40), Zara (100)
      const rows = element.querySelectorAll('tbody tr');
      expect((rows[0] as HTMLElement).getAttribute('data-testid')).toBe('roster-row-gcid-amir');
      expect((rows[2] as HTMLElement).getAttribute('data-testid')).toBe('roster-row-gcid-zara');
    });
  });

  describe('a11y semantics', () => {
    it('uses a semantic <table> with <caption> + scoped <th>', () => {
      expect(element.querySelector('table')).not.toBeNull();
      expect(element.querySelector('caption')).not.toBeNull();
      const ths = element.querySelectorAll('thead th');
      expect(ths.length).toBe(6);
      ths.forEach((th) => expect(th.getAttribute('scope')).toBe('col'));
    });

    it('renders a skip-to-table link', () => {
      const skip = element.querySelector('.class-roster__skip-link');
      expect((skip as HTMLAnchorElement)?.getAttribute('href')).toBe('#roster-table');
    });

    it('has zero critical/serious WCAG violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    }, 30_000);
  });

  describe('helpers', () => {
    it('initials() picks the first two word-initials', () => {
      const comp = fixture.componentInstance;
      expect(comp.initials('Mei Lin')).toBe('ML');
      expect(comp.initials('Singular')).toBe('S');
    });

    it('statusBadgeClass() maps statuses to polyglass badge variants', () => {
      const comp = fixture.componentInstance;
      expect(comp.statusBadgeClass('Active')).toBe('badge-success');
      expect(comp.statusBadgeClass('Completed')).toBe('badge-info');
      expect(comp.statusBadgeClass('At-risk')).toBe('badge-warning');
    });
  });
});

describe('ClassRosterComponent — empty course (honest empty-state)', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupPopulated([]);
    httpMock = built.httpMock;
    element = built.fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders the empty-state and no table when zero learners', () => {
    expect(element.querySelector('[data-testid="roster-empty-state"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="roster-table"]')).toBeNull();
  });

  it('does NOT fabricate any fixture rows', () => {
    expect(element.textContent).not.toContain('DSA-101');
    expect(element.textContent).not.toContain('Phyllis');
    expect(element.querySelectorAll('tbody tr').length).toBe(0);
  });
});

describe('ClassRosterComponent — roster endpoint failure (fail loud)', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    httpMock = configure();
    const fixture = TestBed.createComponent(ClassRosterComponent);
    fixture.detectChanges();
    httpMock.expectOne(coursesUrl).flush({
      items: [{ id: COURSE_ID, title: 'Algorithms 1', enrolled_count: 1 }],
    });
    fixture.detectChanges();
    // Today the roster route 404s (handler not wired in prod) — assert the
    // fail-loud banner rather than any fabricated data.
    httpMock.expectOne(rosterUrl).flush('404 page not found', {
      status: 404,
      statusText: 'Not Found',
    });
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders an alert error banner on roster failure', () => {
    const err = element.querySelector('[data-testid="roster-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
  });

  it('does not render the table on error', () => {
    expect(element.querySelector('[data-testid="roster-table"]')).toBeNull();
  });
});

describe('ClassRosterComponent — unauthenticated (no course to scope)', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    httpMock = configure(false); // no setUser → no gcid → NoCourseError
    const fixture = TestBed.createComponent(ClassRosterComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('makes no HTTP call and renders the honest empty-state', () => {
    httpMock.expectNone(coursesUrl);
    expect(element.querySelector('[data-testid="roster-empty-state"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="roster-table"]')).toBeNull();
  });
});

describe('ClassRosterComponent — empty-state derived getters', () => {
  let httpMock: HttpTestingController;
  let comp: ClassRosterComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    // Unauthenticated → NoCourseError → EMPTY_COHORT_ROSTER snapshot.
    httpMock = configure(false);
    const fixture = TestBed.createComponent(ClassRosterComponent);
    fixture.detectChanges();
    comp = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('exposes the EMPTY_COHORT_ROSTER defaults on every header computed', () => {
    expect(comp.cohortName()).toBe('');
    expect(comp.courseCode()).toBe('');
    expect(comp.instructorName()).toBe('');
    expect(comp.rosterSize()).toBe(0);
  });

  it('is not loading and has no error after the no-course branch settles', () => {
    expect(comp.isLoading()).toBe(false);
    expect(comp.hasError()).toBe(false);
    expect(comp.errorTranslationKey()).toBeNull();
  });

  it('renders an empty sortedLearners list (no rows)', () => {
    expect(comp.sortedLearners().length).toBe(0);
    expect(element.querySelectorAll('tbody tr').length).toBe(0);
  });
});

describe('ClassRosterComponent — error-state computed getters', () => {
  let fixture: ComponentFixture<ClassRosterComponent>;
  let httpMock: HttpTestingController;
  let comp: ClassRosterComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    httpMock = configure();
    fixture = TestBed.createComponent(ClassRosterComponent);
    fixture.detectChanges();
    httpMock.expectOne(coursesUrl).flush({ items: [{ id: COURSE_ID, title: 'Algorithms 1' }] });
    fixture.detectChanges();
    httpMock.expectOne(rosterUrl).flush('boom', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    fixture.detectChanges();
    comp = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('flips hasError + surfaces the error translation key on a 5xx', () => {
    expect(comp.hasError()).toBe(true);
    expect(comp.errorTranslationKey()).toBe('rplus.rosterByCourse.error');
    expect(comp.isLoading()).toBe(false);
  });

  it('renders the error banner text via the error key', () => {
    const err = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="roster-error"]',
    );
    expect(err?.textContent).toContain('rplus.rosterByCourse.error');
  });

  it('load() can be re-invoked to retry — clears error then re-fetches', () => {
    comp.load();
    fixture.detectChanges();
    expect(comp.isLoading()).toBe(true);
    expect(comp.hasError()).toBe(false);
    httpMock.expectOne(coursesUrl).flush({ items: [{ id: COURSE_ID, title: 'Algorithms 1' }] });
    fixture.detectChanges();
    httpMock.expectOne(rosterUrl).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    fixture.detectChanges();
    expect(comp.hasError()).toBe(false);
    expect(comp.isLoading()).toBe(false);
  });
});

describe('ClassRosterComponent — sort by status + enrolled-at columns', () => {
  let fixture: ComponentFixture<ClassRosterComponent>;
  let httpMock: HttpTestingController;
  let comp: ClassRosterComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupPopulated(LEARNERS);
    fixture = built.fixture;
    httpMock = built.httpMock;
    comp = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('sorts by status when the status header is clicked', () => {
    const btn = element.querySelector('[data-testid="sort-button-status"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(comp.sortKey()).toBe('status');
    // status asc: "Active" < "Completed" → Active rows first, Zara (Completed) last.
    const rows = element.querySelectorAll('tbody tr');
    expect((rows[rows.length - 1] as HTMLElement).getAttribute('data-testid')).toBe(
      'roster-row-gcid-zara',
    );
  });

  it('sorts by enrolled-at when the enrolled header is clicked', () => {
    const btn = element.querySelector('[data-testid="sort-button-enrolled"]') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(comp.sortKey()).toBe('enrolled-at');
    // enrolled_at asc: Zara 09:00 < Amir 10:00 < Mei 11:00
    const rows = element.querySelectorAll('tbody tr');
    expect((rows[0] as HTMLElement).getAttribute('data-testid')).toBe('roster-row-gcid-zara');
    expect((rows[2] as HTMLElement).getAttribute('data-testid')).toBe('roster-row-gcid-mei');
  });

  it('switching keys resets direction to ascending', () => {
    // Toggle name to desc first.
    comp.toggleSort('name');
    expect(comp.sortKey()).toBe('name');
    expect(comp.sortDirection()).toBe('desc');
    // Now switch to a different key — direction should reset to asc.
    comp.toggleSort('status');
    expect(comp.sortKey()).toBe('status');
    expect(comp.sortDirection()).toBe('asc');
  });

  it('ariaSort returns none for an inactive key + matches direction for the active one', () => {
    expect(comp.ariaSort('name')).toBe('ascending');
    expect(comp.ariaSort('status')).toBe('none');
    expect(comp.ariaSort('progress')).toBe('none');
    comp.toggleSort('name'); // → desc
    expect(comp.ariaSort('name')).toBe('descending');
  });
});

describe('ClassRosterComponent — presentation helpers (direct)', () => {
  let fixture: ComponentFixture<ClassRosterComponent>;
  let httpMock: HttpTestingController;
  let comp: ClassRosterComponent;

  function learner(
    overrides: Partial<import('./class-roster.model').RosterLearner> = {},
  ): import('./class-roster.model').RosterLearner {
    return {
      gcid: 'gcid-x',
      displayName: 'X Y',
      avatarUrl: null,
      status: 'Active',
      progressPct: 50,
      atomicSessionsCompleted: 0,
      atomicSessionsTotal: 0,
      lastActivity: '',
      enrolledAt: '2026-05-26T09:00:00Z',
      certPreviewEnabled: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupPopulated(LEARNERS);
    fixture = built.fixture;
    httpMock = built.httpMock;
    comp = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('progressPercent rounds + defaults undefined progress to 0', () => {
    expect(comp.progressPercent(learner({ progressPct: 49.6 }))).toBe(50);
    expect(comp.progressPercent(learner({ progressPct: undefined }))).toBe(0);
  });

  it('progressPercent clamps out-of-range values into [0, 100]', () => {
    expect(comp.progressPercent(learner({ progressPct: 150 }))).toBe(100);
    expect(comp.progressPercent(learner({ progressPct: -20 }))).toBe(0);
    expect(comp.progressPercent(learner({ progressPct: Number.NaN }))).toBe(0);
  });

  it('enrolledAt returns the timestamp, or "" when the projection is unwired', () => {
    expect(comp.enrolledAt(learner({ enrolledAt: '2026-05-26T09:00:00Z' }))).toBe(
      '2026-05-26T09:00:00Z',
    );
    expect(comp.enrolledAt(learner({ enrolledAt: undefined }))).toBe('');
  });

  it('initials handles single names, lowercase, and extra whitespace', () => {
    expect(comp.initials('amir patel')).toBe('AP');
    expect(comp.initials('  Zara   Okoro  ')).toBe('ZO');
    expect(comp.initials('Cher')).toBe('C');
    expect(comp.initials('')).toBe('');
  });

  it('statusBadgeClass maps every enrolment status (incl. Withdrawn + Waitlist)', () => {
    expect(comp.statusBadgeClass('Active')).toBe('badge-success');
    expect(comp.statusBadgeClass('At-risk')).toBe('badge-warning');
    expect(comp.statusBadgeClass('Completed')).toBe('badge-info');
    expect(comp.statusBadgeClass('Withdrawn')).toBe('badge-danger');
    expect(comp.statusBadgeClass('Waitlist')).toBe('badge-info');
  });

  it('closeCertPreview clears an open modal selection', () => {
    const zara = comp.sortedLearners().find((l) => l.gcid === 'gcid-zara')!;
    comp.openCertPreview(zara);
    expect(comp.certPreviewLearner()).not.toBeNull();
    comp.closeCertPreview();
    expect(comp.certPreviewLearner()).toBeNull();
  });

  it('openCertPreview is a no-op for a learner whose cert preview is disabled', () => {
    comp.openCertPreview(learner({ certPreviewEnabled: false }));
    expect(comp.certPreviewLearner()).toBeNull();
  });

  it('roster() computed falls back to EMPTY_COHORT_ROSTER shape fields', () => {
    // The populated roster carries the real title; the fallback path is the
    // course-code derivation off that title.
    expect(comp.roster().cohortName).toBe('CJ2 E2E Foundations');
    expect(comp.courseCode()).toBe('CEF');
  });
});

/**
 * AUGMENTATION — comparator branch coverage via a stubbed ClassRosterService.
 *
 * The real service mapper always coerces `progress_pct` → a finite number and
 * carries `enrolled_at` through, so the wire path can never seed a learner with
 * an *undefined* `progressPct` / `enrolledAt`. That leaves the nullish-coalesce
 * arms inside `compareLearners` (`a.progressPct ?? 0`, `a.enrolledAt ?? ''`,
 * and their `b` twins) unexercised by the HttpTestingController suites above.
 *
 * Here we override ClassRosterService with a deterministic stub (no HTTP) that
 * emits a CohortRoster whose learners legitimately omit the optional
 * `progressPct` / `enrolledAt` fields. Driving `toggleSort('progress')` and
 * `toggleSort('enrolled-at')` then routes the comparator through those nullish
 * arms while the screen renders the real rows. The model declares both fields
 * optional, so the literals are type-clean (no `as any`).
 */
class StubClassRosterService {
  constructor(private readonly roster: CohortRoster) {}
  getRoster(): Observable<CohortRoster> {
    return of(this.roster);
  }
}

function makeRoster(learners: readonly RosterLearner[]): CohortRoster {
  return {
    courseId: 'course-stub',
    cohortName: 'Stub Cohort',
    courseCode: 'SC',
    instructorName: 'Stub Instructor',
    tenantId: 'tenant-stub',
    rosterSize: learners.length,
    learners,
  };
}

describe('ClassRosterComponent — comparator nullish arms (stubbed service)', () => {
  // Two learners that OMIT the optional progressPct + enrolledAt fields, so the
  // comparator's `?? 0` / `?? ''` fallbacks fire for both operands.
  const undefinedFieldLearners: readonly RosterLearner[] = [
    {
      gcid: 'gcid-undef-b',
      displayName: 'Bea Undefined',
      avatarUrl: null,
      status: 'Active',
      atomicSessionsCompleted: 0,
      atomicSessionsTotal: 0,
      lastActivity: '',
      certPreviewEnabled: false,
      // progressPct + enrolledAt intentionally omitted (both optional).
    },
    {
      gcid: 'gcid-undef-a',
      displayName: 'Ada Undefined',
      avatarUrl: null,
      status: 'Active',
      atomicSessionsCompleted: 0,
      atomicSessionsTotal: 0,
      lastActivity: '',
      certPreviewEnabled: false,
    },
  ];

  function buildWith(learners: readonly RosterLearner[]): ComponentFixture<ClassRosterComponent> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ClassRosterComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ClassRosterService,
          useValue: new StubClassRosterService(makeRoster(learners)),
        },
      ],
    });
    const fixture = TestBed.createComponent(ClassRosterComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sorts by progress with both operands hitting the `progressPct ?? 0` arm', () => {
    const fixture = buildWith(undefinedFieldLearners);
    const comp = fixture.componentInstance;
    // Both learners have undefined progressPct → comparator returns 0 for the
    // pair → stable order preserved (Bea then Ada as supplied).
    comp.toggleSort('progress');
    fixture.detectChanges();
    expect(comp.sortKey()).toBe('progress');
    const sorted = comp.sortedLearners();
    expect(sorted.map((l) => l.gcid)).toEqual(['gcid-undef-b', 'gcid-undef-a']);
    // Each rendered row shows 0% because progressPct?? 0 → clampProgress(0).
    const labels = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="progress-"]',
    );
    labels.forEach((el) => expect(el.textContent?.trim()).toBe('0%'));
  });

  it('sorts by enrolled-at with both operands hitting the `enrolledAt ?? ""` arm', () => {
    const fixture = buildWith(undefinedFieldLearners);
    const comp = fixture.componentInstance;
    comp.toggleSort('enrolled-at');
    fixture.detectChanges();
    expect(comp.sortKey()).toBe('enrolled-at');
    // Both enrolledAt undefined → '' vs '' → 0 → original order kept.
    expect(comp.sortedLearners().map((l) => l.gcid)).toEqual(['gcid-undef-b', 'gcid-undef-a']);
    // enrolledAt() helper renders '' for the undefined projection.
    expect(comp.enrolledAt(undefinedFieldLearners[0])).toBe('');
  });

  it('progress comparator still orders a mixed defined/undefined pair (defined > undefined-as-0)', () => {
    const mixed: readonly RosterLearner[] = [
      { ...undefinedFieldLearners[0], gcid: 'gcid-defined', progressPct: 75 },
      undefinedFieldLearners[1], // undefined progressPct → treated as 0
    ];
    const fixture = buildWith(mixed);
    const comp = fixture.componentInstance;
    comp.toggleSort('progress'); // ascending: 0 (undefined) before 75 (defined)
    fixture.detectChanges();
    expect(comp.sortedLearners().map((l) => l.gcid)).toEqual(['gcid-undef-a', 'gcid-defined']);
    // Descending flips it: defined 75 first.
    comp.toggleSort('progress');
    fixture.detectChanges();
    expect(comp.sortDirection()).toBe('desc');
    expect(comp.sortedLearners()[0].gcid).toBe('gcid-defined');
  });

  it('enrolled-at comparator orders a mixed defined/undefined pair (undefined-as-"" sorts first asc)', () => {
    const mixed: readonly RosterLearner[] = [
      {
        ...undefinedFieldLearners[0],
        gcid: 'gcid-has-date',
        enrolledAt: '2026-05-26T09:00:00Z',
      },
      undefinedFieldLearners[1], // undefined enrolledAt → '' sorts before any RFC3339
    ];
    const fixture = buildWith(mixed);
    const comp = fixture.componentInstance;
    comp.toggleSort('enrolled-at'); // ascending
    fixture.detectChanges();
    expect(comp.sortedLearners().map((l) => l.gcid)).toEqual(['gcid-undef-a', 'gcid-has-date']);
  });
});
