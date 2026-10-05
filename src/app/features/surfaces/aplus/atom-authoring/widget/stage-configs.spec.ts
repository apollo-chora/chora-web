import { expect } from 'vitest';
import {
  PIPELINE_META,
  pipelineMeta,
  stageBadges,
  BADGE_VARIANT_STYLES,
} from './stage-configs';
import type { PipelineGroup } from '../agent-trace.model';

/**
 * Branch-coverage characterization for the QGen agent-trace stage-config
 * module. Pure data + extractor functions — driven directly, no TestBed /
 * HTTP. Each test below targets a specific uncovered conditional arm of the
 * three `metricExtractor` closures plus the `stageBadges` lookup fallback.
 */
describe('stage-configs', () => {
  const validateInput = PIPELINE_META['classification-pipeline'].stages[1].metricExtractor;
  const safetyScreen = PIPELINE_META['classification-pipeline'].stages[2].metricExtractor;
  const qaGen = PIPELINE_META['qa-generation'].stages[1].metricExtractor;
  const critique = PIPELINE_META['quality-validation'].stages[1].metricExtractor;
  const renderImage = PIPELINE_META['illustration'].stages[1].metricExtractor;

  describe('pipelineMeta', () => {
    // Owner direction 2026-06-25 — the widget now FEATURES THE FULL CREW.
    it('returns the Input & Safety (classification-pipeline) meta', () => {
      const meta = pipelineMeta('classification-pipeline');
      expect(meta.agentLabel).toBe('Input & Safety');
      expect(meta.pipelineLabel).toBe('Input & Safety');
      expect(meta.accentColor).toBe('#10b981');
      expect(meta.icon).toBe('fa-solid fa-shield-halved');
      expect(meta.stages[1].label).toBe('Validate input');
      expect(meta.stages[2].label).toBe('Safety screen (input)');
    });

    it('returns the qa-generation meta (now with an output safety screen)', () => {
      const meta = pipelineMeta('qa-generation');
      expect(meta.agentLabel).toBe('Q&A Generation Agent');
      expect(meta.accentColor).toBe('#6366f1');
      expect(meta.stages[1].label).toBe('Generate Question');
      expect(meta.stages[2].label).toBe('Safety screen (output)');
    });

    it('returns the Critique & Quality Gate (quality-validation) meta', () => {
      const meta = pipelineMeta('quality-validation');
      expect(meta.agentLabel).toBe('Critique & Quality Gate');
      expect(meta.pipelineLabel).toBe('Critique & Quality Gate');
      expect(meta.accentColor).toBe('#f59e0b');
      expect(meta.stages[1].label).toBe('Critique');
      expect(meta.stages[2].label).toBe('Quality gate');
      expect(meta.stages[3].label).toBe('Regenerate');
    });

    it('returns the Illustration (image-gen) meta', () => {
      const meta = pipelineMeta('illustration');
      expect(meta.agentLabel).toBe('Illustration');
      expect(meta.accentColor).toBe('#ec4899');
      expect(meta.icon).toBe('fa-solid fa-image');
      expect(meta.stages[1].label).toBe('Render illustration');
    });
  });

  describe('input & safety metricExtractors', () => {
    it('validate input — first note segment, else fallback', () => {
      expect(validateInput('Schema OK · 4 fields')).toBe('Schema OK');
      expect(validateInput('')).toBe('Input validated');
    });

    it('safety screen — surfaces the armor verdict, else fallback', () => {
      expect(safetyScreen('armor:allow')).toBe('armor allow');
      expect(safetyScreen('')).toBe('Input screened');
    });
  });

  describe('illustration metricExtractor', () => {
    it('reports the rendered image count', () => {
      expect(renderImage('2 images rendered')).toBe('2 rendered');
    });

    it('falls back when no count is present', () => {
      expect(renderImage('')).toBe('Illustration rendered');
    });
  });

  describe('qa-generation metricExtractor', () => {
    // mcqMatch true, distractorMatch false
    it('reports MCQ count only', () => {
      expect(qaGen('Generated 1 MCQ stem')).toBe('1 MCQ');
    });

    // mcqMatch false, distractorMatch true
    it('reports distractor count only', () => {
      expect(qaGen('produced 3 distractors')).toBe('3 distractors');
    });

    // both true -> joined
    it('reports MCQ and distractor counts joined', () => {
      expect(qaGen('1 MCQ with 4 distractors')).toBe('1 MCQ • 4 distractors');
    });

    // singular "distractor" still matches the optional-s regex
    it('matches singular distractor wording', () => {
      expect(qaGen('1 distractor only')).toBe('1 distractors');
    });

    // neither -> fallback ternary falsy branch
    it('falls back to "Question generated" when nothing matches', () => {
      expect(qaGen('no numeric signals')).toBe('Question generated');
    });
  });

  describe('quality-validation (critique) metricExtractor', () => {
    // passMatch via PASS, attemptMatch true
    it('reports PASS with attempt number', () => {
      expect(critique('PASS on attempt 2')).toBe('PASS · attempt 2');
    });

    // passMatch via "approved", no attempt -> attempt branch skipped
    it('reports PASS via approved wording without attempt', () => {
      expect(critique('candidate approved')).toBe('PASS');
    });

    // failMatch via FAIL (else-if arm), with attempt
    it('reports FAIL with attempt number', () => {
      expect(critique('FAIL at attempt 1')).toBe('FAIL · attempt 1');
    });

    // failMatch via "rejected" wording
    it('reports FAIL via rejected wording', () => {
      expect(critique('the item was rejected')).toBe('FAIL');
    });

    // failMatch via "refused" wording
    it('reports FAIL via refused wording', () => {
      expect(critique('refused')).toBe('FAIL');
    });

    // attemptMatch only, no pass/fail -> just attempt
    it('reports attempt number alone when no pass/fail signal', () => {
      expect(critique('attempt 3 in progress')).toBe('attempt 3');
    });

    // both pass and fail keywords -> pass wins (if/else-if ordering)
    it('prefers PASS over FAIL when both keywords appear', () => {
      // "approved" sets passMatch; "rejected" sets failMatch; if/else-if => PASS
      const out = critique('approved but earlier rejected attempt 5');
      expect(out).toBe('PASS · attempt 5');
    });

    // nothing matches -> fallback
    it('falls back to "Critique complete" when nothing matches', () => {
      expect(critique('no signal at all')).toBe('Critique complete');
    });
  });

  describe('stageBadges', () => {
    it('returns the TOOL CALL badge for qa-generation:1', () => {
      const badges = stageBadges('qa-generation', 1);
      expect(badges).toHaveLength(1);
      expect(badges[0].text).toBe('TOOL CALL');
      expect(badges[0].variant).toBe('tool-call');
    });

    it('returns the TOOL CALL badge for quality-validation:1', () => {
      const badges = stageBadges('quality-validation', 1);
      expect(badges).toHaveLength(1);
      expect(badges[0].variant).toBe('tool-call');
    });

    // missing key -> `?? []` nullish fallback (the uncovered arm)
    it('returns an empty array for an unmapped stage (nullish fallback)', () => {
      expect(stageBadges('classification-pipeline', 1)).toEqual([]);
      expect(stageBadges('qa-generation', 2)).toEqual([]);
      expect(stageBadges('quality-validation', 99)).toEqual([]);
    });

    it('returns empty array for an unknown group/stage combination', () => {
      const unknown = 'nonexistent-pipeline' as PipelineGroup;
      expect(stageBadges(unknown, 1)).toEqual([]);
    });
  });

  describe('static exports', () => {
    it('exposes all four featured pipeline groups in PIPELINE_META', () => {
      const keys = Object.keys(PIPELINE_META);
      expect(keys).toContain('classification-pipeline');
      expect(keys).toContain('qa-generation');
      expect(keys).toContain('quality-validation');
      expect(keys).toContain('illustration');
    });

    it('exposes the three badge variant style entries', () => {
      expect(BADGE_VARIANT_STYLES['tool-call']).toEqual({
        background: '#eff6ff',
        color: '#2563eb',
        border: '#bfdbfe',
      });
      expect(BADGE_VARIANT_STYLES['autonomous'].color).toBe('#7c3aed');
      expect(BADGE_VARIANT_STYLES['parallel-agentic'].border).toBe('#c7d2fe');
    });
  });
});
