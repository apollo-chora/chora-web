import { TestBed } from '@angular/core/testing';

import { TOOLTIP_REGISTRY, TooltipRegistryService } from './tooltip-registry';
import { TranslateService } from '../../core/services/translate.service';

/** The nine NON-CONTESTED §2.5 terms seeded in this WS-2 slice. */
const SEEDED_KEYS = [
  'mana',
  'familiar',
  'daily_dose',
  'growth_edge',
  'cognitive_level',
  'grounding',
  'topic',
  'instructions_ai',
  'skillsfuture',
] as const;

/**
 * Terms intentionally NOT seeded - they hang on ADRs still in review
 * (ADR-A atom-vs-question naming; ADR-B mastery bands). This guards against a
 * premature addition silently re-introducing the contested vocabulary.
 */
const DEFERRED_KEYS = [
  'atom',
  'question',
  'shaky',
  'wobbly',
  'solid',
  'fragile',
  'forming',
  'mastery',
];

describe('TOOLTIP_REGISTRY', () => {
  it('seeds exactly the nine non-contested §2.5 terms (flat namespace)', () => {
    const flat = Object.keys(TOOLTIP_REGISTRY).filter((k) => !k.startsWith('skill.'));
    expect(flat.sort()).toEqual([...SEEDED_KEYS].sort());
  });

  it('registers all 27 Familiar Skills under the skill.* namespace (#18)', () => {
    const SKILL_KEYS = [
      'explain_anew', 'quiz_me', 'worked_example', 'socratic_drill',
      'flashcard_forge', 'step_checker', 'polyglot', 'map_sight',
      'weakness_sight', 'progress_mirror', 'recap_scribe', 'photo_sight',
      // ADR-254 D9: the fog scout became kg_explore (display name
      // 'Knowledge Explorer'). The server sends kg_explore, so a registry
      // still keyed fog_scout attaches no tooltip to the skill that IS sent.
      'reminder_bell', 'path_weaver', 'kg_explore', 'goal_scribe',
      'atom_forge', 'study_calendar', 'web_research', 'source_reader',
      'fact_check', 'duel_second', 'dawn_briefing', 'watchful_eye',
      'long_weaving', 'twin_rituals', 'weave_mastery',
    ];
    const skillKeys = Object.keys(TOOLTIP_REGISTRY).filter((k) => k.startsWith('skill.'));
    expect(skillKeys.sort()).toEqual(SKILL_KEYS.map((k) => `skill.${k}`).sort());
    for (const skill of SKILL_KEYS) {
      const e = TOOLTIP_REGISTRY[`skill.${skill}`];
      expect(e.labelKey).toBe(`familiar_skill.${skill}`); // reuses the name
      expect(e.descriptionKey).toBe(`tooltips.skill.${skill}.description`); // new copy
    }
  });

  it('keys each entry to tooltips.<term>.label / .description i18n keys', () => {
    for (const key of SEEDED_KEYS) {
      const entry = TOOLTIP_REGISTRY[key];
      expect(entry.labelKey).toBe(`tooltips.${key}.label`);
      expect(entry.descriptionKey).toBe(`tooltips.${key}.description`);
    }
  });

  it('does NOT include atom/question or mastery-band terms (DEFERRED pending ADR-A/ADR-B)', () => {
    for (const key of DEFERRED_KEYS) {
      expect(TOOLTIP_REGISTRY[key]).toBeUndefined();
    }
  });
});

describe('TooltipRegistryService', () => {
  function setup(instant: (k: string) => string = (k) => k): TooltipRegistryService {
    TestBed.configureTestingModule({
      providers: [
        TooltipRegistryService,
        { provide: TranslateService, useValue: { instant } },
      ],
    });
    return TestBed.inject(TooltipRegistryService);
  }

  it('has() reports registry membership', () => {
    const svc = setup();
    expect(svc.has('mana')).toBe(true);
    expect(svc.has('not_a_key')).toBe(false);
  });

  it('resolve() returns the translated label + description for a seeded key', () => {
    const svc = setup((k) => `T(${k})`);
    expect(svc.resolve('mana')).toEqual({
      label: 'T(tooltips.mana.label)',
      description: 'T(tooltips.mana.description)',
    });
  });

  it('resolve() returns null for an unknown key (graceful fallback - never a crash)', () => {
    const svc = setup();
    expect(svc.resolve('definitely_missing')).toBeNull();
  });
});
