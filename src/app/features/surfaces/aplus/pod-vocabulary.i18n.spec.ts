import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pod vocabulary guard.
 *
 * The learner-facing word for a Stage-0 Familiar is POD, never "Egg". The
 * Stage-0 artwork IS a pod (`/assets/familiars/pods/pod-standard.png`) and
 * roughly forty en.json values already say Pod ("Your Pod", "Open the Pod",
 * "An iridescent Pod", "Companion Pod Catalog", "A mysterious Pod").
 *
 * The word `egg` survives DELIBERATELY on the code side: i18n KEYS
 * (`aplus.familiar_egg.*`, `aplus.incubation.untitled_egg`), field names,
 * routes and Go columns. The owner's standing rule is "i18n VALUES only, code
 * stays familiar/egg" - so this guard is deliberately asymmetric: it reads
 * VALUES and ignores keys entirely.
 *
 * Both halves of the leak this guards against were live on 2026-08-07:
 *   - en.json values were already clean, but nothing stopped a regression;
 *   - the Stage-0 label was hard-coded 'Egg' in TypeScript, bypassing i18n
 *     altogether. Hence the second describe: a display label that never passes
 *     through en.json is invisible to a values-only scan.
 */

/** Locale bundles live here; en is the authored source, the rest are stubs. */
const I18N_DIR = ['public', 'assets', 'i18n'];

/** Whole-word `egg` / `Egg` / `eggs` - "leggings" and the like must not trip. */
const EGG_WORD = /\begg(s|)\b/i;

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
    `pod-vocabulary.i18n.spec: could not locate public/assets/i18n/en.json walking up from ${process.cwd()}`,
  );
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/** Flatten a bundle to `dotted.key -> string value` pairs (VALUES only). */
function flattenValues(node: JsonValue, path = ''): readonly (readonly [string, string])[] {
  if (typeof node === 'string') {
    return [[path, node] as const];
  }
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => flattenValues(v, `${path}[${i}]`));
  }
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) =>
      flattenValues(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

function loadBundle(root: string, locale: string): JsonValue {
  return JSON.parse(readFileSync(join(root, ...I18N_DIR, `${locale}.json`), 'utf8')) as JsonValue;
}

const WEB_ROOT = findWebRoot();
const LOCALES = readdirSync(join(WEB_ROOT, ...I18N_DIR))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

describe('i18n VALUES speak Pod, never Egg', () => {
  it('finds the locale bundles (positive control - a zero-file scan proves nothing)', () => {
    expect(LOCALES).toContain('en');
    expect(LOCALES.length).toBeGreaterThan(1);
  });

  for (const locale of LOCALES) {
    it(`${locale}.json has no learner-facing "egg" in any value`, () => {
      const offenders = flattenValues(loadBundle(WEB_ROOT, locale))
        .filter(([, value]) => EGG_WORD.test(value))
        .map(([key, value]) => `${key} = ${JSON.stringify(value)}`);
      expect(offenders).toEqual([]);
    });
  }

  it('keeps the egg-spelled KEYS intact (code stays familiar/egg)', () => {
    // The asymmetry is the point: renaming these keys is out of scope and would
    // orphan every reference in the templates.
    const keys = flattenValues(loadBundle(WEB_ROOT, 'en')).map(([k]) => k);
    expect(keys).toContain('aplus.incubation.untitled_egg');
    expect(keys.some((k) => k.startsWith('aplus.familiar_egg.'))).toBe(true);
  });

  it('the untitled-Pod string the pre-hatch screens fall back to says Pod', () => {
    const values = new Map(flattenValues(loadBundle(WEB_ROOT, 'en')));
    expect(values.get('aplus.incubation.untitled_egg')).toMatch(/Pod/);
    expect(values.get('aplus.dashboard.cast.untitled_pod')).toMatch(/Pod/);
  });
});

/**
 * Display strings that never pass through en.json.
 *
 * `BREED_ADJECTIVE[species][0]` was 'Egg' for all nine species and reached the
 * learner directly, so a values-only scan could never have caught it. Any
 * future hard-coded label is caught here.
 */
describe('hard-coded Stage-0 labels in TypeScript say Pod', () => {
  /**
   * Blank out comments while preserving line numbering, so the scan sees CODE
   * only. Prose legitimately discusses the placeholder ("a backend that changes
   * \"Egg\" to something else"), and a guard its own rationale trips is a guard
   * nobody keeps.
   */
  function stripComments(source: string): readonly string[] {
    const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
      block.replace(/[^\n]/g, ' '),
    );
    return withoutBlocks.split('\n').map((line) => line.replace(/\/\/.*$/, ''));
  }

  it('familiar-growth.model.ts holds no display literal spelling Egg', () => {
    const source = readFileSync(
      join(WEB_ROOT, 'src', 'app', 'core', 'familiar', 'familiar-growth.model.ts'),
      'utf8',
    );
    const offenders = stripComments(source)
      .map((line, i) => [i + 1, line] as const)
      // Quoted literals only. STAGE_NAMES' lowercase 'egg' is an i18n key
      // segment rather than display text, so the match is capitalised.
      .filter(([, line]) => /['"]Egg['"]/.test(line))
      .map(([n, line]) => `${n}: ${line.trim()}`);
    expect(offenders).toEqual([]);
  });

  it('the guard actually fires (positive control - a clean scan proves nothing)', () => {
    const planted = ["const x = {", "  0: 'Egg',", "};"].join('\n');
    const offenders = stripComments(planted).filter((line) => /['"]Egg['"]/.test(line));
    expect(offenders.length).toBe(1);
    // ... and comments are exempt, both styles.
    expect(
      stripComments("// says 'Egg'\n/* also 'Egg' */").filter((l) => /['"]Egg['"]/.test(l)),
    ).toEqual([]);
  });
});
