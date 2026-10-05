/**
 * ActiveFamiliarService — single source of truth for the currently-
 * dispatched Familiar (per HANDOFF §3.5 mascot strip refactor).
 *
 * Holds the active `FamiliarGrowthState` as a signal so components like
 * the mascot strip, dashboard panel, and Daily-Dose greeting can react
 * to changes (stage-up, mood transitions) without each owning their
 * own roster fetch.
 *
 * Mood is derived from time-since-last-activity + recent stage_up
 * events. Idle / curious / sleepy / celebrating per the handoff.
 *
 * Mood SURVIVES A RELOAD (UX Track U package B5). It used to stamp
 * `lastActivityAt` with `Date.now()` in the constructor and start the
 * stage-up window at the epoch, so every page load fabricated a fresh
 * companion: a learner returning after three days read as `curious` then
 * `idle`, `sleepy` was unreachable, and a stage-up two minutes before the
 * reload lost its celebration. Both windows are now seeded from the server,
 * and an unknown value stays unknown rather than defaulting to "just now".
 *
 * Companion dispatch (CHO-1577, revised CHO-2403): the caller decides WHICH
 * Familiar is of record and hands it over via `setActiveFamiliarId()`. The
 * Daily Dose rail does this with its own precedence (the Goal's attached
 * Companion, else the dose's topic-matched greeter); this service does not
 * know about goals or greetings, it only holds whoever is current.
 */
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { retry, throwError, timer, type MonoTypeOperatorFunction } from 'rxjs';

import { FamiliarGrowthService } from './familiar-growth.service';
import { FamiliarRealtimeService } from './familiar-realtime.service';
import { LastActiveDayService } from './last-active-day.service';
import { httpErrorView } from '../interceptors/api-error.model';
import type {
  BreedMood,
} from '../../shared/components/breed-art/breed-art.component';
import type { FamiliarGrowthState } from './familiar-growth.model';

const SLEEPY_THRESHOLD_MS = 2 * 60 * 60 * 1000;     // 2 hours of inactivity
const CELEBRATING_WINDOW_MS = 5 * 60 * 1000;        // 5 min post-stage-up
const CURIOUS_WINDOW_MS = 30 * 1000;                // 30 sec post-activity
const DAY_MS = 24 * 60 * 60 * 1000;                 // one server day bucket

/**
 * Parses a server ISO-8601 stamp to epoch ms, or null when it is absent or
 * unparseable. Fail-soft on purpose: a malformed stamp leaves the mood in its
 * honest unknown state rather than pinning it to the epoch, which would read
 * as infinitely stale.
 */
function parseStamp(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

const BOOTSTRAP_RETRIES = 3;                        // 4 attempts total
const BOOTSTRAP_BACKOFF_MS = 400;                   // 400ms → 800ms → 1600ms

/**
 * Bounded retry with exponential backoff for the BOOTSTRAP fetches.
 *
 * Why (live-caught 2026-07-14): the bootstrap was ONE-SHOT — a single transient
 * failure set `state` to null and nothing ever retried. `active()` is the single
 * source of truth for the mascot strip, the dashboard panel, the Daily-Dose
 * greeting and A+ Far Sight, so one blip (hitting a chora-consumption pod
 * mid-rollout, which is exactly how this was found) left the entire Companion
 * surface dead for the rest of the session — recoverable only by a page reload.
 *
 * A 4xx is NOT retried: 401/403/404 are definitive answers, and spinning against
 * them only delays the honest null state. Retries are BOUNDED — a persistent
 * outage still fails loud (null), never fabricated or stale Companion data.
 */
function retryTransient<T>(): MonoTypeOperatorFunction<T> {
  return retry<T>({
    count: BOOTSTRAP_RETRIES,
    delay: (err, attempt) => {
      const status = httpErrorView(err)?.status ?? 0;
      if (status >= 400 && status < 500) return throwError(() => err);
      return timer(BOOTSTRAP_BACKOFF_MS * 2 ** (attempt - 1));
    },
  });
}

@Injectable({ providedIn: 'root' })
export class ActiveFamiliarService {
  private readonly growth = inject(FamiliarGrowthService);
  private readonly realtime = inject(FamiliarRealtimeService);
  private readonly lastActiveDayStore = inject(LastActiveDayService);

  /**
   * Last user activity as a MOMENT (atom complete, conversation turn). `null`
   * until one actually happens in this session. It is deliberately NOT stamped
   * at construction: a page load is not activity, and claiming it was is what
   * made `sleepy` unreachable after a refresh.
   */
  private readonly lastActivityAt = signal<number | null>(null);

  /**
   * The server's last-active DAY, held by LastActiveDayService because the
   * fetcher (DashboardService, which already reads the streak block) and the
   * consumer (this mood) are different services. A day bucket, NEVER a moment.
   */
  private readonly lastActiveDay = this.lastActiveDayStore.day;

  /** Active familiar state. null until loaded. */
  private readonly state = signal<FamiliarGrowthState | null>(null);
  readonly active = this.state.asReadonly();

  /** Reactive UI ticker so derived mood signal refreshes periodically. */
  private readonly tick = signal<number>(Date.now());

  /**
   * Last stage-up moment, from the server on load and from the realtime stream
   * afterwards. `null` when unknown, so an unknown stage-up never reads as one
   * that happened at the epoch.
   */
  private readonly lastStageUpAt = signal<number | null>(null);

  constructor() {
    // Bootstrap: load roster, pick active. The roster fetch is fail-loud
    // (no mock fallback since the 2026-05-16 envelope fix) so the error
    // handler keeps the mascot strip in `null` state on BFF failure
    // rather than surfacing an unhandled-rejection in the console.
    //
    // Both hops retry transient failures with backoff (retryTransient) — a
    // single blip used to kill the active Companion for the whole session.
    this.growth.listMyFamiliars().pipe(retryTransient()).subscribe({
      next: (roster) => {
        const active = roster.find((f) => f.isActive) ?? roster[0];
        if (active) {
          this.growth.getGrowth(active.familiarId).pipe(retryTransient()).subscribe({
            next: (state) => this.adopt(state),
            error: () => this.state.set(null),
          });
        }
      },
      error: () => {
        this.state.set(null);
      },
    });

    // Realtime: react to stage_up + exp_awarded for the active Familiar.
    this.realtime.stream$.subscribe((event) => {
      const active = this.state();
      if (!active || event.familiarId !== active.familiarId) return;
      if (event.type === 'stage_up') {
        this.lastStageUpAt.set(Date.now());
        // Stage-up always triggers a full refresh so the new tools /
        // KG neighbors / LLM tier propagate everywhere.
        this.growth.getGrowth(active.familiarId).subscribe((s) => this.adopt(s));
      } else if (event.type === 'exp_awarded') {
        this.lastActivityAt.set(Date.now());
        this.state.update((s) =>
          s
            ? { ...s, expCumulative: event.expCumulativeAfter, expCurrent: event.expCumulativeAfter }
            : s,
        );
      } else if (event.type === 'breed_revealed') {
        this.growth.getGrowth(active.familiarId).subscribe((s) => this.adopt(s));
      }
    });

    // Refresh mood signal every 30s while the page is open.
    if (typeof setInterval === 'function') {
      const interval = setInterval(() => this.tick.set(Date.now()), 30_000);
      effect((onCleanup) => {
        onCleanup(() => clearInterval(interval));
      });
    }
  }

  readonly mood = computed<BreedMood>(() => {
    void this.tick();   // re-evaluate when the ticker advances
    const now = Date.now();

    const stageUp = this.lastStageUpAt();
    if (stageUp !== null && now - stageUp < CELEBRATING_WINDOW_MS) {
      return 'celebrating';
    }

    // A known moment beats everything below it: the learner is measurably here.
    const activity = this.lastActivityAt();
    if (activity !== null) {
      const sinceActivity = now - activity;
      if (sinceActivity < CURIOUS_WINDOW_MS) return 'curious';
      if (sinceActivity > SLEEPY_THRESHOLD_MS) return 'sleepy';
      return 'idle';
    }

    // No moment. The day bucket proves activity happened somewhere inside that
    // UTC day, so the only defensible claim is measured from the LAST possible
    // moment in it. A naive "bucket is before today" rule would fire a false
    // `sleepy` for anyone whose local morning is the previous UTC day.
    const day = this.lastActiveDay();
    if (day !== null && now - (day + DAY_MS) > SLEEPY_THRESHOLD_MS) {
      return 'sleepy';
    }
    return 'idle';
  });

  /** Record a user activity (atom completed, conversation turn, etc.). */
  recordActivity(): void {
    this.lastActivityAt.set(Date.now());
  }

  /** Force-refresh from BFF (e.g., after a hatching ceremony commit). */
  refresh(familiarId: string): void {
    this.growth.getGrowth(familiarId).subscribe((s) => this.adopt(s));
  }

  /** Override the active Familiar (e.g., user switches from roster). */
  setActiveFamiliarId(familiarId: string): void {
    this.growth.getGrowth(familiarId).subscribe((s) => this.adopt(s));
  }

  /**
   * Publishes a freshly-read growth state and takes the server's stage-up
   * moment with it. Monotonic forward only: a response that carries no
   * `lastStageUpAt` must never CLEAR a celebration the realtime stream just
   * started, since the stage-up refetch can outrun its own persistence.
   */
  private adopt(state: FamiliarGrowthState): void {
    this.state.set(state);
    const t = parseStamp(state.lastStageUpAt);
    if (t === null) return;
    const cur = this.lastStageUpAt();
    if (cur === null || t > cur) this.lastStageUpAt.set(t);
  }

  /**
   * Seeds the server's last-active DAY (the streak's UTC-midnight bucket, which
   * reaches the browser as `streak.last_completion_at` on
   * `GET /api/me/dashboard`). Absent or unparseable input is ignored, and the
   * bucket only ever moves forward, so a stale second response cannot un-know a
   * newer one.
   */
  seedLastActiveDay(iso: string | null | undefined): void {
    this.lastActiveDayStore.seed(iso);
  }

}
