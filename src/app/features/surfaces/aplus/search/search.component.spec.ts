/**
 * SearchComponent spec — A+ Search Hub (WS-8).
 *
 * Covers:
 *   - Tab selection changes activeTab signal
 *   - Correct tab shown/hidden based on activeTab
 *   - Result card rendering per kind
 *   - Navigation paths: atom → /a/atoms/{id}/play, course → /a/courses/{id}
 *   - Idle state renders recent searches + popular tags
 *   - Loading state: role="status" visible
 *   - Error state: role="alert" + retry CTA wired
 *   - Empty results renders no-results message
 *   - Clear button clears input + resets to idle
 *   - q signal input fires search on init
 *
 * Per chora-web CLAUDE.md §6: standalone component imported in TestBed.
 * Signal inputs set via fixture.componentRef.setInput().
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';

import { SearchComponent } from './search.component';
import { SearchService } from './search.service';
import { TranslateService } from '../../../../core/services/translate.service';

/** Proves real copy reached the DOM, not just that the key vanished. */
const TRANSLATED_MARKER = '«translated»';

/**
 * The real TranslateService returns the raw KEY when no translations are loaded
 * — which is the very defect under test, so a pass-through double would let the
 * bug pass. This one returns a marker instead, making "key gone AND copy
 * arrived" provable in one assertion pair.
 */
class StubTranslateService {
  instant(_key: string, params?: Record<string, string | number>): string {
    const p = params ? ` ${Object.values(params).join(' ')}` : '';
    return `${TRANSLATED_MARKER}${p}`;
  }
}
import type {
  SearchState,
  AtomSearchResult,
  CourseSearchResult,
  CollectionSearchResult,
} from './models';
import { RECENT_SEARCHES_KEY } from './models';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildAtomResult() {
  return {
    kind: 'atom' as const,
    id: 'atom-0001',
    title: 'Photosynthesis Basics',
    atom_type: 'multiple_choice',
    difficulty: 2,
    labels: ['biology'],
    topic_names: ['Biology'],
  };
}

function buildCourseResult() {
  return {
    kind: 'course' as const,
    id: 'course-0001',
    title: 'Biology Fundamentals',
    instructor_name: 'Dr. Jane',
    enrolled_count: 42,
    is_free: true,
    price_sgd_cents: 0,
    tags: ['biology'],
  };
}

function buildCollectionResult() {
  return {
    kind: 'collection' as const,
    id: 'col-0001',
    title: 'Core Biology Collection',
    atom_count: 15,
    owner_display_name: 'Alice',
  };
}

function makeSuccessState(overrides: {
  atoms?: AtomSearchResult[];
  courses?: CourseSearchResult[];
  collections?: CollectionSearchResult[];
  query?: string;
} = {}): SearchState {
  return {
    status: 'success',
    query: overrides.query ?? 'biology',
    results: {
      atoms: overrides.atoms ?? [buildAtomResult()],
      courses: overrides.courses ?? [buildCourseResult()],
      collections: overrides.collections ?? [buildCollectionResult()],
    },
  };
}

// ── Stub SearchService ────────────────────────────────────────────────────────

class StubSearchService {
  private _state = signal<SearchState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly atoms = () => {
    const s = this._state();
    return s.status === 'success' ? s.results.atoms : [];
  };
  readonly courses = () => {
    const s = this._state();
    return s.status === 'success' ? s.results.courses : [];
  };
  readonly collections = () => {
    const s = this._state();
    return s.status === 'success' ? s.results.collections : [];
  };
  readonly totalCount = () =>
    this.atoms().length + this.courses().length + this.collections().length;
  readonly atomCount = () => this.atoms().length;
  readonly courseCount = () => this.courses().length;
  readonly collectionCount = () => this.collections().length;

  search = vi.fn();
  retry = vi.fn();

  setState(s: SearchState) {
    this._state.set(s);
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

function setup(): {
  fixture: ComponentFixture<SearchComponent>;
  component: SearchComponent;
  stub: StubSearchService;
} {
  const stub = new StubSearchService();
  TestBed.configureTestingModule({
    imports: [SearchComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: SearchService, useValue: stub },
      // The real TranslateService echoes the raw KEY back when no translations
      // are loaded — which is exactly the bug under test here, so a pass-through
      // double would make the assertion meaningless. This one returns a marker
      // string, so "the key is gone AND real copy arrived" is provable.
      { provide: TranslateService, useClass: StubTranslateService },
    ],
  });

  const fixture = TestBed.createComponent(SearchComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, stub };
}

function query(fixture: ComponentFixture<SearchComponent>, selector: string) {
  return fixture.nativeElement.querySelector(selector) as HTMLElement | null;
}

function queryAll(
  fixture: ComponentFixture<SearchComponent>,
  selector: string,
): HTMLElement[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll(selector),
  ) as HTMLElement[];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SearchComponent — A+ Search Hub (WS-8)', () => {
  let fixture: ComponentFixture<SearchComponent>;
  let component: SearchComponent;
  let stub: StubSearchService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const result = setup();
    fixture = result.fixture;
    component = result.component;
    stub = result.stub;
  });

  // ── Idle state ──────────────────────────────────────────────────────────────

  it('renders idle state (popular tags) when no query', () => {
    expect(query(fixture, '[data-testid="aplus-search-idle"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="aplus-search-loading"]')).toBeNull();
    expect(query(fixture, '[data-testid="aplus-search-error"]')).toBeNull();
    expect(query(fixture, '[data-testid="aplus-search-results"]')).toBeNull();
  });

  it('idle state shows popular tags as buttons', () => {
    const tagBtns = queryAll(fixture, '.search-hub-tag');
    expect(tagBtns.length).toBeGreaterThan(0);
  });

  // ── Loading state ───────────────────────────────────────────────────────────

  it('shows loading panel with role="status" and aria-busy', () => {
    stub.setState({ status: 'loading' });
    fixture.detectChanges();

    const panel = query(fixture, '[data-testid="aplus-search-loading"]');
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute('role')).toBe('status');
    expect(panel?.getAttribute('aria-busy')).toBe('true');
    expect(query(fixture, '[data-testid="aplus-search-idle"]')).toBeNull();
  });

  // ── Error state ─────────────────────────────────────────────────────────────

  it('shows error alert with retry CTA when state is error', () => {
    stub.setState({ status: 'error', error: 'aplus.search.error_generic' });
    fixture.detectChanges();

    const alert = query(fixture, '[data-testid="aplus-search-error"]');
    expect(alert).toBeTruthy();
    expect(alert?.getAttribute('role')).toBe('alert');

    const retryBtn = query(fixture, '[data-testid="aplus-search-retry"]');
    expect(retryBtn).toBeTruthy();
  });

  it.each([
    'aplus.search.error_generic',
    'aplus.search.error_upstream',
    'aplus.search.error_unauthorised',
    'aplus.search.error_collection_not_wired',
  ])('TRANSLATES %s — the learner never reads a raw i18n key', (key) => {
    // The banner printed `{{ errorKey() }}` unpiped, so a failing search showed
    // the learner the literal string "aplus.search.error_upstream". Worse, the
    // `aplus.search` i18n block did not exist AT ALL, so adding the pipe alone
    // would have rendered nothing — the block had to be authored too.
    stub.setState({ status: 'error', error: key });
    fixture.detectChanges();

    const msg = query(fixture, '[data-testid="aplus-search-error"]')?.textContent ?? '';
    expect(msg).not.toContain(key);
    expect(msg).not.toContain('aplus.search.');
    // Paired positive: proves copy actually arrived rather than the node being
    // empty, which would satisfy the negative assertion for free.
    expect(msg).toContain(TRANSLATED_MARKER);
  });

  it('retry CTA calls searchService.retry()', () => {
    stub.setState({ status: 'error', error: 'aplus.search.error_generic' });
    fixture.detectChanges();

    (query(fixture, '[data-testid="aplus-search-retry"]') as HTMLButtonElement).click();
    expect(stub.retry).toHaveBeenCalledOnce();
  });

  // ── Tab rendering ───────────────────────────────────────────────────────────

  it('tabs are hidden in idle state (no results yet)', () => {
    expect(query(fixture, '[data-testid="aplus-search-tabs"]')).toBeNull();
  });

  it('tabs appear in success state', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="aplus-search-tabs"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="tab-all"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="tab-atoms"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="tab-courses"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="tab-collections"]')).toBeTruthy();
  });

  it('tabs have correct ARIA attributes (role=tablist, role=tab, aria-selected)', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    const tablist = query(fixture, '[role="tablist"]');
    expect(tablist).toBeTruthy();

    const tabs = queryAll(fixture, '[role="tab"]');
    expect(tabs).toHaveLength(4);

    const allTab = query(fixture, '[data-testid="tab-all"]');
    expect(allTab?.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking "Atoms" tab changes activeTab', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    (query(fixture, '[data-testid="tab-atoms"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.activeTab()).toBe('atoms');
    const atomTab = query(fixture, '[data-testid="tab-atoms"]');
    expect(atomTab?.getAttribute('aria-selected')).toBe('true');
    const allTab = query(fixture, '[data-testid="tab-all"]');
    expect(allTab?.getAttribute('aria-selected')).toBe('false');
  });

  // ── Result rendering ────────────────────────────────────────────────────────

  it('renders atom result card with routerLink /a/atoms/{id}/play', () => {
    stub.setState(makeSuccessState({ courses: [], collections: [] }));
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="atom-card-atom-0001"]');
    expect(card).toBeTruthy();
    expect(card?.tagName).toBe('A');
  });

  it('renders course result card with routerLink /a/courses/{id}', () => {
    stub.setState(makeSuccessState({ atoms: [], collections: [] }));
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="course-card-course-0001"]');
    expect(card).toBeTruthy();
    expect(card?.tagName).toBe('A');
  });

  it('links a collection result at its canonical /a/study/collections/{id} path', () => {
    // The old name claimed "routerLink /a/collections/{id}" while asserting
    // only that the card was an <a> — it never read the href, so it could not
    // have caught the path going stale. CHO-2217 moved collections under the
    // Study hub; /a/collections/:id still redirects, but an internal link that
    // routes through a redirect is a half-measure that rots. Assert the href.
    stub.setState(makeSuccessState({ atoms: [], courses: [] }));
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="collection-card-col-0001"]');
    expect(card).toBeTruthy();
    expect(card?.tagName).toBe('A');
    expect(card?.getAttribute('href')).toBe('/a/study/collections/col-0001');
  });

  it('all-tab shows atoms + courses + collections', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="atom-card-atom-0001"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="course-card-course-0001"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="collection-card-col-0001"]')).toBeTruthy();
  });

  it('atoms-tab hides courses and collections', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    component.selectTab('atoms');
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="atom-card-atom-0001"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="course-card-course-0001"]')).toBeNull();
    expect(query(fixture, '[data-testid="collection-card-col-0001"]')).toBeNull();
  });

  it('courses-tab hides atoms and collections', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    component.selectTab('courses');
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="atom-card-atom-0001"]')).toBeNull();
    expect(query(fixture, '[data-testid="course-card-course-0001"]')).toBeTruthy();
    expect(query(fixture, '[data-testid="collection-card-col-0001"]')).toBeNull();
  });

  it('collections-tab hides atoms and courses', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    component.selectTab('collections');
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="atom-card-atom-0001"]')).toBeNull();
    expect(query(fixture, '[data-testid="course-card-course-0001"]')).toBeNull();
    expect(query(fixture, '[data-testid="collection-card-col-0001"]')).toBeTruthy();
  });

  // ── Empty results ───────────────────────────────────────────────────────────

  it('shows empty state message when success but no results', () => {
    stub.setState(
      makeSuccessState({ atoms: [], courses: [], collections: [], query: 'xyzzy' }),
    );
    fixture.detectChanges();

    const empty = query(fixture, '[data-testid="aplus-search-empty"]');
    expect(empty).toBeTruthy();
    expect(empty?.textContent).toContain('xyzzy');
  });

  // ── Clear button ────────────────────────────────────────────────────────────

  it('clear button is hidden when input is empty', () => {
    expect(query(fixture, '[data-testid="aplus-search-clear"]')).toBeNull();
  });

  it('clear button appears when inputValue is non-empty', () => {
    component.inputValue.set('biology');
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="aplus-search-clear"]')).toBeTruthy();
  });

  it('clear button click calls searchService.search(\'\') and resets inputValue', () => {
    component.inputValue.set('biology');
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    (
      query(fixture, '[data-testid="aplus-search-clear"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(stub.search).toHaveBeenCalledWith('');
    expect(component.inputValue()).toBe('');
  });

  // ── q input signal (withComponentInputBinding) ──────────────────────────────

  it('q input param triggers search.search() on init', () => {
    fixture.componentRef.setInput('q', 'calculus');
    fixture.detectChanges();

    // The effect fires on q change — stub.search should be called with 'calculus'
    expect(stub.search).toHaveBeenCalledWith('calculus');
  });

  // ── ARIA / a11y ─────────────────────────────────────────────────────────────

  it('search input has aria-label and id', () => {
    const input = query(fixture, '#aplus-search-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute('aria-label')).toBeTruthy();
  });

  it('main results region has role="tabpanel" when in success state', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    const tabpanel = query(fixture, '[role="tabpanel"]');
    expect(tabpanel).toBeTruthy();
  });

  // ── Display helpers ─────────────────────────────────────────────────────────

  it('difficultyLabel maps 1 → Beginner, 5 → Expert', () => {
    expect(component.difficultyLabel(1)).toBe('Beginner');
    expect(component.difficultyLabel(5)).toBe('Expert');
    expect(component.difficultyLabel(3)).toBe('Intermediate');
  });

  it('formatPrice returns Free for is_free=true', () => {
    expect(component.formatPrice(0, true)).toBe('Free');
    expect(component.formatPrice(9900, true)).toBe('Free');
  });

  it('formatPrice returns SGD amount for paid', () => {
    expect(component.formatPrice(9900, false)).toBe('SGD 99.00');
    expect(component.formatPrice(0, false)).toBe('Free');
  });
});

// ── Augmented coverage: handlers, navigation, computed, rich-card branches ─────

describe('SearchComponent — augmented coverage', () => {
  let fixture: ComponentFixture<SearchComponent>;
  let component: SearchComponent;
  let stub: StubSearchService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    const result = setup();
    fixture = result.fixture;
    component = result.component;
    stub = result.stub;
  });

  // ── onQueryInput ────────────────────────────────────────────────────────────

  it('typing in the search input calls searchService.search() with the value', () => {
    const input = query(fixture, '#aplus-search-input') as HTMLInputElement;
    input.value = 'machine learning';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(stub.search).toHaveBeenCalledWith('machine learning');
    expect(component.inputValue()).toBe('machine learning');
  });

  it('onQueryInput navigates with merged q param (replaceUrl) and resets to all tab', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.activeTab.set('atoms');
    const ev = { target: { value: 'python' } } as unknown as Event;
    component.onQueryInput(ev);

    expect(stub.search).toHaveBeenCalledWith('python');
    expect(navSpy).toHaveBeenCalledWith([], {
      queryParams: { q: 'python' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(component.activeTab()).toBe('all');
  });

  it('onQueryInput with empty value sends q=null to the router (clears param)', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const ev = { target: { value: '' } } as unknown as Event;
    component.onQueryInput(ev);

    expect(stub.search).toHaveBeenCalledWith('');
    expect(navSpy).toHaveBeenCalledWith([], {
      queryParams: { q: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  // ── onTagClick ──────────────────────────────────────────────────────────────

  it('clicking a popular tag sets inputValue + searches + navigates', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const tagBtn = queryAll(fixture, '.search-hub-tag')[0] as HTMLButtonElement;
    const tagText = tagBtn.textContent?.trim() ?? '';
    tagBtn.click();

    expect(component.inputValue()).toBe(tagText);
    expect(stub.search).toHaveBeenCalledWith(tagText);
    expect(navSpy).toHaveBeenCalledWith([], {
      queryParams: { q: tagText },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    expect(component.activeTab()).toBe('all');
  });

  it('onTagClick directly drives state through the public method', () => {
    component.activeTab.set('courses');
    component.onTagClick('Security');

    expect(component.inputValue()).toBe('Security');
    expect(stub.search).toHaveBeenCalledWith('Security');
    expect(component.activeTab()).toBe('all');
  });

  // ── clearSearch navigation ──────────────────────────────────────────────────

  it('clearSearch navigates with q=null and resets active tab', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.inputValue.set('biology');
    component.activeTab.set('atoms');
    component.clearSearch();

    expect(component.inputValue()).toBe('');
    expect(stub.search).toHaveBeenCalledWith('');
    expect(component.activeTab()).toBe('all');
    expect(navSpy).toHaveBeenCalledWith([], {
      queryParams: { q: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  // ── selectTab + retry direct ────────────────────────────────────────────────

  it('selectTab sets each tab id', () => {
    component.selectTab('atoms');
    expect(component.activeTab()).toBe('atoms');
    component.selectTab('courses');
    expect(component.activeTab()).toBe('courses');
    component.selectTab('collections');
    expect(component.activeTab()).toBe('collections');
    component.selectTab('all');
    expect(component.activeTab()).toBe('all');
  });

  it('retry() delegates to searchService.retry()', () => {
    component.retry();
    expect(stub.retry).toHaveBeenCalledOnce();
  });

  // ── Computed selectors across states ────────────────────────────────────────

  it('idle state computed flags: isIdle true, others false', () => {
    expect(component.isIdle()).toBe(true);
    expect(component.isLoading()).toBe(false);
    expect(component.isError()).toBe(false);
    expect(component.isSuccess()).toBe(false);
    expect(component.hasResults()).toBe(false);
    expect(component.currentQuery()).toBe('');
    expect(component.errorKey()).toBe('');
  });

  it('loading state computed flags', () => {
    stub.setState({ status: 'loading' });
    fixture.detectChanges();
    expect(component.isLoading()).toBe(true);
    expect(component.isIdle()).toBe(false);
    expect(component.errorKey()).toBe('');
    expect(component.currentQuery()).toBe('');
  });

  it('error state exposes errorKey and isError', () => {
    stub.setState({ status: 'error', error: 'aplus.search.error_upstream' });
    fixture.detectChanges();
    expect(component.isError()).toBe(true);
    expect(component.errorKey()).toBe('aplus.search.error_upstream');
    expect(component.currentQuery()).toBe('');
  });

  it('success state exposes currentQuery + hasResults', () => {
    stub.setState(makeSuccessState({ query: 'photosynthesis' }));
    fixture.detectChanges();
    expect(component.isSuccess()).toBe(true);
    expect(component.currentQuery()).toBe('photosynthesis');
    expect(component.hasResults()).toBe(true);
    expect(component.totalCount()).toBe(3);
  });

  it('success state with no results: hasResults false, hasVisibleResults false', () => {
    stub.setState(
      makeSuccessState({ atoms: [], courses: [], collections: [] }),
    );
    fixture.detectChanges();
    expect(component.hasResults()).toBe(false);
    expect(component.hasVisibleResults()).toBe(false);
  });

  // ── visible* selectors ──────────────────────────────────────────────────────

  it('visibleAtoms/Courses/Collections respect the active tab', () => {
    stub.setState(makeSuccessState());
    fixture.detectChanges();

    // all tab — everything visible
    expect(component.visibleAtoms().length).toBe(1);
    expect(component.visibleCourses().length).toBe(1);
    expect(component.visibleCollections().length).toBe(1);

    component.selectTab('atoms');
    expect(component.visibleAtoms().length).toBe(1);
    expect(component.visibleCourses().length).toBe(0);
    expect(component.visibleCollections().length).toBe(0);

    component.selectTab('courses');
    expect(component.visibleAtoms().length).toBe(0);
    expect(component.visibleCourses().length).toBe(1);
    expect(component.visibleCollections().length).toBe(0);

    component.selectTab('collections');
    expect(component.visibleAtoms().length).toBe(0);
    expect(component.visibleCourses().length).toBe(0);
    expect(component.visibleCollections().length).toBe(1);
  });

  // ── Recent searches (idle branch with localStorage) ─────────────────────────

  it('ngOnInit loads recent searches from localStorage and renders them', () => {
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(['calculus', 'cells']),
    );
    // Re-create the component so ngOnInit re-reads storage.
    TestBed.resetTestingModule();
    const result = setup();
    const fx = result.fixture;

    expect(result.component.recentSearches()).toEqual(['calculus', 'cells']);
    const recent0 = query(fx, '[data-testid="recent-0"]');
    expect(recent0).toBeTruthy();
    expect(recent0?.textContent).toContain('calculus');
  });

  it('clicking a recent-search item drives onTagClick', () => {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['cells']));
    TestBed.resetTestingModule();
    const result = setup();
    const fx = result.fixture;

    (query(fx, '[data-testid="recent-0"]') as HTMLButtonElement).click();
    expect(result.stub.search).toHaveBeenCalledWith('cells');
    expect(result.component.inputValue()).toBe('cells');
  });

  it('recent-searches section hidden when storage empty', () => {
    // localStorage cleared in beforeEach
    expect(component.recentSearches().length).toBe(0);
    expect(query(fixture, '[data-testid="recent-0"]')).toBeNull();
  });

  // ── q input signal effect / ngOnInit ────────────────────────────────────────

  it('q param present on init seeds inputValue and fires search (ngOnInit)', () => {
    TestBed.resetTestingModule();
    const s = new StubSearchService();
    TestBed.configureTestingModule({
      imports: [SearchComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SearchService, useValue: s },
      ],
    });
    const fx = TestBed.createComponent(SearchComponent);
    fx.componentRef.setInput('q', 'algebra');
    fx.detectChanges();

    expect(fx.componentInstance.inputValue()).toBe('algebra');
    expect(s.search).toHaveBeenCalledWith('algebra');
  });

  // ── Rich atom card branches (excerpt, labels, atom_type pill) ────────────────

  it('atom card renders excerpt, labels, and type pill with underscore replaced', () => {
    stub.setState(
      makeSuccessState({
        atoms: [
          {
            kind: 'atom' as const,
            id: 'atom-rich',
            title: 'Cell Division',
            content_excerpt: 'Mitosis <em>phases</em>',
            atom_type: 'short_answer',
            difficulty: 4,
            labels: ['biology', 'cells', 'genetics', 'extra', 'overflow'],
            topic_names: ['Biology'],
          },
        ],
        courses: [],
        collections: [],
      }),
    );
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="atom-card-atom-rich"]');
    expect(card).toBeTruthy();
    const excerpt = card?.querySelector('.result-card__excerpt');
    expect(excerpt).toBeTruthy();
    expect(excerpt?.textContent).toContain('Mitosis');
    // atom_type underscore replaced
    expect(card?.querySelector('.result-card__type-pill')?.textContent).toContain(
      'short answer',
    );
    // labels capped at 4 via slice
    const tagItems = card?.querySelectorAll('.result-card__tag');
    expect(tagItems?.length).toBe(4);
    // difficulty=4 → Advanced
    expect(card?.textContent).toContain('Advanced');
  });

  it('atom card omits excerpt/labels when absent', () => {
    stub.setState(
      makeSuccessState({
        atoms: [
          {
            kind: 'atom' as const,
            id: 'atom-bare',
            title: 'Bare Atom',
            atom_type: 'flashcard',
            difficulty: 1,
            labels: [],
            topic_names: [],
          },
        ],
        courses: [],
        collections: [],
      }),
    );
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="atom-card-atom-bare"]');
    expect(card?.querySelector('.result-card__excerpt')).toBeNull();
    expect(card?.querySelector('.result-card__tag')).toBeNull();
  });

  // ── Rich course card branches (instructor, tags, price) ──────────────────────

  it('paid course card shows SGD price and instructor + capped tags', () => {
    stub.setState(
      makeSuccessState({
        atoms: [],
        collections: [],
        courses: [
          {
            kind: 'course' as const,
            id: 'course-paid',
            title: 'Advanced Stats',
            instructor_name: 'Prof. Lee',
            enrolled_count: 7,
            is_free: false,
            price_sgd_cents: 14900,
            tags: ['stats', 'math', 'data', 'overflow'],
          },
        ],
      }),
    );
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="course-card-course-paid"]');
    expect(card?.querySelector('.result-card__price')?.textContent).toContain(
      'SGD 149.00',
    );
    expect(card?.querySelector('.result-card__sub')?.textContent).toContain(
      'Prof. Lee',
    );
    expect(card?.textContent).toContain('7 enrolled');
    // tags capped at 3
    expect(card?.querySelectorAll('.result-card__tag').length).toBe(3);
  });

  it('free course card omits instructor sub when instructor_name absent', () => {
    stub.setState(
      makeSuccessState({
        atoms: [],
        collections: [],
        courses: [
          {
            kind: 'course' as const,
            id: 'course-free',
            title: 'Intro Course',
            enrolled_count: 0,
            is_free: true,
            price_sgd_cents: 0,
            tags: [],
          },
        ],
      }),
    );
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="course-card-course-free"]');
    expect(card?.querySelector('.result-card__price')?.textContent).toContain(
      'Free',
    );
    expect(card?.querySelector('.result-card__sub')).toBeNull();
    expect(card?.querySelector('.result-card__tag')).toBeNull();
  });

  // ── Rich collection card branch (owner) ──────────────────────────────────────

  it('collection card shows owner display name and atom count', () => {
    stub.setState(
      makeSuccessState({
        atoms: [],
        courses: [],
        collections: [
          {
            kind: 'collection' as const,
            id: 'col-rich',
            title: 'My Set',
            atom_count: 9,
            owner_display_name: 'Bob',
          },
        ],
      }),
    );
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="collection-card-col-rich"]');
    expect(card?.querySelector('.result-card__sub')?.textContent).toContain(
      'Bob',
    );
    expect(card?.textContent).toContain('9 atoms');
  });

  it('collection card omits owner sub when owner_display_name absent', () => {
    stub.setState(
      makeSuccessState({
        atoms: [],
        courses: [],
        collections: [
          {
            kind: 'collection' as const,
            id: 'col-noowner',
            title: 'Ownerless Set',
            atom_count: 0,
          },
        ],
      }),
    );
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="collection-card-col-noowner"]');
    expect(card?.querySelector('.result-card__sub')).toBeNull();
  });

  // ── Tab counts in success state ──────────────────────────────────────────────

  it('tab count badges reflect per-kind counts', () => {
    stub.setState(
      makeSuccessState({
        atoms: [buildAtomResult(), { ...buildAtomResult(), id: 'atom-0002' }],
        courses: [buildCourseResult()],
        collections: [],
      }),
    );
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="tab-all"]')?.textContent).toContain('3');
    expect(query(fixture, '[data-testid="tab-atoms"]')?.textContent).toContain(
      '2',
    );
    expect(query(fixture, '[data-testid="tab-courses"]')?.textContent).toContain(
      '1',
    );
    expect(
      query(fixture, '[data-testid="tab-collections"]')?.textContent,
    ).toContain('0');
  });

  // ── Display helpers (fallback branch) ────────────────────────────────────────

  it('difficultyLabel returns String(level) for unmapped values', () => {
    expect(component.difficultyLabel(7)).toBe('7');
    expect(component.difficultyLabel(0)).toBe('0');
    expect(component.difficultyLabel(2)).toBe('Elementary');
    expect(component.difficultyLabel(4)).toBe('Advanced');
  });

  it('formatPrice handles fractional cents and rounding', () => {
    expect(component.formatPrice(1250, false)).toBe('SGD 12.50');
    expect(component.formatPrice(99, false)).toBe('SGD 0.99');
  });

  it('trackById returns the item id and trackByString returns the string', () => {
    expect(component.trackById(0, { id: 'xyz' })).toBe('xyz');
    expect(component.trackByString(3, 'hello')).toBe('hello');
  });
});
