/**
 * Familiar Persona (Grimoire Persona sheet) model — front-end shapes mirror the
 * chora-consumption persona handlers + chora-gateway FamiliarBridge contract
 * (CHO-2015, ADR-219 D2).
 *
 * The persona wire is camelCase END-TO-END and is NOT `{data:T}`-enveloped —
 * FamiliarBridge proxies with `classify` (raw pass-through), like rituals. So
 * the service consumes/sends camelCase directly and validates every response
 * with a type guard (fail-loud — no fabricated shapes).
 *
 * The bounded grammar below MIRRORS the domain aggregate
 * (services/chora-consumption/internal/domain/familiar/persona.go) — the single
 * source of truth is the domain; these are display/validation aids so the UI
 * offers only legal choices and the server's 422 is a backstop, not the primary
 * gate. The one free-text field (guidanceNote) is Model-Armor-screened at save.
 */

// ── Bounded grammar limits (mirror persona.go). ──────────────────────────────
export const PERSONA_NOTE_MAX_LEN = 280;
export const PERSONA_MAX_HINTS_CEILING = 5;
export const PERSONA_MAX_INTEREST_CHIPS = 8;
export const PERSONA_INTEREST_CHIP_MAX_LEN = 32;
export const PERSONA_ARCHETYPE_MAX_LEN = 64;

// ── Bounded enum sets (mirror persona.go allowed maps). ──────────────────────
export type PersonaTone = 'socratic' | 'direct' | 'encouraging';
export const PERSONA_TONES: readonly PersonaTone[] = ['socratic', 'direct', 'encouraging'];

export type PersonaHintProgression = 'ladder' | 'uniform';
export const PERSONA_HINT_PROGRESSIONS: readonly PersonaHintProgression[] = ['ladder', 'uniform'];

export type PersonaDifficulty = 'foundation' | 'intermediate' | 'advanced';
export const PERSONA_DIFFICULTIES: readonly PersonaDifficulty[] = [
  'foundation',
  'intermediate',
  'advanced',
];

export type PersonaCitation = 'strict' | 'lenient';
export const PERSONA_CITATIONS: readonly PersonaCitation[] = ['strict', 'lenient'];

export type PersonaLanguage = 'en' | 'zh' | 'ms';
export const PERSONA_LANGUAGES: readonly PersonaLanguage[] = ['en', 'zh', 'ms'];

export type PersonaAddressStyle = 'first_name' | 'nickname' | 'formal';
export const PERSONA_ADDRESS_STYLES: readonly PersonaAddressStyle[] = [
  'first_name',
  'nickname',
  'formal',
];

/** The read projection returned by GET .../persona (`personaViewDTO`). */
export interface PersonaView {
  readonly tone: PersonaTone;
  readonly hintProgression: PersonaHintProgression;
  readonly maxHintsBeforeReveal: number;
  readonly difficultyCap: PersonaDifficulty;
  readonly language: PersonaLanguage;
  readonly citationStrictness: PersonaCitation;
  readonly archetype: string;
  readonly addressStyle: PersonaAddressStyle;
  readonly interestChips: readonly string[];
  readonly guidanceNote: string;
  /** Monotonic server-owned counter, bumped on each save. */
  readonly version: number;
}

/**
 * The PUT body — a full replace of the editable persona surface. camelCase,
 * pass-through (no snake translation). Version is server-owned, never sent.
 */
export interface PersonaEditRequest {
  readonly tone: PersonaTone;
  readonly hintProgression: PersonaHintProgression;
  readonly maxHintsBeforeReveal: number;
  readonly difficultyCap: PersonaDifficulty;
  readonly language: PersonaLanguage;
  readonly citationStrictness: PersonaCitation;
  readonly archetype: string;
  readonly addressStyle: PersonaAddressStyle;
  readonly interestChips: readonly string[];
  readonly guidanceNote: string;
}

// ── Type guard (FE-law: guard every API response; fail-loud on malformed). ───

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function isPersonaView(x: unknown): x is PersonaView {
  if (!isRecord(x)) return false;
  return (
    typeof x['tone'] === 'string' &&
    typeof x['hintProgression'] === 'string' &&
    typeof x['maxHintsBeforeReveal'] === 'number' &&
    typeof x['difficultyCap'] === 'string' &&
    typeof x['language'] === 'string' &&
    typeof x['citationStrictness'] === 'string' &&
    typeof x['archetype'] === 'string' &&
    typeof x['addressStyle'] === 'string' &&
    Array.isArray(x['interestChips']) &&
    x['interestChips'].every((c) => typeof c === 'string') &&
    typeof x['guidanceNote'] === 'string' &&
    typeof x['version'] === 'number'
  );
}
