/**
 * Token contract guard: every referenced `--chora-color-*` token must be defined.
 *
 * WHY THIS EXISTS
 * A `var(--token, fallback)` reference to a token that is never defined does not
 * fail. It silently paints the fallback, and nothing in lint, type-check, build,
 * or the browser console says a word. That hid a whole class of colour bugs:
 * components authored against a dark theme kept white fallbacks, their tokens
 * were never defined, and the white text shipped onto light surfaces at roughly
 * 1:1 contrast (invisible). See `text-token-contrast.spec.ts` for the symptom.
 *
 * HOW IT WORKS
 * Both sides are derived from the files on disk. The referenced set comes from
 * scanning source for `var(--chora-color-*)`. The defined set comes from parsing
 * token declarations out of the stylesheets. Neither side is hand-maintained,
 * because a hand-maintained list is the exact drift that caused this bug: the
 * original audit of this issue scanned only the text namespace and concluded
 * "six tokens are undefined" when the real number across the colour namespace
 * was 56.
 *
 * SCOPE NOTE
 * `.ts` files are scanned because several components carry inline `styles:`
 * blocks, and 5 undefined tokens are referenced ONLY from there. A `.scss`-only
 * scan would report a clean bill of health over real drift.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Files whose `var()` references count as real, shipped style references. */
const SOURCE_EXTENSIONS = ['.scss', '.css', '.html', '.ts'];
/** Files that may legitimately declare a token. */
const STYLE_EXTENSIONS = ['.scss', '.css'];
/** Tests and stories are not shipped styles. */
const NON_SHIPPED_SUFFIXES = ['.spec.ts', '.stories.ts'];

const REFERENCE_PATTERN = /var\(\s*(--chora-color-[a-z0-9-]+)/g;
const DEFINITION_PATTERN = /^\s*(--chora-[a-z0-9-]+)\s*:/gm;

/**
 * Deliberate, named exception. `--chora-color-text-tertiary-light` is NOT a text
 * colour despite its name. All 3 of its uses are `background:` at alpha 0.1
 * (a2a-activation.component.scss:346, partner-registration.component.scss:182,
 * partner-suspension.component.scss:98). It was misnamed into the text
 * namespace. Defining it as a text colour would produce solid dark chips with
 * dark text on them. It stays undefined ON PURPOSE, so its 3 sites keep their
 * `rgba(148,163,184,0.1)` tint fallback. The correct fix is to rename those 3
 * sites onto a surface/tint token, which is out of scope for this change.
 */
const DELIBERATE_EXCEPTIONS = ['--chora-color-text-tertiary-light'];

/**
 * Pre-existing drift, discovered BY this guard and explicitly NOT endorsed.
 * These 44 tokens are referenced but undefined today, so they all silently paint
 * their fallbacks. They are quarantined rather than defined because each needs a
 * real design decision, and inventing colour values unreviewed would be worse
 * than naming the debt.
 *
 * SIX FORMER ENTRIES WERE THE NON-COSMETIC ONES — their fallbacks were live WCAG
 * AA failures on text (measured 2026-07-16, large-text 3:1 allowance applied):
 * --chora-color-error, --chora-color-accent-aplus, --chora-color-info,
 * --chora-color-accent, --chora-color-accent-rplus, --chora-color-warning-text.
 * CHO-1602 (2026-07-17) defined all six with AA-safe values in _tokens.scss,
 * which is why they are gone from the list below; `text-token-contrast.spec.ts`
 * now proves every site that resolves through them paints at AA. The remaining
 * 44 are cosmetic drift (surfaces, borders, tints) with no measured text
 * failure, still quarantined pending a per-name design decision.
 *
 * B1 (2026-09-02) removed `--chora-color-primary-surface` and
 * `--chora-color-primary-subtle`: both are now DEFINED in `_tokens.scss`. They
 * were carrying live violet `rgba(79,70,229,…)` fallbacks that actually painted,
 * because there was no token behind them to override, so they could not be
 * reached by a token re-value at all until they existed.
 *
 * This list is a ratchet: it may only shrink. Adding a NEW undefined token fails
 * this spec, and defining a quarantined one also fails this spec until it is
 * removed from the list below.
 */
const PRE_EXISTING_DRIFT = [
  '--chora-color-accent-aplus-soft',
  '--chora-color-accent-rplus-soft',
  '--chora-color-border-error',
  '--chora-color-border-light',
  '--chora-color-border-subtle',
  '--chora-color-danger-border',
  '--chora-color-danger-soft',
  '--chora-color-danger-strong',
  '--chora-color-danger-surface',
  '--chora-color-error-bg',
  '--chora-color-error-dark',
  '--chora-color-error-light',
  '--chora-color-error-surface',
  '--chora-color-error-text',
  '--chora-color-focus',
  '--chora-color-glass-border',
  '--chora-color-glass-surface',
  '--chora-color-info-bg',
  '--chora-color-info-soft',
  '--chora-color-info-subtle',
  '--chora-color-info-surface',
  '--chora-color-info-text',
  '--chora-color-on-accent',
  '--chora-color-on-primary',
  '--chora-color-on-warning',
  '--chora-color-primary-dark',
  '--chora-color-primary-hover',
  '--chora-color-primary-light',
  '--chora-color-success-bg',
  '--chora-color-success-dark',
  '--chora-color-success-light',
  '--chora-color-success-surface',
  '--chora-color-success-text',
  '--chora-color-surface',
  '--chora-color-surface-3',
  '--chora-color-surface-muted',
  '--chora-color-surface-on',
  '--chora-color-warning-bg',
  '--chora-color-warning-border',
  '--chora-color-warning-dark',
  '--chora-color-warning-light',
  '--chora-color-warning-surface',
];

const ALLOWED_UNDEFINED = new Set([...DELIBERATE_EXCEPTIONS, ...PRE_EXISTING_DRIFT]);

/** Locate `src/` by walking up from the working directory. Fails loud. */
function findSrcRoot(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    try {
      statSync(join(dir, 'src', 'styles', '_tokens.scss'));
      return join(dir, 'src');
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(
    `token-contract.spec: could not locate src/styles/_tokens.scss walking up from ${process.cwd()}`,
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function matchAll(content: string, pattern: RegExp): string[] {
  return [...content.matchAll(pattern)].map((m) => m[1]);
}

const SRC_ROOT = findSrcRoot();
const ALL_FILES = walk(SRC_ROOT);

const sourceFiles = ALL_FILES.filter(
  (f) =>
    SOURCE_EXTENSIONS.some((ext) => f.endsWith(ext)) &&
    !NON_SHIPPED_SUFFIXES.some((suffix) => f.endsWith(suffix)),
);
const styleFiles = ALL_FILES.filter((f) => STYLE_EXTENSIONS.some((ext) => f.endsWith(ext)));

/** token name -> the source files that reference it, for an actionable failure. */
const referencedBy = new Map<string, string[]>();
for (const file of sourceFiles) {
  for (const token of matchAll(readFileSync(file, 'utf8'), REFERENCE_PATTERN)) {
    const sites = referencedBy.get(token) ?? [];
    sites.push(relative(SRC_ROOT, file));
    referencedBy.set(token, sites);
  }
}

const definedTokens = new Set<string>();
for (const file of styleFiles) {
  for (const token of matchAll(readFileSync(file, 'utf8'), DEFINITION_PATTERN)) {
    definedTokens.add(token);
  }
}

describe('design token contract', () => {
  /**
   * Self-check. Every other assertion here is an absence assertion, and an
   * absence assertion passes vacuously if the scanner silently stops finding
   * anything (wrong cwd, changed layout, broken regex). These floors make that
   * failure loud instead of green.
   */
  it('scans a plausible amount of source (guards against a vacuous pass)', () => {
    expect(sourceFiles.length).toBeGreaterThan(500);
    expect(styleFiles.length).toBeGreaterThan(100);
    expect(referencedBy.size).toBeGreaterThan(30);
    expect(definedTokens.size).toBeGreaterThan(30);
    // The parser must actually understand the canonical token file.
    expect(definedTokens.has('--chora-color-text-primary')).toBe(true);
    expect(definedTokens.has('--chora-color-surface-1')).toBe(true);
  });

  it('defines every referenced --chora-color-* token', () => {
    const undefinedTokens = [...referencedBy.keys()]
      .filter((token) => !definedTokens.has(token))
      .filter((token) => !ALLOWED_UNDEFINED.has(token))
      .sort();

    const detail = undefinedTokens
      .map((token) => {
        const sites = referencedBy.get(token) ?? [];
        return `  ${token} (${sites.length} refs, e.g. ${sites[0]})`;
      })
      .join('\n');

    expect(
      undefinedTokens,
      `These tokens are referenced but never defined, so every reference silently\n` +
        `paints its var() fallback instead:\n${detail}\n\n` +
        `Define them in src/styles/_tokens.scss, or if a token is deliberately\n` +
        `undefined, add it to DELIBERATE_EXCEPTIONS with a comment saying why.`,
    ).toEqual([]);
  });

  it('keeps every allowlisted token real, so the list shrinks instead of rotting', () => {
    const nowDefined = [...ALLOWED_UNDEFINED].filter((token) => definedTokens.has(token)).sort();
    expect(
      nowDefined,
      `These tokens are on the allowlist but are now DEFINED. Remove them from\n` +
        `PRE_EXISTING_DRIFT / DELIBERATE_EXCEPTIONS so the list cannot rot.`,
    ).toEqual([]);

    const unreferenced = [...ALLOWED_UNDEFINED].filter((token) => !referencedBy.has(token)).sort();
    expect(
      unreferenced,
      `These tokens are on the allowlist but are no longer referenced anywhere.\n` +
        `Remove them from the list.`,
    ).toEqual([]);
  });
});
