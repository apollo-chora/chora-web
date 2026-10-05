import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  CoursesSubNavComponent,
  COURSES_SUB_NAV_TABS,
} from './courses-sub-nav.component';
import { APLUS_ROUTES } from '../aplus.routes';

/**
 * The A+ Courses tab strip (C2 slice 3, orchestrator ruling 2026-09-03 option
 * b). It replaces the Learn hub sub-nav, which was deleted in the same commit.
 *
 * The property that makes the replacement safe is REACHABILITY: the strip
 * carries all five destinations the retired strip carried, minus the Dashboard
 * tab that the ruling removed, so deleting the old one strands nothing. That is
 * asserted against the real route table rather than a hand-kept list, because a
 * tab pointing at an unmounted path is a dead-route defect this codebase has
 * shipped twice.
 */
function mountedAplusPaths(): ReadonlySet<string> {
  return new Set(
    APLUS_ROUTES.map((r) => r.path).filter((p): p is string => typeof p === 'string'),
  );
}

describe('CoursesSubNavComponent', () => {
  let fixture: ComponentFixture<CoursesSubNavComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoursesSubNavComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(CoursesSubNavComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders the five tabs of the ruling, in order', () => {
    const ids = Array.from(
      element.querySelectorAll('.authoring-sub-nav__tab'),
    ).map((a) => a.getAttribute('data-testid'));
    expect(ids).toEqual([
      'courses-sub-nav-my-courses',
      'courses-sub-nav-catalog',
      'courses-sub-nav-study',
      'courses-sub-nav-assessments',
      'courses-sub-nav-transcript',
    ]);
  });

  it('carries NO Dashboard tab', () => {
    // `/a/dashboard` survives as a route (ADR-240 D6) but is not part of this
    // group and is reached from Home. The strip this replaced had it first.
    expect(COURSES_SUB_NAV_TABS.some((t) => t.route === '/a/dashboard')).toBe(false);
    const hrefs = Array.from(element.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).not.toContain('/a/dashboard');
  });

  it('points every tab at a route APLUS_ROUTES actually mounts', () => {
    const mounted = mountedAplusPaths();
    for (const tab of COURSES_SUB_NAV_TABS) {
      const path = tab.route.replace(/^\/a\//, '');
      expect(
        mounted.has(path),
        `${tab.labelKey} points at /a/${path}, which APLUS_ROUTES does not mount`,
      ).toBe(true);
    }
  });

  it('inherits every destination the retired Learn strip carried, except Dashboard', () => {
    // The retirement's safety property, stated directly. These five are the
    // Learn strip's six tabs minus `/a/dashboard`; if a future edit drops one,
    // that destination loses its only shared door.
    expect(COURSES_SUB_NAV_TABS.map((t) => t.route)).toEqual([
      '/a/courses',
      '/a/catalog',
      '/a/study',
      '/a/me/assessments',
      '/a/me/transcript',
    ]);
  });

  it('renders anchors, so every tab is a real navigation and not a mode switch', () => {
    const anchors = element.querySelectorAll('a.authoring-sub-nav__tab');
    expect(anchors.length).toBe(COURSES_SUB_NAV_TABS.length);
    for (const a of Array.from(anchors)) {
      expect(a.getAttribute('href')).toBeTruthy();
    }
  });

  it('gives the strip an accessible name and every tab a label and an icon', () => {
    const nav = element.querySelector('[data-testid="courses-sub-nav"]');
    expect(nav?.tagName.toLowerCase()).toBe('nav');
    // The translate pipe passes the key through in tests.
    expect(nav?.getAttribute('aria-label')).toBe('aplus.courses_sub_nav.aria_label');
    for (const tab of COURSES_SUB_NAV_TABS) {
      const el = element.querySelector(`[data-testid="${tab.testId}"]`);
      expect(el?.textContent?.trim()).toBe(tab.labelKey);
      // Angular's `[class]` binding does not preserve the source order, so
      // this compares the SET. Asserting the string would fail on a reorder
      // that changes nothing a user or a stylesheet can see.
      const iconClasses = (el?.querySelector('i')?.getAttribute('class') ?? '').split(
        /\s+/,
      );
      expect(new Set(iconClasses)).toEqual(new Set(tab.icon.split(/\s+/)));
    }
  });

  it('gives every tab a distinct route, label key and testid', () => {
    expect(new Set(COURSES_SUB_NAV_TABS.map((t) => t.route)).size).toBe(
      COURSES_SUB_NAV_TABS.length,
    );
    expect(new Set(COURSES_SUB_NAV_TABS.map((t) => t.labelKey)).size).toBe(
      COURSES_SUB_NAV_TABS.length,
    );
    expect(new Set(COURSES_SUB_NAV_TABS.map((t) => t.testId)).size).toBe(
      COURSES_SUB_NAV_TABS.length,
    );
  });
});

/**
 * Active-state matching is NON-exact on every tab, and that is the whole point
 * of these two: a learner reading a course, or browsing collections, is still
 * inside that tab. The strip this replaced used exact matching on two tabs and
 * lit nothing on exactly those pages.
 */
describe('CoursesSubNavComponent - active tab from the URL', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'a/courses', component: CoursesSubNavComponent },
          { path: 'a/courses/:courseId/learn', component: CoursesSubNavComponent },
          { path: 'a/study', component: CoursesSubNavComponent },
          { path: 'a/study/collections', component: CoursesSubNavComponent },
          { path: 'a/catalog', component: CoursesSubNavComponent },
        ]),
      ],
    }).compileComponents();
  });

  /**
   * ONE harness per test: `RouterTestingHarness.create()` refuses a second one
   * in the same test, so the multi-URL test below navigates an existing harness
   * rather than making a new one per URL.
   */
  function activeTabsIn(harness: RouterTestingHarness): string[] {
    const el = harness.routeNativeElement as HTMLElement;
    return Array.from(el.querySelectorAll('.authoring-sub-nav__tab--active')).map(
      (a) => a.getAttribute('data-testid') ?? '',
    );
  }

  async function activeTabsAt(url: string): Promise<string[]> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    return activeTabsIn(harness);
  }

  it('lights My Courses on the tab route itself', async () => {
    expect(await activeTabsAt('/a/courses')).toEqual(['courses-sub-nav-my-courses']);
  });

  it('KEEPS My Courses lit on a course child route', async () => {
    expect(await activeTabsAt('/a/courses/c1/learn')).toEqual([
      'courses-sub-nav-my-courses',
    ]);
  });

  it('KEEPS Study lit on /a/study/collections', async () => {
    // Collections is reached from the Study sub-nav and is a Study child; it
    // kept this strip when the Learn one was retired, so the tab must light.
    expect(await activeTabsAt('/a/study/collections')).toEqual([
      'courses-sub-nav-study',
    ]);
  });

  it('lights exactly ONE tab at a time', async () => {
    const harness = await RouterTestingHarness.create();
    for (const url of ['/a/courses', '/a/catalog', '/a/study', '/a/study/collections']) {
      await harness.navigateByUrl(url);
      harness.detectChanges();
      const active = activeTabsIn(harness);
      expect(active.length, `${url} lit ${active.length} tabs`).toBe(1);
    }
  });

  it('is inert on a URL none of its tabs owns', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'a/roster', component: CoursesSubNavComponent }]),
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/a/roster');
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelectorAll('.authoring-sub-nav__tab--active').length).toBe(0);
  });
});

/** The router is unused here beyond mounting; keep the import honest. */
describe('CoursesSubNavComponent - harness sanity', () => {
  it('mounts under a router without throwing', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CoursesSubNavComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    expect(TestBed.inject(Router)).toBeTruthy();
  });
});

/**
 * The strip renders on six A+ screens, so an a11y defect here is on six
 * screens. Checked with a tab ACTIVE as well as with none, because the active
 * tab is the one carrying an extra class and, in a strip, the state most likely
 * to be signalled by colour alone.
 */
describe('CoursesSubNavComponent a11y', () => {
  async function blocking(el: Element): Promise<readonly string[]> {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(el, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
  }

  it('has 0 critical/serious violations with no tab active', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CoursesSubNavComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CoursesSubNavComponent);
    fixture.detectChanges();
    expect(await blocking(fixture.nativeElement as Element)).toEqual([]);
  });

  it('has 0 critical/serious violations with a tab active', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'a/courses', component: CoursesSubNavComponent }]),
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/a/courses');
    harness.detectChanges();
    expect(await blocking(harness.routeNativeElement as Element)).toEqual([]);
  });
});
