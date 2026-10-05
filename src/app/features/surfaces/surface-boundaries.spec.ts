import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';

/**
 * Cross-surface import boundary ratchet.
 *
 * The five CHORA surfaces (A+/C+/H+/O+/R+) are separate SPAs owned by
 * different teams (CLAUDE.md "CHORA Surfaces"). A component in one surface
 * importing directly from another couples two teams' release trains and
 * smuggles one surface's domain vocabulary into another's.
 *
 * This spec is a RATCHET, not a clean-bill-of-health. It freezes the set of
 * violations that exist today so no NEW ones appear, and it fails when a
 * listed violation is fixed so the list shrinks instead of rotting.
 *
 * Four of the five remaining entries share one root cause: OTHER SURFACES
 * reach into A+ for the AUTHORING MACHINERY (atom-authoring,
 * atom-question-picker, test-set-editor). Three surfaces (A+, C+, R+) consume
 * `aplus/atom-authoring`, so that machinery is not A+-specific: it is shared
 * machinery mis-homed under `aplus/`. The real fix is relocating it to
 * `shared/`, tracked separately. The fifth (H+ -> A+ kg-fog) is a different
 * shape: H+ reaches into another surface's dashboard sub-folder for the
 * tenant KG config service. Until those move, this list is the honest record.
 *
 * `aplus/course-authoring` is deliberately ABSENT from the list: course
 * create/maintain belongs to R+ (Content Delivery owns Course per
 * architecture.md; ADR-232 rejected putting teaching roles on the A+ learner
 * surface), so it is being relocated rather than tolerated.
 */

const SURFACES = ['aplus', 'cplus', 'hplus', 'oplus', 'rplus'] as const;
const SURFACES_DIR = join(process.cwd(), 'src/app/features/surfaces');

/**
 * Known, tolerated cross-surface imports, keyed by importing file (relative to
 * the surfaces dir) with the set of foreign surface paths it reaches into.
 * Shrink this list. Never grow it.
 */
const KNOWN_VIOLATIONS: ReadonlyMap<string, readonly string[]> = new Map([
  // Shared authoring machinery mis-homed under aplus/. Consumed by A+, C+ and
  // R+ alike; belongs in shared/.
  ['rplus/assessment-authoring/assessment-authoring.component.ts', ['aplus/atom-authoring']],
  [
    'rplus/quiz-builder/quiz-builder.component.ts',
    ['aplus/atom-question-picker', 'aplus/test-set-editor'],
  ],
  ['rplus/question-banks/question-bank-detail.component.ts', ['aplus/atom-question-picker']],
  ['cplus/components/feed/cplus-feed.component.ts', ['aplus/atom-authoring']],
  // Arrived WITH the course-authoring relocation, and is the one entry here
  // that grew rather than shrank. Recorded rather than hidden.
  //
  // course-authoring bundles TestSets into a Course, so it needs TestSetService.
  // Relocating that service to shared/ was attempted and REVERTED: it imports
  // `EditQuestionRequest` from aplus/atom-authoring/atom-authoring.model, so
  // shared/ would end up depending on a feature, which is backwards and worse
  // than this. The knot is one level deeper than it looks: course-authoring ->
  // test-set machinery -> atom-authoring machinery. Untangling it is the whole
  // point of the shared/ extraction, and this entry dies with it.
  ['rplus/course-authoring/course-authoring.component.ts', ['aplus/test-set-editor']],
  // H+ reaches into A+'s dashboard sub-folder for the tenant KG config
  // service + model (kg-fog). Distinct root cause from the authoring set.
  ['hplus/kg-config/hplus-kg-config.component.ts', ['aplus/dashboard']],
]);

/** Recursively collect every .ts file under `dir`, excluding specs. */
function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Every `from '...'` specifier that escapes into another surface's folder. */
function foreignImports(file: string, owningSurface: string): string[] {
  const src = readFileSync(file, 'utf8');
  const specifiers = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  const foreign: string[] = [];
  for (const spec of specifiers) {
    if (!spec.startsWith('.')) continue;
    // Resolve the specifier against the importing file, then ask which
    // surface (if any) the target lands in. Resolving beats regexing the
    // specifier: it survives any depth of `../`.
    const resolved = join(file, '..', spec);
    const rel = resolved.slice(SURFACES_DIR.length + 1);
    const targetSurface = rel.split('/')[0];
    if (
      SURFACES.includes(targetSurface as (typeof SURFACES)[number]) &&
      targetSurface !== owningSurface
    ) {
      // Normalise to `<surface>/<feature-folder>` so the allowlist does not
      // churn every time a file inside a shared feature is added.
      foreign.push(rel.split('/').slice(0, 2).join('/'));
    }
  }
  return [...new Set(foreign)];
}

describe('cross-surface import boundaries', () => {
  const actual = new Map<string, string[]>();

  beforeAll(() => {
    for (const surface of SURFACES) {
      for (const file of collectSources(join(SURFACES_DIR, surface))) {
        const foreign = foreignImports(file, surface);
        if (foreign.length) {
          actual.set(file.slice(SURFACES_DIR.length + 1), foreign.sort());
        }
      }
    }
  });

  it('introduces no cross-surface import that is not already known', () => {
    const unexpected = [...actual.keys()].filter((f) => !KNOWN_VIOLATIONS.has(f));
    expect(
      unexpected,
      `New cross-surface import(s) detected. A surface must not import from another surface. ` +
        `If the code is genuinely shared, move it to src/app/shared/ rather than reaching across.`,
    ).toEqual([]);
  });

  it('no longer routes R+ course-review through the A+ course-authoring folder', () => {
    // Course create/maintain is R+'s (Content Delivery owns Course). R+ must
    // own its own CourseService rather than importing A+'s.
    const offenders = [...actual.entries()]
      .filter(([, targets]) => targets.some((t) => t === 'aplus/course-authoring'))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('keeps every known violation real, so the list shrinks instead of rotting', () => {
    const stale = [...KNOWN_VIOLATIONS.keys()].filter((f) => !actual.has(f));
    expect(
      stale,
      `These files no longer import across surfaces. Remove them from KNOWN_VIOLATIONS.`,
    ).toEqual([]);
  });
});
