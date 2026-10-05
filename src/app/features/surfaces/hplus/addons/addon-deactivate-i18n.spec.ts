/**
 * H+ Add-on Deactivation i18n contract (CHO-1744).
 *
 * The CHO-1731 deactivation modal shipped a bunch of `hplus.addons.deactivate.*`
 * translate-pipe references but `en.json` only ever defined the top-level slot
 * as a flat string (used nowhere — the tile uses `hplus.addons.action.deactivate`).
 * Result: the modal renders raw keys to end users (the CHO-1744 smoke screenshot).
 *
 * This is a JSON-contract test: it loads `public/assets/i18n/en.json`, flattens
 * it via the same logic the TranslateService uses, and asserts every key the
 * modal + host-toast code paths reference resolves to a non-empty string.
 *
 * RED before this story → the flat string lookup returns `"Deactivate"` for
 * `hplus.addons.deactivate` and `undefined` for every dotted child.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function flatten(
  raw: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else if (typeof v === 'string') {
      out[key] = v;
    }
  }
  return out;
}

const REQUIRED_KEYS = [
  // Modal head + body
  'hplus.addons.deactivate.title',
  'hplus.addons.deactivate.close',
  'hplus.addons.deactivate.warning',
  'hplus.addons.deactivate.refundNotice',
  // Reason dropdown
  'hplus.addons.deactivate.reasonLabel',
  'hplus.addons.deactivate.reasonPlaceholder',
  'hplus.addons.deactivate.reason.no_longer_needed',
  'hplus.addons.deactivate.reason.cost',
  'hplus.addons.deactivate.reason.consolidation',
  'hplus.addons.deactivate.reason.migration',
  'hplus.addons.deactivate.reason.compliance',
  'hplus.addons.deactivate.reason.other',
  'hplus.addons.deactivate.reasonTextLabel',
  // Effective-at radios
  'hplus.addons.deactivate.effectiveAtLabel',
  'hplus.addons.deactivate.effectiveAt.endOfCycle',
  'hplus.addons.deactivate.effectiveAt.immediate',
  // Confirm name + actions
  'hplus.addons.deactivate.confirmNameLabel',
  'hplus.addons.deactivate.cancel',
  'hplus.addons.deactivate.submit',
  'hplus.addons.deactivate.submitting',
  // Error banners (5 discriminated kinds)
  'hplus.addons.deactivate.error.complianceLocked',
  'hplus.addons.deactivate.error.notFound',
  'hplus.addons.deactivate.error.alreadyDeactivated',
  'hplus.addons.deactivate.error.unauthenticated',
  'hplus.addons.deactivate.error.serverError',
  // Host toast keys (addon-management.component.ts)
  'hplus.addons.deactivate.successImmediate',
  'hplus.addons.deactivate.successScheduled',
] as const;

describe('en.json — hplus.addons.deactivate.* i18n contract', () => {
  const raw = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../../../public/assets/i18n/en.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;
  const flat = flatten(raw);

  for (const key of REQUIRED_KEYS) {
    it(`resolves "${key}" to a non-empty translated string`, () => {
      const value = flat[key];
      expect(value, `missing translation for ${key}`).toBeDefined();
      expect(typeof value).toBe('string');
      expect(value.length, `empty translation for ${key}`).toBeGreaterThan(0);
      expect(value, `${key} resolved to the key itself`).not.toBe(key);
    });
  }
});
