/**
 * O+ Agents view — Crews + Agents hierarchical accordion.
 *
 * Phase-D REWRITE (atomic-napping-spring plan, §D4 + anchor #7):
 *   - The fixed 7-agent Phyllis content-gate table is GONE. The new
 *     model is `Crew {1..N}` → `Agent {1..M}` driven by the BFF
 *     `/bff/oplus/agents` response (which itself aggregates
 *     `chora_observability.agent_decision_log` joined to the canonical
 *     `chora-infra/agents-cli/registry.json` metadata).
 *   - Each agent row carries a pre-formatted Cloud Trace deep-link
 *     (selective deep-link policy — anchor #2; O+ NEVER duplicates the
 *     Cloud Trace UI). The Agent Engine deep-link was removed per ADR-169.
 *   - Crews with `has_recent_activity === false` show an empty-state
 *     ("no recent activity in the last quarter") — NOT the old
 *     "Mock — wave N" string.
 *   - Per-crew agent count chip surfaces the crew size for skim mode.
 *   - ADR-197 read slice (CHO-2364): `/bff/oplus/prompts` evidence renders as
 *     a STANDALONE "Agent prompt versions" panel above the crews list, one
 *     card per evidence agent in payload order. The roster below renders
 *     registry.json ids (qgen-mcq, qgen-critique, ...) while the evidence
 *     rows are runtime roles (qgen_question, qgen_critic, ...) and two
 *     registry generator rows map onto ONE runtime role, so a per-registry-
 *     row merge is structurally impossible - the panel is driven purely by
 *     the prompts payload. Cards show version + source rung + last evidence
 *     (or the designed empty state, never a fabricated version); qgen cards
 *     disclose the 3-lane use-case matrix; the familiar card lists Routine
 *     run ritual stamps.
 *
 * Surface accent: IMDA violet (`#7b2d8e`) + magenta (`#c4107b`) via
 * `.surface-oplus`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../../core/services/translate.service';
import { OplusPromptModalComponent } from './oplus-prompt-modal.component';
import {
  GovernanceService,
  badgeVariant,
  hasData,
  type AgentsCrew,
  type AgentsData,
  type LiveBadgeVariant,
  type PromptAgent,
  type PromptsData,
} from '../../../../../core/services/governance.service';

/** Which non-chip prompt-fetch state the strip above the crew list surfaces. */
type PromptsBranch = 'loading' | 'forbidden' | 'error' | 'empty' | 'data';

@Component({
  selector: 'chora-oplus-agents',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, OplusPromptModalComponent],
  templateUrl: './oplus-agents.component.html',
  styleUrl: './oplus-agents.component.scss',
})
export class OplusAgentsComponent {
  private readonly svc = inject(GovernanceService);
  private readonly i18n = inject(TranslateService);

  /** Polled crews+agents state. */
  protected readonly state = this.svc.agents();

  /** Polled prompt-versioning evidence state (ADR-197 read slice). */
  protected readonly promptsState = this.svc.prompts();

  /** Cached payload — preserved across stale / loading transitions. */
  protected readonly data = computed<AgentsData | null>(() => {
    const s = this.state();
    return hasData(s) ? s.data : null;
  });

  /** Crews list (empty if no data yet). */
  protected readonly crews = computed<readonly AgentsCrew[]>(
    () => this.data()?.crews ?? [],
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

  /** Expansion state per crew (keyed by crew_name; default: first crew open). */
  private readonly expanded = signal<Readonly<Record<string, boolean>>>({});

  protected isExpanded(crewName: string, isFirst: boolean): boolean {
    const explicit = this.expanded()[crewName];
    if (explicit !== undefined) return explicit;
    // Default: first crew is expanded; the rest collapsed.
    return isFirst;
  }

  protected toggleCrew(crewName: string, isFirst: boolean): void {
    const current = this.expanded();
    const next = !this.isExpanded(crewName, isFirst);
    this.expanded.set({ ...current, [crewName]: next });
  }

  // ─── Prompt versioning (ADR-197 read slice, CHO-2364) ───────────────

  /** Prompt payload, preserved across stale transitions. */
  private readonly promptsData = computed<PromptsData | null>(() => {
    const s = this.promptsState();
    return hasData(s) ? s.data : null;
  });

  /**
   * Evidence agents in payload order. The panel renders ONE card per row;
   * it never joins onto the registry roster (whose ids are a different
   * namespace and coarser-grained than the runtime roles here).
   */
  protected readonly promptAgents = computed<readonly PromptAgent[]>(
    () => this.promptsData()?.agents ?? [],
  );

  /** Which prompt strip variant to render above the crew list. */
  protected readonly promptsBranch = computed<PromptsBranch>(() => {
    const s = this.promptsState();
    if (s.state === 'loading') return 'loading';
    if (s.state === 'error') {
      return s.error.kind === 'forbidden' ? 'forbidden' : 'error';
    }
    return s.data.agents.length === 0 ? 'empty' : 'data';
  });

  /** Error-state retry CTA: re-poll the prompts route immediately. */
  protected retryPrompts(): void {
    this.svc.retryPrompts();
  }

  /**
   * CHO-2368 — which agent's prompt-content modal is open (null = closed).
   * Chips are the openers; the modal fetches the catalogue lazily and
   * preselects the chip's version when it exists in the registry.
   */
  protected readonly promptModal = signal<{
    agentId: string;
    initialVersion?: string;
  } | null>(null);

  protected openPromptModal(agentId: string, initialVersion?: string): void {
    this.promptModal.set({ agentId, initialVersion });
  }

  protected closePromptModal(): void {
    this.promptModal.set(null);
  }

  /** Use-case matrix disclosure state, keyed by agent_id (default closed). */
  private readonly matrixOpen = signal<Readonly<Record<string, boolean>>>({});

  protected isMatrixOpen(agentId: string): boolean {
    return this.matrixOpen()[agentId] === true;
  }

  protected toggleMatrix(agentId: string): void {
    const current = this.matrixOpen();
    this.matrixOpen.set({ ...current, [agentId]: !this.isMatrixOpen(agentId) });
  }

  protected matrixId(agentId: string): string {
    return `oplus-prompt-matrix-${this.slug(agentId)}`;
  }

  protected matrixToggleId(agentId: string): string {
    return `oplus-prompt-matrix-toggle-${this.slug(agentId)}`;
  }

  /** i18n key for a crew label; unknown crews fall back to the wire name. */
  protected crewLabelKey(crewName: string): string {
    switch (crewName) {
      case 'qgen':
        return 'oplus.agents.prompt_crew_qgen';
      case 'oe_grading':
        return 'oplus.agents.prompt_crew_oe_grading';
      case 'familiar':
        return 'oplus.agents.prompt_crew_familiar';
      default:
        return crewName;
    }
  }

  /** i18n key for a use-case lane; unknown lanes fall back to the wire key. */
  protected useCaseLabelKey(key: string): string {
    switch (key) {
      case 'ai_assist_single':
        return 'oplus.agents.prompt_use_case_ai_assist_single';
      case 'batch':
        return 'oplus.agents.prompt_use_case_batch';
      case 'daily_dose':
        return 'oplus.agents.prompt_use_case_daily_dose';
      default:
        return key;
    }
  }

  /**
   * Compact relative evidence age ("3d ago"). Buckets: just now, minutes,
   * hours, then whole days. An unparsable timestamp renders verbatim rather
   * than pretending to know the age.
   */
  protected relativeTime(iso: string): string {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return iso;
    const minutes = Math.floor((Date.now() - then) / 60_000);
    if (minutes < 1) {
      return this.i18n.instant('oplus.agents.prompt_ago_just_now');
    }
    if (minutes < 60) {
      return this.i18n.instant('oplus.agents.prompt_ago_minutes', { n: minutes });
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return this.i18n.instant('oplus.agents.prompt_ago_hours', { n: hours });
    }
    return this.i18n.instant('oplus.agents.prompt_ago_days', {
      n: Math.floor(hours / 24),
    });
  }

  // ─── Template helpers ───────────────────────────────────────────────

  /** Display "—" for null numeric stats. */
  protected formatStat(v: number | null): string {
    return v === null || v === undefined ? '–' : `${v}`;
  }

  /** Format refusal rate (0..1) as a percentage; `—` when null. */
  protected formatRefusalRate(v: number | null): string {
    if (v === null || v === undefined) return '–';
    return `${Math.round(v * 100)}%`;
  }

  /** Format latency in milliseconds. */
  protected formatLatency(v: number | null): string {
    if (v === null || v === undefined) return '–';
    return `${v} ms`;
  }

  /** Stable IDs for ARIA wiring. */
  protected crewHeaderId(crewName: string): string {
    return `oplus-crew-header-${this.slug(crewName)}`;
  }

  protected crewPanelId(crewName: string): string {
    return `oplus-crew-panel-${this.slug(crewName)}`;
  }

  protected slug(s: string): string {
    return s.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  }
}
