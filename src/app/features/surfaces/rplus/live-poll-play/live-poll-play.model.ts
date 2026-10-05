/**
 * Live Poll Play model — R+ live-polling learner FE (Track 2).
 *
 * View-model + pure decoders for the per-poll WebSocket fan-out at
 * `GET /api/v1/live-polls/{pollId}/ws` (chora-delivery live-polling handler).
 *
 * The WS protocol is server-push only — learner votes arrive via REST
 * (`POST /api/v1/live-polls/{pollId}/votes`). Every frame is an envelope:
 *
 *   { "type": "snapshot" | "event", "timestamp": "...", "payload": {...} }
 *
 * The first frame is always a `snapshot` carrying the full poll state +
 * per-option vote counts (`livePollSnapshotPayload`). Subsequent `event`
 * frames (`poll_opened` / `poll_closed` / `vote_recorded`) each replay an
 * updated snapshot, so the FE treats every frame payload as a snapshot and
 * re-renders from it.
 *
 * Domain vocabulary anchors:
 *   - `LivePoll` — the per-run live-polling aggregate (NOT "survey"/"quiz").
 *   - `LivePollOption` — one votable option; `label` is the author-typed
 *     answer content (per `feedback_mcq_option_naming` — never the A/B/C/D
 *     positional marker). The learner votes by `label`.
 *   - `GCID` — Global Chora ID (the instructor identifier on the snapshot).
 *
 * Fail-soft: every decoder tolerates a malformed/partial payload and either
 * returns `null` (snapshot) or a safe default, so a bad frame never crashes
 * the play view — it keeps its prior state.
 */

/** Lifecycle state of the poll, mirrors the BE `state` enum. */
export type LivePollState = 'DRAFT' | 'OPEN' | 'CLOSED';

/** Envelope `type` discriminant. */
export type LivePollFrameType = 'snapshot' | 'event';

/**
 * The BE `event` envelope `type` values. Each carries the updated snapshot
 * as its payload. Kept as a string union for forward-compatibility; unknown
 * event types are ignored by the consumer.
 */
export type LivePollEventType = 'poll_opened' | 'poll_closed' | 'vote_recorded';

/**
 * Raw WS envelope as received off the socket. `payload` is decoded by
 * `decodeSnapshot` and kept as `unknown` until narrowed.
 */
export interface LivePollFrame {
  readonly type: string;
  readonly timestamp?: string;
  readonly payload?: unknown;
}

/** One votable option with its current tally. */
export interface LivePollOption {
  readonly label: string;
  readonly voteCount: number;
}

/**
 * Decoded poll snapshot — mirrors the BE `livePollSnapshotPayload`. Carried
 * on the initial `snapshot` frame and on every `event` frame.
 */
export interface LivePollSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly instructorGcid: string;
  readonly question: string;
  readonly options: readonly LivePollOption[];
  readonly state: LivePollState;
  readonly openedAt: string | null;
  readonly closedAt: string | null;
  readonly totalVotes: number;
}

/**
 * One row in the rendered tally bar. `percent` is rounded to nearest int and
 * safe at 0 total (0%). One row per snapshot option, preserving option order.
 */
export interface LivePollTallyRow {
  readonly label: string;
  readonly voteCount: number;
  readonly percent: number;
}

/** Type guard for a JSON object (non-null, non-array). */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asState(v: unknown): LivePollState {
  return v === 'OPEN' || v === 'CLOSED' || v === 'DRAFT'
    ? (v as LivePollState)
    : 'DRAFT';
}

/** True when the frame is the initial `snapshot` envelope. */
export function isSnapshotFrame(frame: LivePollFrame): boolean {
  return frame.type === 'snapshot';
}

/**
 * Decode the options array off a snapshot payload. Drops entries without a
 * non-empty `label` (a votable option must have a label to vote by).
 */
function decodeOptions(raw: unknown): readonly LivePollOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObject)
    .map((o) => ({
      label: asString(o['label']),
      voteCount: asNumber(o['vote_count']),
    }))
    .filter((o) => o.label.length > 0);
}

/**
 * Decode a `snapshot`/`event`-frame payload. Returns null when the payload is
 * not a well-formed snapshot object (fail-soft — the component keeps its prior
 * state rather than crashing the play view).
 */
export function decodeSnapshot(payload: unknown): LivePollSnapshot | null {
  if (!isObject(payload)) return null;
  return {
    id: asString(payload['id']),
    tenantId: asString(payload['tenant_id']),
    instructorGcid: asString(payload['instructor_gcid']),
    question: asString(payload['question']),
    options: decodeOptions(payload['options']),
    state: asState(payload['state']),
    openedAt: typeof payload['opened_at'] === 'string' ? payload['opened_at'] : null,
    closedAt: typeof payload['closed_at'] === 'string' ? payload['closed_at'] : null,
    totalVotes: asNumber(payload['total_votes']),
  };
}

/**
 * Build the per-option tally rows for a snapshot. One row per option, in
 * snapshot order; percent rounded to nearest int and safe at 0 total (0%).
 * The denominator is the snapshot's `totalVotes` (server-authoritative) so
 * the bars sum coherently even if individual `voteCount`s lag a frame.
 */
export function buildTallyRows(
  snapshot: LivePollSnapshot | null,
): readonly LivePollTallyRow[] {
  if (!snapshot) return [];
  const total = snapshot.totalVotes;
  return snapshot.options.map((opt) => ({
    label: opt.label,
    voteCount: opt.voteCount,
    percent: total > 0 ? Math.round((opt.voteCount / total) * 100) : 0,
  }));
}

/** Whether the poll currently accepts votes (open + not yet voted is gated separately). */
export function isVotingOpen(snapshot: LivePollSnapshot | null): boolean {
  return snapshot?.state === 'OPEN';
}

/** Build the WS path for the per-poll live-polling fan-out (id url-encoded). */
export function livePollWsPath(pollId: string): string {
  return `/api/v1/live-polls/${encodeURIComponent(pollId)}/ws`;
}

/** Build the REST path for casting a learner vote on a poll (id url-encoded). */
export function livePollVotePath(pollId: string): string {
  return `/api/v1/live-polls/${encodeURIComponent(pollId)}/votes`;
}
