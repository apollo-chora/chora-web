/**
 * CeremonyEdgesService — BFF client for the ceremony learning-edges flow
 * (CHO-2040, owner ruling R8-3). Stateless API adapter in the
 * FamiliarGrowthService mould: every method returns a cold Observable and
 * FAILS LOUD (no mock fallback, no silent success) — the panel component
 * owns the signal state.
 *
 * Three wire calls, one orchestration:
 *  1. `propose()`  → POST /api/v1/me/familiars/{id}/ceremony/edge-scout
 *  2. `mintEdges()`→ POST /api/v1/me/goals/{goalId}/learning-edges (CHO-2038,
 *     KG-owned — this service only CALLS it; the mint itself is KG territory)
 *  3. `confirmMemory()` → POST .../ceremony/edge-scout/confirm
 *
 * `confirmSelection()` runs 2 THEN 3 sequentially. A mint failure aborts
 * (error propagates — nothing was written). A memory-hook failure AFTER a
 * successful mint resolves with `memory.status === 'failed'` so the panel
 * shows the non-blocking "edges minted; memory sync failed" warning with a
 * hook-only retry — the edges are already real on the learner's map and a
 * blocking error here would misreport the mint.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { normalizeEdgeScoutProposal } from './ceremony-edges.model';
import type {
  CeremonyConfirmOutcome,
  CeremonyMemoryReceipt,
  EdgeScoutProposal,
  LearningEdgeSelection,
  MintLearningEdgesResponse,
  MintedLearningEdge,
} from './ceremony-edges.model';

@Injectable({ providedIn: 'root' })
export class CeremonyEdgesService {
  private readonly bff = inject(BffClientService);

  /**
   * Run the Familiar's edge-scout crawl for one goal (mana-priced; the
   * gateway is the sole debiter per ADR-177). 402 insufficient_mana /
   * 404 / 422 / 502 / 503 propagate untouched for typed handling upstream.
   */
  propose(familiarId: string, goalId: string): Observable<EdgeScoutProposal> {
    return this.bff
      .post<unknown>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/ceremony/edge-scout`,
        { goal_id: goalId },
      )
      .pipe(map(normalizeEdgeScoutProposal));
  }

  /**
   * Mint the ticked edges onto the learner's map (CHO-2038, KG-owned
   * endpoint). Accepts BOTH response keys (`learningEdges` as-built /
   * `edges` per the CHO-2040 brief — contract in flight tonight) and
   * throws when neither is present rather than fabricating a success.
   */
  mintEdges(
    goalId: string,
    edges: readonly LearningEdgeSelection[],
  ): Observable<readonly MintedLearningEdge[]> {
    return this.bff
      .post<MintLearningEdgesResponse>(
        `/api/v1/me/goals/${encodeURIComponent(goalId)}/learning-edges`,
        { edges },
      )
      .pipe(
        map((res) => {
          const minted = res.learningEdges ?? res.edges;
          if (!minted) {
            throw new Error(
              'ceremony-edges: mint response carried neither learningEdges nor edges',
            );
          }
          return minted;
        }),
      );
  }

  /**
   * Feed the Familiar's memory with the minted edges (publish
   * weakness.analyzed.v1 for remediate + note explore — BE-side split).
   * Snake_case body per the CHO-2040 contract.
   */
  confirmMemory(
    familiarId: string,
    goalId: string,
    minted: readonly MintedLearningEdge[],
  ): Observable<CeremonyMemoryReceipt> {
    return this.bff.post<CeremonyMemoryReceipt>(
      `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/ceremony/edge-scout/confirm`,
      {
        goal_id: goalId,
        edges: minted.map((m) => ({
          concept_id: m.conceptId,
          title: m.title,
          intent: m.intent,
        })),
      },
    );
  }

  /**
   * The locked confirm orchestration: mint (2) THEN memory hook (3),
   * sequential. Mint failure → the error propagates (nothing minted).
   * Hook failure after a successful mint → non-blocking partial outcome.
   */
  confirmSelection(
    familiarId: string,
    goalId: string,
    edges: readonly LearningEdgeSelection[],
  ): Observable<CeremonyConfirmOutcome> {
    return this.mintEdges(goalId, edges).pipe(
      switchMap((minted) =>
        this.confirmMemory(familiarId, goalId, minted).pipe(
          map(
            (receipt): CeremonyConfirmOutcome => ({
              minted,
              memory: { status: 'synced', receipt },
            }),
          ),
          catchError(() =>
            of<CeremonyConfirmOutcome>({
              minted,
              memory: { status: 'failed' },
            }),
          ),
        ),
      ),
    );
  }
}
