import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { CampaignPracticeComponent } from './campaign-practice.component';
import { TranslateService, interpolateI18n } from '../../../../../core/services/translate.service';
import type {
  CampaignAnswerResult,
  CampaignQuestionsResponse,
} from '../../my-knowledge/campaign.model';

// The §2 serve is SANITISED pre-grade (Slice F): no `is_correct`, no
// `explainer`. The correct option + its explainer arrive only on the §3 answer
// response, post-grade.
const PAYLOAD = {
  candidates: [
    {
      stem: 'What is 2 + 3?',
      question_type: 'mcq',
      options: [
        { option_id: 'a', text: '4' },
        { option_id: 'b', text: '5' },
        { option_id: 'c', text: '6' },
      ],
    },
    {
      stem: 'Which is even?',
      question_type: 'mcq',
      options: [
        { option_id: 'x', text: '3' },
        { option_id: 'y', text: '4' },
      ],
    },
  ],
  proposed_test_set: {},
};

const READY: CampaignQuestionsResponse = {
  status: 'ready',
  concept_id: 'concept-1',
  concept_key: 'addition',
  rung: 3,
  questions: PAYLOAD,
  source: 'question_bank',
};

function poll(status: CampaignQuestionsResponse['status']): CampaignQuestionsResponse {
  return { status, concept_id: 'concept-1', concept_key: 'addition', rung: 3 };
}

const RESULT_BASE: CampaignAnswerResult = {
  correct: true,
  rung: 3,
  is_refresher: false,
  counted: true,
  cleared_rung: 0,
  won: false,
  paced_today: false,
  rungs_cleared: 2,
  current_rung_correct: 1,
  needed_correct: 2,
  retention_r: 0.8,
};

const QUESTIONS_URL = '/api/v1/me/goals/goal-1/campaign/questions';
const ANSWER_URL = '/api/v1/me/goals/goal-1/campaign/questions/answer';

function mount(): {
  fixture: ComponentFixture<CampaignPracticeComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [CampaignPracticeComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(CampaignPracticeComponent);
  fixture.componentRef.setInput('goalId', 'goal-1');
  fixture.componentRef.setInput('conceptId', 'concept-1');
  fixture.componentRef.setInput('conceptLabel', 'Addition');
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // effect → load → GET fires
  return { fixture, httpMock };
}

function flushLoad(httpMock: HttpTestingController, resp: CampaignQuestionsResponse): void {
  httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(resp);
}

/** Mount + drive straight to the playing state (READY). */
function mountPlaying(): {
  fixture: ComponentFixture<CampaignPracticeComponent>;
  httpMock: HttpTestingController;
  el: HTMLElement;
} {
  const { fixture, httpMock } = mount();
  flushLoad(httpMock, READY);
  fixture.detectChanges();
  return { fixture, httpMock, el: fixture.nativeElement as HTMLElement };
}

/** Answer the active question, flushing the POST with `result`. */
function answerActive(
  fixture: ComponentFixture<CampaignPracticeComponent>,
  httpMock: HttpTestingController,
  optionId: string,
  result: Partial<CampaignAnswerResult>,
): void {
  const el = fixture.nativeElement as HTMLElement;
  (el.querySelector(`[data-testid="cp-option-${optionId}"]`) as HTMLButtonElement).click();
  fixture.detectChanges();
  (el.querySelector('[data-testid="cp-submit"]') as HTMLButtonElement).click();
  httpMock.expectOne((r) => r.url.endsWith(ANSWER_URL)).flush({ ...RESULT_BASE, ...result });
  fixture.detectChanges();
}

describe('CampaignPracticeComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ── load on init ────────────────────────────────────────────────────
  describe('load', () => {
    it('fires the node-scoped GET with concept_id on mount', () => {
      const { fixture, httpMock } = mount();
      const req = httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL));
      expect(req.request.params.get('concept_id')).toBe('concept-1');
      req.flush(READY);
      fixture.detectChanges();
      httpMock.verify();
    });
  });

  // ── playing state ───────────────────────────────────────────────────
  describe('playing (ready)', () => {
    it('renders the first stem, its options with A/B/C markers, and the rung chip', () => {
      const { el, httpMock } = mountPlaying();
      expect(el.querySelector('[data-testid="cp-stem"]')?.textContent).toContain('2 + 3');
      const opts = el.querySelectorAll('[data-testid^="cp-option-"]');
      expect(opts.length).toBe(3);
      expect(el.querySelector('[data-testid="cp-option-a"]')?.textContent).toContain('A');
      expect(el.querySelector('[data-testid="cp-option-a"]')?.textContent).toContain('4');
      // revised-Bloom rung label via CAMPAIGN_RUNG_LABEL_KEYS[3] = campaign_rung_3.
      expect(el.querySelector('[data-testid="cp-rung-chip"]')?.textContent).toContain(
        'campaign_rung_3',
      );
      httpMock.verify();
    });

    it('submit is disabled until an option is selected', () => {
      const { el, fixture, httpMock } = mountPlaying();
      const submit = el.querySelector('[data-testid="cp-submit"]') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      (el.querySelector('[data-testid="cp-option-b"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(submit.disabled).toBe(false);
      httpMock.verify();
    });

    it('POSTs the answer with concept_id, rung, question_index and selected_option_id', () => {
      const { el, fixture, httpMock } = mountPlaying();
      (el.querySelector('[data-testid="cp-option-b"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (el.querySelector('[data-testid="cp-submit"]') as HTMLButtonElement).click();
      const req = httpMock.expectOne((r) => r.url.endsWith(ANSWER_URL));
      expect(req.request.body).toEqual({
        concept_id: 'concept-1',
        rung: 3,
        question_index: 0,
        selected_option_id: 'b',
      });
      req.flush(RESULT_BASE);
      fixture.detectChanges();
      httpMock.verify();
    });

    // CHO-2252: the parse drops unusable candidates, so the render cursor and
    // the WIRE index diverge. `question_index` is a protocol field the backend
    // resolves against its own full candidates array — posting the cursor would
    // grade the learner against a DIFFERENT question, silently, as a wrong
    // answer. (Since CHO-2253 the BE now 422s instead of mis-grading, but the
    // client must not send the wrong index in the first place.)
    it('POSTs the SERVED question index, not the render cursor, when a candidate is dropped', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, {
        status: 'ready',
        concept_id: 'concept-1',
        concept_key: 'addition',
        rung: 3,
        source: 'question_bank',
        questions: {
          candidates: [
            // Dropped by the parse: an open-ended candidate carries no options.
            { stem: 'Explain addition in your own words', question_type: 'oe' },
            {
              stem: '2+2?',
              question_type: 'mcq',
              options: [
                { option_id: 'aa', text: '3' },
                { option_id: 'bb', text: '4' },
              ],
            },
          ],
        },
      });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      (el.querySelector('[data-testid="cp-option-bb"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (el.querySelector('[data-testid="cp-submit"]') as HTMLButtonElement).click();
      const req = httpMock.expectOne((r) => r.url.endsWith(ANSWER_URL));
      // Rendered first (cursor = 0) but SECOND on the wire.
      expect((req.request.body as { question_index: number }).question_index).toBe(1);
      req.flush(RESULT_BASE);
      fixture.detectChanges();
      httpMock.verify();
    });

    it('double-submit fires exactly ONE POST (no idempotency store on the door)', () => {
      const { el, fixture, httpMock } = mountPlaying();
      (el.querySelector('[data-testid="cp-option-b"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const btn = el.querySelector('[data-testid="cp-submit"]') as HTMLButtonElement;
      btn.click();
      btn.click(); // second click before the first resolves
      const reqs = httpMock.match((r) => r.url.endsWith(ANSWER_URL));
      expect(reqs.length).toBe(1);
      reqs[0].flush(RESULT_BASE);
      fixture.detectChanges();
      httpMock.verify();
    });

    it('locks option selection once a verdict is in', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true });
      // clicking another option after the verdict must not change the selection
      (el.querySelector('[data-testid="cp-option-a"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selectedOptionId()).toBe('b');
      httpMock.verify();
    });
  });

  // ── verdict + outcome banners ───────────────────────────────────────
  describe('verdict + outcome banners (server-graded)', () => {
    it('shows a correct verdict (role=alert) from the server response', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true });
      const verdict = el.querySelector('[data-testid="cp-verdict"]');
      expect(verdict).not.toBeNull();
      expect(verdict?.getAttribute('role')).toBe('alert');
      expect(el.querySelector('[data-testid="cp-verdict-correct"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-verdict-incorrect"]')).toBeNull();
      httpMock.verify();
    });

    it('shows an incorrect verdict when the server says wrong', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'a', { correct: false, counted: false });
      expect(el.querySelector('[data-testid="cp-verdict-incorrect"]')).not.toBeNull();
      httpMock.verify();
    });

    it('reveals the explainer from the ANSWER response (not the sanitised payload)', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', {
        correct: true,
        explainer: 'Because 2 + 3 = 5.',
      });
      expect(el.querySelector('[data-testid="cp-explainer"]')?.textContent).toContain(
        'Because 2 + 3 = 5.',
      );
      httpMock.verify();
    });

    it('shows no explainer panel when the answer response omits it', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true }); // no explainer field
      expect(el.querySelector('[data-testid="cp-explainer"]')).toBeNull();
      httpMock.verify();
    });

    it('highlights the correct option (icon+text) after an incorrect answer', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'a', {
        correct: false,
        counted: false,
        correct_option_id: 'b',
      });
      const reveal = el.querySelector('[data-testid="cp-correct-option-b"]');
      expect(reveal).not.toBeNull();
      // icon + text (never colour alone)
      expect(reveal?.querySelector('i')).not.toBeNull();
      expect(reveal?.textContent?.trim().length).toBeGreaterThan(0);
      // the reveal is on the correct option (b), not the chosen wrong one (a)
      expect(el.querySelector('[data-testid="cp-correct-option-a"]')).toBeNull();
      httpMock.verify();
    });

    it('does NOT highlight a correct option when the answer was correct', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true, correct_option_id: 'b' });
      // no separate "correct answer" reveal tag when the learner was right
      expect(el.querySelector('[data-testid^="cp-correct-option-"]')).toBeNull();
      httpMock.verify();
    });

    it('shows the counted banner with n/needed progress', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', {
        correct: true,
        counted: true,
        current_rung_correct: 1,
        needed_correct: 2,
      });
      const counted = el.querySelector('[data-testid="cp-banner-counted"]');
      expect(counted).not.toBeNull();
      expect(counted?.textContent).toContain('1');
      expect(counted?.textContent).toContain('2');
      httpMock.verify();
    });

    it('celebrates a cleared rung with the cleared banner', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true, cleared_rung: 3, rungs_cleared: 3 });
      expect(el.querySelector('[data-testid="cp-banner-cleared"]')).not.toBeNull();
      // Raw-key mode: the banner renders the cleared key (the interpolated
      // next-rung label is asserted in the i18n-interpolation suite, CHO-2144).
      expect(el.querySelector('[data-testid="cp-banner-cleared"]')?.textContent).toContain(
        'campaign_practice_cleared',
      );
      httpMock.verify();
    });

    it('shows the WON celebration when the node is won', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', {
        correct: true,
        won: true,
        cleared_rung: 6,
        rung: 6,
        rungs_cleared: 6,
      });
      expect(el.querySelector('[data-testid="cp-banner-won"]')).not.toBeNull();
      // won node has left the campaign → the primary CTA is back-to-map
      expect(el.querySelector('[data-testid="cp-back"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows the paced-today banner (advances tomorrow)', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true, counted: false, paced_today: true });
      expect(el.querySelector('[data-testid="cp-banner-paced"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows the refresher chip when the serve was a refresher', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true, is_refresher: true });
      expect(el.querySelector('[data-testid="cp-refresher"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  // ── next-question flow + summary ────────────────────────────────────
  describe('question flow + summary', () => {
    it('advances to the second question and resets the verdict', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true });
      (el.querySelector('[data-testid="cp-next"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="cp-stem"]')?.textContent).toContain('Which is even?');
      expect(el.querySelector('[data-testid="cp-verdict"]')).toBeNull();
      expect(fixture.componentInstance.activeIndex()).toBe(1);
      httpMock.verify();
    });

    it('finishing the last question shows a summary with the score and back-to-map', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true });
      (el.querySelector('[data-testid="cp-next"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      answerActive(fixture, httpMock, 'y', { correct: true });
      // last question → the advance CTA finishes into the summary
      (el.querySelector('[data-testid="cp-finish"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const summary = el.querySelector('[data-testid="cp-summary"]');
      expect(summary).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-summary-score"]')?.textContent).toContain('2');
      expect(el.querySelector('[data-testid="cp-back"]')).not.toBeNull();
      httpMock.verify();
    });

    it('back-to-map navigates to /a/knowledge/{goalId}', () => {
      const { el, fixture, httpMock } = mountPlaying();
      answerActive(fixture, httpMock, 'b', { correct: true, won: true });
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      (el.querySelector('[data-testid="cp-back"]') as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith(['/a/knowledge', 'goal-1']);
      httpMock.verify();
    });
  });

  // ── non-ready statuses ──────────────────────────────────────────────
  describe('non-ready statuses', () => {
    it('none → honest empty state with a back CTA', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('none'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="cp-empty"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-back"]')).not.toBeNull();
      httpMock.verify();
    });

    it('tap_capped → honest resets-tomorrow state with a back CTA', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('tap_capped'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="cp-tap-capped"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-back"]')).not.toBeNull();
      httpMock.verify();
    });

    it('failed → fail-loud banner (role=alert) with the reason and a retry CTA', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, { ...poll('failed'), failure_reason: 'qgen refused: unsafe' });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const failed = el.querySelector('[data-testid="cp-failed"]');
      expect(failed).not.toBeNull();
      expect(failed?.getAttribute('role')).toBe('alert');
      expect(failed?.textContent).toContain('qgen refused: unsafe');
      expect(el.querySelector('[data-testid="cp-retry"]')).not.toBeNull();
      httpMock.verify();
    });

    it('a ready serve that parses to zero questions fails loud (never a blank player)', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, { ...READY, questions: { candidates: [] } });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="cp-failed"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-stem"]')).toBeNull();
      httpMock.verify();
    });

    it('an unknown serve status fails loud (never a silent blank)', () => {
      const { fixture, httpMock } = mount();
      const bogus = {
        status: 'weird',
        concept_id: 'concept-1',
        concept_key: 'addition',
        rung: 1,
      } as unknown as CampaignQuestionsResponse;
      flushLoad(httpMock, bogus);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="cp-failed"]'),
      ).not.toBeNull();
      httpMock.verify();
    });
  });

  // ── polling (requested/idle) ────────────────────────────────────────
  describe('polling', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('requested → shows preparing, polls, and enters playing when ready lands', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="cp-preparing"]')).not.toBeNull();

      vi.advanceTimersByTime(2500);
      httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(poll('requested'));
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="cp-preparing"]')).not.toBeNull();

      vi.advanceTimersByTime(2500);
      httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(READY);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="cp-stem"]')).not.toBeNull();
      httpMock.verify();
    });

    it('a transient poll error is not a verdict — it keeps polling', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      vi.advanceTimersByTime(2500);
      httpMock
        .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
        .flush(null, { status: 504, statusText: 'Gateway Timeout' });
      fixture.detectChanges();
      // still preparing (a blip did not abort)
      expect(el.querySelector('[data-testid="cp-preparing"]')).not.toBeNull();

      vi.advanceTimersByTime(2500);
      httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(READY);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="cp-stem"]')).not.toBeNull();
      httpMock.verify();
    });

    it('past the fast window it is still composing — no retry, and it keeps polling', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      // 24 fast polls all still requested → the fast window closes.
      for (let i = 0; i < 24; i++) {
        vi.advanceTimersByTime(2500);
        httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(poll('requested'));
        fixture.detectChanges();
      }

      // In flight is NOT a failure. Offering "Try again" here would be a lie:
      // the BE refuses a same-day re-fire, so the button could only re-read and
      // restart the same countdown. Calm copy, no retry, keep watching.
      expect(el.querySelector('[data-testid="cp-preparing-long"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-prep-timeout"]')).toBeNull();
      expect(el.querySelector('[data-testid="cp-retry"]')).toBeNull();
      httpMock.verify();
    });

    it('a slow poll that lands ready live-updates into playing, untouched', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      for (let i = 0; i < 24; i++) {
        vi.advanceTimersByTime(2500);
        httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(poll('requested'));
        fixture.detectChanges();
      }
      expect(el.querySelector('[data-testid="cp-preparing-long"]')).not.toBeNull();

      // The learner just waits. The set lands on a slow tick with no interaction.
      vi.advanceTimersByTime(15000);
      httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(READY);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="cp-stem"]')).not.toBeNull();
      httpMock.verify();
    });

    it('flashes a "questions ready" confirmation when a poll lands ready (CHO-2319)', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      vi.advanceTimersByTime(2500);
      httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(READY);
      fixture.detectChanges();

      // The player is shown AND the composing -> ready transition is announced.
      expect(el.querySelector('[data-testid="cp-stem"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-ready-flash"]')).not.toBeNull();
      httpMock.verify();
    });

    it('does NOT flash "ready" on an initial ready load, only after composing (CHO-2319)', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, READY); // the very first serve is already ready
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="cp-stem"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-ready-flash"]')).toBeNull();
      httpMock.verify();
    });

    it('rests after the slow ceiling offering a re-read, never a regenerate', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      for (let i = 0; i < 24; i++) {
        vi.advanceTimersByTime(2500);
        httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(poll('requested'));
        fixture.detectChanges();
      }
      for (let i = 0; i < 40; i++) {
        vi.advanceTimersByTime(15000);
        httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(poll('requested'));
        fixture.detectChanges();
      }

      // Stop watching, but stay truthful: a re-read, never "Try again".
      expect(el.querySelector('[data-testid="cp-prep-timeout"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-retry"]')).toBeNull();
      expect(el.querySelector('[data-testid="cp-recheck"]')).not.toBeNull();
      httpMock.verify();
    });

    it('a poll that resolves to none → empty state', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      vi.advanceTimersByTime(2500);
      httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(poll('none'));
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="cp-empty"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('a poll that resolves to failed → fail-loud with the reason', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      vi.advanceTimersByTime(2500);
      httpMock
        .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
        .flush({ ...poll('failed'), failure_reason: 'qgen gave up' });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="cp-failed"]')?.textContent).toContain('qgen gave up');
      httpMock.verify();
    });

    it('a 409 NODE_WON during the poll → already-won state (stops polling)', () => {
      const { fixture, httpMock } = mount();
      flushLoad(httpMock, poll('requested'));
      fixture.detectChanges();
      vi.advanceTimersByTime(2500);
      httpMock
        .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
        .flush({ code: 'NODE_WON', message: 'won' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="cp-node-won"]'),
      ).not.toBeNull();
      // polling stopped — no further GET is armed
      vi.advanceTimersByTime(2500);
      httpMock.verify();
    });
  });

  // ── error taxonomy ──────────────────────────────────────────────────
  describe('error taxonomy', () => {
    it('409 NODE_WON on load → already-won state', () => {
      const { fixture, httpMock } = mount();
      httpMock
        .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
        .flush({ code: 'NODE_WON', message: 'won' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="cp-node-won"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="cp-back"]')).not.toBeNull();
      httpMock.verify();
    });

    it('404 CONCEPT_NOT_FOUND and 422 CONCEPT_OUTSIDE_CAMPAIGN → invalid (back, no retry)', () => {
      for (const [status, code] of [
        [404, 'CONCEPT_NOT_FOUND'],
        [422, 'CONCEPT_OUTSIDE_CAMPAIGN'],
      ] as const) {
        const { fixture, httpMock } = mount();
        httpMock
          .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
          .flush({ code, message: code }, { status, statusText: 'x' });
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector('[data-testid="cp-invalid"]')).not.toBeNull();
        expect(el.querySelector('[data-testid="cp-retry"]')).toBeNull();
        expect(el.querySelector('[data-testid="cp-back"]')).not.toBeNull();
        httpMock.verify();
        TestBed.resetTestingModule();
      }
    });

    it('404 GOAL_NOT_FOUND → truthful not-found state (NOT the generic invalid copy), with a back-to-maps CTA', () => {
      const { fixture, httpMock } = mount();
      httpMock
        .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
        .flush({ code: 'GOAL_NOT_FOUND', message: '' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="cp-not-found"]')).not.toBeNull();
      // A 404 GOAL_NOT_FOUND means "this map isn't yours / doesn't exist", NOT
      // "questions aren't ready" — it must not fall into the generic invalid copy.
      expect(el.querySelector('[data-testid="cp-invalid"]')).toBeNull();
      expect(el.querySelector('[data-testid="cp-back-maps"]')).not.toBeNull();
      httpMock.verify();
    });

    it('not-found back-to-maps navigates to the maps LIST /a/knowledge (not the 404ing map)', () => {
      const { fixture, httpMock } = mount();
      httpMock
        .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
        .flush({ code: 'GOAL_NOT_FOUND', message: '' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      (el.querySelector('[data-testid="cp-back-maps"]') as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith(['/a/knowledge']);
      httpMock.verify();
    });

    it('5xx on load → fail-loud error with retry', () => {
      const { fixture, httpMock } = mount();
      httpMock
        .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const err = el.querySelector('[data-testid="cp-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(el.querySelector('[data-testid="cp-retry"]')).not.toBeNull();
      httpMock.verify();
    });

    it('retry re-issues the GET', () => {
      const { fixture, httpMock } = mount();
      httpMock
        .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      (el.querySelector('[data-testid="cp-retry"]') as HTMLButtonElement).click();
      flushLoad(httpMock, READY);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="cp-stem"]')).not.toBeNull();
      httpMock.verify();
    });

    it('409 RUNG_NOT_UNLOCKED on answer → inline stale error with reload (no crash)', () => {
      const { el, fixture, httpMock } = mountPlaying();
      (el.querySelector('[data-testid="cp-option-b"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (el.querySelector('[data-testid="cp-submit"]') as HTMLButtonElement).click();
      httpMock
        .expectOne((r) => r.url.endsWith(ANSWER_URL))
        .flush(
          { code: 'RUNG_NOT_UNLOCKED', message: 'rung changed' },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="cp-answer-error"]')).not.toBeNull();
      // the player is still intact (stem visible), submit re-enabled
      expect(el.querySelector('[data-testid="cp-stem"]')).not.toBeNull();
      expect(fixture.componentInstance.submitting()).toBe(false);
      httpMock.verify();
    });

    it('409 NODE_WON on answer → already-won state', () => {
      const { el, fixture, httpMock } = mountPlaying();
      (el.querySelector('[data-testid="cp-option-b"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (el.querySelector('[data-testid="cp-submit"]') as HTMLButtonElement).click();
      httpMock
        .expectOne((r) => r.url.endsWith(ANSWER_URL))
        .flush({ code: 'NODE_WON', message: 'won' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="cp-node-won"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  // ── a11y ────────────────────────────────────────────────────────────
  describe('a11y', () => {
    it('options are <button> elements (keyboard-navigable) with stable testids', () => {
      const { el, httpMock } = mountPlaying();
      const opt = el.querySelector('[data-testid="cp-option-a"]');
      expect(opt?.tagName).toBe('BUTTON');
      httpMock.verify();
    });

    it('has zero critical/serious axe violations in the playing state', async () => {
      const { fixture, httpMock } = mountPlaying();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement as HTMLElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 15000);
  });
});

// ── CHO-2144: i18n interpolation + first-tap "check back" pending copy ──────
// The raw-key TranslateService (dev-mode default) can NEVER surface a
// {{token}} interpolation bug — the key it returns has no placeholders. These
// tests provide a fake that holds the real en.json strings and interpolates
// for real (via interpolateI18n), so a missing translate param renders a
// visible raw token that the assertions catch.
const I18N_FIXTURE: Record<string, string> = {
  'aplus.knowledge.campaign_practice_cleared': 'Rung cleared — {{label}} next',
  'aplus.knowledge.campaign_rung_next': 'Next: {{label}}',
  'aplus.knowledge.campaign_rung_4': 'Analyze',
  'aplus.knowledge.campaign_practice_status_failed':
    "Couldn't ready the questions. Please try again.",
  // Keep these BYTE-IDENTICAL to en.json. This fixture is a hand-maintained
  // copy, so it drifts silently: it read "familiar" + an em dash long after
  // en.json had moved to "companion" + a comma, and every assertion still
  // passed against the stale copy.
  'aplus.knowledge.campaign_practice_preparing_long':
    'Your companion is still composing these questions. This can take a few minutes, so feel free to come back later. They will appear here the moment they are ready.',
  'aplus.knowledge.campaign_practice_preparing_timeout':
    'Your companion is still composing these questions. Come back in a little while, or check again now.',
};

class FakeTranslateService {
  instant(key: string, params?: Record<string, string | number>): string {
    const text = I18N_FIXTURE[key] ?? key;
    return params ? interpolateI18n(text, params) : text;
  }
}

/** Configure a TestBed whose TranslateService interpolates the real strings. */
function configureI18n(): void {
  TestBed.configureTestingModule({
    imports: [CampaignPracticeComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: TranslateService,
        useValue: new FakeTranslateService() as unknown as TranslateService,
      },
    ],
  });
}

function createI18n(): {
  fixture: ComponentFixture<CampaignPracticeComponent>;
  httpMock: HttpTestingController;
} {
  const fixture = TestBed.createComponent(CampaignPracticeComponent);
  fixture.componentRef.setInput('goalId', 'goal-1');
  fixture.componentRef.setInput('conceptId', 'concept-1');
  fixture.componentRef.setInput('conceptLabel', 'Addition');
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // effect → load → GET fires
  return { fixture, httpMock };
}

describe('CampaignPracticeComponent — i18n interpolation + pending copy (CHO-2144)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('cleared banner interpolates the next-rung label (no raw {{label}})', () => {
    configureI18n();
    const { fixture, httpMock } = createI18n();
    httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(READY);
    fixture.detectChanges();
    answerActive(fixture, httpMock, 'b', {
      correct: true,
      cleared_rung: 3,
      rungs_cleared: 3,
    });
    const banner = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="cp-banner-cleared"]',
    );
    expect(banner).not.toBeNull();
    const t = banner?.textContent ?? '';
    expect(t).toContain('Rung cleared');
    expect(t).toContain('Analyze'); // the interpolated rung-4 revised-Bloom label
    expect(t).not.toContain('{{'); // no raw i18n token
    httpMock.verify();
  });

  it('failed panel renders no raw {{reason}} token (reason shows in the detail line)', () => {
    configureI18n();
    const { fixture, httpMock } = createI18n();
    httpMock
      .expectOne((r) => r.url.endsWith(QUESTIONS_URL))
      .flush({ ...poll('failed'), failure_reason: 'qgen refused: unsafe' });
    fixture.detectChanges();
    const failed = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="cp-failed"]',
    );
    expect(failed).not.toBeNull();
    expect(failed?.textContent ?? '').not.toContain('{{');
    expect(failed?.textContent ?? '').toContain('qgen refused: unsafe');
    httpMock.verify();
  });

  it('past the fast window it renders real "come back later" copy, no raw token', () => {
    vi.useFakeTimers();
    try {
      configureI18n();
      const { fixture, httpMock } = createI18n();
      httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(poll('requested'));
      fixture.detectChanges();
      // Crew latency exceeds the ~60s fast window (24 × 2.5s). That must read as
      // a pending "come back later", not a dead end, a failure, or a raw token.
      for (let i = 0; i < 24; i++) {
        vi.advanceTimersByTime(2500);
        httpMock.expectOne((r) => r.url.endsWith(QUESTIONS_URL)).flush(poll('requested'));
        fixture.detectChanges();
      }
      const panel = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="cp-preparing-long"]',
      );
      expect(panel).not.toBeNull();
      expect(panel?.textContent ?? '').toContain('come back');
      expect(panel?.textContent ?? '').not.toContain('{{');
      // Owner style rule: no em dashes in shipped copy.
      expect(panel?.textContent ?? '').not.toContain('—');
      httpMock.verify();
    } finally {
      vi.useRealTimers();
    }
  });
});
