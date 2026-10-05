import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { RbacService } from '../../../core/services/rbac.service';
import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { CompassBarComponent } from './compass-bar.component';
import { APLUS_COMPASS } from './compass.config';

function setup(caps: readonly string[] = []): {
  fixture: ComponentFixture<CompassBarComponent>;
  el: HTMLElement;
} {
  const held = new Set(caps);
  TestBed.configureTestingModule({
    imports: [CompassBarComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      FeatureFlagService,
      {
        provide: RbacService,
        useValue: {
          hasRole: () => false,
          hasCapability: (cap: string) => held.has(cap),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CompassBarComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function entryTestIds(el: HTMLElement): readonly string[] {
  return [...el.querySelectorAll('[data-testid^="compass-entry-"]')].map(
    (n) => n.getAttribute('data-testid') ?? '',
  );
}

describe('CompassBarComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders the five ungated entries for a learner', () => {
    const { el } = setup([]);
    expect(entryTestIds(el)).toEqual([
      'compass-entry-home',
      'compass-entry-map',
      'compass-entry-roster',
      'compass-entry-courses',
      'compass-entry-wallet',
    ]);
  });

  it('fails CLOSED: a learner without assessment:author never sees Create', () => {
    const { el } = setup([]);
    expect(el.querySelector('[data-testid="compass-entry-create"]')).toBeNull();
  });

  it('reveals Create for a session holding assessment:author', () => {
    const { el } = setup(['assessment:author']);
    expect(entryTestIds(el)).toEqual([
      'compass-entry-home',
      'compass-entry-map',
      'compass-entry-roster',
      'compass-entry-courses',
      'compass-entry-create',
      'compass-entry-wallet',
    ]);
  });

  it('keeps Create in its configured position rather than appending it', () => {
    const { el } = setup(['assessment:author']);
    const ids = entryTestIds(el);
    expect(ids.indexOf('compass-entry-create')).toBe(4);
    expect(ids[ids.length - 1]).toBe('compass-entry-wallet');
  });

  it('renders every entry as a real anchor, so the bar is keyboard reachable', () => {
    const { el } = setup(['assessment:author']);
    const entries = [...el.querySelectorAll('[data-testid^="compass-entry-"]')];
    expect(entries).toHaveLength(APLUS_COMPASS.length);
    for (const node of entries) {
      expect(node.tagName).toBe('A');
      expect(node.getAttribute('href')).toBeTruthy();
    }
  });

  it('names the bar for assistive technology', () => {
    const { el } = setup([]);
    const nav = el.querySelector('nav[data-testid="compass-bar"]');
    expect(nav).toBeTruthy();
    expect(nav?.getAttribute('aria-label')).toBeTruthy();
  });

  it('gives every entry a visible text label, not an icon alone', () => {
    const { el } = setup([]);
    for (const node of el.querySelectorAll('[data-testid^="compass-entry-"]')) {
      const label = node.querySelector('.compass-bar__label');
      expect(label).toBeTruthy();
      expect(label?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('hides the decorative icon from assistive technology', () => {
    const { el } = setup([]);
    for (const icon of el.querySelectorAll('.compass-bar__icon')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('points each entry at its configured route', () => {
    const { el } = setup(['assessment:author']);
    const hrefs = [...el.querySelectorAll('[data-testid^="compass-entry-"]')].map(
      (n) => n.getAttribute('href'),
    );
    expect(hrefs).toEqual(APLUS_COMPASS.map((i) => i.route));
  });
});

/**
 * The compass is the navigation on every A+ screen, so an a11y defect here is
 * on every A+ screen. Checked in BOTH sessions, because the author's bar has an
 * entry the learner's does not and a violation could live in exactly that one.
 */
describe('CompassBarComponent a11y', () => {
  async function blockingViolations(caps: readonly string[]): Promise<readonly string[]> {
    const { fixture } = setup(caps);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
  }

  it('has 0 axe critical/serious violations for a learner', async () => {
    expect(await blockingViolations([])).toEqual([]);
  });

  it('has 0 axe critical/serious violations for an author (Create rendered)', async () => {
    expect(await blockingViolations(['assessment:author'])).toEqual([]);
  });
});
