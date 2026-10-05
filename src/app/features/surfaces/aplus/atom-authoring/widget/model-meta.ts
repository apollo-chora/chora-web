/**
 * Slim model abbreviation map — only the model IDs actually exercised by
 * the prompt-level QGen pipeline. Ported from the reference React
 * `modelToolLabels.ts` `MODEL_MAP`, restricted to what the widget will
 * emit. Unknown IDs fall back to the abbreviated form.
 */
import type { ModelMeta } from '../agent-trace.model';

const MODEL_MAP: Record<string, ModelMeta> = {
  'gemini-2.5-pro': {
    abbr: 'G-2.5 Pro',
    color: '#4285F4',
    description:
      "Google's most capable model. Complex reasoning + high-stakes evaluation.",
  },
  'gemini-2.5-flash': {
    abbr: 'G-2.5 Flash',
    color: '#4285F4',
    description:
      "Google's latest fast model. Question generation and quality validation.",
  },
  'gemini-2.0-flash': {
    abbr: 'G-2.0 Flash',
    color: '#4285F4',
    description: "Google's previous-generation fast model. Cost-effective fallback.",
  },
  // qgen 2-agent build (2026-05/06): generation=gemini-3.1-pro-preview,
  // critic=gemini-3.5-flash. Explicit entries so getModelMeta exact-match
  // resolves them instead of the substring fallback collapsing onto 2.5.
  'gemini-3.1-pro-preview': {
    abbr: 'G-3.1 Pro',
    color: '#4285F4',
    description:
      "Google's latest pro model. Complex reasoning + question generation.",
  },
  'gemini-3.5-flash': {
    abbr: 'G-3.5 Flash',
    color: '#4285F4',
    description: "Google's latest fast model. Quality critique.",
  },
  // Per user 2026-05-17 — pills now name BOTH the platform (Vtx =
  // Vertex AI) AND the model variant (G-2.5 Pro / Flash). "Vtx Pro"
  // by itself was ambiguous ("Pro what?"); this format makes the
  // qgen_question vs qgen_critic platform consistency obvious (both
  // are Vertex AI Reasoning Engines wrapping Gemini variants).
  'vertex-ai/gemini-2.5-pro': {
    abbr: 'Vtx G-2.5 Pro',
    color: '#0F9D58',
    description: 'Gemini 2.5 Pro via Vertex AI Reasoning Engine (qgen_question).',
  },
  'vertex-ai/gemini-2.5-flash': {
    abbr: 'Vtx G-2.5 Flash',
    color: '#0F9D58',
    description: 'Gemini 2.5 Flash via Vertex AI Reasoning Engine (qgen_critic).',
  },
  'vertex-ai/gemini-2.0-flash': {
    abbr: 'Vtx G-2.0 Flash',
    color: '#0F9D58',
    description: 'Gemini 2.0 Flash via Vertex AI Reasoning Engine.',
  },
  'vertex-ai/gemini-3.1-pro-preview': {
    abbr: 'Vtx G-3.1 Pro',
    color: '#0F9D58',
    description: 'Gemini 3.1 Pro via Vertex AI.',
  },
  'vertex-ai/gemini-3.5-flash': {
    abbr: 'Vtx G-3.5 Flash',
    color: '#0F9D58',
    description: 'Gemini 3.5 Flash via Vertex AI.',
  },
  'cloud-model-armor': {
    abbr: 'Armor',
    color: '#dc2626',
    description:
      'Cloud Model Armor: runtime guardrail (PII / safety / prompt-injection screening). Regional endpoint per ADR-152.',
  },
};

/**
 * Known Vertex AI Reasoning Engines used by qgen_crew, indexed by the
 * numeric engine ID embedded in `projects/.../reasoningEngines/{id}`.
 * Mirrors `chora-infra/agents-cli/registry.json` for FE-side display
 * (so the pill stays accurate when BE populates `engine_resource`).
 */
const VERTEX_ENGINES: Record<string, ModelMeta> = {
  '4952055785724051456': {
    abbr: 'qgen_question',
    color: '#0F9D58',
    description:
      'qgen_question: Vertex AI Reasoning Engine wrapping Gemini 2.5 Pro for MCQ/OE generation.',
  },
  '8495262792557789184': {
    abbr: 'qgen_critic',
    color: '#0F9D58',
    description:
      'qgen_critic: Vertex AI Reasoning Engine wrapping Gemini 2.5 Flash for self-evaluation + critique.',
  },
};

export function getModelMeta(modelId: string | null | undefined): ModelMeta {
  if (!modelId) {
    return {
      abbr: 'N/A',
      color: '#9CA3AF',
      description: 'No model information available.',
    };
  }
  if (MODEL_MAP[modelId]) return MODEL_MAP[modelId];
  const engineMatch = modelId.match(/reasoningEngines\/(\d+)/);
  if (engineMatch && VERTEX_ENGINES[engineMatch[1]]) {
    return VERTEX_ENGINES[engineMatch[1]];
  }
  for (const [key, meta] of Object.entries(MODEL_MAP)) {
    if (modelId.includes(key) || key.includes(modelId)) return meta;
  }
  const short = modelId.replace('vertex-ai/', 'Vtx/').substring(0, 12);
  return { abbr: short, color: '#9CA3AF', description: `Unknown model: ${modelId}` };
}
