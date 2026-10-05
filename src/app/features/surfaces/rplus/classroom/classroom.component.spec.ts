/**
 * ClassroomComponent spec — R+ Stage C-lite Wave-5 M8.
 *
 * Tests the snapshot view + state-badge + response bars + error/empty
 * branches. The polling stream is exercised via HttpTestingController +
 * the visibility-aware service wrapper.
 *
 * Pattern mirrors scheduling.component.spec.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClassroomComponent } from './classroom.component';
import type { ClassroomSessionWire } from './classroom.model';
import { environment } from '../../../../../environments/environment';

const wire = (overrides: Partial<ClassroomSessionWire> = {}): ClassroomSessionWire => ({
  id: 'sess-1',
  tenant_id: 'tA',
  live_quiz_id: 'quiz-1',
  instructor_gcid: 'i-1',
  state: 'LIVE',
  current_question_id: 'q-1',
  response_counts: { A: 2, B: 6, C: 2 }, // 20% / 60% / 20%
  joined_learners: 8,
  started_at: '2026-05-26T03:00:00Z',
  created_at: '2026-05-26T03:00:00Z',
  updated_at: '2026-05-26T03:00:02Z',
  ...overrides,
});

function setup(queryParams: Record<string, string> = {}): {
  fixture: ComponentFixture<ClassroomComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [ClassroomComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(queryParams),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClassroomComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

describe('ClassroomComponent', () => {
  let fixture: ComponentFixture<ClassroomComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  afterEach(() => {
    // L5 — drain the presenter's parent-quiz question fetch (fired reactively
    // by the snapshot effect once a liveQuizId is present) before verify().
    httpMock
      .match((r) => r.url.includes('/api/v1/live-quizzes/'))
      .forEach((r) => r.flush({ questions: [] }));
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

    it('renders the surface-rplus root', () => {
      const root = element.querySelector('[data-testid="rplus-classroom"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('shows the empty-state panel + no BFF call', () => {
      expect(element.querySelector('[data-testid="classroom-no-session"]')).not.toBeNull();
    });
  });

  describe('with session_id (LIVE snapshot)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`);
      req.flush(wire());
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the LIVE state badge', () => {
      const badge = element.querySelector('[data-testid="classroom-state-LIVE"]');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('LIVE');
    });

    it('shows the joined_learners count', () => {
      const joined = element.querySelector('[data-testid="classroom-joined-learners"]');
      expect(joined?.textContent).toContain('8');
    });

    it('shows the current question id', () => {
      const qid = element.querySelector('[data-testid="classroom-question-id"]');
      expect(qid?.textContent).toContain('q-1');
    });

    it('renders 3 response bars (A/B/C) sorted asc', () => {
      const bars = element.querySelectorAll('[data-testid^="classroom-bar-"]');
      expect(bars.length).toBe(3);
      expect(bars[0].getAttribute('data-testid')).toBe('classroom-bar-A');
      expect(bars[1].getAttribute('data-testid')).toBe('classroom-bar-B');
      expect(bars[2].getAttribute('data-testid')).toBe('classroom-bar-C');
    });

    it('renders 60% on bar B (6 of 10)', () => {
      const pct = element.querySelector('[data-testid="classroom-pct-B"]');
      expect(pct?.textContent?.trim()).toBe('60%');
    });

    it('renders the raw count alongside each bar', () => {
      const cntB = element.querySelector('[data-testid="classroom-count-B"]');
      expect(cntB?.textContent).toContain('6');
    });

    it('shows the audience-pulse panel with joined + state stats', () => {
      const pulse = element.querySelector('[data-testid="classroom-pulse"]');
      expect(pulse).not.toBeNull();
      expect(element.querySelector('[data-testid="classroom-pulse-joined"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="classroom-pulse-state"]')).not.toBeNull();
    });

    it('uses aria-live polite on the question id row', () => {
      const qid = element.querySelector('[data-testid="classroom-question-id"]');
      expect(qid?.getAttribute('aria-live')).toBe('polite');
    });

    it('exposes role=progressbar with aria-valuenow on each bar', () => {
      const bars = element.querySelectorAll('[role="progressbar"]');
      // 3 response bars (no extra audience-pulse bars in the M8 layout).
      expect(bars.length).toBe(3);
      const first = bars[0];
      expect(first.getAttribute('aria-valuemin')).toBe('0');
      expect(first.getAttribute('aria-valuemax')).toBe('100');
      expect(first.getAttribute('aria-valuenow')).not.toBeNull();
    });

    it('shows the polling indicator while LIVE', () => {
      const note = element.querySelector('[data-testid="classroom-polling-note"]');
      expect(note?.textContent).toContain('polling');
    });

    it('has zero critical/serious axe-core violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });

  describe('with session_id (ARMED snapshot — no responses yet)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`);
      req.flush(
        wire({
          state: 'ARMED',
          current_question_id: '',
          response_counts: {},
          joined_learners: 0,
          started_at: undefined,
        }),
      );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the ARMED state badge', () => {
      const badge = element.querySelector('[data-testid="classroom-state-ARMED"]');
      expect(badge).not.toBeNull();
    });

    it('shows the waiting-for-first-question banner', () => {
      const waiting = element.querySelector('[data-testid="classroom-waiting"]');
      expect(waiting).not.toBeNull();
    });

    it('shows the no-responses empty-state', () => {
      const noResp = element.querySelector('[data-testid="classroom-no-responses"]');
      expect(noResp).not.toBeNull();
    });
  });

  describe('with session_id (CLOSED — polling stopped)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`);
      req.flush(
        wire({
          state: 'CLOSED',
          ended_at: '2026-05-26T03:30:00Z',
        }),
      );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the CLOSED state badge', () => {
      const badge = element.querySelector('[data-testid="classroom-state-CLOSED"]');
      expect(badge).not.toBeNull();
    });

    it('shows the stopped polling indicator', () => {
      const note = element.querySelector('[data-testid="classroom-polling-note"]');
      expect(note?.textContent).toContain('stopped');
    });
  });

  // ── L5.2 host-console additions (CHO-1704 WS3) ─────────────────────────────

  describe('ARMED lobby panel (join code + QR + roster)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`).flush(
        wire({
          state: 'ARMED',
          current_question_id: '',
          response_counts: {},
          joined_learners: 0,
          started_at: undefined,
          join_code: 'K7M3QX',
          participant_count: 2,
          participants: [
            { nickname: 'AtomAce', joined_at: '2026-06-10T03:00:00Z' },
            { nickname: 'QuarkQueen', joined_at: '2026-06-10T03:00:05Z' },
          ],
        }),
      );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('shows the big join code', () => {
      const code = element.querySelector('[data-testid="classroom-join-code"]');
      expect(code?.textContent).toContain('K7M3QX');
    });

    it('renders the QR svg for the play URL', () => {
      const qr = element.querySelector('[data-testid="classroom-qr"] svg path');
      expect(qr).not.toBeNull();
      expect(qr?.getAttribute('d')?.startsWith('M')).toBe(true);
    });

    it('deep-links the learner play view in a new tab (§4.6)', () => {
      const link = element.querySelector(
        '[data-testid="classroom-play-link"]',
      ) as HTMLAnchorElement | null;
      expect(link).not.toBeNull();
      expect(link!.getAttribute('href')).toBe('/play/K7M3QX');
      expect(link!.getAttribute('target')).toBe('_blank');
      expect(link!.getAttribute('rel')).toContain('noopener');
    });

    it('lists the live nickname roster', () => {
      const roster = element.querySelector('[data-testid="classroom-roster"]');
      expect(roster?.textContent).toContain('AtomAce');
      expect(roster?.textContent).toContain('QuarkQueen');
    });
  });

  describe('LIVE open-question console (countdown + answered + end)', () => {
    /** Open question opened 10s ago with a 60s timer — window still open. */
    function liveOpenWire(over: Partial<ClassroomSessionWire> = {}): ClassroomSessionWire {
      return wire({
        participant_count: 10,
        open_question: {
          question_id: 'q-1',
          prompt: 'What is 2 + 2?',
          options: [{ label: '3' }, { label: '4' }],
          opened_at: new Date(Date.now() - 10_000).toISOString(),
          timer_seconds: 60,
          double_points: false,
          locked: false,
        },
        updated_at: new Date().toISOString(),
        ...over,
      });
    }

    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`)
        .flush(liveOpenWire());
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('shows the same server-anchored countdown as the learners', () => {
      const countdown = element.querySelector('[data-testid="classroom-countdown"]');
      expect(countdown).not.toBeNull();
      // ~52s left of the 62s window — renders a positive seconds value.
      expect(countdown?.textContent).toMatch(/\d+/);
    });

    it('shows X answered out of the participant count', () => {
      const answered = element.querySelector('[data-testid="classroom-answered"]');
      // response_counts {A:2,B:6,C:2} → 10 answered of 10 participants.
      expect(answered?.textContent).toContain('10');
    });

    it('renders the End session button while LIVE', () => {
      expect(element.querySelector('[data-testid="classroom-end"]')).not.toBeNull();
    });

    it('End session POSTs /close', () => {
      (element.querySelector('[data-testid="classroom-end"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1/close`,
      );
      expect(req.request.method).toBe('POST');
      req.flush(wire({ state: 'CLOSED', ended_at: '2026-06-10T03:30:00Z' }));
    });

    it('hides the interim scoreboard while the window is open', () => {
      expect(element.querySelector('[data-testid="classroom-scoreboard"]')).toBeNull();
    });
  });

  describe('LIVE locked question → interim scoreboard (top-10)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`).flush(
        wire({
          open_question: {
            question_id: 'q-1',
            prompt: 'What is 2 + 2?',
            options: [{ label: '3' }, { label: '4' }],
            opened_at: '2026-06-10T03:01:00Z',
            timer_seconds: 60,
            locked: true,
          },
          scoreboard: Array.from({ length: 12 }, (_, i) => ({
            nickname: `Player${i + 1}`,
            score: 1000 - i * 10,
            streak: 0,
            rank: i + 1,
          })),
        }),
      );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the interim scoreboard capped at top-10', () => {
      const board = element.querySelector('[data-testid="classroom-scoreboard"]');
      expect(board).not.toBeNull();
      const rows = board!.querySelectorAll('[data-testid^="classroom-rank-"]');
      expect(rows.length).toBe(10);
      expect(board?.textContent).toContain('Player1');
      expect(board?.textContent).not.toContain('Player11');
    });
  });

  describe('CLOSED → podium (top-5, staggered reveal)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'sess-1' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/sess-1`).flush(
        wire({
          state: 'CLOSED',
          ended_at: '2026-06-10T03:30:00Z',
          podium: [
            { nickname: 'QuarkQueen', score: 2000, streak: 3, rank: 1 },
            { nickname: 'BosonBoss', score: 1500, streak: 1, rank: 2 },
            { nickname: 'AtomAce', score: 1240, streak: 0, rank: 3 },
          ],
          final_scoreboard: Array.from({ length: 8 }, (_, i) => ({
            nickname: `Player${i + 1}`,
            score: 900 - i,
            streak: 0,
            rank: i + 1,
          })),
        }),
      );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the podium with the top finishers', () => {
      const podium = element.querySelector('[data-testid="classroom-podium"]');
      expect(podium).not.toBeNull();
      expect(podium?.textContent).toContain('QuarkQueen');
      expect(podium?.textContent).toContain('2000');
      const steps = podium!.querySelectorAll('[data-testid^="classroom-podium-"]');
      expect(steps.length).toBeLessThanOrEqual(5);
      expect(steps.length).toBe(3);
    });
  });

  describe('error path (404 fails loud — no stubs)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const harness = setup({ session_id: 'missing' });
      fixture = harness.fixture;
      httpMock = harness.httpMock;
      fixture.detectChanges();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/classroom-sessions/missing`);
      req.flush(
        { error: 'Not Found', message: 'classroom session not found' },
        { status: 404, statusText: 'Not Found' },
      );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the error panel with the HTTP status code', () => {
      const err = element.querySelector('[data-testid="classroom-error"]');
      expect(err).not.toBeNull();
      const status = element.querySelector('[data-testid="classroom-error-status"]');
      expect(status?.textContent).toContain('404');
    });
  });
});
