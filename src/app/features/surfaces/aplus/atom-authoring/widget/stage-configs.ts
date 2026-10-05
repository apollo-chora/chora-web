/**
 * Per-pipeline stage configuration for the QGen agent-trace widget. One
 * `StageConfig` per stage number per pipeline group. As of 2026-06-25 the
 * widget FEATURES THE FULL CREW (owner direction) across 4 cards — Input &
 * Safety → Q&A Generation → Critique & Quality Gate → Illustration — covering
 * every meaningful crew step (validate_input · guardrail_pre/post · generate ·
 * critique · quality_gate · regenerate · render_image). The outbox publish
 * steps surface as the card terminal signal, not a stage.
 */
import type { PipelineGroup, ToolBadge } from '../agent-trace.model';

export interface StageConfig {
  readonly label: string;
  readonly icon: string;
  readonly badgeColor: string;
  readonly metricExtractor: (summary: string) => string;
}

export interface PipelineMeta {
  readonly agentLabel: string;
  readonly pipelineLabel: string;
  readonly accentColor: string;
  readonly icon: string;
  readonly stages: Readonly<Record<number, StageConfig>>;
}

// "Input & Safety" — the pre-generation crew stages: Python input validation
// (validate_input) + Cloud Model Armor input screening (guardrail_pre). Per the
// owner's 2026-06-25 direction the trace now FEATURES the full crew (reversing
// the 2026-05-17 LLM-only curation) so authors see every pipeline step.
const INPUT_SAFETY_STAGES: Record<number, StageConfig> = {
  1: {
    label: 'Validate input',
    icon: 'fa-solid fa-circle-check',
    badgeColor: '#10b981',
    metricExtractor: (s) => firstNoteOr(s, 'Input validated'),
  },
  2: {
    label: 'Safety screen (input)',
    icon: 'fa-solid fa-shield-halved',
    badgeColor: '#10b981',
    metricExtractor: (s) => armorMetric(s, 'Input screened'),
  },
};

const QA_GENERATION_STAGES: Record<number, StageConfig> = {
  1: {
    label: 'Generate Question',
    icon: 'fa-solid fa-wand-magic-sparkles',
    badgeColor: '#6366f1',
    metricExtractor: (s) => {
      const mcqMatch = s.match(/(\d+)\s*MCQ/i);
      const distractorMatch = s.match(/(\d+)\s*distractors?/i);
      const parts: string[] = [];
      if (mcqMatch) parts.push(`${mcqMatch[1]} MCQ`);
      if (distractorMatch) parts.push(`${distractorMatch[1]} distractors`);
      return parts.length > 0 ? parts.join(' • ') : 'Question generated';
    },
  },
  // Cloud Model Armor output screening (guardrail_post) — now featured.
  2: {
    label: 'Safety screen (output)',
    icon: 'fa-solid fa-shield-halved',
    badgeColor: '#6366f1',
    metricExtractor: (s) => armorMetric(s, 'Output screened'),
  },
};

// "Critique & Quality Gate" — qgen_critic (critique) + the Python quality gate
// + the retry loop. All three are now featured (the gate + retry were hidden
// pre-2026-06-25).
const QUALITY_VALIDATION_STAGES: Record<number, StageConfig> = {
  1: {
    label: 'Critique',
    icon: 'fa-solid fa-scale-balanced',
    badgeColor: '#f59e0b',
    metricExtractor: (s) => {
      const attemptMatch = s.match(/attempt\s+(\d+)/i);
      const passMatch = /PASS|approved/i.test(s);
      const failMatch = /FAIL|refused|rejected/i.test(s);
      const parts: string[] = [];
      if (passMatch) parts.push('PASS');
      else if (failMatch) parts.push('FAIL');
      if (attemptMatch) parts.push(`attempt ${attemptMatch[1]}`);
      return parts.length > 0 ? parts.join(' · ') : 'Critique complete';
    },
  },
  2: {
    label: 'Quality gate',
    icon: 'fa-solid fa-gauge-high',
    badgeColor: '#f59e0b',
    metricExtractor: (s) => firstNoteOr(s, 'Quality gate passed'),
  },
  3: {
    label: 'Regenerate',
    icon: 'fa-solid fa-rotate',
    badgeColor: '#f59e0b',
    metricExtractor: (s) => {
      const attemptMatch = s.match(/attempt\s+(\d+)/i);
      return attemptMatch ? `attempt ${attemptMatch[1]}` : firstNoteOr(s, 'Regenerated');
    },
  },
};

// "Illustration" — the image-generation crew node (render_image; Kroki for
// mermaid diagrams, model-gateway Imagen for scenes). This was SILENTLY DROPPED
// before 2026-06-25 — authors who generated images saw no trace of it.
const ILLUSTRATION_STAGES: Record<number, StageConfig> = {
  1: {
    label: 'Render illustration',
    icon: 'fa-solid fa-image',
    badgeColor: '#ec4899',
    metricExtractor: (s) => {
      const renderedMatch = s.match(/(\d+)\s*(?:image|rendered)/i);
      return renderedMatch ? `${renderedMatch[1]} rendered` : firstNoteOr(s, 'Illustration rendered');
    },
  },
};

/** First note segment of a summary, or a fallback label. */
function firstNoteOr(summary: string, fallback: string): string {
  const head = summary.split('·')[0]?.trim();
  return head && head.length > 0 ? head : fallback;
}

/** Cloud Model Armor screen metric — surfaces the armor verdict if present. */
function armorMetric(summary: string, fallback: string): string {
  const m = summary.match(/armor:\s*(\w+)/i);
  if (m) return `armor ${m[1].toLowerCase()}`;
  return firstNoteOr(summary, fallback);
}

export const PIPELINE_META: Readonly<Record<PipelineGroup, PipelineMeta>> = {
  // PipelineGroup IDs are kept stable (discriminators) while the labels now
  // reflect the FULL featured crew (owner direction 2026-06-25).
  'classification-pipeline': {
    agentLabel: 'Input & Safety',
    pipelineLabel: 'Input & Safety',
    accentColor: '#10b981',
    icon: 'fa-solid fa-shield-halved',
    stages: INPUT_SAFETY_STAGES,
  },
  'qa-generation': {
    agentLabel: 'Q&A Generation Agent',
    pipelineLabel: 'Q&A Generation Pipeline',
    accentColor: '#6366f1',
    icon: 'fa-solid fa-wand-magic-sparkles',
    stages: QA_GENERATION_STAGES,
  },
  'quality-validation': {
    agentLabel: 'Critique & Quality Gate',
    pipelineLabel: 'Critique & Quality Gate',
    accentColor: '#f59e0b',
    icon: 'fa-solid fa-scale-balanced',
    stages: QUALITY_VALIDATION_STAGES,
  },
  illustration: {
    agentLabel: 'Illustration',
    pipelineLabel: 'Illustration',
    accentColor: '#ec4899',
    icon: 'fa-solid fa-image',
    stages: ILLUSTRATION_STAGES,
  },
};

export function pipelineMeta(group: PipelineGroup): PipelineMeta {
  return PIPELINE_META[group];
}

const STAGE_BADGES: Readonly<Record<string, readonly ToolBadge[]>> = {
  // TOOL CALL marks the stages that invoke an external engine: generate
  // (qgen_question), critique (qgen_critic), and render_image (Kroki /
  // model-gateway Imagen). The Python validation / quality-gate steps and the
  // Model Armor screens are not agentic tool calls, so they carry no badge.
  'qa-generation:1': [
    { text: 'TOOL CALL', variant: 'tool-call', icon: '\u{1F527}' },
  ],
  'quality-validation:1': [
    { text: 'TOOL CALL', variant: 'tool-call', icon: '\u{1F527}' },
  ],
  'illustration:1': [
    { text: 'TOOL CALL', variant: 'tool-call', icon: '\u{1F527}' },
  ],
};

export function stageBadges(
  group: PipelineGroup,
  stageNumber: number,
): readonly ToolBadge[] {
  return STAGE_BADGES[`${group}:${stageNumber}`] ?? [];
}

export const BADGE_VARIANT_STYLES: Readonly<
  Record<
    'tool-call' | 'autonomous' | 'parallel-agentic',
    { background: string; color: string; border: string }
  >
> = {
  'tool-call': { background: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  'autonomous': { background: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  'parallel-agentic': { background: '#eef2ff', color: '#4338ca', border: '#c7d2fe' },
};
