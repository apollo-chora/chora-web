/**
 * `AiAssistJobRegistryService` - route-independent tracking for in-flight
 * A+ AI-assist question-generation jobs.
 *
 * Why this exists (live complaint 2026-08-14): the compose state lived only in
 * `UnifiedAtomAuthoringComponent.composeState`, and its poll loop was bound to
 * `takeUntilDestroyed(this.destroyRef)`. Leaving the authoring route destroyed
 * the component, killed the poll, and dropped the job id on the floor. The
 * backend kept generating; the author simply had no way back to it. Starting a
 * second batch made the first unreachable for good.
 *
 * The registry is `providedIn: 'root'`, so its lifetime is the app, not a
 * route. It owns the polling, keeps the newest job payload per tracked job, and
 * persists the descriptors to `sessionStorage` so even a hard reload reattaches.
 *
 * Two properties the old loop lacked:
 *
 *   - **Bounded.** `pollLoop` had NO attempt ceiling (the sibling image-regen
 *     loop capped at 30; this one did not). When the orchestrator lost job
 *     fd80f4e9's terminal event, the FE polled a job that would never finish,
 *     forever, with no error and no escape. Polling now stops at
 *     {@link AI_ASSIST_POLL_MAX_ATTEMPTS} and reports an actionable error.
 *   - **Terminal-state retaining.** A job that finishes while the author is on
 *     another screen keeps its result here, so returning shows "generated" or
 *     an explicit error rather than an empty form.
 *
 * Transport errors are non-fatal: a 504 through the gateway is common on a long
 * generation, so a failed poll retries under the same ceiling instead of
 * tearing the batch down.
 */

import {
  DestroyRef,
  Injectable,
  Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Observable, Subject, Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AtomAuthoringService } from './atom-authoring.service';
import type { QuestionGenerationJob } from './atom-authoring.model';

/**
 * Poll ceiling. The backoff below caps at 16s, so ~150 attempts is a little
 * over 35 minutes of watching - generous for a 10-question batch with image
 * generation (gemini-3-pro-image measured ~22s per image), and still finite so
 * a job the backend never terminates cannot spin for the rest of the session.
 */
export const AI_ASSIST_POLL_MAX_ATTEMPTS = 150;

/** Backoff schedule (ms), last value repeats. Mirrors the previous component. */
const POLL_BACKOFF_MS = [2000, 4000, 8000, 16000] as const;

/**
 * Consecutive transport failures tolerated before the job is declared failed.
 *
 * A single 504 through the gateway is routine on a long generation, and the
 * previous loop treated it as fatal - one blip threw away a batch the backend
 * was still working on. But an endless retry is the other failure mode the
 * author already lived through, so the tolerance is bounded and then LOUD.
 * Any successful poll resets the count.
 */
export const AI_ASSIST_POLL_ERROR_BUDGET = 5;

/** i18n key surfaced when polling keeps failing at the transport layer. */
export const POLL_TRANSPORT_ERROR_KEY =
  'aplus.unified_authoring.error_poll_transport';

/** sessionStorage key holding the tracked descriptors (not the job payloads). */
const STORAGE_KEY = 'chora.aplus.ai_assist.tracked_jobs.v1';

/** i18n key surfaced when a job outlives the poll ceiling. */
export const POLL_CEILING_ERROR_KEY =
  'aplus.unified_authoring.error_generation_stalled';

/** Backend statuses that end the job. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'succeeded',
  'ready_for_review',
  'accepted',
  'partially_accepted',
  'failed',
  'cancelled',
  'rejected',
]);

const FAILED_STATUSES: ReadonlySet<string> = new Set([
  'failed',
  'cancelled',
  'rejected',
]);

/** What the author sees when they come back to a tracked job. */
export type TrackedJobPhase = 'running' | 'done' | 'error';

export interface TrackedJob {
  readonly jobId: string;
  readonly atomId: string;
  /** True for a hand-authoring session (no AI candidates expected). */
  readonly manual: boolean;
  /** Epoch ms the author started it - orders "newest for this atom". */
  readonly startedAt: number;
  /** Newest poll payload. Never null after the first successful poll. */
  readonly job: QuestionGenerationJob | null;
  readonly phase: TrackedJobPhase;
  /** i18n key, set only when phase === 'error'. */
  readonly error?: string;
}

/** The slice persisted to sessionStorage - descriptors only, never payloads. */
interface PersistedDescriptor {
  readonly jobId: string;
  readonly atomId: string;
  readonly manual: boolean;
  readonly startedAt: number;
}

@Injectable({ providedIn: 'root' })
export class AiAssistJobRegistryService {
  private readonly api = inject(AtomAuthoringService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly entries = signal<readonly TrackedJob[]>([]);
  private readonly pollers = new Map<string, Subscription>();
  private readonly updates = new Subject<TrackedJob>();

  /**
   * SYNCHRONOUS per-update stream. Signals alone are not enough for the
   * authoring canvas: a signal `effect` is scheduled, not immediate, so the
   * screen would lag a change-detection pass behind every poll. Consumers that
   * must react in the same tick (the compose state machine) subscribe here;
   * consumers that only render (a jobs list) can read the signals.
   */
  readonly changes: Observable<TrackedJob> = this.updates.asObservable();

  /** Every job this session is still tracking, oldest first. */
  readonly jobs: Signal<readonly TrackedJob[]> = computed(() => this.entries());

  /** Jobs still generating - drives a "generations in progress" affordance. */
  readonly running: Signal<readonly TrackedJob[]> = computed(() =>
    this.entries().filter((e) => e.phase === 'running'),
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopAll();
      this.updates.complete();
    });
    this.restore();
  }

  /**
   * Start (or reattach to) tracking for `jobId`. Idempotent: calling it twice
   * for the same job keeps ONE poller, so a component re-entering the route
   * cannot double the poll rate.
   */
  track(
    atomId: string,
    jobId: string,
    manual: boolean,
    seed: QuestionGenerationJob | null = null,
  ): void {
    if (!atomId || !jobId) return;

    const existing = this.entries().find((e) => e.jobId === jobId);
    if (!existing) {
      const phase = seed ? this.phaseOf(seed) : 'running';
      this.entries.update((list) => [
        ...list,
        {
          jobId,
          atomId,
          manual,
          startedAt: Date.now(),
          job: seed,
          phase,
          ...(phase === 'error' ? { error: this.errorKeyFor(seed) } : {}),
        },
      ]);
      this.persist();
    }

    // Already terminal (or already polling) - nothing more to start.
    const current = this.entries().find((e) => e.jobId === jobId);
    if (current && current.phase !== 'running') return;
    if (this.pollers.has(jobId)) return;
    this.poll(atomId, jobId, 0, 0);
  }

  /** Reactive view of one tracked job; null once released / never tracked. */
  entry(jobId: string): Signal<TrackedJob | null> {
    return computed(() => this.entries().find((e) => e.jobId === jobId) ?? null);
  }

  /**
   * Newest tracked job for `atomId`, or null. Lets a component that lands on an
   * atom route with no `?job=` query param still reattach to what it started.
   */
  latestForAtom(atomId: string): TrackedJob | null {
    const forAtom = this.entries().filter((e) => e.atomId === atomId);
    if (forAtom.length === 0) return null;
    return forAtom.reduce((a, b) => (b.startedAt >= a.startedAt ? b : a));
  }

  /** Forget a job the author has consumed or abandoned. Stops its poller. */
  release(jobId: string): void {
    this.pollers.get(jobId)?.unsubscribe();
    this.pollers.delete(jobId);
    this.entries.update((list) => list.filter((e) => e.jobId !== jobId));
    this.persist();
  }

  /** Stop every poller without forgetting the results (used on teardown). */
  stopAll(): void {
    for (const sub of this.pollers.values()) sub.unsubscribe();
    this.pollers.clear();
  }

  // -- internals ----------------------------------------------------------

  private poll(
    atomId: string,
    jobId: string,
    attempt: number,
    consecutiveErrors: number,
  ): void {
    if (attempt >= AI_ASSIST_POLL_MAX_ATTEMPTS) {
      // Bounded, and LOUD. A job past the ceiling is not "still working" - on
      // 2026-08-14 that state meant the terminal event had been destroyed
      // server side and would never arrive.
      this.settle(jobId, null, 'error', POLL_CEILING_ERROR_KEY);
      return;
    }

    // Honour the server's suggested cadence when it sends one - the backend
    // knows better than a fixed client schedule how long the next step takes.
    const hint = this.entries().find((e) => e.jobId === jobId)?.job
      ?.poll_after_ms;
    const delay = hint && hint > 0 ? hint : this.backoffMs(attempt);
    const sub = timer(delay)
      .pipe(switchMap(() => this.api.pollGenerationJob(atomId, jobId)))
      .subscribe({
        next: (job) => {
          this.pollers.delete(jobId);
          const phase = this.phaseOf(job);
          if (phase === 'running') {
            this.patch(jobId, { job, phase });
            // A good poll clears the transport-error budget.
            this.poll(atomId, jobId, attempt + 1, 0);
            return;
          }
          this.settle(
            jobId,
            job,
            phase,
            phase === 'error' ? this.errorKeyFor(job) : undefined,
          );
        },
        // A transport blip (commonly a 504 on a long generation) is NOT a dead
        // batch. Keep polling under the same ceiling rather than tearing down
        // work the backend is still doing.
        error: () => {
          this.pollers.delete(jobId);
          if (consecutiveErrors + 1 >= AI_ASSIST_POLL_ERROR_BUDGET) {
            this.settle(jobId, null, 'error', POLL_TRANSPORT_ERROR_KEY);
            return;
          }
          this.poll(atomId, jobId, attempt + 1, consecutiveErrors + 1);
        },
      });
    this.pollers.set(jobId, sub);
  }

  private backoffMs(attempt: number): number {
    return (
      POLL_BACKOFF_MS[Math.min(attempt, POLL_BACKOFF_MS.length - 1)] ??
      POLL_BACKOFF_MS[POLL_BACKOFF_MS.length - 1]
    );
  }

  private settle(
    jobId: string,
    job: QuestionGenerationJob | null,
    phase: TrackedJobPhase,
    error?: string,
  ): void {
    this.pollers.get(jobId)?.unsubscribe();
    this.pollers.delete(jobId);
    this.patch(jobId, {
      ...(job ? { job } : {}),
      phase,
      ...(error ? { error } : {}),
    });
  }

  private patch(jobId: string, delta: Partial<TrackedJob>): void {
    let updated: TrackedJob | null = null;
    this.entries.update((list) =>
      list.map((e) => {
        if (e.jobId !== jobId) return e;
        updated = { ...e, ...delta };
        return updated;
      }),
    );
    if (updated) this.updates.next(updated);
  }

  private phaseOf(job: QuestionGenerationJob): TrackedJobPhase {
    if (!TERMINAL_STATUSES.has(job.status)) return 'running';
    return FAILED_STATUSES.has(job.status) ? 'error' : 'done';
  }

  private errorKeyFor(job: QuestionGenerationJob | null): string {
    return job?.status === 'cancelled'
      ? 'aplus.unified_authoring.error_cancelled'
      : 'aplus.unified_authoring.error_failed';
  }

  // -- persistence --------------------------------------------------------

  /**
   * Descriptors only. Job payloads can be large (candidates + traces + signed
   * image URLs) and are re-fetched on the next poll anyway, so storing them
   * would risk the sessionStorage quota for no gain.
   */
  private persist(): void {
    try {
      const rows: PersistedDescriptor[] = this.entries().map((e) => ({
        jobId: e.jobId,
        atomId: e.atomId,
        manual: e.manual,
        startedAt: e.startedAt,
      }));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      // Storage disabled or full: tracking still works for this page's
      // lifetime, only the reload-resume is lost. Never break generation.
    }
  }

  /** Read + validate the persisted descriptors; [] on anything unusable. */
  private readPersisted(): PersistedDescriptor[] {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (r): r is PersistedDescriptor =>
          !!r &&
          typeof (r as PersistedDescriptor).jobId === 'string' &&
          typeof (r as PersistedDescriptor).atomId === 'string',
      );
    } catch {
      return [];
    }
  }

  private restore(): void {
    const rows = this.readPersisted();
    for (const r of rows) {
      this.entries.update((list) => [
        ...list,
        {
          jobId: r.jobId,
          atomId: r.atomId,
          manual: !!r.manual,
          startedAt: Number(r.startedAt) || Date.now(),
          job: null,
          phase: 'running',
        },
      ]);
      // Resume from attempt 0: the first poll re-reads the real status, so a
      // job that finished while the tab was closed settles immediately.
      this.poll(r.atomId, r.jobId, 0, 0);
    }
  }
}
