import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Grimoire copy locale parity guard (D3).
 *
 * WHY THIS EXISTS
 * `familiar_grimoire.*` holds the surrounding copy of the character sheet: the
 * headings, the empty and locked states, the greyed reasons and, as D1 lands,
 * the step-card labels and the keyboard-reorder announcements. A missing key
 * is not a blank. The translate pipe falls back through `humanizeI18nKey`, so
 * production renders a plausible English phrase rather than an obvious broken
 * key, and only dev shows the key itself. That is what makes this class of
 * defect quiet enough to ship past: it looks translated until you read it in
 * the wrong language.
 *
 * On 2026-09-02 en carried 19 entries and zh-CN, ms-MY, ta-IN and ar-SA carried
 * two each, so 17 of 19 were falling back in four of the five locales. This is
 * the sibling of the `familiar_skill` gap closed in B1b; the guard is
 * parameterised on SECTION precisely so the second one cost a copy and an edit.
 *
 * WHAT THIS ASSERTS
 * KEY parity only, in both directions, with `en` as the authored source. It
 * deliberately says nothing about the VALUES, because a guard that compared
 * text would either forbid a translation from differing from English or
 * demand a dictionary this repo does not have. Missing means untranslated;
 * extra means a key that no longer exists in the source and will never render.
 *
 * D1 (UX-subagent3) keeps every new editor string inside this section by
 * agreement, so this guard covers those strings as they land without needing
 * to know their names in advance.
 */

/** Locale bundles live here; en is the authored source. */
const I18N_DIR = ['public', 'assets', 'i18n'];

/** The section under guard. */
const SECTION = 'familiar_grimoire';

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
    `familiar-grimoire.i18n.spec: could not locate public/assets/i18n/en.json walking up from ${process.cwd()}`,
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

describe(`${SECTION} source shape`, () => {
  it('reads a plausible source section (guards against a vacuous pass)', () => {
    // A parity test against an empty source passes trivially and proves
    // nothing, which is exactly how this gap survived: every locale agreed
    // with a section nobody was reading.
    expect(sourceKeys.length).toBeGreaterThan(15);
    expect(sourceKeys).toContain('sink_not_available');
    expect(sourceKeys).toContain('sink_availability_hint');
    expect(TARGET_LOCALES.length).toBe(4);
    // The container-count trap this guard exists to avoid: en carries about 19
    // TOP-LEVEL keys and well over 150 leaves, because persona, routines and
    // params are deep objects. A shallow check passes on 19 empty containers.
    //
    // This asserts the RATIO, not a frozen total. The first version pinned the
    // count at 166 and went red within the hour when UX-subagent3 landed two
    // new sink keys, which is a legitimate growth this guard must not punish.
    // What it must keep proving is that flattening is doing real work.
    const topLevel = Object.keys(loadSection(SOURCE_LOCALE)).length;
    expect(topLevel).toBeGreaterThan(10);
    expect(sourceKeys.length).toBeGreaterThan(150);
    expect(sourceKeys.length).toBeGreaterThan(topLevel * 5);
  });
});

/**
 * Subsections D1 (UX-subagent3) is actively restructuring, so their key set is
 * not final and translating them now would be paying twice. Named here rather
 * than carved out of the assertion, so the gap is visible, counted exactly and
 * forced to shrink.
 *
 * The coordinator's constraint was to keep this RED until slice three lands. A
 * literally red spec on `main` would break every other worker's pre-commit run
 * for days, so it is expressed as the same STRICT-EQUALITY ratchet the four
 * style guards in `src/styles` already use: the number cannot grow, it cannot
 * silently shrink without the entry coming down in the same change, and the
 * entry must be DELETED when it reaches zero. Reported to the coordinator.
 */
const DEFERRED_SUBSECTIONS: Record<string, number> = {
  // EMPTY, and that is the finished state. Both subsections have been released
  // by the coordinator and translated: `params` (49 leaves) on 2026-09-02 with
  // slice 2b's first half, `routines` (37, having grown from 30 as D1 landed
  // step cards, the N8 price line and the replay error) on the same day with
  // its second, once subagent3 declared D1 feature-complete. The parity block
  // below now polices the whole of `familiar_grimoire`.
  //
  // Keep the mechanism rather than deleting it. A future package that needs to
  // add en-only keys under a subsection adds an entry here in the same commit,
  // and the ratchet then fails loudly in both directions: translating without
  // lowering the entry, and lowering it without translating.
};

/** Leaves inside a deferred subsection, which slice three will translate. */
function isDeferred(key: string): boolean {
  return DEFERRED_SUBSECTIONS[key.split('.')[0] ?? ''] !== undefined;
}

describe(`${SECTION} deferred subsections`, () => {
  it('states whether anything is deferred at all', () => {
    // Without this the suite goes SILENT when the ratchet empties: `it.each`
    // over no entries registers no test, and vitest reports the describe as
    // having none rather than as satisfied. A block that disappears when the
    // work is done cannot tell you it is done, and cannot tell you it was
    // emptied by mistake either.
    const deferred = Object.keys(DEFERRED_SUBSECTIONS);
    if (deferred.length === 0) {
      // The finished state: every subsection released and translated, so the
      // parity block below covers the whole section.
      expect(sourceKeys.length).toBeGreaterThan(150);
      return;
    }
    // Still deferring: each entry must name a subsection en actually has, or
    // the ratchet is guarding a section that no longer exists.
    for (const sub of deferred) {
      expect(
        sourceKeys.some((k) => k.startsWith(`${sub}.`)),
        `DEFERRED_SUBSECTIONS names ${sub}, which en does not define`,
      ).toBe(true);
    }
  });

  it.each(Object.keys(DEFERRED_SUBSECTIONS))(
    '%s is still untranslated by exactly its recorded count (strict ratchet)',
    (sub) => {
      const expected = DEFERRED_SUBSECTIONS[sub] ?? 0;
      const inSub = sourceKeys.filter((k) => k.startsWith(`${sub}.`));
      expect(inSub.length, `${sub} changed size in en`).toBe(expected);
      for (const locale of TARGET_LOCALES) {
        const keys = leafPaths(loadSection(locale) as JsonValue);
        const done = inSub.filter((k) => keys.includes(k)).length;
        expect(
          done,
          `${locale} has translated ${done} of ${expected} ${sub} keys. ` +
            `Lower the DEFERRED_SUBSECTIONS entry in the same change, and ` +
            `delete it when it reaches zero.`,
        ).toBe(0);
      }
    },
  );
});

describe(`${SECTION} locale parity, translated subsections`, () => {
  it.each(TARGET_LOCALES)('%s defines every grimoire key en defines', (locale) => {
    const keys = leafPaths(loadSection(locale) as JsonValue);
    const missing = sourceKeys
      .filter((k) => !isDeferred(k))
      .filter((k) => !keys.includes(k));
    expect(
      missing,
      `${locale}.json is missing ${missing.length} of ${sourceKeys.length} ` +
        `${SECTION} keys, so each one renders as a humanised English phrase ` +
        `rather than as translated copy:\n` +
        missing.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s defines no grimoire key en does not', (locale) => {
    const keys = [...leafPaths(loadSection(locale) as JsonValue)].sort();
    const extra = keys.filter((k) => !sourceKeys.includes(k));
    expect(
      extra,
      `${locale}.json defines ${SECTION} keys that en does not, so nothing ` +
        `will ever render them:\n` +
        extra.map((k) => `  ${SECTION}.${k}`).join('\n'),
    ).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s leaves no grimoire key blank', (locale) => {
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
