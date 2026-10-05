/**
 * Violet-band ban: the retired theme cannot come back (B1, UX refactor).
 *
 * WHY THIS EXISTS
 * The owner retired the violet theme and every accent gradient. The obvious
 * guard would ban the handful of hexes the brief named. That guard would be
 * keyed on the CONVENTION, and a census keyed on a convention is blind to
 * every non-adopter: the six named hexes covered 193 of the 639 violet-band
 * occurrences in `chora-web/src`, and the single most common violet on the
 * platform, `#4f46e5`, was not among them. Spelling is not the property that
 * makes a colour violet.
 *
 * So this bans by HUE. Every hex and every `rgb()`/`rgba()` literal in the
 * B1 trees is converted to HLS, and anything landing in the violet-through-
 * indigo band is a violation regardless of how it was written. `#4f46e5`,
 * `rgba(79, 70, 229, 0.08)` and `#7c5cff` are all the same finding.
 *
 * WHAT COUNTS AS VIOLET
 * Hue 238 to 300 degrees, saturation above 0.15, lightness between 0.08 and
 * 0.97. The saturation floor lets near-greys through (a slate border is not a
 * violet); the lightness window lets true black and true white through. The
 * band deliberately starts at 238 rather than 250 so indigo is inside it,
 * because indigo is what the codebase actually shipped.
 *
 * SCOPE
 * The four trees package B1 owns. C+, H+, O+ and R+ components are somebody
 * else's package and are not scanned. O+ keeps its IMDA purple by ruling.
 *
 * RATCHET SHAPE
 * File-level ceilings, and the count must EQUAL the ceiling: above it means
 * violet came back, below it means violet was removed and the ceiling has to
 * come down in the same change. A file not on the list must be clean. Each
 * entry carries a reason, and the two reasons are different in kind:
 *
 *   'other-package': another surface's theme values that happen to live in a
 *      shared file in this tree. Permanent until that surface is re-tokened;
 *      removing them here would silently re-theme a surface B1 does not own.
 *   'b1-debt': violet B1 is removing. These only fall, and reaching zero
 *      deletes the entry.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Only stylesheets paint; a `.ts` colour constant is not a shipped style. */
const STYLE_EXTENSIONS = ['.scss', '.css'];

/** The trees package B1 owns. */
const B1_TREES = [
  'styles',
  'app/features/surfaces/aplus',
  'app/shared',
  'app/layouts',
];

const HEX6 = /#([0-9a-fA-F]{6})\b/g;
const HEX3 = /#([0-9a-fA-F]{3})\b/g;
const RGB = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;

/** Violet-through-indigo, in degrees. */
const HUE_MIN = 238;
const HUE_MAX = 300;
/** Below this the colour reads as a grey, not as a hue. */
const SATURATION_FLOOR = 0.15;
/** Outside this window the colour is effectively black or white. */
const LIGHTNESS_MIN = 0.08;
const LIGHTNESS_MAX = 0.97;

interface Hls {
  readonly hue: number;
  readonly lightness: number;
  readonly saturation: number;
}

/** Standard RGB to HLS, hue in degrees. */
export function toHls(r: number, g: number, b: number): Hls {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) return { hue: 0, lightness, saturation: 0 };
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, lightness, saturation };
}

/** Whether a colour sits in the retired band. */
export function isVioletBand(r: number, g: number, b: number): boolean {
  const { hue, lightness, saturation } = toHls(r, g, b);
  return (
    hue >= HUE_MIN &&
    hue <= HUE_MAX &&
    saturation > SATURATION_FLOOR &&
    lightness > LIGHTNESS_MIN &&
    lightness < LIGHTNESS_MAX
  );
}

/**
 * Strip SCSS comments before counting.
 *
 * Found by running this guard against its own change: the module doc and the
 * re-token notes NAME the retired hexes, and a colour named in prose does not
 * paint. Counting them made three token files read as regressions when they
 * had improved. `legacy-color-ban.spec.ts` dodges the same trap by anchoring
 * on the `color:` property; this one strips instead, because a banned hue is
 * a violation in `background`, `border` and `box-shadow` too.
 *
 * The `//` form is only treated as a comment when it is not preceded by `:`,
 * so a `url(https://...)` is left intact.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Count violet-band colour literals that actually paint. */
export function countVioletLiterals(rawSource: string): number {
  const source = stripComments(rawSource);
  let n = 0;
  for (const m of source.matchAll(HEX6)) {
    const v = m[1];
    if (
      isVioletBand(
        Number.parseInt(v.slice(0, 2), 16),
        Number.parseInt(v.slice(2, 4), 16),
        Number.parseInt(v.slice(4, 6), 16),
      )
    ) {
      n += 1;
    }
  }
  for (const m of source.matchAll(HEX3)) {
    const v = m[1];
    const dup = (c: string): number => Number.parseInt(c + c, 16);
    if (isVioletBand(dup(v[0]), dup(v[1]), dup(v[2]))) n += 1;
  }
  for (const m of source.matchAll(RGB)) {
    if (
      isVioletBand(
        Number.parseInt(m[1], 10),
        Number.parseInt(m[2], 10),
        Number.parseInt(m[3], 10),
      )
    ) {
      n += 1;
    }
  }
  return n;
}

function findSrcRoot(): string {
  let dir = dirname(new URL(import.meta.url).pathname);
  while (dir !== '/' && !dir.endsWith('/src')) dir = dirname(dir);
  return dir;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (STYLE_EXTENSIONS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

const SRC_ROOT = findSrcRoot();

const STYLE_FILES = B1_TREES.flatMap((tree) => {
  try {
    return walk(join(SRC_ROOT, tree));
  } catch {
    return [];
  }
});

const violationsByFile = new Map<string, number>();
for (const file of STYLE_FILES) {
  const n = countVioletLiterals(readFileSync(file, 'utf8'));
  if (n > 0) violationsByFile.set(relative(SRC_ROOT, file), n);
}

type BudgetReason = 'other-package' | 'b1-debt';

/**
 * Ceilings, with the reason each one exists. Read the module doc before
 * touching this. `other-package` entries are NOT debt and are not B1's to
 * remove; `b1-debt` entries may only fall.
 */
const VIOLET_BUDGET: Record<string, readonly [number, BudgetReason]> = {
  // C+, H+, O+ and R+ theme values living in a shared file. Re-tinting them
  // here would silently re-theme three surfaces this package does not own,
  // and O+ keeps its IMDA purple by ruling.
  'styles/_surface-accents.scss': [7, 'other-package'],
  // --chora-color-accent-rplus (#6d28d9) is the R+ accent.
  'styles/_tokens.scss': [1, 'other-package'],
  // --imda-purple, --imda-gradient, --dim-1 (IMDA accountability) and the
  // deepteam tool palette, all read by the O+ governance and eval surfaces.
  'styles/_polyglass-tokens.scss': [8, 'other-package'],
  // The IMDA wordmark default and the O+ spinner ring.
  'styles/_polyglass-components.scss': [4, 'other-package'],
  // The IMDA dimension-1 accent.
  'styles/_imda-accents.scss': [1, 'other-package'],
};

describe('violet-band ban (B1 re-token)', () => {
  it('scans a plausible amount of style source (guards against a vacuous pass)', () => {
    expect(STYLE_FILES.length).toBeGreaterThan(60);
    const names = STYLE_FILES.map((f) => relative(SRC_ROOT, f));
    expect(names).toContain('styles/_tokens.scss');
    expect(names).toContain('styles/_surface-accents.scss');
  });

  it('detects violet by hue, not by spelling (positive + negative control)', () => {
    // The six hexes the brief named.
    for (const hex of ['#7c4dff', '#7b1fa2', '#8b5cf6', '#6366f1', '#c084fc', '#7c3aed']) {
      expect(countVioletLiterals(`color: ${hex};`), hex).toBe(1);
    }
    // The one it did not name, which outnumbered all six combined.
    expect(countVioletLiterals('color: #4f46e5;')).toBe(1);
    // Same colour, written as rgba: still one finding.
    expect(countVioletLiterals('background: rgba(79, 70, 229, 0.08);')).toBe(1);
    // The replacements must all be clean.
    for (const hex of [
      '#ea580c',
      '#c2410c',
      '#9a3412',
      '#1976d2',
      '#1565c0',
      '#b45309',
      '#b0787f',
      '#2f4858',
    ]) {
      expect(countVioletLiterals(`color: ${hex};`), hex).toBe(0);
    }
    // A near-grey slate is a grey, not a violet.
    expect(countVioletLiterals('border: 1px solid #64748b;')).toBe(0);
    // A hex NAMED in a comment does not paint, so it is not a violation.
    expect(countVioletLiterals('// was #4f46e5, now brand blue')).toBe(0);
    expect(countVioletLiterals('/* #7c4dff retired */')).toBe(0);
    // ...but a real declaration on the same line as a comment still counts.
    expect(countVioletLiterals('color: #7c4dff; // retired')).toBe(1);
    // A url is not a comment.
    expect(
      countVioletLiterals("background: url(https://x/y.png) #4f46e5;"),
    ).toBe(1);
    // Black and white are outside the lightness window.
    expect(countVioletLiterals('color: #000000; background: #ffffff;')).toBe(0);
  });

  it('adds no violet to a file that had none', () => {
    const fresh = [...violationsByFile.keys()]
      .filter((file) => VIOLET_BUDGET[file] === undefined)
      .sort();
    expect(
      fresh,
      `The violet theme is retired (UX master plan section 7). These files in\n` +
        `the B1 trees now carry a violet-band colour and had none:\n` +
        fresh.map((f) => `  ${f} (${violationsByFile.get(f)})`).join('\n') +
        `\n\nUse the coral ramp (--chora-color-accent-coral / -fill / -text) or the\n` +
        `brand blue instead. Hue 238 to 300 is banned however it is spelled.`,
    ).toEqual([]);
  });

  it('never lets a budgeted file exceed its ceiling', () => {
    const over = Object.entries(VIOLET_BUDGET)
      .map(([file, [ceiling]]) => ({
        file,
        ceiling,
        actual: violationsByFile.get(file) ?? 0,
      }))
      .filter((r) => r.actual > r.ceiling);
    expect(
      over,
      `These files went UP. Violet came back:\n` +
        over.map((r) => `  ${r.file}: ${r.actual} > ${r.ceiling}`).join('\n'),
    ).toEqual([]);
  });

  it('forces a lowered ceiling once violet is removed (strict ratchet)', () => {
    const stale = Object.entries(VIOLET_BUDGET)
      .map(([file, [ceiling]]) => ({
        file,
        ceiling,
        actual: violationsByFile.get(file) ?? 0,
      }))
      .filter((r) => r.actual < r.ceiling);
    expect(
      stale,
      `These files improved. Lower the ceiling in the same change, or delete\n` +
        `the entry when it reaches zero, so the budget cannot rot:\n` +
        stale.map((r) => `  ${r.file}: ${r.actual} < ${r.ceiling}`).join('\n'),
    ).toEqual([]);
  });

  it('keeps every b1-debt entry shrinking toward deletion', () => {
    const debt = Object.entries(VIOLET_BUDGET).filter(
      ([, [, reason]]) => reason === 'b1-debt',
    );
    // B1 finished: there is no remaining debt. A new entry here is allowed
    // only as a temporary step inside the package, never as a resting state.
    expect(
      debt.map(([file]) => file),
      `B1 is complete, so no file should still be carrying violet as debt.`,
    ).toEqual([]);
  });
});
