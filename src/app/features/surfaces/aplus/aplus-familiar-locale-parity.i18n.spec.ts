import { describe, expect, it } from 'vitest';
import {
  findWebRoot,
  leafEntries,
  leafPaths,
  loadBundle,
  missingReport,
  placeholders,
  resolveSection,
  type JsonValue,
} from './i18n-parity.spec-util';

/**
 * Section-level locale parity guard for `aplus.familiar` (the Companion
 * profile), queued after row C-T.
 *
 * WHY THIS EXISTS, AND WHY IT IS SECTION-LEVEL
 * Four Companion-adjacent guards already existed and every one of them is
 * scoped to a SUBSECTION: `familiar_loadout`, `familiar_grimoire`,
 * `familiar_skill` and `pod_vocabulary`, each a separate top-level section.
 * None of them covers `aplus.familiar`, and that is precisely how a section
 * this size stayed English-only: every guard passed, because each was asked
 * about ground that was already covered. A gap survives where the guards are
 * dense but the coverage is not contiguous.
 *
 * Measured on 2026-09-03 against `e2d8ba3c3`: en carries 87 leaves under
 * `aplus.familiar` and each of the four target locales carries 11, so 76 per
 * locale fall back. The 11 already present are the two `aha_*` strings, four
 * `resonant_*` strings and five `tool.*` names, added piecemeal by other rows,
 * which is itself the tell: a section nobody owns gets translated by accident.
 *
 * ⚠ The row text said 83 keys in en. The measured number is 87. The MISSING
 * count, 76, is exactly as reported, so the discrepancy is in what counts as
 * the section, not in the gap. The guard is the truth; the row number is
 * indicative.
 *
 * WHAT THIS ASSERTS
 * Key parity per locale and interpolation parity, and nothing about meaning:
 * these translations are machine-drafted and pending native review. It does not
 * repeat the file-wide "no key en lacks" assertion, which the H+ guard already
 * carries once for every locale.
 *
 * The helpers live in `./i18n-parity.spec-util` because this is the third guard of
 * this shape and three copies of one tree-walk is three places for it to drift
 * silently.
 */

const SECTION = 'aplus.familiar';
const SOURCE_LOCALE = 'en';
const TARGET_LOCALES = ['zh-CN', 'ms-MY', 'ta-IN', 'ar-SA'] as const;

const WEB_ROOT = findWebRoot('aplus-familiar-locale-parity.i18n.spec');

const BUNDLES = Object.fromEntries(
  [SOURCE_LOCALE, ...TARGET_LOCALES].map((l) => [l, loadBundle(WEB_ROOT, l)]),
) as Record<string, JsonValue>;

const sourceKeys = [
  ...leafPaths(resolveSection(BUNDLES[SOURCE_LOCALE], SECTION)),
].sort();

describe(`${SECTION} locale parity`, () => {
  it('reads a plausible source section (guards against a vacuous pass)', () => {
    // The floor is the count measured at e2d8ba3c3 minus a margin, so a section
    // renamed away fails loudly rather than passing over an empty object. That
    // matters here more than usual: UX-subagent5's R25 vocabulary rename is
    // queued and will move key NAMES in this neighbourhood.
    expect(sourceKeys.length).toBeGreaterThan(80);
    expect(sourceKeys).toContain('profile');
    expect(sourceKeys).toContain('retire_confirm_message');
    expect(TARGET_LOCALES.length).toBe(4);
  });

  it('reports a missing key by name (positive control on the failure message)', () => {
    const msg = missingReport('ta-IN', SECTION, ['mind_heading'], 87);
    expect(msg).toContain('ta-IN.json is missing 1 of 87 aplus.familiar keys');
    expect(msg).toContain('aplus.familiar.mind_heading');
  });

  it.each(TARGET_LOCALES)('%s defines every key en defines', (locale) => {
    const keys = leafPaths(resolveSection(BUNDLES[locale], SECTION));
    const missing = sourceKeys.filter((k) => !keys.includes(k));
    expect(missing, missingReport(locale, SECTION, missing, sourceKeys.length)).toEqual([]);
  });

  it.each(TARGET_LOCALES)('%s preserves every interpolation en uses', (locale) => {
    const sourceValues = new Map(
      leafEntries(resolveSection(BUNDLES[SOURCE_LOCALE], SECTION)),
    );
    const drifted: string[] = [];
    for (const [key, value] of leafEntries(resolveSection(BUNDLES[locale], SECTION))) {
      if (!sourceValues.has(key)) continue;
      const want = placeholders(sourceValues.get(key) as JsonValue);
      const got = placeholders(value);
      if (want.join('|') !== got.join('|')) {
        drifted.push(`  ${SECTION}.${key}: en has [${want.join(', ')}], ${locale} has [${got.join(', ')}]`);
      }
    }
    expect(
      drifted,
      `${locale}.json changes the interpolation set on ${drifted.length} ` +
        `${SECTION} keys:\n${drifted.join('\n')}`,
    ).toEqual([]);
  });
});
