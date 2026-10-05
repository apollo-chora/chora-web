/**
 * DailyDoseService — A+ Daily Dose provider with Ebbinghaus ordering +
 * per-Familiar nudge + streak integration (WS-12).
 *
 * M14.iter5.B (big-bang fail-loud directive 2026-05-13): real BFF call only.
 * WS-12 additions (2026-05-26):
 *
 * 1. The dose atoms are already ordered by Ebbinghaus retention urgency
 *    BE-side (low → medium → high → unknown). The service exposes this via
 *    the standard DailyDose.atoms array — no additional reordering needed.
 *
 * 2. Streak is fetched in parallel from the GraphQL `myStreak` resolver
 *    (`QUERY_MY_STREAK`). On GraphQL failure the streak is silently omitted
 *    (streak is decorative — it must NOT block the dose from rendering).
 *
 * 3. Familiar nudge (WS-12-NUDGE): `GET /api/v1/familiars/{id}/recommended-atoms`
 *    is NOT in bff-gateway.yaml as of 2026-05-26. The dose's `familiar_nudge`
 *    field is populated by the BE once this endpoint is wired. The service
 *    passes it through as-is from the dose response. Filed as follow-up BE
 *    ask in docs/m13/handoff-fe-to-be-service-ws12-2026-05-26.md.
 *
 * F4 paydown 2026-05-13 — signal-backed AsyncState, fail-loud, retry CTA.
 * Per chora-web CLAUDE.md §16: never surface raw back-end error bodies.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import {
  catchError,
  forkJoin,
  map,
  of,
  take,
} from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { GraphQLService } from '../../../../core/services/graphql.service';
import { QUERY_MY_STREAK } from '../../../../core/graphql/queries';
import type { GqlStreakData } from '../../../../core/graphql/types';
import type {
  DailyDose,
  DailyDoseAiEnrichment,
  DailyDoseState,
  DailyDoseStreak,
} from './daily-dose.model';

/** Wire shape from the GraphQL myStreak resolver. */
interface MyStreakGqlData {
  myStreak: GqlStreakData;
}

@Injectable({ providedIn: 'root' })
export class DailyDoseService {
  private readonly bff = inject(BffClientService);
  private readonly gql = inject(GraphQLService);

  private readonly _state = signal<DailyDoseState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /** Convenience selector: the DailyDose payload when success, else null. */
  readonly dose = computed<DailyDose | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.data : null;
  });

  /**
   * Real AI Familiar greeting from the async `/daily-dose/ai` enrichment
   * (B2-C / ADR-196). `null` until the call returns a non-degraded greeting —
   * the component then swaps the deterministic `familiarQuote` for it. Held
   * SEPARATELY from `_state` so resolving it never mutates the dose aggregate
   * (which would needlessly re-fire the N-Familiar dispatch effect).
   */
  private readonly _aiGreeting = signal<string | null>(null);
  readonly aiGreeting = this._aiGreeting.asReadonly();

  /** Real Recommender pick-rationale narrative; `null` until returned. */
  private readonly _aiNarrative = signal<string | null>(null);
  readonly aiNarrative = this._aiNarrative.asReadonly();

  /**
   * Recommended atom_ids from the AI enrichment (bare ids — they carry no
   * title/summary/topic). `[]` until the enrichment returns. The component
   * resolves each to a LearningAtom and renders them as cards (M2 / ADR-196).
   */
  private readonly _aiPicks = signal<readonly string[]>([]);
  readonly aiPicks = this._aiPicks.asReadonly();

  /**
   * Fetch today's DailyDose (atoms ordered by Ebbinghaus urgency, BE-side)
   * and the learner's streak in parallel. Publishes a merged result to
   * `state`. Called by ngOnInit + by the retry CTA. Safe to call repeatedly.
   *
   * Streak failure is non-blocking: on GraphQL error the dose still renders
   * without streak data. Dose failure is blocking: 5xx renders the error banner.
   *
   * Phase 2B (focused mode): when `growthEdgeId` is a non-empty string the dose
   * is scoped to that Growth Edge via a `growth_edge_id` query param (the
   * dashboard deep-links into a focused practice session this way). When absent
   * the request is byte-identical to the legacy call — no params appended.
   *
   * `goalId` scopes the dose to one Goal (the map deep-links this way) and is
   * INDEPENDENT of the Growth Edge scope: either, both, or neither may be
   * supplied. With neither, the request stays byte-identical to the legacy call.
   */
  load(growthEdgeId?: string, goalId?: string): void {
    this._state.set({ status: 'loading' });
    // Clear any prior enrichment so a fresh load shows the deterministic
    // greeting until the new AI call resolves.
    this._aiGreeting.set(null);
    this._aiNarrative.set(null);
    this._aiPicks.set([]);

    const trimmedEdgeId = growthEdgeId?.trim();
    const trimmedGoalId = goalId?.trim();
    let built = new HttpParams();
    if (trimmedEdgeId) built = built.set('growth_edge_id', trimmedEdgeId);
    if (trimmedGoalId) built = built.set('goal_id', trimmedGoalId);
    // Stay byte-identical to the legacy call when neither scope is supplied:
    // an empty HttpParams would still append a trailing '?'.
    const params = built.keys().length ? built : undefined;

    const dose$ = this.bff
      .get<DailyDose>('/api/familiar/daily-dose', params)
      .pipe(take(1));

    const streak$ = this.gql
      .query<MyStreakGqlData>(QUERY_MY_STREAK)
      .pipe(
        take(1),
        map((data): DailyDoseStreak => {
          const s = data.myStreak;
          return {
            currentDays: s.currentDays,
            longestStreak: s.longestStreak,
            lastActivityAt: s.lastActivityAt,
            status: s.status,
          };
        }),
        catchError(() => of(null as DailyDoseStreak | null)),
      );

    forkJoin({ dose: dose$, streak: streak$ })
      .pipe(
        map(({ dose, streak }): DailyDoseState => ({
          status: 'success',
          data: streak != null ? { ...dose, streak } : dose,
        })),
        catchError((err: unknown) =>
          of<DailyDoseState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      )
      .subscribe((s) => {
        this._state.set(s);
        // Progressive enhancement: only once the deterministic dose has
        // rendered do we fetch the slow AI greeting. NEVER chained into the
        // forkJoin above — that would block the dose on the ~16-30s LLM call.
        if (s.status === 'success') {
          this.loadAiEnrichment();
        }
      });
  }

  /**
   * B2-C / ADR-196 progressive enhancement: AFTER the deterministic dose
   * renders, fetch the REAL personalised Familiar greeting (+ Recommender
   * narrative) from `GET /api/familiar/daily-dose/ai` and publish them to the
   * `aiGreeting` / `aiNarrative` signals. The gateway runs the gateway-metered
   * LLM round-trips to completion (mana umbrella), so this is deliberately a
   * separate, non-blocking subscription fired once the dose is already in the
   * success state.
   *
   * Fail-soft (graceful degradation): on error / timeout / `degraded` / empty
   * greeting the signals stay null and the component keeps the deterministic
   * greeting. The error is mapped to a no-op (`catchError → of(null)`) so there
   * is no console-error spam and no broken UI.
   */
  private loadAiEnrichment(): void {
    this.bff
      .get<DailyDoseAiEnrichment>('/api/familiar/daily-dose/ai')
      .pipe(
        take(1),
        catchError(() => of(null)),
      )
      .subscribe((resp) => {
        // A degraded response carries only a templated fallback greeting —
        // swapping a stub for a stub is pointless, so keep the deterministic one.
        if (!resp || resp.degraded) return;
        const greeting = resp.greeting?.trim();
        if (greeting) this._aiGreeting.set(greeting);
        const narrative = resp.narrative?.trim();
        if (narrative) this._aiNarrative.set(narrative);
        // M2 (ADR-196): surface the recommended atom_ids as cards. No-op when
        // the engine returned none — the component hides the section.
        if (resp.ai_picks?.length) this._aiPicks.set(resp.ai_picks);
      });
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 503) return 'aplus.daily_dose.error_engine_unavailable';
      if (e.status >= 500) return 'aplus.daily_dose.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.daily_dose.error_unauthorised';
      }
    }
    return 'aplus.daily_dose.error_generic';
  }
}
