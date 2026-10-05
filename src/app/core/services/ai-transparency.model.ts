/**
 * AI Transparency model — ADR-225 (EU AI Act Art 50 + IMDA MGF D2/D4).
 *
 * Source of truth: the BFF governance-config endpoint (camelCase over the wire):
 *   GET  /api/v1/me/ai-transparency?locale={loc} → AiTransparencyStatus (200)
 *   POST /api/v1/me/ai-transparency/acknowledge  → AiAcknowledgeResponse  (201)
 *
 * This is a NOTICE-ONLY transparency surface — a one-time first-interaction
 * ACKNOWLEDGEMENT (single "Got it", NO decline / AI-off branch), a persistent
 * "AI companion" badge, and inline "AI-generated" labels. The disclosure
 * STRINGS (notice / badge / inlineLabels) are the governance-config source of
 * truth and are rendered DIRECTLY — they are NOT mirrored into en.json.
 *
 * Wire DTOs here are camelCase (this endpoint is camelCase over the BFF, unlike
 * the snake_case learner-economy contracts) — the models mirror the contract
 * EXACTLY, no synthesized fields.
 */

/** Which age-appropriate copy variant the BE selected for this learner. */
export type AiAudienceVariant = 'standard' | 'minor';

/** The one-time first-interaction notice copy (rendered directly). */
export interface AiDisclosureNotice {
  readonly title: string;
  readonly body: string;
  /** The single acknowledgement CTA label ("Got it"). */
  readonly action: string;
}

/** The persistent "AI companion" badge copy (rendered directly). */
export interface AiDisclosureBadge {
  readonly label: string;
  readonly tooltip: string;
}

/** One inline AI label — a reusable chip's label + tooltip. */
export interface AiInlineLabel {
  readonly label: string;
  readonly tooltip: string;
}

/** The catalogue of inline labels keyed by canonical variant. */
export interface AiInlineLabels {
  readonly aiGenerated: AiInlineLabel;
  readonly aiAssisted: AiInlineLabel;
  readonly doseHeader: AiInlineLabel;
}

/** The canonical inline-label variant keys (chip `variant` input domain). */
export type AiInlineLabelVariant = keyof AiInlineLabels;

/** The full versioned, localised disclosure payload. */
export interface AiDisclosure {
  readonly version: string;
  readonly locale: string;
  readonly audienceVariant: AiAudienceVariant;
  readonly notice: AiDisclosureNotice;
  readonly badge: AiDisclosureBadge;
  readonly inlineLabels: AiInlineLabels;
}

/** GET /api/v1/me/ai-transparency response. */
export interface AiTransparencyStatus {
  readonly mustAcknowledge: boolean;
  readonly currentVersion: string;
  readonly acknowledgedVersion: string | null;
  readonly disclosure: AiDisclosure;
}

/**
 * POST /api/v1/me/ai-transparency/acknowledge request body.
 * `surface` + `scope` are REQUIRED; the rest are BE-defaultable and the
 * service back-fills `disclosureVersion` / `locale` from the loaded disclosure.
 */
export interface AiAcknowledgeRequest {
  readonly surface: string;
  readonly scope: string;
  readonly disclosureVersion?: string;
  readonly firstShownAt?: string;
  readonly locale?: string;
}

/** POST /api/v1/me/ai-transparency/acknowledge 201 response (idempotent). */
export interface AiAcknowledgeResponse {
  readonly acknowledged: boolean;
  readonly disclosureVersion: string;
  readonly acknowledgedAt: string;
  readonly minorMode: boolean;
}

/** Canonical BE error envelope — `{ code, message }`. */
export interface AiTransparencyErrorResponse {
  readonly code: string;
  readonly message: string;
}

// ── AsyncState discriminated unions (fail-loud per chora-web CLAUDE.md §3) ──

/** Load state for the GET /api/v1/me/ai-transparency fetch. */
export type AiTransparencyLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly transparency: AiTransparencyStatus }
  | { readonly status: 'error'; readonly error: string };

/** Flow state for the POST acknowledge action. */
export type AiAcknowledgeState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: AiAcknowledgeResponse }
  | { readonly status: 'error'; readonly error: string };
