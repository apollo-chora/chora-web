/**
 * LearnerAnswerComponent spec (L5) — the learner side of the live classroom.
 *
 * Covers: no-session empty state, the LIVE open-question render (prompt +
 * option buttons), submitting a choice (choice == option LABEL per the BE
 * contract), first-write-wins 409 → answered, the waiting/closed branches,
 * and the fail-loud error path.
 *
 * Harness mirrors classroom.component.spec.ts (HttpTestingController + the
 * visibility-aware polling service + ActivatedRoute query param).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { LearnerAnswerComponent } from './learner-answer.component';
import type { ClassroomSessionWire } from './classroom.model';
import { environment } from '../../../../../environments/environment';

const wire = (
  overrides: Partial<ClassroomSessionWire> = {},
): ClassroomSessionWire => ({
  id: 'sess-1',
  tenant_id: 'tA',
  live_quiz_id: 'quiz-1',
  instructor_gcid: 'i-1',
  state: 'LIVE',
  current_question_id: 'q-1',
  response_counts: { Four: 1 },
  joined_learners: 3,
  started_at: '2026-05-26T03:00:00Z',
  created_at: '2026-05-26T03:00:00Z',
  updated_at: '2026-05-26T03:00:02Z',
  ...overrides,
});

/** Parent-quiz questions payload (GET /api/v1/live-quizzes/{id}). */
const quizQuestions = {
  questions: [
    {
      question_id: 'q-1',
      prompt: 'What is 2 + 2?',
      options: [{ label: 'Four' }, { label: 'Five' }],
    },
  ],
};

function setup(queryParams: Record<string, string> = {}): {
  fixture: ComponentFixture<LearnerAnswerComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [LearnerAnswerComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      // L5.2 — the component now injects Router for the /play redirect.
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(LearnerAnswerComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

const SESS = `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`;
const QUIZ = `${environment.bffBaseUrl}/api/v1/live-quizzes/quiz-1`;

describe('LearnerAnswerComponent', () => {
  let fixture: ComponentFixture<LearnerAnswerComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  afterEach(() => {
    // Drain the reactive parent-quiz fetch (fired by the snapshot effect once a
    // liveQuizId is present) before verify().
    httpMock
      .match((r) => r.url.includes('/api/v1/live-quizzes/'))
      .forEach((r) => r.flush(quizQuestions));
    httpMock.verify();
  });

  describe('no session_id query param', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({});
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('shows the no-session empty state + makes no BFF call', () => {
      expect(
        element.querySelector('[data-testid="learner-no-session"]'),
      ).not.toBeNull();
    });
  });

  describe('LIVE with an instructor-opened question', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      httpMock.expectOne(SESS).flush(wire());
      fixture.detectChanges();
      httpMock.expectOne(QUIZ).flush(quizQuestions);
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the current question prompt', () => {
      const prompt = element.querySelector('[data-testid="learner-prompt"]');
      expect(prompt?.textContent).toContain('What is 2 + 2?');
    });

    it('renders one button per option, labelled by the option label', () => {
      const opts = element.querySelectorAll(
        '[data-testid^="learner-option-"]',
      );
      expect(opts.length).toBe(2);
      expect(opts[0].textContent).toContain('Four');
      expect(opts[1].textContent).toContain('Five');
    });

    it('submits the chosen option LABEL as `choice` (BE contract)', () => {
      (
        element.querySelector(
          '[data-testid="learner-option-0"]',
        ) as HTMLButtonElement
      ).click();
      const req = httpMock.expectOne(`${SESS}/responses`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ question_id: 'q-1', choice: 'Four' });
      req.flush(wire());
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="learner-answered"]'),
      ).not.toBeNull();
    });

    it('treats a 409 (already answered) as answered, not an error', () => {
      (
        element.querySelector(
          '[data-testid="learner-option-1"]',
        ) as HTMLButtonElement
      ).click();
      httpMock
        .expectOne(`${SESS}/responses`)
        .flush({ message: 'already answered' }, {
          status: 409,
          statusText: 'Conflict',
        });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="learner-answered"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="learner-error"]'),
      ).toBeNull();
    });
  });

  describe('LIVE but no question opened yet', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      httpMock.expectOne(SESS).flush(wire({ current_question_id: '' }));
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('shows the waiting-for-question banner', () => {
      expect(
        element.querySelector('[data-testid="learner-waiting"]'),
      ).not.toBeNull();
    });
  });

  describe('CLOSED session', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      httpMock
        .expectOne(SESS)
        .flush(wire({ state: 'CLOSED', ended_at: '2026-05-26T03:30:00Z' }));
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('shows the session-ended banner', () => {
      expect(
        element.querySelector('[data-testid="learner-closed"]'),
      ).not.toBeNull();
    });
  });

  describe('error path (404 fails loud)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      httpMock
        .expectOne(SESS)
        .flush(
          { message: 'classroom session not found' },
          { status: 404, statusText: 'Not Found' },
        );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the error panel with the HTTP status', () => {
      const err = element.querySelector('[data-testid="learner-error"]');
      expect(err).not.toBeNull();
      expect(err?.textContent).toContain('404');
    });
  });

  // ── L5.2 retirement (CHO-1704 WS3): thin redirect to /play/<code> ──────────

  describe('redirect to the Live Classroom stage when the BE carries join_code', () => {
    it('navigates to /play/<join_code> from the first snapshot', () => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      const router = TestBed.inject(Router);
      const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      fixture.detectChanges();
      httpMock.expectOne(SESS).flush(wire({ join_code: 'K7M3QX' }));
      fixture.detectChanges();
      expect(nav).toHaveBeenCalledWith(['/play', 'K7M3QX'], {
        replaceUrl: true,
      });
    });

    it('keeps the legacy answer flow when join_code is absent (old BE)', () => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      const router = TestBed.inject(Router);
      const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      fixture.detectChanges();
      httpMock.expectOne(SESS).flush(wire());
      fixture.detectChanges();
      httpMock.expectOne(QUIZ).flush(quizQuestions);
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
      expect(nav).not.toHaveBeenCalled();
      expect(
        element.querySelector('[data-testid="learner-prompt"]'),
      ).not.toBeNull();
    });
  });
});
