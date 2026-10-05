/**
 * ClassroomService spec — real-BFF wiring (M8 cutover).
 *
 * Tests the 5 LiveQuizSession endpoints + the polling stream's
 * stop-on-CLOSED contract.
 *
 * Pattern mirrors scheduling.service.spec.ts:
 *   - provideHttpClient() + provideHttpClientTesting()
 *   - HttpTestingController.expectOne + flush
 *   - httpMock.verify() in afterEach
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { ClassroomService } from './classroom.service';
import type { ClassroomSessionWire } from './classroom.model';
import { environment } from '../../../../../environments/environment';

const wireBase = (
  overrides: Partial<ClassroomSessionWire> = {},
): ClassroomSessionWire => ({
  id: 'sess-1',
  tenant_id: 'tA',
  live_quiz_id: 'quiz-1',
  instructor_gcid: 'i-1',
  state: 'LIVE',
  current_question_id: 'q-1',
  response_counts: { A: 1, B: 2 },
  joined_learners: 3,
  created_at: '2026-05-26T03:00:00Z',
  updated_at: '2026-05-26T03:00:02Z',
  ...overrides,
});

describe('ClassroomService', () => {
  let service: ClassroomService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClassroomService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('startSession', () => {
    it('POSTs /api/v1/live-quizzes/{quizId}/sessions and returns ARMED snapshot', async () => {
      const promise = firstValueFrom(service.startSession('quiz-1'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/live-quizzes/quiz-1/sessions`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(wireBase({ state: 'ARMED' }));
      const snap = await promise;
      expect(snap.state).toBe('ARMED');
      expect(snap.id).toBe('sess-1');
    });

    it('URL-encodes the quiz id', async () => {
      const promise = firstValueFrom(service.startSession('quiz/with/slash'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/live-quizzes/quiz%2Fwith%2Fslash/sessions`,
      );
      req.flush(wireBase({ state: 'ARMED' }));
      await promise;
    });
  });

  describe('transitionStart', () => {
    it('POSTs /api/v1/classroom-sessions/{id}/start and returns LIVE snapshot', async () => {
      const promise = firstValueFrom(service.transitionStart('sess-1'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1/start`,
      );
      expect(req.request.method).toBe('POST');
      req.flush(wireBase({ state: 'LIVE' }));
      const snap = await promise;
      expect(snap.state).toBe('LIVE');
    });
  });

  describe('transitionClose', () => {
    it('POSTs /api/v1/classroom-sessions/{id}/close and returns CLOSED snapshot', async () => {
      const promise = firstValueFrom(service.transitionClose('sess-1'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1/close`,
      );
      expect(req.request.method).toBe('POST');
      req.flush(wireBase({ state: 'CLOSED', ended_at: '2026-05-26T03:30:00Z' }));
      const snap = await promise;
      expect(snap.state).toBe('CLOSED');
      expect(snap.endedAt).toBe('2026-05-26T03:30:00Z');
    });
  });

  describe('getSnapshot', () => {
    it('GETs /api/v1/classroom-sessions/{id} and maps wire→snapshot', async () => {
      const promise = firstValueFrom(service.getSnapshot('sess-1'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(wireBase());
      const snap = await promise;
      expect(snap.responseCounts).toEqual({ A: 1, B: 2 });
      expect(snap.joinedLearners).toBe(3);
      expect(snap.currentQuestionId).toBe('q-1');
    });
  });

  describe('submitResponse', () => {
    it('POSTs /api/v1/classroom-sessions/{id}/responses with question_id + choice', async () => {
      const promise = firstValueFrom(
        service.submitResponse('sess-1', 'q-1', 'B'),
      );
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1/responses`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ question_id: 'q-1', choice: 'B' });
      req.flush(wireBase());
      await promise;
    });
  });

  describe('snapshotStream', () => {
    it('emits the first snapshot immediately (no initial delay)', async () => {
      const stop$ = new Subject<void>();
      const stream = service.snapshotStream('sess-1', stop$);
      const first = firstValueFrom(stream);
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`,
      );
      req.flush(wireBase({ state: 'LIVE' }));
      const snap = await first;
      expect(snap.state).toBe('LIVE');
      // Stop polling so afterEach verify() doesn't complain about pending
      // interval requests.
      stop$.next();
      stop$.complete();
    });

    it('stops after CLOSED (final emit included)', async () => {
      const stop$ = new Subject<void>();
      const emissions: string[] = [];
      const sub = service
        .snapshotStream('sess-1', stop$)
        .subscribe((s) => emissions.push(s.state));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`,
      );
      req.flush(wireBase({ state: 'CLOSED', ended_at: '2026-05-26T03:30:00Z' }));
      // takeWhile(inclusive=true) — one CLOSED frame then complete.
      expect(emissions).toEqual(['CLOSED']);
      sub.unsubscribe();
      // No further requests expected after CLOSED.
      stop$.next();
      stop$.complete();
    });

    // HANDOFF_L52 §4.4 — one 5xx used to complete the stream (frozen
    // presenter/learner view until manual reload). Transient outages (the
    // auto-deployer rolls delivery on every main push) must self-heal.
    it('retries with capped backoff after a 5xx and keeps polling', () => {
      vi.useFakeTimers();
      try {
        const stop$ = new Subject<void>();
        const emissions: string[] = [];
        let errored = false;
        const sub = service.snapshotStream('sess-1', stop$).subscribe({
          next: (s) => emissions.push(s.state),
          error: () => (errored = true),
        });
        const url = `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`;
        // Tick 1 dies with a 503 — the stream must NOT error out.
        httpMock
          .expectOne(url)
          .flush('rolling', { status: 503, statusText: 'Service Unavailable' });
        expect(errored).toBe(false);
        expect(emissions).toEqual([]);
        // First backoff window (one poll interval) → fresh immediate fetch.
        vi.advanceTimersByTime(2000);
        httpMock.expectOne(url).flush(wireBase({ state: 'LIVE' }));
        expect(emissions).toEqual(['LIVE']);
        expect(errored).toBe(false);
        sub.unsubscribe();
        stop$.next();
        stop$.complete();
      } finally {
        vi.useRealTimers();
      }
    });

    it('surfaces the error once the retry budget is exhausted', () => {
      vi.useFakeTimers();
      try {
        const stop$ = new Subject<void>();
        let errored = false;
        const sub = service.snapshotStream('sess-1', stop$).subscribe({
          next: () => undefined,
          error: () => (errored = true),
        });
        const url = `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`;
        const flush503 = () =>
          httpMock
            .expectOne(url)
            .flush('down', { status: 503, statusText: 'Service Unavailable' });
        flush503(); // initial attempt
        // 8-retry budget: 2s, 4s, 8s, 16s, then capped at 30s.
        for (const delayMs of [
          2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000,
        ]) {
          expect(errored).toBe(false);
          vi.advanceTimersByTime(delayMs);
          flush503();
        }
        // Budget spent → the error reaches the consumer (pollError UI).
        expect(errored).toBe(true);
        sub.unsubscribe();
        stop$.next();
        stop$.complete();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does NOT retry a 4xx — fails loud immediately (404 is truth)', () => {
      vi.useFakeTimers();
      try {
        const stop$ = new Subject<void>();
        let errorStatus = 0;
        const sub = service.snapshotStream('sess-1', stop$).subscribe({
          next: () => undefined,
          error: (e: { status?: number }) => (errorStatus = e.status ?? -1),
        });
        httpMock
          .expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`)
          .flush('gone', { status: 404, statusText: 'Not Found' });
        expect(errorStatus).toBe(404);
        // No retry scheduled — nothing in flight after a backoff window.
        vi.advanceTimersByTime(30000);
        httpMock.expectNone(
          `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`,
        );
        sub.unsubscribe();
        stop$.next();
        stop$.complete();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('advance', () => {
    it('POSTs /api/v1/classroom-sessions/{id}/advance with question_id', async () => {
      const promise = firstValueFrom(service.advance('sess-1', 'q-7'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1/advance`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ question_id: 'q-7' });
      req.flush(wireBase({ current_question_id: 'q-7' }));
      const snap = await promise;
      expect(snap.currentQuestionId).toBe('q-7');
    });
  });

  // ── L5.2 Live Classroom-stage endpoints (CHO-1704 WS3) ─────────────────────────────

  describe('resolveByCode', () => {
    it('GETs /api/v1/classroom-sessions/by-code/{code} and maps the body', async () => {
      const promise = firstValueFrom(service.resolveByCode('K7M3QX'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/by-code/K7M3QX`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        session_id: 'sess-1',
        live_quiz_id: 'quiz-1',
        quiz_title: 'CSPO',
        state: 'ARMED',
        participant_count: 3,
      });
      const out = await promise;
      expect(out.sessionId).toBe('sess-1');
      expect(out.state).toBe('ARMED');
      expect(out.participantCount).toBe(3);
    });

    it('normalises the code (uppercase, spaces/dashes stripped) before the GET', async () => {
      const promise = firstValueFrom(service.resolveByCode(' k7-m3 qx '));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/by-code/K7M3QX`,
      );
      req.flush({ session_id: 's', live_quiz_id: 'q', state: 'LIVE' });
      await promise;
    });
  });

  describe('join', () => {
    it('POSTs the nickname and returns the roster snapshot', async () => {
      const promise = firstValueFrom(service.join('sess-1', 'AtomAce'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1/join`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ nickname: 'AtomAce' });
      req.flush(
        wireBase({
          state: 'ARMED',
          join_code: 'K7M3QX',
          participant_count: 1,
          participants: [
            { nickname: 'AtomAce', joined_at: '2026-06-10T03:00:00Z' },
          ],
        }),
      );
      const snap = await promise;
      expect(snap.joinCode).toBe('K7M3QX');
      expect(snap.participants[0]?.nickname).toBe('AtomAce');
    });
  });

  describe('submitResponseDetailed', () => {
    it('returns the snapshot + the held your_result from the 201 body', async () => {
      const promise = firstValueFrom(
        service.submitResponseDetailed('sess-1', 'q-1', '4'),
      );
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1/responses`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ question_id: 'q-1', choice: '4' });
      req.flush(
        {
          ...wireBase(),
          your_result: {
            question_id: 'q-1',
            correct: true,
            awarded_points: 87,
            streak_after: 2,
          },
        },
        { status: 201, statusText: 'Created' },
      );
      const out = await promise;
      expect(out.snapshot.id).toBe('sess-1');
      expect(out.yourResult?.correct).toBe(true);
      expect(out.yourResult?.awardedPoints).toBe(87);
    });
  });

  describe('liveQuizQuestions', () => {
    it('GETs /api/v1/live-quizzes/{id} and maps questions + option labels', async () => {
      const promise = firstValueFrom(service.liveQuizQuestions('quiz-1'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/live-quizzes/quiz-1`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        questions: [
          {
            question_id: 'q-1',
            prompt: '2 + 2 = ?',
            options: [{ label: '4' }, { label: '5' }],
          },
        ],
      });
      const qs = await promise;
      expect(qs).toEqual([
        {
          questionId: 'q-1',
          prompt: '2 + 2 = ?',
          options: [{ label: '4' }, { label: '5' }],
        },
      ]);
    });

    it('defaults a quiz with no questions/options to empty arrays', async () => {
      const promise = firstValueFrom(service.liveQuizQuestions('quiz-1'));
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/live-quizzes/quiz-1`)
        .flush({});
      expect(await promise).toEqual([]);
    });
  });
});
