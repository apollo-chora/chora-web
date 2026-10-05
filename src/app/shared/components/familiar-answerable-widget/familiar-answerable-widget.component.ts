/**
 * FamiliarAnswerableWidgetComponent — CHO-2016 quiz_me / socratic_drill
 * "answerable-pipe" reply widget.
 *
 * Mounted by `FamiliarLoadoutComponent`'s reply panel when an invoke result's
 * `resultKind === 'answerable'`. Renders the Familiar's framing narration
 * plus the `items[]` channel of atom REFERENCES (retrieval practice — see
 * `AnswerableItem` in `familiar-growth.model.ts`).
 *
 * The BE items channel carries learner-safe metadata ONLY (atomId / title /
 * topic / difficulty / reason) — never a rendered question/stem/options/
 * answer-key, and there is ZERO new submit path
 * (familiar_skill_invoke_answerable.go header comment). This widget mirrors
 * that discipline:
 *   - the "answer" affordance is a RouterLink into the EXISTING atom-play
 *     flow (`/a/atoms/{atomId}/play`, AtomAttemptComponent) where the
 *     learner answers for real credit and server-side grading actually
 *     happens;
 *   - the "did I get it right?" self-check is a LOCAL, ungraded, per-item
 *     toggle (never posted anywhere) — a lightweight recall nudge before the
 *     learner heads into the app, not a second grading path.
 * Copy makes explicit that this is retrieval practice for EXP/retention and
 * may NOT move a Goal (the BE's `weak` scope is edge-backed; `concept_ref`
 * and `due` are not necessarily so) — never implies guaranteed goal progress.
 */
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../pipes/translate.pipe';
import type { AnswerableItem } from '../../../core/familiar/familiar-growth.model';

/** A learner's own local self-check verdict for one item (never persisted). */
export type SelfCheckVerdict = 'got_it' | 'still_learning';

@Component({
  selector: 'chora-familiar-answerable-widget',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-answerable-widget.component.html',
  styleUrl: './familiar-answerable-widget.component.scss',
})
export class FamiliarAnswerableWidgetComponent {
  /** The Familiar's framing narration for this quiz_me/socratic_drill turn. */
  readonly reply = input.required<string>();
  /** The deterministic, server-picked atom-reference set (possibly empty). */
  readonly items = input.required<readonly AnswerableItem[]>();

  /**
   * Per-item LOCAL self-check verdict, keyed by atomId. Ephemeral component
   * state only — never sent anywhere (no new submit path). Resets on
   * re-invoke because the whole widget re-mounts with a fresh result.
   */
  private readonly selfChecks = signal<ReadonlyMap<string, SelfCheckVerdict>>(
    new Map(),
  );

  /** The learner's current self-check verdict for one item, if any. */
  verdictFor(atomId: string): SelfCheckVerdict | null {
    return this.selfChecks().get(atomId) ?? null;
  }

  /** Set a self-check verdict; clicking the SAME verdict again clears it. */
  markSelfCheck(atomId: string, verdict: SelfCheckVerdict): void {
    this.selfChecks.update((prev) => {
      const next = new Map(prev);
      if (next.get(atomId) === verdict) {
        next.delete(atomId);
      } else {
        next.set(atomId, verdict);
      }
      return next;
    });
  }

  /** RouterLink segments to the EXISTING atom-play flow for one item. */
  practiceLink(atomId: string): readonly string[] {
    return ['/a', 'atoms', atomId, 'play'];
  }
}
