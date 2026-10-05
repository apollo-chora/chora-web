/**
 * SpacedRepetitionService — Ebbinghaus SM-2 feedback adapter.
 *
 * Wraps `POST /api/atoms/{atom_id}/feedback` (per
 * `chora-contracts/openapi/bff-gateway.yaml` §submitFeedback) to record a
 * learner's recall quality score after completing a Daily Dose atom. The BFF
 * fans out to `chora-consumption:/atoms/{atom_id}/feedback` where the SM-2
 * algorithm updates the `SpacedRepetitionSchedule` aggregate and schedules
 * the next review interval via the Ebbinghaus formula:
 *   `next_review_at = last_correct_at + ebbinghaus_interval(repetition_count, recall_score)`
 *
 * The spaced-repetition *ordering* of the Daily Dose is handled BE-side by
 * the Ebbinghaus Scheduler crew — atoms with the lowest retention urgency
 * (lowest `retention_state`) surface first in the dose. The FE's role here
 * is two-fold:
 *   1. Display each atom's `retention_state` as a colour-coded indicator
 *      (matching `--chora-retention-{high,medium,low,unknown}` tokens).
 *   2. POST recall feedback when the learner completes an atom, so the
 *      Ebbinghaus schedule advances correctly.
 *
 * FOLLOW-UP BE ASK (WS-12-SR-1): `GET /api/v1/me/atoms/spaced-repetition`
 * is NOT present in bff-gateway.yaml as of 2026-05-26. The Ebbinghaus-ordered
 * atom list is currently embedded within the `GET /api/familiar/daily-dose`
 * response (atom_breakdown.ebbinghaus count + per-atom category='review').
 * This service FAILS LOUD on any 4xx/5xx from the feedback endpoint per the
 * no-stubs-real-wiring directive.
 *
 * FOLLOW-UP BE ASK (WS-12-SR-2): Per-atom `retention_state` field
 * (`high | medium | low | unknown`) is NOT returned in the current
 * `DailyDoseAtom` wire shape. The FE derives a proxy from `category`:
 *   - 'review'   → low  (Ebbinghaus urgency: overdue)
 *   - 'stretch'  → medium (weakness/lag)
 *   - 'new'      → unknown (no history yet)
 * Once BE adds `retention_state` to the atom wire, update `DailyDoseAtom` +
 * remove the `retentionStateFromCategory()` helper below.
 *
 * Domain vocabulary:
 *   - `SpacedRepetitionSchedule` aggregate (chora_consumption)
 *   - `RepetitionInterval` child (one row per scheduled review window)
 *   - `retention_state` ∈ { high, medium, low, unknown }
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { BffClientService } from './bff-client.service';
import type { DailyDoseAtomCategory } from '../../features/surfaces/aplus/daily-dose/daily-dose.model';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Recall quality scores per SM-2 (0 = total blackout; 5 = perfect recall). */
export type RecallQuality = 0 | 1 | 2 | 3 | 4 | 5;

export interface SpacedRepetitionFeedbackRequest {
  /** UUIDv7 of the atom session just completed. */
  readonly session_id: string;
  /** SM-2 recall quality (0-5). Maps to UI choices: again/hard/good/easy. */
  readonly recall_quality: RecallQuality;
  /** Time taken on this atom in milliseconds. */
  readonly elapsed_ms?: number;
}

export interface SpacedRepetitionFeedbackResponse {
  /** ISO timestamp when this atom is scheduled for next review. */
  readonly next_review_at: string;
  /** The updated SM-2 ease factor (stored in SpacedRepetitionSchedule). */
  readonly ease_factor: number;
  /** How many days until next review. */
  readonly interval_days: number;
}

/**
 * Retention state — mirrors `atom.retention_state` enum in chora_consumption.
 * See WS-12-SR-2 follow-up: currently derived from category as a proxy.
 */
export type RetentionState = 'high' | 'medium' | 'low' | 'unknown';

// ---------------------------------------------------------------------------
// Helpers (exported for testing + component use)
// ---------------------------------------------------------------------------

/**
 * Derive a retention state proxy from the dose atom category.
 * Remove when BE adds `retention_state` directly to the DailyDoseAtom wire.
 *
 * WS-12-SR-2: proxy mapping:
 *   review  → low     (Ebbinghaus overdue)
 *   stretch → medium  (weakness/spaced-repetition lag)
 *   new     → unknown (no history yet)
 */
export function retentionStateFromCategory(
  category: DailyDoseAtomCategory,
): RetentionState {
  switch (category) {
    case 'review':
      return 'low';
    case 'stretch':
      return 'medium';
    case 'new':
      return 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Map retention state to the design-system CSS variable name.
 * Tokens defined in `styles/_polyglass-tokens.scss`.
 */
export function retentionColorVar(state: RetentionState): string {
  return `var(--chora-retention-${state})`;
}

/**
 * Map retention state to an accessible FA icon + label for the indicator.
 * Avoids color-alone encoding per WCAG 2.1 AA §1.4.1.
 */
export function retentionIconClass(state: RetentionState): string {
  switch (state) {
    case 'high':
      return 'fa-solid fa-circle-check';
    case 'medium':
      return 'fa-solid fa-circle-half-stroke';
    case 'low':
      return 'fa-solid fa-circle-exclamation';
    case 'unknown':
    default:
      return 'fa-solid fa-circle-question';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class SpacedRepetitionService {
  private readonly bff = inject(BffClientService);

  /**
   * Submit SM-2 recall feedback for a completed atom.
   *
   * Endpoint: `POST /api/atoms/{atom_id}/feedback`
   * Contract: `chora-contracts/openapi/bff-gateway.yaml` §submitFeedback
   *
   * Fail-loud: 4xx/5xx propagates to the caller. No silent fallback.
   * Caller (DailyDoseComponent) should handle the error via AsyncState.
   */
  submitFeedback(
    atomId: string,
    request: SpacedRepetitionFeedbackRequest,
  ): Observable<SpacedRepetitionFeedbackResponse> {
    if (!atomId) {
      return throwError(() => new Error('spaced-repetition: atomId is required'));
    }
    return this.bff
      .post<SpacedRepetitionFeedbackResponse>(
        `/api/atoms/${encodeURIComponent(atomId)}/feedback`,
        request,
      )
      .pipe(
        map((res) => {
          if (!res || typeof res.next_review_at !== 'string') {
            throw new Error('spaced-repetition: malformed feedback response');
          }
          return res;
        }),
        catchError((err: unknown) => {
          // Re-throw with a structured message so callers can distinguish
          // network errors from domain errors.
          const status = (err as { status?: number })?.status;
          const msg =
            status != null
              ? `spaced-repetition feedback failed: HTTP ${status}`
              : 'spaced-repetition feedback failed: unknown error';
          return throwError(() => Object.assign(new Error(msg), { original: err }));
        }),
      );
  }
}
