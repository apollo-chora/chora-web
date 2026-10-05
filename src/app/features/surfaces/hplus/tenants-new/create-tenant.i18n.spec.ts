/**
 * i18n copy guard for the H+ create-organisation screen (UX Track U, E1, S2).
 *
 * The component spec can only prove WHICH key a branch renders: the test
 * harness loads no translations, so the translate pipe emits keys rather than
 * English and asserting a rendered sentence there asserts nothing. The honesty
 * of this screen lives in three sentences, so they are asserted here against the
 * shipped en.json.
 *
 *  - `owner_hint` is a CLAIM that the operator's ownership is temporary. If it
 *    stops saying so, the screen quietly makes the operator the permanent owner
 *    of every organisation on the platform.
 *  - `roster_pending` exists because the roster reads the identity mirror, fed
 *    asynchronously through the outbox. Copy that presented the roster as
 *    complete would read as data loss.
 *  - `switch_failed` must not read as success: the organisation exists while the
 *    session does not point at it, and "ready" would send the operator into the
 *    wizard to collect 401s.
 */
import { describe, expect, it } from 'vitest';

import ar from '../../../../../../public/assets/i18n/ar-SA.json';
import en from '../../../../../../public/assets/i18n/en.json';
import ms from '../../../../../../public/assets/i18n/ms-MY.json';
import ta from '../../../../../../public/assets/i18n/ta-IN.json';
import zh from '../../../../../../public/assets/i18n/zh-CN.json';

type Tree = Record<string, unknown>;

function section(bundle: unknown): Tree {
  const hplus = (bundle as { hplus?: Tree }).hplus ?? {};
  return (hplus['tenants_new'] as Tree) ?? {};
}

/** Dotted leaf paths, so a missing subsection is visible rather than averaged away. */
function leaves(tree: Tree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...leaves(v as Tree, path));
    } else {
      out.push(path);
    }
  }
  return out.sort();
}

const enCopy = section(en);

describe('hplus.tenants_new copy', () => {
  it('says the operator holds ownership temporarily and where to hand it over', () => {
    const hint = (enCopy['fields'] as Tree)['owner_hint'] as string;
    expect(hint).toContain('defaults to you');
    expect(hint).toContain('hand it over');
    expect(hint).toContain('Members');
  });

  it('says the roster catches up rather than presenting it as complete', () => {
    const pending = (enCopy['success'] as Tree)['roster_pending'] as string;
    expect(pending).toContain('shortly');
    expect(pending.toLowerCase()).not.toContain('complete');
  });

  it('does not describe a failed tenant switch as a ready organisation', () => {
    const failed = (enCopy['errors'] as Tree)['switch_failed'] as string;
    expect(failed).toContain('created');
    expect(failed).toContain('could not be switched');
    expect(failed.toLowerCase()).not.toContain('ready');
  });

  it('names the operator role in the 403 copy, since that is the fix', () => {
    const forbidden = (enCopy['errors'] as Tree)['forbidden'] as string;
    expect(forbidden).toContain('platform operator');
  });

  it('distinguishes an unreadable add-on catalogue from an empty one', () => {
    const addons = enCopy['addons'] as Tree;
    expect(addons['unavailable']).not.toEqual(addons['empty']);
    expect(addons['unavailable'] as string).toContain('could not be read');
  });

  it('ships every leaf in all five locales', () => {
    const expected = leaves(enCopy);
    expect(expected.length).toBeGreaterThan(20);
    for (const [name, bundle] of [
      ['zh-CN', zh],
      ['ms-MY', ms],
      ['ta-IN', ta],
      ['ar-SA', ar],
    ] as const) {
      expect(leaves(section(bundle)), name).toEqual(expected);
    }
  });
});
