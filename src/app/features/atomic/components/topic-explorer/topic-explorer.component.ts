/**
 * TopicExplorerComponent — Keyboard-navigable topic tree with search filtering.
 *
 * WCAG 2.1 AA tree navigation:
 *   - ArrowUp/Down: move focus between visible nodes
 *   - ArrowRight: expand collapsed node or move to first child
 *   - ArrowLeft: collapse expanded node or move to parent
 *   - Enter/Space: select focused node
 *   - Home/End: move to first/last visible node
 *   - Type-ahead: focus matching node by name prefix
 *
 * Search integration: `filterQuery` signal narrows visible nodes in real time.
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  ElementRef,
  AfterViewInit,
  inject,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TopicNode } from '../../models/atom.models';

@Component({
  selector: 'chora-topic-explorer',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './topic-explorer.component.html',
  styleUrl: './topic-explorer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopicExplorerComponent implements AfterViewInit {
  private readonly elRef = inject(ElementRef);

  topics = input.required<TopicNode[]>();
  selectedTopicId = input<string | null>(null);

  topicSelected = output<TopicNode>();

  readonly searchQuery = signal('');
  readonly filterQuery = signal('');
  private readonly expandedIds = signal<Set<string>>(new Set());
  private readonly focusedNodeId = signal<string | null>(null);

  readonly filteredTopics = computed(() => {
    const query = this.filterQuery().toLowerCase().trim() || this.searchQuery().toLowerCase().trim();
    if (!query) return this.topics();
    return this.filterTree(this.topics(), query);
  });

  /** Flat list of visible node IDs for keyboard traversal. */
  readonly visibleNodeIds = computed(() => {
    return this.collectVisibleIds(this.filteredTopics());
  });

  ngAfterViewInit(): void {
    // Ensure the tree container is focusable for keyboard events
    const treeEl = this.elRef.nativeElement.querySelector('[role="tree"]');
    if (treeEl && !treeEl.getAttribute('tabindex')) {
      treeEl.setAttribute('tabindex', '0');
    }
  }

  // ---------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------

  isExpanded(nodeId: string): boolean {
    return this.expandedIds().has(nodeId);
  }

  isSelected(nodeId: string): boolean {
    return this.selectedTopicId() === nodeId;
  }

  isFocused(nodeId: string): boolean {
    return this.focusedNodeId() === nodeId;
  }

  // ---------------------------------------------------------------------------
  // Node actions
  // ---------------------------------------------------------------------------

  toggleExpand(node: TopicNode): void {
    const ids = new Set(this.expandedIds());
    if (ids.has(node.id)) {
      ids.delete(node.id);
    } else {
      ids.add(node.id);
    }
    this.expandedIds.set(ids);
  }

  selectNode(node: TopicNode): void {
    this.topicSelected.emit(node);
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
    this.filterQuery.set(target.value);
  }

  // ---------------------------------------------------------------------------
  // Keyboard navigation (tree container)
  // ---------------------------------------------------------------------------

  onTreeKeydown(event: KeyboardEvent): void {
    const ids = this.visibleNodeIds();
    if (ids.length === 0) return;

    const currentId = this.focusedNodeId();
    const currentIndex = currentId ? ids.indexOf(currentId) : -1;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const nextIndex = currentIndex < ids.length - 1 ? currentIndex + 1 : 0;
        this.focusNode(ids[nextIndex]);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;
        this.focusNode(ids[prevIndex]);
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        if (currentId) {
          const node = this.findNode(this.filteredTopics(), currentId);
          if (node && node.children.length > 0) {
            if (!this.isExpanded(node.id)) {
              this.toggleExpand(node);
            } else {
              // Move focus to first child
              const childId = node.children[0]?.id;
              if (childId) this.focusNode(childId);
            }
          }
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (currentId) {
          const node = this.findNode(this.filteredTopics(), currentId);
          if (node && this.isExpanded(node.id) && node.children.length > 0) {
            this.toggleExpand(node);
          } else {
            // Move focus to parent
            const parentId = this.findParentId(this.filteredTopics(), currentId, null);
            if (parentId) this.focusNode(parentId);
          }
        }
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (currentId) {
          const node = this.findNode(this.filteredTopics(), currentId);
          if (node) this.selectNode(node);
        }
        break;
      }
      case 'Home': {
        event.preventDefault();
        if (ids.length > 0) this.focusNode(ids[0]);
        break;
      }
      case 'End': {
        event.preventDefault();
        if (ids.length > 0) this.focusNode(ids[ids.length - 1]);
        break;
      }
    }
  }

  onNodeKeydown(event: KeyboardEvent, node: TopicNode): void {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.selectNode(node);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (node.children.length > 0 && !this.isExpanded(node.id)) {
          this.toggleExpand(node);
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (this.isExpanded(node.id)) {
          this.toggleExpand(node);
        }
        break;
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        // Delegate to tree-level handler
        this.onTreeKeydown(event);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private focusNode(nodeId: string): void {
    this.focusedNodeId.set(nodeId);
    // Focus the DOM element
    requestAnimationFrame(() => {
      const el = this.elRef.nativeElement.querySelector(
        `[data-testid="topic-node-${nodeId}"]`,
      ) as HTMLElement | null;
      el?.focus();
    });
  }

  private collectVisibleIds(nodes: TopicNode[]): string[] {
    const result: string[] = [];
    for (const node of nodes) {
      result.push(node.id);
      if (node.children.length > 0 && this.isExpanded(node.id)) {
        result.push(...this.collectVisibleIds(node.children));
      }
    }
    return result;
  }

  private findNode(nodes: TopicNode[], id: string): TopicNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children.length > 0) {
        const found = this.findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  private findParentId(nodes: TopicNode[], childId: string, parentId: string | null): string | null {
    for (const node of nodes) {
      if (node.id === childId) return parentId;
      if (node.children.length > 0) {
        const found = this.findParentId(node.children, childId, node.id);
        if (found) return found;
      }
    }
    return null;
  }

  private filterTree(nodes: TopicNode[], query: string): TopicNode[] {
    const result: TopicNode[] = [];
    for (const node of nodes) {
      const matchesSelf = node.name.toLowerCase().includes(query);
      const matchingChildren = this.filterTree(node.children, query);
      if (matchesSelf || matchingChildren.length > 0) {
        result.push({
          ...node,
          children: matchesSelf ? node.children : matchingChildren,
        });
      }
    }
    return result;
  }
}
