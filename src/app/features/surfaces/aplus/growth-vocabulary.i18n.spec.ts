/**
 * R25 vocabulary guard: "shaky" never appears on a learner surface.
 *
 * Masterplan 3.3 rules that a weak or decaying concept is a "growth edge" and
 * the lens is "Growth"; counts read "3 to grow", states read "growth edge, due
 * today", the section reads "where you can grow next". CODE names are
 * unaffected, deliberately: `isShakyNode`, `learner_weakness` and the i18n KEY
 * names keep their names, because a key is an identifier and renaming eight of
 * them across five bundles and every template reference buys no learner-facing
 * change while carrying real risk.
 *
 * WHAT THIS GUARD DOES NOT DO, stated here so nobody reads it as more than it
 * is. It is LEXICAL and it is therefore ENGLISH-ONLY in practice. A stale
 * Chinese, Malay, Tamil or Arabic translation says the old thing in its own
 * script, not the string "shaky", so scanning the four locale bundles for
 * "shaky" finds nothing whether they are current or a year out of date. All
 * four measure zero today and would measure zero if every one of them still
 * said "shaky" in meaning.
 *
 * So this asserts two things it CAN prove:
 *   1. the English bundle carries no learner-facing "shaky", which is the
 *      surface the rule is actually about; and
 *   2. every key whose English copy this rename touched exists in all five
 *      bundles, so a re-draft cannot be half-done and leave a key behind.
 *
 * Semantic staleness in a translation has no lexical test. The control for that
 * is a native-style review, which is a person, not a spec.
 */
import { describe, expect, it } from 'vitest';

import ar from '../../../../../public/assets/i18n/ar-SA.json';
import en from '../../../../../public/assets/i18n/en.json';
import ms from '../../../../../public/assets/i18n/ms-MY.json';
import ta from '../../../../../public/assets/i18n/ta-IN.json';
import zh from '../../../../../public/assets/i18n/zh-CN.json';

type Bundle = Record<string, unknown>;

const BUNDLES: ReadonlyArray<readonly [string, Bundle]> = [
  ['en', en as Bundle],
  ['zh-CN', zh as Bundle],
  ['ms-MY', ms as Bundle],
  ['ta-IN', ta as Bundle],
  ['ar-SA', ar as Bundle],
];

/** Every leaf as [dotted path, value]. */
function leaves(o: unknown, path: string[] = []): [string, string][] {
  if (typeof o === 'string') return [[path.join('.'), o]];
  if (o && typeof o === 'object') {
    return Object.entries(o as Bundle).flatMap(([k, v]) => leaves(v, [...path, k]));
  }
  return [];
}

/**
 * The keys this rename touched. Listed explicitly rather than derived, so the
 * list is a decision a reader can check against the commit rather than a
 * restatement of whatever the bundle happens to contain.
 */
const RENAMED_KEYS: readonly string[] = [
  'familiar.ceremony.remediate_sub',
  'aplus.knowledge.shaky_count',
  'aplus.knowledge.shaky',
  'aplus.knowledge.shaky_undiagnosed',
  'aplus.growth_edges.subtitle',
  'aplus.growth_edges.shaky_high',
  'aplus.growth_edge_review.confidence_low',
  'aplus.dashboard.growth_edges_subtitle',
  'aplus.kg_terrain.shaky',
  'aplus.discovery.familiar.knowledge_shaky',
  'familiar_loadout.answerable_reason_weak_spot',
  'familiar_loadout.answerable_self_still_learning',
  'familiar_grimoire.params.value.weak',
];

/** The two sections with no translations at all; their keys are en-only. */
const EN_ONLY_PREFIXES = ['familiar.', 'aplus.dashboard.'];

function valueAt(bundle: Bundle, path: string): string | undefined {
  let cur: unknown = bundle;
  for (const seg of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Bundle)[seg];
  }
  return typeof cur === 'string' ? cur : undefined;
}

describe('R25 growth vocabulary', () => {
  it('has no learner-facing "shaky" anywhere in the English bundle', () => {
    const offenders = leaves(en)
      .filter(([, v]) => v.toLowerCase().includes('shaky'))
      .map(([p, v]) => `${p} = ${JSON.stringify(v)}`);

    expect(offenders).toEqual([]);
  });

  it('detects a planted "shaky" (positive control on the scan itself)', () => {
    // Without this, a scan that silently walked nothing would pass over an
    // empty set and read as a clean bundle. Same class as a grep whose glob
    // the shell ate.
    const planted = { aplus: { knowledge: { some_key: 'A shaky concept' } } };
    const offenders = leaves(planted).filter(([, v]) =>
      v.toLowerCase().includes('shaky'),
    );

    expect(offenders).toHaveLength(1);
    expect(offenders[0][0]).toBe('aplus.knowledge.some_key');
  });

  it('walks a realistic number of strings, not a handful', () => {
    // The other half of the control: prove the scan reaches the whole bundle.
    expect(leaves(en).length).toBeGreaterThan(2000);
  });

  it('carries every renamed key in all five bundles, so no re-draft is half-done', () => {
    const missing: string[] = [];
    for (const key of RENAMED_KEYS) {
      if (EN_ONLY_PREFIXES.some((p) => key.startsWith(p))) continue;
      for (const [name, bundle] of BUNDLES) {
        if (valueAt(bundle, key) === undefined) missing.push(`${name}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the en-only sites out of the four locales rather than half-adding them', () => {
    // `familiar` and `aplus.dashboard` have no translations at all. Adding one
    // key of each to four bundles would be a worse state than none.
    const strays: string[] = [];
    for (const key of RENAMED_KEYS) {
      if (!EN_ONLY_PREFIXES.some((p) => key.startsWith(p))) continue;
      for (const [name, bundle] of BUNDLES) {
        if (name === 'en') continue;
        if (valueAt(bundle, key) !== undefined) strays.push(`${name}:${key}`);
      }
    }
    expect(strays).toEqual([]);
  });
});
