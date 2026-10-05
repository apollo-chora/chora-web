/**
 * Diagnose upload status, mapped to copy (C4 frontend slice 2 item 2).
 *
 * Pure and framework-free, in the style of `map-roads.ts`: the panel renders
 * whatever this returns, and the rule about what may be SAID of a run lives
 * here rather than in a template switch that quietly grows a default arm.
 *
 * The lifecycle has FIVE wire states (`weakness_upload/upload.go:24-38`,
 * mirroring the OpenAPI GrowthEdgeUploadJob.status enum, UPPERCASE): QUEUED,
 * ANALYZING, AWAITING_REVIEW, COMPLETED, FAILED. The orchestrator's resume
 * contract adds a sixth, `blocked`, which travels LOWERCASE on that wire and is
 * uppercased before it reaches a renderer (`weakness-review.service.ts:121-133`).
 * Both casings are accepted here so a caller that forgets cannot silently miss.
 *
 * There is deliberately NO `refunded`. That is a coin-transaction and order
 * status (`gamification/models.go:181,1096`), never an upload's: a failed
 * diagnosis may refund mana, but the upload stays FAILED and nothing on the wire
 * says otherwise, so a `refunded` row would be a state the wire cannot produce.
 *
 * The map is TOTAL over the six and refuses to invent a seventh. An unknown
 * status comes back marked unknown and carrying its raw value, because the
 * alternative is the thing the resume service already refuses by name: turning
 * an unknown orchestrator state into a plausible lie about a run the learner
 * paid for.
 */

/** What may be said about one upload's status. */
export interface DiagnoseStatusLabel {
  /** i18n key for the learner-facing phrase. */
  readonly labelKey: string;
  /** False when the wire sent something this build does not know. */
  readonly known: boolean;
  /** The status as it arrived, trimmed. Rendered beside the unknown copy. */
  readonly raw: string;
}

/** The six states this build can name, keyed by their UPPERCASE wire form. */
const LABEL_KEYS: Readonly<Record<string, string>> = {
  QUEUED: 'aplus.knowledge.diagnose_queued',
  ANALYZING: 'aplus.knowledge.diagnose_analyzing',
  AWAITING_REVIEW: 'aplus.knowledge.diagnose_awaiting_review',
  COMPLETED: 'aplus.knowledge.diagnose_completed',
  FAILED: 'aplus.knowledge.diagnose_failed',
  BLOCKED: 'aplus.knowledge.diagnose_blocked',
};

/** Copy for a status this build does not know. Names it rather than guessing. */
const UNKNOWN_KEY = 'aplus.knowledge.diagnose_unknown';

/**
 * Map an upload status onto its copy.
 *
 * Accepts any string, including an absent or blank one, because the value
 * reaching a renderer has passed through a cast (`status as …`) rather than a
 * check, so the type system is not evidence about what can arrive.
 */
export function diagnoseStatus(status: string): DiagnoseStatusLabel {
  const raw = String(status ?? '').trim();
  const labelKey = LABEL_KEYS[raw.toUpperCase()];
  return labelKey
    ? { labelKey, known: true, raw }
    : { labelKey: UNKNOWN_KEY, known: false, raw };
}
