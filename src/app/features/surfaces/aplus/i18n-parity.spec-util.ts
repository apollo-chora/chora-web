import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Shared helpers for the locale-parity guards.
 *
 * WHY THIS EXISTS
 * Three guards of the same shape now exist (H+ sections, A+ knowledge, and the
 * A+ Companion section this module was extracted for), and each carried its own
 * copy of the same four pure functions. Three copies of a tree-walk is three
 * places for it to drift, and the drift would be silent: a guard with a subtly
 * different `leafPaths` would report a different gap and nobody would see the
 * disagreement, because each guard only ever compares against itself.
 *
 * The two existing guards still carry their own copies and pass. They should
 * adopt this module the next time either is touched; they were deliberately not
 * rewritten here, because churning landed and passing gates mid-track buys
 * nothing and risks the thing they are guarding.
 */

export const I18N_DIR = ['public', 'assets', 'i18n'];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

/**
 * Flatten to dotted LEAF paths.
 *
 * Comparing top-level keys is vacuous on a nested section: a locale carrying
 * every top-level name with empty bodies would satisfy a shallow check while
 * every string under them still fell back.
 */
export function leafPaths(node: JsonValue, path = ''): readonly string[] {
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

/** Leaf path to value, for the interpolation check. */
export function leafEntries(
  node: JsonValue,
  path = '',
): readonly (readonly [string, JsonValue])[] {
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
 * Locate the chora-web root. Fails loud.
 *
 * Checks each ancestor AND that ancestor's `chora-web/` child, so a guard
 * resolves whether vitest runs from the package root or the repository root.
 * Walking up alone throws from the repo root, and vitest reports that as
 * "no tests" with exit 1, which reads exactly like a RED while asserting
 * nothing. That misreading has already happened once on this track.
 */
export function findWebRoot(caller: string): string {
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
    `${caller}: could not locate public/assets/i18n/en.json from ${process.cwd()} ` +
      `or any of its 6 ancestors, nor a chora-web/ child of one`,
  );
}

export function loadBundle(webRoot: string, locale: string): JsonValue {
  return JSON.parse(
    readFileSync(join(webRoot, ...I18N_DIR, `${locale}.json`), 'utf8'),
  ) as JsonValue;
}

/** Resolve a dotted section path, e.g. `aplus.familiar`. Missing resolves to {}. */
export function resolveSection(bundle: JsonValue, dotted: string): JsonValue {
  let node: JsonValue = bundle;
  for (const seg of dotted.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return {};
    node = (node as { [k: string]: JsonValue })[seg];
    if (node === undefined) return {};
  }
  return node ?? {};
}

/** Interpolation tokens the translate pipe substitutes, e.g. `{{count}}`. */
export function placeholders(value: JsonValue): readonly string[] {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]).sort();
}

/**
 * Build the missing-keys failure message.
 *
 * Pure and exported so a test can assert its output. A failure-shape check is
 * itself a claim about output: a guard whose message is wrong sends the next
 * person to the wrong file, which is worse than no guard at all. Truncates
 * because a first run over a large section would otherwise bury the count that
 * matters under hundreds of lines, four times over.
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
