import { describe, expect, it } from 'vitest';
import { findWebRoot, leafPaths, loadBundle, type JsonValue } from './i18n-parity.spec-util';

/**
 * Whole-bundle locale ratchet (row T-BULK's guard).
 *
 * WHY A RATCHET AND NOT A PARITY GUARD
 * Censused at `5e1559767`: en carries 7882 leaves, zh-CN, ms-MY and ta-IN each
 * carry 1957 and ar-SA 1822, so 5925, 5925, 5925 and 6060 keys are missing.
 * 23,835 strings across the four. A whole-bundle PARITY guard would therefore
 * be red on main from the moment it landed and could not go green until every
 * one of those was written: a permanently red gate blocks every unrelated push
 * and is quickly learned-around, which makes it worse than nothing.
 *
 * A ratchet gets the property that actually matters. The concern is that a NEW
 * English-only section can hide, which is how `aplus.familiar` (76 of 87
 * missing) and `rplus.course_review` (33 of 33) survived four Companion guards
 * and a row of H+ work: every existing guard passed, because each was scoped to
 * ground already covered. Under a ratchet, adding English-only keys RAISES the
 * missing count and fails immediately, while the existing debt is allowed to
 * stand and shrink.
 *
 * THE BASELINE ONLY EVER GOES DOWN. Every commit that translates a section
 * lowers it in the same commit. A raised baseline is not a fix and should not
 * pass review: it is the ratchet being disengaged.
 *
 * WHY IT COUNTS BY FULL PATH
 * `en.json` holds 8 keys with a literal dot inside a single level, all under
 * `cplus.connections` (`tab.following`, `empty.blocked` and their siblings).
 * They flatten to the same dotted path the translate pipe builds, so counting
 * them by nesting is correct HERE, and measured on this bundle the 7882 paths
 * are all unique with zero collisions. But that is a property of today's data,
 * not a guarantee: a future `tab: { following }` object beside the existing
 * `"tab.following"` string would produce one path twice, and a naive map would
 * silently drop one and under-report the gap by one key. So the collision check
 * below is an assertion rather than a comment.
 */

const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = ['zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'] as const;

/**
 * Missing-key count per locale that must not be exceeded.
 *
 * Censused at `5e1559767` as 5925/5925/5925/6060 and lowered by every commit
 * that translates a section: this figure is that census minus the 76 keys of
 * `aplus.familiar`, which landed with it. Lower is the only legal direction,
 * and the slack assertion below makes banking a gain non-optional.
 *
 * Lowered from 5769/5769/5769/5904 by the C+ 401/403 split. Seven of those
 * keys are the split's own: `cplus.<ns>.error_unauthorised` existed in en
 * alone, and the `error_unauthenticated` / `error_forbidden` pair that
 * replaces it ships in all five locales, so the gap closes by one per
 * namespace. The other fifteen were already closed at `e67033afe` and had
 * not been banked: the real gap there was 5754/5754/5754/5889 against a
 * recorded 5769/5769/5769/5904. That slack sat one key under the tolerance,
 * which is why nothing had failed yet.
 */
const BASELINE: Readonly<Record<(typeof TARGET_LOCALES)[number], number>> = {
  'zh-CN': 5747,
  'ms-MY': 5747,
  'ta-IN': 5747,
  'ar-SA': 5882,
};

const WEB_ROOT = findWebRoot('i18n-bundle-ratchet.i18n.spec');

const BUNDLES = Object.fromEntries(
  [SOURCE_LOCALE, ...TARGET_LOCALES].map((l) => [l, loadBundle(WEB_ROOT, l)]),
) as Record<string, JsonValue>;

const sourcePaths = leafPaths(BUNDLES[SOURCE_LOCALE]);
const sourceSet = new Set(sourcePaths);

/**
 * Verdict for one locale. Pure, so the tests below can feed it a synthetic
 * regression and prove the ratchet actually bites, rather than trusting that
 * a green run means it would have caught one.
 */
export function ratchetVerdict(
  locale: string,
  missing: number,
  baseline: number,
): { readonly ok: boolean; readonly message: string } {
  if (missing > baseline) {
    return {
      ok: false,
      message:
        `${locale}.json is missing ${missing} keys, ${missing - baseline} MORE than the ` +
        `recorded baseline of ${baseline}. Something added English-only keys. Translate ` +
        `them in the commit that adds them, or the surface ships in English to every ` +
        `non-English learner. Do NOT raise the baseline: that disengages the ratchet.`,
    };
  }
  return {
    ok: true,
    message:
      missing < baseline
        ? `${locale}.json is missing ${missing}, ${baseline - missing} BELOW the baseline of ` +
          `${baseline}. Lower the baseline to ${missing} in this commit so the gain is held.`
        : `${locale}.json is missing ${missing}, exactly the baseline.`,
  };
}

describe('i18n whole-bundle locale ratchet', () => {
  it('reads a plausible source bundle (guards against a vacuous pass)', () => {
    // A ratchet over an empty source passes trivially: 0 missing beats any
    // baseline. The floor is the censused count minus a wide margin.
    expect(sourcePaths.length).toBeGreaterThan(7000);
    expect(TARGET_LOCALES.length).toBe(4);
  });

  it('builds one unique path per leaf (a collision would under-report the gap)', () => {
    // 8 keys carry a literal dot inside one level. They do not collide today.
    // If one ever does, the count silently drops and the ratchet loosens by
    // exactly the number of collisions, which is the kind of slack nobody sees.
    const dupes = sourcePaths.filter((p, i) => sourcePaths.indexOf(p) !== i);
    expect(
      [...new Set(dupes)],
      `en.json produces the same dotted path more than once, so the leaf count ` +
        `under-reports by ${dupes.length} and every locale's gap is measured too small:\n` +
        [...new Set(dupes)].map((p) => `  ${p}`).join('\n'),
    ).toEqual([]);
  });

  it('bites when the gap grows (positive control on the ratchet itself)', () => {
    // The whole point of this file. Prove the comparison fails on growth
    // rather than assuming a green run means it would have.
    const grew = ratchetVerdict('ta-IN', 5926, 5925);
    expect(grew.ok).toBe(false);
    expect(grew.message).toContain('1 MORE than the recorded baseline');
    expect(grew.message).toContain('Do NOT raise the baseline');

    const held = ratchetVerdict('ta-IN', 5925, 5925);
    expect(held.ok).toBe(true);

    // and that it tells you to bank a gain rather than leaving slack behind
    const gained = ratchetVerdict('ta-IN', 5849, 5925);
    expect(gained.ok).toBe(true);
    expect(gained.message).toContain('Lower the baseline to 5849');
  });

  it.each(TARGET_LOCALES)('%s has not grown its gap', (locale) => {
    const present = new Set(leafPaths(BUNDLES[locale]));
    const missing = [...sourceSet].filter((k) => !present.has(k)).length;
    const verdict = ratchetVerdict(locale, missing, BASELINE[locale]);
    expect(verdict.ok, verdict.message).toBe(true);
  });

  it.each(TARGET_LOCALES)('%s baseline is not left slack', (locale) => {
    // A baseline well above the real gap is a ratchet that has quietly
    // disengaged: the count could grow back to it without failing. Allow a
    // little headroom so an in-flight row does not trip this, but not much.
    const present = new Set(leafPaths(BUNDLES[locale]));
    const missing = [...sourceSet].filter((k) => !present.has(k)).length;
    expect(
      BASELINE[locale] - missing,
      `${locale}: the baseline is ${BASELINE[locale]} and the real gap is ${missing}, ` +
        `so ${BASELINE[locale] - missing} keys of slack sit under the ratchet. Lower the ` +
        `baseline to ${missing}.`,
    ).toBeLessThanOrEqual(20);
  });
});
