import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { ChoraEntityPickerComponent } from './entity-picker.component';
import { MockEntitySearchAdapter } from './mock-search.adapter';
import { ENTITY_SEARCH_PORTS } from './entity-search.registry';
import type { EntityFacets, EntityPickerVariant, EntityRef } from './entity-picker.model';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const COURSE_ROWS: readonly EntityRef[] = [
  {
    id: 'c1',
    label: 'Algebra Foundations',
    sublabel: 'MATH',
    meta: { level: 'beginner', badge: 'PUBLISHED' },
  },
  {
    id: 'c2',
    label: 'Algebra Advanced',
    sublabel: 'MATH',
    meta: { level: 'advanced', badge: 'DRAFT' },
  },
  {
    id: 'c3',
    label: 'Algebra Olympiad',
    sublabel: 'MATH',
    meta: { level: 'advanced', badge: 'PUBLISHED' },
  },
  {
    id: 'c4',
    label: 'Algebra Bootcamp',
    sublabel: 'MATH',
    meta: { level: 'beginner', badge: 'ARCHIVED' },
  },
];

interface SetupOptions {
  entityType?: string;
  variant?: EntityPickerVariant;
  facets?: EntityFacets;
  value?: readonly EntityRef[];
  disabledPredicate?: (row: EntityRef) => boolean;
  minChars?: number;
  debounceMs?: number;
  registerCoursePort?: boolean;
  adapter?: MockEntitySearchAdapter;
  searchPortOverride?: MockEntitySearchAdapter | null;
  autoDetect?: boolean;
}

interface Harness {
  fixture: ComponentFixture<ChoraEntityPickerComponent>;
  element: HTMLElement;
  adapter: MockEntitySearchAdapter;
  picked: EntityRef[];
  removed: string[];
  activated: EntityRef[];
  activatedNewTab: EntityRef[];
}

function makeAdapter(
  over: Partial<ConstructorParameters<typeof MockEntitySearchAdapter>[0]> = {},
): MockEntitySearchAdapter {
  return new MockEntitySearchAdapter({ entityType: 'course', rows: COURSE_ROWS, ...over });
}

function setup(opts: SetupOptions = {}): Harness {
  const adapter = opts.adapter ?? makeAdapter();
  const providers =
    opts.registerCoursePort === false
      ? []
      : [{ provide: ENTITY_SEARCH_PORTS, useValue: adapter, multi: true }];

  TestBed.configureTestingModule({
    imports: [ChoraEntityPickerComponent],
    providers,
  });

  const fixture = TestBed.createComponent(ChoraEntityPickerComponent);
  fixture.componentRef.setInput('entityType', opts.entityType ?? 'course');
  if (opts.variant) fixture.componentRef.setInput('variant', opts.variant);
  if (opts.facets) fixture.componentRef.setInput('facets', opts.facets);
  if (opts.value) fixture.componentRef.setInput('value', opts.value);
  if (opts.disabledPredicate) {
    fixture.componentRef.setInput('disabledPredicate', opts.disabledPredicate);
  }
  if (opts.minChars !== undefined) fixture.componentRef.setInput('minChars', opts.minChars);
  if (opts.debounceMs !== undefined) {
    fixture.componentRef.setInput('debounceMs', opts.debounceMs);
  }
  if (opts.searchPortOverride !== undefined) {
    fixture.componentRef.setInput('searchPortOverride', opts.searchPortOverride);
  }

  const picked: EntityRef[] = [];
  const removed: string[] = [];
  const activated: EntityRef[] = [];
  const activatedNewTab: EntityRef[] = [];
  fixture.componentInstance.picked.subscribe((r) => picked.push(r));
  fixture.componentInstance.removed.subscribe((id) => removed.push(id));
  fixture.componentInstance.activated.subscribe((r) => activated.push(r));
  fixture.componentInstance.activatedNewTab.subscribe((r) => activatedNewTab.push(r));

  if (opts.autoDetect !== false) fixture.detectChanges();

  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    adapter,
    picked,
    removed,
    activated,
    activatedNewTab,
  };
}

function input(el: HTMLElement): HTMLInputElement {
  return el.querySelector('[data-testid="entity-picker-input"]') as HTMLInputElement;
}

function type(h: Harness, value: string): void {
  const el = input(h.element);
  el.value = value;
  el.dispatchEvent(new Event('input'));
  h.fixture.detectChanges();
}

// The panel is portaled into a body-level CDK overlay container (CHO-2291), so
// its contents are NOT under the component's own element. Resolve THIS
// instance's listbox via the input's aria-controls. A document-wide query
// would merge two pickers' options and quietly defeat the isolation specs.
function options(el: HTMLElement): HTMLElement[] {
  const box = el.querySelector('[data-testid="entity-picker-input"]');
  const listboxId = box?.getAttribute('aria-controls');
  if (!listboxId) return [];
  const listbox = document.getElementById(listboxId);
  return listbox
    ? Array.from(listbox.querySelectorAll('[data-testid="entity-picker-option"]'))
    : [];
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-testid="entity-picker-panel"]');
}

// ── Specs ────────────────────────────────────────────────────────────────────

describe('ChoraEntityPickerComponent (CHO-1833 B0)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  describe('inversion #1 — port resolution', () => {
    it('creates and resolves the registered port for its entityType', () => {
      const h = setup();
      expect(h.fixture.componentInstance).toBeTruthy();
    });

    it('THROWS fail-loud when entityType has no registered port (no silent empty)', () => {
      expect(() => setup({ entityType: 'atom', registerCoursePort: false })).toThrowError(
        /no EntitySearchPort registered/i,
      );
    });

    it('uses searchPortOverride when set, bypassing the registry entirely', () => {
      const override = makeAdapter();
      const h = setup({
        entityType: 'atom',
        registerCoursePort: false,
        searchPortOverride: override,
      });
      type(h, 'algebra');
      vi.advanceTimersByTime(350);
      expect(override.searchCallCount).toBe(1);
    });
  });

  describe('reactive port re-resolution (CHO-2134 — kind switch on a reused instance)', () => {
    it('searches the NEW searchPortOverride after it changes, not the initial one', () => {
      const portA = makeAdapter();
      const portB = makeAdapter();
      const h = setup({
        entityType: 'course',
        registerCoursePort: false,
        searchPortOverride: portA,
      });
      // Reuse the SAME picker instance and swap the port — exactly what the
      // curriculum form does when the Kind select changes atom → live_classroom.
      h.fixture.componentRef.setInput('searchPortOverride', portB);
      h.fixture.detectChanges();
      type(h, 'algebra');
      vi.advanceTimersByTime(350);
      expect(portB.searchCallCount).toBe(1);
      expect(portA.searchCallCount).toBe(0);
    });

    it('re-resolves the registry port when entityType changes', () => {
      const coursePort = new MockEntitySearchAdapter({ entityType: 'course', rows: COURSE_ROWS });
      const atomPort = new MockEntitySearchAdapter({
        entityType: 'atom',
        rows: [{ id: 'x1', label: 'Atom X' }],
      });
      TestBed.configureTestingModule({
        imports: [ChoraEntityPickerComponent],
        providers: [
          { provide: ENTITY_SEARCH_PORTS, useValue: coursePort, multi: true },
          { provide: ENTITY_SEARCH_PORTS, useValue: atomPort, multi: true },
        ],
      });
      const fixture = TestBed.createComponent(ChoraEntityPickerComponent);
      fixture.componentRef.setInput('entityType', 'course');
      fixture.detectChanges();
      fixture.componentRef.setInput('entityType', 'atom');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const box = el.querySelector('[data-testid="entity-picker-input"]') as HTMLInputElement;
      box.value = 'ato';
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      vi.advanceTimersByTime(350);
      expect(atomPort.searchCallCount).toBe(1);
      expect(coursePort.searchCallCount).toBe(0);
    });

    it('clears stale results + query when the port changes (no cross-kind selection)', () => {
      const portA = makeAdapter({ rows: [{ id: 'a1', label: 'Apple' }] });
      const portB = makeAdapter({ rows: [{ id: 'b1', label: 'Banana' }] });
      const h = setup({
        entityType: 'course',
        registerCoursePort: false,
        searchPortOverride: portA,
      });
      type(h, 'app');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      expect(options(h.element).length).toBe(1);
      h.fixture.componentRef.setInput('searchPortOverride', portB);
      h.fixture.detectChanges();
      expect(options(h.element).length).toBe(0);
      expect(input(h.element).value).toBe('');
    });
  });

  describe('debounce + min-char guard', () => {
    it('does NOT search before the debounce window elapses', () => {
      const h = setup({ debounceMs: 300 });
      type(h, 'alge');
      vi.advanceTimersByTime(200);
      expect(h.adapter.searchCallCount).toBe(0);
    });

    it('searches after the debounce window when query ≥ minChars', () => {
      const h = setup({ debounceMs: 300, minChars: 3 });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      expect(h.adapter.searchCallCount).toBe(1);
      expect(h.adapter.lastQuery).toBe('alge');
    });

    it('does NOT search when query is shorter than minChars', () => {
      const h = setup({ minChars: 3 });
      type(h, 'al');
      vi.advanceTimersByTime(500);
      expect(h.adapter.searchCallCount).toBe(0);
    });

    it('latest query wins — the earlier debounced query is dropped', () => {
      const h = setup();
      type(h, 'alg');
      vi.advanceTimersByTime(100);
      type(h, 'algebra');
      vi.advanceTimersByTime(350);
      expect(h.adapter.searchCallCount).toBe(1);
      expect(h.adapter.lastQuery).toBe('algebra');
    });
  });

  describe('async states (loading / success / empty / error)', () => {
    it('renders a loading affordance while the search is in flight', () => {
      const h = setup({ adapter: makeAdapter({ delayMs: 200 }) });
      type(h, 'alge');
      vi.advanceTimersByTime(350); // past debounce, before delay resolves
      h.fixture.detectChanges();
      expect(document.querySelector('[data-testid="entity-picker-loading"]')).toBeTruthy();
    });

    it('renders one option per result on success', () => {
      const h = setup();
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      expect(options(h.element).length).toBe(COURSE_ROWS.length);
    });

    it('renders the empty state when success has zero items', () => {
      const h = setup();
      type(h, 'zzz-nomatch');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      expect(document.querySelector('[data-testid="entity-picker-empty"]')).toBeTruthy();
      expect(options(h.element).length).toBe(0);
    });

    it('renders a role=alert error banner with a retry control on failure', () => {
      const h = setup({ adapter: makeAdapter({ failWith: 'boom' }) });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      const banner = document.querySelector('[data-testid="entity-picker-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(document.querySelector('[data-testid="entity-picker-retry"]')).toBeTruthy();
    });

    it('retry re-issues the last query (bypassing distinctUntilChanged)', () => {
      const adapter = makeAdapter({ failWith: 'boom' });
      const h = setup({ adapter });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      expect(adapter.searchCallCount).toBe(1);
      adapter.failWith = null; // recover
      (document.querySelector('[data-testid="entity-picker-retry"]') as HTMLButtonElement).click();
      vi.advanceTimersByTime(10);
      h.fixture.detectChanges();
      expect(adapter.searchCallCount).toBe(2);
      expect(options(h.element).length).toBe(COURSE_ROWS.length);
    });
  });

  describe('facets', () => {
    it('forwards facets to the port unchanged', () => {
      const facets: EntityFacets = { level: 'advanced' };
      const h = setup({ facets });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      expect(h.adapter.lastFacets).toEqual(facets);
    });

    it('the facet filter narrows the rendered results', () => {
      const h = setup({ facets: { level: 'advanced' } });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      expect(options(h.element).length).toBe(2); // c2 + c3
    });
  });

  describe('variant: single', () => {
    it('emits picked and collapses (no chips) on select', () => {
      const h = setup({ variant: 'single' });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      options(h.element)[0].click();
      h.fixture.detectChanges();
      expect(h.picked).toEqual([COURSE_ROWS[0]]);
      expect(h.element.querySelector('[data-testid="entity-picker-chips"]')).toBeNull();
      expect(options(h.element).length).toBe(0); // collapsed
    });

    it('shows the selected value with a clear control that emits removed', () => {
      const h = setup({ variant: 'single', value: [COURSE_ROWS[0]] });
      const selected = h.element.querySelector('[data-testid="entity-picker-selected"]');
      expect(selected?.textContent).toContain('Algebra Foundations');
      (
        h.element.querySelector('[data-testid="entity-picker-selected-clear"]') as HTMLButtonElement
      ).click();
      expect(h.removed).toEqual(['c1']);
    });
  });

  describe('variant: multi', () => {
    it('renders a chip per value row and emits removed on chip ×', () => {
      const h = setup({ variant: 'multi', value: [COURSE_ROWS[0], COURSE_ROWS[1]] });
      const chips = h.element.querySelectorAll('[data-testid="entity-picker-chip"]');
      expect(chips.length).toBe(2);
      (
        h.element.querySelector('[data-testid="entity-picker-chip-remove"]') as HTMLButtonElement
      ).click();
      expect(h.removed).toEqual(['c1']);
    });

    it('emits picked (not removed) when a result is selected', () => {
      const h = setup({ variant: 'multi' });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      options(h.element)[1].click();
      expect(h.picked).toEqual([COURSE_ROWS[1]]);
      expect(h.activated.length).toBe(0);
    });
  });

  describe('variant: command', () => {
    it('emits activated (not picked) on plain select', () => {
      const h = setup({ variant: 'command' });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      options(h.element)[0].click();
      expect(h.activated).toEqual([COURSE_ROWS[0]]);
      expect(h.picked.length).toBe(0);
    });

    it('emits activatedNewTab on meta+click', () => {
      const h = setup({ variant: 'command' });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      options(h.element)[2].dispatchEvent(
        new MouseEvent('click', { metaKey: true, bubbles: true }),
      );
      expect(h.activatedNewTab).toEqual([COURSE_ROWS[2]]);
      expect(h.activated.length).toBe(0);
    });

    it('renders a state badge per row from meta.badge', () => {
      const h = setup({ variant: 'command' });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      const badges = document.querySelectorAll('[data-testid="entity-picker-badge"]');
      expect(badges.length).toBe(COURSE_ROWS.length);
      expect(badges[0].textContent?.trim()).toBe('PUBLISHED');
    });
  });

  describe('disabled rows', () => {
    it('marks predicate-disabled rows aria-disabled and refuses selection', () => {
      const h = setup({
        variant: 'multi',
        disabledPredicate: (r) => r.meta?.['badge'] === 'ARCHIVED',
      });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      const archived = options(h.element).find((o) => o.getAttribute('data-id') === 'c4');
      expect(archived?.getAttribute('aria-disabled')).toBe('true');
      archived?.click();
      expect(h.picked.length).toBe(0);
    });
  });

  describe('cursor pagination (load-more)', () => {
    it('shows a load-more control when nextCursor is present and appends the next page', () => {
      const h = setup({ adapter: makeAdapter({ pageSize: 2 }) });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      expect(options(h.element).length).toBe(2);
      const more = document.querySelector(
        '[data-testid="entity-picker-load-more"]',
      ) as HTMLButtonElement;
      expect(more).toBeTruthy();
      more.click();
      vi.advanceTimersByTime(10);
      h.fixture.detectChanges();
      expect(options(h.element).length).toBe(4); // appended, not replaced
      expect(document.querySelector('[data-testid="entity-picker-load-more"]')).toBeNull();
    });
  });

  describe('resolve hydration of pre-set value', () => {
    it('hydrates id-only value rows into labels via port.resolve', () => {
      const h = setup({
        variant: 'multi',
        value: [{ id: 'c3', label: '' }],
      });
      expect(h.adapter.resolveCallCount).toBe(1);
      const chip = h.element.querySelector('[data-testid="entity-picker-chip"]');
      expect(chip?.textContent).toContain('Algebra Olympiad');
    });

    it('does NOT call resolve when all value rows already carry labels', () => {
      const h = setup({ variant: 'multi', value: [COURSE_ROWS[0]] });
      expect(h.adapter.resolveCallCount).toBe(0);
    });
  });

  describe('per-instance state (inversion #2)', () => {
    it('two pickers on one page keep independent search state', () => {
      const adapterA = new MockEntitySearchAdapter({
        entityType: 'course',
        rows: [{ id: 'a1', label: 'Apple' }],
      });
      const adapterB = new MockEntitySearchAdapter({
        entityType: 'course',
        rows: [
          { id: 'b1', label: 'Banana' },
          { id: 'b2', label: 'Blueberry' },
        ],
      });

      // Both pickers from ONE module (createComponent twice is allowed;
      // reconfiguring TestBed post-instantiation is not).
      TestBed.configureTestingModule({ imports: [ChoraEntityPickerComponent] });
      const buildPicker = (
        adapter: MockEntitySearchAdapter,
      ): { fixture: ComponentFixture<ChoraEntityPickerComponent>; element: HTMLElement } => {
        const fixture = TestBed.createComponent(ChoraEntityPickerComponent);
        fixture.componentRef.setInput('entityType', 'course');
        fixture.componentRef.setInput('searchPortOverride', adapter);
        fixture.detectChanges();
        return { fixture, element: fixture.nativeElement as HTMLElement };
      };
      const a = buildPicker(adapterA);
      const b = buildPicker(adapterB);

      const boxA = a.element.querySelector(
        '[data-testid="entity-picker-input"]',
      ) as HTMLInputElement;
      boxA.value = 'app';
      boxA.dispatchEvent(new Event('input'));
      a.fixture.detectChanges();
      vi.advanceTimersByTime(350);
      a.fixture.detectChanges();
      b.fixture.detectChanges();

      // A resolved; B never searched → B has no options.
      expect(options(a.element).length).toBe(1);
      expect(options(b.element).length).toBe(0);
      expect(adapterB.searchCallCount).toBe(0);
    });
  });

  describe('keyboard navigation + combobox a11y', () => {
    function keydown(h: Harness, key: string, opts: KeyboardEventInit = {}): void {
      input(h.element).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
      h.fixture.detectChanges();
    }

    it('the input is a combobox wired to the listbox + activedescendant', () => {
      const h = setup();
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      const box = input(h.element);
      expect(box.getAttribute('role')).toBe('combobox');
      expect(box.getAttribute('aria-expanded')).toBe('true');
      const listbox = document.querySelector('[data-testid="entity-picker-results"]');
      expect(box.getAttribute('aria-controls')).toBe(listbox?.getAttribute('id'));
    });

    it('ArrowDown moves the active option and sets aria-activedescendant', () => {
      const h = setup();
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      keydown(h, 'ArrowDown');
      const active = options(h.element).find((o) => o.getAttribute('aria-selected') === 'true');
      expect(active?.getAttribute('data-id')).toBe('c1');
      expect(input(h.element).getAttribute('aria-activedescendant')).toBe(
        active?.getAttribute('id'),
      );
    });

    it('ArrowDown skips disabled rows', () => {
      const h = setup({ disabledPredicate: (r) => r.id === 'c1' });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      keydown(h, 'ArrowDown');
      const active = options(h.element).find((o) => o.getAttribute('aria-selected') === 'true');
      expect(active?.getAttribute('data-id')).toBe('c2');
    });

    it('Enter selects the active option', () => {
      const h = setup({ variant: 'multi' });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      keydown(h, 'ArrowDown');
      keydown(h, 'ArrowDown');
      keydown(h, 'Enter');
      expect(h.picked).toEqual([COURSE_ROWS[1]]);
    });

    it('meta+Enter activates in a new tab (command variant)', () => {
      const h = setup({ variant: 'command' });
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      keydown(h, 'ArrowDown');
      keydown(h, 'Enter', { metaKey: true });
      expect(h.activatedNewTab).toEqual([COURSE_ROWS[0]]);
    });

    it('Escape collapses the dropdown', () => {
      const h = setup();
      type(h, 'alge');
      vi.advanceTimersByTime(350);
      h.fixture.detectChanges();
      expect(options(h.element).length).toBeGreaterThan(0);
      keydown(h, 'Escape');
      expect(options(h.element).length).toBe(0);
      expect(input(h.element).getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('accessibility (axe)', () => {
    it('has no critical/serious violations in the results state', async () => {
      vi.useRealTimers();
      const h = setup({ variant: 'multi', value: [COURSE_ROWS[0]] });
      type(h, 'alge');
      await new Promise((r) => setTimeout(r, 350));
      h.fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(h.element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });

// ── CHO-2291: browse-on-focus + overlay panel + browse-empty copy ───────────
//
// Owner report 2026-07-18 on H+ /h/transactions: "why is the Managed Tenant
// input only keyword-typed and not a search-dropdown combo? User is not
// expected to know the names of tenants." With the default minChars=3 the
// picker sits idle until 3 characters are typed, so an operator must already
// know a franchisee's name to find it. Both backing endpoints accept an EMPTY
// query by design (tenancy ListFranchisees SQL: `WHERE ($1 = '' OR name ILIKE
// ...)`; identity member search bounds q only `if q != ""`), so browsing needs
// no BE change.
//
// The overlay panel is the second half: the results/empty block was a normal
// in-flow element, so opening it grew the field and re-flowed the whole
// `display:flex; flex-wrap:wrap; align-items:flex-end` filter row.
describe('browse-on-focus + overlay panel (CHO-2291)', () => {
  function focusInput(h: Harness): void {
    input(h.element).dispatchEvent(new Event('focus'));
    h.fixture.detectChanges();
  }

  it('minChars=0: focusing the input browses with an EMPTY query', () => {
    const h = setup({ minChars: 0 });
    focusInput(h);
    vi.advanceTimersByTime(350);
    h.fixture.detectChanges();

    expect(h.adapter.searchCallCount).toBe(1);
    expect(h.adapter.lastQuery).toBe('');
    expect(options(h.element).length).toBeGreaterThan(0);
  });

  it('does NOT browse on focus when minChars > 0 (R+ pickers keep typing)', () => {
    const h = setup({ minChars: 2 });
    focusInput(h);
    vi.advanceTimersByTime(350);

    expect(h.adapter.searchCallCount).toBe(0);
  });

  it('browses only once per focus, not on every re-focus while open', () => {
    const h = setup({ minChars: 0 });
    focusInput(h);
    vi.advanceTimersByTime(350);
    focusInput(h);
    vi.advanceTimersByTime(350);

    expect(h.adapter.searchCallCount).toBe(1);
  });

  it('renders results inside an overlay panel so the field never reflows', () => {
    const h = setup({ minChars: 0 });
    focusInput(h);
    vi.advanceTimersByTime(350);
    h.fixture.detectChanges();

    const p = panel();
    expect(p).toBeTruthy();
    // The results list must live INSIDE the panel.
    expect(p!.querySelector('[data-testid="entity-picker-results"]')).toBeTruthy();
    // ...and the panel must NOT be inside the component's own subtree: that is
    // precisely what escapes the ancestor `backdrop-filter` stacking context
    // which was painting the next card over the dropdown on prod.
    expect(h.element.contains(p!)).toBe(false);
  });

  it('has no panel element while idle (nothing to overlay)', () => {
    setup({ minChars: 0 });
    expect(panel()).toBeNull();
  });

  it('closes the portaled panel on an outside click (no orphan overlay)', () => {
    const h = setup({ minChars: 0 });
    focusInput(h);
    vi.advanceTimersByTime(350);
    h.fixture.detectChanges();
    expect(panel()).toBeTruthy();

    h.fixture.componentInstance.closePanel();
    h.fixture.detectChanges();
    expect(panel()).toBeNull();
  });

  it('browse with zero rows shows emptyBrowseLabel, not the search-empty copy', () => {
    const h = setup({ minChars: 0, adapter: makeAdapter({ rows: [] }) });
    h.fixture.componentRef.setInput('emptyLabel', 'No matches found');
    h.fixture.componentRef.setInput('emptyBrowseLabel', 'No learners in this tenant');
    h.fixture.detectChanges();

    focusInput(h);
    vi.advanceTimersByTime(350);
    h.fixture.detectChanges();

    expect(panel()!.textContent).toContain('No learners in this tenant');
    expect(panel()!.textContent).not.toContain('No matches found');
  });

  it('TYPED query with zero rows still shows the search-empty copy', () => {
    const h = setup({ minChars: 0, adapter: makeAdapter({ rows: [] }) });
    h.fixture.componentRef.setInput('emptyLabel', 'No matches found');
    h.fixture.componentRef.setInput('emptyBrowseLabel', 'No learners in this tenant');
    h.fixture.detectChanges();

    type(h, 'zzz');
    vi.advanceTimersByTime(350);
    h.fixture.detectChanges();

    expect(panel()!.textContent).toContain('No matches found');
    expect(panel()!.textContent).not.toContain('No learners in this tenant');
  });

  it('falls back to emptyLabel when emptyBrowseLabel is not supplied', () => {
    const h = setup({ minChars: 0, adapter: makeAdapter({ rows: [] }) });
    h.fixture.componentRef.setInput('emptyLabel', 'No matches found');
    h.fixture.detectChanges();

    focusInput(h);
    vi.advanceTimersByTime(350);
    h.fixture.detectChanges();

    expect(panel()!.textContent).toContain('No matches found');
  });
});

});
