/**
 * StudioSubNavComponent spec — CHO-2215.
 *
 * The Studio tab strip. Replaces AuthoringSubNavComponent, whose three tabs
 * were Compose / Test sets / Courses.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioSubNavComponent } from './studio-sub-nav.component';

describe('StudioSubNavComponent', () => {
  let fixture: ComponentFixture<StudioSubNavComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [StudioSubNavComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(StudioSubNavComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders a labelled nav landmark', () => {
    const nav = element.querySelector('[data-testid="studio-sub-nav"]');
    expect(nav).not.toBeNull();
    expect(nav?.tagName).toBe('NAV');
    expect(nav?.getAttribute('aria-label')).toBeTruthy();
  });

  it.each([
    ['studio-sub-nav-atoms', '/a/studio/atoms'],
    ['studio-sub-nav-test-sets', '/a/studio/test-sets'],
    ['studio-sub-nav-question-banks', '/a/studio/question-banks'],
  ])('routes the %s tab to %s as a real anchor', (testid, href) => {
    const tab = element.querySelector<HTMLAnchorElement>(`[data-testid="${testid}"]`);
    expect(tab).not.toBeNull();
    // Navigation is an <a>, never a button (WCAG 2.1 AA + house rule).
    expect(tab?.tagName).toBe('A');
    expect(tab?.getAttribute('href')).toBe(href);
  });

  it('carries exactly three tabs', () => {
    const tabs = element.querySelectorAll('[data-testid^="studio-sub-nav-"]');
    expect(tabs.length).toBe(3);
  });

  it('exposes NO Courses tab', () => {
    // Courses left A+ entirely: chora_delivery owns the Course aggregate and
    // ADR-232 rejected teaching roles on the A+ learner surface. The tab this
    // replaces pointed at /a/courses/new, which A+ no longer routes — it fell
    // through to `courses/:courseId` and rendered course-detail for a course
    // literally named "new".
    expect(element.querySelector('[data-testid="studio-sub-nav-courses"]')).toBeNull();
    expect(element.innerHTML).not.toContain('/a/courses/new');
  });
});
