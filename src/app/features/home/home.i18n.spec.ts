import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home locale parity guard (Track U Phase C, C1b).
 *
 * WHY THIS EXISTS
 * `home.*` is the launcher every signed-in user lands on, and on 2026-09-02 en
 * carried 29 leaves while zh-CN, ms-MY, ta-IN and ar-SA carried NONE. The
 * top-level key was absent from all four files, including `home.pins.*`, the
 * label under every icon on the screen.
 *
 * This is the FOURTH instance of one defect class, after `familiar_skill`
 * (27 against 1), `familiar_grimoire` (166 leaves against 2) and
 * `familiar_loadout` (34 against 0). It keeps surviving review for the same
 * reason each time: the production fallback is `humanizeI18nKey`, so a missing
 * key renders as "Palette Empty" rather than as a blank or a key, and the
 * screen looks translated until someone reads it in the wrong language.
 *
 * This file is the `familiar_loadout` guard with one constant changed, which is
 * what parameterising on SECTION was for.
 */

/** Locale bundles live here; en is the authored source. */
const I18N_DIR = ['public', 'assets', 'i18n'];

/** The section under guard. */
const SECTION = 'home';

/** The authored source, then every locale that must match it. */
const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = ['zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'] as const;

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * Flatten a section to dotted LEAF paths. `home` is flat today, so
 * this is currently a no-op, which is exactly why it is here: the guard must
 * not depend on the section it is pointed at staying flat.
 */
function leafPaths(node: JsonValue, path = ''): readonly string[] {
  if (node === null || typeof node !== 'object') {
    return path === '' ? [] : [path];
  }
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => leafPaths(v, `${path}[${i}]`));
  }
  return Object.entries(node).flatMap(([k, v]) =>
    leafPaths(v, path === '' ? k : `${path}.${k}`),
  );
}

/** Leaf path -> value, for the blank check. */
function leafEntries(node: JsonValue, path = ''): readonly (readonly [string, JsonValue])[] {
  if (node === null || typeof node !== 'object') {
    return path === '' ? [] : [[path, node] as const];
  }
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => leafEntries(v, `${path}[${i}]`));
  }
  return Object.entries(node).flatMap(([k, v]) =>
    leafEntries(v, path === '' ? k : `${path}.${k}`),
  );
}

/** Locate the chora-web root (holds public/assets/i18n/en.json). Fails loud. */
function findWebRoot(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    try {
      statSync(join(dir, ...I18N_DIR, 'en.json'));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(
    `home.i18n.spec: could not locate public/assets/i18n/en.json walking up from ${process.cwd()}`,
  );
}

const WEB_ROOT = findWebRoot();

function loadSection(locale: string): Record<string, unknown> {
  const raw = readFileSync(join(WEB_ROOT, ...I18N_DIR, `${locale}.json`), 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const section = parsed[SECTION];
  return section !== null && typeof section === 'object'
    ? (section as Record<string, unknown>)
    : {};
}

const sourceKeys = [...leafPaths(loadSection(SOURCE_LOCALE) as JsonValue)].sort();

describe(`${SECTION} locale parity`, () => {
  it('reads a plausible source section (guards against a vacuous pass)', () => {
    // A parity test against an empty source passes trivially. That is not a
    // hypothetical here: `loadSection` returns {} for a missing section, so
    // without this the four empty locales would agree with an empty en and the
    // whole file would go green while nothing was translated at all.
    expect(sourceKeys.length).toBeGreaterThan(30);
    expect(sourceKeys).toContain('heading');
    expect(sourceKeys).toContain('palette_empty');
    // A nested leaf, so a locale carrying the 14 flat keys and an empty `pins`
    // object cannot pass: the pin labels are the screen's actual words.
    expect(sourceKeys).toContain('pins.aplusKnowledge');
    expect(TARGET_LOCALES.length).toBe(4);
  });

  it.each(TARGET_LOCALES)('%s defines every loadout string en defines', (locale) => {
    const keys = leafPaths(loadSection(locale) as JsonValue);
    const missing = sourceKeys.filter((k) => !keys.includes(k));
    expect(
      missing,
      `${locale}.json is missing ${missing.length} of ${sourceKeys.length} ` +
        `${SECTION} keys, so each renders as a humanised English key rather ` +
        `than as translated copy:\n` +
        missing.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s defines no loadout string en does not', (locale) => {
    const keys = [...leafPaths(loadSection(locale) as JsonValue)].sort();
    const extra = keys.filter((k) => !sourceKeys.includes(k));
    expect(
      extra,
      `${locale}.json defines ${SECTION} keys that en does not, so nothing ` +
        `will ever render them:\n` +
        extra.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s leaves no loadout string blank', (locale) => {
    const blank = leafEntries(loadSection(locale) as JsonValue)
      .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      .map(([k]) => k);
    expect(
      blank,
      `${locale}.json has ${SECTION} keys present but empty, which renders ` +
        `nothing at all rather than falling back:\n` +
        blank.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it('carries the ranked-section copy the quest log needs', () => {
    // The C1b additions. Asserted per locale rather than only in en, because a
    // section that is present but thin is the shape that reads as done.
    for (const locale of [SOURCE_LOCALE, ...TARGET_LOCALES]) {
      const keys = leafPaths(loadSection(locale) as JsonValue);
      for (const key of [
        'quests.heading',
        'quests.loading',
        'quests.unread',
        'quests.empty',
        'quests.absent',
        'quests.no_route',
      ]) {
        expect(keys, `${locale}.json is missing home.${key}`).toContain(key);
      }
    }
  });

  it('carries a label for every band the server can rank on', () => {
    // Bands 5 to 1, the deadline-derived pair plus the three that are not.
    // Band 0 deliberately has NO label: "nothing is time-derived" is not a
    // thing to tell the learner, and a chip reading "None" would be noise on
    // the calmest card on the page.
    for (const locale of [SOURCE_LOCALE, ...TARGET_LOCALES]) {
      const keys = leafPaths(loadSection(locale) as JsonValue);
      for (const band of [5, 4, 3, 2, 1]) {
        expect(
          keys,
          `${locale}.json is missing home.quests.band_${band}, so a ranked ` +
            `card renders a humanised key where its band label belongs`,
        ).toContain(`quests.band_${band}`);
      }
      expect(keys).not.toContain('quests.band_0');
    }
  });

  it('carries a title for every card kind the aggregator emits today', () => {
    // Hand-mirrored from `medashboard/cards.go`, which the SPA cannot import.
    // A kind with no title falls to the generic copy, which is correct
    // behaviour and wrong copy: it would tell a learner "3 things are waiting
    // for you" about their remaining practice taps.
    //
    // `defend_hex` is deliberately ABSENT. It is C4's card and C4 owns its
    // copy; the generic fallback renders it until then, which is the property
    // the fallback exists to prove.
    const COUNT_BEARING = [
      'pending_diagnoses',
      'unseen_results',
      'practice_budget',
      'streak_at_risk',
      'instructor_courses',
    ];
    const SINGULAR = ['continue_learning', 'grading_queue', 'tenants_needing_setup'];

    for (const locale of [SOURCE_LOCALE, ...TARGET_LOCALES]) {
      const keys = leafPaths(loadSection(locale) as JsonValue);
      for (const kind of COUNT_BEARING) {
        expect(keys, `${locale}.json is missing home.quests.kind.${kind}_one`)
          .toContain(`quests.kind.${kind}_one`);
        expect(keys, `${locale}.json is missing home.quests.kind.${kind}_other`)
          .toContain(`quests.kind.${kind}_other`);
      }
      for (const kind of SINGULAR) {
        expect(keys, `${locale}.json is missing home.quests.kind.${kind}`)
          .toContain(`quests.kind.${kind}`);
      }
      for (const key of [
        'quests.kind.unknown_one',
        'quests.kind.unknown_other',
        'quests.error_code',
        'quests.go',
        'quests.go_handoff',
      ]) {
        expect(keys, `${locale}.json is missing home.${key}`).toContain(key);
      }
    }
  });

  it('carries the defend copy, both arms, in every locale', () => {
    // C4's card. Two arms because the companion name is OMITTED when nothing is
    // stationed, and "nobody is defending this" is a different sentence from
    // "somebody is", not the same sentence with a blank in it.
    //
    // It sits BESIDE `quests.kind.*`, not under it: every leaf under `kind` is
    // a string the kind table resolves by name, and an object there would break
    // that shape. It shipped once at `home.cards.defend_hex.*` and was unified
    // here before a second package could copy the split.
    for (const locale of [SOURCE_LOCALE, ...TARGET_LOCALES]) {
      const keys = leafPaths(loadSection(locale) as JsonValue);
      expect(keys, `${locale}.json is missing home.quests.defend_hex.title_defended`)
        .toContain('quests.defend_hex.title_defended');
      expect(keys, `${locale}.json is missing home.quests.defend_hex.title_undefended`)
        .toContain('quests.defend_hex.title_undefended');

      // The retired namespace leaves nothing behind. A leftover key is copy
      // nothing renders, and the next reader cannot tell which one is live.
      expect(
        keys.filter((k) => k.startsWith('cards.')),
        `${locale}.json still carries home.cards.* keys, which nothing reads`,
      ).toEqual([]);

      // Every leaf under `kind` stays a string, which is what the kind table
      // assumes when it builds a key by name.
      expect(keys.filter((k) => k.startsWith('kind.') && k.split('.').length > 2)).toEqual([]);
    }
  });

  it('keeps every interpolation placeholder in every locale', () => {
    // The D3 trap, one section over: a locale that loses `{{count}}` renders a
    // sentence with the number missing and no error anywhere, and spacing
    // differs between neighbouring keys so a normalised compare would hide it.
    // Compared as a SET of exact tokens, and `{{count}}` must stay a param
    // rather than a fragment stitched around a span, because word order moves
    // by locale and ar-SA is right to left.
    const tokens = (v: unknown): readonly string[] =>
      typeof v === 'string' ? (v.match(/\{\{[^}]*\}\}/g) ?? []).sort() : [];
    const source = new Map(
      leafEntries(loadSection(SOURCE_LOCALE) as JsonValue).map(([k, v]) => [k, tokens(v)]),
    );

    for (const locale of TARGET_LOCALES) {
      for (const [key, value] of leafEntries(loadSection(locale) as JsonValue)) {
        const want = source.get(key);
        if (want === undefined) continue;
        expect(
          tokens(value),
          `${locale}.json home.${key} does not carry the same placeholders as ` +
            `en: en has [${want.join(', ')}] and it has ` +
            `[${tokens(value).join(', ')}]`,
        ).toEqual(want);
      }
    }
  });
});
