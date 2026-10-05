/**
 * Live Classroom Play model — R+ Live Classroom expansion (ADR-168 Task #9).
 *
 * View-model + pure decoders for the per-session WebSocket fan-out at
 * `GET /api/v1/live-quizzes/{sessionId}/ws` (BE handler
 * `services/chora-delivery/internal/adapter/http/live_quiz_ws_handler.go`).
 *
 * The WS protocol is server-push only (learner submissions arrive via REST
 * `POST /api/v1/classroom-sessions/{id}/responses`). Every frame is a
 * `ws.Message` envelope:
 *
 *   { "type": "snapshot" | "event", "timestamp": "...", "payload": {...} }
 *
 * The first frame is always a `snapshot` carrying the session state +
 * per-question response counts (`liveQuizSnapshotPayload`). Subsequent
 * `event` frames are published by the REST mutation handlers (response
 * submitted / question advanced) and replay an updated distribution.
 *
 * Domain vocabulary anchors:
 *   - `LiveQuizSession` — the per-run classroom-realtime aggregate.
 *   - `GCID` — Global Chora ID (learner identifier on the leaderboard).
 *   - `ExplainerMode` — post-reveal disclosure policy (quiz-builder.model).
 *
 * Per `feedback_mcq_option_naming` the choice marker (A/B/C/D) is positional;
 * the BE stores the submitted choice verbatim and the FE sorts marker-asc.
 */
import type { ExplainerMode } from '../quiz-builder/quiz-builder.model';

export type LivePlaySessionState = 'ARMED' | 'LIVE' | 'CLOSED';

/** Envelope `type` discriminant from the BE `ws.Message`. */
export type LivePlayFrameType = 'snapshot' | 'event';

/**
 * Raw WS envelope as received off the socket. `payload` is decoded by the
 * frame-specific decoders below; kept as `unknown` until narrowed.
 */
export interface LivePlayFrame {
  readonly type: string;
  readonly timestamp?: string;
  readonly payload?: unknown;
}

/**
 * Decoded snapshot payload — mirrors `liveQuizSnapshotPayload` on the BE.
 * `responseCounts` is a nested map: questionId → choiceMarker → count.
 */
export interface LivePlaySnapshot {
  readonly id: string;
  readonly liveQuizId: string;
  readonly tenantId: string;
  readonly instructorGcid: string;
  readonly state: LivePlaySessionState;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  /** questionId → (choiceMarker → count). */
  readonly responseCounts: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly totalResponses: number;
  /** L5.2 nickname-keyed boards (CHO-1704) — [] on legacy frames. */
  readonly scoreboard: readonly LivePlayBoardRow[];
  readonly podium: readonly LivePlayBoardRow[];
}

/**
 * One row in the per-question response tally. Sorted marker-asc; percent is
 * rounded to nearest int and safe at 0 total.
 */
export interface LivePlayTallyRow {
  readonly marker: string;
  readonly count: number;
  readonly percent: number;
}

/**
 * One leaderboard entry. The BE WS snapshot does not (yet) carry per-learner
 * cumulative scores, so the FE accumulates them from `leaderboard` arrays
 * carried on `event` frames when present.
 *
 * TODO(be-leaderboard-contract): confirm the `event` frame leaderboard wire
 * shape with chora-delivery. Until then the decoder tolerates either a
 * `leaderboard: [{gcid, display_name?, score}]` array OR absence (in which
 * case the leaderboard pane shows the empty state).
 */
export interface LivePlayLeaderboardEntry {
  readonly gcid: string;
  readonly displayName: string;
  readonly score: number;
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

/** True when the frame is the initial `snapshot` envelope. */
export function isSnapshotFrame(frame: LivePlayFrame): boolean {
  return frame.type === 'snapshot';
}

/**
 * Decode a `snapshot`-frame payload. Returns null when the payload is not a
 * well-formed snapshot object (fail-soft — the component keeps its prior
 * state rather than crashing the play view).
 */
/** One nickname-keyed ranked row (L5.2 interim scoreboard / podium). */
export interface LivePlayBoardRow {
  readonly nickname: string;
  readonly score: number;
  readonly streak: number;
  readonly rank: number;
}

/**
 * Decode a nickname-keyed board array (snapshot `scoreboard` / `podium` /
 * `final_scoreboard`, L5.2 CHO-1704). Drops malformed entries; tolerates
 * non-arrays (legacy frames) by returning [].
 */
export function decodeBoardRows(payload: unknown): readonly LivePlayBoardRow[] {
  if (!Array.isArray(payload)) return [];
  const out: LivePlayBoardRow[] = [];
  for (const e of payload) {
    if (!isObject(e)) continue;
    const nickname = asString(e['nickname']);
    if (!nickname) continue;
    out.push({
      nickname,
      score: asNumber(e['score']),
      streak: asNumber(e['streak']),
      rank: asNumber(e['rank']),
    });
  }
  return out;
}

export function decodeSnapshot(payload: unknown): LivePlaySnapshot | null {
  if (!isObject(payload)) return null;
  const rawCounts = payload['response_counts'];
  const responseCounts: Record<string, Record<string, number>> = {};
  if (isObject(rawCounts)) {
    for (const [qid, choices] of Object.entries(rawCounts)) {
      if (!isObject(choices)) continue;
      const inner: Record<string, number> = {};
      for (const [marker, count] of Object.entries(choices)) {
        inner[marker] = asNumber(count);
      }
      responseCounts[qid] = inner;
    }
  }
  const state = asString(payload['state'], 'ARMED');
  return {
    id: asString(payload['id']),
    liveQuizId: asString(payload['live_quiz_id']),
    tenantId: asString(payload['tenant_id']),
    instructorGcid: asString(payload['instructor_gcid']),
    state: (state === 'LIVE' || state === 'CLOSED' ? state : 'ARMED') as LivePlaySessionState,
    startedAt: typeof payload['started_at'] === 'string' ? payload['started_at'] : null,
    endedAt: typeof payload['ended_at'] === 'string' ? payload['ended_at'] : null,
    responseCounts,
    totalResponses: asNumber(payload['total_responses']),
    scoreboard: decodeBoardRows(payload['scoreboard']),
    podium: decodeBoardRows(payload['podium']),
  };
}

/**
 * Decode an `event`-frame leaderboard array if present. Tolerates the
 * payload either being the leaderboard array directly OR an object with a
 * `leaderboard` key (the two shapes seen across BE iterations). Returns []
 * when no leaderboard data is carried.
 */
export function decodeLeaderboard(payload: unknown): readonly LivePlayLeaderboardEntry[] {
  const arr = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload['leaderboard'])
      ? (payload['leaderboard'] as unknown[])
      : null;
  if (!arr) return [];
  return arr
    .filter(isObject)
    .map((e) => ({
      gcid: asString(e['gcid']),
      displayName: asString(e['display_name'], asString(e['gcid'])),
      score: asNumber(e['score']),
    }))
    .filter((e) => e.gcid.length > 0);
}

/**
 * Build the per-question tally rows for a given questionId. Sorted
 * marker-asc; percent rounded to nearest int; safe at 0 total (returns []).
 */
export function buildTallyRows(
  snapshot: LivePlaySnapshot | null,
  questionId: string,
): readonly LivePlayTallyRow[] {
  if (!snapshot) return [];
  const counts = snapshot.responseCounts[questionId];
  if (!counts) return [];
  const markers = Object.keys(counts).sort();
  if (markers.length === 0) return [];
  const total = markers.reduce((sum, m) => sum + counts[m]!, 0);
  if (total <= 0) return [];
  return markers.map((marker) => ({
    marker,
    count: counts[marker]!,
    percent: Math.round((counts[marker]! / total) * 100),
  }));
}

/**
 * Sort + cap a leaderboard to the top-N by cumulative score (score-desc,
 * then displayName-asc for stable ties). Default N = 10.
 */
export function topNLeaderboard(
  entries: readonly LivePlayLeaderboardEntry[],
  n = 10,
): readonly LivePlayLeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
    .slice(0, Math.max(0, n));
}

/**
 * Whether option explainers should be revealed in the play view for the
 * given session state + quiz explainer-mode. The play view receives the
 * quiz's `explainerMode` from the parent route resolver / quiz fetch.
 *
 *   - NEVER            → never reveal.
 *   - IMMEDIATE        → reveal whenever LIVE (per-question immediate).
 *   - END_OF_QUESTION  → reveal whenever LIVE (the question is closed when
 *                        the instructor advances; the FE shows the reveal
 *                        once counts exist for the current question).
 *   - END_OF_SESSION   → reveal only when CLOSED.
 */
export function shouldRevealExplainers(
  mode: ExplainerMode,
  state: LivePlaySessionState,
): boolean {
  switch (mode) {
    case 'NEVER':
      return false;
    case 'END_OF_SESSION':
      return state === 'CLOSED';
    case 'IMMEDIATE':
    case 'END_OF_QUESTION':
      return state === 'LIVE' || state === 'CLOSED';
    default:
      return false;
  }
}

/** Build the wss:// URL for the per-session live-quiz WS fan-out. */
export function liveQuizWsPath(sessionId: string): string {
  return `/api/v1/live-quizzes/${encodeURIComponent(sessionId)}/ws`;
}
