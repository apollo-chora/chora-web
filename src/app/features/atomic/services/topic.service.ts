import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import { TopicNode, TopicNodeDTO, TopicTreeState } from '../models/atom.models';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class TopicService {
  private readonly bff = inject(BffClientService);

  // --- Signals for topic tree ---
  private readonly _treeState = signal<TopicTreeState>({ status: 'idle' });
  readonly treeState = this._treeState.asReadonly();
  readonly topics = computed(() => {
    const s = this._treeState();
    return s.status === 'success' ? s.topics : [];
  });

  // --- Signals for selected topic ---
  private readonly _selectedTopic = signal<TopicNode | null>(null);
  readonly selectedTopic = this._selectedTopic.asReadonly();

  // ---------------------------------------------------------------------------
  // Load full topic tree (REST — GET /api/v1/topics)
  // ---------------------------------------------------------------------------

  loadTopicTree(rootId?: string): Observable<TopicNode[]> {
    this._treeState.set({ status: 'loading' });

    const qs = rootId ? `?parent_id=${rootId}` : '';

    return this.bff.get<{ data: TopicNodeDTO[] }>(
      `/api/v1/topics${qs}`,
    ).pipe(
      map((res) => {
        const topics = res.data ?? [];
        // The wire is a FLAT list — build the nested tree client-side.
        return this.buildTree(topics);
      }),
      tap((topics) => {
        this._treeState.set({ status: 'success', topics });
      }),
      catchError((err: Error) => {
        this._treeState.set({
          status: 'error',
          error: { code: 'TOPIC_TREE_FAILED', message: err.message },
        });
        return of([]);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Load a single topic node (REST — GET /api/v1/topics/{id})
  // ---------------------------------------------------------------------------

  loadTopicNode(id: string): Observable<TopicNode | null> {
    return this.bff.get<TopicNodeDTO>(
      `/api/v1/topics/${encodeURIComponent(id)}`,
    ).pipe(
      // The single-node endpoint returns a FLAT DTO — materialise a tree node
      // with an empty children array so consumers never see `children` undefined.
      map((dto) => (dto ? ({ ...dto, children: [] } as TopicNode) : null)),
      tap((node) => {
        if (node) this._selectedTopic.set(node);
      }),
      catchError(() => of(null)),
    );
  }

  private buildTree(flat: TopicNodeDTO[]): TopicNode[] {
    const map = new Map<string, TopicNode>();
    const roots: TopicNode[] = [];

    for (const node of flat) {
      map.set(node.id, { ...node, children: [] });
    }

    for (const node of flat) {
      const mapped = map.get(node.id)!;
      if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(mapped);
      } else {
        roots.push(mapped);
      }
    }

    return roots;
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  selectTopic(topic: TopicNode | null): void {
    this._selectedTopic.set(topic);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  findTopicById(id: string, nodes?: TopicNode[]): TopicNode | null {
    const search = nodes ?? this.topics();
    for (const node of search) {
      if (node.id === id) return node;
      const found = this.findTopicById(id, node.children);
      if (found) return found;
    }
    return null;
  }

  flattenTopics(nodes?: TopicNode[]): TopicNode[] {
    const source = nodes ?? this.topics();
    const result: TopicNode[] = [];
    for (const node of source) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...this.flattenTopics(node.children));
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetTreeState(): void {
    this._treeState.set({ status: 'idle' });
  }

  resetSelection(): void {
    this._selectedTopic.set(null);
  }
}
