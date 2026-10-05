/**
 * RED to GREEN: an in-flight AI-assist job must survive leaving the route.
 *
 * Live complaint 2026-08-14: an author starts a question batch with image
 * generation, navigates away to do something else, and can never get back to
 * it. The compose state lived only in the component signal and the poll loop
 * was bound to takeUntilDestroyed(destroyRef), so a route change killed both
 * and the job became unreachable even though the backend kept working.
 *
 * The litmus test the owner set, pinned end to end below:
 *
 *   start batch A (3 questions with images)
 *     -> leave the route
 *     -> start batch B (3 questions)
 *     -> come back to A
 *        - still running  => trace cards still show live progress
 *        - already done   => a success (or error) state, and review continues
 *
 * The registry owns the polling so it is independent of any component
 * lifetime, and it is bounded so a job the backend never terminates cannot
 * spin forever (the previous pollLoop had no ceiling at all, which is what the
 * author experienced as "loops forever" on job fd80f4e9 after its completed
 * event was destroyed server side).
 */

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';

import { AtomAuthoringService } from './atom-authoring.service';
import {
  AI_ASSIST_POLL_MAX_ATTEMPTS,
  AiAssistJobRegistryService,
} from './ai-assist-job-registry.service';
import type { TrackedJob } from './ai-assist-job-registry.service';
import type { QuestionGenerationJob } from './atom-authoring.model';

const ATOM_A = 'atom-a';
const ATOM_B = 'atom-b';
const JOB_A = 'job-a';
const JOB_B = 'job-b';

function job(
  jobId: string,
  atomId: string,
  status: QuestionGenerationJob['status'],
  over: Partial<QuestionGenerationJob> = {},
): QuestionGenerationJob {
  return {
    job_id: jobId,
    atom_id: atomId,
    job_type: 'batch_source_material',
    status,
    created_at: '2026-08-14T02:00:00Z',
    updated_at: '2026-08-14T02:00:00Z',
    ...over,
  } as QuestionGenerationJob;
}

/** Scripted poll transport: one queued response per poll, per job id. */
class FakeAuthoringService {
  readonly scripts = new Map<string, (QuestionGenerationJob | Error)[]>();
  readonly polls: string[] = [];

  script(jobId: string, ...responses: (QuestionGenerationJob | Error)[]): void {
    this.scripts.set(jobId, [...responses]);
  }

  pollGenerationJob(
    _atomId: string,
    jobId: string,
  ): Observable<QuestionGenerationJob> {
    this.polls.push(jobId);
    const queue = this.scripts.get(jobId) ?? [];
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (next instanceof Error) return throwError(() => next);
    return of(next);
  }
}

describe('AiAssistJobRegistryService', () => {
  let api: FakeAuthoringService;
  let registry: AiAssistJobRegistryService;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    api = new FakeAuthoringService();
    TestBed.configureTestingModule({
      providers: [
        AiAssistJobRegistryService,
        { provide: AtomAuthoringService, useValue: api },
      ],
    });
    registry = TestBed.inject(AiAssistJobRegistryService);
  });

  afterEach(() => {
    registry.stopAll();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------
  // The owner's litmus test
  // ---------------------------------------------------------------------

  it('keeps polling batch A after the author leaves and starts batch B', async () => {
    api.script(JOB_A, job(JOB_A, ATOM_A, 'running'));
    api.script(JOB_B, job(JOB_B, ATOM_B, 'running'));

    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(2000);
    const pollsAfterA = api.polls.filter((j) => j === JOB_A).length;
    expect(pollsAfterA).toBeGreaterThan(0);

    // Author leaves A's route and starts B. Nothing tells the registry.
    registry.track(ATOM_B, JOB_B, false, job(JOB_B, ATOM_B, 'running'));
    await vi.advanceTimersByTimeAsync(8000);

    expect(api.polls.filter((j) => j === JOB_A).length).toBeGreaterThan(
      pollsAfterA,
    );
    expect(api.polls.filter((j) => j === JOB_B).length).toBeGreaterThan(0);
    expect(registry.entry(JOB_A)()?.phase).toBe('running');
    expect(registry.entry(JOB_B)()?.phase).toBe('running');
  });

  it('still exposes live trace progress on the job the author returns to', async () => {
    const withTrace = job(JOB_A, ATOM_A, 'running', {
      pipeline_trace: [
        { name: 'generate', status: 'COMPLETED' },
        { name: 'critique', status: 'ACCEPTED' },
      ],
    } as unknown as Partial<QuestionGenerationJob>);
    api.script(JOB_A, withTrace);

    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(4000);

    const entry = registry.entry(JOB_A)();
    expect(entry?.phase).toBe('running');
    expect(entry?.job?.pipeline_trace?.length).toBe(2);
  });

  it('holds the finished result for an author who returns after completion', async () => {
    api.script(
      JOB_A,
      job(JOB_A, ATOM_A, 'running'),
      job(JOB_A, ATOM_A, 'succeeded', {
        candidate_questions: [
          { draft_id: 'd1', type: 'mcq', prompt: 'q' },
        ],
      } as unknown as Partial<QuestionGenerationJob>),
    );

    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(20000);

    const entry = registry.entry(JOB_A)();
    expect(entry?.phase).toBe('done');
    expect(entry?.job?.status).toBe('succeeded');
    expect(entry?.job?.candidate_questions?.length).toBe(1);
  });

  it('holds a failure so the returning author sees an error, not a spinner', async () => {
    api.script(JOB_A, job(JOB_A, ATOM_A, 'failed', { error: 'boom' }));

    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(4000);

    expect(registry.entry(JOB_A)()?.phase).toBe('error');
  });

  // ---------------------------------------------------------------------
  // Bounded polling: "loops forever" must be impossible
  // ---------------------------------------------------------------------

  it('stops polling at the ceiling instead of spinning forever', async () => {
    // fd80f4e9 exactly: the backend never publishes a terminal event, so the
    // job stays running for good.
    api.script(JOB_A, job(JOB_A, ATOM_A, 'running'));

    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    for (let i = 0; i < AI_ASSIST_POLL_MAX_ATTEMPTS + 10; i++) {
      await vi.advanceTimersByTimeAsync(30000);
    }

    const entry = registry.entry(JOB_A)();
    expect(entry?.phase).toBe('error');
    expect(entry?.error).toBeTruthy();
    expect(api.polls.filter((j) => j === JOB_A).length).toBeLessThanOrEqual(
      AI_ASSIST_POLL_MAX_ATTEMPTS,
    );
  });

  it('rides out a transient poll error instead of giving up on the batch', async () => {
    api.script(
      JOB_A,
      new Error('gateway 504'),
      job(JOB_A, ATOM_A, 'succeeded'),
    );

    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(30000);

    expect(registry.entry(JOB_A)()?.phase).toBe('done');
  });

  // ---------------------------------------------------------------------
  // Persistence: a hard reload or a fresh component must find the job
  // ---------------------------------------------------------------------

  it('restores and resumes a tracked job after a reload', async () => {
    api.script(JOB_A, job(JOB_A, ATOM_A, 'running'));
    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(2000);
    registry.stopAll();

    // Simulate a reload: a brand new service instance over the same storage.
    const fresh = TestBed.runInInjectionContext(
      () => new AiAssistJobRegistryService(),
    );
    expect(fresh.entry(JOB_A)()).not.toBeNull();
    expect(fresh.entry(JOB_A)()?.atomId).toBe(ATOM_A);

    await vi.advanceTimersByTimeAsync(4000);
    expect(api.polls.filter((j) => j === JOB_A).length).toBeGreaterThan(1);
    fresh.stopAll();
  });

  it('exposes the newest running job for this atom so a return can reattach', async () => {
    api.script(JOB_A, job(JOB_A, ATOM_A, 'running'));
    api.script(JOB_B, job(JOB_B, ATOM_B, 'running'));
    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    registry.track(ATOM_B, JOB_B, false, job(JOB_B, ATOM_B, 'running'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(registry.latestForAtom(ATOM_A)?.jobId).toBe(JOB_A);
    expect(registry.latestForAtom(ATOM_B)?.jobId).toBe(JOB_B);
    expect(registry.latestForAtom('atom-none')).toBeNull();
  });

  it('drops a released job from tracking and storage', async () => {
    api.script(JOB_A, job(JOB_A, ATOM_A, 'running'));
    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(2000);

    registry.release(JOB_A);
    const before = api.polls.length;
    await vi.advanceTimersByTimeAsync(30000);

    expect(registry.entry(JOB_A)()).toBeNull();
    expect(api.polls.length).toBe(before);
  });

  it('is idempotent: tracking the same job twice does not double-poll', async () => {
    api.script(JOB_A, job(JOB_A, ATOM_A, 'running'));
    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(10000);

    // One poller, so the count tracks the backoff schedule, not 2x it.
    const solo = api.polls.filter((j) => j === JOB_A).length;
    expect(
      registry.jobs().filter((e: TrackedJob) => e.jobId === JOB_A).length,
    ).toBe(1);
    expect(solo).toBeLessThanOrEqual(4);
  });

  it('never lets a terminal job keep polling', async () => {
    api.script(JOB_A, job(JOB_A, ATOM_A, 'succeeded'));
    registry.track(ATOM_A, JOB_A, false, job(JOB_A, ATOM_A, 'running'));
    await vi.advanceTimersByTimeAsync(4000);
    const settled = api.polls.length;
    await vi.advanceTimersByTimeAsync(60000);

    expect(api.polls.length).toBe(settled);
  });
});
