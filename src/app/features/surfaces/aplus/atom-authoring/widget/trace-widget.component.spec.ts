import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { TraceWidgetComponent } from './trace-widget.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import type { PipelineTraceStep } from '../atom-authoring.model';

/**
 * Trace widget specs — rewired 2026-05-17 from the legacy mock-subscription
 * `workflowId` input to the new `pipelineTrace` input fed by the async
 * AI-Assist envelope (Step 4c per
 * `docs/m13/handoff-mcq-ai-assist-be-ready-2026-05-17.md` §2). Static
 * fixtures replace the timed-emission mock — no fake-timer drain needed.
 */
const FULL_TRACE: PipelineTraceStep[] = [
  { name: 'validate_input', status: 'ACCEPTED', completed_at: '2026-05-17T11:00:00.000Z' },
  { name: 'guardrail_pre', status: 'ACCEPTED', notes: 'armor:allow', completed_at: '2026-05-17T11:00:01.000Z' },
  { name: 'generate', status: 'COMPLETED', attempt: 1, input_tokens: 1031, output_tokens: 320, completed_at: '2026-05-17T11:00:02.000Z' },
  { name: 'guardrail_post', status: 'ACCEPTED', completed_at: '2026-05-17T11:00:03.000Z' },
  { name: 'critique', status: 'ACCEPTED', attempt: 1, completed_at: '2026-05-17T11:00:04.000Z' },
  { name: 'quality_gate', status: 'ACCEPTED', completed_at: '2026-05-17T11:00:05.000Z' },
  { name: 'publish_completed', status: 'COMPLETED', completed_at: '2026-05-17T11:00:06.000Z' },
];

function setup(): {
  fixture: ReturnType<typeof TestBed.createComponent<TraceWidgetComponent>>;
  el: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [TraceWidgetComponent],
    providers: [provideHttpClient(), TranslateService],
  });
  const fixture = TestBed.createComponent(TraceWidgetComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('TraceWidgetComponent (prompt-level QGen trace)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders empty state when no pipelineTrace is bound', () => {
    const { el } = setup();
    expect(el.querySelector('[data-testid="aplus-trace-widget"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="aplus-trace-widget-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="aplus-trace-widget-groups"]')).toBeNull();
  });

  it('features the full crew — Input & Safety + Q&A Generation + Critique & Quality Gate cards all render', () => {
    // Owner direction 2026-06-25 — the widget now features EVERY crew step.
    // FULL_TRACE has no render_image, so the Illustration card is absent.
    const { fixture, el } = setup();
    fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
    fixture.detectChanges();

    expect(
      el.querySelector('[data-testid="aplus-trace-group-classification-pipeline"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-trace-group-qa-generation"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-trace-group-quality-validation"]'),
    ).not.toBeNull();
    // No image was generated → the Illustration card does not render.
    expect(
      el.querySelector('[data-testid="aplus-trace-group-illustration"]'),
    ).toBeNull();
  });

  it('renders an Illustration card with a RENDERED stage when an image was generated', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('pipelineTrace', [
      { name: 'generate', status: 'COMPLETED' },
      { name: 'render_image', status: 'COMPLETED', notes: '2 images rendered' },
    ]);
    fixture.detectChanges();
    const illustration = el.querySelector(
      '[data-testid="aplus-trace-group-illustration"]',
    );
    expect(illustration).not.toBeNull();
    expect(illustration?.textContent).toContain('Illustration');
  });

  it('Q&A Generation card holds generate + the output safety screen, not critique', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
    fixture.detectChanges();

    const qaEvents = el.querySelector(
      '[data-testid="aplus-trace-events-qa-generation"]',
    );
    expect(qaEvents?.textContent ?? '').toMatch(/Generate/i);
    expect(qaEvents?.textContent ?? '').toMatch(/Safety screen/i);
    // Critique stage belongs to the Critique & Quality Gate card, not here.
    expect(qaEvents?.textContent ?? '').not.toMatch(/Critique/i);
  });

  it('Critique & Quality Gate card shows its label and holds the critique + quality-gate stages', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
    fixture.detectChanges();

    const qvGroup = el.querySelector(
      '[data-testid="aplus-trace-group-quality-validation"]',
    );
    expect(qvGroup?.textContent).toContain('Critique & Quality Gate');
    expect(qvGroup?.textContent ?? '').not.toContain('Evaluator');
    const qvEvents = el.querySelector(
      '[data-testid="aplus-trace-events-quality-validation"]',
    );
    expect(qvEvents?.textContent ?? '').toMatch(/Critique/i);
    expect(qvEvents?.textContent ?? '').toMatch(/Quality gate/i);
  });

  it('toggles the qa-generation group via the chevron button', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
    fixture.detectChanges();

    const button = el.querySelector(
      '[data-testid="aplus-trace-group-qa-generation"]',
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(
      el.querySelector('[data-testid="aplus-trace-events-qa-generation"]'),
    ).not.toBeNull();

    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(
      el.querySelector('[data-testid="aplus-trace-events-qa-generation"]'),
    ).toBeNull();
  });

  it('features an input-stage refusal in the Input & Safety card (guardrail_pre rejected)', () => {
    // Owner direction 2026-06-25 — the refusal is now VISIBLE in the trace:
    // a guardrail_pre rejection renders the Input & Safety card with a failed
    // guardrail stage (publish_refused is the terminal outbox, not a stage).
    const { fixture, el } = setup();
    const refusedTrace: PipelineTraceStep[] = [
      { name: 'validate_input', status: 'ACCEPTED' },
      { name: 'guardrail_pre', status: 'REJECTED', notes: 'armor:pii_block' },
      { name: 'publish_refused', status: 'COMPLETED' },
    ];
    fixture.componentRef.setInput('pipelineTrace', refusedTrace);
    fixture.componentRef.setInput('refused', true);
    fixture.detectChanges();

    expect(
      el.querySelector('[data-testid="aplus-trace-widget-groups"]'),
    ).not.toBeNull();
    const inputCard = el.querySelector(
      '[data-testid="aplus-trace-group-classification-pipeline"]',
    );
    expect(inputCard).not.toBeNull();
    // The rejected guardrail surfaces a FAIL badge.
    const inputEvents = el.querySelector(
      '[data-testid="aplus-trace-events-classification-pipeline"]',
    );
    expect(inputEvents?.textContent ?? '').toContain('FAIL');
  });

  it('formats event timestamps as HH:MM:SS', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
    fixture.detectChanges();

    const time = el.querySelector('.trace-event__time');
    expect((time?.textContent ?? '').trim()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('omits any "Orchestrator" card', () => {
    const { fixture, el } = setup();
    fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
    fixture.detectChanges();
    expect(el.textContent?.toLowerCase()).not.toContain('orchestrator');
  });

  // ───────────────────────────────────────────────────────────────────
  // Branch-coverage augmentation (2026-06-04) — exercise the uncovered
  // conditional arms in the groups() computed + the per-event template
  // helper methods. Methods are public + pure, so we drive most of them
  // directly via componentInstance without rendering.
  // ───────────────────────────────────────────────────────────────────

  describe('groups() status derivation branches', () => {
    it('falls the empty-group status to the terminal in_flight arm (groupEvents.length === 0)', () => {
      const { fixture } = setup();
      // Only `generate` renders → qa-generation has 1 event; the other three
      // ordered groups stay empty and exercise the length===0 fallback.
      fixture.componentRef.setInput('pipelineTrace', [
        { name: 'generate', status: 'COMPLETED' },
      ]);
      fixture.detectChanges();
      const groups = fixture.componentInstance.groups();
      // PIPELINE_ORDER now has 4 cards.
      expect(groups.length).toBe(4);
      const qa = groups.find((g) => g.pipelineGroup === 'qa-generation');
      expect(qa?.events.length).toBe(1);
      expect(qa?.status).toBe('completed');
      // The three empty groups fall to the in_flight fallback + no terminal.
      const empties = groups.filter((g) => g.pipelineGroup !== 'qa-generation');
      expect(empties.length).toBe(3);
      for (const g of empties) {
        expect(g.events.length).toBe(0);
        expect(g.status).toBe('in_flight');
        expect(g.terminalSignal).toBeUndefined();
      }
      expect(fixture.componentInstance.hasTrace()).toBe(true);
    });

    it('marks the critique group failed on a refused run (anyFailed arm of the status ternary)', () => {
      // On refused runs the service flips the critique (quality-validation)
      // event STATUS to 'failed' (mapTraceStepStatus refused-group rule),
      // which drives the `anyFailed` branch of the status ternary in
      // groups(). NOTE: the critique step's BADGE stays 'PASS' (the
      // TERMINATE badge only attaches to a `publish_completed` step, which
      // is suppressed from rendering), so deriveTerminalSignal — gated on
      // `length > 0 && !anyInFlight` (true here) — resolves to PROCEED.
      // Characterize that exact behavior so the spec stays green.
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.componentRef.setInput('refused', true);
      fixture.detectChanges();
      const groups = fixture.componentInstance.groups();
      const critique = groups.find((g) => g.pipelineGroup === 'quality-validation');
      expect(critique).toBeDefined();
      expect(critique?.status).toBe('failed');
      // terminalSignal IS derived (group has events, none in_flight) — the
      // PASS badge means PROCEED despite the failed group status.
      expect(critique?.terminalSignal?.status).toBe('PROCEED');
      // qa-generation on a refused run still completes (generate is not
      // in the quality-validation group) → completed arm + PROCEED.
      const qa = groups.find((g) => g.pipelineGroup === 'qa-generation');
      expect(qa?.status).toBe('completed');
      expect(qa?.terminalSignal?.status).toBe('PROCEED');
    });

    it('derives a completed group with a PROCEED terminal signal on a clean run (completed arm)', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      const groups = fixture.componentInstance.groups();
      const qa = groups.find((g) => g.pipelineGroup === 'qa-generation');
      expect(qa?.status).toBe('completed');
      expect(qa?.terminalSignal?.status).toBe('PROCEED');
    });

    it('totalStages sums event counts across rendered groups', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      // Input&Safety (validate_input + guardrail_pre) + Q&A Gen (generate +
      // guardrail_post) + Critique&Gate (critique + quality_gate) = 6;
      // publish_completed is the dropped terminal outbox step.
      expect(fixture.componentInstance.totalStages()).toBe(6);
    });

    it('totalStages is 0 and hasTrace false when trace is null (effect early-return arm)', () => {
      const { fixture } = setup();
      // Default pipelineTrace input is null → effect clears events.
      expect(fixture.componentInstance.totalStages()).toBe(0);
      expect(fixture.componentInstance.hasTrace()).toBe(false);
    });

    it('clears events when pipelineTrace is an empty array (length === 0 arm of effect)', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      expect(fixture.componentInstance.hasTrace()).toBe(true);
      fixture.componentRef.setInput('pipelineTrace', []);
      fixture.detectChanges();
      expect(fixture.componentInstance.hasTrace()).toBe(false);
    });
  });

  describe('toggleGroup add + delete branches', () => {
    it('adds then removes a group from the collapsed set across two toggles', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      // First toggle → collapse (add to set) → expanded false.
      cmp.toggleGroup('qa-generation');
      fixture.detectChanges();
      let qa = cmp.groups().find((g) => g.pipelineGroup === 'qa-generation');
      expect(qa?.expanded).toBe(false);

      // Second toggle → expand (delete from set) → expanded true (the
      // `next.has(group)` true arm at line 149).
      cmp.toggleGroup('qa-generation');
      fixture.detectChanges();
      qa = cmp.groups().find((g) => g.pipelineGroup === 'qa-generation');
      expect(qa?.expanded).toBe(true);
    });
  });

  describe('onGroupKeydown branches', () => {
    it('toggles on Enter and calls preventDefault', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      const evt = new KeyboardEvent('keydown', { key: 'Enter' });
      const prevented = vi.spyOn(evt, 'preventDefault');
      cmp.onGroupKeydown(evt, 'qa-generation');
      fixture.detectChanges();

      expect(prevented).toHaveBeenCalled();
      const qa = cmp.groups().find((g) => g.pipelineGroup === 'qa-generation');
      expect(qa?.expanded).toBe(false);
    });

    it('toggles on Space (the " " || arm)', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      const evt = new KeyboardEvent('keydown', { key: ' ' });
      const prevented = vi.spyOn(evt, 'preventDefault');
      cmp.onGroupKeydown(evt, 'quality-validation');
      fixture.detectChanges();

      expect(prevented).toHaveBeenCalled();
      const qv = cmp.groups().find((g) => g.pipelineGroup === 'quality-validation');
      expect(qv?.expanded).toBe(false);
    });

    it('ignores other keys — no toggle, no preventDefault (false arm of the if)', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;

      const evt = new KeyboardEvent('keydown', { key: 'a' });
      const prevented = vi.spyOn(evt, 'preventDefault');
      cmp.onGroupKeydown(evt, 'qa-generation');
      fixture.detectChanges();

      expect(prevented).not.toHaveBeenCalled();
      const qa = cmp.groups().find((g) => g.pipelineGroup === 'qa-generation');
      expect(qa?.expanded).toBe(true);
    });
  });

  describe('stage config lookup fallbacks (?? arms)', () => {
    it('stageLabel returns the configured label for a known stage, "" for unknown', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      // qa-generation stage 1 is configured → "Generate Question".
      expect(cmp.stageLabel('qa-generation', 1)).toBe('Generate Question');
      // Stage 99 has no config → ?? '' fallback.
      expect(cmp.stageLabel('qa-generation', 99)).toBe('');
    });

    it('stageIcon returns the configured icon for a known stage, fallback for unknown', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      expect(cmp.stageIcon('qa-generation', 1, 'fallback-icon')).toBe(
        'fa-solid fa-wand-magic-sparkles',
      );
      expect(cmp.stageIcon('qa-generation', 99, 'fallback-icon')).toBe('fallback-icon');
    });

    it('stageBadgeColor returns the configured color for a known stage, fallback for unknown', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      expect(cmp.stageBadgeColor('qa-generation', 1, '#000000')).toBe('#6366f1');
      expect(cmp.stageBadgeColor('qa-generation', 99, '#000000')).toBe('#000000');
    });
  });

  describe('stageMetric branches', () => {
    function makeEvent(
      overrides: Partial<{
        pipelineGroup: 'qa-generation' | 'quality-validation' | 'classification-pipeline';
        stage: number;
        summary: string;
      }>,
    ) {
      return {
        eventId: 'e1',
        workflowId: 'w',
        agentName: 'A',
        phase: 'P',
        eventType: 't',
        summary: overrides.summary ?? '',
        timestamp: '2026-05-17T11:00:00.000Z',
        icon: 'i',
        accentColor: '#fff',
        stage: overrides.stage ?? 1,
        pipelineGroup: overrides.pipelineGroup ?? 'qa-generation',
        status: 'completed' as const,
      };
    }

    it('uses the stage config metricExtractor when a config exists (cfg truthy arm)', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      const result = cmp.stageMetric(
        makeEvent({ pipelineGroup: 'qa-generation', stage: 1, summary: 'Generated 1 MCQ' }),
      );
      // QA_GENERATION_STAGES[1].metricExtractor picks "1 MCQ".
      expect(result).toContain('MCQ');
    });

    it('falls back to summary.slice(0,80) when no stage config exists (cfg falsy arm)', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      const longSummary = 'x'.repeat(120);
      const result = cmp.stageMetric(
        makeEvent({ pipelineGroup: 'qa-generation', stage: 99, summary: longSummary }),
      );
      expect(result).toBe('x'.repeat(80));
      expect(result.length).toBe(80);
    });
  });

  describe('formatTime branches', () => {
    it('formats a valid ISO timestamp as HH:MM:SS (happy path)', () => {
      const { fixture } = setup();
      const out = fixture.componentInstance.formatTime('2026-05-17T11:00:02.000Z');
      expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('returns the raw string for an unparseable timestamp (NaN guard arm)', () => {
      const { fixture } = setup();
      const out = fixture.componentInstance.formatTime('not-a-date');
      expect(out).toBe('not-a-date');
    });
  });

  describe('terminalVariant branches', () => {
    it('returns danger for TERMINATE', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance.terminalVariant('TERMINATE')).toBe('danger');
    });

    it('returns warning for PROCEED_WITH_WARNINGS', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance.terminalVariant('PROCEED_WITH_WARNINGS')).toBe('warning');
    });

    it('returns success for PROCEED (the final default arm)', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance.terminalVariant('PROCEED')).toBe('success');
    });
  });

  describe('getModel + badgeStyle + stageBadges passthroughs', () => {
    it('getModel resolves a known model id and the N/A fallback for undefined', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      expect(cmp.getModel('vertex-ai/gemini-2.5-pro').abbr).toBe('Vtx G-2.5 Pro');
      expect(cmp.getModel(undefined).abbr).toBe('N/A');
    });

    it('badgeStyle returns the variant style record', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      expect(cmp.badgeStyle('tool-call').color).toBe('#2563eb');
      expect(cmp.badgeStyle('autonomous').color).toBe('#7c3aed');
    });

    it('stageBadges returns the TOOL CALL badge for qa-generation:1 and [] for unknown', () => {
      const { fixture } = setup();
      const cmp = fixture.componentInstance;
      expect(cmp.stageBadges('qa-generation', 1).length).toBe(1);
      expect(cmp.stageBadges('qa-generation', 99).length).toBe(0);
    });
  });

  describe('idle input (passthrough — no template branch, but covers the input default)', () => {
    it('defaults idle to true and accepts an explicit false', () => {
      const { fixture } = setup();
      // Default value of the idle input is true.
      expect(fixture.componentInstance.idle()).toBe(true);
      fixture.componentRef.setInput('idle', false);
      fixture.detectChanges();
      expect(fixture.componentInstance.idle()).toBe(false);
    });
  });

  // ── CR Phase 2 — live mode + whole-widget accordion ─────────────────
  describe('live mode + collapse (CR Phase 2)', () => {
    const PARTIAL: PipelineTraceStep[] = [
      { name: 'validate_input', status: 'ACCEPTED', completed_at: '2026-05-17T11:00:00.000Z' },
      { name: 'guardrail_pre', status: 'ACCEPTED', completed_at: '2026-05-17T11:00:01.000Z' },
    ];

    it('live=true shows the running pill + working ghost and does NOT collapse', () => {
      const { fixture, el } = setup();
      fixture.componentRef.setInput('pipelineTrace', PARTIAL);
      fixture.componentRef.setInput('live', true);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="aplus-trace-live-pill"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-trace-ghost"]')).not.toBeNull();
      expect(fixture.componentInstance.effectiveCollapsed()).toBe(false);
      // A partial 2-step trace still renders (Input & Safety card), no crash.
      expect(el.querySelector('[data-testid="aplus-trace-group-classification-pipeline"]')).not.toBeNull();
    });

    it('collapsed=true (not live) collapses the body + shows the summary, no live pill/ghost', () => {
      const { fixture, el } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.componentRef.setInput('live', false);
      fixture.componentRef.setInput('collapsed', true);
      fixture.detectChanges();
      expect(fixture.componentInstance.effectiveCollapsed()).toBe(true);
      expect(el.querySelector('.trace-widget__body.is-collapsed')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-trace-summary"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-trace-live-pill"]')).toBeNull();
      expect(el.querySelector('[data-testid="aplus-trace-ghost"]')).toBeNull();
    });

    it('defaults to expanded when neither live nor collapsed is set (terminal review default)', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      // collapsed input null + live false ⇒ effectiveCollapsed = !live() = true.
      // (Parent passes [collapsed]=true on review; default with no seed collapses.)
      expect(fixture.componentInstance.effectiveCollapsed()).toBe(true);
    });

    it('toggleCollapsed flips the accordion (author override of the live/seed default)', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.componentRef.setInput('live', true); // default open
      fixture.detectChanges();
      expect(fixture.componentInstance.effectiveCollapsed()).toBe(false);
      fixture.componentInstance.toggleCollapsed();
      fixture.detectChanges();
      expect(fixture.componentInstance.effectiveCollapsed()).toBe(true);
      fixture.componentInstance.toggleCollapsed();
      fixture.detectChanges();
      expect(fixture.componentInstance.effectiveCollapsed()).toBe(false);
    });

    it('collapsedOutcome surfaces the terminal verdict for the accordion header', () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('pipelineTrace', FULL_TRACE);
      fixture.detectChanges();
      // All groups PROCEED on the happy-path full trace.
      expect(fixture.componentInstance.collapsedOutcome()).toBe('PROCEED');
    });
  });
});
