import { describe, expect, it } from 'vitest';

import {
  isPersonaView,
  PERSONA_ADDRESS_STYLES,
  PERSONA_CITATIONS,
  PERSONA_DIFFICULTIES,
  PERSONA_HINT_PROGRESSIONS,
  PERSONA_LANGUAGES,
  PERSONA_NOTE_MAX_LEN,
  PERSONA_TONES,
} from './familiar-persona.model';

const valid = {
  tone: 'socratic',
  hintProgression: 'ladder',
  maxHintsBeforeReveal: 3,
  difficultyCap: 'intermediate',
  language: 'en',
  citationStrictness: 'strict',
  archetype: 'curious-explorer',
  addressStyle: 'first_name',
  interestChips: ['space', 'dinosaurs'],
  guidanceNote: '',
  version: 0,
};

describe('familiar-persona.model', () => {
  it('isPersonaView accepts a well-formed view', () => {
    expect(isPersonaView(valid)).toBe(true);
  });

  it('isPersonaView accepts an empty interestChips array', () => {
    expect(isPersonaView({ ...valid, interestChips: [] })).toBe(true);
  });

  it('isPersonaView rejects null / non-object', () => {
    expect(isPersonaView(null)).toBe(false);
    expect(isPersonaView('nope')).toBe(false);
  });

  it('isPersonaView rejects a missing version (fail-loud on partial)', () => {
    const { version: _drop, ...noVersion } = valid;
    expect(isPersonaView(noVersion)).toBe(false);
  });

  it('isPersonaView rejects a non-string interest chip', () => {
    expect(isPersonaView({ ...valid, interestChips: ['ok', 3] })).toBe(false);
  });

  it('isPersonaView rejects a numeric guidanceNote', () => {
    expect(isPersonaView({ ...valid, guidanceNote: 42 })).toBe(false);
  });

  it('bounded enum sets mirror the domain grammar', () => {
    expect(PERSONA_TONES).toEqual(['socratic', 'direct', 'encouraging']);
    expect(PERSONA_HINT_PROGRESSIONS).toEqual(['ladder', 'uniform']);
    expect(PERSONA_DIFFICULTIES).toEqual(['foundation', 'intermediate', 'advanced']);
    expect(PERSONA_CITATIONS).toEqual(['strict', 'lenient']);
    expect(PERSONA_LANGUAGES).toEqual(['en', 'zh', 'ms']);
    expect(PERSONA_ADDRESS_STYLES).toEqual(['first_name', 'nickname', 'formal']);
    expect(PERSONA_NOTE_MAX_LEN).toBe(280);
  });
});
