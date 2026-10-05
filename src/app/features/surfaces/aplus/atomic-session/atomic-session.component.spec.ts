import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { CourseLearnService } from '../course-learn/course-learn.service';

import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import { AtomAttemptComponent } from './atomic-session.component';
import { AtomAttemptService } from './atomic-session.service';
import {
  CAMPAIGN_RUNG_LABEL_KEYS,
  CAMPAIGN_TOTAL_RUNGS,
} from '../my-knowledge/campaign.model';
import type {
  AtomAttempt,
  AtomAttemptLoadState,
  AtomAttemptStartState,
  AtomAttemptSubmitState,
  LearningAtom,
  McqQuestionPayload,
  OeQuestionPayload,
} from './atomic-session.model';

/**
 * Component spec — Phyllis demo Step 7 atom playback.
 *
 * Wave-2 MCQ tests are deleted (no more option/timer/grade UI). New tests
 * cover the three §2 AsyncState branches across load / start / submit,
 * plus the reading-only render of `atom.title` + `atom.body` and the
 * A16-pending banner for non-outline atoms.
 */

const ATOM_ID = '00000000-0000-7000-8000-00000000a0a1';

function buildAtom(overrides: Partial<LearningAtom> = {}): LearningAtom {
  return {
    atom_id: ATOM_ID,
    atom_type: 'outline',
    body: 'A LearningAtom is the smallest unit of meaning a learner can engage with.',
    course_id: '44444444-4444-7444-8444-444444444444',
    gcid: '00000000-0000-7000-8000-000000001999',
    tenant_id: '11111111-1111-7111-8111-111111111111',
    mode: 'straight-up',
    difficulty: 1,
    revision: 1,
    status: 'published',
    tags: ['aplus', 'reader', 'fundamentals'],
    title: 'A+ : Atomic Learning Primitives',
    created_at: '2026-05-12T19:45:04.992954Z',
    updated_at: '2026-05-14T08:10:08.808962Z',
    ...overrides,
  };
}

function buildSession(overrides: Partial<AtomAttempt> = {}): AtomAttempt {
  return {
    session_id: '019e2b24-759f-76b8-bad8-0926780532ce',
    tenant_id: '11111111-1111-7111-8111-111111111111',
    learner_gcid: '00000000-0000-7000-8000-000000001999',
    atom_id: ATOM_ID,
    status: 'started',
    hints_used: 0,
    answer_count: 0,
    started_at: '2026-05-15T10:17:50.239Z',
    ...overrides,
  };
}

/**
 * Canonical MCQ question_payload, reused by the MCQ describe AND by the
 * session-start / submit describes. The latter two exercise the session/submit
 * panel, which is now suppressed for reading-only atoms — so they must seed a
 * real question atom (not the default reading-only outline) for the panel to render.
 */
const MCQ_PAYLOAD: McqQuestionPayload = {
  type: 'mcq',
  question_id: 'qqq-111',
  prompt: 'Which is the primary aggregate root?',
  options: [
    { option_id: 'opt-a', label: 'LearningAtom' },
    { option_id: 'opt-b', label: 'Course' },
    { option_id: 'opt-c', label: 'LearningPath' },
  ],
  xp_on_correct: 10,
  timer_seconds: 60,
};

class StubAtomAttemptService {
  readonly _loadState: WritableSignal<AtomAttemptLoadState> = signal<AtomAttemptLoadState>({
    status: 'loading',
  });
  readonly _startState: WritableSignal<AtomAttemptStartState> = signal<AtomAttemptStartState>({
    status: 'idle',
  });
  readonly _submitState: WritableSignal<AtomAttemptSubmitState> = signal<AtomAttemptSubmitState>({
    status: 'idle',
  });
  readonly loadState = this._loadState.asReadonly();
  readonly startState = this._startState.asReadonly();
  readonly submitState = this._submitState.asReadonly();
  readonly atom = computed<LearningAtom | null>(() => {
    const s = this._loadState();
    return s.status === 'success' ? s.atom : null;
  });
  readonly session = computed<AtomAttempt | null>(() => {
    const s = this._startState();
    return s.status === 'started' ? s.session : null;
  });

  loadCalls: string[] = [];
  startCalls: string[] = [];
  submitCalls: { atomId: string; body: Record<string, unknown> }[] = [];
  /** CHO-2350: proves the prior atom's session view is cleared on a switch. */
  resetCount = 0;

  load(id: string): void {
    this.loadCalls.push(id);
  }

  resetSession(): void {
    this.resetCount += 1;
    this._startState.set({ status: 'idle' });
    this._submitState.set({ status: 'idle' });
  }
  start(id: string): void {
    this.startCalls.push(id);
  }
  submit(atomId: string, body: Record<string, unknown>): void {
    this.submitCalls.push({ atomId, body });
  }
}

class StubActiveFamiliarService {
  active = signal<null | {
    displayName: string;
    growthStage: number;
    stageName: string;
    species: 'dragon';
  }>(null);
}

function setup(): {
  fixture: ComponentFixture<AtomAttemptComponent>;
  component: AtomAttemptComponent;
  element: HTMLElement;
  service: StubAtomAttemptService;
  familiar: StubActiveFamiliarService;
} {
  const service = new StubAtomAttemptService();
  const familiar = new StubActiveFamiliarService();
  TestBed.configureTestingModule({
    imports: [AtomAttemptComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AtomAttemptService, useValue: service },
      { provide: ActiveFamiliarService, useValue: familiar },
    ],
  });
  const fixture = TestBed.createComponent(AtomAttemptComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
    familiar,
  };
}

describe('AtomAttemptComponent (Phyllis Step 7 - real BFF wiring)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init / load wiring', () => {
    it('creates', () => {
      const { component } = setup();
      expect(component).toBeTruthy();
    });

    it('calls service.load() with the demo seeded atom id when no route param', () => {
      const { service } = setup();
      expect(service.loadCalls).toContain(ATOM_ID);
    });

    it('renders surface-aplus class on root', () => {
      const { element } = setup();
      const root = element.querySelector('[data-testid="aplus-atomic-session"]') as HTMLElement;
      expect(root.classList.contains('surface-aplus')).toBe(true);
    });
  });

  describe('loading branch', () => {
    it('renders the loading panel while state is loading', () => {
      const { element } = setup();
      const panel = element.querySelector('[data-testid="atomic-session-loading"]');
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute('aria-busy')).toBe('true');
    });

    it('does NOT render the reading view or session panel while loading', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="atomic-session-reading"]')).toBeNull();
      expect(element.querySelector('[data-testid="atomic-session-session-panel"]')).toBeNull();
    });
  });

  describe('load error branch (fail loud)', () => {
    it('renders a role=alert error banner with the translated key', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'error',
        error: 'aplus.atomic_session.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="atomic-session-load-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('retry CTA re-fires service.load()', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'error',
        error: 'aplus.atomic_session.error_generic',
      });
      fixture.detectChanges();
      const before = service.loadCalls.length;
      (
        element.querySelector('[data-testid="atomic-session-retry"]') as HTMLButtonElement
      ).click();
      expect(service.loadCalls.length).toBe(before + 1);
      expect(service.loadCalls.at(-1)).toBe(ATOM_ID);
    });
  });

  describe('success branch — render real DTO honestly', () => {
    it('renders title + body from the real DTO', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({ title: 'Real Title', body: 'Real body text.' }),
        partial: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-title"]')?.textContent).toContain(
        'Real Title',
      );
      expect(element.querySelector('[data-testid="atomic-session-body"]')?.textContent).toContain(
        'Real body text.',
      );
    });

    it('renders atom_type chip + atom_id + status', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({ atom_type: 'mcq', status: 'published' }),
        partial: null,
      });
      fixture.detectChanges();
      const typePill = element.querySelector('[data-testid="atomic-session-type"]');
      expect(typePill?.getAttribute('data-atom-type')).toBe('mcq');
      expect(element.querySelector('[data-testid="atomic-session-atom-id"]')?.textContent).toContain(
        ATOM_ID,
      );
      expect(element.querySelector('[data-testid="atomic-session-status"]')?.textContent).toContain(
        'published',
      );
    });

    it('renders tags as chips when non-empty', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({ tags: ['aplus', 'reader'] }),
        partial: null,
      });
      fixture.detectChanges();
      const chips = element.querySelectorAll('[data-testid="atomic-session-tags"] li');
      expect(chips.length).toBe(2);
    });

    it('omits the tags list when tags are empty', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({ tags: [] }),
        partial: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-tags"]')).toBeNull();
    });

    it('does not crash when tags is null (gateway GetAtom returns tags:null for AI-authored atoms)', () => {
      // Regression: the gateway learner projection returns `tags: null` for
      // atoms authored with no tags (e.g. AI-Assist grounded atoms). The model
      // types tags as string[], so the template trusted it and did
      // `a.tags.length` → TypeError → the whole atom render (incl. the MCQ)
      // aborted, so the dose atom looked unplayable. Guard with `a.tags?.length`.
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({ tags: null as unknown as string[] }),
        partial: null,
      });
      expect(() => fixture.detectChanges()).not.toThrow();
      expect(element.querySelector('[data-testid="atomic-session-tags"]')).toBeNull();
    });

    it('shows the partial-notice when session_error is non-null', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom(),
        partial: 'upstream_unavailable',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="atomic-session-partial-notice"]');
      expect(banner).toBeTruthy();
      expect(banner?.textContent).toContain('upstream_unavailable');
    });

    it('omits the partial-notice when partial is null', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom(),
        partial: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-partial-notice"]')).toBeNull();
    });

    it('does not render the A16-pending banner (A16 has shipped — WS-1)', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({ atom_type: 'mcq' }),
        partial: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-a16-notice"]')).toBeNull();
    });

    it('omits the A16 banner for outline atoms', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({ atom_type: 'outline' }),
        partial: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-a16-notice"]')).toBeNull();
    });
  });

  // ── WS-1: MCQ rendering (question_payload.type === 'mcq') ────────────────────
  describe('MCQ rendering — question_payload present', () => {
    function setupMcq() {
      const ctx = setup();
      ctx.service._loadState.set({
        status: 'success',
        atom: buildAtom({ atom_type: 'mcq', question_payload: MCQ_PAYLOAD }),
        partial: null,
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the MCQ question block with data-testid="atomic-session-mcq-question"', () => {
      const { element } = setupMcq();
      expect(element.querySelector('[data-testid="atomic-session-mcq-question"]')).toBeTruthy();
    });

    it('renders the MCQ prompt text', () => {
      const { element } = setupMcq();
      const prompt = element.querySelector('[data-testid="atomic-session-mcq-prompt"]');
      expect(prompt?.textContent).toContain('Which is the primary aggregate root?');
    });

    it('renders N option buttons with positional markers A/B/C', () => {
      const { element } = setupMcq();
      const options = element.querySelectorAll('[data-testid^="atomic-session-mcq-opt-"]');
      expect(options.length).toBe(3);
      // Markers are positional (A/B/C) — never stored, computed at render
      const markers = Array.from(options).map(
        (o) => o.querySelector('[data-testid="mcq-opt-marker"]')?.textContent?.trim(),
      );
      expect(markers).toEqual(['A', 'B', 'C']);
    });

    it('each option button renders the option label text', () => {
      const { element } = setupMcq();
      const optA = element.querySelector('[data-testid="atomic-session-mcq-opt-0"]');
      expect(optA?.textContent).toContain('LearningAtom');
    });

    it('option buttons have aria-label for accessibility', () => {
      const { element } = setupMcq();
      const btns = element.querySelectorAll('[data-testid^="atomic-session-mcq-opt-"]');
      for (const btn of Array.from(btns)) {
        const hasAriaLabel = btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby');
        const hasText = (btn.textContent ?? '').trim().length > 0;
        expect(hasAriaLabel || hasText).toBe(true);
      }
    });

    it('does not show correct_option_id marker in learner mode (absent on payload)', () => {
      const { element } = setupMcq();
      // correct_option_id is undefined in learner mode — no "correct" indicator
      expect(element.querySelector('[data-testid="mcq-correct-indicator"]')).toBeNull();
    });

    it('renders timer when timer_seconds is present', () => {
      const { element } = setupMcq();
      const timer = element.querySelector('[data-testid="atomic-session-mcq-timer"]');
      expect(timer).toBeTruthy();
      expect(timer?.textContent).toContain('60');
    });

    // CHO-1638 — the QUESTION illustration renders on the take path; the
    // model-answer illustration must NEVER appear pre-grade (Security-wins).
    it('renders the QUESTION illustration when question_payload.image_url is present', () => {
      const ctx = setup();
      ctx.service._loadState.set({
        status: 'success',
        atom: buildAtom({
          atom_type: 'mcq',
          question_payload: { ...MCQ_PAYLOAD, image_url: 'https://media.example/q.png' },
        }),
        partial: null,
      });
      ctx.fixture.detectChanges();
      const img = ctx.element.querySelector(
        '[data-testid="atomic-session-mcq-question-image-img"]',
      );
      expect(img?.getAttribute('src')).toBe('https://media.example/q.png');
    });

    it('shows NO question illustration when image_url is absent, and never an answer image', () => {
      const { element } = setupMcq(); // MCQ_PAYLOAD carries no image_url
      expect(
        element.querySelector('[data-testid="atomic-session-mcq-question-image-figure"]'),
      ).toBeNull();
      // There is no model-answer-image affordance anywhere on the take path.
      expect(
        element.querySelector('[data-testid="atomic-session-mcq-answer-image"]'),
      ).toBeNull();
    });

    it('selecting an option sets it as selected (aria-pressed or data-selected)', () => {
      const { element, fixture } = setupMcq();
      const optBtn = element.querySelector(
        '[data-testid="atomic-session-mcq-opt-0"]',
      ) as HTMLButtonElement;
      optBtn.click();
      fixture.detectChanges();
      // After click the option should show selected state
      const selected = element.querySelector('[data-selected="true"]');
      expect(selected).toBeTruthy();
    });

    it('submit CTA sends selected_option_id in body when option is chosen', () => {
      const { service, element, fixture } = setupMcq();
      // Start session so submit button renders
      service._startState.set({
        status: 'started',
        session: buildSession({ session_id: 'sess-mcq' }),
      });
      fixture.detectChanges();

      // Select option 0
      const optBtn = element.querySelector(
        '[data-testid="atomic-session-mcq-opt-0"]',
      ) as HTMLButtonElement;
      optBtn.click();
      fixture.detectChanges();

      // Click submit
      const submitBtn = element.querySelector(
        '[data-testid="atomic-session-submit"]',
      ) as HTMLButtonElement;
      submitBtn?.click();

      expect(service.submitCalls.length).toBe(1);
      expect(service.submitCalls[0].body['selected_option_id']).toBe('opt-a');
      expect(service.submitCalls[0].body['session_id']).toBe('sess-mcq');
    });

    it('does NOT render OE textarea in MCQ mode', () => {
      const { element } = setupMcq();
      expect(element.querySelector('[data-testid="atomic-session-oe-textarea"]')).toBeNull();
    });
  });

  // ── WS-1: MCQ with correct_option_id (author mode) ──────────────────────────
  describe('MCQ author mode — correct_option_id visible', () => {
    it('renders a correct-answer indicator when correct_option_id is present', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({
          atom_type: 'mcq',
          question_payload: {
            type: 'mcq',
            question_id: 'qqq-author',
            options: [
              { option_id: 'opt-x', label: 'Right answer' },
              { option_id: 'opt-y', label: 'Wrong answer' },
            ],
            correct_option_id: 'opt-x',
            xp_on_correct: 15,
          },
        }),
        partial: null,
      });
      fixture.detectChanges();
      const correctIndicator = element.querySelector('[data-testid="mcq-correct-indicator"]');
      expect(correctIndicator).toBeTruthy();
    });
  });

  // ── WS-1: OE rendering (question_payload.type === 'oe') ─────────────────────
  describe('OE rendering — question_payload present', () => {
    const OE_PAYLOAD: OeQuestionPayload = {
      type: 'oe',
      question_id: 'qqq-oe-1',
      prompt: 'Explain the Bimodal Atomic Learning model.',
      rubric: {
        criteria: [
          { criterion_id: 'c1', description: 'Accuracy of definitions', weight_percent: 50 },
          { criterion_id: 'c2', description: 'Clarity of explanation', weight_percent: 30 },
          { criterion_id: 'c3', description: 'Depth of insight', weight_percent: 20 },
        ],
      },
      max_score: 100,
    };

    function setupOe() {
      const ctx = setup();
      ctx.service._loadState.set({
        status: 'success',
        atom: buildAtom({ atom_type: 'essay', question_payload: OE_PAYLOAD }),
        partial: null,
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the OE question block with data-testid="atomic-session-oe-question"', () => {
      const { element } = setupOe();
      expect(element.querySelector('[data-testid="atomic-session-oe-question"]')).toBeTruthy();
    });

    it('renders the OE prompt text', () => {
      const { element } = setupOe();
      const prompt = element.querySelector('[data-testid="atomic-session-oe-prompt"]');
      expect(prompt?.textContent).toContain('Explain the Bimodal Atomic Learning model.');
    });

    it('renders a textarea for the learner response', () => {
      const { element } = setupOe();
      const textarea = element.querySelector('[data-testid="atomic-session-oe-textarea"]');
      expect(textarea).toBeTruthy();
      expect(textarea?.tagName.toLowerCase()).toBe('textarea');
    });

    it('renders rubric criteria list (learner-safe per WS-0b)', () => {
      const { element } = setupOe();
      const rubric = element.querySelector('[data-testid="atomic-session-oe-rubric"]');
      expect(rubric).toBeTruthy();
      const criteria = rubric?.querySelectorAll('[data-testid^="oe-rubric-criterion-"]');
      expect(criteria?.length).toBe(3);
    });

    it('renders criterion description and weight_percent', () => {
      const { element } = setupOe();
      const c1 = element.querySelector('[data-testid="oe-rubric-criterion-c1"]');
      expect(c1?.textContent).toContain('Accuracy of definitions');
      expect(c1?.textContent).toContain('50');
    });

    it('submit CTA sends oe_response in body when textarea has content', () => {
      const { service, element, fixture } = setupOe();
      service._startState.set({
        status: 'started',
        session: buildSession({ session_id: 'sess-oe' }),
      });
      fixture.detectChanges();

      // Type into textarea
      const textarea = element.querySelector(
        '[data-testid="atomic-session-oe-textarea"]',
      ) as HTMLTextAreaElement;
      textarea.value = 'My OE response text here';
      textarea.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const submitBtn = element.querySelector(
        '[data-testid="atomic-session-submit"]',
      ) as HTMLButtonElement;
      submitBtn?.click();

      expect(service.submitCalls.length).toBe(1);
      expect(service.submitCalls[0].body['oe_response']).toBe('My OE response text here');
      expect(service.submitCalls[0].body['session_id']).toBe('sess-oe');
    });

    it('does NOT render MCQ option buttons in OE mode', () => {
      const { element } = setupOe();
      expect(element.querySelector('[data-testid^="atomic-session-mcq-opt-"]')).toBeNull();
    });

    it('max_score is displayed', () => {
      const { element } = setupOe();
      const score = element.querySelector('[data-testid="atomic-session-oe-max-score"]');
      expect(score?.textContent).toContain('100');
    });
  });

  // ── WS-1: Reading-only (no question_payload, body present) ──────────────────
  describe('reading-only mode — no question_payload', () => {
    function setupReadingOnly() {
      const ctx = setup();
      ctx.service._loadState.set({
        status: 'success',
        atom: buildAtom({
          atom_type: 'outline',
          body: 'LearningAtoms are the smallest unit of knowledge.',
        }),
        partial: null,
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the reading view with body text', () => {
      const { element } = setupReadingOnly();
      expect(element.querySelector('[data-testid="atomic-session-reading"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="atomic-session-body"]')?.textContent).toContain(
        'LearningAtoms are the smallest unit of knowledge.',
      );
    });

    it('does not render MCQ or OE question blocks', () => {
      const { element } = setupReadingOnly();
      expect(element.querySelector('[data-testid="atomic-session-mcq-question"]')).toBeNull();
      expect(element.querySelector('[data-testid="atomic-session-oe-question"]')).toBeNull();
    });

    it('renders the Continue/next-atom CTA', () => {
      const { element } = setupReadingOnly();
      expect(element.querySelector('[data-testid="atomic-session-next"]')).toBeTruthy();
    });

    it('suppresses the session/submit panel and shows a no-question notice when reading-only', () => {
      const ctx = setupReadingOnly();
      // Even with a started session, a reading-only atom has no question to
      // answer — the whole session/submit panel must be suppressed.
      ctx.service._startState.set({
        status: 'started',
        session: buildSession(),
      });
      ctx.fixture.detectChanges();
      expect(
        ctx.element.querySelector('[data-testid="atomic-session-session-panel"]'),
      ).toBeNull();
      expect(ctx.element.querySelector('[data-testid="atomic-session-start"]')).toBeNull();
      expect(ctx.element.querySelector('[data-testid="atomic-session-submit"]')).toBeNull();
      expect(
        ctx.element.querySelector('[data-testid="atomic-session-no-question-notice"]'),
      ).toBeTruthy();
    });

    it('submitAnswer() is a no-op for a reading-only atom', () => {
      const ctx = setupReadingOnly();
      ctx.service._startState.set({
        status: 'started',
        session: buildSession(),
      });
      ctx.fixture.detectChanges();
      ctx.component.submitAnswer();
      expect(ctx.service.submitCalls.length).toBe(0);
    });
  });

  describe('session-start branch', () => {
    function setupSuccess() {
      const ctx = setup();
      // Seed an MCQ atom so the session/submit panel renders — the panel is
      // suppressed for reading-only atoms (the default buildAtom() outline).
      ctx.service._loadState.set({
        status: 'success',
        atom: buildAtom({ atom_type: 'mcq', question_payload: MCQ_PAYLOAD }),
        partial: null,
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the Start session CTA when start state is idle', () => {
      const { element } = setupSuccess();
      expect(element.querySelector('[data-testid="atomic-session-start"]')).toBeTruthy();
    });

    it('Start CTA fires service.start()', () => {
      const { service, element } = setupSuccess();
      (
        element.querySelector('[data-testid="atomic-session-start"]') as HTMLButtonElement
      ).click();
      expect(service.startCalls).toContain(ATOM_ID);
    });

    it('renders the starting state while in flight', () => {
      const { service, fixture, element } = setupSuccess();
      service._startState.set({ status: 'starting' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-starting"]')).toBeTruthy();
    });

    it('renders the session meta on success with the real session_id', () => {
      const { service, fixture, element } = setupSuccess();
      service._startState.set({
        status: 'started',
        session: buildSession({ session_id: 'abc-123' }),
      });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="atomic-session-session-id"]')?.textContent,
      ).toContain('abc-123');
    });

    it('renders the start-error banner on failure', () => {
      const { service, fixture, element } = setupSuccess();
      service._startState.set({
        status: 'error',
        error: 'aplus.atomic_session.start_error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="atomic-session-start-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });
  });

  describe('submit branch (Cloud-Armor edge fail-loud)', () => {
    function setupStarted() {
      const ctx = setup();
      // Seed an MCQ atom so the session/submit panel renders — the panel is
      // suppressed for reading-only atoms (the default buildAtom() outline).
      ctx.service._loadState.set({
        status: 'success',
        atom: buildAtom({ atom_type: 'mcq', question_payload: MCQ_PAYLOAD }),
        partial: null,
      });
      ctx.service._startState.set({
        status: 'started',
        session: buildSession({ session_id: 'sess-x' }),
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the Submit answer CTA when started and submit is idle', () => {
      const { element } = setupStarted();
      expect(element.querySelector('[data-testid="atomic-session-submit"]')).toBeTruthy();
    });

    it('Submit CTA fires service.submit() with session_id', () => {
      const { service, element } = setupStarted();
      (
        element.querySelector('[data-testid="atomic-session-submit"]') as HTMLButtonElement
      ).click();
      expect(service.submitCalls.length).toBe(1);
      expect(service.submitCalls[0].atomId).toBe(ATOM_ID);
      expect(service.submitCalls[0].body['session_id']).toBe('sess-x');
    });

    it('renders the Cloud-Armor edge-block error message on 403', () => {
      const { service, fixture, element } = setupStarted();
      service._submitState.set({
        status: 'error',
        error: 'aplus.atomic_session.submit_error_edge_blocked',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="atomic-session-submit-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('renders the submitting status during in-flight submit', () => {
      const { service, fixture, element } = setupStarted();
      service._submitState.set({ status: 'submitting' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-submitting"]')).toBeTruthy();
    });

    it('renders graded state on successful submission', () => {
      const { service, fixture, element } = setupStarted();
      service._submitState.set({
        status: 'graded',
        result: {
          session_id: 'sess-x',
          status: 'in_progress',
          is_correct: true,
          duplicate: false,
          hints_used: 0,
          answer_count: 1,
          paths_advanced: 0,
          paths_completed: 0,
        },
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-graded"]')).toBeTruthy();
    });

    // CHO-2315: a dose answer that folds into today's campaign hex must show
    // the SAME won/cleared/paced/counted feedback as the hex-tap practice lane,
    // instead of pacing silently.
    it('renders the campaign PACED banner when a dose answer paces the rung', () => {
      const { service, fixture, element } = setupStarted();
      service._submitState.set({
        status: 'graded',
        result: {
          session_id: 'sess-x', status: 'in_progress', is_correct: true,
          duplicate: false, hints_used: 0, answer_count: 1,
          paths_advanced: 0, paths_completed: 0,
          campaign: {
            concept_id: 'c-1', concept_key: 'tdd', rung: 3, cleared_rung: 0,
            won: false, paced_today: true, counted: true, is_refresher: false,
          },
        },
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.campaignBanner()).toBe('paced');
      expect(
        element.querySelector('[data-testid="atomic-session-campaign-banner"]'),
      ).toBeTruthy();
    });

    it('renders the campaign CLEARED banner when a dose answer clears a rung', () => {
      const { service, fixture, element } = setupStarted();
      service._submitState.set({
        status: 'graded',
        result: {
          session_id: 'sess-x', status: 'in_progress', is_correct: true,
          duplicate: false, hints_used: 0, answer_count: 1,
          paths_advanced: 0, paths_completed: 0,
          campaign: {
            concept_id: 'c-1', concept_key: 'tdd', rung: 2, cleared_rung: 2,
            won: false, paced_today: false, counted: true, is_refresher: false,
          },
        },
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.campaignBanner()).toBe('cleared');
      expect(
        element.querySelector('[data-testid="atomic-session-campaign-banner"]'),
      ).toBeTruthy();
    });

    it('shows NO campaign banner when the dose answer folded into no campaign', () => {
      const { service, fixture, element } = setupStarted();
      service._submitState.set({
        status: 'graded',
        result: {
          session_id: 'sess-x', status: 'in_progress', is_correct: true,
          duplicate: false, hints_used: 0, answer_count: 1,
          paths_advanced: 0, paths_completed: 0,
        },
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.campaignBanner()).toBeNull();
      expect(
        element.querySelector('[data-testid="atomic-session-campaign-banner"]'),
      ).toBeNull();
    });
  });

  describe('Familiar rail', () => {
    it('omits the rail when no active Familiar', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom(),
        partial: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="atomic-session-familiar"]')).toBeNull();
    });

    it('renders the rail from ActiveFamiliarService when post-hatch', () => {
      const { service, familiar, fixture, element } = setup();
      familiar.active.set({
        displayName: 'Eira',
        growthStage: 2,
        stageName: 'Fledgling',
        species: 'dragon',
      });
      service._loadState.set({
        status: 'success',
        atom: buildAtom(),
        partial: null,
      });
      fixture.detectChanges();
      const rail = element.querySelector('[data-testid="atomic-session-familiar"]');
      expect(rail).toBeTruthy();
      expect(rail?.getAttribute('data-post-hatch')).toBe('true');
      expect(
        element.querySelector('[data-testid="atomic-session-familiar-rank"]')?.textContent,
      ).toContain('FLEDGLING');
    });
  });

  describe('a11y', () => {
    it('uses a single h1 for the atom title when success', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom(),
        partial: null,
      });
      fixture.detectChanges();
      expect(element.querySelectorAll('h1').length).toBe(1);
    });

    it('all interactive elements have accessible names (success branch)', () => {
      const { service, fixture, element } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom(),
        partial: null,
      });
      fixture.detectChanges();
      const buttons = Array.from(element.querySelectorAll('button'));
      for (const btn of buttons) {
        const hasText = (btn.textContent ?? '').trim().length > 0;
        const hasAria = btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby');
        expect(hasText || hasAria).toBe(true);
      }
    });
  });
});

// CHO-2350: "Next atom" must advance the Straight-Up path.
//
// nextAtom() was a hardcoded `navigateByUrl('/a/map')` left over from
// "wave-3 will hand to the LockedPath next" - which never happened. /a/map
// redirects to /a/knowledge, so a learner who finished atom 1 of a course was
// dumped on the Discover surface and had to navigate back to the course by
// hand to reach atom 2. Sighted live on 2026-07-23 twice in one walk: the
// LearningPath advanced correctly (current_index 0 -> 1) while the CTA that
// exists to carry the learner there went somewhere else entirely.
describe('AtomAttemptComponent - next atom advances the path (CHO-2350)', () => {
  const COURSE_ID = '019f8ee2-e718-71bc-ab49-e6c340f938fd';
  const A1 = '019e3262-13dc-7d70-a791-35996c74924f';
  const A2 = '019e32d8-fd0c-7b38-94c1-12d09e807d15';

  function pathWith(atomIds: readonly string[]) {
    return {
      learning_path_id: 'lp-1',
      course_id: COURSE_ID,
      title: 'Science Foundations',
      mode: 'straight-up',
      bootstrapped_at: '2026-07-23T12:00:00Z',
      current_index: 1,
      total_atoms: atomIds.length,
      completed_atoms: 1,
      completed: false,
      atoms: atomIds.map((id, i) => ({
        atom_id: id,
        title: 'Atom ' + (i + 1),
        order: i + 1,
        state: i === 0 ? 'completed' : 'in_progress',
        completed_at: null,
      })),
    };
  }

  function setupNext(opts: {
    currentAtomId: string;
    courseParam: string | null;
    path?: unknown;
    pathErrors?: boolean;
  }) {
    const service = new StubAtomAttemptService();
    const familiar = new StubActiveFamiliarService();
    const courseLearn = {
      getMyLearningPathByCourse: (_id: string) =>
        opts.pathErrors
          ? throwError(() => new Error('boom'))
          : of(opts.path ?? pathWith([A1, A2])),
    };
    TestBed.configureTestingModule({
      imports: [AtomAttemptComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AtomAttemptService, useValue: service },
        { provide: ActiveFamiliarService, useValue: familiar },
        { provide: CourseLearnService, useValue: courseLearn },
        {
          provide: ActivatedRoute,
          useValue: (() => {
            const pm = { get: (k: string) => (k === 'atomId' ? opts.currentAtomId : null) };
            const qm = { get: (k: string) => (k === 'course' ? opts.courseParam : null) };
            return {
              snapshot: { paramMap: pm, queryParamMap: qm },
              paramMap: of(pm),
              queryParamMap: of(qm),
            };
          })(),
        },
      ],
    });
    const fixture = TestBed.createComponent(AtomAttemptComponent);
    const router = TestBed.inject(Router);
    const navigated: string[] = [];
    vi.spyOn(router, 'navigateByUrl').mockImplementation((url: unknown) => {
      navigated.push(String(url));
      return Promise.resolve(true);
    });
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, navigated };
  }

  it('RELOADS the atom when the route param changes (component is reused)', async () => {
    // The regression this exists to stop: navigating to the next atom updated
    // the URL while the player kept rendering the PREVIOUS atom, because
    // atomId was read from route.snapshot exactly once. Right address, wrong
    // content, and it looked like the fix had worked.
    const service = new StubAtomAttemptService();
    const familiar = new StubActiveFamiliarService();
    const paramSubject = new BehaviorSubject<{ get: (k: string) => string | null }>({
      get: (k: string) => (k === 'atomId' ? A1 : null),
    });
    TestBed.configureTestingModule({
      imports: [AtomAttemptComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AtomAttemptService, useValue: service },
        { provide: ActiveFamiliarService, useValue: familiar },
        {
          provide: CourseLearnService,
          useValue: { getMyLearningPathByCourse: () => of(pathWith([A1, A2])) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: paramSubject.value,
              queryParamMap: { get: () => COURSE_ID },
            },
            paramMap: paramSubject,
            queryParamMap: of({ get: () => COURSE_ID }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AtomAttemptComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.atomId).toBe(A1);
    expect(service.loadCalls).toEqual([A1]);

    // Same component instance, new param: it MUST re-read and re-fetch.
    paramSubject.next({ get: (k: string) => (k === 'atomId' ? A2 : null) });
    fixture.detectChanges();

    expect(fixture.componentInstance.atomId).toBe(A2);
    expect(service.loadCalls).toEqual([A1, A2]);
    expect(service.resetCount).toBeGreaterThan(0);
  });

  it('advances to the NEXT atom in the path, carrying the course context', async () => {
    const { component, navigated } = setupNext({ currentAtomId: A1, courseParam: COURSE_ID });
    component.nextAtom();
    await Promise.resolve();
    expect(navigated).toEqual([`/a/atoms/${A2}/play?course=${COURSE_ID}`]);
  });

  it('returns to the course page when the current atom is the LAST one', async () => {
    const { component, navigated } = setupNext({ currentAtomId: A2, courseParam: COURSE_ID });
    component.nextAtom();
    await Promise.resolve();
    expect(navigated).toEqual([`/a/courses/${COURSE_ID}/learn`]);
  });

  it('falls back to the knowledge surface when there is NO course context', async () => {
    const { component, navigated } = setupNext({ currentAtomId: A1, courseParam: null });
    component.nextAtom();
    await Promise.resolve();
    expect(navigated).toEqual(['/a/knowledge']);
  });

  it('falls back to the course page when the path lookup FAILS (never strands the learner)', async () => {
    const { component, navigated } = setupNext({
      currentAtomId: A1,
      courseParam: COURSE_ID,
      pathErrors: true,
    });
    component.nextAtom();
    await Promise.resolve();
    expect(navigated).toEqual([`/a/courses/${COURSE_ID}/learn`]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHO-2405: the player must carry the submit idempotency key.
//
// `POST /v1/me/atom-sessions/{id}/answers` has always accepted `answer_id` as
// an idempotency key: the gateway forwards it, the attempt row persists it, and
// the domain replays the stored result with `duplicate: true` on a match. The
// Angular player never sent one, so every browser submit took the
// non-idempotent path. A retry after a lost reply was therefore graded and
// published a SECOND time on an open attempt, or answered 409
// INVALID_TRANSITION on a completed one, which the learner reads as a failure
// on an answer that in fact succeeded.
//
// These tests pin the key's lifecycle, which is the whole of the fix: one id
// per answer, held across every retry of THAT answer, dropped the moment the
// answer itself changes or the player moves to another atom. Reusing an id
// across two different answers would swallow the second as a replay of the
// first, which is the same defect pointed the other way.
// ─────────────────────────────────────────────────────────────────────────────
describe('AtomAttemptComponent - submit idempotency key (CHO-2405)', () => {
  const OE_PAYLOAD_2405: OeQuestionPayload = {
    type: 'oe',
    question_id: 'qqq-oe-2405',
    prompt: 'Explain the Bimodal Atomic Learning model.',
    max_score: 100,
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  /** Started MCQ session, submit panel rendered. */
  function setupMcqStarted() {
    const ctx = setup();
    ctx.service._loadState.set({
      status: 'success',
      atom: buildAtom({ atom_type: 'mcq', question_payload: MCQ_PAYLOAD }),
      partial: null,
    });
    ctx.service._startState.set({
      status: 'started',
      session: buildSession({ session_id: 'sess-idem' }),
    });
    ctx.fixture.detectChanges();
    return ctx;
  }

  /** Started OE session, submit panel rendered. */
  function setupOeStarted() {
    const ctx = setup();
    ctx.service._loadState.set({
      status: 'success',
      atom: buildAtom({ atom_type: 'essay', question_payload: OE_PAYLOAD_2405 }),
      partial: null,
    });
    ctx.service._startState.set({
      status: 'started',
      session: buildSession({ session_id: 'sess-idem-oe' }),
    });
    ctx.fixture.detectChanges();
    return ctx;
  }

  function clickOption(element: HTMLElement, i: number): void {
    (
      element.querySelector(`[data-testid="atomic-session-mcq-opt-${i}"]`) as HTMLButtonElement
    ).click();
  }

  function clickSubmit(element: HTMLElement): void {
    (element.querySelector('[data-testid="atomic-session-submit"]') as HTMLButtonElement).click();
  }

  function typeOe(element: HTMLElement, text: string): void {
    const textarea = element.querySelector(
      '[data-testid="atomic-session-oe-textarea"]',
    ) as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
  }

  function keyOf(service: StubAtomAttemptService, i: number): unknown {
    return service.submitCalls[i].body['answer_id'];
  }

  // AC "Key is sent"
  it('MCQ submit carries a non-empty answer_id beside session_id and selected_option_id', () => {
    const { service, element, fixture } = setupMcqStarted();
    clickOption(element, 0);
    fixture.detectChanges();
    clickSubmit(element);

    expect(service.submitCalls.length).toBe(1);
    const body = service.submitCalls[0].body;
    expect(body['session_id']).toBe('sess-idem');
    expect(body['selected_option_id']).toBe('opt-a');
    expect(typeof body['answer_id']).toBe('string');
    expect((body['answer_id'] as string).length).toBeGreaterThan(0);
  });

  it('OE submit carries a non-empty answer_id', () => {
    const { service, element, fixture } = setupOeStarted();
    typeOe(element, 'The two modes are Straight-Up and Discovery.');
    fixture.detectChanges();
    clickSubmit(element);

    expect(service.submitCalls.length).toBe(1);
    expect(typeof service.submitCalls[0].body['answer_id']).toBe('string');
    expect((service.submitCalls[0].body['answer_id'] as string).length).toBeGreaterThan(0);
  });

  // AC "Retry is a no-op" / "Retry of the completing answer": the client half
  // of both is the SAME id on the wire; the server does the rest.
  it('a retry of the SAME answer resends the SAME answer_id', () => {
    const { service, element, fixture } = setupMcqStarted();
    clickOption(element, 0);
    fixture.detectChanges();
    clickSubmit(element);

    // The reply was lost, so the player surfaces the failure and offers Try again.
    service._submitState.set({
      status: 'error',
      error: 'aplus.atomic_session.submit_error_upstream',
    });
    fixture.detectChanges();
    (
      element.querySelector(
        '[data-testid="atomic-session-submit-retry"]',
      ) as HTMLButtonElement
    ).click();

    expect(service.submitCalls.length).toBe(2);
    // Assert the key is REAL before asserting it is equal, because two undefineds
    // compare equal and would green this test against the very defect it exists
    // to catch.
    expect(typeof keyOf(service, 0)).toBe('string');
    expect((keyOf(service, 0) as string).length).toBeGreaterThan(0);
    expect(keyOf(service, 1)).toBe(keyOf(service, 0));
  });

  it('re-selecting the SAME option is still the same answer and keeps the key', () => {
    const { service, element, fixture } = setupMcqStarted();
    clickOption(element, 0);
    fixture.detectChanges();
    clickSubmit(element);

    service._submitState.set({ status: 'idle' });
    fixture.detectChanges();
    clickOption(element, 0); // same option, no change of mind
    fixture.detectChanges();
    clickSubmit(element);

    expect(service.submitCalls.length).toBe(2);
    expect(typeof keyOf(service, 0)).toBe('string');
    expect((keyOf(service, 0) as string).length).toBeGreaterThan(0);
    expect(keyOf(service, 1)).toBe(keyOf(service, 0));
  });

  // AC "A new answer still scores"
  it('choosing a DIFFERENT option mints a fresh answer_id', () => {
    const { service, element, fixture } = setupMcqStarted();
    clickOption(element, 0);
    fixture.detectChanges();
    clickSubmit(element);

    service._submitState.set({ status: 'idle' });
    fixture.detectChanges();
    clickOption(element, 1);
    fixture.detectChanges();
    clickSubmit(element);

    expect(service.submitCalls.length).toBe(2);
    expect(service.submitCalls[1].body['selected_option_id']).toBe('opt-b');
    expect(keyOf(service, 1)).not.toBe(keyOf(service, 0));
  });

  it('editing the OE response mints a fresh answer_id', () => {
    const { service, element, fixture } = setupOeStarted();
    typeOe(element, 'First attempt.');
    fixture.detectChanges();
    clickSubmit(element);

    service._submitState.set({ status: 'idle' });
    fixture.detectChanges();
    typeOe(element, 'First attempt, now with the second mode named.');
    fixture.detectChanges();
    clickSubmit(element);

    expect(service.submitCalls.length).toBe(2);
    expect(keyOf(service, 1)).not.toBe(keyOf(service, 0));
  });

  // AC "Key lifecycle": moving to the next question.
  it('moving to another atom drops the key AND the previous answer', () => {
    const service = new StubAtomAttemptService();
    const familiar = new StubActiveFamiliarService();
    const A1 = '019e3262-13dc-7d70-a791-35996c74924f';
    const A2 = '019e32d8-fd0c-7b38-94c1-12d09e807d15';
    const paramSubject = new BehaviorSubject<{ get: (k: string) => string | null }>({
      get: (k: string) => (k === 'atomId' ? A1 : null),
    });
    TestBed.configureTestingModule({
      imports: [AtomAttemptComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AtomAttemptService, useValue: service },
        { provide: ActiveFamiliarService, useValue: familiar },
        {
          provide: CourseLearnService,
          useValue: { getMyLearningPathByCourse: () => of(null) },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: paramSubject.value, queryParamMap: { get: () => null } },
            paramMap: paramSubject,
            queryParamMap: of({ get: () => null }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AtomAttemptComponent);
    const element = fixture.nativeElement as HTMLElement;
    service._loadState.set({
      status: 'success',
      atom: buildAtom({ atom_id: A1, atom_type: 'mcq', question_payload: MCQ_PAYLOAD }),
      partial: null,
    });
    service._startState.set({
      status: 'started',
      session: buildSession({ session_id: 'sess-a1' }),
    });
    fixture.detectChanges();
    clickOption(element, 0);
    fixture.detectChanges();
    clickSubmit(element);
    expect(service.submitCalls.length).toBe(1);

    // Next atom, same component instance, new route param (CHO-2350).
    paramSubject.next({ get: (k: string) => (k === 'atomId' ? A2 : null) });
    fixture.detectChanges();
    service._loadState.set({
      status: 'success',
      atom: buildAtom({ atom_id: A2, atom_type: 'mcq', question_payload: MCQ_PAYLOAD }),
      partial: null,
    });
    service._startState.set({
      status: 'started',
      session: buildSession({ session_id: 'sess-a2' }),
    });
    fixture.detectChanges();

    // The previous answer must not carry over into the new atom's submit.
    expect(fixture.componentInstance.selectedOptionId()).toBeNull();

    clickOption(element, 1);
    fixture.detectChanges();
    clickSubmit(element);

    expect(service.submitCalls.length).toBe(2);
    expect(service.submitCalls[1].body['session_id']).toBe('sess-a2');
    expect(keyOf(service, 1)).not.toBe(keyOf(service, 0));
  });

  // AC "No duplicate feedback"
  describe('duplicate response rendering', () => {
    function gradeDuplicate(ctx: ReturnType<typeof setupMcqStarted>, duplicate: boolean) {
      ctx.service._submitState.set({
        status: 'graded',
        result: {
          session_id: 'sess-idem',
          status: 'completed',
          is_correct: true,
          duplicate,
          hints_used: 0,
          answer_count: 1,
          paths_advanced: 0,
          paths_completed: 0,
          campaign: {
            concept_id: 'c-1',
            concept_key: 'tdd',
            rung: 2,
            cleared_rung: 2,
            won: false,
            paced_today: false,
            counted: true,
            is_refresher: false,
          },
        },
      });
      ctx.fixture.detectChanges();
    }

    it('suppresses the campaign banner on a replay', () => {
      const ctx = setupMcqStarted();
      gradeDuplicate(ctx, true);
      expect(ctx.component.isDuplicateGrade()).toBe(true);
      expect(ctx.component.campaignBanner()).toBeNull();
      expect(
        ctx.element.querySelector('[data-testid="atomic-session-campaign-banner"]'),
      ).toBeNull();
    });

    it('acknowledges the replay instead of repeating the grade message', () => {
      const ctx = setupMcqStarted();
      gradeDuplicate(ctx, true);
      expect(
        ctx.element.querySelector('[data-testid="atomic-session-graded-duplicate"]'),
      ).toBeTruthy();
      expect(ctx.element.querySelector('[data-testid="atomic-session-graded"]')).toBeNull();
    });

    it('still plays the grade and the campaign banner on a FIRST grade', () => {
      const ctx = setupMcqStarted();
      gradeDuplicate(ctx, false);
      expect(ctx.component.isDuplicateGrade()).toBe(false);
      expect(ctx.component.campaignBanner()).toBe('cleared');
      expect(ctx.element.querySelector('[data-testid="atomic-session-graded"]')).toBeTruthy();
      expect(
        ctx.element.querySelector('[data-testid="atomic-session-campaign-banner"]'),
      ).toBeTruthy();
    });
  });

  it('mints a usable key when crypto.randomUUID is unavailable', () => {
    const original = crypto.randomUUID;
    try {
      (crypto as unknown as { randomUUID: unknown }).randomUUID = undefined;
      const { service, element, fixture } = setupMcqStarted();
      clickOption(element, 0);
      fixture.detectChanges();
      clickSubmit(element);
      expect((service.submitCalls[0].body['answer_id'] as string).length).toBeGreaterThan(0);
    } finally {
      (crypto as unknown as { randomUUID: unknown }).randomUUID = original;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage augmentation for the player's public surface.
//
// Landed alongside CHO-2405. The component's AsyncState predicates, the union
// narrowing helpers the template binds through, the campaign banner's won /
// counted / refresher arms and the rung-label edges were all reachable but
// unexercised, which left the file under the 80% frontend gate on branches and
// functions while its behaviour was in fact settled. These are assertions on
// real public members, not padding: each one is a state the player renders.
// ─────────────────────────────────────────────────────────────────────────────
describe('AtomAttemptComponent - state predicates and template helpers', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  function gradedWith(campaign?: Record<string, unknown>): AtomAttemptSubmitState {
    return {
      status: 'graded',
      result: {
        session_id: 'sess-p',
        status: 'in_progress',
        is_correct: true,
        duplicate: false,
        hints_used: 0,
        answer_count: 1,
        paths_advanced: 0,
        paths_completed: 0,
        ...(campaign
          ? {
              campaign: {
                concept_id: 'c-1',
                concept_key: 'tdd',
                rung: 1,
                cleared_rung: 0,
                won: false,
                paced_today: false,
                counted: false,
                is_refresher: false,
                ...campaign,
              } as never,
            }
          : {}),
      },
    };
  }

  describe('load predicates', () => {
    it('isLoading is true only while loading, and carries no error key or partial', () => {
      const { component } = setup();
      expect(component.isLoading()).toBe(true);
      expect(component.isLoadError()).toBe(false);
      expect(component.loadErrorKey()).toBe('');
      expect(component.loadPartial()).toBeNull();
    });

    it('isLoadError and loadErrorKey report the failure', () => {
      const { component, service } = setup();
      service._loadState.set({ status: 'error', error: 'aplus.atomic_session.error_upstream' });
      expect(component.isLoading()).toBe(false);
      expect(component.isLoadError()).toBe(true);
      expect(component.loadErrorKey()).toBe('aplus.atomic_session.error_upstream');
      expect(component.loadPartial()).toBeNull();
    });

    it('loadPartial surfaces a non-fatal side-load failure on success', () => {
      const { component, service } = setup();
      service._loadState.set({ status: 'success', atom: buildAtom(), partial: 'fog degraded' });
      expect(component.isLoadError()).toBe(false);
      expect(component.loadErrorKey()).toBe('');
      expect(component.loadPartial()).toBe('fog degraded');
    });
  });

  describe('session-start predicates', () => {
    it('reports starting, started and the error key across the three states', () => {
      const { component, service } = setup();
      expect(component.isStarting()).toBe(false);
      expect(component.isStarted()).toBe(false);
      expect(component.startErrorKey()).toBe('');

      service._startState.set({ status: 'starting' });
      expect(component.isStarting()).toBe(true);

      service._startState.set({ status: 'started', session: buildSession() });
      expect(component.isStarting()).toBe(false);
      expect(component.isStarted()).toBe(true);

      service._startState.set({
        status: 'error',
        error: 'aplus.atomic_session.start_error_upstream',
      });
      expect(component.isStarted()).toBe(false);
      expect(component.startErrorKey()).toBe('aplus.atomic_session.start_error_upstream');
    });
  });

  describe('submit predicates', () => {
    it('reports submitting, graded and the error key across the three states', () => {
      const { component, service } = setup();
      expect(component.isSubmitting()).toBe(false);
      expect(component.isGraded()).toBe(false);
      expect(component.submitErrorKey()).toBe('');

      service._submitState.set({ status: 'submitting' });
      expect(component.isSubmitting()).toBe(true);

      service._submitState.set(gradedWith());
      expect(component.isSubmitting()).toBe(false);
      expect(component.isGraded()).toBe(true);

      service._submitState.set({
        status: 'error',
        error: 'aplus.atomic_session.submit_error_upstream',
      });
      expect(component.isGraded()).toBe(false);
      expect(component.submitErrorKey()).toBe('aplus.atomic_session.submit_error_upstream');
    });
  });

  describe('campaign banner arms', () => {
    it('is null before any grade', () => {
      const { component } = setup();
      expect(component.campaignOutcome()).toBeNull();
      expect(component.campaignBanner()).toBeNull();
      expect(component.campaignNextRungLabelKey()).toBe('');
    });

    it('WON takes precedence over every other arm', () => {
      const { component, service } = setup();
      service._submitState.set(
        gradedWith({ won: true, cleared_rung: 6, paced_today: true, counted: true }),
      );
      expect(component.campaignBanner()).toBe('won');
    });

    it('COUNTED is the arm when the answer only advanced the rung counter', () => {
      const { component, service } = setup();
      service._submitState.set(gradedWith({ counted: true }));
      expect(component.campaignBanner()).toBe('counted');
    });

    it('a bare refresher shows no banner at all', () => {
      const { component, service } = setup();
      service._submitState.set(gradedWith({ is_refresher: true }));
      expect(component.campaignOutcome()).not.toBeNull();
      expect(component.campaignBanner()).toBeNull();
    });

    it('names the rung a clear UNLOCKED, and stays silent at the top of the ladder', () => {
      const { component, service } = setup();
      service._submitState.set(gradedWith({ cleared_rung: 2 }));
      expect(component.campaignNextRungLabelKey()).toBe(CAMPAIGN_RUNG_LABEL_KEYS[3]);

      // The 6th clear wins the ladder — there is no rung above it to name.
      service._submitState.set(gradedWith({ cleared_rung: CAMPAIGN_TOTAL_RUNGS }));
      expect(component.campaignNextRungLabelKey()).toBe('');
    });
  });

  describe('template union-narrowing helpers', () => {
    const mcq: McqQuestionPayload = MCQ_PAYLOAD;
    const oe: OeQuestionPayload = {
      type: 'oe',
      question_id: 'q-oe',
      max_score: 50,
      rubric: { criteria: [{ criterion_id: 'c1', description: 'Accuracy', weight_percent: 100 }] },
    };

    it('mcqOf narrows only the mcq arm', () => {
      const { component } = setup();
      expect(component.mcqOf(mcq)).toBe(mcq);
      expect(component.mcqOf(oe)).toBeNull();
      expect(component.mcqOf(undefined)).toBeNull();
    });

    it('oeOf narrows only the oe arm', () => {
      const { component } = setup();
      expect(component.oeOf(oe)).toBe(oe);
      expect(component.oeOf(mcq)).toBeNull();
      expect(component.oeOf(undefined)).toBeNull();
    });

    it('oeRubricOf returns the rubric, and null for an mcq or a rubricless oe', () => {
      const { component } = setup();
      expect(component.oeRubricOf(oe)).toBe(oe.rubric);
      expect(component.oeRubricOf({ type: 'oe', question_id: 'q2', max_score: 10 })).toBeNull();
      expect(component.oeRubricOf(mcq)).toBeNull();
      expect(component.oeRubricOf(undefined)).toBeNull();
    });
  });

  describe('atom-type helpers', () => {
    it('discriminate mcq, essay and outline', () => {
      const { component, service } = setup();
      service._loadState.set({ status: 'success', atom: buildAtom({ atom_type: 'mcq' }), partial: null });
      expect(component.isMcqAtom()).toBe(true);
      expect(component.isEssayAtom()).toBe(false);
      expect(component.isOutlineAtom()).toBe(false);

      service._loadState.set({ status: 'success', atom: buildAtom({ atom_type: 'essay' }), partial: null });
      expect(component.isEssayAtom()).toBe(true);

      service._loadState.set({ status: 'success', atom: buildAtom({ atom_type: 'outline' }), partial: null });
      expect(component.isOutlineAtom()).toBe(true);
    });
  });

  describe('Familiar panel naming', () => {
    it('falls back to Eira when the Familiar has been left unnamed', () => {
      const { component, familiar } = setup();
      familiar.active.set({
        displayName: '',
        growthStage: 3,
        stageName: 'Fledgling',
        species: 'dragon',
      });
      expect(component.familiarPanel()?.familiarName).toBe('Eira');
      expect(component.familiarPanel()?.rankLabel).toBe('FLEDGLING');
      expect(component.familiarPanel()?.avatarLevel).toBe('3');
    });
  });

  describe('submit guards', () => {
    it('never fires a submit before a session exists', () => {
      const { component, service } = setup();
      service._loadState.set({
        status: 'success',
        atom: buildAtom({ atom_type: 'mcq', question_payload: MCQ_PAYLOAD }),
        partial: null,
      });
      component.submitAnswer();
      expect(service.submitCalls.length).toBe(0);
    });
  });

  describe('difficulty display', () => {
    it('clamps the star rating to the 1..5 band', () => {
      const { component } = setup();
      expect(component.difficultyLabel(buildAtom({ difficulty: 3 }))).toBe('★★★');
      expect(component.difficultyLabel(buildAtom({ difficulty: 0 }))).toBe('★');
      expect(component.difficultyLabel(buildAtom({ difficulty: 9 }))).toBe('★★★★★');
    });
  });
});
