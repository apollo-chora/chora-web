/**
 * Me-Transcript model — A+ per-learner transcript view (W6 outcome spine).
 *
 * Types the self-scoped `GET /api/v1/me/transcript` read over chora-consumption's
 * `StudentTranscript` projection (`transcript_handler.go` → `handleMeTranscript`).
 * The BE returns `{ items:[...] }`, newest-first, gcid-scoped from the request
 * context. One row per graded outcome — an `assessment` (submission graded) or a
 * `certification` (course cert issued).
 *
 * `score_*`, `passed` and `course_id` are explicit `null` on the wire (the BE
 * writes them with no `omitempty` — see `transcriptEntryResp`): a certification
 * carries no score, and a submitted-but-unreleased assessment can exist before
 * it has one. Mapping is null-safe throughout; a null `scorePercent` renders as
 * an em-dash "—", NEVER a fabricated 0%.
 */

// ── Kind — the two graded-outcome shapes the transcript projects ──────
// Mirrors chora-consumption's student_transcript.Kind (assessment | certification).

export type TranscriptKind = 'assessment' | 'certification';

// ── Wire shape (snake_case) — GET /api/v1/me/transcript items[] ───────

export interface TranscriptEntryWire {
  readonly entry_id: string;
  readonly gcid: string;
  readonly kind: string;
  readonly source_ref: string;
  readonly title: string;
  readonly score_earned: number | null;
  readonly score_possible: number | null;
  readonly score_percent: number | null;
  readonly passed: boolean | null;
  readonly course_id: string | null;
  readonly occurred_at: string;
}

export interface TranscriptListResponse {
  readonly items?: readonly TranscriptEntryWire[] | null;
}

// ── FE model (camelCase) ──────────────────────────────────────────────

export interface TranscriptEntry {
  readonly entryId: string;
  readonly gcid: string;
  readonly kind: TranscriptKind;
  /** assessment_id (assessment) or cert_id (certification); cross-domain UUID, no FK. */
  readonly sourceRef: string;
  readonly title: string;
  readonly scoreEarned: number | null;
  readonly scorePossible: number | null;
  /** BE-derived (earned/possible*100 when possible > 0); null for score-less rows. */
  readonly scorePercent: number | null;
  readonly passed: boolean | null;
  readonly courseId: string | null;
  readonly occurredAt: string;
}

// ── AsyncState discriminated union (fail-loud per chora-web CLAUDE.md §3) ──

export type MeTranscriptState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly TranscriptEntry[] }
  | { readonly status: 'error'; readonly error: string };

export const I18N_PREFIX = 'aplus.me_transcript' as const;

// ── Mappers (null-safe) ───────────────────────────────────────────────

/**
 * Normalise the wire `kind` string to the canonical two-value union. The BE
 * domain validates Kind before it ever reaches the wire (student_transcript.
 * Kind.Valid), so an unrecognised value is not expected; it falls back to
 * `assessment` defensively so the chip always renders.
 */
export function normalizeTranscriptKind(raw: string): TranscriptKind {
  return raw === 'certification' ? 'certification' : 'assessment';
}

/**
 * Map one wire row → FE model. Null-safe: nullable score/pass/course_id fields
 * stay `null` rather than being coerced — a null `scorePercent` MUST render as
 * an em-dash, never a fabricated 0%. `?? null` normalises an absent key (older
 * BE) to the same null the current BE writes explicitly.
 */
export function mapTranscriptEntry(w: TranscriptEntryWire): TranscriptEntry {
  return {
    entryId: w.entry_id,
    gcid: w.gcid,
    kind: normalizeTranscriptKind(w.kind),
    sourceRef: w.source_ref,
    title: w.title ?? '',
    scoreEarned: w.score_earned ?? null,
    scorePossible: w.score_possible ?? null,
    scorePercent: w.score_percent ?? null,
    passed: w.passed ?? null,
    courseId: w.course_id ?? null,
    occurredAt: w.occurred_at,
  };
}

/**
 * Map the `{ items:[...] }` envelope, preserving the BE's newest-first order.
 * A missing/null `items` yields `[]` (honest empty — never a fabricated row).
 */
export function mapTranscriptList(
  resp: TranscriptListResponse | null | undefined,
): readonly TranscriptEntry[] {
  const items = resp?.items ?? [];
  return items.map(mapTranscriptEntry);
}
