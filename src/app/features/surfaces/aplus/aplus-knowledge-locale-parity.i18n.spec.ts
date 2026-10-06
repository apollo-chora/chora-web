import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Section-parameterised locale parity guard for the A+ knowledge surface
 * (row C-T, owner ruling R48).
 *
 * WHY THIS EXISTS
 * The five sections below are the learner's own knowledge surface, and measured
 * on 2026-09-03 against `7049f3e76` they carried 537 leaves in en and ZERO in
 * every one of the four target locales. Not a gap: the whole surface was
 * English-only. In production a miss renders `humanizeI18nKey(key)`, so a
 * learner reading Tamil is shown a label derived from an English key that no
 * person wrote; in dev it renders the raw dotted key.
 *
 * This is the A+ twin of `surfaces/hplus/hplus-locale-parity.i18n.spec.ts` and
 * deliberately does NOT repeat that spec's file-wide "no key en lacks"
 * assertion, which already covers every locale once. Two guards asserting the
 * same global fact would fail together and be fixed twice.
 *
 * WHAT THIS ASSERTS
 *   1. KEY parity per section, en as the authored source.
 *   2. PLACEHOLDER parity: the `{{token}}` set of a translated value must equal
 *      the English one. `campaign_hud_progress` alone carries two.
 *   3. That its OWN failure message names the missing key (see below).
 *
 * It says nothing about meaning. These translations are machine-drafted and
 * pending native review, so a guard that compared text would either forbid a
 * legitimate rendering or demand a dictionary this repo does not have.
 *
 * WHY THERE IS A TEST OF THE FAILURE MESSAGE
 * UX-subagent5 made the point after its `ng build` gate grepped for `error TS`,
 * which `tsc` prints and the Angular compiler does not, so the gate reported a
 * real template error as "the compiler never ran". A failure-shape check is
 * itself a claim about output, and needs its own positive control. A guard
 * whose message is wrong is worse than no guard: it sends the next person to
 * the wrong file. So `missingReport` is a pure function, and one test feeds it
 * a synthetic miss and asserts the key appears in what it returns.
 */

const I18N_DIR = ['public', 'assets', 'i18n'];

/** The sections row C-T owns. */
const SECTIONS = [
  'aplus.knowledge',
  'aplus.growth_edge_review',
  'aplus.discovery',
  'aplus.growth_edges',
  'aplus.kg_terrain',
] as const;

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

/**
 * Build the missing-keys failure message.
 *
 * Pure and exported to the tests below precisely so its output can be asserted.
 * Truncates the list because a first run of this row would otherwise print 537
 * lines four times over and bury the count that matters.
 */
export function missingReport(
  locale: string,
  section: string,
  missing: readonly string[],
  total: number,
): string {
  const shown = missing.slice(0, 40).map((k) => `  ${section}.${k}`);
  const rest = missing.length > 40 ? [`  ... and ${missing.length - 40} more`] : [];
  return (
    `${locale}.json is missing ${missing.length} of ${total} ${section} keys, ` +
    `so each one renders as a humanised English key rather than as a ` +
    `translation:\n${[...shown, ...rest].join('\n')}`
  );
}

/**
 * Locate the chora-web root. Checks each ancestor AND that ancestor's
 * `chora-web/` child, so the spec resolves whether vitest runs from the package
 * root or the repository root. Walking up alone throws from the repo root, and
 * vitest reports that as "no tests" with exit 1, which reads exactly like a RED
 * while asserting nothing.
 */
function findWebRoot(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    for (const candidate of [dir, join(dir, 'chora-web')]) {
      try {
        statSync(join(candidate, ...I18N_DIR, 'en.json'));
        return candidate;
      } catch {
        // not this one
      }
    }
    dir = dirname(dir);
  }
  throw new Error(
    `aplus-knowledge-locale-parity.i18n.spec: could not locate ` +
      `public/assets/i18n/en.json from ${process.cwd()} or any of its 6 ancestors, ` +
      `nor a chora-web/ child of one`,
  );
}

const WEB_ROOT = findWebRoot();

function loadBundle(locale: string): JsonValue {
  return JSON.parse(
    readFileSync(join(WEB_ROOT, ...I18N_DIR, `${locale}.json`), 'utf8'),
  ) as JsonValue;
}

function resolveSection(bundle: JsonValue, dotted: string): JsonValue {
  let node: JsonValue = bundle;
  for (const seg of dotted.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return {};
    node = (node as Record<string, JsonValue>)[seg];
    if (node === undefined) return {};
  }
  return node ?? {};
}

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

describe('A+ knowledge locale parity (row C-T)', () => {
  it('reads plausible source sections (guards against a vacuous pass)', () => {
    // Floors are the counts measured at 7049f3e76 minus a margin, so a section
    // renamed away fails loudly instead of passing over an empty object.
    expect(sourceKeysBySection['aplus.knowledge'].length).toBeGreaterThan(280);
    expect(sourceKeysBySection['aplus.growth_edge_review'].length).toBeGreaterThan(70);
    expect(sourceKeysBySection['aplus.discovery'].length).toBeGreaterThan(95);
    expect(sourceKeysBySection['aplus.growth_edges'].length).toBeGreaterThan(35);
    expect(sourceKeysBySection['aplus.kg_terrain'].length).toBeGreaterThan(5);
    expect(TARGET_LOCALES.length).toBe(4);
  });

  it('reports a missing key by name (positive control on the failure message)', () => {
    // A guard whose message is wrong sends the next person to the wrong file.
    // Feed the reporter a synthetic miss and assert it names it.
    const msg = missingReport('ta-IN', 'aplus.kg_terrain', ['next_best'], 7);
    expect(msg).toContain('ta-IN.json is missing 1 of 7 aplus.kg_terrain keys');
    expect(msg).toContain('aplus.kg_terrain.next_best');
    // and that it truncates rather than printing hundreds of lines
    const many = missingReport('ar-SA', 'aplus.knowledge', Array.from({ length: 304 }, (_, i) => `k${i}`), 304);
    expect(many).toContain('... and 264 more');
    expect(many.split('\n').length).toBeLessThan(45);
  });

  describe.each(SECTIONS)('%s', (section) => {
    it.each(TARGET_LOCALES)('%s defines every key en defines', (locale) => {
      const keys = leafPaths(resolveSection(BUNDLES[locale], section));
      const missing = sourceKeysBySection[section].filter((k) => !keys.includes(k));
      expect(
        missing,
        missingReport(locale, section, missing, sourceKeysBySection[section].length),
      ).toEqual([]);
    });
  });

  it.each(TARGET_LOCALES)('%s preserves every interpolation en uses', (locale) => {
    const sourceValues = new Map(leafEntries(BUNDLES[SOURCE_LOCALE]));
    const drifted: string[] = [];
    for (const [key, value] of leafEntries(BUNDLES[locale])) {
      if (!key.startsWith('aplus.')) continue;
      if (!sourceValues.has(key)) continue;
      const want = placeholders(sourceValues.get(key) as JsonValue);
      const got = placeholders(value);
      if (want.join('|') !== got.join('|')) {
        drifted.push(`  ${key}: en has [${want.join(', ')}], ${locale} has [${got.join(', ')}]`);
      }
    }
    expect(
      drifted,
      `${locale}.json changes the interpolation set on ${drifted.length} A+ keys. ` +
        `A dropped token renders the sentence without its value; an invented one ` +
        `renders literally on screen:\n${drifted.join('\n')}`,
    ).toEqual([]);
  });
});
