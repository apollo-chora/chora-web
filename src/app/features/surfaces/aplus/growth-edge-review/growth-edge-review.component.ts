import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap, timer } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { MeManaService } from '../../../../core/services/me-mana.service';
import { WeaknessReviewService } from './weakness-review.service';
import { PendingReviewStore } from './pending-review.store';
import {
  EdgeDecision,
  EdgeDecisionKind,
  EdgeDifficulty,
  ProposedGrowthEdge,
  ReviewAction,
  WeaknessOutputKind,
  WeaknessReviewDecision,
  WeaknessReviewPanel,
  WeaknessUploadJob,
} from './weakness-review.models';

type ReviewState =
  | 'loading'
  | 'analyzing'
  | 'review'
  | 'completed'
  | 'failed'
  | 'error';
type SubmitState = 'idle' | 'submitting' | 'done' | 'error';

const MAX_POLL_ATTEMPTS = 40; // ~5 min ceiling at the capped backoff
const DIFFICULTIES: readonly EdgeDifficulty[] = ['easier', 'standard', 'harder'];
const DECISIONS: readonly EdgeDecisionKind[] = ['accept', 'reject', 'merge'];

/**
 * A+ Growth-Edge HITL review (ADR-205 WS-8) — the learner reviews their own
 * graduated diagnosis through BOUNDED controls only (accept / reject / merge an
 * edge, a difficulty tri-toggle, a bounded "add a struggle" picker, a bounded
 * output chooser, a mana running-total vs the wallet) and then confirms or
 * reiterates. The panel's state IS the `Command(resume=…)` payload — there is
 * NO free-form prompt anywhere (D4). The learner's existing Familiar fronts the
 * diagnosis (D5); the raw `descriptor` is never shown. Ships DARK behind
 * `featureReadyGuard('growth-edge-review')`.
 */
@Component({
  selector: 'chora-aplus-growth-edge-review',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './growth-edge-review.component.html',
  styleUrl: './growth-edge-review.component.scss',
})
export class GrowthEdgeReviewComponent implements OnInit {
  private readonly service = inject(WeaknessReviewService);
  private readonly mana = inject(MeManaService);
  private readonly pendingReview = inject(PendingReviewStore);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param (`/a/growth-edges/review/:uploadId`) via input binding. */
  readonly uploadId = input.required<string>();

  readonly difficulties = DIFFICULTIES;
  readonly decisionKinds = DECISIONS;

  // ── load / panel state ────────────────────────────────────────────────
  readonly state = signal<ReviewState>('loading');
  readonly panel = signal<WeaknessReviewPanel | null>(null);
  readonly failureReason = signal<string | null>(null);
  /**
   * The raw status of a run this build cannot name, or null.
   *
   * `normaliseResumeResponse` deliberately does NOT default an unrecognised
   * orchestrator status, on the grounds that a default there "would turn an
   * unknown orchestrator state into a plausible lie about a run the learner
   * paid for". It CASTS instead, which hands the decision here. So the decision
   * gets made: say what arrived.
   */
  readonly unknownStatus = signal<string | null>(null);

  // ── learner decisions (the bounded resume payload, pre-serialisation) ──
  private readonly decisions = signal<Readonly<Record<string, EdgeDecision>>>({});
  private readonly addedStruggles = signal<ReadonlySet<string>>(new Set());
  private readonly selectedOutputs = signal<ReadonlySet<WeaknessOutputKind>>(
    new Set(),
  );
  readonly submitState = signal<SubmitState>('idle');

  // ── derived ─────────────────────────────────────────────────────────────
  readonly familiarName = computed<string>(
    () => this.panel()?.familiar?.name ?? '',
  );
  readonly proposedEdges = computed<readonly ProposedGrowthEdge[]>(
    () => this.panel()?.proposed_edges ?? [],
  );
  readonly acceptedCount = computed<number>(
    () =>
      Object.values(this.decisions()).filter((d) => d.decision !== 'reject')
        .length,
  );
  readonly walletBalance = computed<number>(() => this.mana.balanceUnits());
  readonly manaTotal = computed<number>(() => {
    const outs = this.panel()?.available_outputs ?? [];
    const chosen = this.selectedOutputs();
    return outs
      .filter((o) => chosen.has(o.kind))
      .reduce((sum, o) => sum + o.mana_price, 0);
  });
  readonly affordable = computed<boolean>(
    () => this.manaTotal() <= this.walletBalance(),
  );

  ngOnInit(): void {
    this.mana.load();
    this.load(0);
  }

  private load(attempt: number): void {
    if (attempt === 0) {
      this.state.set('loading');
    }
    this.service
      .pollUpload(this.uploadId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => this.handleJob(job, attempt),
        error: () => this.state.set('error'),
      });
  }

  private handleJob(job: WeaknessUploadJob, attempt: number): void {
    // A known status clears any name left by a previous unknown one.
    this.unknownStatus.set(null);
    switch (job.status) {
      case 'AWAITING_REVIEW':
        // A review interrupt MUST carry a panel; absent it the response is
        // malformed — fail loud rather than render an empty/incoherent review.
        if (job.review) {
          this.applyPanel(job.review);
          this.state.set('review');
        } else {
          this.state.set('error');
        }
        break;
      case 'QUEUED':
      case 'ANALYZING':
        this.state.set('analyzing');
        if (attempt < MAX_POLL_ATTEMPTS) {
          this.schedulePoll(attempt + 1);
        } else {
          this.state.set('error');
        }
        break;
      case 'COMPLETED':
        // Already reviewed elsewhere; a resolved review must never leave a
        // stale /a/knowledge banner (CHO-2337).
        this.pendingReview.clear();
        this.state.set('completed');
        break;
      case 'FAILED':
        this.pendingReview.clear();
        this.failureReason.set(job.failure_reason ?? null);
        this.state.set('failed');
        break;
      default:
        // The switch must be TOTAL. Without this arm an unrecognised status
        // changed nothing at all: no state, no poll, no error, no message, and
        // the screen sat in whatever state it was already in. The casing half
        // of this failure was fixed once (see normaliseResumeResponse); this is
        // the totality half.
        //
        // NAME what arrived rather than picking a plausible state, and do NOT
        // clear the pending-review banner: an unknown status is not evidence
        // that the review resolved, and clearing it would strand the learner
        // with no route back.
        this.unknownStatus.set(String(job.status ?? ''));
        this.state.set('error');
        break;
    }
  }

  private schedulePoll(attempt: number): void {
    const delay = Math.min(2000 * 2 ** (attempt - 1), 8000); // 2s→4s→8s capped
    timer(delay)
      .pipe(
        switchMap(() => this.service.pollUpload(this.uploadId())),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (job) => this.handleJob(job, attempt),
        error: () => this.state.set('error'),
      });
  }

  /** Initialise the bounded controls from a (re-)diagnosed panel. */
  private applyPanel(panel: WeaknessReviewPanel): void {
    this.panel.set(panel);
    const seeded: Record<string, EdgeDecision> = {};
    for (const e of panel.proposed_edges) {
      seeded[e.proposed_edge_id] = {
        proposed_edge_id: e.proposed_edge_id,
        decision: 'accept',
        difficulty: e.suggested_difficulty,
      };
    }
    this.decisions.set(seeded);
    this.addedStruggles.set(new Set());
    this.selectedOutputs.set(
      new Set(panel.available_outputs.filter((o) => o.default_selected).map((o) => o.kind)),
    );
    this.submitState.set('idle');
  }

  // ── bounded control mutations ────────────────────────────────────────────
  decisionFor(edgeId: string): EdgeDecision | undefined {
    return this.decisions()[edgeId];
  }

  isAccepted(edgeId: string): boolean {
    return this.decisions()[edgeId]?.decision !== 'reject';
  }

  setDecision(edgeId: string, decision: EdgeDecisionKind): void {
    this.decisions.update((all) => {
      const prev = all[edgeId];
      if (!prev) {
        return all;
      }
      const next: EdgeDecision = { ...prev, decision };
      if (decision !== 'merge') {
        delete (next as { merge_into_id?: string }).merge_into_id;
      }
      return { ...all, [edgeId]: next };
    });
  }

  setDifficulty(edgeId: string, difficulty: EdgeDifficulty): void {
    this.decisions.update((all) =>
      all[edgeId] ? { ...all, [edgeId]: { ...all[edgeId], difficulty } } : all,
    );
  }

  setMergeTarget(edgeId: string, mergeIntoId: string): void {
    this.decisions.update((all) =>
      all[edgeId]
        ? { ...all, [edgeId]: { ...all[edgeId], merge_into_id: mergeIntoId } }
        : all,
    );
  }

  /** Other edges this edge can merge into (bounded — never free text). */
  mergeTargetsFor(edgeId: string): readonly ProposedGrowthEdge[] {
    return this.proposedEdges().filter((e) => e.proposed_edge_id !== edgeId);
  }

  isStruggleAdded(conceptKey: string): boolean {
    return this.addedStruggles().has(conceptKey);
  }

  toggleStruggle(conceptKey: string): void {
    this.addedStruggles.update((set) => {
      const next = new Set(set);
      next.has(conceptKey) ? next.delete(conceptKey) : next.add(conceptKey);
      return next;
    });
  }

  isOutputSelected(kind: WeaknessOutputKind): boolean {
    return this.selectedOutputs().has(kind);
  }

  toggleOutput(kind: WeaknessOutputKind): void {
    this.selectedOutputs.update((set) => {
      const next = new Set(set);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return next;
    });
  }

  // ── commit ────────────────────────────────────────────────────────────────
  confirm(): void {
    if (!this.affordable() || this.submitState() === 'submitting') {
      return;
    }
    this.resume('confirm');
  }

  reiterate(): void {
    if (this.submitState() === 'submitting') {
      return;
    }
    this.resume('reiterate');
  }

  retry(): void {
    this.load(0);
  }

  private resume(action: ReviewAction): void {
    const decision = this.buildDecision(action);
    this.submitState.set('submitting');
    this.service
      .resume(this.uploadId(), decision)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          if (action === 'confirm') {
            this.submitState.set('done');
            // The review is resolved, so drop the /a/knowledge banner (CHO-2337).
            // The confirm branch does not re-poll, so the clear lives here.
            this.pendingReview.clear();
            return;
          }
          // Reiterate: the crew re-runs → route the response back through the
          // job handler (re-diagnose → AWAITING_REVIEW, or keep polling).
          this.submitState.set('idle');
          this.handleJob(job, 0);
        },
        error: () => this.submitState.set('error'),
      });
  }

  private buildDecision(action: ReviewAction): WeaknessReviewDecision {
    const edges: EdgeDecision[] = this.proposedEdges().map((e) => {
      const d = this.decisions()[e.proposed_edge_id];
      const base: EdgeDecision = {
        proposed_edge_id: e.proposed_edge_id,
        decision: d?.decision ?? 'accept',
      };
      if (base.decision === 'reject') {
        return base;
      }
      const withDiff: EdgeDecision = { ...base, difficulty: d?.difficulty };
      if (base.decision === 'merge' && d?.merge_into_id) {
        return { ...withDiff, merge_into_id: d.merge_into_id };
      }
      return withDiff;
    });
    return {
      action,
      edges,
      added_struggles: [...this.addedStruggles()],
      selected_outputs: [...this.selectedOutputs()],
    };
  }

  // ── i18n key helpers ──────────────────────────────────────────────────────
  outputKey(kind: WeaknessOutputKind): string {
    return `aplus.growth_edge_review.output_${kind}`;
  }

  difficultyKey(difficulty: EdgeDifficulty): string {
    return `aplus.growth_edge_review.difficulty_${difficulty}`;
  }

  decisionKey(decision: EdgeDecisionKind): string {
    return `aplus.growth_edge_review.decision_${decision}`;
  }
}
