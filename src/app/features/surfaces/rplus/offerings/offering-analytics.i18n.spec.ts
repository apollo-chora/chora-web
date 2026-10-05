/**
 * i18n copy guard for the R+ offering Analytics panel.
 *
 * The component spec can only prove WHICH key a branch renders — the test
 * harness's translate pipe emits keys, not English. This spec asserts the copy
 * itself, against the shipped en.json, because the honesty of this panel lives
 * in the words: `deferred_note` is a CLAIM about what the product cannot yet
 * do, and a stale claim is a lie about our own numbers.
 *
 * Context: chora-delivery's analytics endpoint grew avg_progress_pct +
 * completion_rate_pct (CHO-1827). Until then the note correctly disclaimed all
 * three metrics. Now completion + progress render for real, so the note must
 * disclaim pass_rate ONLY — that is the one metric with no BE port (the handler
 * documents it as "Deferred ... needs a graded-outcome port on Deps").
 */
import { describe, expect, it } from 'vitest';

import en from '../../../../../../public/assets/i18n/en.json';

interface AnalyticsCopy {
  readonly deferred_note: string;
  readonly avg_progress: string;
  readonly completion_rate: string;
  readonly completed: string;
  readonly not_applicable: string;
}

const analytics = (
  en as unknown as {
    rplus: { offerings: { workspace: { analytics: AnalyticsCopy } } };
  }
).rplus.offerings.workspace.analytics;

describe('R+ offering analytics i18n copy', () => {
  it('disclaims pass-rate, the one metric with no backend port', () => {
    expect(analytics.deferred_note.toLowerCase()).toContain('pass-rate');
  });

  // Guards the regression this change exists to fix: the note used to read
  // "Completion, pass-rate and progress analytics are coming in a later
  // release" while the BE was already returning completion + progress.
  it('no longer disclaims completion or progress, which now render for real', () => {
    const note = analytics.deferred_note.toLowerCase();
    expect(note).not.toContain('completion');
    expect(note).not.toContain('progress');
  });

  it('ships labels for every metric the panel renders', () => {
    expect(analytics.avg_progress).toBeTruthy();
    expect(analytics.completion_rate).toBeTruthy();
    expect(analytics.completed).toBeTruthy();
    expect(analytics.not_applicable).toBeTruthy();
  });
});
