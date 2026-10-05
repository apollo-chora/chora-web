import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TopicExplorerComponent } from './topic-explorer.component';
import type { TopicNode } from '../../models/atom.models';

function buildTopic(overrides: Partial<TopicNode> = {}): TopicNode {
  return {
    id: 'topic-001',
    name: 'Mathematics',
    parent_id: null,
    sort_order: 0,
    children: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function buildTree(): TopicNode[] {
  return [
    buildTopic({
      id: 'math',
      name: 'Mathematics',
      children: [
        buildTopic({
          id: 'algebra',
          name: 'Algebra',
          parent_id: 'math',
          children: [
            buildTopic({ id: 'linear', name: 'Linear Equations', parent_id: 'algebra' }),
          ],
        }),
        buildTopic({ id: 'geometry', name: 'Geometry', parent_id: 'math' }),
      ],
    }),
    buildTopic({ id: 'science', name: 'Science' }),
  ];
}

describe('TopicExplorerComponent', () => {
  let fixture: ComponentFixture<TopicExplorerComponent>;
  let component: TopicExplorerComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopicExplorerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TopicExplorerComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  function setTopics(topics: TopicNode[], selectedId?: string | null): void {
    fixture.componentRef.setInput('topics', topics);
    if (selectedId !== undefined) {
      fixture.componentRef.setInput('selectedTopicId', selectedId);
    }
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it('renders topic tree', () => {
    setTopics(buildTree());
    const nodes = element.querySelectorAll('[data-testid^="topic-node-"]');
    // Root level: math, science = 2 visible
    expect(nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders empty state when no topics', () => {
    setTopics([]);
    const empty = element.querySelector('[data-testid="topic-explorer-empty"]');
    expect(empty).toBeTruthy();
  });

  it('renders search input', () => {
    setTopics(buildTree());
    const input = element.querySelector('[data-testid="topic-search-input"]');
    expect(input).toBeTruthy();
  });

  it('shows tree role on list', () => {
    setTopics(buildTree());
    const tree = element.querySelector('[role="tree"]');
    expect(tree).toBeTruthy();
  });

  it('has treeitem role on nodes', () => {
    setTopics(buildTree());
    const items = element.querySelectorAll('[role="treeitem"]');
    expect(items.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Expand/Collapse
  // -----------------------------------------------------------------------

  it('shows expand button for nodes with children', () => {
    setTopics(buildTree());
    const expandBtns = element.querySelectorAll('[data-testid="topic-expand-btn"]');
    expect(expandBtns.length).toBeGreaterThan(0);
  });

  it('does not show expand button for leaf nodes', () => {
    setTopics([buildTopic({ id: 'leaf', name: 'Leaf', children: [] })]);
    const expandBtns = element.querySelectorAll('[data-testid="topic-expand-btn"]');
    expect(expandBtns).toHaveLength(0);
  });

  it('toggles expansion on expand button click', () => {
    setTopics(buildTree());

    // Initially children not visible
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();

    // Click expand on Mathematics
    const expandBtn = element.querySelector('[data-testid="topic-expand-btn"]') as HTMLElement;
    expandBtn.click();
    fixture.detectChanges();

    // Now children should be visible
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="topic-node-geometry"]')).toBeTruthy();
  });

  it('collapses on second click', () => {
    setTopics(buildTree());

    const expandBtn = element.querySelector('[data-testid="topic-expand-btn"]') as HTMLElement;
    expandBtn.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeTruthy();

    expandBtn.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------

  it('highlights selected topic', () => {
    setTopics(buildTree(), 'math');
    const selectedNode = element.querySelector('.topic-explorer__node--selected');
    expect(selectedNode).toBeTruthy();
    expect(selectedNode?.textContent).toContain('Mathematics');
  });

  it('emits topicSelected on node click', () => {
    setTopics(buildTree());

    let emitted: TopicNode | null = null;
    component.topicSelected.subscribe((t) => (emitted = t));

    const node = element.querySelector('[data-testid="topic-node-math"]') as HTMLElement;
    node.click();

    expect(emitted).toBeTruthy();
    expect(emitted!.id).toBe('math');
  });

  it('emits topicSelected on Enter key', () => {
    setTopics(buildTree());

    let emitted: TopicNode | null = null;
    component.topicSelected.subscribe((t) => (emitted = t));

    const node = element.querySelector('[data-testid="topic-node-math"]') as HTMLElement;
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(emitted!.id).toBe('math');
  });

  it('emits topicSelected on Space key', () => {
    setTopics(buildTree());

    let emitted: TopicNode | null = null;
    component.topicSelected.subscribe((t) => (emitted = t));

    const node = element.querySelector('[data-testid="topic-node-science"]') as HTMLElement;
    node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(emitted!.id).toBe('science');
  });

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------

  it('expands node on ArrowRight key', () => {
    setTopics(buildTree());

    const node = element.querySelector('[data-testid="topic-node-math"]') as HTMLElement;
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeTruthy();
  });

  it('collapses node on ArrowLeft key', () => {
    setTopics(buildTree());

    // Expand first
    const node = element.querySelector('[data-testid="topic-node-math"]') as HTMLElement;
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeTruthy();

    // Collapse
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Search / Filter
  // -----------------------------------------------------------------------

  it('filters topics by search query', () => {
    setTopics(buildTree());

    const input = element.querySelector('[data-testid="topic-search-input"]') as HTMLInputElement;
    input.value = 'science';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const nodes = element.querySelectorAll('[data-testid^="topic-node-"]');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent).toContain('Science');
  });

  it('shows empty state when search matches nothing', () => {
    setTopics(buildTree());

    const input = element.querySelector('[data-testid="topic-search-input"]') as HTMLInputElement;
    input.value = 'xyznonexistent';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const empty = element.querySelector('[data-testid="topic-explorer-empty"]');
    expect(empty).toBeTruthy();
  });

  it('shows parent when child matches search', () => {
    setTopics(buildTree());

    // Expand math so children are accessible
    const expandBtn = element.querySelector('[data-testid="topic-expand-btn"]') as HTMLElement;
    expandBtn.click();
    fixture.detectChanges();

    const input = element.querySelector('[data-testid="topic-search-input"]') as HTMLInputElement;
    input.value = 'algebra';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    // Mathematics should appear because its child Algebra matches
    expect(element.textContent).toContain('Mathematics');
  });

  // -----------------------------------------------------------------------
  // Accessibility
  // -----------------------------------------------------------------------

  it('has aria-expanded on nodes with children', () => {
    setTopics(buildTree());
    const treeItems = element.querySelectorAll('[role="treeitem"]');
    const mathItem = treeItems[0];
    expect(mathItem.getAttribute('aria-expanded')).toBe('false');
  });

  it('updates aria-expanded when expanded', () => {
    setTopics(buildTree());

    const expandBtn = element.querySelector('[data-testid="topic-expand-btn"]') as HTMLElement;
    expandBtn.click();
    fixture.detectChanges();

    const treeItems = element.querySelectorAll('[role="treeitem"]');
    const mathItem = treeItems[0];
    expect(mathItem.getAttribute('aria-expanded')).toBe('true');
  });

  it('has aria-selected on selected node', () => {
    setTopics(buildTree(), 'math');
    const treeItems = element.querySelectorAll('[role="treeitem"]');
    const mathItem = treeItems[0];
    expect(mathItem.getAttribute('aria-selected')).toBe('true');
  });

  it('expand button has accessible label', () => {
    setTopics(buildTree());
    const expandBtn = element.querySelector('[data-testid="topic-expand-btn"]');
    expect(expandBtn?.getAttribute('aria-label')).toContain('Mathematics');
  });

  // -----------------------------------------------------------------------
  // Atom count rendering
  // -----------------------------------------------------------------------

  it('renders atom_count when present', () => {
    setTopics([buildTopic({ id: 'sci', name: 'Science', atom_count: 7 })]);
    const count = element.querySelector('.topic-explorer__atom-count');
    expect(count).toBeTruthy();
    expect(count?.textContent).toContain('7');
  });

  it('renders atom_count of zero', () => {
    setTopics([buildTopic({ id: 'sci', name: 'Science', atom_count: 0 })]);
    const count = element.querySelector('.topic-explorer__atom-count');
    expect(count).toBeTruthy();
    expect(count?.textContent).toContain('0');
  });

  it('does not render atom_count when undefined', () => {
    setTopics([buildTopic({ id: 'sci', name: 'Science' })]);
    const count = element.querySelector('.topic-explorer__atom-count');
    expect(count).toBeNull();
  });

  // -----------------------------------------------------------------------
  // ngAfterViewInit — tree focusability
  // -----------------------------------------------------------------------

  it('keeps tree container focusable (tabindex present after view init)', () => {
    setTopics(buildTree());
    fixture.detectChanges();
    const tree = element.querySelector('[role="tree"]');
    expect(tree?.getAttribute('tabindex')).toBe('0');
  });

  // -----------------------------------------------------------------------
  // State query helpers
  // -----------------------------------------------------------------------

  it('isExpanded reflects toggled state', () => {
    setTopics(buildTree());
    expect(component.isExpanded('math')).toBe(false);
    component.toggleExpand({ id: 'math', children: [] } as unknown as TopicNode);
    expect(component.isExpanded('math')).toBe(true);
  });

  it('isSelected reflects selectedTopicId input', () => {
    setTopics(buildTree(), 'science');
    expect(component.isSelected('science')).toBe(true);
    expect(component.isSelected('math')).toBe(false);
  });

  it('isFocused is false before any focus', () => {
    setTopics(buildTree());
    expect(component.isFocused('math')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Tree-level keyboard navigation (onTreeKeydown)
  // -----------------------------------------------------------------------

  function fireTreeKey(key: string): void {
    const tree = element.querySelector('[role="tree"]') as HTMLElement;
    tree.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  it('ArrowDown from no focus focuses the first visible node', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown');
    expect(component.isFocused('math')).toBe(true);
    const focused = element.querySelector('.topic-explorer__node--focused');
    expect(focused?.textContent).toContain('Mathematics');
  });

  it('ArrowDown advances focus to the next visible node', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('ArrowDown'); // science
    expect(component.isFocused('science')).toBe(true);
  });

  it('ArrowDown wraps from last node back to first', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('ArrowDown'); // science (last)
    fireTreeKey('ArrowDown'); // wraps to math
    expect(component.isFocused('math')).toBe(true);
  });

  it('ArrowUp from no focus wraps to the last visible node', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowUp');
    expect(component.isFocused('science')).toBe(true);
  });

  it('ArrowUp moves focus to the previous visible node', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('ArrowDown'); // science
    fireTreeKey('ArrowUp'); // math
    expect(component.isFocused('math')).toBe(true);
  });

  it('Home focuses the first visible node', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowUp'); // science (last)
    fireTreeKey('Home');
    expect(component.isFocused('math')).toBe(true);
  });

  it('End focuses the last visible node', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('End');
    expect(component.isFocused('science')).toBe(true);
  });

  it('onTreeKeydown is a no-op when there are no visible nodes', () => {
    setTopics([]);
    // No tree element rendered (empty state), so call handler directly
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    expect(() => component.onTreeKeydown(event)).not.toThrow();
    expect(component.isFocused('math')).toBe(false);
  });

  it('ArrowRight at tree level expands a focused collapsed node', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey('ArrowRight'); // expand math
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeTruthy();
  });

  it('ArrowRight at tree level on an expanded node focuses the first child', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey('ArrowRight'); // expand math
    fireTreeKey('ArrowRight'); // focus first child (algebra)
    expect(component.isFocused('algebra')).toBe(true);
  });

  it('ArrowRight at tree level on a leaf node does nothing', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('ArrowDown'); // science (leaf)
    fireTreeKey('ArrowRight'); // no children -> no-op
    expect(component.isFocused('science')).toBe(true);
  });

  it('ArrowLeft at tree level collapses an expanded focused node', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey('ArrowRight'); // expand math
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeTruthy();
    fireTreeKey('ArrowLeft'); // collapse math
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
  });

  it('ArrowLeft at tree level on a child moves focus to its parent', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey('ArrowRight'); // expand math
    fireTreeKey('ArrowRight'); // focus algebra (child, has children but collapsed)
    expect(component.isFocused('algebra')).toBe(true);
    fireTreeKey('ArrowLeft'); // algebra is collapsed -> move to parent (math)
    expect(component.isFocused('math')).toBe(true);
  });

  it('Enter at tree level selects the focused node', () => {
    setTopics(buildTree());
    let emitted: TopicNode | null = null;
    component.topicSelected.subscribe((t) => (emitted = t));

    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey('Enter');
    expect(emitted!.id).toBe('math');
  });

  it('Space at tree level selects the focused node', () => {
    setTopics(buildTree());
    let emitted: TopicNode | null = null;
    component.topicSelected.subscribe((t) => (emitted = t));

    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey(' ');
    expect(emitted!.id).toBe('math');
  });

  it('ignores unhandled keys at tree level', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey('Tab'); // unhandled
    expect(component.isFocused('math')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Node-level keyboard delegation (onNodeKeydown)
  // -----------------------------------------------------------------------

  function fireNodeKey(testid: string, key: string): void {
    const node = element.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  it('node ArrowDown delegates to tree-level handler', () => {
    setTopics(buildTree());
    fireNodeKey('topic-node-math', 'ArrowDown');
    // The dispatched keydown bubbles: onNodeKeydown delegates (-1 -> math),
    // then the same event bubbles to the tree container's keydown listener
    // which advances again (math -> science). Characterize the double-fire.
    expect(component.isFocused('science')).toBe(true);
  });

  it('node ArrowUp delegates to tree-level handler', () => {
    setTopics(buildTree());
    fireNodeKey('topic-node-math', 'ArrowUp');
    // Double-fire (bubble): onNodeKeydown (-1 -> science), then tree
    // container handler (science -> math). Characterize final focus.
    expect(component.isFocused('math')).toBe(true);
  });

  it('node Home delegates to tree-level handler', () => {
    setTopics(buildTree());
    fireNodeKey('topic-node-science', 'Home');
    expect(component.isFocused('math')).toBe(true);
  });

  it('node End delegates to tree-level handler', () => {
    setTopics(buildTree());
    fireNodeKey('topic-node-math', 'End');
    expect(component.isFocused('science')).toBe(true);
  });

  it('node ArrowRight does not collapse an already-expanded node', () => {
    setTopics(buildTree());
    // Expand math via node ArrowRight
    fireNodeKey('topic-node-math', 'ArrowRight');
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeTruthy();
    // Second ArrowRight on the node: already expanded -> still expanded
    fireNodeKey('topic-node-math', 'ArrowRight');
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeTruthy();
  });

  it('node ArrowLeft does nothing on a collapsed node', () => {
    setTopics(buildTree());
    fireNodeKey('topic-node-math', 'ArrowLeft'); // collapsed -> no-op
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
  });

  it('node ArrowRight on a leaf node does nothing', () => {
    setTopics(buildTree());
    fireNodeKey('topic-node-science', 'ArrowRight'); // no children
    expect(element.querySelector('[data-testid="topic-node-science"]')).toBeTruthy();
  });

  it('ignores unhandled keys at node level', () => {
    setTopics(buildTree());
    fireNodeKey('topic-node-math', 'Tab');
    // No selection emitted, no expansion
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Deep tree traversal (grandchildren) + visible node collection
  // -----------------------------------------------------------------------

  it('renders grandchildren when both parent and child are expanded', () => {
    setTopics(buildTree());
    // Expand math, then algebra, via tree keys
    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey('ArrowRight'); // expand math
    fireTreeKey('ArrowRight'); // focus algebra
    fireTreeKey('ArrowRight'); // expand algebra
    expect(element.querySelector('[data-testid="topic-node-linear"]')).toBeTruthy();
    expect(element.textContent).toContain('Linear Equations');
  });

  it('ArrowDown traverses into expanded subtrees in order', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('ArrowRight'); // expand math
    fireTreeKey('ArrowDown'); // algebra (first child, now visible)
    expect(component.isFocused('algebra')).toBe(true);
    fireTreeKey('ArrowDown'); // geometry
    expect(component.isFocused('geometry')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Filter precedence: filterQuery takes precedence over searchQuery
  // -----------------------------------------------------------------------

  it('filterQuery signal takes precedence over searchQuery in filteredTopics', () => {
    setTopics(buildTree());
    component.searchQuery.set('science');
    component.filterQuery.set('mathematics');
    fixture.detectChanges();
    // filterQuery ('mathematics') wins -> only Mathematics branch survives
    const nodes = element.querySelectorAll('[data-testid^="topic-node-"]');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent).toContain('Mathematics');
  });

  it('falls back to searchQuery when filterQuery is empty', () => {
    setTopics(buildTree());
    component.searchQuery.set('science');
    component.filterQuery.set('');
    fixture.detectChanges();
    const nodes = element.querySelectorAll('[data-testid^="topic-node-"]');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent).toContain('Science');
  });

  it('onSearchInput updates both searchQuery and filterQuery signals', () => {
    setTopics(buildTree());
    const input = element.querySelector('[data-testid="topic-search-input"]') as HTMLInputElement;
    input.value = 'geo';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.searchQuery()).toBe('geo');
    expect(component.filterQuery()).toBe('geo');
  });

  it('filter is case-insensitive and trims whitespace', () => {
    setTopics(buildTree());
    component.filterQuery.set('   SCIENCE   ');
    fixture.detectChanges();
    const nodes = element.querySelectorAll('[data-testid^="topic-node-"]');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent).toContain('Science');
  });

  it('empty filter shows the full tree (no narrowing)', () => {
    setTopics(buildTree());
    component.filterQuery.set('');
    component.searchQuery.set('');
    fixture.detectChanges();
    const nodes = element.querySelectorAll('[data-testid^="topic-node-"]');
    // Root-level: math + science
    expect(nodes).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Tree-level keys with NO focus (currentId === null guard FALSE arms)
  // -----------------------------------------------------------------------

  it('ArrowRight at tree level with no focus is a no-op (currentId null)', () => {
    setTopics(buildTree());
    // No ArrowDown first -> focusedNodeId stays null -> `if (currentId)` is false
    fireTreeKey('ArrowRight');
    // Nothing expanded, no focus set
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
    expect(component.isFocused('math')).toBe(false);
  });

  it('ArrowLeft at tree level with no focus is a no-op (currentId null)', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowLeft');
    expect(component.isFocused('math')).toBe(false);
    expect(component.isFocused('science')).toBe(false);
  });

  it('Enter at tree level with no focus emits nothing (currentId null)', () => {
    setTopics(buildTree());
    let emitted: TopicNode | null = null;
    component.topicSelected.subscribe((t) => (emitted = t));
    fireTreeKey('Enter');
    expect(emitted).toBeNull();
  });

  it('Space at tree level with no focus emits nothing (currentId null)', () => {
    setTopics(buildTree());
    let emitted: TopicNode | null = null;
    component.topicSelected.subscribe((t) => (emitted = t));
    fireTreeKey(' ');
    expect(emitted).toBeNull();
  });

  // -----------------------------------------------------------------------
  // findParentId returns null (root-level collapsed node ArrowLeft)
  // -----------------------------------------------------------------------

  it('ArrowLeft on a focused, collapsed root node with no parent is a no-op', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // focus math (collapsed, has children)
    expect(component.isFocused('math')).toBe(true);
    // math is NOT expanded -> falls to else -> findParentId(math) === null -> if(parentId) false
    fireTreeKey('ArrowLeft');
    // Focus unchanged, nothing expanded/collapsed
    expect(component.isFocused('math')).toBe(true);
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
  });

  it('ArrowLeft on a focused leaf root node with no parent is a no-op', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('ArrowDown'); // science (root leaf, no children, no parent)
    expect(component.isFocused('science')).toBe(true);
    fireTreeKey('ArrowLeft'); // findParentId(science) === null
    expect(component.isFocused('science')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // findNode returns null: focused id no longer in filteredTopics
  // (node === null guard FALSE arms on ArrowRight / ArrowLeft / Enter)
  // -----------------------------------------------------------------------

  it('ArrowRight is a no-op when the focused node is filtered out (node null)', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // focus math
    fireTreeKey('ArrowDown'); // focus science
    expect(component.isFocused('science')).toBe(true);
    // Filter away "science" so findNode(filteredTopics, 'science') returns null
    component.filterQuery.set('mathematics');
    fixture.detectChanges();
    fireTreeKey('ArrowRight'); // currentId='science' present, but findNode -> null
    // No expansion of math, focus state untouched by the node-null arm
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
  });

  it('ArrowLeft is a no-op when the focused node is filtered out (node null)', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('ArrowDown'); // science
    component.filterQuery.set('mathematics'); // removes science
    fixture.detectChanges();
    // node null -> else branch -> findParentId(filteredTopics, 'science') also null
    fireTreeKey('ArrowLeft');
    // Math still collapsed, no crash
    expect(element.querySelector('[data-testid="topic-node-algebra"]')).toBeNull();
  });

  it('Enter emits nothing when the focused node is filtered out (node null)', () => {
    setTopics(buildTree());
    fireTreeKey('ArrowDown'); // math
    fireTreeKey('ArrowDown'); // science
    component.filterQuery.set('mathematics'); // removes science
    fixture.detectChanges();
    let emitted: TopicNode | null = null;
    component.topicSelected.subscribe((t) => (emitted = t));
    fireTreeKey('Enter'); // findNode -> null -> if(node) false -> no emit
    expect(emitted).toBeNull();
  });

  // -----------------------------------------------------------------------
  // ngAfterViewInit when no tree element is rendered (treeEl falsy arm)
  // -----------------------------------------------------------------------

  it('ngAfterViewInit does not throw when the tree is absent (empty state)', () => {
    // Empty topics -> empty-state branch -> no [role="tree"] in DOM
    setTopics([]);
    expect(element.querySelector('[role="tree"]')).toBeNull();
    // ngAfterViewInit already ran via detectChanges with treeEl === null
    expect(() => component.ngAfterViewInit()).not.toThrow();
  });

  // -----------------------------------------------------------------------
  // Expand/collapse on already-expanded vs collapsed (toggleExpand both arms)
  // -----------------------------------------------------------------------

  it('toggleExpand removes an already-expanded id (delete arm)', () => {
    const node = { id: 'math', children: [] } as unknown as TopicNode;
    component.toggleExpand(node); // add
    expect(component.isExpanded('math')).toBe(true);
    component.toggleExpand(node); // delete arm
    expect(component.isExpanded('math')).toBe(false);
  });
});
