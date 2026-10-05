import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';

import { GoalProgressRingComponent } from './goal-progress-ring.component';
import { TranslateService } from '../../../../../core/services/translate.service';

/**
 * GoalProgressRingComponent spec (CHO-1921, RED first).
 *
 * The ring consumes verified-progress (percent/mastered/total) and renders a
 * compact SVG arc + the integer percent in the centre, carrying a translated
 * `role="img"` aria-label. The TranslateService stub returns the REAL aria
 * template for the progress key (so we can assert interpolation) and echoes
 * every other key back.
 */
const ARIA_KEY = 'aplus.dashboard.goal.progress_ring_aria';
const ARIA_TEMPLATE =
  'Goal progress: {percent}% — {mastered} of {total} concepts mastered';

const mockTranslate = {
  instant: (key: string) => (key === ARIA_KEY ? ARIA_TEMPLATE : key),
};

function setup(
  percent: number,
  mastered: number,
  total: number,
): { fixture: ComponentFixture<GoalProgressRingComponent>; element: HTMLElement } {
  // Reset first so a single test may build several rings (clamp / dash cases).
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [GoalProgressRingComponent],
    providers: [{ provide: TranslateService, useValue: mockTranslate }],
  });
  const fixture = TestBed.createComponent(GoalProgressRingComponent);
  fixture.componentRef.setInput('percent', percent);
  fixture.componentRef.setInput('mastered', mastered);
  fixture.componentRef.setInput('total', total);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('GoalProgressRingComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  // ── Host contract (a11y addressing) ──────────────────────────────────────
  it('exposes data-testid + role="img" on the host', () => {
    const { fixture } = setup(50, 3, 6);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-testid')).toBe('goal-progress-ring');
    expect(host.getAttribute('role')).toBe('img');
  });

  // ── Centre percent text ──────────────────────────────────────────────────
  it('renders the integer percent in the centre', () => {
    const { element } = setup(50, 3, 6);
    const pct = element.querySelector('[data-testid="goal-progress-ring-percent"]');
    expect(pct?.textContent).toContain('50%');
  });

  it('rounds a fractional percent to a whole number', () => {
    const { element } = setup(49.6, 3, 6);
    const pct = element.querySelector('[data-testid="goal-progress-ring-percent"]');
    expect(pct?.textContent).toContain('50%');
    expect(pct?.textContent).not.toContain('.');
  });

  it('falls back to 0% for a non-finite percent (malformed payload)', () => {
    const { element } = setup(Number.NaN, 0, 6);
    const pct = element.querySelector('[data-testid="goal-progress-ring-percent"]');
    expect(pct?.textContent).toContain('0%');
  });

  it('clamps an out-of-range percent into 0–100', () => {
    expect(
      setup(150, 6, 6).element.querySelector(
        '[data-testid="goal-progress-ring-percent"]',
      )?.textContent,
    ).toContain('100%');
    expect(
      setup(-20, 0, 6).element.querySelector(
        '[data-testid="goal-progress-ring-percent"]',
      )?.textContent,
    ).toContain('0%');
  });

  // ── SVG dash fill (circumference normalised to 100) ──────────────────────
  it('computes the dash array for 0 / 50 / 100 percent', () => {
    expect(setup(0, 0, 6).fixture.componentInstance.dashArray()).toBe('0 100');
    expect(setup(50, 3, 6).fixture.componentInstance.dashArray()).toBe('50 100');
    expect(setup(100, 6, 6).fixture.componentInstance.dashArray()).toBe('100 100');
  });

  it('binds the computed dash array onto the progress arc circle', () => {
    const { element } = setup(50, 3, 6);
    const arc = element.querySelector('[data-testid="goal-progress-ring-arc"]');
    expect(arc?.getAttribute('stroke-dasharray')).toBe('50 100');
  });

  // ── Accessible label (not colour-alone) ──────────────────────────────────
  it('builds an aria-label including the percent, mastered and total', () => {
    const { fixture } = setup(50, 3, 6);
    const label = (fixture.nativeElement as HTMLElement).getAttribute('aria-label');
    expect(label).toBe('Goal progress: 50% — 3 of 6 concepts mastered');
  });

  it('reflects the mastered/total counts in the aria-label', () => {
    const { fixture } = setup(100, 6, 6);
    const label = (fixture.nativeElement as HTMLElement).getAttribute('aria-label');
    expect(label).toContain('6 of 6');
    expect(label).toContain('100%');
  });

  // ── The decorative SVG is hidden from AT (the host carries the label) ─────
  it('marks the inner SVG aria-hidden so AT reads only the host label', () => {
    const { element } = setup(50, 3, 6);
    const svg = element.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  // ── a11y ─────────────────────────────────────────────────────────────────
  it('has zero critical/serious WCAG violations', async () => {
    const { fixture } = setup(50, 3, 6);
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.length).toBe(0);
  });
});
