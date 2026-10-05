/**
 * TopicDensityHeatmapComponent — Visual density overlay on the topic tree.
 *
 * Route: /admin/content/topics/density
 *
 * Features:
 *   - Color-coded atom saturation per TopicNode (sparse = light, dense = dark)
 *   - Hierarchical tree layout with density indicators
 *   - Color scale legend
 *   - Loading, error, and empty states
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../../core/services/bff-client.service';

/** TopicNode with atom_count for density calculation */
interface DensityTopicNode {
  id: string;
  name: string;
  parent_id: string | null;
  atom_count: number;
  children: DensityTopicNode[];
}

type DensityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; topics: DensityTopicNode[] }
  | { status: 'error'; error: { code: string; message: string } };

/** Density tier for color mapping */
type DensityTier = 'empty' | 'sparse' | 'light' | 'moderate' | 'dense' | 'very-dense';

/** Color scale entry for the legend */
interface ColorScaleEntry {
  tier: DensityTier;
  label: string;
  minCount: number;
}

const COLOR_SCALE: ColorScaleEntry[] = [
  { tier: 'empty', label: 'admin.density.tier-empty', minCount: 0 },
  { tier: 'sparse', label: 'admin.density.tier-sparse', minCount: 1 },
  { tier: 'light', label: 'admin.density.tier-light', minCount: 5 },
  { tier: 'moderate', label: 'admin.density.tier-moderate', minCount: 15 },
  { tier: 'dense', label: 'admin.density.tier-dense', minCount: 30 },
  { tier: 'very-dense', label: 'admin.density.tier-very-dense', minCount: 50 },
];

@Component({
  selector: 'chora-topic-density-heatmap',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './topic-density-heatmap.component.html',
  styleUrl: './topic-density-heatmap.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopicDensityHeatmapComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly densityState = signal<DensityState>({ status: 'idle' });
  private readonly expandedIds = signal<Set<string>>(new Set());

  readonly topics = computed(() => {
    const state = this.densityState();
    return state.status === 'success' ? state.topics : [];
  });

  readonly maxAtomCount = computed(() => {
    return this.computeMaxCount(this.topics());
  });

  readonly colorScale = COLOR_SCALE;

  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.loadDensityData();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private loadDensityData(): void {
    this.densityState.set({ status: 'loading' });

    this.subscriptions.add(
      this.bff.get<{ data: DensityTopicNode[] }>(
        '/api/v1/admin/topics?include=atom_count',
      ).subscribe({
        next: (res) => {
          this.densityState.set({ status: 'success', topics: res.data });
        },
        error: (err: Error) => {
          this.densityState.set({
            status: 'error',
            error: { code: 'DENSITY_LOAD_FAILED', message: err.message },
          });
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Node helpers
  // ---------------------------------------------------------------------------

  isExpanded(nodeId: string): boolean {
    return this.expandedIds().has(nodeId);
  }

  toggleExpand(node: DensityTopicNode): void {
    const ids = new Set(this.expandedIds());
    if (ids.has(node.id)) {
      ids.delete(node.id);
    } else {
      ids.add(node.id);
    }
    this.expandedIds.set(ids);
  }

  getDensityTier(atomCount: number): DensityTier {
    for (let i = COLOR_SCALE.length - 1; i >= 0; i--) {
      if (atomCount >= COLOR_SCALE[i].minCount) {
        return COLOR_SCALE[i].tier;
      }
    }
    return 'empty';
  }

  /** Density percentage for bar width (0-100) */
  getDensityPercent(atomCount: number): number {
    const max = this.maxAtomCount();
    if (max === 0) return 0;
    return Math.min(100, Math.round((atomCount / max) * 100));
  }

  /** Total atom count across all descendants (recursive) */
  getTotalCount(node: DensityTopicNode): number {
    let total = node.atom_count;
    for (const child of node.children) {
      total += this.getTotalCount(child);
    }
    return total;
  }

  trackByNodeId(_index: number, node: DensityTopicNode): string {
    return node.id;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private computeMaxCount(nodes: DensityTopicNode[]): number {
    let max = 0;
    for (const node of nodes) {
      max = Math.max(max, node.atom_count);
      if (node.children.length > 0) {
        max = Math.max(max, this.computeMaxCount(node.children));
      }
    }
    return max;
  }
}
