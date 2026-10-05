/**
 * H+ Marketplace i18n contract (CHO-1749 / CHO-1745 Sub 4).
 *
 * Pins the keys the marketplace + management surfaces emit for the new
 * `system` + `installed` affordances. Same JSON-contract pattern as the
 * CHO-1744 deactivation modal spec — loads `public/assets/i18n/en.json`,
 * flattens it, asserts every required key resolves to a non-empty
 * translated string (not the key itself).
 *
 * RED before this story → `installedBadge`, `systemBadge`, `systemHint`,
 * `manageCta` (under `hplus.marketplace`) and `systemBadge` (under
 * `hplus.addons`) are undefined.
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
  // Marketplace tile + detail surface (CHO-1745 Sub 4).
  'hplus.marketplace.installedBadge',
  'hplus.marketplace.systemBadge',
  'hplus.marketplace.systemHint',
  'hplus.marketplace.manageCta',
  // Add-on management tile surface (CHO-1745 Sub 4).
  'hplus.addons.systemBadge',
  // CHO-1755 tier picker on the marketplace detail screen.
  'hplus.marketplace.detail.tierPickerLabel',
  'hplus.marketplace.detail.tierPickerHint',
] as const;

describe('en.json — hplus marketplace + addons system/installed i18n contract', () => {
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
