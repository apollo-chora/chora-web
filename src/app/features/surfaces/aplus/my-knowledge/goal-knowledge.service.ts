/**
 * GoalKnowledgeService — chora-gateway client for the Companion's goal-scoped
 * knowledge read model (CHO-2118 tier 2). Wired through `BffClientService` per
 * chora-web/CLAUDE.md §3.
 *
 * FE-facing path (gateway → chora-consumption, proxied verbatim on the
 * already-published `/api/v1/me/goals/` subtree):
 *   GET /api/v1/me/goals/{goalId}/knowledge
 *
 * ⚠ **This read is not free.** On a stale or missing cache row the backend
 * claims the row and schedules an LLM synthesis (Pub/Sub → chora-fog-orchestrator
 * → chora-model-gateway). A cache hit costs nothing; a miss costs a model call.
 * So callers MUST only fire it when the Companion surface is actually on screen
 * — never speculatively, never on a tab the learner is not looking at.
 *
 * Raw Observable, no fallback: the CALLER decides the fail-soft policy (and it
 * is fail-soft — the reflection degrades to the deterministic tier-1 block).
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type { GoalKnowledge } from '../discovery-graph/familiar-map.model';

const GOALS = '/api/v1/me/goals';

@Injectable({ providedIn: 'root' })
export class GoalKnowledgeService {
  private readonly bff = inject(BffClientService);

  /**
   * GET the goal-scoped knowledge model: the deterministic tier-1 block plus
   * the cached tier-2 reflection and its status (`fresh` / `reflecting` /
   * `none`). The body carries NO English — every learner-facing word is i18n
   * copy chosen by the renderer.
   */
  get(goalId: string): Observable<GoalKnowledge> {
    return this.bff.get<GoalKnowledge>(
      `${GOALS}/${encodeURIComponent(goalId)}/knowledge`,
    );
  }
}
