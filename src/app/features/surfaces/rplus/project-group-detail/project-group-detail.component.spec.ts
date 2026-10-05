/**
 * ProjectGroupDetailComponent spec — R+ Wave-5 drill-down.
 *
 * Exercises the real `ProjectGroupDetailService` against
 * `HttpTestingController` so the BFF wire contract is asserted
 * end-to-end. No mocks, no stubs — per
 * `feedback_no_stubs_real_wiring`.
 *
 * Coverage matrix:
 *   - signal-input :id binding triggers the BFF GET
 *   - success branch renders all wire fields incl. members + score
 *   - Submit CTA visible on ACTIVE; Grade CTA on SUBMITTED; neither
 *     on FORMING / GRADED
 *   - Submit CTA POSTs the BE endpoint + updates the local state
 *   - error branch + retry CTA
 *   - axe-core a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ProjectGroupDetailComponent } from './project-group-detail.component';
import { environment } from '../../../../../environments/environment';

interface BackendGroupStub {
  id: string;
  tenant_id: string;
  course_id: string;
  name: string;
  state: 'FORMING' | 'ACTIVE' | 'SUBMITTED' | 'GRADED';
  members: Array<{ gcid: string; role: string }>;
  submitted_at?: string;
  score_pct?: number;
  grader_gcid?: string;
  graded_at?: string;
  feedback?: string;
  created_at: string;
  updated_at: string;
}

function backendStub(overrides: Partial<BackendGroupStub> = {}): BackendGroupStub {
  return {
    id: 'pg-001',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    name: 'Alpha Group',
    state: 'ACTIVE',
    members: [
      { gcid: 'gcid-leader-1234', role: 'leader' },
      { gcid: 'gcid-member-5678', role: 'member' },
    ],
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-26T11:00:00Z',
    ...overrides,
  };
}

function setup(id: string): {
  fixture: ComponentFixture<ProjectGroupDetailComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [ProjectGroupDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ProjectGroupDetailComponent);
  fixture.componentRef.setInput('id', id);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock };
}

function url(id: string): string {
  return `${environment.bffBaseUrl}/api/v1/project-groups/${encodeURIComponent(id)}`;
}

describe('ProjectGroupDetailComponent', () => {
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
      const { fixture, httpMock } = setup('pg-001');
      httpMock.expectOne(url('pg-001')).flush(backendStub());
      fixture.detectChanges();
      const root = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="rplus-project-group-detail"]',
      );
      expect(root?.className).toContain('surface-rplus');
      httpMock.verify();
    });
  });

  describe('GET wiring', () => {
    it('issues GET /api/v1/project-groups/{id} on initial render', () => {
      const { fixture, httpMock } = setup('pg-001');
      const req = httpMock.expectOne(url('pg-001'));
      expect(req.request.method).toBe('GET');
      req.flush(backendStub());
      fixture.detectChanges();
      httpMock.verify();
    });

    it('URL-encodes the id segment', () => {
      const { fixture, httpMock } = setup('pg/with-slash');
      httpMock.expectOne(url('pg/with-slash')).flush(backendStub({ id: 'pg/with-slash' }));
      fixture.detectChanges();
      httpMock.verify();
    });
  });

  describe('ACTIVE group success branch', () => {
    let fixture: ComponentFixture<ProjectGroupDetailComponent>;
    let httpMock: HttpTestingController;
    let element: HTMLElement;

    beforeEach(() => {
      const built = setup('pg-001');
      fixture = built.fixture;
      httpMock = built.httpMock;
      httpMock.expectOne(url('pg-001')).flush(backendStub());
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the group name + ACTIVE state badge', () => {
      expect(
        element.querySelector('[data-testid="project-group-detail-name"]')?.textContent,
      ).toContain('Alpha Group');
      const badge = element.querySelector('[data-testid="project-group-detail-state-pg-001"]');
      // The translate pipe returns the raw i18n key in the test environment
      // (no translations are loaded into TranslateService), so the badge
      // renders the key, not the localized 'Active' text.
      expect(badge?.textContent).toContain('rplus.projectGroups.state.ACTIVE');
    });

    it('renders the course id + member count', () => {
      expect(
        element.querySelector('[data-testid="project-group-detail-course"]')?.textContent,
      ).toContain('course-cspo');
      expect(
        element.querySelector('[data-testid="project-group-detail-member-count"]')?.textContent,
      ).toContain('2');
    });

    it('renders one member li per member, leader first', () => {
      const members = element.querySelectorAll('[data-testid^="project-group-detail-member-gcid"]');
      expect(members.length).toBe(2);
      const leader = element.querySelector(
        '[data-testid="project-group-detail-member-gcid-leader-1234"]',
      );
      expect(leader?.className).toContain('project-group-detail__member--leader');
    });

    it('renders the back-to-list breadcrumb link', () => {
      const back = element.querySelector('[data-testid="project-group-detail-back-link"]');
      expect(back?.tagName).toBe('A');
      expect(back?.getAttribute('href')).toBe('/r/project-groups');
    });

    it('exposes the Submit CTA on an ACTIVE group; hides Grade', () => {
      expect(element.querySelector('[data-testid="project-group-detail-submit"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="project-group-detail-grade"]')).toBeNull();
    });

    it('Submit CTA POSTs to /{id}/submit and updates the local state', () => {
      const submit = element.querySelector(
        '[data-testid="project-group-detail-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      const req = httpMock.expectOne(url('pg-001') + '/submit');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(
        backendStub({
          state: 'SUBMITTED',
          submitted_at: '2026-05-26T12:00:00Z',
        }),
      );
      fixture.detectChanges();
      const badge = element.querySelector('[data-testid="project-group-detail-state-pg-001"]');
      // Same i18n-key-passthrough rationale as the ACTIVE assertion above:
      // the badge shows the raw key after the SUBMITTED transition.
      expect(badge?.textContent).toContain('rplus.projectGroups.state.SUBMITTED');
      // Submit hidden post-transition; Grade now visible.
      expect(element.querySelector('[data-testid="project-group-detail-submit"]')).toBeNull();
      expect(element.querySelector('[data-testid="project-group-detail-grade"]')).not.toBeNull();
    });
  });

  describe('SUBMITTED group branch', () => {
    it('exposes the Grade CTA; hides Submit', () => {
      const { fixture, httpMock } = setup('pg-2');
      httpMock.expectOne(url('pg-2')).flush(
        backendStub({
          id: 'pg-2',
          state: 'SUBMITTED',
          submitted_at: '2026-05-25T10:00:00Z',
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="project-group-detail-grade"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="project-group-detail-submit"]')).toBeNull();
      httpMock.verify();
    });
  });

  describe('GRADED group branch', () => {
    it('hides both Submit + Grade CTAs and shows score / feedback', () => {
      const { fixture, httpMock } = setup('pg-3');
      httpMock.expectOne(url('pg-3')).flush(
        backendStub({
          id: 'pg-3',
          state: 'GRADED',
          submitted_at: '2026-05-25T10:00:00Z',
          score_pct: 95,
          grader_gcid: 'gcid-instructor',
          graded_at: '2026-05-26T12:00:00Z',
          feedback: 'Strong synthesis, weak references',
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="project-group-detail-submit"]')).toBeNull();
      expect(element.querySelector('[data-testid="project-group-detail-grade"]')).toBeNull();
      expect(
        element.querySelector('[data-testid="project-group-detail-no-action"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="project-group-detail-score"]')?.textContent,
      ).toContain('95');
      expect(
        element.querySelector('[data-testid="project-group-detail-feedback"]')?.textContent,
      ).toContain('Strong synthesis');
      httpMock.verify();
    });
  });

  describe('FORMING group branch', () => {
    it('hides both Submit + Grade CTAs (no available transition from FORMING via these endpoints)', () => {
      const { fixture, httpMock } = setup('pg-4');
      httpMock.expectOne(url('pg-4')).flush(
        backendStub({
          id: 'pg-4',
          state: 'FORMING',
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="project-group-detail-submit"]')).toBeNull();
      expect(element.querySelector('[data-testid="project-group-detail-grade"]')).toBeNull();
      expect(
        element.querySelector('[data-testid="project-group-detail-no-action"]'),
      ).not.toBeNull();
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
      const err = element.querySelector('[data-testid="project-group-detail-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(element.querySelector('[data-testid="project-group-detail-retry"]')).not.toBeNull();
      httpMock.verify();
    });

    it('retry CTA refires the GET with the same id', () => {
      const { fixture, httpMock } = setup('pg-1');
      httpMock.expectOne(url('pg-1')).flush('upstream', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      fixture.detectChanges();
      const retry = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="project-group-detail-retry"]',
      ) as HTMLButtonElement;
      retry.click();
      httpMock.expectOne(url('pg-1')).flush(backendStub({ id: 'pg-1' }));
      fixture.detectChanges();
      const panel = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="project-group-detail-panel-pg-1"]',
      );
      expect(panel).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations', async () => {
      const { fixture, httpMock } = setup('pg-001');
      httpMock.expectOne(url('pg-001')).flush(backendStub());
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

  // ---------------------------------------------------------------------------
  // AUGMENTED COVERAGE (added run) — exercises uncovered methods/branches:
  //   - loading state render (pre-flush)
  //   - id() echo in the header + breadcrumb leaf
  //   - badgeClass() / stateIcon() public method outputs across all 4 states
  //   - shortGcid() truncation vs passthrough (member li text)
  //   - the Grade CTA POST path (score_pct 100 / feedback '')
  //   - write-pending disables CTA + guards re-entrancy
  //   - submit() / grade() error paths (409 conflict, 403 unauthorised)
  //   - every errorKeyFor branch (404 / 401 / 403 / 409 / 5xx / generic / no-status)
  //   - effect re-fetch when the :id input changes
  // All new tests use the global Vitest API per repo ADR-176 conventions.
  // ---------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders the loading banner before the GET resolves', () => {
      const { fixture, httpMock } = setup('pg-load');
      const element = fixture.nativeElement as HTMLElement;
      const loading = element.querySelector('[data-testid="project-group-detail-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      // panel / error not yet rendered
      expect(element.querySelector('[data-testid="project-group-detail-error"]')).toBeNull();
      expect(fixture.componentInstance.isLoading()).toBe(true);
      // flush so afterEach verify() is clean
      httpMock.expectOne(url('pg-load')).flush(backendStub({ id: 'pg-load' }));
    });
  });

  describe('header echoes the :id input', () => {
    it('renders id() in the header code element', () => {
      const { fixture, httpMock } = setup('pg-header-99');
      httpMock.expectOne(url('pg-header-99')).flush(backendStub({ id: 'pg-header-99' }));
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const idEl = element.querySelector('[data-testid="project-group-detail-id"]');
      expect(idEl?.textContent).toContain('pg-header-99');
      // breadcrumb root link is always present (above the @if region)
      const back = element.querySelector('[data-testid="project-group-detail-back-link"]');
      expect(back?.getAttribute('href')).toBe('/r/project-groups');
      httpMock.verify();
    });
  });

  describe('badgeClass / stateIcon public methods', () => {
    let component: ProjectGroupDetailComponent;

    beforeEach(() => {
      const { fixture, httpMock } = setup('pg-methods');
      httpMock.expectOne(url('pg-methods')).flush(backendStub({ id: 'pg-methods' }));
      fixture.detectChanges();
      component = fixture.componentInstance;
      httpMock.verify();
    });

    it('maps every state to its badge modifier', () => {
      expect(component.badgeClass('FORMING')).toBe('badge-forming');
      expect(component.badgeClass('ACTIVE')).toBe('badge-active');
      expect(component.badgeClass('SUBMITTED')).toBe('badge-submitted');
      expect(component.badgeClass('GRADED')).toBe('badge-graded');
    });

    it('maps every state to its FontAwesome glyph', () => {
      expect(component.stateIcon('FORMING')).toBe('fa-users-line');
      expect(component.stateIcon('ACTIVE')).toBe('fa-bolt');
      expect(component.stateIcon('SUBMITTED')).toBe('fa-paper-plane');
      expect(component.stateIcon('GRADED')).toBe('fa-square-check');
    });
  });

  describe('badge CSS modifier render', () => {
    it('renders the ACTIVE badge with the badge-active modifier class', () => {
      const { fixture, httpMock } = setup('pg-badge-css');
      httpMock
        .expectOne(url('pg-badge-css'))
        .flush(backendStub({ id: 'pg-badge-css', state: 'ACTIVE' }));
      fixture.detectChanges();
      const badge = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="project-group-detail-state-pg-badge-css"]',
      );
      expect(badge?.className).toContain('badge-active');
      httpMock.verify();
    });
  });

  describe('shortGcid truncation', () => {
    it('truncates a long gcid to 8 chars + ellipsis in the member li', () => {
      const { fixture, httpMock } = setup('pg-short');
      httpMock.expectOne(url('pg-short')).flush(
        backendStub({
          id: 'pg-short',
          members: [
            { gcid: 'abcdefghijklmnop', role: 'leader' },
            { gcid: 'short', role: 'member' },
          ],
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const leaderLi = element.querySelector(
        '[data-testid="project-group-detail-member-abcdefghijklmnop"]',
      );
      // 16-char gcid -> first 8 chars + ellipsis
      expect(leaderLi?.textContent).toContain('abcdefgh…');
      expect(leaderLi?.textContent).not.toContain('abcdefghijklmnop');
      // short gcid (<= 12 chars) passes through unchanged
      const memberLi = element.querySelector('[data-testid="project-group-detail-member-short"]');
      expect(memberLi?.textContent).toContain('short');
      httpMock.verify();
    });

    it('shortGcid() returns the input unchanged at the 12-char boundary', () => {
      const { fixture, httpMock } = setup('pg-bound');
      httpMock.expectOne(url('pg-bound')).flush(backendStub({ id: 'pg-bound' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      expect(c.shortGcid('123456789012')).toBe('123456789012'); // exactly 12
      expect(c.shortGcid('1234567890123')).toBe('12345678…'); // 13 -> truncate
      httpMock.verify();
    });
  });

  describe('Grade CTA POST path', () => {
    it('POSTs the placeholder 100%/empty-feedback payload and updates state to GRADED', () => {
      const { fixture, httpMock } = setup('pg-grade');
      httpMock.expectOne(url('pg-grade')).flush(
        backendStub({
          id: 'pg-grade',
          state: 'SUBMITTED',
          submitted_at: '2026-05-25T10:00:00Z',
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const grade = element.querySelector(
        '[data-testid="project-group-detail-grade"]',
      ) as HTMLButtonElement;
      grade.click();
      const req = httpMock.expectOne(url('pg-grade') + '/grade');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ score_pct: 100, feedback: '' });
      req.flush(
        backendStub({
          id: 'pg-grade',
          state: 'GRADED',
          submitted_at: '2026-05-25T10:00:00Z',
          score_pct: 100,
          grader_gcid: 'gcid-instructor',
          graded_at: '2026-05-26T12:00:00Z',
          feedback: '',
        }),
      );
      fixture.detectChanges();
      const badge = element.querySelector('[data-testid="project-group-detail-state-pg-grade"]');
      expect(badge?.textContent).toContain('rplus.projectGroups.state.GRADED');
      // After GRADED both CTAs hide; no-action placeholder shows.
      expect(element.querySelector('[data-testid="project-group-detail-grade"]')).toBeNull();
      expect(
        element.querySelector('[data-testid="project-group-detail-no-action"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="project-group-detail-score"]')?.textContent,
      ).toContain('100');
      httpMock.verify();
    });
  });

  describe('write-pending disables CTA + guards re-entrancy', () => {
    it('sets isWritePending while Submit is in flight and disables the button', () => {
      const { fixture, httpMock } = setup('pg-pending');
      httpMock
        .expectOne(url('pg-pending'))
        .flush(backendStub({ id: 'pg-pending', state: 'ACTIVE' }));
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const submit = element.querySelector(
        '[data-testid="project-group-detail-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.isWritePending()).toBe(true);
      const inFlight = element.querySelector(
        '[data-testid="project-group-detail-submit"]',
      ) as HTMLButtonElement;
      expect(inFlight.disabled).toBe(true);
      // Resolve the in-flight request so verify() is clean.
      httpMock
        .expectOne(url('pg-pending') + '/submit')
        .flush(backendStub({ id: 'pg-pending', state: 'SUBMITTED' }));
      fixture.detectChanges();
      expect(fixture.componentInstance.isWritePending()).toBe(false);
      httpMock.verify();
    });

    it('does not fire a second POST while a write is already pending', () => {
      const { fixture, httpMock } = setup('pg-reentrant');
      httpMock
        .expectOne(url('pg-reentrant'))
        .flush(backendStub({ id: 'pg-reentrant', state: 'ACTIVE' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      // First call goes through (1 POST queued).
      c.submit();
      // Second call should early-return because writePending is true.
      c.submit();
      // Exactly ONE outstanding /submit request.
      const reqs = httpMock.match(url('pg-reentrant') + '/submit');
      expect(reqs.length).toBe(1);
      reqs[0].flush(backendStub({ id: 'pg-reentrant', state: 'SUBMITTED' }));
      httpMock.verify();
    });

    it('grade() early-returns when the group is not gradable (no POST)', () => {
      const { fixture, httpMock } = setup('pg-notgrade');
      httpMock
        .expectOne(url('pg-notgrade'))
        .flush(backendStub({ id: 'pg-notgrade', state: 'ACTIVE' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.grade(); // ACTIVE -> canGrade false -> guard returns
      httpMock.expectNone(url('pg-notgrade') + '/grade');
      expect(c.isWritePending()).toBe(false);
      httpMock.verify();
    });

    it('submit() early-returns when the group is not submittable (no POST)', () => {
      const { fixture, httpMock } = setup('pg-notsubmit');
      httpMock
        .expectOne(url('pg-notsubmit'))
        .flush(backendStub({ id: 'pg-notsubmit', state: 'FORMING' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.submit(); // FORMING -> canSubmit false -> guard returns
      httpMock.expectNone(url('pg-notsubmit') + '/submit');
      expect(c.isWritePending()).toBe(false);
      httpMock.verify();
    });
  });

  describe('write error paths', () => {
    it('Submit 409 conflict flips into the error state with errorConflict key', () => {
      const { fixture, httpMock } = setup('pg-conflict');
      httpMock
        .expectOne(url('pg-conflict'))
        .flush(backendStub({ id: 'pg-conflict', state: 'ACTIVE' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.submit();
      httpMock.expectOne(url('pg-conflict') + '/submit').flush('conflict', {
        status: 409,
        statusText: 'Conflict',
      });
      fixture.detectChanges();
      expect(c.isError()).toBe(true);
      expect(c.isWritePending()).toBe(false);
      expect(c.errorKey()).toBe('rplus.projectGroupDetail.errorConflict');
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="project-group-detail-error"]')).not.toBeNull();
      httpMock.verify();
    });

    it('Grade 403 flips into the error state with errorUnauthorised key', () => {
      const { fixture, httpMock } = setup('pg-forbidden');
      httpMock.expectOne(url('pg-forbidden')).flush(
        backendStub({
          id: 'pg-forbidden',
          state: 'SUBMITTED',
          submitted_at: '2026-05-25T10:00:00Z',
        }),
      );
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.grade();
      httpMock.expectOne(url('pg-forbidden') + '/grade').flush('forbidden', {
        status: 403,
        statusText: 'Forbidden',
      });
      fixture.detectChanges();
      expect(c.isError()).toBe(true);
      expect(c.isWritePending()).toBe(false);
      expect(c.errorKey()).toBe('rplus.projectGroupDetail.errorUnauthorised');
      httpMock.verify();
    });
  });

  describe('errorKeyFor branch matrix (via GET status codes)', () => {
    function errorKeyForStatus(
      id: string,
      status: number,
    ): { key: string; httpMock: HttpTestingController } {
      const { fixture, httpMock } = setup(id);
      httpMock.expectOne(url(id)).flush('err', {
        status,
        statusText: 'E',
      });
      fixture.detectChanges();
      return { key: fixture.componentInstance.errorKey(), httpMock };
    }

    it('401 -> errorUnauthorised', () => {
      const { key, httpMock } = errorKeyForStatus('pg-401', 401);
      expect(key).toBe('rplus.projectGroupDetail.errorUnauthorised');
      httpMock.verify();
    });

    it('409 -> errorConflict', () => {
      const { key, httpMock } = errorKeyForStatus('pg-409', 409);
      expect(key).toBe('rplus.projectGroupDetail.errorConflict');
      httpMock.verify();
    });

    it('500 -> errorUpstream', () => {
      const { key, httpMock } = errorKeyForStatus('pg-500', 500);
      expect(key).toBe('rplus.projectGroupDetail.errorUpstream');
      httpMock.verify();
    });

    it('418 (unmapped 4xx) -> errorGeneric', () => {
      const { key, httpMock } = errorKeyForStatus('pg-418', 418);
      expect(key).toBe('rplus.projectGroupDetail.errorGeneric');
      httpMock.verify();
    });

    it('a non-HTTP error (no numeric status) -> errorGeneric', () => {
      const { fixture, httpMock } = setup('pg-weird');
      httpMock.expectOne(url('pg-weird')).error(new ProgressEvent('network-down'));
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('rplus.projectGroupDetail.errorGeneric');
      httpMock.verify();
    });
  });

  describe('null-group guards (pre-load) + derived false-arms', () => {
    it('submit() early-returns while the group is still loading (group() null, no POST)', () => {
      const { fixture, httpMock } = setup('pg-null-submit');
      // Do NOT flush the GET — loadState is still { status: 'loading' },
      // so group() is null and the `!g` short-circuit fires.
      const c = fixture.componentInstance;
      expect(c.group()).toBeNull();
      expect(c.canSubmitGroup()).toBe(false); // g ? canSubmit(g) : false -> false arm
      expect(c.canGradeGroup()).toBe(false); // g ? canGrade(g) : false -> false arm
      c.submit();
      // No /submit POST queued because the guard returned early.
      httpMock.expectNone(url('pg-null-submit') + '/submit');
      expect(c.isWritePending()).toBe(false);
      // Resolve the still-pending GET so afterEach verify() is clean.
      httpMock.expectOne(url('pg-null-submit')).flush(backendStub({ id: 'pg-null-submit' }));
      httpMock.verify();
    });

    it('grade() early-returns while the group is still loading (group() null, no POST)', () => {
      const { fixture, httpMock } = setup('pg-null-grade');
      const c = fixture.componentInstance;
      expect(c.group()).toBeNull();
      c.grade();
      httpMock.expectNone(url('pg-null-grade') + '/grade');
      expect(c.isWritePending()).toBe(false);
      httpMock
        .expectOne(url('pg-null-grade'))
        .flush(backendStub({ id: 'pg-null-grade', state: 'SUBMITTED' }));
      httpMock.verify();
    });

    it('derived CTA signals stay false after the fetch errors (group() null in error state)', () => {
      const { fixture, httpMock } = setup('pg-null-error');
      httpMock.expectOne(url('pg-null-error')).flush('boom', {
        status: 500,
        statusText: 'Server Error',
      });
      fixture.detectChanges();
      const c = fixture.componentInstance;
      // error state -> group() null -> both derived guards take the false arm.
      expect(c.group()).toBeNull();
      expect(c.canSubmitGroup()).toBe(false);
      expect(c.canGradeGroup()).toBe(false);
      // submit()/grade() both early-return on the null group.
      c.submit();
      c.grade();
      httpMock.expectNone(url('pg-null-error') + '/submit');
      httpMock.expectNone(url('pg-null-error') + '/grade');
      httpMock.verify();
    });
  });

  describe('effect re-fetch on :id change', () => {
    it('re-issues the GET when the :id input is reassigned', () => {
      const { fixture, httpMock } = setup('pg-first');
      httpMock.expectOne(url('pg-first')).flush(backendStub({ id: 'pg-first' }));
      fixture.detectChanges();
      // Reassign the route param -> effect re-runs loadGroup with the new id.
      fixture.componentRef.setInput('id', 'pg-second');
      fixture.detectChanges();
      const req = httpMock.expectOne(url('pg-second'));
      expect(req.request.method).toBe('GET');
      req.flush(backendStub({ id: 'pg-second', name: 'Second Group' }));
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="project-group-detail-name"]')?.textContent,
      ).toContain('Second Group');
      httpMock.verify();
    });
  });

  describe('member editing (CHO-2131)', () => {
    function activeGroup(id: string): {
      fixture: ComponentFixture<ProjectGroupDetailComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock } = setup(id);
      httpMock.expectOne(url(id)).flush(
        backendStub({
          id,
          state: 'ACTIVE',
          members: [
            { gcid: 'gcid-leader-1234', role: 'leader' },
            { gcid: 'gcid-member-5678', role: 'member' },
          ],
        }),
      );
      fixture.detectChanges();
      return {
        fixture,
        httpMock,
        element: fixture.nativeElement as HTMLElement,
      };
    }

    it('renders the add-member picker + per-member remove on an editable (ACTIVE) group', () => {
      const { element, httpMock } = activeGroup('pg-edit');
      expect(
        element.querySelector('[data-testid="project-group-detail-add-member"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="project-group-detail-remove-gcid-member-5678"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('hides the add-member picker + remove buttons on a frozen (GRADED) group', () => {
      const { fixture, httpMock } = setup('pg-frozen');
      httpMock.expectOne(url('pg-frozen')).flush(
        backendStub({
          id: 'pg-frozen',
          state: 'GRADED',
          submitted_at: '2026-05-25T10:00:00Z',
          score_pct: 90,
          grader_gcid: 'gcid-instructor',
          graded_at: '2026-05-26T12:00:00Z',
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="project-group-detail-add-member"]')).toBeNull();
      expect(element.querySelector('[data-testid^="project-group-detail-remove-"]')).toBeNull();
      httpMock.verify();
    });

    it('onMemberPicked POSTs to /{id}/members and appends the member', () => {
      const { fixture, httpMock, element } = activeGroup('pg-add');
      fixture.componentInstance.onMemberPicked({
        id: 'gcid-new-9999',
        label: 'New M',
      });
      const req = httpMock.expectOne(url('pg-add') + '/members');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        gcid: 'gcid-new-9999',
        role: 'member',
      });
      req.flush(
        backendStub({
          id: 'pg-add',
          state: 'ACTIVE',
          members: [
            { gcid: 'gcid-leader-1234', role: 'leader' },
            { gcid: 'gcid-member-5678', role: 'member' },
            { gcid: 'gcid-new-9999', role: 'member' },
          ],
        }),
      );
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="project-group-detail-member-count"]')?.textContent,
      ).toContain('3');
      httpMock.verify();
    });

    it('removeMember DELETEs /{id}/members/{gcid} and drops the member', () => {
      const { fixture, httpMock, element } = activeGroup('pg-rm');
      fixture.componentInstance.removeMember('gcid-member-5678');
      const req = httpMock.expectOne(url('pg-rm') + '/members/gcid-member-5678');
      expect(req.request.method).toBe('DELETE');
      req.flush(
        backendStub({
          id: 'pg-rm',
          state: 'ACTIVE',
          members: [{ gcid: 'gcid-leader-1234', role: 'leader' }],
        }),
      );
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="project-group-detail-member-count"]')?.textContent,
      ).toContain('1');
      httpMock.verify();
    });

    it('add 409 surfaces an inline member-edit error without nuking the panel', () => {
      const { fixture, httpMock, element } = activeGroup('pg-dup');
      fixture.componentInstance.onMemberPicked({
        id: 'gcid-leader-1234',
        label: 'dup',
      });
      httpMock
        .expectOne(url('pg-dup') + '/members')
        .flush('conflict', { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="project-group-detail-panel-pg-dup"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="project-group-detail-member-error"]'),
      ).not.toBeNull();
      expect(fixture.componentInstance.isError()).toBe(false);
      httpMock.verify();
    });

    it('onMemberPicked guards re-entrancy while a write is pending', () => {
      const { fixture, httpMock } = activeGroup('pg-guard');
      const c = fixture.componentInstance;
      c.onMemberPicked({ id: 'gcid-a', label: 'A' });
      c.onMemberPicked({ id: 'gcid-b', label: 'B' }); // early-return: write pending
      const reqs = httpMock.match(url('pg-guard') + '/members');
      expect(reqs.length).toBe(1);
      reqs[0].flush(backendStub({ id: 'pg-guard', state: 'ACTIVE' }));
      httpMock.verify();
    });
  });
});
