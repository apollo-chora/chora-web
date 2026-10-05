import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { AgentTraceService } from './agent-trace.service';
import type { PipelineTraceStep } from './atom-authoring.model';

describe('AgentTraceService', () => {
  let service: AgentTraceService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AgentTraceService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects refusal-trigger prompts', () => {
    expect(service.isRefusalPrompt('Teams naturally excel at delivery')).toBe(true);
    expect(service.isRefusalPrompt('bias detection prompt')).toBe(true);
    expect(service.isRefusalPrompt('Generate 5 MCQs on Sprint Planning')).toBe(false);
  });

  it('emits the 3-pipeline approved stream with in_flight then completed events', () => {
    const events: { eventId: string; status: string; pipelineGroup: string }[] = [];
    const sub = service
      .observeWorkflow('wf-1')
      .subscribe((e) =>
        events.push({
          eventId: e.eventId,
          status: e.status,
          pipelineGroup: e.pipelineGroup,
        }),
      );

    // Advance past every emission window.
    vi.advanceTimersByTime(6700);

    // Classification: 1 in-flight + 1 completed; Q&A: 2 in-flight + 2 completed;
    // Quality Validation: 1 in-flight + 1 completed = 8 total.
    expect(events.length).toBe(8);
    const inFlight = events.filter((e) => e.status === 'in_flight');
    const completed = events.filter((e) => e.status === 'completed');
    expect(inFlight.length).toBe(4);
    expect(completed.length).toBe(4);

    const pipelineGroups = new Set(events.map((e) => e.pipelineGroup));
    expect(pipelineGroups).toEqual(
      new Set(['classification-pipeline', 'qa-generation', 'quality-validation']),
    );

    sub.unsubscribe();
  });

  it('emits the refused stream with a FAIL terminal event', () => {
    const events: { eventId: string; status: string; badgeText?: string }[] = [];
    const sub = service
      .observeWorkflow('wf-2', { refused: true })
      .subscribe((e) =>
        events.push({ eventId: e.eventId, status: e.status, badgeText: e.badgeText }),
      );

    vi.advanceTimersByTime(6700);

    const finalQv = [...events]
      .reverse()
      .find((e) => e.eventId === 'evt-quality-validation-1' && e.status === 'failed');
    expect(finalQv).toBeDefined();
    expect(finalQv?.badgeText).toBe('TERMINATE');

    sub.unsubscribe();
  });

  it('derives PROCEED terminal signal from PASS-bearing events', () => {
    const sig = service.deriveTerminalSignal([
      {
        eventId: 'a',
        workflowId: 'w',
        agentName: 'X',
        phase: 'p',
        eventType: 'qgen.qa.generated',
        summary: 's',
        timestamp: '2026-05-13T00:00:00Z',
        icon: 'fa',
        accentColor: '#000',
        stage: 1,
        pipelineGroup: 'qa-generation',
        status: 'completed',
        badgeText: 'PASS',
      },
    ]);
    expect(sig?.status).toBe('PROCEED');
  });

  it('derives TERMINATE terminal signal from TERMINATE badge', () => {
    const sig = service.deriveTerminalSignal([
      {
        eventId: 'a',
        workflowId: 'w',
        agentName: 'X',
        phase: 'p',
        eventType: 'qgen.quality-validation.failed',
        summary: 's',
        timestamp: '2026-05-13T00:00:00Z',
        icon: 'fa',
        accentColor: '#000',
        stage: 1,
        pipelineGroup: 'quality-validation',
        status: 'failed',
        badgeText: 'TERMINATE',
      },
    ]);
    expect(sig?.status).toBe('TERMINATE');
  });

  it('loadWorkflow returns an idle snapshot for the v1 mock', () => {
    const subscription = service.loadWorkflow('wf-3').subscribe((wf) => {
      expect(wf.workflowId).toBe('wf-3');
      expect(wf.status).toBe('idle');
      expect(wf.groups).toEqual([]);
    });
    subscription.unsubscribe();
  });

  describe('eventsFromPipelineTrace — BE async wire mapping', () => {
    // Owner direction 2026-06-25: the widget now FEATURES THE FULL CREW
    // (reversing the 2026-05-17 LLM-only curation). Every meaningful crew step
    // lands in one of the four cards (Input & Safety / Q&A Generation /
    // Critique & Quality Gate / Illustration). Only the terminal outbox steps
    // (publish_completed / publish_refused) are not rendered as crew stages —
    // their outcome rides the card terminal signal.
    const FULL_TRACE: PipelineTraceStep[] = [
      { name: 'validate_input', status: 'ACCEPTED' },
      { name: 'guardrail_pre', status: 'ACCEPTED', notes: 'armor:allow' },
      { name: 'generate', status: 'COMPLETED', attempt: 1, input_tokens: 1031 },
      { name: 'guardrail_post', status: 'ACCEPTED' },
      { name: 'critique', status: 'ACCEPTED', attempt: 1 },
      { name: 'quality_gate', status: 'ACCEPTED' },
      { name: 'publish_completed', status: 'COMPLETED' },
    ];

    it('features the full crew across the four cards (only outbox publish dropped)', () => {
      const events = service.eventsFromPipelineTrace(FULL_TRACE);
      // 6 of 7 featured — publish_completed is the terminal outbox step.
      expect(events.length).toBe(6);
      const groups = new Set(events.map((e) => e.pipelineGroup));
      expect(groups).toEqual(
        new Set(['classification-pipeline', 'qa-generation', 'quality-validation']),
      );
    });

    it('features validate_input + guardrail_pre in the Input & Safety card', () => {
      const events = service.eventsFromPipelineTrace(FULL_TRACE);
      const input = events.filter((e) => e.pipelineGroup === 'classification-pipeline');
      expect(input.map((e) => e.stage).sort()).toEqual([1, 2]);
    });

    it('features generate (stage 1) + guardrail_post (stage 2) in the Q&A Generation card', () => {
      const events = service.eventsFromPipelineTrace(FULL_TRACE);
      const qa = events.filter((e) => e.pipelineGroup === 'qa-generation');
      expect(qa.length).toBe(2);
      const generate = qa.find((e) => e.eventType.includes('generate'));
      expect(generate?.stage).toBe(1);
    });

    it('features critique (stage 1) + quality_gate (stage 2) in the Critique & Quality Gate card', () => {
      const events = service.eventsFromPipelineTrace(FULL_TRACE);
      const qv = events.filter((e) => e.pipelineGroup === 'quality-validation');
      expect(qv.length).toBe(2);
      const critique = qv.find((e) => e.eventType.includes('critique'));
      expect(critique?.stage).toBe(1);
    });

    it('features render_image in its own Illustration card (the image-gen gap)', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'generate', status: 'COMPLETED' },
        { name: 'render_image', status: 'COMPLETED', notes: '2 images rendered' },
      ]);
      const illustration = events.filter((e) => e.pipelineGroup === 'illustration');
      expect(illustration.length).toBe(1);
      expect(illustration[0]?.badgeText).toBe('RENDERED');
    });

    it('marks a degraded image render with a DEGRADED warning badge', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'render_image', status: 'DEGRADED' },
      ]);
      const illustration = events.find((e) => e.pipelineGroup === 'illustration');
      expect(illustration?.badgeText).toBe('DEGRADED');
      expect(illustration?.badgeVariant).toBe('warning');
    });

    it('marks COMPLETED steps with status=completed (non-refused run)', () => {
      const events = service.eventsFromPipelineTrace(FULL_TRACE);
      expect(events.every((e) => e.status === 'completed')).toBe(true);
    });

    it('flags the quality-validation (critique) step as failed on refused', () => {
      // Non-LLM steps (validate_input / guardrail_pre / publish_completed)
      // are suppressed; the refused-run terminal pill rides on the
      // critique-agent group per `mapTraceStepStatus()`.
      const refusedTrace: PipelineTraceStep[] = [
        { name: 'generate', status: 'COMPLETED', attempt: 1 },
        { name: 'critique', status: 'ACCEPTED', attempt: 1 },
      ];
      const events = service.eventsFromPipelineTrace(refusedTrace, { refused: true });
      const critique = events.find((e) => e.pipelineGroup === 'quality-validation');
      expect(critique?.status).toBe('failed');
    });

    it('emits FAIL badge on REJECTED critique step', () => {
      // Guardrail steps are suppressed; use the LLM critique step to
      // exercise the FAIL path.
      const trace: PipelineTraceStep[] = [
        { name: 'critique', status: 'REJECTED', notes: 'unsupported claim' },
      ];
      const events = service.eventsFromPipelineTrace(trace);
      expect(events[0]?.badgeText).toBe('FAIL');
      expect(events[0]?.status).toBe('failed');
    });

    it('emits GENERATED badge on completed generate step', () => {
      const trace: PipelineTraceStep[] = [
        { name: 'generate', status: 'COMPLETED', attempt: 1 },
      ];
      const events = service.eventsFromPipelineTrace(trace);
      expect(events[0]?.badgeText).toBe('GENERATED');
    });

    it('composes a summary line from attempt + token counts when present', () => {
      const trace: PipelineTraceStep[] = [
        { name: 'generate', status: 'COMPLETED', attempt: 1, input_tokens: 1031, output_tokens: 320 },
      ];
      const events = service.eventsFromPipelineTrace(trace);
      expect(events[0]?.summary).toContain('attempt 1');
      expect(events[0]?.summary).toContain('1031');
      expect(events[0]?.summary).toContain('320');
    });

    it('falls back to humanised step name when no detail fields are populated', () => {
      // Use `critique` (a rendered LLM step) — `guardrail_pre` is
      // suppressed by `stepToGroupMeta()` and would never reach the
      // widget.
      const trace: PipelineTraceStep[] = [
        { name: 'critique', status: 'ACCEPTED' },
      ];
      const events = service.eventsFromPipelineTrace(trace);
      expect(events[0]?.summary).toContain('Critique');
    });

    it('returns an empty array for an empty trace', () => {
      const events = service.eventsFromPipelineTrace([]);
      expect(events.length).toBe(0);
    });

    it('features the non-LLM crew steps and drops only the terminal outbox publish', () => {
      const trace: PipelineTraceStep[] = [
        { name: 'validate_input', status: 'ACCEPTED' },
        { name: 'guardrail_pre', status: 'ACCEPTED' },
        { name: 'guardrail_post', status: 'ACCEPTED' },
        { name: 'quality_gate', status: 'ACCEPTED' },
        { name: 'publish_completed', status: 'COMPLETED' },
      ];
      const events = service.eventsFromPipelineTrace(trace);
      // validate_input + guardrail_pre/post + quality_gate are featured; only
      // publish_completed (terminal outbox) is dropped.
      expect(events.length).toBe(4);
      expect(events.some((e) => e.eventType.includes('publish_completed'))).toBe(false);
    });

    it('features an unknown step name in the Q&A Generation card (no silent drop)', () => {
      const trace: PipelineTraceStep[] = [
        { name: 'totally_unknown_step', status: 'ACCEPTED' },
        { name: 'generate', status: 'COMPLETED' },
      ];
      const events = service.eventsFromPipelineTrace(trace);
      // Both survive — the unknown step lands in qa-generation (fallback).
      expect(events.length).toBe(2);
      expect(events.every((e) => e.pipelineGroup === 'qa-generation')).toBe(true);
    });

    it('synthesises the qgen model id for the generate step', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'generate', status: 'COMPLETED' },
      ]);
      expect(events[0]?.modelId).toBe('vertex-ai/gemini-2.5-pro');
    });

    it('synthesises the critic model id for the critique step', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'critique', status: 'ACCEPTED' },
      ]);
      expect(events[0]?.modelId).toBe('vertex-ai/gemini-2.5-flash');
    });

    it('prefers the BE engine_resource over the synthesised model id when present', () => {
      const events = service.eventsFromPipelineTrace([
        {
          name: 'generate',
          status: 'COMPLETED',
          engine_resource:
            'projects/chora-489812/locations/us-central1/reasoningEngines/123',
        },
      ]);
      expect(events[0]?.modelId).toBe(
        'projects/chora-489812/locations/us-central1/reasoningEngines/123',
      );
    });

    it('uses completed_at as the event timestamp when present', () => {
      const events = service.eventsFromPipelineTrace([
        {
          name: 'generate',
          status: 'COMPLETED',
          started_at: '2026-05-17T00:00:00Z',
          completed_at: '2026-05-17T00:00:05Z',
        },
      ]);
      expect(events[0]?.timestamp).toBe('2026-05-17T00:00:05Z');
    });

    it('falls back to started_at when completed_at is absent', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'generate', status: 'COMPLETED', started_at: '2026-05-17T00:00:00Z' },
      ]);
      expect(events[0]?.timestamp).toBe('2026-05-17T00:00:00Z');
    });

    it('synthesises a current timestamp when neither started_at nor completed_at is present', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'generate', status: 'COMPLETED' },
      ]);
      // Falls through to `new Date().toISOString()` — assert it parses.
      expect(Number.isNaN(Date.parse(events[0]!.timestamp))).toBe(false);
    });

    it('builds the eventType from step name + derived status', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'generate', status: 'COMPLETED' },
      ]);
      expect(events[0]?.eventType).toBe('qgen.generate.completed');
    });

    it('humanises the multi-word step name into the phase label', () => {
      // `critique` is a rendered LLM step; assert the single-word humanise.
      const events = service.eventsFromPipelineTrace([
        { name: 'critique', status: 'ACCEPTED' },
      ]);
      expect(events[0]?.phase).toBe('Critique');
    });

    it('composes a summary from notes alone when no counters are present', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'critique', status: 'ACCEPTED', notes: 'looks sound' },
      ]);
      expect(events[0]?.summary).toBe('looks sound');
    });

    it('treats a non-canonical BE status as completed (no permanent spinner)', () => {
      // QUALITY_WARNING is neither REJECTED/FAILED nor ACCEPTED/COMPLETED.
      const events = service.eventsFromPipelineTrace([
        { name: 'generate', status: 'QUALITY_WARNING' },
      ]);
      expect(events[0]?.status).toBe('completed');
      // Badge falls through to the default branch: upper-cased text + info.
      expect(events[0]?.badgeText).toBe('QUALITY_WARNING');
      expect(events[0]?.badgeVariant).toBe('info');
      // eventType reflects the derived (completed) status, not the raw one.
      expect(events[0]?.eventType).toBe('qgen.generate.completed');
    });

    it('maps an ACCEPTED critique step to a PASS badge', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'critique', status: 'ACCEPTED' },
      ]);
      expect(events[0]?.badgeText).toBe('PASS');
      expect(events[0]?.badgeVariant).toBe('success');
      expect(events[0]?.status).toBe('completed');
    });

    it('keeps a non-refused critique COMPLETED (not failed)', () => {
      const events = service.eventsFromPipelineTrace([
        { name: 'critique', status: 'COMPLETED' },
      ]);
      const critique = events.find((e) => e.pipelineGroup === 'quality-validation');
      expect(critique?.status).toBe('completed');
      // COMPLETED + non-guardrail/critique-special → PROCEED.
      expect(critique?.badgeText).toBe('PROCEED');
    });

    it('treats a PROCEED BE status on the generate step as completed', () => {
      // Exercises the `upper === 'PROCEED'` operand of the
      // `mapTraceStepStatus` ACCEPTED/COMPLETED/PROCEED guard on a
      // reachable (non-suppressed) step. `generate` is not in the
      // refused-quality-validation special-case, so it stays completed.
      const events = service.eventsFromPipelineTrace([
        { name: 'generate', status: 'PROCEED' },
      ]);
      expect(events[0]?.status).toBe('completed');
      // PROCEED is neither REJECTED/FAILED, nor ACCEPTED, nor COMPLETED in
      // `mapTraceStepBadge`, so it falls through to the default upper/info.
      expect(events[0]?.badgeText).toBe('PROCEED');
      expect(events[0]?.badgeVariant).toBe('info');
    });

    it('keeps a refused generate step completed (only quality-validation flips to failed)', () => {
      // `mapTraceStepStatus` only flips ACCEPTED/COMPLETED to failed for
      // the quality-validation group on refused runs — the generate
      // (qa-generation) step must stay completed even under refused.
      const events = service.eventsFromPipelineTrace(
        [{ name: 'generate', status: 'COMPLETED' }],
        { refused: true },
      );
      const gen = events.find((e) => e.pipelineGroup === 'qa-generation');
      expect(gen?.status).toBe('completed');
    });

    it('marks a FAILED critique step as failed regardless of refused flag', () => {
      // REJECTED/FAILED short-circuits before the refused special-case in
      // both `mapTraceStepStatus` and `mapTraceStepBadge`.
      const events = service.eventsFromPipelineTrace(
        [{ name: 'critique', status: 'FAILED' }],
        { refused: false },
      );
      expect(events[0]?.status).toBe('failed');
      expect(events[0]?.badgeText).toBe('FAIL');
      expect(events[0]?.badgeVariant).toBe('danger');
    });

    it('defaults the opts arg (no refused) when called with a single argument', () => {
      // Exercises the `opts: { refused?: boolean } = {}` default-parameter
      // and the `!!opts.refused` → false path without an explicit opts.
      const events = service.eventsFromPipelineTrace([
        { name: 'critique', status: 'ACCEPTED' },
      ]);
      // Non-refused critique stays completed (not the refused-failed path).
      expect(events[0]?.status).toBe('completed');
      expect(events[0]?.badgeText).toBe('PASS');
    });

    it('emits a stable monotonic stage for repeated qa-generation steps', () => {
      // Two `generate` steps both map to qa-generation stage 1 via
      // `stepToGroupMeta` (which pins stage=1) — assert both land in the
      // qa-generation group with the pinned stage.
      const events = service.eventsFromPipelineTrace([
        { name: 'generate', status: 'COMPLETED' },
        { name: 'generate', status: 'COMPLETED' },
      ]);
      expect(events.length).toBe(2);
      expect(events.every((e) => e.pipelineGroup === 'qa-generation')).toBe(true);
      expect(events.every((e) => e.stage === 1)).toBe(true);
      // eventId encodes step name + stage.
      expect(events[0]?.eventId).toBe('evt-generate-1');
    });
  });

  describe('deriveTerminalSignal — badge → terminal mapping', () => {
    const baseEvent = (badgeText: string): import('./agent-trace.model').AgentTraceEvent => ({
      eventId: 'e',
      workflowId: 'w',
      agentName: 'X',
      phase: 'p',
      eventType: 't',
      summary: 's',
      timestamp: '2026-05-17T00:00:00Z',
      icon: 'fa',
      accentColor: '#000',
      stage: 1,
      pipelineGroup: 'quality-validation',
      status: 'completed',
      badgeText,
    });

    it('returns TERMINATE for a FAIL badge', () => {
      const sig = service.deriveTerminalSignal([baseEvent('FAIL')]);
      expect(sig?.status).toBe('TERMINATE');
      expect(sig?.reasonCode).toBe('VALIDATION_FAILED');
      expect(sig?.message).toBe('Validation failed');
    });

    it('returns PROCEED_WITH_WARNINGS for that badge', () => {
      const sig = service.deriveTerminalSignal([baseEvent('PROCEED_WITH_WARNINGS')]);
      expect(sig?.status).toBe('PROCEED_WITH_WARNINGS');
      expect(sig?.reasonCode).toBe('VALIDATION_PASSED_WITH_WARNINGS');
      expect(sig?.message).toBe('Validated with warnings');
    });

    it('returns PROCEED for an ALIGNED badge', () => {
      const sig = service.deriveTerminalSignal([baseEvent('ALIGNED')]);
      expect(sig?.status).toBe('PROCEED');
      expect(sig?.reasonCode).toBe('VALIDATION_PASSED');
    });

    it('returns PROCEED for a GENERATED badge', () => {
      const sig = service.deriveTerminalSignal([baseEvent('GENERATED')]);
      expect(sig?.status).toBe('PROCEED');
    });

    it('returns PROCEED for a PROCEED badge', () => {
      const sig = service.deriveTerminalSignal([baseEvent('PROCEED')]);
      expect(sig?.status).toBe('PROCEED');
    });

    it('returns undefined when no event carries a recognised badge', () => {
      const sig = service.deriveTerminalSignal([baseEvent('SOMETHING_ELSE')]);
      expect(sig).toBeUndefined();
    });

    it('returns undefined for an empty event list', () => {
      expect(service.deriveTerminalSignal([])).toBeUndefined();
    });

    it('scans from the last event backwards (TERMINATE wins over an earlier PASS)', () => {
      const sig = service.deriveTerminalSignal([
        baseEvent('PASS'),
        baseEvent('TERMINATE'),
      ]);
      expect(sig?.status).toBe('TERMINATE');
    });
  });

  describe('observeWorkflow — refused stream details', () => {
    it('marks the qa self-evaluation completed event as failed on a refused run', () => {
      const events: { eventId: string; status: string; badgeText?: string }[] = [];
      const sub = service
        .observeWorkflow('wf-refused', { refused: true })
        .subscribe((e) =>
          events.push({ eventId: e.eventId, status: e.status, badgeText: e.badgeText }),
        );

      vi.advanceTimersByTime(6700);

      const selfEvalFailed = [...events]
        .reverse()
        .find((e) => e.eventId === 'evt-qa-self-eval-1' && e.status === 'failed');
      expect(selfEvalFailed).toBeDefined();
      expect(selfEvalFailed?.badgeText).toBe('FAIL');

      sub.unsubscribe();
    });

    it('completes the observable after the final emission window', () => {
      let completed = false;
      const sub = service
        .observeWorkflow('wf-complete')
        .subscribe({ complete: () => (completed = true) });

      vi.advanceTimersByTime(6700);
      expect(completed).toBe(true);

      sub.unsubscribe();
    });

    it('emits nothing and does not throw when unsubscribed before any timer fires', () => {
      const events: string[] = [];
      const sub = service
        .observeWorkflow('wf-early-unsub')
        .subscribe((e) => events.push(e.eventId));
      // Tear down before advancing — exercises the teardown clearTimeout path.
      sub.unsubscribe();
      vi.advanceTimersByTime(6700);
      expect(events.length).toBe(0);
    });
  });
});
