import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APLUS_COMPASS } from './compass.config';

/**
 * `aplus.shell` locale parity guard (Track U Phase C, C2).
 *
 * WHY THIS EXISTS
 * The compass bar is the A+ navigation: six words that appear on every A+
 * screen. This is the FIFTH instance of one defect class, after
 * `familiar_skill` (27 leaves against 1), `familiar_grimoire` (166 against 2),
 * `familiar_loadout` (34 against 0) and `home` (29 against 0). It keeps
 * surviving review because the production fallback is `humanizeI18nKey`, so a
 * missing key renders as "Roster" rather than as a blank or a raw key, and the
 * screen looks translated until someone reads it in the wrong language.
 *
 * The section it replaces, `aplus.nav`, is a SIXTH instance found while writing
 * this: it exists in en only and is absent from all four other locales. It is
 * left alone here rather than translated, because the compass makes those
 * entries unrendered on A+ and translating a section on its way out would be
 * work with no reader. That is recorded, not silently skipped.
 *
 * Unlike the `home` guard this one resolves a DOTTED section path, because the
 * section is nested under `aplus` rather than being top-level.
 */

const I18N_DIR = ['public', 'assets', 'i18n'];

/** Dotted path to the section under guard. */
const SECTION = 'aplus.shell';

const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = ['zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'] as const;

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

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
    `compass.i18n.spec: could not locate public/assets/i18n/en.json walking up from ${process.cwd()}`,
  );
}

const WEB_ROOT = findWebRoot();

/** Resolve a DOTTED section path; `{}` when any hop is missing. */
function loadSection(locale: string): JsonValue {
  const raw = readFileSync(join(WEB_ROOT, ...I18N_DIR, `${locale}.json`), 'utf8');
  let node: JsonValue = JSON.parse(raw) as JsonValue;
  for (const hop of SECTION.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return {};
    node = (node as Record<string, JsonValue>)[hop] ?? {};
  }
  return node;
}

const sourceKeys = [...leafPaths(loadSection(SOURCE_LOCALE))].sort();

describe(`${SECTION} locale parity`, () => {
  it('reads a plausible source section (guards against a vacuous pass)', () => {
    // A parity test against an empty source passes trivially, and `loadSection`
    // returns {} for a missing section, so without this the four locales would
    // agree with an empty en and the file would go green translating nothing.
    expect(sourceKeys.length).toBeGreaterThanOrEqual(7);
    expect(sourceKeys).toContain('compass.aria');
    expect(TARGET_LOCALES.length).toBe(4);
  });

  it('defines a label for every entry the compass actually renders', () => {
    // Keyed off the CONFIG, not off a copied list: an entry added to the bar
    // with no copy behind it fails here rather than shipping as a humanised key.
    for (const item of APLUS_COMPASS) {
      const relative = item.labelKey.replace(`${SECTION}.`, '');
      expect(sourceKeys, `en.json is missing ${item.labelKey}`).toContain(relative);
    }
  });

  it.each(TARGET_LOCALES)('%s defines every aplus.shell string en defines', (locale) => {
    const keys = leafPaths(loadSection(locale));
    const missing = sourceKeys.filter((k) => !keys.includes(k));
    expect(
      missing,
      `${locale}.json is missing ${missing.length} of ${sourceKeys.length} ` +
        `${SECTION} keys, so each renders as a humanised English key rather ` +
        `than as translated copy:\n` +
        missing.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s defines no aplus.shell string en does not', (locale) => {
    const keys = [...leafPaths(loadSection(locale))].sort();
    const extra = keys.filter((k) => !sourceKeys.includes(k));
    expect(
      extra,
      `${locale}.json defines ${SECTION} keys that en does not, so nothing ` +
        `will ever render them:\n` +
        extra.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s leaves no aplus.shell string blank', (locale) => {
    const blank = leafEntries(loadSection(locale))
      .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      .map(([k]) => k);
    expect(
      blank,
      `${locale}.json has ${SECTION} keys present but empty, which renders ` +
        `nothing at all rather than falling back:\n` +
        blank.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it('says Map and Roster rather than Discover and Cast (plan section 3.3)', () => {
    // The vocabulary is the ruling, so it is pinned in en rather than left to
    // whoever edits the file next. The retired sidebar entry read "Discover";
    // its key left en.json with the config in C2 slice 3, so it is described
    // rather than named here.
    const en = loadSection(SOURCE_LOCALE) as Record<string, Record<string, string>>;
    expect(en['compass']?.['map']).toBe('Map');
    expect(en['compass']?.['roster']).toBe('Roster');
  });
});
