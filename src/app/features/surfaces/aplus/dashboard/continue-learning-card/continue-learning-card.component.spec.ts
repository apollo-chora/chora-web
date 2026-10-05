import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { ContinueLearningCardComponent } from './continue-learning-card.component';
import { DashboardService } from '../dashboard.service';
import type { DashboardSummary, LearnerCourseSummary } from '../dashboard.model';

/**
 * ContinueLearningCardComponent spec — the A+ dashboard "continue learning"
 * wrapper (SP2.6, dashboard-as-hub redesign). It is the GENERIC COLLECTION
 * pattern made concrete: a ROW-BY-ROW list of the learner's courses that shows
 * the 3 latest collapsed (latest on top) and, on "See more", reveals the full
 * list paginated 10/page with a ‹ Page x of N › pager whose arrows disable at
 * the ends.
 *
 * Self-contained per the batch-B contract: NO @Input — it reads
 * `DashboardService.summary()` (the root singleton the shell already loaded) and
 * never calls `.load()`. The source list arrives created_at ASC (oldest first,
 * per chora-consumption `listLearningPathsByLearner`), so the card REVERSES it
 * to surface the newest course on top.
 *
 * i18n test contract: the translate pipe emits RAW keys in tests, so we assert
 * on data-testid + routerLink hrefs + row identity, never translated copy.
 */

// ── Fakes ────────────────────────────────────────────────────────────────
// The card only reads `DashboardService.summary` (a signal). Back it with a
// writable signal so tests can flip empty / small / large rosters.
function makeDashboardMock(summary: DashboardSummary | null = null) {
  const summarySig = signal<DashboardSummary | null>(summary);
  return { summary: summarySig };
}
type DashboardMock = ReturnType<typeof makeDashboardMock>;

function course(over: Partial<LearnerCourseSummary> = {}): LearnerCourseSummary {
  return {
    courseId: 'c1',
    courseCode: 'CODE-1',
    title: 'Course 1',
    instructorName: 'Ada Lovelace',
    progressPct: 40,
    remainingAtoms: 6,
    xpEarned: 120,
    memoryPct: 70,
    dayNumber: 3,
    dayTotal: 10,
    retention_state: 'medium',
    ...over,
  };
}

/** N courses in created_at ASC order (id `c0`..`c{N-1}` — c0 is the OLDEST). */
function courses(n: number): LearnerCourseSummary[] {
  return Array.from({ length: n }, (_, i) => course({ courseId: `c${i}`, title: `Course ${i}` }));
}

function summaryWith(learnerCourses: readonly LearnerCourseSummary[]): DashboardSummary {
  return {
    gcidPillLabel: 'Learner',
    userDisplayName: 'Phyllis',
    currentStreakDays: 0,
    learnerCourses,
    instructorCourses: [],
  };
}

function build(dash: DashboardMock): ComponentFixture<ContinueLearningCardComponent> {
  TestBed.configureTestingModule({
    imports: [ContinueLearningCardComponent],
    providers: [provideRouter([]), { provide: DashboardService, useValue: dash }],
  });
  const fixture = TestBed.createComponent(ContinueLearningCardComponent);
  fixture.detectChanges();
  return fixture;
}

function testid(
  fixture: ComponentFixture<ContinueLearningCardComponent>,
  id: string,
): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
}

/** Ordered list of the rendered row course-ids (top-to-bottom). */
function renderedRowIds(fixture: ComponentFixture<ContinueLearningCardComponent>): string[] {
  const rows = fixture.nativeElement.querySelectorAll(
    '[data-testid^="aplus-dashboard-course-row-"]',
  );
  return Array.from(rows as NodeListOf<HTMLElement>).map((el) =>
    (el.getAttribute('data-testid') ?? '').replace('aplus-dashboard-course-row-', ''),
  );
}

describe('ContinueLearningCardComponent', () => {
  let dash: DashboardMock;

  beforeEach(() => {
    TestBed.resetTestingModule();
    dash = makeDashboardMock();
  });

  it('renders the courses wrapper card', () => {
    dash = makeDashboardMock(summaryWith(courses(2)));
    const fixture = build(dash);
    expect(testid(fixture, 'aplus-dashboard-courses')).toBeTruthy();
  });

  it('shows an honest empty state when there are no courses', () => {
    dash = makeDashboardMock(summaryWith([]));
    const fixture = build(dash);
    expect(testid(fixture, 'aplus-dashboard-courses-empty')).toBeTruthy();
    expect(renderedRowIds(fixture)).toEqual([]);
    // No See-more affordance with nothing to show.
    expect(testid(fixture, 'aplus-dashboard-courses-see-more')).toBeFalsy();
  });

  it('treats a null summary (loading/errored) as the empty state', () => {
    // summary() is null until the shell's load resolves — render empty, no crash.
    const fixture = build(dash);
    expect(testid(fixture, 'aplus-dashboard-courses-empty')).toBeTruthy();
    expect(renderedRowIds(fixture)).toEqual([]);
  });

  it('shows all rows and NO See-more for a 3-or-fewer roster', () => {
    dash = makeDashboardMock(summaryWith(courses(3)));
    const fixture = build(dash);
    expect(renderedRowIds(fixture).length).toBe(3);
    expect(testid(fixture, 'aplus-dashboard-courses-see-more')).toBeFalsy();
  });

  it('shows only the 3 latest collapsed and offers See-more when >3', () => {
    dash = makeDashboardMock(summaryWith(courses(5)));
    const fixture = build(dash);
    expect(renderedRowIds(fixture).length).toBe(3);
    expect(testid(fixture, 'aplus-dashboard-courses-see-more')).toBeTruthy();
    // Collapsed, so no pager yet.
    expect(testid(fixture, 'aplus-dashboard-courses-pager')).toBeFalsy();
  });

  it('orders latest-on-top (reverses the created_at-ASC source)', () => {
    // Source c0..c4 is oldest→newest; the 3 latest on top are c4, c3, c2.
    dash = makeDashboardMock(summaryWith(courses(5)));
    const fixture = build(dash);
    expect(renderedRowIds(fixture)).toEqual(['c4', 'c3', 'c2']);
    // The oldest courses are NOT in the collapsed preview.
    expect(testid(fixture, 'aplus-dashboard-course-row-c0')).toBeFalsy();
  });

  it('routes each row Continue link to /a/courses/{courseId}/learn', () => {
    dash = makeDashboardMock(summaryWith([course({ courseId: 'x-9' })]));
    const fixture = build(dash);
    const link = testid(fixture, 'aplus-dashboard-continue-x-9');
    expect(link?.getAttribute('href')).toBe('/a/courses/x-9/learn');
  });

  it('omits the Continue link when a course has an empty courseId', () => {
    dash = makeDashboardMock(summaryWith([course({ courseId: '' })]));
    const fixture = build(dash);
    // A malformed /a/courses//learn link must never render.
    expect(testid(fixture, 'aplus-dashboard-continue-')).toBeFalsy();
  });

  it('See-more reveals the full list paginated 10/page with a pager', () => {
    dash = makeDashboardMock(summaryWith(courses(25)));
    const fixture = build(dash);
    // Collapsed preview first.
    expect(renderedRowIds(fixture).length).toBe(3);

    testid(fixture, 'aplus-dashboard-courses-see-more')!.click();
    fixture.detectChanges();

    // First page = 10 rows; pager present.
    expect(renderedRowIds(fixture).length).toBe(10);
    const pager = testid(fixture, 'aplus-dashboard-courses-pager');
    expect(pager).toBeTruthy();
    // Page 1 of 3 (25 items / 10).
    const status = testid(fixture, 'aplus-dashboard-courses-page-status');
    expect(status?.textContent).toContain('1');
    expect(status?.textContent).toContain('3');
  });

  it('disables ‹ on the first page and › on the last page', () => {
    dash = makeDashboardMock(summaryWith(courses(25)));
    const fixture = build(dash);
    testid(fixture, 'aplus-dashboard-courses-see-more')!.click();
    fixture.detectChanges();

    const prev = testid(fixture, 'aplus-dashboard-courses-prev') as HTMLButtonElement;
    const next = testid(fixture, 'aplus-dashboard-courses-next') as HTMLButtonElement;
    // First page: ‹ disabled, › enabled.
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    // Walk to the last page (0 → 1 → 2).
    next.click();
    fixture.detectChanges();
    next.click();
    fixture.detectChanges();

    expect((testid(fixture, 'aplus-dashboard-courses-prev') as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((testid(fixture, 'aplus-dashboard-courses-next') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('advances the visible window when paging next', () => {
    dash = makeDashboardMock(summaryWith(courses(25)));
    const fixture = build(dash);
    testid(fixture, 'aplus-dashboard-courses-see-more')!.click();
    fixture.detectChanges();

    // Reversed source: newest c24 on top; page 1 top is c24, page 2 top is c14.
    expect(renderedRowIds(fixture)[0]).toBe('c24');
    testid(fixture, 'aplus-dashboard-courses-next')!.click();
    fixture.detectChanges();
    expect(renderedRowIds(fixture)[0]).toBe('c14');
    expect(renderedRowIds(fixture).length).toBe(10);
  });

  it('steps back to the earlier window when paging prev', () => {
    dash = makeDashboardMock(summaryWith(courses(25)));
    const fixture = build(dash);
    testid(fixture, 'aplus-dashboard-courses-see-more')!.click();
    fixture.detectChanges();

    // Advance to page 2 (top c14), then step back to page 1 (top c24).
    testid(fixture, 'aplus-dashboard-courses-next')!.click();
    fixture.detectChanges();
    expect(renderedRowIds(fixture)[0]).toBe('c14');

    testid(fixture, 'aplus-dashboard-courses-prev')!.click();
    fixture.detectChanges();
    expect(renderedRowIds(fixture)[0]).toBe('c24');
    expect((testid(fixture, 'aplus-dashboard-courses-prev') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('See-more with 4-10 courses expands without a pager (single page)', () => {
    dash = makeDashboardMock(summaryWith(courses(4)));
    const fixture = build(dash);
    testid(fixture, 'aplus-dashboard-courses-see-more')!.click();
    fixture.detectChanges();
    // All 4 now visible, one page → no pager, but See-less is offered.
    expect(renderedRowIds(fixture).length).toBe(4);
    expect(testid(fixture, 'aplus-dashboard-courses-pager')).toBeFalsy();
    expect(testid(fixture, 'aplus-dashboard-courses-see-less')).toBeTruthy();
  });

  it('See-less collapses back to the 3 latest', () => {
    dash = makeDashboardMock(summaryWith(courses(12)));
    const fixture = build(dash);
    testid(fixture, 'aplus-dashboard-courses-see-more')!.click();
    fixture.detectChanges();
    expect(renderedRowIds(fixture).length).toBe(10);

    testid(fixture, 'aplus-dashboard-courses-see-less')!.click();
    fixture.detectChanges();
    expect(renderedRowIds(fixture).length).toBe(3);
    expect(testid(fixture, 'aplus-dashboard-courses-see-more')).toBeTruthy();
  });

  it('renders the Ebbinghaus retention dot per row', () => {
    dash = makeDashboardMock(summaryWith([course({ courseId: 'ret-1', retention_state: 'low' })]));
    const fixture = build(dash);
    expect(testid(fixture, 'aplus-retention-ret-1')).toBeTruthy();
  });

  it('has no critical/serious accessibility violations (populated + expanded)', async () => {
    dash = makeDashboardMock(summaryWith(courses(25)));
    const fixture = build(dash);
    testid(fixture, 'aplus-dashboard-courses-see-more')!.click();
    fixture.detectChanges();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  it('has no critical/serious accessibility violations (empty state)', async () => {
    dash = makeDashboardMock(summaryWith([]));
    const fixture = build(dash);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
