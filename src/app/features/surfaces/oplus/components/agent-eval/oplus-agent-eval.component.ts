/**
 * O+ Agent-Eval Evidence view — crew-run drill-down (IMDA D2 transparency).
 *
 * Surfaces the agent CI/CD eval gate evidence (ADR-169 / CHO-1674) the
 * Chora-native way: a polled crew-run index (`/bff/oplus/eval-runs`, grouped
 * by `candidate_label`) → per-member functional-autorater + adversarial
 * summaries → an on-demand per-row evidence drill-down
 * (`/bff/oplus/eval-runs/{candidate_label}`: prompt → response → score +
 * autorater rationale, plus the adversarial verdict).
 *
 * Console deep-links (selective deep-link policy — anchor #2; O+ NEVER
 * re-renders the raw store): each crew run links to the BigQuery
 * `agent_eval_evidence` view, each member to its Vertex AI Experiments runs.
 *
 * Surface accent: IMDA violet/magenta via `.surface-oplus`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  GovernanceService,
  badgeVariant,
  hasData,
  type AgentEvalData,
  type EvalCrewRun,
  type EvalEvidenceRow,
  type EvalMetric,
  type LiveBadgeVariant,
} from '../../../../../core/services/governance.service';

/** Per-run lazy evidence load state. */
type EvidenceCell =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly rows: readonly EvalEvidenceRow[] }
  | { readonly status: 'error' };

@Component({
  selector: 'chora-oplus-agent-eval',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './oplus-agent-eval.component.html',
  styleUrl: './oplus-agent-eval.component.scss',
})
export class OplusAgentEvalComponent {
  private readonly svc = inject(GovernanceService);
  private readonly destroyRef = inject(DestroyRef);

  /** Polled crew-run index state. */
  protected readonly state = this.svc.agentEval();

  /** Cached payload — preserved across stale / loading transitions. */
  protected readonly data = computed<AgentEvalData | null>(() => {
    const s = this.state();
    return hasData(s) ? s.data : null;
  });

  /** Crew runs (empty if no data yet). */
  protected readonly runs = computed<readonly EvalCrewRun[]>(
    () => this.data()?.runs ?? [],
  );

  /** Header badge variant. */
  protected readonly badge = computed<LiveBadgeVariant>(() => badgeVariant(this.state()));

  protected readonly badgeKey = computed<string>(() => {
    switch (this.badge()) {
      case 'live':
        return 'oplus.dashboard.badge_live';
      case 'stale':
        return 'oplus.dashboard.badge_stale';
      case 'offline':
        return 'oplus.dashboard.badge_offline';
      default:
        return 'oplus.dashboard.badge_loading';
    }
  });

  protected readonly isAuditorGated = computed<boolean>(() => {
    const s = this.state();
    return s.state === 'error' && s.error.kind === 'forbidden';
  });

  protected readonly hasErrorOnly = computed<boolean>(() => {
    const s = this.state();
    return s.state === 'error' && this.data() === null;
  });

  protected readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.state === 'error' ? s.error.messageKey : 'oplus.errors.generic';
  });

  // ─── Accordion + lazy evidence state ────────────────────────────────

  /** Run expansion (keyed by candidate_label; default: first run open). */
  private readonly expanded = signal<Readonly<Record<string, boolean>>>({});
  /** Per-run evidence-section visibility. */
  private readonly evidenceOpen = signal<Readonly<Record<string, boolean>>>({});
  /** Per-run lazy evidence fetch state. */
  private readonly evidence = signal<Readonly<Record<string, EvidenceCell>>>({});

  protected isExpanded(label: string, isFirst: boolean): boolean {
    const explicit = this.expanded()[label];
    return explicit === undefined ? isFirst : explicit;
  }

  protected toggleRun(label: string, isFirst: boolean): void {
    const next = !this.isExpanded(label, isFirst);
    this.expanded.set({ ...this.expanded(), [label]: next });
  }

  protected isEvidenceOpen(label: string): boolean {
    return this.evidenceOpen()[label] === true;
  }

  /** Toggle the per-case evidence section; lazily fetch on first open. */
  protected toggleEvidence(label: string): void {
    const open = !this.isEvidenceOpen(label);
    this.evidenceOpen.set({ ...this.evidenceOpen(), [label]: open });
    if (open && this.evidence()[label] === undefined) {
      this.loadEvidence(label);
    }
  }

  protected evidenceCell(label: string): EvidenceCell | undefined {
    return this.evidence()[label];
  }

  private loadEvidence(label: string): void {
    this.evidence.set({ ...this.evidence(), [label]: { status: 'loading' } });
    this.svc
      .agentEvalEvidence(label)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) =>
          this.evidence.set({
            ...this.evidence(),
            [label]: { status: 'loaded', rows: data.rows },
          }),
        error: () =>
          this.evidence.set({
            ...this.evidence(),
            [label]: { status: 'error' },
          }),
      });
  }

  // ─── Template helpers ───────────────────────────────────────────────

  /** Per-metric average, fixed to 2dp (scores are metric-scaled, not blended). */
  protected formatScore(metric: EvalMetric): string {
    return metric.avg_score.toFixed(2);
  }

  /** Adversarial block rate as "blocked/total". */
  protected blockRate(blocked: number, total: number): string {
    return `${blocked}/${total}`;
  }

  /** True when an adversarial verdict is a PASS (attack blocked). */
  protected verdictIsPass(verdict: string | undefined): boolean {
    return (verdict ?? '').toUpperCase().startsWith('BLOCKED');
  }

  /** Short UTC date-time for the run header. */
  protected formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }

  protected slug(s: string): string {
    return s.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  }

  protected runHeaderId(label: string): string {
    return `oplus-eval-run-header-${this.slug(label)}`;
  }

  protected runPanelId(label: string): string {
    return `oplus-eval-run-panel-${this.slug(label)}`;
  }
}
