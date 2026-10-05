/**
 * RED spec for the Diagnose tab's status mapping (C4 frontend slice 2 item 2).
 *
 * The upload lifecycle has FIVE wire states (`weakness_upload/upload.go:24-38`,
 * mirroring the OpenAPI GrowthEdgeUploadJob.status enum, UPPERCASE): QUEUED,
 * ANALYZING, AWAITING_REVIEW, COMPLETED, FAILED. The resume contract adds a
 * sixth, `blocked`, which arrives LOWERCASE and is uppercased before it reaches
 * any renderer (`weakness-review.service.ts:121-133`).
 *
 * There is deliberately no `refunded`: that is a coin-transaction and order
 * status (`gamification/models.go:181,1096`), never an upload's. A failed
 * diagnosis may refund mana, but the upload stays FAILED and nothing on the
 * wire says otherwise, so drawing it would be a state the wire cannot produce.
 *
 * The map is TOTAL over the six and REFUSES to invent a seventh. An unknown
 * status is reported as unknown, carrying the raw value, because the alternative
 * is the thing the resume service already refuses by name: turning an unknown
 * orchestrator state into a plausible lie about a run the learner paid for.
 */
import { describe, expect, it } from 'vitest';

import { diagnoseStatus } from './diagnose-status';

describe('diagnoseStatus', () => {
  it('maps each of the five wire states to its own key', () => {
    const keys = [
      'QUEUED',
      'ANALYZING',
      'AWAITING_REVIEW',
      'COMPLETED',
      'FAILED',
    ].map((s) => diagnoseStatus(s));

    expect(keys.every((k) => k.known)).toBe(true);
    // Distinct keys: collapsing two states into one copy string loses the
    // difference the learner is reading the row to find out.
    expect(new Set(keys.map((k) => k.labelKey)).size).toBe(5);
    expect(keys.every((k) => k.labelKey.startsWith('aplus.knowledge.'))).toBe(
      true,
    );
  });

  it('knows the sixth state, blocked, and normalises its lowercase form', () => {
    // The orchestrator emits lowercase; the resume service uppercases before
    // handing it on. Accept both so a caller that forgets cannot silently miss.
    const lower = diagnoseStatus('blocked');
    const upper = diagnoseStatus('BLOCKED');

    expect(lower.known).toBe(true);
    expect(lower.labelKey).toBe(upper.labelKey);
  });

  it('normalises whitespace and case for every state, not just blocked', () => {
    expect(diagnoseStatus('  awaiting_review  ').labelKey).toBe(
      diagnoseStatus('AWAITING_REVIEW').labelKey,
    );
  });

  it('reports an unknown status as UNKNOWN and carries the raw value', () => {
    // Never a plausible lie: a default arm that picked "analysing" would tell
    // the learner their run is progressing when nothing knows that it is.
    const got = diagnoseStatus('REFUNDED');

    expect(got.known).toBe(false);
    expect(got.raw).toBe('REFUNDED');
    expect(got.labelKey).not.toBe(diagnoseStatus('ANALYZING').labelKey);
  });

  it('treats an absent or blank status as unknown rather than as a state', () => {
    for (const bad of ['', '   ', undefined, null]) {
      const got = diagnoseStatus(bad as unknown as string);
      expect(got.known).toBe(false);
    }
  });

  it('has no key for refunded, because an upload is never refunded', () => {
    // Guards the plan's overstated six-state machine from being re-added: a
    // refund is a coin/order status, and mana refunded on a failed diagnosis
    // leaves the upload FAILED.
    expect(diagnoseStatus('refunded').known).toBe(false);
  });
});
