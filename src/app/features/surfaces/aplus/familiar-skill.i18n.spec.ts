import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Skill-name locale parity guard (B1b).
 *
 * WHY THIS EXISTS
 * `familiar_skill.*` holds the learner-facing NAME of every skill a companion
 * can equip. The Grimoire loadout, the invoke list and the routine editor all
 * render from it, so a missing key is not a blank: the translate pipe falls
 * back to a humanised version of the KEY, and a learner reading Tamil is shown
 * "Socratic Drill" or, worse, a key-derived string that was never written by a
 * person. It degrades silently and it degrades on the screen the owner calls
 * the headline feature.
 *
 * On 2026-09-02 en carried 27 entries and zh-CN, ms-MY, ta-IN and ar-SA carried
 * exactly one each: `kg_explore`, added by a separate package. So 26 of 27
 * names were falling back in four of the five locales.
 *
 * WHAT THIS ASSERTS
 * KEY parity only, in both directions, with `en` as the authored source. It
 * deliberately says nothing about the VALUES, because a guard that compared
 * text would either forbid a translation from differing from English or
 * demand a dictionary this repo does not have. Missing means untranslated;
 * extra means a key that no longer exists in the source and will never render.
 *
 * SCOPE NOTE
 * `familiar_grimoire` has the same shape of gap (19 in en against 2 in each of
 * the four) and is NOT covered here, because it was outside package B1b. It
 * wants the same treatment and the same guard.
 */

/** Locale bundles live here; en is the authored source. */
const I18N_DIR = ['public', 'assets', 'i18n'];

/** The section under guard. */
const SECTION = 'familiar_skill';

/** The authored source, then every locale that must match it. */
const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = ['zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'] as const;

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * Flatten a section to dotted LEAF paths.
 *
 * Comparing top-level keys is not enough and the difference is not academic.
 * `familiar_grimoire` has 19 top-level keys in en and 166 leaves: `persona`,
 * `routines` and `params` are deep objects. A locale carrying all 19 top-level
 * names with empty bodies would satisfy a shallow check while every string
 * under them still fell back. The first draft of this guard did exactly that,
 * and it is the same vacuity that let the original gap survive.
 *
 * For a flat section this is a no-op, which is the point: the guard must not
 * depend on the section it happens to be pointed at being flat.
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
    `familiar-skill.i18n.spec: could not locate public/assets/i18n/en.json walking up from ${process.cwd()}`,
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
    // A parity test against an empty source passes trivially and proves
    // nothing, which is exactly how this gap survived: every locale agreed
    // with a section nobody was reading.
    expect(sourceKeys.length).toBeGreaterThan(20);
    expect(sourceKeys).toContain('kg_explore');
    expect(sourceKeys).toContain('socratic_drill');
    expect(TARGET_LOCALES.length).toBe(4);
  });

  it.each(TARGET_LOCALES)('%s defines every skill name en defines', (locale) => {
    const keys = leafPaths(loadSection(locale) as JsonValue);
    const missing = sourceKeys.filter((k) => !keys.includes(k));
    expect(
      missing,
      `${locale}.json is missing ${missing.length} of ${sourceKeys.length} ` +
        `${SECTION} keys, so each one renders as a humanised English key ` +
        `rather than as a translated name:\n` +
        missing.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s defines no skill name en does not', (locale) => {
    const keys = [...leafPaths(loadSection(locale) as JsonValue)].sort();
    const extra = keys.filter((k) => !sourceKeys.includes(k));
    expect(
      extra,
      `${locale}.json defines ${SECTION} keys that en does not, so nothing ` +
        `will ever render them:\n` +
        extra.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s leaves no skill name blank', (locale) => {
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
});
