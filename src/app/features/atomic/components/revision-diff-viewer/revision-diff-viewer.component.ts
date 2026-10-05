/**
 * RevisionDiffViewerComponent — Side-by-side diff comparison of AtomRevisions.
 *
 * Route: /learning/revisions/:atomId
 *
 * Features:
 *   - Timeline of AtomRevisions on the left panel
 *   - Select two revisions for side-by-side diff comparison
 *   - Line-by-line diff highlighting (additions, deletions, unchanged)
 *   - Loading, error, and empty states
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  input,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type { AtomRevision } from '../../models/atom.models';

/** Async state for revisions list */
type RevisionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; revisions: AtomRevision[] }
  | { status: 'error'; error: { code: string; message: string } };

/** A single diff line */
interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  leftLineNum: number | null;
  rightLineNum: number | null;
}

@Component({
  selector: 'chora-revision-diff-viewer',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './revision-diff-viewer.component.html',
  styleUrl: './revision-diff-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevisionDiffViewerComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);

  /** Route param: atomId */
  readonly atomId = input.required<string>();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly revisionsState = signal<RevisionsState>({ status: 'idle' });
  readonly selectedLeft = signal<AtomRevision | null>(null);
  readonly selectedRight = signal<AtomRevision | null>(null);

  readonly revisions = computed(() => {
    const state = this.revisionsState();
    return state.status === 'success' ? state.revisions : [];
  });

  readonly diffLines = computed<DiffLine[]>(() => {
    const left = this.selectedLeft();
    const right = this.selectedRight();
    if (!left || !right) return [];
    return this.computeDiff(
      this.serializeContent(left),
      this.serializeContent(right),
    );
  });

  readonly canCompare = computed(() => {
    return this.selectedLeft() !== null && this.selectedRight() !== null;
  });

  readonly leftLabel = computed(() => {
    const rev = this.selectedLeft();
    return rev ? `v${rev.revision_number}` : '--';
  });

  readonly rightLabel = computed(() => {
    const rev = this.selectedRight();
    return rev ? `v${rev.revision_number}` : '--';
  });

  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.loadRevisions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private loadRevisions(): void {
    this.revisionsState.set({ status: 'loading' });

    this.subscriptions.add(
      this.bff.get<{ data: AtomRevision[] }>(
        `/api/v1/atoms/${this.atomId()}/revisions`,
      ).subscribe({
        next: (res) => {
          const sorted = [...res.data].sort(
            (a, b) => b.revision_number - a.revision_number,
          );
          this.revisionsState.set({ status: 'success', revisions: sorted });
          // Auto-select last two revisions for comparison
          if (sorted.length >= 2) {
            this.selectedRight.set(sorted[0]);
            this.selectedLeft.set(sorted[1]);
          } else if (sorted.length === 1) {
            this.selectedRight.set(sorted[0]);
          }
        },
        error: (err: Error) => {
          this.revisionsState.set({
            status: 'error',
            error: { code: 'REVISIONS_LOAD_FAILED', message: err.message },
          });
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // User actions
  // ---------------------------------------------------------------------------

  selectLeftRevision(revision: AtomRevision): void {
    this.selectedLeft.set(revision);
  }

  selectRightRevision(revision: AtomRevision): void {
    this.selectedRight.set(revision);
  }

  isLeftSelected(revision: AtomRevision): boolean {
    return this.selectedLeft()?.id === revision.id;
  }

  isRightSelected(revision: AtomRevision): boolean {
    return this.selectedRight()?.id === revision.id;
  }

  formatDate(isoString: string | null): string {
    if (!isoString) return '--';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  trackByRevisionId(_index: number, revision: AtomRevision): string {
    return revision.id;
  }

  trackByDiffLine(index: number): number {
    return index;
  }

  // ---------------------------------------------------------------------------
  // Diff computation
  // ---------------------------------------------------------------------------

  private serializeContent(revision: AtomRevision): string {
    try {
      return JSON.stringify(revision.content, null, 2);
    } catch {
      return String(revision.content);
    }
  }

  /**
   * Simple line-by-line diff using longest common subsequence.
   * For production, consider using a proper diff library.
   */
  private computeDiff(leftText: string, rightText: string): DiffLine[] {
    const leftLines = leftText.split('\n');
    const rightLines = rightText.split('\n');
    const result: DiffLine[] = [];

    // Simple diff: walk both arrays using LCS approach
    const lcs = this.lcs(leftLines, rightLines);
    let li = 0;
    let ri = 0;
    let leftNum = 1;
    let rightNum = 1;

    for (const common of lcs) {
      // Emit removed lines from left
      while (li < common.leftIndex) {
        result.push({
          type: 'removed',
          content: leftLines[li],
          leftLineNum: leftNum++,
          rightLineNum: null,
        });
        li++;
      }
      // Emit added lines from right
      while (ri < common.rightIndex) {
        result.push({
          type: 'added',
          content: rightLines[ri],
          leftLineNum: null,
          rightLineNum: rightNum++,
        });
        ri++;
      }
      // Emit common line
      result.push({
        type: 'unchanged',
        content: leftLines[li],
        leftLineNum: leftNum++,
        rightLineNum: rightNum++,
      });
      li++;
      ri++;
    }

    // Remaining left lines
    while (li < leftLines.length) {
      result.push({
        type: 'removed',
        content: leftLines[li],
        leftLineNum: leftNum++,
        rightLineNum: null,
      });
      li++;
    }

    // Remaining right lines
    while (ri < rightLines.length) {
      result.push({
        type: 'added',
        content: rightLines[ri],
        leftLineNum: null,
        rightLineNum: rightNum++,
      });
      ri++;
    }

    return result;
  }

  private lcs(
    left: string[],
    right: string[],
  ): { leftIndex: number; rightIndex: number }[] {
    const m = left.length;
    const n = right.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array<number>(n + 1).fill(0),
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (left[i - 1] === right[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find LCS
    const result: { leftIndex: number; rightIndex: number }[] = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (left[i - 1] === right[j - 1]) {
        result.unshift({ leftIndex: i - 1, rightIndex: j - 1 });
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return result;
  }
}
