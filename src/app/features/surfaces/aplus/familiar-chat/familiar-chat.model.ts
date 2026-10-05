/**
 * Familiar Chat — ADR-154 SSE chat surface types.
 *
 * Endpoint: `POST /api/v1/me/familiars/{familiar_id}/chat`
 * Wire:     `text/event-stream` (5 event types) per
 *           `chora-contracts/openapi/consumption-familiar-chat.yaml`.
 *
 * Tier-aware mana cost (5 / 15 / 30) — basic / standard / premium.
 * 402 reuses `InsufficientManaUpsell` envelope from learner-economy.
 */

import type { InsufficientManaUpsell } from '../../../../core/services/me-mana.model';
import type { SeekerCitation } from '../../../../core/familiar/familiar-growth.model';

export interface ChatRequest {
  readonly message: string;
  readonly max_output_tokens?: number;
  readonly locale?: string;
}

// ─── SSE event frames (one per `event:` line) ──────────────────────────

export interface SessionOpenFrame {
  readonly type: 'session_open';
  readonly session_id: string;
  readonly turn_id: string;
  readonly engine_session_id: string;
}

export type ToolName = 'atom_search' | 'persona_lookup' | 'ebbinghaus_state';

export interface ToolCallFrame {
  readonly type: 'tool_call';
  readonly tool: ToolName;
  readonly args: Record<string, unknown>;
}

export interface TokenFrame {
  readonly type: 'token';
  readonly text: string;
}

export type FinishReason =
  | 'STOP'
  | 'MAX_TOKENS'
  | 'SAFETY'
  | 'TOOL_ERROR'
  | 'UNKNOWN';

export interface TurnCompleteFrame {
  readonly type: 'turn_complete';
  readonly session_id: string;
  readonly turn_id: string;
  readonly output_tokens: number;
  readonly mana_charged: number;
  readonly model: string;
  readonly finish_reason?: FinishReason;
}

export type ChatErrorCode =
  | 'ENGINE_STREAM_ABORTED'
  | 'ENGINE_TIMEOUT'
  | 'GUARDRAIL_BLOCKED'
  | 'TOOL_FAILED'
  | 'INTERNAL_ERROR';

export interface ChatErrorFrame {
  readonly type: 'error';
  readonly code: ChatErrorCode;
  readonly message: string;
}

/**
 * One DURABLE source behind a research note the turn recalled (CHO-2192).
 *
 * ⚠ There is NO url, by design (ADR-231 D4). The live citation's uri is a Google
 * grounding-api-redirect that expires (~30 days) and was deliberately never
 * persisted — replaying one from a months-old note would hand the learner a dead
 * link that still LOOKS live, which is worse than no link at all.
 */
export interface GroundingCitation {
  readonly domain: string;
  readonly title: string;
  readonly snippet: string;
}

/**
 * The per-turn source disclosure (CHO-2192), emitted by chora-consumption BEFORE
 * the answer tokens so the learner meets the sources before the claim.
 *
 * Arrives IF AND ONLY IF the turn recalled a GROUNDED (research) note. A turn
 * with no grounded recall sends no frame at all — an empty attribution block
 * would imply a web search that never happened.
 *
 * ⚠ snake_case, like its five sibling frames: the gateway copies SSE bytes
 * verbatim, so unlike the familiar-memory READ endpoint (whose body the
 * FamiliarBridge camelises) this wire is not rewritten in flight.
 */
export interface GroundingFrame {
  readonly type: 'grounding';
  readonly citations: readonly GroundingCitation[];
  readonly web_search_queries: readonly string[];
  /** Recalled research notes written before mig 0094 — sources genuinely unrecorded. */
  readonly unrecorded_notes: number;
}

export type ChatEvent =
  | SessionOpenFrame
  | ToolCallFrame
  | TokenFrame
  | TurnCompleteFrame
  | GroundingFrame
  | ChatErrorFrame;

// ─── 402 envelope (mirrors me-mana.model.InsufficientManaUpsell) ───────

export interface InsufficientManaError {
  readonly kind: 'insufficient_mana';
  readonly upsell: InsufficientManaUpsell;
}

export interface TransportError {
  readonly kind: 'transport';
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

export type ChatStreamError = InsufficientManaError | TransportError;

// ─── Local-state types for the chat component ──────────────────────────

export interface ChatMessage {
  /** Stable id for trackBy. */
  readonly id: string;
  /** Author. */
  readonly role: 'user' | 'familiar';
  /** Final rendered text (for in-flight Familiar turn this is the
   *  cumulative concatenation of token frames). */
  readonly text: string;
  /** Familiar turns only — tool invocations observed during the turn. */
  readonly tool_calls?: readonly { tool: ToolName }[];
  /** Familiar turns only — completion metadata. */
  readonly completion?: {
    readonly mana_charged: number;
    readonly model: string;
    readonly finish_reason?: FinishReason;
  };
  /** Familiar turns only — true while the turn is still streaming. */
  readonly streaming?: boolean;
  /** Familiar turns only — engine-emitted error frame received mid-turn. */
  readonly error_frame?: {
    readonly code: ChatErrorCode;
    readonly message: string;
  };
  /**
   * Familiar turns only — the grounded provenance behind a research note this
   * turn recalled (CHO-2192). Absent on every turn that recalled none, which is
   * most of them; its absence is what makes "no attribution block" the default.
   *
   * `hasProvenance` is derived from CONTENT, not from the frame's mere presence:
   * a turn can be grounded yet have nothing recorded (a note older than mig
   * 0094), and that must render as an honest "not recorded" line rather than an
   * empty sources block.
   */
  readonly grounded?: {
    readonly hasProvenance: boolean;
    readonly citations: readonly SeekerCitation[];
    readonly webSearchQueries: readonly string[];
    readonly unrecordedNotes: number;
  };
}

export type ChatTurnState =
  | { readonly status: 'idle' }
  | { readonly status: 'sending' }
  | { readonly status: 'streaming'; readonly assistantMessageId: string }
  | { readonly status: 'error'; readonly error: string };
