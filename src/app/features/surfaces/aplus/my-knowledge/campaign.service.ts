/**
 * CampaignService — the learner-facing Familiar-campaign doors (WS-C7,
 * CHO-2086, ADR-227 D14/D15/D16). Wired through `BffClientService` per
 * chora-web/CLAUDE.md §3 (the sole HTTP adapter; it prepends the gateway base
 * URL). This service owns ONLY the map-side campaign mutations — set-focus
 * ("March here"), seal, and the C6 merge/split doors. The practice-lane
 * question client (serve + answer) is a SEPARATE service (WS-C3 lane).
 *
 * Fail-loud: every method returns the RAW Observable so the canvas sees the real
 * gateway error and renders it honestly via the `httpErrorView` idiom + the
 * per-door error-key map below. No fixtures, no in-memory fallback.
 *
 * FE-facing paths (gateway → chora-consumption):
 *   POST /api/v1/me/goals/{goalId}/campaign/focus  {conceptId|null}
 *   POST /api/v1/me/goals/{goalId}/campaign/seal
 *   POST /api/v1/me/concept-graph/concepts/{id}/merge  {survivorConceptId}
 *   POST /api/v1/me/concept-graph/concepts/{id}/split  {children,...}
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import type { CampaignSealResult } from './campaign.model';

/** `POST /me/goals/{id}/campaign/focus` success body (camelCase wire). */
export interface CampaignFocusResult {
  readonly goalId: string;
  /** Absent when the focus was cleared (`conceptId: null`). */
  readonly focusConceptId?: string;
}

/** `POST /me/concept-graph/concepts/{id}/merge` success body. */
export interface CampaignMergeResult {
  readonly survivorConceptId: string;
  readonly absorbedConceptId: string;
}

/** One child minted by a split (`conceptKey` = the slug axis, D14). */
export interface CampaignSplitChild {
  readonly conceptId: string;
  readonly title: string;
  readonly conceptKey: string;
}

/** `POST /me/concept-graph/concepts/{id}/split` success body. */
export interface CampaignSplitResult {
  readonly parentConceptId: string;
  readonly children: readonly CampaignSplitChild[];
}

/** A split child spec — just a title; the server mints the concept + key. */
export interface CampaignSplitChildSpec {
  readonly title: string;
}

/** `POST /me/concept-graph/concepts/{id}/split` request body. */
export interface CampaignSplitRequest {
  readonly children: readonly CampaignSplitChildSpec[];
  /** Optional atom re-assignment (atomId → child index); omitted = default. */
  readonly childAssignments?: Readonly<Record<string, number>>;
  /** The child that inherits the campaign focus (defaults server-side to 0). */
  readonly focusChildIndex?: number;
}

/** Which campaign door failed — scopes the error-key fallback + copy. */
export type CampaignOp = 'focus' | 'seal' | 'merge' | 'split';

const GOALS = '/api/v1/me/goals';
const CONCEPTS = '/api/v1/me/concept-graph/concepts';

@Injectable({ providedIn: 'root' })
export class CampaignService {
  private readonly bff = inject(BffClientService);

  /**
   * Set (or clear) the campaign focus — the single "March here" pointer (D16).
   * `conceptId: null` clears it. The BE also retargets Familiar resonance to the
   * focus post-commit; the FE never exposes a second pointer.
   */
  setFocus(
    goalId: string,
    conceptId: string | null,
  ): Observable<CampaignFocusResult> {
    return this.bff.post<CampaignFocusResult>(
      `${GOALS}/${encodeURIComponent(goalId)}/campaign/focus`,
      { conceptId },
    );
  }

  /**
   * Seal the campaign — the frontier is empty, so fortify every won province
   * (D15). Re-seal caps + "too soon" pacing stay server-side 409s; the caller
   * renders them via `campaignErrorKey('seal', …)`.
   */
  seal(goalId: string): Observable<CampaignSealResult> {
    return this.bff.post<CampaignSealResult>(
      `${GOALS}/${encodeURIComponent(goalId)}/campaign/seal`,
      {},
    );
  }

  /**
   * Merge `absorbedConceptId` INTO `survivorConceptId` (C6, D14). The absorbed
   * node's path (edges, ladder, retention, suggestions) folds into the survivor;
   * the root can absorb but is never merged away (409 `ROOT_IMMUTABLE`).
   */
  merge(
    absorbedConceptId: string,
    survivorConceptId: string,
  ): Observable<CampaignMergeResult> {
    return this.bff.post<CampaignMergeResult>(
      `${CONCEPTS}/${encodeURIComponent(absorbedConceptId)}/merge`,
      { survivorConceptId },
    );
  }

  /**
   * Split `parentConceptId` into ≥2 children (C6, D14). Children inherit the
   * parent's ladder + retention; the chosen child (`focusChildIndex`) takes the
   * campaign focus. The root is never split (no affordance rendered).
   */
  split(
    parentConceptId: string,
    request: CampaignSplitRequest,
  ): Observable<CampaignSplitResult> {
    return this.bff.post<CampaignSplitResult>(
      `${CONCEPTS}/${encodeURIComponent(parentConceptId)}/split`,
      request,
    );
  }
}

/**
 * Pull the domain error CODE off a campaign-door failure, honouring BOTH shapes
 * Chora observes: the raw `HttpErrorResponse` (interceptor-less specs, body on
 * `.error`) and the runtime `ApiError` re-thrown by `errorInterceptor` (raw body
 * on `.body`). The consumption ext handler writes a FLAT `{code, message}`; a
 * gateway that re-envelopes wraps it as `{error: {code}}` — read either. Returns
 * `null` when no code is present (a 5xx / network blip → the op fallback key).
 */
export function campaignErrorCode(err: unknown): string | null {
  const body = httpErrorView(err)?.body;
  if (body !== null && typeof body === 'object') {
    const flat = (body as { code?: unknown }).code;
    if (typeof flat === 'string' && flat.length > 0) return flat;
    const nested = (body as { error?: { code?: unknown } }).error?.code;
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return null;
}

const FOCUS_KEYS: Readonly<Record<string, string>> = {
  CONCEPT_NOT_FOUND: 'aplus.knowledge.campaign_focus_err_not_found',
  FOCUS_OUTSIDE_CAMPAIGN: 'aplus.knowledge.campaign_focus_err_outside',
  CAMPAIGN_NOT_ANCHORED: 'aplus.knowledge.campaign_focus_err_not_anchored',
};

const SEAL_KEYS: Readonly<Record<string, string>> = {
  FRONTIER_NOT_EMPTY: 'aplus.knowledge.campaign_seal_frontier_not_empty',
  SEAL_TOO_SOON: 'aplus.knowledge.campaign_seal_too_soon',
  SEAL_NO_NEW_WINS: 'aplus.knowledge.campaign_seal_no_new_wins',
  CAMPAIGN_EMPTY: 'aplus.knowledge.campaign_seal_empty',
};

// Shared merge/split sentinels (both doors funnel through the same Go
// `writeMergeSplitError`): root-immutable, ambiguity, unknown/deleted concept,
// not-wired. Split-only codes (too-few, duplicate, focus-child, invalid-split)
// layer on top in `SPLIT_KEYS`.
const MERGE_SHARED_KEYS: Readonly<Record<string, string>> = {
  ROOT_IMMUTABLE: 'aplus.knowledge.campaign_merge_err_root_immutable',
  MERGE_SPLIT_AMBIGUOUS: 'aplus.knowledge.campaign_merge_err_ambiguous',
  CONCEPT_NOT_FOUND: 'aplus.knowledge.campaign_merge_err_not_found',
  CONCEPT_DELETED: 'aplus.knowledge.campaign_merge_err_deleted',
  MERGE_SPLIT_NOT_WIRED: 'aplus.knowledge.campaign_merge_err_unavailable',
};

const MERGE_KEYS: Readonly<Record<string, string>> = {
  ...MERGE_SHARED_KEYS,
  INVALID_MERGE: 'aplus.knowledge.campaign_merge_err_invalid',
  INVALID_MERGE_SPLIT: 'aplus.knowledge.campaign_merge_err_invalid',
};

const SPLIT_KEYS: Readonly<Record<string, string>> = {
  ...MERGE_SHARED_KEYS,
  SPLIT_TOO_FEW: 'aplus.knowledge.campaign_split_err_too_few',
  SPLIT_DUPLICATE_KEY: 'aplus.knowledge.campaign_split_err_duplicate',
  INVALID_FOCUS_CHILD: 'aplus.knowledge.campaign_split_err_focus_child',
  INVALID_SPLIT: 'aplus.knowledge.campaign_split_err_invalid',
  INVALID_MERGE_SPLIT: 'aplus.knowledge.campaign_split_err_invalid',
};

const OP_TABLE: Readonly<
  Record<CampaignOp, { keys: Readonly<Record<string, string>>; fallback: string }>
> = {
  focus: { keys: FOCUS_KEYS, fallback: 'aplus.knowledge.campaign_focus_err' },
  seal: { keys: SEAL_KEYS, fallback: 'aplus.knowledge.campaign_seal_err' },
  merge: { keys: MERGE_KEYS, fallback: 'aplus.knowledge.campaign_merge_err' },
  split: { keys: SPLIT_KEYS, fallback: 'aplus.knowledge.campaign_split_err' },
};

/**
 * Map a campaign-door failure to an honest i18n key, scoped by the operation
 * that failed. An unmapped / absent code resolves to the op's generic fallback
 * (never a raw BE body — Security). The seal `FRONTIER_NOT_EMPTY` key takes a
 * `{{count}}` param the caller supplies from the campaign frontier tally.
 */
export function campaignErrorKey(op: CampaignOp, err: unknown): string {
  const { keys, fallback } = OP_TABLE[op];
  const code = campaignErrorCode(err);
  return (code && keys[code]) || fallback;
}
