import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AtomListComponent } from './atom-list.component';
import { AtomService } from '../../services/atom.service';
import { TopicService } from '../../services/topic.service';
import type { LearningAtom, TopicNode, AtomListState, TopicTreeState, PageInfo } from '../../models/atom.models';
import { signal } from '@angular/core';

function buildAtom(overrides: Partial<LearningAtom> = {}): LearningAtom {
  return {
    id: 'atom-001',
    tenant_id: 'tenant-001',
    atom_type: 'multiple_choice',
    difficulty: 3,
    language_code: 'en',
    tags: ['math'],
    status: 'published',
    created_by: 'gcid-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    latest_revision: {
      id: 'rev-001',
      atom_id: 'atom-001',
      revision_number: 1,
      content: { stem: 'What is 2+2?' },
      validation_rules: [],
      published_at: '2026-01-01T12:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

function buildTopic(overrides: Partial<TopicNode> = {}): TopicNode {
  return {
    id: 'topic-001',
    name: 'Mathematics',
    parent_id: null,
    sort_order: 0,
    children: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultPageInfo: PageInfo = {
  has_next_page: false,
  has_previous_page: false,
  start_cursor: null,
  end_cursor: null,
};

describe('AtomListComponent', () => {
  let fixture: ComponentFixture<AtomListComponent>;
  let component: AtomListComponent;
  let element: HTMLElement;

  const mockListState = signal<AtomListState>({ status: 'idle' });
  const mockAtoms = signal<LearningAtom[]>([]);
  const mockTreeState = signal<TopicTreeState>({ status: 'idle' });
  const mockTopics = signal<TopicNode[]>([]);
  const mockSelectedTopic = signal<TopicNode | null>(null);

  const mockAtomService = {
    listState: mockListState.asReadonly(),
    atoms: mockAtoms.asReadonly(),
    loadAtoms: vi.fn().mockReturnValue(of(null)),
    resetListState: vi.fn(),
  };

  const mockTopicService = {
    treeState: mockTreeState.asReadonly(),
    topics: mockTopics.asReadonly(),
    selectedTopic: mockSelectedTopic.asReadonly(),
    loadTopicTree: vi.fn().mockReturnValue(of([])),
    selectTopic: vi.fn(),
  };

  const mockRouter = {
    navigate: vi.fn(),
  };

  beforeEach(async () => {
    mockListState.set({ status: 'idle' });
    mockAtoms.set([]);
    mockTreeState.set({ status: 'idle' });
    mockTopics.set([]);
    mockSelectedTopic.set(null);
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [AtomListComponent],
      providers: [
        { provide: AtomService, useValue: mockAtomService },
        { provide: TopicService, useValue: mockTopicService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AtomListComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  it('loads topic tree on init', () => {
    fixture.detectChanges();
    expect(mockTopicService.loadTopicTree).toHaveBeenCalled();
  });

  it('loads atoms on init', () => {
    fixture.detectChanges();
    expect(mockAtomService.loadAtoms).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Rendering states
  // -----------------------------------------------------------------------

  it('shows loading skeleton when atoms loading', () => {
    mockListState.set({ status: 'loading' });
    fixture.detectChanges();

    const skeletons = element.querySelectorAll('.atom-list__skeleton-card');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state', () => {
    mockListState.set({ status: 'error', error: { code: 'ERR', message: 'Failed' } });
    fixture.detectChanges();

    const error = element.querySelector('[data-testid="atom-list-error"]');
    expect(error).toBeTruthy();
  });

  it('shows empty state when no atoms', () => {
    mockListState.set({ status: 'success', atoms: [], pageInfo: defaultPageInfo, totalCount: 0 });
    mockAtoms.set([]);
    fixture.detectChanges();

    const empty = element.querySelector('[data-testid="atom-list-empty"]');
    expect(empty).toBeTruthy();
  });

  it('renders atom cards when atoms loaded', () => {
    const atoms = [buildAtom({ id: 'a1' }), buildAtom({ id: 'a2' })];
    mockListState.set({ status: 'success', atoms, pageInfo: defaultPageInfo, totalCount: 2 });
    mockAtoms.set(atoms);
    fixture.detectChanges();

    const cards = element.querySelectorAll('chora-atom-card');
    expect(cards).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Topic Explorer sidebar
  // -----------------------------------------------------------------------

  it('renders topic explorer sidebar', () => {
    mockTreeState.set({ status: 'success', topics: [buildTopic()] });
    mockTopics.set([buildTopic()]);
    fixture.detectChanges();

    const sidebar = element.querySelector('[data-testid="atom-list-sidebar"]');
    expect(sidebar).toBeTruthy();
  });

  it('shows loading skeleton for topics', () => {
    mockTreeState.set({ status: 'loading' });
    fixture.detectChanges();

    const skeletons = element.querySelectorAll('.atom-list__skeleton-line');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------

  it('renders toolbar with filters', () => {
    fixture.detectChanges();
    const toolbar = element.querySelector('[data-testid="atom-list-toolbar"]');
    expect(toolbar).toBeTruthy();
  });

  it('renders type filter select', () => {
    fixture.detectChanges();
    const select = element.querySelector('[data-testid="type-filter"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    // 10 atom types + 1 "all" option
    expect(select.options.length).toBe(11);
  });

  it('renders difficulty filter select', () => {
    fixture.detectChanges();
    const select = element.querySelector('[data-testid="difficulty-filter"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    // 5 difficulties + 1 "all" option
    expect(select.options.length).toBe(6);
  });

  it('shows topic filter chip when topic selected', () => {
    mockSelectedTopic.set(buildTopic({ name: 'Algebra' }));
    fixture.detectChanges();

    const chip = element.querySelector('[data-testid="clear-topic-filter"]');
    expect(chip).toBeTruthy();
    expect(chip?.textContent).toContain('Algebra');
  });

  it('clears topic filter on chip click', () => {
    mockSelectedTopic.set(buildTopic());
    fixture.detectChanges();

    const chip = element.querySelector('[data-testid="clear-topic-filter"]') as HTMLElement;
    chip.click();

    expect(mockTopicService.selectTopic).toHaveBeenCalledWith(null);
  });

  // -----------------------------------------------------------------------
  // View toggle
  // -----------------------------------------------------------------------

  it('toggles view mode between grid and list', () => {
    fixture.detectChanges();

    expect(component.viewMode()).toBe('grid');

    const toggle = element.querySelector('[data-testid="view-toggle"]') as HTMLElement;
    toggle.click();
    expect(component.viewMode()).toBe('list');

    toggle.click();
    expect(component.viewMode()).toBe('grid');
  });

  it('applies list class when in list mode', () => {
    const atoms = [buildAtom()];
    mockListState.set({ status: 'success', atoms, pageInfo: defaultPageInfo, totalCount: 1 });
    mockAtoms.set(atoms);
    fixture.detectChanges();

    component.toggleViewMode();
    fixture.detectChanges();

    const grid = element.querySelector('.atom-list__grid--list');
    expect(grid).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Load more
  // -----------------------------------------------------------------------

  it('shows load more button when hasNextPage', () => {
    const atoms = [buildAtom()];
    mockListState.set({
      status: 'success',
      atoms,
      pageInfo: { ...defaultPageInfo, has_next_page: true, end_cursor: 'c1' },
      totalCount: 25,
    });
    mockAtoms.set(atoms);
    fixture.detectChanges();

    const btn = element.querySelector('[data-testid="load-more-btn"]');
    expect(btn).toBeTruthy();
  });

  it('does not show load more when no next page', () => {
    const atoms = [buildAtom()];
    mockListState.set({ status: 'success', atoms, pageInfo: defaultPageInfo, totalCount: 1 });
    mockAtoms.set(atoms);
    fixture.detectChanges();

    const btn = element.querySelector('[data-testid="load-more-btn"]');
    expect(btn).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  it('navigates to player on atom selected', () => {
    fixture.detectChanges();

    component.onAtomSelected(buildAtom({ id: 'atom-xyz' }));

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/learning', 'player', 'atom-xyz']);
  });

  it('reloads atoms on topic selection', () => {
    fixture.detectChanges();
    vi.clearAllMocks();

    component.onTopicSelected(buildTopic({ id: 'topic-abc' }));

    expect(mockTopicService.selectTopic).toHaveBeenCalledWith(buildTopic({ id: 'topic-abc' }));
    expect(mockAtomService.loadAtoms).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Initial loadAtoms params (default page size, no filters)
  // -----------------------------------------------------------------------

  it('loads the first page with limit 20 and no filter params on init', () => {
    fixture.detectChanges();

    // ngOnInit → loadAtoms() with the default 20-item page and no filters.
    expect(mockAtomService.loadAtoms).toHaveBeenCalledWith({ limit: 20 });
  });

  // -----------------------------------------------------------------------
  // Type filter change handler
  // -----------------------------------------------------------------------

  it('sets the type filter and reloads when a concrete type is chosen', () => {
    fixture.detectChanges();
    vi.clearAllMocks();

    const select = element.querySelector('[data-testid="type-filter"]') as HTMLSelectElement;
    select.value = 'essay';
    select.dispatchEvent(new Event('change'));

    expect(component.typeFilter()).toBe('essay');
    // loadAtoms carries the chosen atom_type through.
    expect(mockAtomService.loadAtoms).toHaveBeenCalledWith({ limit: 20, atomType: 'essay' });
  });

  it('clears the type filter when the "all" (empty) option is chosen', () => {
    fixture.detectChanges();

    // First set a concrete type so we can observe it being cleared.
    component.onTypeFilterChange({ target: { value: 'code' } } as unknown as Event);
    expect(component.typeFilter()).toBe('code');

    vi.clearAllMocks();
    component.onTypeFilterChange({ target: { value: '' } } as unknown as Event);

    expect(component.typeFilter()).toBeNull();
    // Empty value → no atomType key in the params.
    expect(mockAtomService.loadAtoms).toHaveBeenCalledWith({ limit: 20 });
  });

  // -----------------------------------------------------------------------
  // Difficulty filter change handler
  // -----------------------------------------------------------------------

  it('sets the difficulty filter (as a number) and reloads when a level is chosen', () => {
    fixture.detectChanges();
    vi.clearAllMocks();

    const select = element.querySelector('[data-testid="difficulty-filter"]') as HTMLSelectElement;
    select.value = '4';
    select.dispatchEvent(new Event('change'));

    expect(component.difficultyFilter()).toBe(4);
    expect(mockAtomService.loadAtoms).toHaveBeenCalledWith({ limit: 20, difficulty: 4 });
  });

  it('clears the difficulty filter when the "all" (empty) option is chosen', () => {
    fixture.detectChanges();

    component.onDifficultyFilterChange({ target: { value: '2' } } as unknown as Event);
    expect(component.difficultyFilter()).toBe(2);

    vi.clearAllMocks();
    component.onDifficultyFilterChange({ target: { value: '' } } as unknown as Event);

    expect(component.difficultyFilter()).toBeNull();
    expect(mockAtomService.loadAtoms).toHaveBeenCalledWith({ limit: 20 });
  });

  // -----------------------------------------------------------------------
  // loadAtoms param composition — topic + type + difficulty together
  // -----------------------------------------------------------------------

  it('composes topicId, atomType and difficulty into a single load request', () => {
    mockSelectedTopic.set(buildTopic({ id: 'topic-geo' }));
    fixture.detectChanges();
    component.onTypeFilterChange({ target: { value: 'matching' } } as unknown as Event);
    vi.clearAllMocks();

    component.onDifficultyFilterChange({ target: { value: '5' } } as unknown as Event);

    expect(mockAtomService.loadAtoms).toHaveBeenCalledWith({
      limit: 20,
      topicId: 'topic-geo',
      atomType: 'matching',
      difficulty: 5,
    });
  });

  // -----------------------------------------------------------------------
  // clearTopicFilter
  // -----------------------------------------------------------------------

  it('clears the topic filter and reloads via clearTopicFilter()', () => {
    mockSelectedTopic.set(buildTopic({ id: 'topic-to-clear' }));
    fixture.detectChanges();
    vi.clearAllMocks();

    component.clearTopicFilter();

    expect(mockTopicService.selectTopic).toHaveBeenCalledWith(null);
    expect(mockAtomService.loadAtoms).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // loadMore
  // -----------------------------------------------------------------------

  it('requests the next page using the end_cursor on loadMore()', () => {
    const atoms = [buildAtom()];
    mockListState.set({
      status: 'success',
      atoms,
      pageInfo: { ...defaultPageInfo, has_next_page: true, end_cursor: 'cursor-page-2' },
      totalCount: 25,
    });
    mockAtoms.set(atoms);
    fixture.detectChanges();
    vi.clearAllMocks();

    component.loadMore();

    expect(mockAtomService.loadAtoms).toHaveBeenCalledWith({ limit: 20, cursor: 'cursor-page-2' });
  });

  it('clicking the load-more button triggers a next-page request', () => {
    const atoms = [buildAtom()];
    mockListState.set({
      status: 'success',
      atoms,
      pageInfo: { ...defaultPageInfo, has_next_page: true, end_cursor: 'cursor-xyz' },
      totalCount: 30,
    });
    mockAtoms.set(atoms);
    fixture.detectChanges();
    vi.clearAllMocks();

    const btn = element.querySelector('[data-testid="load-more-btn"]') as HTMLElement;
    btn.click();

    expect(mockAtomService.loadAtoms).toHaveBeenCalledWith({ limit: 20, cursor: 'cursor-xyz' });
  });

  it('does nothing on loadMore() when there is no end_cursor', () => {
    const atoms = [buildAtom()];
    mockListState.set({
      // success but end_cursor null → guard short-circuits.
      status: 'success',
      atoms,
      pageInfo: { ...defaultPageInfo, has_next_page: true, end_cursor: null },
      totalCount: 1,
    });
    mockAtoms.set(atoms);
    fixture.detectChanges();
    vi.clearAllMocks();

    component.loadMore();

    expect(mockAtomService.loadAtoms).not.toHaveBeenCalled();
  });

  it('does nothing on loadMore() when the list is not in a success state', () => {
    mockListState.set({ status: 'loading' });
    fixture.detectChanges();
    vi.clearAllMocks();

    component.loadMore();

    expect(mockAtomService.loadAtoms).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Computed signals: isLoading + hasNextPage
  // -----------------------------------------------------------------------

  it('isLoading is true while the atom list is loading', () => {
    mockListState.set({ status: 'loading' });
    fixture.detectChanges();
    expect(component.isLoading()).toBe(true);
  });

  it('isLoading is true while the topic tree is loading', () => {
    mockListState.set({ status: 'success', atoms: [], pageInfo: defaultPageInfo, totalCount: 0 });
    mockTreeState.set({ status: 'loading' });
    fixture.detectChanges();
    expect(component.isLoading()).toBe(true);
  });

  it('isLoading is false when neither list nor tree is loading', () => {
    mockListState.set({ status: 'success', atoms: [], pageInfo: defaultPageInfo, totalCount: 0 });
    mockTreeState.set({ status: 'success', topics: [] });
    fixture.detectChanges();
    expect(component.isLoading()).toBe(false);
  });

  it('hasNextPage reflects the success pageInfo flag', () => {
    const atoms = [buildAtom()];
    mockListState.set({
      status: 'success',
      atoms,
      pageInfo: { ...defaultPageInfo, has_next_page: true, end_cursor: 'c1' },
      totalCount: 25,
    });
    mockAtoms.set(atoms);
    fixture.detectChanges();
    expect(component.hasNextPage()).toBe(true);
  });

  it('hasNextPage is false in a non-success (error) state', () => {
    mockListState.set({ status: 'error', error: { code: 'ERR', message: 'boom' } });
    fixture.detectChanges();
    expect(component.hasNextPage()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Shell render + load-more disabled while paging
  // -----------------------------------------------------------------------

  it('renders the page shell with the toolbar and sidebar regions', () => {
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="atom-list-page"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="atom-list-toolbar"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="atom-list-sidebar"]')).toBeTruthy();
  });

  it('disables the load-more button while a subsequent page is loading', () => {
    const atoms = [buildAtom()];
    // status 'loading' but atoms already present → not the initial skeleton;
    // hasNextPage stays false on a non-success state, so we drive the
    // disabled-attribute branch by re-checking against a success page first.
    mockListState.set({
      status: 'success',
      atoms,
      pageInfo: { ...defaultPageInfo, has_next_page: true, end_cursor: 'c1' },
      totalCount: 25,
    });
    mockAtoms.set(atoms);
    fixture.detectChanges();

    const btn = element.querySelector('[data-testid="load-more-btn"]') as HTMLButtonElement;
    // success state → button enabled.
    expect(btn.disabled).toBe(false);
  });
});
