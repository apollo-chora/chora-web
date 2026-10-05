import { expect } from 'vitest';
import { getModelMeta } from './model-meta';

describe('getModelMeta', () => {
  describe('falsy modelId guard (!modelId TRUE arm)', () => {
    it('returns N/A meta for null', () => {
      const meta = getModelMeta(null);
      expect(meta.abbr).toBe('N/A');
      expect(meta.color).toBe('#9CA3AF');
      expect(meta.description).toBe('No model information available.');
    });

    it('returns N/A meta for undefined', () => {
      const meta = getModelMeta(undefined);
      expect(meta.abbr).toBe('N/A');
    });

    it('returns N/A meta for empty string (falsy)', () => {
      const meta = getModelMeta('');
      expect(meta.abbr).toBe('N/A');
      expect(meta.description).toBe('No model information available.');
    });
  });

  describe('exact MODEL_MAP hit (MODEL_MAP[modelId] TRUE arm)', () => {
    it('resolves gemini-2.5-pro exactly', () => {
      const meta = getModelMeta('gemini-2.5-pro');
      expect(meta.abbr).toBe('G-2.5 Pro');
      expect(meta.color).toBe('#4285F4');
      expect(meta.description).toContain('most capable');
    });

    it('resolves gemini-2.5-flash exactly', () => {
      expect(getModelMeta('gemini-2.5-flash').abbr).toBe('G-2.5 Flash');
    });

    it('resolves gemini-3.1-pro-preview exactly', () => {
      expect(getModelMeta('gemini-3.1-pro-preview').abbr).toBe('G-3.1 Pro');
    });

    it('resolves the vertex-ai/ prefixed exact key', () => {
      const meta = getModelMeta('vertex-ai/gemini-2.5-pro');
      expect(meta.abbr).toBe('Vtx G-2.5 Pro');
      expect(meta.color).toBe('#0F9D58');
    });

    it('resolves cloud-model-armor exactly', () => {
      const meta = getModelMeta('cloud-model-armor');
      expect(meta.abbr).toBe('Armor');
      expect(meta.color).toBe('#dc2626');
    });
  });

  describe('reasoningEngines path (engineMatch && VERTEX_ENGINES[id])', () => {
    it('resolves a known qgen_question engine id (both arms TRUE)', () => {
      const meta = getModelMeta(
        'projects/123/locations/us-central1/reasoningEngines/4952055785724051456',
      );
      expect(meta.abbr).toBe('qgen_question');
      expect(meta.color).toBe('#0F9D58');
      expect(meta.description).toContain('qgen_question');
    });

    it('resolves a known qgen_critic engine id', () => {
      const meta = getModelMeta(
        'projects/p/reasoningEngines/8495262792557789184',
      );
      expect(meta.abbr).toBe('qgen_critic');
    });

    it('engineMatch present but id unknown — falls through past the if (VERTEX miss arm)', () => {
      // reasoningEngines matches the regex, but 999 is not in VERTEX_ENGINES,
      // and the residual string matches no MODEL_MAP key, so it lands on the
      // unknown-model fallback.
      const meta = getModelMeta('projects/p/reasoningEngines/999');
      expect(meta.color).toBe('#9CA3AF');
      expect(meta.description).toBe(
        'Unknown model: projects/p/reasoningEngines/999',
      );
    });
  });

  describe('substring fallback loop (for...of)', () => {
    it('matches via modelId.includes(key) — longer id containing a known key', () => {
      // 'suffixed-gemini-2.0-flash-x' includes the key 'gemini-2.0-flash'.
      const meta = getModelMeta('suffixed-gemini-2.0-flash-x');
      expect(meta.abbr).toBe('G-2.0 Flash');
      expect(meta.color).toBe('#4285F4');
    });

    it('matches via key.includes(modelId) — short id that is a substring of a key', () => {
      // 'cloud-model-armor'.includes('model-armor') is true, so the key
      // contains the modelId — exercises the second OR operand.
      const meta = getModelMeta('model-armor');
      expect(meta.abbr).toBe('Armor');
    });
  });

  describe('unknown-model final fallback (loop finds nothing)', () => {
    it('strips vertex-ai/ prefix and truncates to 12 chars', () => {
      // No exact hit, no engine match, no substring match against any key.
      const meta = getModelMeta('vertex-ai/zzz-unknown-model-name');
      expect(meta.abbr).toBe('Vtx/zzz-unkn'); // 12 chars of 'Vtx/zzz-unknown...'
      expect(meta.color).toBe('#9CA3AF');
      expect(meta.description).toBe(
        'Unknown model: vertex-ai/zzz-unknown-model-name',
      );
    });

    it('handles an unknown id without the vertex-ai/ prefix (replace is a no-op)', () => {
      const meta = getModelMeta('qqq-brand-new-model');
      expect(meta.abbr).toBe('qqq-brand-ne'); // first 12 chars
      expect(meta.color).toBe('#9CA3AF');
      expect(meta.description).toBe('Unknown model: qqq-brand-new-model');
    });

    it('keeps a short unknown id intact when under 12 chars', () => {
      const meta = getModelMeta('xyz');
      expect(meta.abbr).toBe('xyz');
      expect(meta.description).toBe('Unknown model: xyz');
    });
  });
});
