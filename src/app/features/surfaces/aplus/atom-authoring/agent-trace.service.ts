/**
 * AgentTraceService — emits the prompt-level QGen agent-trace event stream
 * for a single workflow.
 *
 * v1 (today): mock observable that emits 3 pipeline groups (Classification
 * → Q&A Generation → Quality Validation) with realistic synthetic timing.
 * Each group emits one or two events with `status: 'in_flight'`, then the
 * same events with `status: 'completed'` and a `terminalSignal`. This
 * surfaces the pulse animation + the chevron expand-on-arrive UX.
 *
 * v2 (when chaos session lands SSE): swap `observeWorkflow` body for a
 * `BffClientService` SSE subscription on
 *   `/api/v1/workflows/{workflowId}/events`
 * Templates + components stay unchanged because the
 * `AgentTraceEvent` shape is the chaos-session backend contract.
 */
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import type {
  AgentTraceEvent,
  AgentTraceWorkflow,
  PipelineGroup,
  TerminalSignal,
} from './agent-trace.model';
import type { PipelineTraceStep } from './atom-authoring.model';
import { PIPELINE_META } from './widget/stage-configs';

const REFUSED_PROMPT_PATTERN = /naturally\s+excel|bias/i;

/** Composer for a single event — keeps the mock body terse. */
function makeEvent(
  partial: Omit<AgentTraceEvent, 'timestamp' | 'workflowId' | 'status'>,
  opts: { workflowId: string; offsetMs: number; status: AgentTraceEvent['status'] },
): AgentTraceEvent {
  const ts = new Date(Date.now() + opts.offsetMs).toISOString();
  return {
    ...partial,
    timestamp: ts,
    workflowId: opts.workflowId,
    status: opts.status,
  };
}

@Injectable({ providedIn: 'root' })
export class AgentTraceService {
  /**
   * Stream events for the given workflow. The mock emits ~5 events spaced
   * over ~6.5 seconds: each agent first appears with `status: 'in_flight'`
   * then is replaced (same `eventId`) with `status: 'completed'`.
   *
   * `refused` flips the Quality Validation terminal signal to TERMINATE
   * and tags the Q&A Generation self-evaluation event with `failed`.
   */
  observeWorkflow(
    workflowId: string,
    opts: { refused?: boolean } = {},
  ): Observable<AgentTraceEvent> {
    const refused = !!opts.refused;
    const classifyMeta = PIPELINE_META['classification-pipeline'];
    const qaMeta = PIPELINE_META['qa-generation'];
    const qvMeta = PIPELINE_META['quality-validation'];

    return new Observable<AgentTraceEvent>((sub) => {
      const timers: ReturnType<typeof setTimeout>[] = [];
      const emit = (event: AgentTraceEvent, delayMs: number): void => {
        timers.push(setTimeout(() => sub.next(event), delayMs));
      };
      const complete = (delayMs: number): void => {
        timers.push(setTimeout(() => sub.complete(), delayMs));
      };

      // Stage 1 — Classification (in-flight @ 0s, complete @ 1.5s)
      emit(
        makeEvent(
          {
            eventId: 'evt-classification-1',
            agentName: classifyMeta.agentLabel,
            phase: 'Classify + Rubric Fitness',
            eventType: 'qgen.classification.complete',
            summary:
              'ReAct sufficiency probing: 3 iterations. Extracted 4 subtopics. Rubric fitness: ALIGNED.',
            icon: classifyMeta.icon,
            accentColor: classifyMeta.accentColor,
            stage: 1,
            pipelineGroup: 'classification-pipeline',
            modelId: 'vertex-ai/gemini-2.5-pro',
            badgeText: 'ALIGNED',
            badgeVariant: 'success',
          },
          { workflowId, offsetMs: 0, status: 'in_flight' },
        ),
        50,
      );
      emit(
        makeEvent(
          {
            eventId: 'evt-classification-1',
            agentName: classifyMeta.agentLabel,
            phase: 'Classify + Rubric Fitness',
            eventType: 'qgen.classification.complete',
            summary:
              'ReAct sufficiency probing: 3 iterations. Extracted 4 subtopics. Rubric fitness: ALIGNED.',
            icon: classifyMeta.icon,
            accentColor: classifyMeta.accentColor,
            stage: 1,
            pipelineGroup: 'classification-pipeline',
            modelId: 'vertex-ai/gemini-2.5-pro',
            badgeText: 'ALIGNED',
            badgeVariant: 'success',
          },
          { workflowId, offsetMs: 1500, status: 'completed' },
        ),
        1500,
      );

      // Stage 2a — Q&A Generation (in-flight @ 1.6s, complete @ 3.4s)
      emit(
        makeEvent(
          {
            eventId: 'evt-qa-generation-1',
            agentName: qaMeta.agentLabel,
            phase: 'Q&A Generation',
            eventType: 'qgen.qa.generated',
            summary: 'Generated 1 MCQ with 4 distractors grounded in source.',
            icon: 'fa-solid fa-wand-magic-sparkles',
            accentColor: qaMeta.accentColor,
            stage: 1,
            pipelineGroup: 'qa-generation',
            modelId: 'vertex-ai/gemini-2.5-pro',
            badgeText: 'GENERATED',
            badgeVariant: 'info',
          },
          { workflowId, offsetMs: 1600, status: 'in_flight' },
        ),
        1600,
      );
      emit(
        makeEvent(
          {
            eventId: 'evt-qa-generation-1',
            agentName: qaMeta.agentLabel,
            phase: 'Q&A Generation',
            eventType: 'qgen.qa.generated',
            summary: 'Generated 1 MCQ with 4 distractors grounded in source.',
            icon: 'fa-solid fa-wand-magic-sparkles',
            accentColor: qaMeta.accentColor,
            stage: 1,
            pipelineGroup: 'qa-generation',
            modelId: 'vertex-ai/gemini-2.5-pro',
            badgeText: 'GENERATED',
            badgeVariant: 'info',
          },
          { workflowId, offsetMs: 3400, status: 'completed' },
        ),
        3400,
      );

      // Stage 2b — Self-evaluation (in-flight @ 3.5s, complete @ 4.6s)
      emit(
        makeEvent(
          {
            eventId: 'evt-qa-self-eval-1',
            agentName: qaMeta.agentLabel,
            phase: 'Q&A Self-Evaluation',
            eventType: refused
              ? 'qgen.qa.self-evaluation.failed'
              : 'qgen.qa.self-evaluation.complete',
            summary: refused
              ? 'Self-evaluation FAIL: unsupported absolute claim flagged.'
              : 'Self-evaluation PASS: question clear and grounded.',
            icon: 'fa-solid fa-scale-balanced',
            accentColor: '#8b5cf6',
            stage: 2,
            pipelineGroup: 'qa-generation',
            modelId: 'gemini-2.5-flash',
            badgeText: refused ? 'FAIL' : 'PASS',
            badgeVariant: refused ? 'danger' : 'success',
          },
          { workflowId, offsetMs: 3500, status: 'in_flight' },
        ),
        3500,
      );
      emit(
        makeEvent(
          {
            eventId: 'evt-qa-self-eval-1',
            agentName: qaMeta.agentLabel,
            phase: 'Q&A Self-Evaluation',
            eventType: refused
              ? 'qgen.qa.self-evaluation.failed'
              : 'qgen.qa.self-evaluation.complete',
            summary: refused
              ? 'Self-evaluation FAIL: unsupported absolute claim flagged.'
              : 'Self-evaluation PASS: question clear and grounded.',
            icon: 'fa-solid fa-scale-balanced',
            accentColor: '#8b5cf6',
            stage: 2,
            pipelineGroup: 'qa-generation',
            modelId: 'gemini-2.5-flash',
            badgeText: refused ? 'FAIL' : 'PASS',
            badgeVariant: refused ? 'danger' : 'success',
          },
          { workflowId, offsetMs: 4600, status: refused ? 'failed' : 'completed' },
        ),
        4600,
      );

      // Stage 3 — Quality Validation (in-flight @ 4.7s, complete @ 6.5s)
      emit(
        makeEvent(
          {
            eventId: 'evt-quality-validation-1',
            agentName: qvMeta.agentLabel,
            phase: 'Quality Validation',
            eventType: refused
              ? 'qgen.quality-validation.failed'
              : 'qgen.quality-validation.complete',
            summary: refused
              ? 'Quality validation TERMINATE: content policy section 4.2b violated.'
              : 'Quality validation PROCEED: question clear and relevant. Distractors plausible.',
            icon: qvMeta.icon,
            accentColor: qvMeta.accentColor,
            stage: 1,
            pipelineGroup: 'quality-validation',
            modelId: 'vertex-ai/gemini-2.5-pro',
            badgeText: refused ? 'TERMINATE' : 'PROCEED',
            badgeVariant: refused ? 'danger' : 'success',
          },
          { workflowId, offsetMs: 4700, status: 'in_flight' },
        ),
        4700,
      );
      emit(
        makeEvent(
          {
            eventId: 'evt-quality-validation-1',
            agentName: qvMeta.agentLabel,
            phase: 'Quality Validation',
            eventType: refused
              ? 'qgen.quality-validation.failed'
              : 'qgen.quality-validation.complete',
            summary: refused
              ? 'Quality validation TERMINATE: content policy section 4.2b violated.'
              : 'Quality validation PROCEED: question clear and relevant. Distractors plausible.',
            icon: qvMeta.icon,
            accentColor: qvMeta.accentColor,
            stage: 1,
            pipelineGroup: 'quality-validation',
            modelId: 'vertex-ai/gemini-2.5-pro',
            badgeText: refused ? 'TERMINATE' : 'PROCEED',
            badgeVariant: refused ? 'danger' : 'success',
          },
          { workflowId, offsetMs: 6500, status: refused ? 'failed' : 'completed' },
        ),
        6500,
      );

      complete(6600);

      return () => {
        for (const t of timers) clearTimeout(t);
      };
    });
  }

  /**
   * Helper: derive the appropriate refused flag from a prompt string.
   * Matches `AtomAuthoringService.runAiAssist` semantics so the mock trace
   * stays in lockstep with the demo's REFUSED branch.
   */
  isRefusalPrompt(prompt: string): boolean {
    return REFUSED_PROMPT_PATTERN.test(prompt);
  }

  /**
   * Load the canonical trace snapshot for a completed workflow. Used to
   * repopulate the widget on page-load when the underlying generation
   * already finished server-side. Currently returns an empty workflow —
   * wave-2 will wire to a real BFF endpoint.
   */
  loadWorkflow(workflowId: string): Observable<AgentTraceWorkflow> {
    return of<AgentTraceWorkflow>({
      workflowId,
      groups: [],
      status: 'idle',
    });
  }

  /**
   * Convert a BE `pipeline_trace[]` envelope (the qgen crew's per-step trace,
   * incl. the image-gen `render_image` node) into a flat `AgentTraceEvent[]`
   * grouped by the 4 featured IMDA D2 pipeline cards (owner direction
   * 2026-06-25 — feature the FULL crew, not just the LLM agents):
   *   - `validate_input`      → classification-pipeline / Input & Safety (stage 1)
   *   - `guardrail_pre`       → classification-pipeline / Input & Safety (stage 2)
   *   - `generate`            → qa-generation (stage 1)
   *   - `guardrail_post`      → qa-generation (stage 2)
   *   - `critique`            → quality-validation / Critique & Quality Gate (stage 1)
   *   - `quality_gate`        → quality-validation (stage 2)
   *   - `regenerate_rejected` → quality-validation (stage 3)
   *   - `render_image`        → illustration (stage 1)
   *   - `publish_completed` / `publish_refused` → outcome (terminal signal, not a stage)
   *
   * Unknown step names land in the qa-generation group with a synthesised
   * stage so nothing is silently dropped. Status mapping: `ACCEPTED`/
   * `COMPLETED`/`PROCEED` → `completed`, `REJECTED`/`FAILED` → `failed`,
   * anything else → `completed` (every emitted step is already done).
   */
  eventsFromPipelineTrace(
    trace: readonly PipelineTraceStep[],
    opts: { refused?: boolean } = {},
  ): readonly AgentTraceEvent[] {
    const refused = !!opts.refused;
    const events: AgentTraceEvent[] = [];
    let qaStage = 0;
    let otherStage = 0;
    for (const step of trace) {
      const meta = stepToGroupMeta(step.name);
      const group = meta.group;
      // Only the terminal outbox steps (publish_completed / publish_refused)
      // return a null group — their outcome rides the card terminal signal, so
      // they aren't rendered as a crew stage. Every other step is featured.
      if (group === null) continue;
      const stage = meta.stage ??
        (group === 'qa-generation' ? ++qaStage : ++otherStage);
      const pipelineMeta = PIPELINE_META[group];
      const eventStatus = mapTraceStepStatus(step.status, refused, group);
      const badge = mapTraceStepBadge(step.status, refused, group, step.name);
      const summary = buildTraceStepSummary(step);
      events.push({
        eventId: `evt-${step.name}-${stage}`,
        workflowId: 'live',
        agentName: pipelineMeta.agentLabel,
        phase: humaniseStepName(step.name),
        eventType: `qgen.${step.name}.${eventStatus}`,
        summary,
        timestamp: step.completed_at ?? step.started_at ?? new Date().toISOString(),
        icon: pipelineMeta.icon,
        accentColor: pipelineMeta.accentColor,
        badgeText: badge.text,
        badgeVariant: badge.variant,
        stage,
        pipelineGroup: group,
        modelId: resolveStepModelId(step) ?? undefined,
        status: eventStatus,
      });
    }
    return events;
  }

  /** Compute the terminal signal for a finished group of events. */
  deriveTerminalSignal(events: readonly AgentTraceEvent[]): TerminalSignal | undefined {
    for (const evt of [...events].reverse()) {
      if (evt.badgeText === 'TERMINATE' || evt.badgeText === 'FAIL') {
        return {
          status: 'TERMINATE',
          reasonCode: 'VALIDATION_FAILED',
          message: 'Validation failed',
        };
      }
      if (evt.badgeText === 'PROCEED_WITH_WARNINGS') {
        return {
          status: 'PROCEED_WITH_WARNINGS',
          reasonCode: 'VALIDATION_PASSED_WITH_WARNINGS',
          message: 'Validated with warnings',
        };
      }
      if (
        evt.badgeText === 'PROCEED' ||
        evt.badgeText === 'PASS' ||
        evt.badgeText === 'ALIGNED' ||
        evt.badgeText === 'GENERATED'
      ) {
        return {
          status: 'PROCEED',
          reasonCode: 'VALIDATION_PASSED',
          message: 'All checks passed',
        };
      }
    }
    return undefined;
  }
}

// ═════════════════════════════════════════════════════════════════════
// Module-scoped helpers for `eventsFromPipelineTrace` — kept pure so
// the conversion is unit-testable without spinning up a TestBed.
// ═════════════════════════════════════════════════════════════════════

/**
 * Map a BE step name to its featured group + stage. Per owner direction
 * 2026-06-25 the trace FEATURES THE FULL CREW (reversing the 2026-05-17
 * LLM-only curation): every meaningful crew step lands in one of the four
 * cards — Input & Safety → Q&A Generation → Critique & Quality Gate →
 * Illustration. The terminal outbox steps (publish_completed / publish_refused)
 * are NOT crew stages; their outcome rides the card terminal signal, so they
 * map to null. Genuinely unknown future step names fall into Q&A Generation
 * with a caller-assigned monotonic stage so nothing is silently dropped.
 */
function stepToGroupMeta(name: string): {
  group: PipelineGroup | null;
  stage: number | null;
} {
  switch (name) {
    case 'validate_input':
      return { group: 'classification-pipeline', stage: 1 };
    case 'guardrail_pre':
      return { group: 'classification-pipeline', stage: 2 };
    case 'generate':
      // qgen_question agent → Q&A Generation card.
      return { group: 'qa-generation', stage: 1 };
    case 'guardrail_post':
      return { group: 'qa-generation', stage: 2 };
    case 'critique':
      // qgen_critic agent → Critique & Quality Gate card (stays
      // 'quality-validation' ID for backward-compat).
      return { group: 'quality-validation', stage: 1 };
    case 'quality_gate':
      return { group: 'quality-validation', stage: 2 };
    case 'regenerate_rejected':
      return { group: 'quality-validation', stage: 3 };
    case 'render_image':
      // The image-generation node (Kroki / model-gateway Imagen) — was
      // silently dropped before 2026-06-25; now its own Illustration card.
      return { group: 'illustration', stage: 1 };
    case 'publish_completed':
    case 'publish_refused':
      // Outbox publish — the pipeline OUTCOME, surfaced as the card terminal
      // signal rather than a crew stage. Not dropped from the raw trace JSON.
      return { group: null, stage: null };
    default:
      // Unknown / future crew step — feature it (no silent drop) in the Q&A
      // Generation card with a monotonic stage assigned by the caller.
      return { group: 'qa-generation', stage: null };
  }
}

/** Map a BE step `status` string to the widget's tri-state. */
function mapTraceStepStatus(
  status: string,
  refused: boolean,
  group: PipelineGroup,
): AgentTraceEvent['status'] {
  const upper = status.toUpperCase();
  if (upper === 'REJECTED' || upper === 'FAILED') return 'failed';
  if (upper === 'ACCEPTED' || upper === 'COMPLETED' || upper === 'PROCEED') {
    // On refused runs, the critique-agent group still shows a failed
    // terminal pill even when individual steps succeeded.
    if (refused && group === 'quality-validation') return 'failed';
    return 'completed';
  }
  // Default → 'completed' (not 'in_flight'): every BE _append_trace
  // call writes both started_at + completed_at, so any step we receive
  // in the pipeline_trace[] is by definition done. The pre-2026-05-17
  // `in_flight` default caused a permanent spinner on the last card
  // whenever BE emitted a non-canonical status (e.g. QUALITY_WARNING).
  return 'completed';
}

/**
 * Map a BE step `status` string to the widget's badge text/variant.
 * Refused runs carry a TERMINATE marker on the quality-validation
 * publish step so the user sees the same red-pill UX the legacy
 * gatekeeper modal flow had.
 */
function mapTraceStepBadge(
  status: string,
  refused: boolean,
  group: PipelineGroup,
  stepName: string,
): { text: string; variant: 'success' | 'warning' | 'danger' | 'info' } {
  const upper = status.toUpperCase();
  if (upper === 'REJECTED' || upper === 'FAILED') {
    return { text: 'FAIL', variant: 'danger' };
  }
  if (refused && group === 'quality-validation' && stepName === 'publish_completed') {
    return { text: 'TERMINATE', variant: 'danger' };
  }
  // Image render — a partial / over-cap render is a WARNING, not a failure.
  if (stepName === 'render_image') {
    if (upper === 'DEGRADED' || upper === 'WARNING') {
      return { text: 'DEGRADED', variant: 'warning' };
    }
    return { text: 'RENDERED', variant: 'info' };
  }
  if (stepName === 'regenerate_rejected') {
    return { text: 'RETRY', variant: 'info' };
  }
  // A non-terminal warning status on any step (e.g. quality_gate QUALITY_WARNING).
  if (upper === 'WARNING' || upper === 'DEGRADED') {
    return { text: upper, variant: 'warning' };
  }
  if (upper === 'ACCEPTED') {
    if (stepName === 'guardrail_pre' || stepName === 'guardrail_post') {
      return { text: 'ALIGNED', variant: 'success' };
    }
    if (stepName === 'critique' || stepName === 'quality_gate') {
      return { text: 'PASS', variant: 'success' };
    }
    if (stepName === 'validate_input') {
      return { text: 'VALID', variant: 'success' };
    }
    return { text: 'PROCEED', variant: 'success' };
  }
  if (upper === 'COMPLETED') {
    if (stepName === 'generate') return { text: 'GENERATED', variant: 'info' };
    if (stepName === 'validate_input') return { text: 'VALID', variant: 'success' };
    if (stepName === 'guardrail_pre' || stepName === 'guardrail_post') {
      return { text: 'ALIGNED', variant: 'success' };
    }
    return { text: 'PROCEED', variant: 'success' };
  }
  return { text: upper, variant: 'info' };
}

/**
 * Map a BE pipeline_trace step to the model that actually executed it.
 *
 * Today (2026-05-17) BE does NOT populate `engine_resource` on any step —
 * the field is defined in qgen_crew.py:_append_trace() but no node
 * currently passes it (default ""). So we synthesise from `step.name`
 * against the real orchestrator wiring at
 * services/chora-ai-kernel-orchestrator/.../qgen_crew.py:
 *
 *   - generate           → qgen_question (Vertex AI Reasoning Engine
 *                          wrapping Gemini 2.5 Pro)
 *   - critique           → qgen_critic   (Vertex AI Reasoning Engine
 *                          wrapping Gemini 2.5 Flash)
 *   - guardrail_pre|post → Cloud Model Armor (regional REST endpoint
 *                          per ADR-152 + c45cd424)
 *   - validate_input     → Python input validation (no LLM call)
 *   - quality_gate       → Python check (no LLM call)
 *   - publish_completed  → Outbox publish to chora.creation.ai_assist.
 *                          completed.v1 (no LLM call)
 *
 * When BE starts populating `engine_resource`, it takes precedence
 * (graceful upgrade — no FE redeploy needed for new engines).
 *
 * Steps with no LLM return `null` → template `@if (event.modelId)`
 * skips the pill, so demos no longer falsely attribute non-LLM steps
 * to Vertex Gemini.
 *
 * Post-demo debt: rename / restructure the "Classification Agent"
 * group (currently maps validate_input + guardrail_pre, neither of
 * which is an LLM classifier). See FE-DEBT-TRACE-WIDGET-STATIC-UI.
 */
function resolveStepModelId(step: PipelineTraceStep): string | null {
  if (step.engine_resource) return step.engine_resource;
  switch (step.name) {
    case 'generate':
      return 'vertex-ai/gemini-2.5-pro';
    case 'critique':
      // Both qgen_question + qgen_critic are Vertex AI Reasoning
      // Engines; pill format kept consistent ("Vtx G-2.5 …") per user
      // direction 2026-05-17.
      return 'vertex-ai/gemini-2.5-flash';
    case 'guardrail_pre':
    case 'guardrail_post':
      return 'cloud-model-armor';
    case 'validate_input':
    case 'quality_gate':
    case 'regenerate_rejected':
    case 'render_image':
    case 'publish_completed':
    case 'publish_refused':
      // Python aggregation / retry routing / image render (Kroki or
      // model-gateway Imagen — not a single LLM) / outbox publish: no single
      // model pill unless BE populates engine_resource (handled above).
      return null;
    default:
      return null;
  }
}

/**
 * Compose a short summary line for the widget from a BE step. Picks
 * the most useful per-step detail (attempt counter, token counts,
 * inline notes) so the widget tile isn't empty.
 */
function buildTraceStepSummary(step: PipelineTraceStep): string {
  const parts: string[] = [];
  if (step.notes) parts.push(step.notes);
  if (step.attempt != null && step.attempt > 0) {
    parts.push(`attempt ${step.attempt}`);
  }
  if (step.input_tokens != null && step.input_tokens > 0) {
    parts.push(`${step.input_tokens} in`);
  }
  if (step.output_tokens != null && step.output_tokens > 0) {
    parts.push(`${step.output_tokens} out`);
  }
  if (parts.length === 0) {
    return `${humaniseStepName(step.name)}: ${step.status}`;
  }
  return parts.join(' · ');
}

/** Convert `guardrail_pre` → "Guardrail (pre)" etc. for the phase label. */
function humaniseStepName(name: string): string {
  return name
    .split('_')
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' ');
}
