import { Injectable, inject } from '@angular/core';

import { TranslateService } from '../../core/services/translate.service';

/**
 * One microcopy entry - the pair of i18n keys backing a two-tier tooltip
 * (bold label line + plain description line). Copy lives in the i18n bundle
 * (`tooltips.*` in `public/assets/i18n/<lang>.json`), NOT here, so it stays
 * centralised and translatable.
 */
export interface TooltipEntry {
  readonly labelKey: string;
  readonly descriptionKey: string;
}

/** Resolved (translated) tooltip content, ready to render. */
export interface ResolvedTooltip {
  readonly label: string;
  readonly description: string;
}

/** Build a registry entry from the canonical `tooltips.<term>.{label,description}` key shape. */
function entry(term: string): TooltipEntry {
  return {
    labelKey: `tooltips.${term}.label`,
    descriptionKey: `tooltips.${term}.description`,
  };
}

/**
 * Single source of truth mapping a domain term / field / status key to its
 * i18n label + description keys - the Chora "Helpful-UX" microcopy dictionary
 * (UX review §2.5). Reuse one key everywhere a concept appears (the "what is
 * mana?" tooltip is authored once, shown everywhere).
 *
 * Seeded here: the NON-CONTESTED §2.5 terms only.
 *
 * DEFERRED - do NOT add until the owning ADR lands (both are in review):
 *   • ADR-A (atom-vs-question naming): no `atom` / `question` entry yet.
 *   • ADR-B (mastery bands): no `shaky` / `wobbly` / `solid` / `fragile` /
 *     `forming` / `mastery` entry yet.
 * Adding either before its ADR would bake contested vocabulary into the UI.
 */
/**
 * Build a Familiar-Skill microcopy entry. The bold line REUSES the skill's
 * existing display name (`familiar_skill.<key>` - authored once), so only the
 * plain-language description is new (`tooltips.skill.<key>.description`).
 */
function skillEntry(skillKey: string): TooltipEntry {
  return {
    labelKey: `familiar_skill.${skillKey}`,
    descriptionKey: `tooltips.skill.${skillKey}.description`,
  };
}

/**
 * All 27 Familiar Skills (docs/FAMILIAR-SKILL-SPECS-2026-07-03.md §2), registered
 * under a `skill.` namespace so the Grimoire loadout can attach
 * `[choraInfo]="'skill.' + skillKey"` to every grant row without colliding with
 * the flat §2.5 term keys above. An unregistered/future skill key is a graceful
 * no-op (no affordance) - never a crash, never a raw key on screen.
 */
const FAMILIAR_SKILL_KEYS: readonly string[] = [
  'explain_anew', 'quiz_me', 'worked_example', 'socratic_drill',
  'flashcard_forge', 'step_checker', 'polyglot', 'map_sight',
  'weakness_sight', 'progress_mirror', 'recap_scribe', 'photo_sight',
  'reminder_bell', 'path_weaver', 'kg_explore', 'goal_scribe',
  'atom_forge', 'study_calendar', 'web_research', 'source_reader',
  'fact_check', 'duel_second', 'dawn_briefing', 'watchful_eye',
  'long_weaving', 'twin_rituals', 'weave_mastery',
];

const FAMILIAR_SKILL_ENTRIES: Readonly<Record<string, TooltipEntry>> =
  Object.fromEntries(
    FAMILIAR_SKILL_KEYS.map((k): [string, TooltipEntry] => [`skill.${k}`, skillEntry(k)]),
  );

export const TOOLTIP_REGISTRY: Readonly<Record<string, TooltipEntry>> = {
  mana: entry('mana'),
  familiar: entry('familiar'),
  daily_dose: entry('daily_dose'),
  growth_edge: entry('growth_edge'),
  cognitive_level: entry('cognitive_level'),
  grounding: entry('grounding'),
  topic: entry('topic'),
  instructions_ai: entry('instructions_ai'),
  skillsfuture: entry('skillsfuture'),
  // DEFERRED pending ADR-A: 'atom' / 'question' microcopy.
  // DEFERRED pending ADR-B: mastery-band microcopy ('shaky'/'wobbly'/'solid'/...).
  ...FAMILIAR_SKILL_ENTRIES,
};

/**
 * Resolves microcopy registry keys to translated content via the i18n service.
 * `providedIn: 'root'` - one shared dictionary across all surfaces.
 */
@Injectable({ providedIn: 'root' })
export class TooltipRegistryService {
  private readonly translate = inject(TranslateService);

  /** True when `key` is a registered microcopy term. */
  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(TOOLTIP_REGISTRY, key);
  }

  /**
   * Resolve a registry key to its translated label + description. Returns
   * `null` for an unknown key so callers render no affordance - a missing term
   * is a graceful no-op, never a crash and never a raw key leaked to the user.
   */
  resolve(key: string): ResolvedTooltip | null {
    const found = TOOLTIP_REGISTRY[key];
    if (!found) {
      return null;
    }
    return {
      label: this.translate.instant(found.labelKey),
      description: this.translate.instant(found.descriptionKey),
    };
  }
}
