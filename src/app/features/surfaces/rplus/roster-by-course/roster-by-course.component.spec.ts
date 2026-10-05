/**
 * RosterByCourseComponent spec — R+ /r/rosters/:courseId.
 *
 * Verifies the screen: surface-rplus accent, header pulls the courseId
 * from the signal input, body renders one row per learner, empty state
 * shows when learners[] is empty, error state shows when the BFF fails.
 * Uses real HttpTestingController + BffClientService wiring (no service
 * stubs per `feedback_no_stubs_real_wiring`).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RosterByCourseComponent } from './roster-by-course.component';
import { environment } from '../../../../../environments/environment';

interface BackendLearnerStub {
  gcid: string;
  display_name: string;
  progress_pct: number;
  enrolled_at: string;
}

const STUB_LEARNERS: readonly BackendLearnerStub[] = [
  {
    gcid: 'gcid-phyllis',
    display_name: 'gcid-phyllis',
    progress_pct: 0,
    enrolled_at: '2026-05-26T10:00:00Z',
  },
  {
    gcid: 'gcid-mei',
    display_name: 'gcid-mei',
    progress_pct: 0,
    enrolled_at: '2026-05-26T11:00:00Z',
  },
  {
    gcid: 'gcid-bob',
    display_name: 'gcid-bob',
    progress_pct: 0,
    enrolled_at: '2026-05-26T12:00:00Z',
  },
];

function setupWithLearners(
  courseId: string,
  learners: readonly BackendLearnerStub[],
): {
  fixture: ComponentFixture<RosterByCourseComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [RosterByCourseComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(RosterByCourseComponent);
  fixture.componentRef.setInput('courseId', courseId);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rosters/${courseId}`).flush({
    course_id: courseId,
    tenant_id: 'tenant-001',
    learners,
    learner_count: learners.length,
  });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('RosterByCourseComponent — populated course', () => {
  let fixture: ComponentFixture<RosterByCourseComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupWithLearners('course-cspo', STUB_LEARNERS);
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const root = element.querySelector('[data-testid="rplus-roster-by-course"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('uses a semantic <section> root', () => {
      const root = element.querySelector('[data-testid="rplus-roster-by-course"]');
      expect(root?.tagName).toBe('SECTION');
    });
  });

  describe('header', () => {
    it('shows the courseId in the course pill', () => {
      const pill = element.querySelector('[data-testid="roster-by-course-course-pill"]');
      expect(pill?.textContent).toContain('course-cspo');
    });

    it('shows total learner count from the BFF response', () => {
      const total = element.querySelector('[data-testid="roster-by-course-total"]');
      expect(total?.textContent).toContain('3');
    });
  });

  describe('table', () => {
    it('renders one row per learner (3 total)', () => {
      const rows = element.querySelectorAll('[data-testid^="roster-by-course-row-"]');
      expect(rows.length).toBe(3);
    });

    it('renders Phyllis with display_name = gcid (unwired projection)', () => {
      const row = element.querySelector('[data-testid="roster-by-course-row-gcid-phyllis"]');
      expect(row?.textContent).toContain('gcid-phyllis');
    });

    it('renders a meter-role progress bar per learner', () => {
      const meter = element.querySelector('[data-testid="roster-by-course-progress-gcid-phyllis"]');
      expect(meter?.getAttribute('role')).toBe('meter');
      expect(meter?.getAttribute('aria-valuemin')).toBe('0');
      expect(meter?.getAttribute('aria-valuemax')).toBe('100');
      expect(meter?.getAttribute('aria-valuenow')).toBe('0');
    });
  });

  describe('a11y', () => {
    it('renders a top-level <h1> heading', () => {
      const heading = element.querySelector('h1');
      expect(heading).not.toBeNull();
    });

    it('renders a skip-to-table link', () => {
      const skipLink = element.querySelector(
        'a.visually-hidden-focusable[href="#roster-by-course-table"]',
      );
      expect(skipLink).not.toBeNull();
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

describe('RosterByCourseComponent — empty course', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupWithLearners('course-empty', []);
    httpMock = built.httpMock;
    element = built.fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders an empty-state message when zero learners enrolled', () => {
    const empty = element.querySelector('[data-testid="roster-by-course-empty"]');
    expect(empty).not.toBeNull();
  });

  it('shows total count of 0', () => {
    const total = element.querySelector('[data-testid="roster-by-course-total"]');
    expect(total?.textContent).toContain('0');
  });

  it('does not render the table when empty', () => {
    const table = element.querySelector('[data-testid="roster-by-course-table"]');
    expect(table).toBeNull();
  });
});

describe('RosterByCourseComponent — error state', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RosterByCourseComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(RosterByCourseComponent);
    fixture.componentRef.setInput('courseId', 'course-broken');
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/rosters/course-broken`)
      .flush('upstream unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders an error banner on BFF failure', () => {
    const err = element.querySelector('[data-testid="roster-by-course-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
  });

  it('does not render the table on error', () => {
    const table = element.querySelector('[data-testid="roster-by-course-table"]');
    expect(table).toBeNull();
  });
});
