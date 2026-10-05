/**
 * The keyboard contract for every reorder surface (D1, spec b.3).
 *
 * These are the tests the cited `test-set-editor` precedent does not have, and
 * their absence there is why this directive exists: CDK ships pointer dragging
 * only, so "reuse the proven pattern" would have shipped an editor whose
 * consequential act is unreachable without a mouse.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { Component, ViewChild, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ReorderableListDirective, type ReorderEvent } from './reorderable-list.directive';

@Component({
  standalone: true,
  imports: [ReorderableListDirective],
  template: `
    <ul
      [choraReorderableList]="rows().length"
      [rowLabel]="labeller"
      [reorderDisabled]="locked()"
      (reorder)="onReorder($event)"
      #list="choraReorderable"
    >
      @for (r of rows(); track r; let i = $index) {
        <li
          [attr.data-reorder-index]="i"
          [attr.tabindex]="i === list.activeIndex() ? 0 : -1"
          [attr.data-testid]="'row-' + r"
        >
          {{ r }}
        </li>
      }
    </ul>
    <p data-testid="live" aria-live="polite">{{ list.announcement()?.key }}</p>
  `,
})
class HostComponent {
  readonly rows = signal(['alpha', 'beta', 'gamma']);
  readonly locked = signal(false);
  readonly events: ReorderEvent[] = [];
  readonly labeller = (i: number): string => this.rows()[i] ?? '';

  /** Bound from the template's #list reference in each test via ViewChild. */
  @ViewChild(ReorderableListDirective) list!: ReorderableListDirective;

  onReorder(e: ReorderEvent): void {
    this.events.push(e);
    const next = [...this.rows()];
    const [moved] = next.splice(e.from, 1);
    next.splice(e.to, 0, moved);
    this.rows.set(next);
  }
}

function setup() {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  const cmp = fixture.componentInstance;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const ul = el.querySelector('ul') as HTMLElement;
  return { fixture, cmp, el, ul };
}

function key(ul: HTMLElement, k: string, alt = false): void {
  ul.dispatchEvent(new KeyboardEvent('keydown', { key: k, altKey: alt, bubbles: true }));
}

describe('ReorderableListDirective keyboard path', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('moves FOCUS on a plain arrow without reordering', () => {
    key(s.ul, 'ArrowDown');
    s.fixture.detectChanges();
    expect(s.cmp.list.activeIndex()).toBe(1);
    // The consequential act needs a modifier: browsing must never reorder.
    expect(s.cmp.events).toHaveLength(0);
    expect(s.cmp.rows()).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('MOVES the row on Alt+Arrow', () => {
    key(s.ul, 'ArrowDown', true);
    s.fixture.detectChanges();
    expect(s.cmp.events).toEqual([{ from: 0, to: 1 }]);
    expect(s.cmp.rows()).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('keeps focus ON the moved row, not on the position it left', () => {
    key(s.ul, 'ArrowDown', true);
    s.fixture.detectChanges();
    // alpha is now at index 1 and is what the learner is carrying.
    expect(s.cmp.list.activeIndex()).toBe(1);
    expect(s.cmp.rows()[1]).toBe('alpha');
  });

  it('announces the move as an i18n KEY plus params, never English prose', () => {
    // ⚠ The announcement is the ONE thing a screen-reader user hears, so it is
    // the last place an English literal may hide. It ships as a key the host
    // translates, which is why `announcement()` is structured rather than a
    // string: a string would have had to be built somewhere, and everywhere it
    // could have been built is a place with no locale.
    key(s.ul, 'ArrowDown', true);
    s.fixture.detectChanges();
    expect(s.cmp.list.announcement()).toEqual({
      key: 'shared.reorderable_list.moved',
      params: { label: 'alpha', position: 2, count: 3 },
    });
    const live = s.el.querySelector('[data-testid="live"]')!;
    expect(live.textContent).toContain('shared.reorderable_list.moved');
  });

  it('ANNOUNCES a no-op at the end instead of failing silently', () => {
    // A key that appears to do nothing is indistinguishable from a broken one,
    // and that ambiguity is worst for exactly the user this path serves.
    key(s.ul, 'ArrowUp', true);
    s.fixture.detectChanges();
    expect(s.cmp.events).toHaveLength(0);
    expect(s.cmp.list.announcement()).toEqual({
      key: 'shared.reorderable_list.at_start',
      params: { label: 'alpha' },
    });

    s.cmp.list.focusRow(2);
    key(s.ul, 'ArrowDown', true);
    s.fixture.detectChanges();
    expect(s.cmp.list.announcement()).toEqual({
      key: 'shared.reorderable_list.at_end',
      params: { label: 'gamma' },
    });
  });

  it('Home and End jump focus; with Alt they move the row to an end', () => {
    s.cmp.list.focusRow(2);
    key(s.ul, 'Home');
    s.fixture.detectChanges();
    expect(s.cmp.list.activeIndex()).toBe(0);
    expect(s.cmp.events).toHaveLength(0);

    s.cmp.list.focusRow(0);
    key(s.ul, 'End', true);
    s.fixture.detectChanges();
    expect(s.cmp.rows()).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('blocks MOVES when disabled but still allows focus navigation', () => {
    // A published ritual stays readable and navigable; only reordering stops.
    s.cmp.locked.set(true);
    s.fixture.detectChanges();

    key(s.ul, 'ArrowDown', true);
    s.fixture.detectChanges();
    expect(s.cmp.events).toHaveLength(0);
    expect(s.cmp.list.announcement()).toEqual({
      key: 'shared.reorderable_list.locked',
      params: { label: 'alpha' },
    });

    key(s.ul, 'ArrowDown');
    s.fixture.detectChanges();
    expect(s.cmp.list.activeIndex()).toBe(1);
  });

  it('holds ONE tab stop, on the active row', () => {
    const tabbable = Array.from(s.el.querySelectorAll('li')).filter(
      (li) => li.getAttribute('tabindex') === '0',
    );
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].getAttribute('data-reorder-index')).toBe('0');
  });

  it('gives the moved row DOM focus, not just the signal', () => {
    key(s.ul, 'ArrowDown', true);
    s.fixture.detectChanges();
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.getAttribute('data-reorder-index')).toBe('1');
  });

  it('does nothing on an empty list rather than throwing', () => {
    s.cmp.rows.set([]);
    s.fixture.detectChanges();
    expect(() => key(s.ul, 'ArrowDown', true)).not.toThrow();
    expect(s.cmp.events).toHaveLength(0);
  });

  it('ignores keys it does not own', () => {
    key(s.ul, 'Enter');
    key(s.ul, 'a');
    s.fixture.detectChanges();
    expect(s.cmp.events).toHaveLength(0);
    expect(s.cmp.list.activeIndex()).toBe(0);
  });
});

/**
 * The announcement is the ONE thing this feature says out loud, so it is the
 * one string that must exist in every locale. A missing key here does not fail
 * visibly: `TranslateService.instant` humanises the last dotted segment in
 * production, so a Tamil screen-reader user would hear "Moved" in English and
 * nothing would look broken to anyone testing in English.
 */
describe('reorderable list announcements are translatable in every locale', () => {
  const I18N_DIR = ['public', 'assets', 'i18n'];
  const LOCALES = ['en', 'zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'];
  const KEYS = ['moved', 'at_start', 'at_end', 'locked'];

  /** Locate chora-web (holds public/assets/i18n/en.json). Fails loud. */
  function findWebRoot(): string {
    let dir = process.cwd();
    for (let hop = 0; hop < 6; hop++) {
      try {
        statSync(join(dir, ...I18N_DIR, 'en.json'));
        return dir;
      } catch {
        dir = dirname(dir);
      }
    }
    throw new Error(
      `reorderable-list spec: no public/assets/i18n/en.json above ${process.cwd()}`,
    );
  }

  const root = findWebRoot();

  it.each(LOCALES)('%s carries all four announcement strings', (locale) => {
    const bundle = JSON.parse(
      readFileSync(join(root, ...I18N_DIR, `${locale}.json`), 'utf8'),
    ) as Record<string, Record<string, Record<string, string>>>;
    const section = bundle['shared']?.['reorderable_list'];
    expect(section, `${locale}.json is missing shared.reorderable_list`).toBeTruthy();
    for (const k of KEYS) {
      expect(section[k], `${locale}.json missing shared.reorderable_list.${k}`)
        .toBeTruthy();
    }
  });

  it('en spells the placeholders the directive actually emits', () => {
    // A renamed placeholder is a silent failure: interpolateI18n leaves an
    // unmatched {{ token }} verbatim, so the learner hears the literal braces.
    const en = JSON.parse(
      readFileSync(join(root, ...I18N_DIR, 'en.json'), 'utf8'),
    ) as Record<string, Record<string, Record<string, string>>>;
    const s = en['shared']['reorderable_list'];
    expect(s['moved']).toContain('{{ label }}');
    expect(s['moved']).toContain('{{ position }}');
    expect(s['moved']).toContain('{{ count }}');
    expect(s['at_start']).toContain('{{ label }}');
    expect(s['at_end']).toContain('{{ label }}');
    expect(s['locked']).toContain('{{ label }}');
  });
});
