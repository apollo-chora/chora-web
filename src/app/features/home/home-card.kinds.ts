/**
 * The card kinds the aggregator emits, and how each one's title is phrased.
 *
 * A HAND-MIRROR of `services/chora-gateway/internal/aggregator/medashboard/
 * cards.go`, which the SPA cannot import. It is deliberately a small, dumb
 * list rather than anything clever: the point is that an unknown kind falls
 * through to the generic copy and still renders, so this file being out of
 * date degrades the wording of one card and never the page.
 *
 * `defend_hex` is deliberately ABSENT. It is C4's card and C4 owns its copy;
 * until then the generic fallback renders it, which is the property the
 * fallback exists to prove.
 */

/**
 * Kinds whose count belongs IN the sentence, so the title needs a singular and
 * a plural form. The count is an interpolation PARAM in both, never a fragment
 * stitched around a span: word order moves by locale and ar-SA is right to
 * left.
 */
export const COUNT_BEARING_KINDS: ReadonlySet<string> = new Set([
  'pending_diagnoses',
  'unseen_results',
  'practice_budget',
  'streak_at_risk',
  'instructor_courses',
]);

/**
 * Kinds with ONE form.
 *
 * `continue_learning` is here on purpose even though it carries a count: the
 * count is how many courses are in progress while the route deep links exactly
 * ONE of them, the first in upstream order. Putting that number in the sentence
 * would promise a choice the card does not offer, and no copy may call it the
 * most recent, because the read carries no timestamp at all.
 *
 * `grading_queue` and `tenants_needing_setup` are the two structurally absent
 * cards, always count 0 until C1c and C1d land.
 */
export const SINGULAR_KINDS: ReadonlySet<string> = new Set([
  'continue_learning',
  'grading_queue',
  'tenants_needing_setup',
]);

/** The i18n key for a card's title, falling back for a kind we do not know. */
export function titleKeyForKind(kind: string, count: number): string {
  const plural = count === 1 ? 'one' : 'other';
  if (COUNT_BEARING_KINDS.has(kind)) return `home.quests.kind.${kind}_${plural}`;
  if (SINGULAR_KINDS.has(kind)) return `home.quests.kind.${kind}`;
  return `home.quests.kind.unknown_${plural}`;
}

/** A resolved title: the key to translate, and the params it interpolates. */
export interface CardTitle {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * The defend card's title, or null when the context cannot support one.
 *
 * Grounded on `medashboard/defend.go` rather than on its description. Two
 * things there decide this function:
 *
 * `companion_name` is OMITTED when nothing is stationed, never sent empty,
 * because "nobody is defending this" and "we did not look" are different facts.
 * The arm is therefore selected on ABSENCE. A blank string is a contract
 * violation, and it takes the undefended arm too rather than print
 * " is defending Numerator tonight" with a nameless defender.
 *
 * The two keys sit BESIDE `home.quests.kind.*` rather than under it: every leaf
 * under `kind` is a string the table above resolves by name, so an object there
 * would break that shape. They shipped once at `home.cards.defend_hex.*` and
 * were unified here before a second package could copy the split.
 *
 * ⚠ `hex_label` is omitted on the same rule, and BOTH sentences are built
 * around it. Without one there is no defend copy to render at all, so the card
 * falls back to the generic title rather than showing a sentence with a hole
 * in it. That is the trap of keying a template on a field the wire does not
 * always carry.
 */
export function defendHexTitle(
  context: Readonly<Record<string, unknown>> | undefined,
): CardTitle | null {
  if (context === undefined || context === null) return null;
  const hex = typeof context['hex_label'] === 'string' ? context['hex_label'].trim() : '';
  if (hex === '') return null;

  const raw = context['companion_name'];
  const companion = typeof raw === 'string' ? raw.trim() : '';
  return companion === ''
    ? { key: 'home.quests.defend_hex.title_undefended', params: { hex } }
    : { key: 'home.quests.defend_hex.title_defended', params: { companion, hex } };
}
