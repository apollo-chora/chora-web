import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Section-parameterised locale parity guard (row E6, owner ruling R48).
 *
 * WHY THIS EXISTS
 * `familiar-skill.i18n.spec.ts` proved the shape on one flat section. This is
 * the same guard taken to the sections row E6 owns, and it is parameterised
 * because the gap is not one section's problem: measured on 2026-09-03 against
 * `c052ddd44`, en carried 769 `hplus.*` leaves and 90 under `admin.wizard.*`,
 * while each of the four target locales carried 103 and 0. So 756 of 859 keys
 * per locale were falling back.
 *
 * A missing key is not a blank. The translate pipe renders a humanised version
 * of the KEY, so a tenant admin reading Tamil is shown English, or a string no
 * person ever wrote. On H+ that lands on billing, ownership transfer and the
 * go-live gate, which are the screens where a misread is most expensive.
 *
 * WHAT THIS ASSERTS
 * Three things, all structural, none about meaning:
 *   1. KEY parity per section: every leaf en authors, each locale defines.
 *   2. NO EXTRA keys, file-wide: a locale may not carry a key en lacks. Such a
 *      key has no source, no reader and no way to be reviewed. This is what
 *      retires the 17 orphan `aplus.wallet.ledger_*` keys.
 *   3. PLACEHOLDER parity: the set of `{{token}}` interpolations in a
 *      translated value must equal the set in the English source. A dropped
 *      `{{count}}` renders the sentence without its number; an invented one
 *      renders the token literally on screen.
 *
 * It deliberately says nothing about the VALUES themselves. These translations
 * are machine-drafted and pending native review; a guard that compared text
 * would either forbid a legitimate rendering or demand a dictionary this repo
 * does not have. Key and placeholder structure is what a test can own.
 */

const I18N_DIR = ['public', 'assets', 'i18n'];

/**
 * The sections row E6 owns.
 *
 * `common` joined them after the RTL walk: `/h/setup` rendered its primary
 * buttons as the raw keys `common.next` and `common.cancel`, because en held
 * 23 `common.*` keys and each locale held 5. A shared section is exactly where
 * a gap hides, since no single screen owns it and every screen shows it.
 */
const SECTIONS = ['hplus', 'admin.wizard', 'common'] as const;

const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = ['zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'] as const;

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * Flatten to dotted LEAF paths. Comparing top-level keys is vacuous: `hplus`
 * has 18 subsections and 769 leaves, so a locale carrying all 18 names with
 * empty bodies would satisfy a shallow check while every string under them
 * still fell back.
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

/** Leaf path -> value, for the placeholder check. */
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

/**
 * Locate the chora-web root (holds public/assets/i18n/en.json). Fails loud.
 *
 * Checks each ancestor AND that ancestor's `chora-web/` child, so the spec
 * resolves whether vitest runs from the package root (the gate) or from the
 * repository root (a worktree). Walking up alone fails from the repo root,
 * because the bundles live DOWN one level from there, and the failure reads
 * as a broken suite rather than as a wrong working directory.
 */
function findWebRoot(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    for (const candidate of [dir, join(dir, 'chora-web')]) {
      try {
        statSync(join(candidate, ...I18N_DIR, 'en.json'));
        return candidate;
      } catch {
        // not this one; try the next candidate, then the next ancestor
      }
    }
    dir = dirname(dir);
  }
  throw new Error(
    `hplus-locale-parity.i18n.spec: could not locate public/assets/i18n/en.json ` +
      `from ${process.cwd()} or any of its 6 ancestors, nor a chora-web/ child of one`,
  );
}

const WEB_ROOT = findWebRoot();

function loadBundle(locale: string): JsonValue {
  const raw = readFileSync(join(WEB_ROOT, ...I18N_DIR, `${locale}.json`), 'utf8');
  return JSON.parse(raw) as JsonValue;
}

/** Resolve a dotted section path, e.g. `admin.wizard`. Missing resolves to {}. */
function resolveSection(bundle: JsonValue, dotted: string): JsonValue {
  let node: JsonValue = bundle;
  for (const seg of dotted.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return {};
    node = (node as Record<string, JsonValue>)[seg];
    if (node === undefined) return {};
  }
  return node ?? {};
}

/** Interpolation tokens the translate pipe substitutes, e.g. `{{count}}`. */
function placeholders(value: JsonValue): readonly string[] {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]).sort();
}

const BUNDLES = Object.fromEntries(
  [SOURCE_LOCALE, ...TARGET_LOCALES].map((l) => [l, loadBundle(l)]),
) as Record<string, JsonValue>;

const sourceKeysBySection = Object.fromEntries(
  SECTIONS.map((s) => [s, [...leafPaths(resolveSection(BUNDLES[SOURCE_LOCALE], s))].sort()]),
) as Record<string, readonly string[]>;

describe('H+ locale parity (row E6)', () => {
  it('reads plausible source sections (guards against a vacuous pass)', () => {
    // A parity test against an empty source passes trivially and proves
    // nothing. These floors are the measured counts at c052ddd44, minus a
    // margin, so the guard fails loudly if a section is ever renamed away
    // rather than quietly passing over nothing.
    expect(sourceKeysBySection['hplus'].length).toBeGreaterThan(700);
    expect(sourceKeysBySection['admin.wizard'].length).toBeGreaterThan(80);
    expect(sourceKeysBySection['common'].length).toBeGreaterThan(20);
    expect(TARGET_LOCALES.length).toBe(4);
  });

  describe.each(SECTIONS)('%s', (section) => {
    it.each(TARGET_LOCALES)('%s defines every key en defines', (locale) => {
      const keys = leafPaths(resolveSection(BUNDLES[locale], section));
      const missing = sourceKeysBySection[section].filter((k) => !keys.includes(k));
      expect(
        missing,
        `${locale}.json is missing ${missing.length} of ` +
          `${sourceKeysBySection[section].length} ${section} keys, so each one ` +
          `renders as a humanised English key rather than as a translation:\n` +
          missing
            .slice(0, 40)
            .map((k) => `  ${section}.${k}`)
            .join('\n') +
          (missing.length > 40 ? `\n  ... and ${missing.length - 40} more` : ''),
      ).toEqual([]);
    });
  });

  it.each(TARGET_LOCALES)('%s carries no key en lacks, file-wide', (locale) => {
    const sourceAll = new Set(leafPaths(BUNDLES[SOURCE_LOCALE]));
    const extra = [...leafPaths(BUNDLES[locale])].filter((k) => !sourceAll.has(k)).sort();
    expect(
      extra,
      `${locale}.json defines ${extra.length} keys en does not. A key with no ` +
        `English source has nothing to be translated from and nothing to be ` +
        `reviewed against, and no reader can reach it:\n` +
        extra.map((k) => `  ${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s preserves every interpolation en uses', (locale) => {
    const sourceValues = new Map(leafEntries(BUNDLES[SOURCE_LOCALE]));
    const drifted: string[] = [];
    for (const [key, value] of leafEntries(BUNDLES[locale])) {
      if (!sourceValues.has(key)) continue;
      const want = placeholders(sourceValues.get(key) as JsonValue);
      const got = placeholders(value);
      if (want.join('|') !== got.join('|')) {
        drifted.push(`  ${key}: en has [${want.join(', ')}], ${locale} has [${got.join(', ')}]`);
      }
    }
    expect(
      drifted,
      `${locale}.json changes the interpolation set on ${drifted.length} keys. ` +
        `A dropped token renders the sentence without its value; an invented ` +
        `one renders literally on screen:\n` +
        drifted.join('\n'),
    ).toEqual([]);
  });
});
