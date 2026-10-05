/**
 * Agent-trace widget — front-end manifestation of IMDA D2 Transparency
 * (per ADR-141) for the prompt-level QGen pipeline at `/a/atoms/new`.
 *
 * UX layout choice (per resume prompt §6): **Option A — right-rail panel**.
 * Tablet-first (≥768px primary, ≥1280px desktop enhanced). No mobile
 * breakpoints. Polyglass A+ indigo accent on chrome.
 *
 * Scope: prompt-level / per-question QGen ONLY. Batch QGen (Validator
 * Agent file-upload pipeline) is OUT OF SCOPE.
 *
 * Renders 3 collapsible pipeline groups (Classification → Q&A Generation →
 * Quality Validation). Orchestrator card omitted per resume prompt §2.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ChoraEmptyStateComponent } from '../../../../../shared/components/chora-empty-state/chora-empty-state.component';
import type {
  AgentTraceEvent,
  AgentTraceGroup,
  PipelineGroup,
} from '../agent-trace.model';
import type { PipelineTraceStep } from '../atom-authoring.model';
import { AgentTraceService } from '../agent-trace.service';
import { BADGE_VARIANT_STYLES, PIPELINE_META, pipelineMeta, stageBadges } from './stage-configs';
import { getModelMeta } from './model-meta';

/**
 * Cards rendered, in order. Per owner direction 2026-06-25 the widget FEATURES
 * THE FULL CREW (reversing the 2026-05-17 LLM-only curation): Input & Safety
 * (validate_input + guardrail_pre) → Q&A Generation (generate + guardrail_post)
 * → Critique & Quality Gate (critique + quality_gate + regenerate) →
 * Illustration (render_image). A card with no events for a given run simply
 * does not render (e.g. Illustration is absent when no image was generated).
 */
const PIPELINE_ORDER: PipelineGroup[] = [
  'classification-pipeline',
  'qa-generation',
  'quality-validation',
  'illustration',
];

interface TraceGroupViewModel extends AgentTraceGroup {
  readonly expanded: boolean;
}

@Component({
  selector: 'chora-aplus-trace-widget',
  imports: [TranslatePipe, ChoraEmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trace-widget.component.html',
  styleUrl: './trace-widget.component.scss',
})
export class TraceWidgetComponent {
  private readonly traceService = inject(AgentTraceService);

  /**
   * Live `pipeline_trace[]` from the async AI-Assist envelope. The
   * widget maps this into 3 collapsible IMDA D2 group cards
   * (Classification → Q&A Generation → Quality Validation).
   * Replaces the legacy `workflowId` mock-subscription as of 2026-05-17.
   */
  readonly pipelineTrace = input<readonly PipelineTraceStep[] | null>(null);
  /** Refuse-path flag — flips the trace's terminal-signal branch. */
  readonly refused = input<boolean>(false);
  /** Empty-state hint visibility — true when DRAFT (no generation kicked). */
  readonly idle = input<boolean>(true);
  /**
   * Live mode — the job is still GENERATING. The trace streams in (cards appear
   * as each agent finishes); the header shows a running pill + a "working" ghost
   * and the widget does NOT auto-collapse. Default false (terminal/review).
   */
  readonly live = input<boolean>(false);
  /**
   * Parent-seeded whole-widget collapse intent (e.g. `true` on the review screen
   * so the trace animate-collapses into a pinned accordion). null ⇒ defer to
   * live()/the user toggle.
   */
  readonly collapsed = input<boolean | null>(null);

  private readonly events = signal<AgentTraceEvent[]>([]);
  private readonly collapsedGroups = signal<ReadonlySet<PipelineGroup>>(new Set());
  /**
   * The author's explicit whole-widget collapse toggle. null = follow the
   * input/live default. Kept OUTSIDE the pipelineTrace effect so a re-poll while
   * generating never resets the author's choice.
   */
  private readonly userCollapsed = signal<boolean | null>(null);

  /**
   * Whole-widget collapse precedence: explicit user toggle > parent seed >
   * collapse-when-not-live (live generation stays open; review starts collapsed).
   */
  readonly effectiveCollapsed = computed<boolean>(
    () => this.userCollapsed() ?? this.collapsed() ?? !this.live(),
  );

  /** Aggregated, ordered, expandable groups. */
  readonly groups = computed<readonly TraceGroupViewModel[]>(() => {
    const evtMap = new Map<string, AgentTraceEvent>();
    for (const e of this.events()) {
      // Last write wins — completed/failed supersedes in_flight by event_id.
      evtMap.set(e.eventId, e);
    }
    const merged = [...evtMap.values()];

    return PIPELINE_ORDER.map((group): TraceGroupViewModel => {
      const meta = pipelineMeta(group);
      const groupEvents = merged
        .filter((e) => e.pipelineGroup === group)
        .sort((a, b) => a.stage - b.stage);
      const anyInFlight = groupEvents.some((e) => e.status === 'in_flight');
      const anyFailed = groupEvents.some((e) => e.status === 'failed');
      const status: AgentTraceGroup['status'] = anyInFlight
        ? 'in_flight'
        : anyFailed
          ? 'failed'
          : groupEvents.length > 0
            ? 'completed'
            : 'in_flight';
      const terminalSignal =
        groupEvents.length > 0 && !anyInFlight
          ? this.traceService.deriveTerminalSignal(groupEvents)
          : undefined;
      const collapsed = this.collapsedGroups().has(group);
      return {
        pipelineGroup: group,
        agentLabel: meta.agentLabel,
        pipelineLabel: meta.pipelineLabel,
        accentColor: meta.accentColor,
        icon: meta.icon,
        events: groupEvents,
        terminalSignal,
        status,
        expanded: !collapsed,
      };
    });
  });

  /** True when at least one group has events to display. */
  readonly hasTrace = computed<boolean>(() => this.events().length > 0);

  /** Convenience: total stage count across all groups (for empty-state copy). */
  readonly totalStages = computed<number>(
    () => this.groups().reduce((acc, g) => acc + g.events.length, 0),
  );

  /**
   * Collapsed one-line outcome — the terminal signal of the LAST group that
   * produced one (PROCEED / PROCEED_WITH_WARNINGS / TERMINATE), surfaced in the
   * accordion header so the author sees the verdict without expanding. null
   * while still generating (no terminal yet).
   */
  readonly collapsedOutcome = computed<
    'PROCEED' | 'PROCEED_WITH_WARNINGS' | 'TERMINATE' | null
  >(() => {
    const withSignal = this.groups().filter((g) => g.terminalSignal);
    return withSignal.at(-1)?.terminalSignal?.status ?? null;
  });

  constructor() {
    effect(() => {
      const trace = this.pipelineTrace();
      if (!trace || trace.length === 0) {
        this.events.set([]);
        return;
      }
      this.events.set([
        ...this.traceService.eventsFromPipelineTrace(trace, {
          refused: this.refused(),
        }),
      ]);
    });
  }

  toggleGroup(group: PipelineGroup): void {
    this.collapsedGroups.update((set) => {
      const next = new Set(set);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  onGroupKeydown(event: KeyboardEvent, group: PipelineGroup): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleGroup(group);
    }
  }

  /** Toggle the whole-widget accordion (author override of the live/seed default). */
  toggleCollapsed(): void {
    this.userCollapsed.set(!this.effectiveCollapsed());
  }

  onHeaderKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleCollapsed();
    }
  }

  /** Per-event helpers exposed to the template (kept pure for testability). */
  getModel(modelId: string | undefined) {
    return getModelMeta(modelId);
  }

  stageLabel(group: PipelineGroup, stage: number): string {
    return PIPELINE_META[group].stages[stage]?.label ?? '';
  }

  stageIcon(group: PipelineGroup, stage: number, fallback: string): string {
    return PIPELINE_META[group].stages[stage]?.icon ?? fallback;
  }

  stageBadgeColor(group: PipelineGroup, stage: number, fallback: string): string {
    return PIPELINE_META[group].stages[stage]?.badgeColor ?? fallback;
  }

  stageMetric(event: AgentTraceEvent): string {
    const cfg = PIPELINE_META[event.pipelineGroup].stages[event.stage];
    return cfg ? cfg.metricExtractor(event.summary) : event.summary.slice(0, 80);
  }

  stageBadges(group: PipelineGroup, stage: number) {
    return stageBadges(group, stage);
  }

  badgeStyle(variant: 'tool-call' | 'autonomous' | 'parallel-agentic') {
    return BADGE_VARIANT_STYLES[variant];
  }

  formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleTimeString('en-SG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return iso;
    }
  }

  terminalVariant(status: 'PROCEED' | 'PROCEED_WITH_WARNINGS' | 'TERMINATE'): string {
    if (status === 'TERMINATE') return 'danger';
    if (status === 'PROCEED_WITH_WARNINGS') return 'warning';
    return 'success';
  }
}
