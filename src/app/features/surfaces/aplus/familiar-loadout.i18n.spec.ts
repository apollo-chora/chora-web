import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Loadout locale parity guard (D3 slice 3).
 *
 * WHY THIS EXISTS
 * `familiar_loadout.*` is the entire skills panel a learner sees on the
 * character sheet: the heading, the slot counter, every equip and unequip
 * label, every error, and the whole answerable-practice block. On 2026-09-02 en
 * carried 34 keys and zh-CN, ms-MY, ta-IN and ar-SA carried NONE. Not a thin
 * section, not a partial one: the key `familiar_loadout` was absent from all
 * four files.
 *
 * It is the third instance of one defect class. `familiar_skill` was 27 against
 * 1 (B1b) and `familiar_grimoire` 166 leaves against 2 (D3 slice 2a). The class
 * survives review because of the fallback: a missing key does NOT render blank
 * and does NOT render the key in production, it renders `humanizeI18nKey`, so
 * "equip_error_slots_full" becomes "Equip Error Slots Full" and the panel looks
 * translated until someone reads it in the wrong language. Eyeballing cannot
 * find this. A guard can.
 *
 * WHAT THIS ASSERTS
 * KEY parity only, in both directions, with `en` as the authored source, plus a
 * blank check. It says nothing about the VALUES: a guard comparing text would
 * either forbid a translation from differing from English or demand a
 * dictionary this repo does not have.
 *
 * This file is the `familiar_skill` guard with one constant changed, which was
 * the point of parameterising it on SECTION. The vacuity assertions below are
 * deliberately NOT a frozen total: the loadout is live ground for D1 and a
 * `toBe(34)` would go red the hour a sibling package adds a key. That already
 * happened once, to the first version of the grimoire guard.
 */

/** Locale bundles live here; en is the authored source. */
const I18N_DIR = ['public', 'assets', 'i18n'];

/** The section under guard. */
const SECTION = 'familiar_loadout';

/** The authored source, then every locale that must match it. */
const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = ['zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'] as const;

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * Flatten a section to dotted LEAF paths. `familiar_loadout` is flat today, so
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
    `familiar-loadout.i18n.spec: could not locate public/assets/i18n/en.json walking up from ${process.cwd()}`,
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
    expect(sourceKeys).toContain('equip');
    expect(sourceKeys).toContain('equip_error_slots_full');
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

  it('carries the slot counter in both units, in every locale', () => {
    // The ruled copy names two different numbers: a COUNT of active skills and
    // a SUM of slot costs. They are not the same number whenever a 2-cost skill
    // is equipped, and the old single "X of Y" line silently reported the slot
    // sum under a "Skills active" label. Both interpolation tokens must survive
    // translation or the sentence loses the half the label used to lie about.
    for (const locale of [SOURCE_LOCALE, ...TARGET_LOCALES]) {
      const section = loadSection(locale) as Record<string, string>;
      for (const key of ['slots_summary_one', 'slots_summary_other']) {
        const copy = section[key];
        expect(copy, `${locale}.json is missing ${SECTION}.${key}`).toBeTypeOf('string');
        expect(copy, `${locale} ${key} lost the slots-used token`).toContain('{{used}}');
        expect(copy, `${locale} ${key} lost the slot-cap token`).toContain('{{cap}}');
      }
      // Only the plural form carries a skill COUNT; the singular states it.
      expect(
        section['slots_summary_other'],
        `${locale} slots_summary_other lost the skill-count token`,
      ).toContain('{{skills}}');
      expect(
        section['slots_hint'],
        `${locale} is missing the two-slot tooltip, so a learner cannot tell ` +
          `why the two numbers differ`,
      ).toBeTypeOf('string');
    }
  });
});
