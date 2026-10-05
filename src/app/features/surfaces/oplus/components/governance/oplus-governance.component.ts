/**
 * O+ Governance Controls — 3-tab consolidation.
 *
 * Phase-D hydration (atomic-napping-spring plan, §D5):
 *   - Decision Traces: real `decisions` rows from `/bff/oplus/governance`.
 *     Each row gets a "View in Cloud Trace ↗" button when the BFF supplies a
 *     pre-formatted `cloud_trace_url`; rows without one render the trace id
 *     as plain text (the frontend never composes a console.cloud.google.com
 *     URL — that would hard-code a GCP project into the bundle).
 *   - Human Oversight: real `hitl_pending` queue. Approve/Reject POST to
 *     the BFF (`/bff/oplus/governance/hitl/{id}/approve` | `/reject`) with
 *     the current operator GCID, then optimistically drop the actioned
 *     row from the local queue (the next 30s poll reconciles).
 *   - Data Governance: real `data_lineage` rows + static `RACI_MATRIX`
 *     (intentionally hand-curated per IMDA skill three-audience model).
 *
 * Surface accent: IMDA violet (`#7b2d8e`) primary + magenta (`#c4107b`)
 * secondary via `.surface-oplus`.
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
  type GovernanceData,
  type GovernanceDecision,
  type LiveBadgeVariant,
} from '../../../../../core/services/governance.service';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { RACI_MATRIX, type GovernanceTab } from '../../imda-dimensions';

/** Request body for a HITL verdict POST. `note` is optional. */
interface HitlVerdictRequest {
  readonly operator_gcid: string;
  readonly note?: string;
}

/**
 * The trace deep-link, when the BFF supplies one. The frontend never builds
 * a console.cloud.google.com URL itself — that would hard-code a GCP project
 * into the bundle (the pre-extraction behaviour), so a trace the BFF does not
 * deep-link renders as plain text instead of a link into someone else's
 * project.
 */
function cloudTraceUrlOf(decision: GovernanceDecision): string | null {
  return decision.cloud_trace_url ?? null;
}

@Component({
  selector: 'chora-oplus-governance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './oplus-governance.component.html',
  styleUrl: './oplus-governance.component.scss',
})
export class OplusGovernanceComponent {
  private readonly svc = inject(GovernanceService);
  private readonly bff = inject(BffClientService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Polled governance state. */
  protected readonly state = this.svc.governance();

  /**
   * HITL ids the operator has resolved this session. The verdict POST is
   * fire-and-reconcile: on a 2xx we optimistically drop the row from the
   * queue so the operator sees immediate feedback; the next 30s
   * `governance()` poll reconciles against the BFF's authoritative queue.
   */
  private readonly resolvedHitlIds = signal<ReadonlySet<string>>(new Set());

  /** HITL ids with a verdict POST currently in flight (disables buttons). */
  private readonly pendingHitlIds = signal<ReadonlySet<string>>(new Set());

  /** Inline error key for the oversight tab (null = no error). */
  protected readonly hitlActionError = signal<string | null>(null);

  /** Cached payload — null until first load lands. */
  protected readonly data = computed<GovernanceData | null>(() => {
    const s = this.state();
    return hasData(s) ? s.data : null;
  });

  /** Active tab — `decisions` is the default landing. */
  protected readonly activeTab = signal<GovernanceTab>('decisions');

  /**
   * The decision row currently expanded into its reasoning-chain panel
   * (null = all collapsed). Row-click toggles; one open at a time.
   */
  protected readonly expandedDecisionId = signal<string | null>(null);

  /** Static RACI matrix (intentionally hand-curated). */
  protected readonly raci = signal(RACI_MATRIX);

  /** Live decision rows enriched with a final cloud_trace_url. */
  protected readonly decisions = computed(() => {
    const list = this.data()?.decisions ?? [];
    return list.map((d) => ({ ...d, cloud_trace_url: cloudTraceUrlOf(d) }));
  });

  protected readonly hitlQueue = computed(() => {
    const resolved = this.resolvedHitlIds();
    return (this.data()?.hitl_pending ?? []).filter((h) => !resolved.has(h.id));
  });
  protected readonly lineage = computed(() => this.data()?.data_lineage ?? []);

  /** Display counts for badge chips. */
  protected readonly decisionCount = computed(() => this.decisions().length);
  protected readonly hitlCount = computed(() => this.hitlQueue().length);
  protected readonly lineageCount = computed(() => this.lineage().length);

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

  /** Auditor / error branching. */
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

  protected isActive(tab: GovernanceTab): boolean {
    return this.activeTab() === tab;
  }

  protected selectTab(tab: GovernanceTab): void {
    this.activeTab.set(tab);
  }

  protected tabPanelId(tab: GovernanceTab): string {
    return `oplus-governance-panel-${tab}`;
  }

  protected tabId(tab: GovernanceTab): string {
    return `oplus-governance-tab-${tab}`;
  }

  /** Format ISO timestamp for table display. */
  protected fmtTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  /**
   * Humanize the agent's quality-gate verdict for the auditor-facing
   * "Decision" column. The raw `decision_type` is an enum (e.g. `accepted` /
   * `rejected` / `refused`); this is pure data-formatting (same role as
   * `fmtTime`) that maps the known verdicts to plain-language outcomes and
   * title-cases any unrecognised value, so the column is never a meaningless
   * id or a blank.
   */
  protected verdictLabel(verdict: string): string {
    const raw = (verdict ?? '').trim();
    if (!raw) return '–';
    const known: Record<string, string> = {
      accepted: 'Approved',
      approved: 'Approved',
      completed_with_warning: 'Approved with warning',
      rejected: 'Rejected',
      refused: 'Refused',
      respond: 'Proceed',
      permitted: 'Allowed',
      denied: 'Blocked',
    };
    const key = raw.toLowerCase();
    return (
      known[key] ??
      raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  // ─── Reasoning chain (row-click) ────────────────────────────────────

  /** Whether the given decision row is expanded into its reasoning panel. */
  protected isExpanded(id: string): boolean {
    return this.expandedDecisionId() === id;
  }

  /** Toggle the row's reasoning panel (one open at a time). */
  protected toggleRow(id: string): void {
    this.expandedDecisionId.update((cur) => (cur === id ? null : id));
  }

  /**
   * The full per-agent reasoning chain for a decision's workflow: every
   * decision sharing the same workflow_id (e.g. qgen_question → qgen_critic),
   * oldest-first so the panel reads as a chain. Each entry keeps its enriched
   * cloud_trace_url so the panel deep-links to that agent's OWN span. Falls
   * back to the single decision when it has no workflow grouping key.
   */
  protected workflowChainOf(
    id: string,
  ): readonly (GovernanceDecision & { cloud_trace_url: string | null })[] {
    const all = this.decisions();
    const row = all.find((d) => d.id === id);
    if (!row) return [];
    const wf = row.workflow_id;
    if (!wf) return [row];
    return all
      .filter((d) => d.workflow_id === wf)
      .slice()
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** Has the agent's reasoning rationale (non-empty) for panel rendering. */
  protected hasReasoning(d: GovernanceDecision): boolean {
    return !!(d.reasoning_summary && d.reasoning_summary.trim());
  }

  /**
   * The prompt-shaping discriminants for a decision as a sorted key→value
   * list (IMDA D2 explainability). Returns `[]` when `prompt_conditions` is
   * absent/empty so the template renders nothing — never fabricated.
   */
  protected conditionEntries(
    d: GovernanceDecision,
  ): readonly { key: string; value: string }[] {
    const pc = d.prompt_conditions;
    if (!pc) return [];
    return Object.entries(pc)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Whether the decision carries any prompt conditions to render. */
  protected hasPromptConditions(d: GovernanceDecision): boolean {
    return this.conditionEntries(d).length > 0;
  }

  // ─── HITL verdicts ──────────────────────────────────────────────────

  /** Whether a verdict POST is in flight for the given HITL id. */
  protected isHitlBusy(id: string): boolean {
    return this.pendingHitlIds().has(id);
  }

  /** Approve a HITL gate — POST to the BFF, optimistically drop on 2xx. */
  protected approveHitlItem(id: string): void {
    this.submitHitlVerdict(id, 'approve');
  }

  /** Reject a HITL gate — POST to the BFF, optimistically drop on 2xx. */
  protected rejectHitlItem(id: string): void {
    this.submitHitlVerdict(id, 'reject');
  }

  /**
   * POST a verdict to `/bff/oplus/governance/hitl/{id}/{verdict}` with the
   * current operator GCID. On success: drop the row + toast; on error:
   * surface an inline alert + toast. Guards against double-submit while a
   * verdict is already in flight for the same id.
   */
  private submitHitlVerdict(id: string, verdict: 'approve' | 'reject'): void {
    if (this.pendingHitlIds().has(id)) return;

    const operatorGcid = this.auth.gcid();
    if (operatorGcid === null) {
      this.hitlActionError.set('oplus.governance.actions_no_operator');
      this.toast.show(
        'oplus.governance.actions_no_operator',
        'error',
      );
      return;
    }

    this.hitlActionError.set(null);
    this.pendingHitlIds.update((s) => new Set(s).add(id));

    const body: HitlVerdictRequest = { operator_gcid: operatorGcid };
    this.bff
      .post<unknown>(
        `/bff/oplus/governance/hitl/${encodeURIComponent(id)}/${verdict}`,
        body,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.pendingHitlIds.update((s) => {
            const next = new Set(s);
            next.delete(id);
            return next;
          });
          // Optimistic: hide the row; the next 30s poll reconciles.
          this.resolvedHitlIds.update((s) => new Set(s).add(id));
          this.toast.show(
            verdict === 'approve'
              ? 'oplus.governance.action_approved'
              : 'oplus.governance.action_rejected',
            'success',
          );
        },
        error: () => {
          this.pendingHitlIds.update((s) => {
            const next = new Set(s);
            next.delete(id);
            return next;
          });
          this.hitlActionError.set('oplus.governance.action_failed');
          this.toast.show('oplus.governance.action_failed', 'error');
        },
      });
  }
}
