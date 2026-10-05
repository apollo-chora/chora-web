/**
 * PlayStageComponent spec — L5.2 Live Classroom learner stage (CHO-1704 WS3).
 *
 * Drives the chromeless `/play/:code` stage through its 7-stage journey
 * against the real HTTP layer (HttpTestingController, mirroring
 * classroom.component.spec.ts):
 *
 *   resolve by-code → poll snapshot → JOIN → LOBBY → QUESTION → submit →
 *   LOCKED / REVEAL / too-late → PODIUM.
 *
 * Fixtures use REAL wall-clock-relative opened_at stamps (10s ago for a
 * stable QUESTION stage) so no fake timers are needed — the component's
 * 250ms tick only refines the countdown, never the asserted stage.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PlayStageComponent } from './play-stage.component';
import type { ClassroomSessionWire } from '../classroom/classroom.model';
import { environment } from '../../../../../environments/environment';

const BY_CODE = `${environment.bffBaseUrl}/api/v1/classroom-sessions/by-code/K7M3QX`;
const SESS = `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`;
const JOIN = `${SESS}/join`;
const RESPOND = `${SESS}/responses`;

const byCodeBody = {
  session_id: 'sess-1',
  live_quiz_id: 'quiz-1',
  quiz_title: 'CSPO Sprint Planning',
  state: 'ARMED',
  participant_count: 2,
};

/** Base ARMED wire BEFORE the caller has joined (no `me`). */
const armedWire = (
  overrides: Partial<ClassroomSessionWire> = {},
): ClassroomSessionWire => ({
  id: 'sess-1',
  tenant_id: 'tA',
  live_quiz_id: 'quiz-1',
  instructor_gcid: 'i-1',
  state: 'ARMED',
  current_question_id: '',
  response_counts: {},
  joined_learners: 0,
  join_code: 'K7M3QX',
  participant_count: 2,
  participants: [
    { nickname: 'QuarkQueen', joined_at: '2026-06-10T03:00:00Z' },
    { nickname: 'BosonBoss', joined_at: '2026-06-10T03:00:05Z' },
  ],
  created_at: '2026-06-10T03:00:00Z',
  updated_at: new Date().toISOString(),
  ...overrides,
});

/** LIVE wire with an open 60s question opened 10s ago — caller joined. */
const liveWire = (
  overrides: Partial<ClassroomSessionWire> = {},
): ClassroomSessionWire => {
  const openedAt = new Date(Date.now() - 10_000).toISOString();
  return armedWire({
    state: 'LIVE',
    current_question_id: 'q-1',
    response_counts: { '4': 3 },
    participant_count: 10,
    open_question: {
      question_id: 'q-1',
      prompt: 'What is 2 + 2?',
      options: [{ label: '3' }, { label: '4' }, { label: '5' }, { label: '22' }],
      opened_at: openedAt,
      timer_seconds: 60,
      double_points: true,
      locked: false,
    },
    me: { nickname: 'AtomAce', score: 100, rank: 5, streak: 1 },
    ...overrides,
  });
};

function setup(): {
  fixture: ComponentFixture<PlayStageComponent>;
  element: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [PlayStageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ code: 'K7M3QX' }) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PlayStageComponent);
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('PlayStageComponent', () => {
  let fixture: ComponentFixture<PlayStageComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  afterEach(() => {
    // Drain any in-flight snapshot polls before verify (classroom pattern).
    httpMock
      .match((r) => r.url.includes('/api/v1/classroom-sessions'))
      .forEach((r) => {
        try {
          r.flush(armedWire());
        } catch {
          // already cancelled — fine
        }
      });
    httpMock.verify();
  });

  /** Boot the component: resolve the code + flush the first snapshot poll. */
  function boot(firstFrame: ClassroomSessionWire): void {
    TestBed.resetTestingModule();
    const h = setup();
    fixture = h.fixture;
    element = h.element;
    httpMock = h.httpMock;
    fixture.detectChanges();
    httpMock.expectOne(BY_CODE).flush(byCodeBody);
    fixture.detectChanges();
    httpMock.expectOne(SESS).flush(firstFrame);
    fixture.detectChanges();
  }

  /** Type a nickname + click Join, flushing the POST with `flushBody`. */
  function join(flushBody: ClassroomSessionWire): void {
    const nick = element.querySelector(
      '[data-testid="play-nickname"]',
    ) as HTMLInputElement;
    nick.value = 'AtomAce';
    nick.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (element.querySelector('[data-testid="play-join"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const req = httpMock.expectOne(JOIN);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nickname: 'AtomAce' });
    req.flush(flushBody);
    fixture.detectChanges();
  }

  it('resolves the code and renders the JOIN stage', () => {
    boot(armedWire());
    expect(element.querySelector('[data-testid="play-join"]')).not.toBeNull();
    expect(
      element.querySelector('[data-testid="play-nickname"]'),
    ).not.toBeNull();
  });

  it('shows an inline error and stays on JOIN for 409 nickname_taken', () => {
    boot(armedWire());
    const nick = element.querySelector(
      '[data-testid="play-nickname"]',
    ) as HTMLInputElement;
    nick.value = 'AtomAce';
    nick.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (element.querySelector('[data-testid="play-join"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .expectOne(JOIN)
      .flush({ code: 'nickname_taken' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    const err = element.querySelector('[data-testid="play-join-error"]');
    expect(err?.textContent).toContain('nickname_taken');
    expect(element.querySelector('[data-testid="play-join"]')).not.toBeNull();
  });

  it('shows the profanity error for 400 nickname_profane', () => {
    boot(armedWire());
    const nick = element.querySelector(
      '[data-testid="play-nickname"]',
    ) as HTMLInputElement;
    nick.value = 'AtomAce';
    nick.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (element.querySelector('[data-testid="play-join"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpMock
      .expectOne(JOIN)
      .flush(
        { code: 'nickname_profane' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();
    const err = element.querySelector('[data-testid="play-join-error"]');
    expect(err?.textContent).toContain('nickname_profane');
  });

  it('joins into the LOBBY with nickname + live participant count', () => {
    boot(armedWire());
    join(
      armedWire({
        participant_count: 5,
        me: { nickname: 'AtomAce', score: 0, rank: 0, streak: 0 },
      }),
    );
    const lobby = element.querySelector('[data-testid="play-lobby"]');
    expect(lobby).not.toBeNull();
    expect(lobby?.textContent).toContain('AtomAce');
    expect(lobby?.textContent).toContain('5');
  });

  it('drops an already-joined learner straight into the QUESTION stage', () => {
    boot(liveWire());
    expect(
      element.querySelector('[data-testid="play-question"]'),
    ).not.toBeNull();
    expect(element.textContent).toContain('What is 2 + 2?');
    const options = element.querySelectorAll('[data-testid^="play-option-"]');
    expect(options.length).toBe(4);
    expect(options[1].textContent).toContain('4');
  });

  it('renders the countdown ring + the ×2 badge on double-points questions', () => {
    boot(liveWire());
    expect(element.querySelector('[data-testid="play-timer"]')).not.toBeNull();
    expect(
      element.querySelector('[data-testid="play-double-badge"]'),
    ).not.toBeNull();
  });

  it('renders no ring for timer_seconds 0', () => {
    const w = liveWire();
    boot({
      ...w,
      open_question: { ...w.open_question!, timer_seconds: 0, locks_at: undefined },
    });
    expect(
      element.querySelector('[data-testid="play-question"]'),
    ).not.toBeNull();
    expect(element.querySelector('[data-testid="play-timer"]')).toBeNull();
  });

  it('submits the tapped option LABEL and locks in', () => {
    boot(liveWire());
    (
      element.querySelector('[data-testid="play-option-1"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const req = httpMock.expectOne(RESPOND);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ question_id: 'q-1', choice: '4' });
    req.flush(
      {
        ...liveWire(),
        your_result: {
          question_id: 'q-1',
          correct: true,
          awarded_points: 87,
          streak_after: 2,
        },
      },
      { status: 201, statusText: 'Created' },
    );
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="play-locked"]')).not.toBeNull();
    // Correctness is HELD until reveal — never visible while locked.
    expect(element.querySelector('[data-testid="play-reveal"]')).toBeNull();
  });

  it('treats 409 duplicate_response as already answered (LOCKED)', () => {
    boot(liveWire());
    (
      element.querySelector('[data-testid="play-option-0"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpMock
      .expectOne(RESPOND)
      .flush(
        { code: 'duplicate_response' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="play-locked"]')).not.toBeNull();
  });

  it('shows the too-late banner on 409 question_locked', () => {
    boot(liveWire());
    (
      element.querySelector('[data-testid="play-option-0"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpMock
      .expectOne(RESPOND)
      .flush(
        { code: 'question_locked' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="play-too-late"]'),
    ).not.toBeNull();
  });

  it('REVEAL shows own correctness + awarded points once the question locks', () => {
    boot(liveWire());
    (
      element.querySelector('[data-testid="play-option-1"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const w = liveWire({
      me: {
        nickname: 'AtomAce',
        score: 187,
        rank: 1,
        streak: 2,
        last_result: {
          question_id: 'q-1',
          correct: true,
          awarded_points: 87,
          streak_after: 2,
        },
      },
      reveal: { question_id: 'q-1', correct_label: '4', explainer: 'Basic addition.' },
    });
    httpMock.expectOne(RESPOND).flush(
      {
        ...w,
        open_question: { ...w.open_question!, locked: true },
        your_result: {
          question_id: 'q-1',
          correct: true,
          awarded_points: 87,
          streak_after: 2,
        },
      },
      { status: 201, statusText: 'Created' },
    );
    fixture.detectChanges();
    const reveal = element.querySelector('[data-testid="play-reveal"]');
    expect(reveal).not.toBeNull();
    expect(reveal?.textContent).toContain('87');
    expect(reveal?.textContent).toContain('Basic addition.');
  });

  it('lands a returning learner on PODIUM when the session is CLOSED', () => {
    boot(
      armedWire({
        state: 'CLOSED',
        participant_count: 30,
        me: { nickname: 'AtomAce', score: 1240, rank: 12, streak: 0 },
        final_scoreboard: [
          { nickname: 'QuarkQueen', score: 2000, streak: 3, rank: 1 },
          { nickname: 'BosonBoss', score: 1500, streak: 1, rank: 2 },
          { nickname: 'AtomAce', score: 1240, streak: 0, rank: 12 },
        ],
        ended_at: '2026-06-10T03:30:00Z',
      }),
    );
    const podium = element.querySelector('[data-testid="play-podium"]');
    expect(podium).not.toBeNull();
    expect(podium?.textContent).toContain('12th');
    expect(podium?.textContent).toContain('1240');
  });

  it('PODIUM renders the post-close answer review when reveals are present', () => {
    boot(
      armedWire({
        state: 'CLOSED',
        me: { nickname: 'AtomAce', score: 14, rank: 1, streak: 0 },
        ended_at: '2026-06-10T03:30:00Z',
        reveals: [
          {
            question_id: 'q-1',
            prompt: 'What is 2+2?',
            correct_label: '4',
            your_choice: '4',
            your_correct: true,
          },
          { question_id: 'q-2', prompt: 'What is 3+3?', correct_label: '6' },
        ],
      }),
    );
    const review = element.querySelector('[data-testid="play-review"]');
    expect(review).not.toBeNull();
    const rows = review!.querySelectorAll('li');
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('What is 2+2?');
    expect(rows[0]?.textContent).toContain('4');
    // The skipped question shows the answer key + the no-answer marker.
    expect(rows[1]?.textContent).toContain('What is 3+3?');
    expect(rows[1]?.textContent).toContain('6');
  });
});
