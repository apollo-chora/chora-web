import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';

import { DailyDoseComponent } from './daily-dose.component';
import { DailyDoseService } from './daily-dose.service';
import {
  TranslateService,
  interpolateI18n,
} from '../../../../core/services/translate.service';
import { provideMockAiTransparency } from '../../../../testing/mock-ai-transparency';
import {
  categoryBadgeClass,
  formatHoursUntil,
  type DailyDose,
  type FamiliarNudge,
} from './daily-dose.model';
import type { LearningAtom } from '../../../../features/atomic/models/atom.models';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import type { FamiliarGrowthState } from '../../../../core/familiar/familiar-growth.model';
import { GoalService } from '../dashboard/goal/goal.service';
import type { GoalDTO } from '../dashboard/goal/goal.model';

/**
 * A+ Daily Dose spec — WS-12 extended.
 *
 * Timer is exercised via `vi.useFakeTimers()` per the canonical chora-web
 * testing memo (NEVER `fakeAsync`). Toggle real timers afterward so axe
 * runs against the live DOM.
 *
 * WS-12 (2026-05-26): DailyDoseService.load() now issues a forkJoin of:
 *   - GET /api/familiar/daily-dose
 *   - POST /api/v1/graphql (QUERY_MY_STREAK)
 * Both must be flushed in setup. The streak call can be drained with an
 * error (non-blocking — dose still renders without streak).
 */

const CANONICAL_DAILY_DOSE: DailyDose = {
  doseId: 'dose-phyllis-2026-05-12',
  servedOn: '2026-05-12',
  atoms: [
    {
      atomId: 'atom-cspo-sprint-review-001',
      courseCode: 'CSPO',
      title: 'Sprint Review — Product Owner Role',
      summary: 'How the PO inspects the increment with stakeholders.',
      category: 'review',
      topic: 'aplus.daily_dose.topic_scrum_events',
      xpOnComplete: 10,
    },
    {
      atomId: 'atom-cspo-backlog-refine-002',
      courseCode: 'CSPO',
      title: 'Backlog Refinement — Splitting User Stories',
      summary: 'Vertical-slice splitting for healthy sprint candidates.',
      category: 'new',
      topic: 'aplus.daily_dose.topic_scrum_events',
      xpOnComplete: 15,
    },
    {
      atomId: 'atom-lean-hypothesis-003',
      courseCode: 'CSPO',
      title: 'Lean Startup — Hypothesis Mapping',
      summary: 'Convert assumptions into testable bets via the hypothesis canvas.',
      category: 'stretch',
      topic: 'aplus.daily_dose.topic_product_vision',
      xpOnComplete: 20,
    },
  ],
  composition: { reviewPercent: 40, newPercent: 30, stretchPercent: 30 },
  totalXpAvailable: 45,
  nextDoseAt: new Date(Date.now() + 1000 * 60 * 60 * 16).toISOString(),
  familiarName: 'Eira the Curious',
  familiarLevel: 12,
  familiarQuote: 'Stay sharp on the basics; today we revisit Sprint Review.',
};

const CANONICAL_STREAK_GQL = {
  data: {
    myStreak: {
      currentDays: 7,
      longestStreak: 14,
      lastActivityAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
      status: 'active',
    },
  },
};

/**
 * Drain the GraphQL streak call (POST /api/v1/graphql with MyStreak op).
 * Flushed with a success by default; pass `error=true` to simulate a
 * GraphQL failure (streak is non-blocking — dose still renders).
 */
function drainStreak(httpMock: HttpTestingController, error = false): void {
  const reqs = httpMock.match((r) => r.url.includes('/api/v1/graphql'));
  for (const req of reqs) {
    if (req.cancelled) continue;
    if (error) {
      req.flush(null, { status: 503, statusText: 'Service Unavailable' });
    } else {
      req.flush(CANONICAL_STREAK_GQL);
    }
  }
}

/**
 * Drain the parallel /api/v1/me/familiars roster fetch (N-Familiar dispatch).
 * Drain the /api/v1/me/mana fetch (mana gating).
 *
 * The mana fixture carries a `familiar_plan` subsidy entry: the committed
 * `nudgeRequiresUpgrade()` gate treats a wallet WITHOUT a `familiar_plan`
 * subsidy as Basic-tier (renders the upsell), so the default fixture must
 * represent a Standard+ user for the nudge-card / nudge-play happy paths.
 * The Basic-tier path is exercised explicitly via `requires_standard_tier`.
 */
function drainAuxiliary(httpMock: HttpTestingController): void {
  for (const req of httpMock.match((r) => r.url.includes('/api/v1/me/familiars'))) {
    if (!req.cancelled) req.flush({ items: [] });
  }
  // CHO-2403: a GOAL-SCOPED dose also loads the goals list, to resolve the
  // Goal's attached Companion for the rail. Unscoped doses never fire it, so
  // this drains zero requests on most tests.
  for (const req of httpMock.match((r) => r.url.endsWith('/api/v1/me/goals'))) {
    if (!req.cancelled) req.flush({ items: [], primaryLens: 'curiosity' });
  }
  for (const req of httpMock.match((r) => r.url.includes('/api/v1/me/mana'))) {
    if (!req.cancelled)
      req.flush({
        balance_units: 100,
        lifetime_earned: 500,
        lifetime_spent: 400,
        subsidy_breakdown: [{ units: 100, source: 'familiar_plan' }],
      });
  }
  // B2-C progressive enhancement: after a successful dose the service fires
  // GET /api/familiar/daily-dose/ai. Drain it degraded → no-op merge so the
  // deterministic greeting stays and the assertions of unrelated tests hold.
  for (const req of httpMock.match((r) => r.url.endsWith('/api/familiar/daily-dose/ai'))) {
    if (!req.cancelled) {
      req.flush({ greeting: '', ai_picks: [], narrative: '', degraded: true });
    }
  }
}

function setup(doseOverride?: Partial<DailyDose>): {
  fixture: ComponentFixture<DailyDoseComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [DailyDoseComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideMockAiTransparency(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(DailyDoseComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();

  // Flush the forkJoin: dose BFF + streak GraphQL (both fired in parallel).
  const dose = { ...CANONICAL_DAILY_DOSE, ...doseOverride };
  const doseReq = httpMock.expectOne((r) => r.url.includes('/api/familiar/daily-dose'));
  doseReq.flush(dose);
  drainStreak(httpMock);
  fixture.detectChanges();
  drainAuxiliary(httpMock);
  fixture.detectChanges();

  return { fixture, httpMock };
}

describe('DailyDoseComponent (WS-12 + Phyllis Step 8)', () => {
  let fixture: ComponentFixture<DailyDoseComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    const result = setup();
    fixture = result.fixture;
    httpMock = result.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
    drainAuxiliary(httpMock);
    httpMock.verify();
  });

  // ── F4 paydown — error-state branch + retry CTA ────────────────────

  describe('error state (F4 paydown)', () => {
    function freshModuleWithError(
      status: number,
      statusText: string,
    ): { fx: ComponentFixture<DailyDoseComponent>; mock: HttpTestingController } {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [DailyDoseComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideMockAiTransparency(),
          provideRouter([]),
          TranslateService,
        ],
      });
      const fx = TestBed.createComponent(DailyDoseComponent);
      const mock = TestBed.inject(HttpTestingController);
      fx.detectChanges();
      mock
        .expectOne((r) => r.url.includes('/api/familiar/daily-dose'))
        .flush(null, { status, statusText });
      drainStreak(mock, true);
      drainAuxiliary(mock);
      fx.detectChanges();
      return { fx, mock };
    }

    it('renders the fail-loud banner when the BFF returns 5xx', () => {
      const { fx, mock } = freshModuleWithError(503, 'Service Unavailable');
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="aplus-daily-dose-error"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="aplus-daily-dose-retry"]')).not.toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('retry CTA re-issues the BFF call and recovers on success', () => {
      const { fx, mock } = freshModuleWithError(503, 'Service Unavailable');
      const el = fx.nativeElement as HTMLElement;
      (el.querySelector('[data-testid="aplus-daily-dose-retry"]') as HTMLButtonElement).click();
      fx.detectChanges();
      mock.expectOne((r) => r.url.includes('/api/familiar/daily-dose')).flush(CANONICAL_DAILY_DOSE);
      drainStreak(mock);
      drainAuxiliary(mock);
      fx.detectChanges();
      expect(el.querySelector('[data-testid="aplus-daily-dose-error"]')).toBeNull();
      expect(el.querySelector('#aplus-daily-dose-heading')).not.toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('renders familiarGreeting + recommenderNarrative when present', () => {
      const { fx, mock } = freshModuleWithError(503, 'Service Unavailable');
      const el = fx.nativeElement as HTMLElement;
      (el.querySelector('[data-testid="aplus-daily-dose-retry"]') as HTMLButtonElement).click();
      fx.detectChanges();
      mock
        .expectOne((r) => r.url.includes('/api/familiar/daily-dose'))
        .flush({
          ...CANONICAL_DAILY_DOSE,
          familiarGreeting: "Welcome back, Phyllis — let's revisit Sprint Review.",
          recommenderNarrative:
            "I picked 2 review atoms based on your last week's lag, plus 1 new Lean Startup tile to widen your KG hex-fog.",
        });
      drainStreak(mock);
      drainAuxiliary(mock);
      fx.detectChanges();
      const greeting = el.querySelector('[data-testid="dose-familiar-greeting"]');
      const narrative = el.querySelector('[data-testid="dose-familiar-narrative"]');
      expect(greeting?.textContent).toContain('Phyllis');
      expect(narrative?.textContent).toContain('KG hex-fog');
      mock.verify();
      fx.destroy();
    });

    it('suppresses a raw-JSON Recommender narrative (never leaks to the learner)', () => {
      const { fx, mock } = freshModuleWithError(503, 'Service Unavailable');
      const el = fx.nativeElement as HTMLElement;
      (el.querySelector('[data-testid="aplus-daily-dose-retry"]') as HTMLButtonElement).click();
      fx.detectChanges();
      mock
        .expectOne((r) => r.url.includes('/api/familiar/daily-dose') && !r.url.endsWith('/ai'))
        .flush({ ...CANONICAL_DAILY_DOSE, recommenderNarrative: '' });
      drainStreak(mock);
      // The /ai coach bails with a fenced JSON envelope (empty-title candidate)
      // — the exact defect observed live. It must NEVER render as prose.
      mock
        .expectOne((r) => r.url.endsWith('/api/familiar/daily-dose/ai'))
        .flush({
          greeting: 'Ember here.',
          ai_picks: [],
          narrative:
            '```json\n{"reason":"Could not generate enough valid recommendations","recommendations":[]}\n```',
          degraded: false,
        });
      drainAuxiliary(mock);
      fx.detectChanges();
      expect(fx.componentInstance.recommenderNarrative()).toBeNull();
      expect(el.querySelector('[data-testid="dose-familiar-narrative"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });
  });

  // ── Surface shell ──────────────────────────────────────────────────

  describe('surface shell', () => {
    it('renders with the surface-aplus accent', () => {
      const root = element.querySelector('[data-testid="aplus-daily-dose"]');
      expect(root?.className).toContain('surface-aplus');
    });

    it('renders the dose heading', () => {
      const heading = element.querySelector('#aplus-daily-dose-heading');
      expect(heading).not.toBeNull();
    });

    it('shows the served-on date', () => {
      const date = element.querySelector('[data-testid="dose-served-on"]');
      expect(date?.textContent?.trim()).toBe('2026-05-12');
    });
  });

  // ── 40/30/30 composition ───────────────────────────────────────────

  describe('40/30/30 composition (Step 8 success criterion)', () => {
    it('renders 3 composition chips', () => {
      const chips = element.querySelectorAll('[data-testid^="composition-"]');
      expect(chips.length).toBe(3);
    });

    it('renders the review chip at 40%', () => {
      const review = element.querySelector('[data-testid="composition-review"]');
      expect(review?.textContent).toContain('40%');
    });

    it('renders the new-exploration chip at 30%', () => {
      const next = element.querySelector('[data-testid="composition-new"]');
      expect(next?.textContent).toContain('30%');
    });

    it('renders the stretch chip at 30%', () => {
      const stretch = element.querySelector('[data-testid="composition-stretch"]');
      expect(stretch?.textContent).toContain('30%');
    });
  });

  // ── Card stack + Ebbinghaus ordering ──────────────────────────────

  describe('card stack (Ebbinghaus-ordered)', () => {
    it('renders exactly 3 atom cards', () => {
      const cards = element.querySelectorAll('[data-testid^="dose-card-atom-"]');
      expect(cards.length).toBe(3);
    });

    it('marks the first card as active by default', () => {
      const cards = element.querySelectorAll('[data-testid^="dose-card-atom-"]');
      expect(cards[0].className).toContain('is-active');
      expect(cards[1].className).toContain('is-behind');
    });

    it('renders the CSPO review atom as the first card (lowest retention = first)', () => {
      const first = element.querySelector('[data-testid="dose-card-atom-cspo-sprint-review-001"]');
      expect(first).not.toBeNull();
      expect(first?.className).toContain('is-active');
    });

    it('advances to the next card via Next button', () => {
      const next = element.querySelector('[data-testid="dose-stack-next"]') as HTMLButtonElement;
      next.click();
      fixture.detectChanges();
      const newAtom = element.querySelector(
        '[data-testid="dose-card-atom-cspo-backlog-refine-002"]',
      );
      expect(newAtom?.className).toContain('is-active');
    });

    it('Prev button is disabled at index 0', () => {
      const prev = element.querySelector('[data-testid="dose-stack-prev"]') as HTMLButtonElement;
      expect(prev.disabled).toBe(true);
    });

    it('Next button is disabled at the last card', () => {
      const next = element.querySelector('[data-testid="dose-stack-next"]') as HTMLButtonElement;
      next.click();
      fixture.detectChanges();
      next.click();
      fixture.detectChanges();
      expect(next.disabled).toBe(true);
    });

    it('selecting a dot navigates to that card', () => {
      const dot = element.querySelector('[data-testid="dose-stack-dot-2"]') as HTMLButtonElement;
      dot.click();
      fixture.detectChanges();
      const lastCard = element.querySelector('[data-testid="dose-card-atom-lean-hypothesis-003"]');
      expect(lastCard?.className).toContain('is-active');
    });

    it('per-card category chip is rendered for each atom', () => {
      const chips = element.querySelectorAll('[data-testid^="dose-card-category-atom-"]');
      expect(chips.length).toBe(3);
    });
  });

  // ── Retention indicators (WS-12) ──────────────────────────────────

  describe('retention indicators (WS-12)', () => {
    it('renders a retention indicator for each atom card', () => {
      const indicators = element.querySelectorAll('[data-testid^="dose-card-retention-atom-"]');
      expect(indicators.length).toBe(3);
    });

    it('review atom shows low-retention indicator (--chora-retention-low)', () => {
      const indicator = element.querySelector(
        '[data-testid="dose-card-retention-atom-cspo-sprint-review-001"]',
      ) as HTMLElement | null;
      expect(indicator).not.toBeNull();
      // color bound inline — check FA icon class for low
      expect(indicator?.querySelector('.fa-circle-exclamation')).not.toBeNull();
    });

    it('new atom shows unknown-retention indicator (--chora-retention-unknown)', () => {
      const indicator = element.querySelector(
        '[data-testid="dose-card-retention-atom-cspo-backlog-refine-002"]',
      ) as HTMLElement | null;
      expect(indicator?.querySelector('.fa-circle-question')).not.toBeNull();
    });

    it('stretch atom shows medium-retention indicator (--chora-retention-medium)', () => {
      const indicator = element.querySelector(
        '[data-testid="dose-card-retention-atom-lean-hypothesis-003"]',
      ) as HTMLElement | null;
      expect(indicator?.querySelector('.fa-circle-half-stroke')).not.toBeNull();
    });

    it('uses explicit retention_state when provided by BE', () => {
      TestBed.resetTestingModule();
      vi.useRealTimers();
      const doseWithRetention: DailyDose = {
        ...CANONICAL_DAILY_DOSE,
        atoms: [
          {
            ...CANONICAL_DAILY_DOSE.atoms[0],
            retention_state: 'high', // explicit BE value overrides proxy
          },
          ...CANONICAL_DAILY_DOSE.atoms.slice(1),
        ],
      };
      vi.useFakeTimers();
      const { fixture: fx, httpMock: mock } = setup({ atoms: doseWithRetention.atoms });
      const el = fx.nativeElement as HTMLElement;
      const indicator = el.querySelector(
        '[data-testid="dose-card-retention-atom-cspo-sprint-review-001"]',
      ) as HTMLElement | null;
      // high state → fa-circle-check icon
      expect(indicator?.querySelector('.fa-circle-check')).not.toBeNull();
      drainAuxiliary(mock);
      mock.verify();
      fx.destroy();
    });
  });

  // ── Streak indicator (WS-12) ───────────────────────────────────────

  describe('streak indicator (WS-12)', () => {
    it('renders the streak badge when streak data is present', () => {
      const streak = element.querySelector('[data-testid="dose-streak"]');
      expect(streak).not.toBeNull();
    });

    it('shows the current streak day count', () => {
      const count = element.querySelector('[data-testid="dose-streak-count"]');
      expect(count?.textContent?.trim()).toBe('7');
    });

    it('does NOT show at-risk warning when last activity was <18h ago', () => {
      // CANONICAL_STREAK_GQL has lastActivityAt = 30 min ago
      const atRisk = element.querySelector('[data-testid="dose-streak-at-risk"]');
      expect(atRisk).toBeNull();
    });

    it('shows at-risk warning when last activity was >18h ago', () => {
      TestBed.resetTestingModule();
      vi.useRealTimers();
      const staleStreak = {
        data: {
          myStreak: {
            currentDays: 3,
            longestStreak: 10,
            lastActivityAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(), // 20h ago
            status: 'active',
          },
        },
      };

      TestBed.configureTestingModule({
        imports: [DailyDoseComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideMockAiTransparency(),
          provideRouter([]),
          TranslateService,
        ],
      });
      const fx = TestBed.createComponent(DailyDoseComponent);
      const mock = TestBed.inject(HttpTestingController);
      vi.useFakeTimers();
      fx.detectChanges();
      mock.expectOne((r) => r.url.includes('/api/familiar/daily-dose')).flush(CANONICAL_DAILY_DOSE);
      for (const req of mock.match((r) => r.url.includes('/api/v1/graphql'))) {
        if (!req.cancelled) req.flush(staleStreak);
      }
      drainAuxiliary(mock);
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      const atRisk = el.querySelector('[data-testid="dose-streak-at-risk"]');
      expect(atRisk).not.toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('omits streak badge when GraphQL call fails (non-blocking)', () => {
      TestBed.resetTestingModule();
      vi.useRealTimers();
      TestBed.configureTestingModule({
        imports: [DailyDoseComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideMockAiTransparency(),
          provideRouter([]),
          TranslateService,
        ],
      });
      const fx = TestBed.createComponent(DailyDoseComponent);
      const mock = TestBed.inject(HttpTestingController);
      vi.useFakeTimers();
      fx.detectChanges();
      mock.expectOne((r) => r.url.includes('/api/familiar/daily-dose')).flush(CANONICAL_DAILY_DOSE);
      drainStreak(mock, true); // simulate GraphQL failure
      drainAuxiliary(mock);
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      // Dose rendered but no streak badge
      expect(el.querySelector('#aplus-daily-dose-heading')).not.toBeNull();
      expect(el.querySelector('[data-testid="dose-streak"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });
  });

  // ── Per-Familiar nudge (WS-12-NUDGE) ──────────────────────────────

  describe('per-Familiar nudge (WS-12-NUDGE)', () => {
    it('does NOT render nudge card when familiar_nudge is absent', () => {
      expect(element.querySelector('[data-testid="dose-nudge-card"]')).toBeNull();
      expect(element.querySelector('[data-testid="dose-nudge-upsell"]')).toBeNull();
    });

    it('renders nudge card when familiar_nudge is present (Standard+ user)', () => {
      TestBed.resetTestingModule();
      vi.useRealTimers();
      const nudge: FamiliarNudge = {
        familiar_name: 'Eira',
        atom_id: 'atom-nudge-001',
        atom_title: 'Sprint Planning Essentials',
        requires_standard_tier: false,
      };
      const doseWithNudge: Partial<DailyDose> = { familiar_nudge: nudge };
      vi.useFakeTimers();
      const { fixture: fx, httpMock: mock } = setup(doseWithNudge);
      const el = fx.nativeElement as HTMLElement;
      const nudgeCard = el.querySelector('[data-testid="dose-nudge-card"]');
      expect(nudgeCard).not.toBeNull();
      const atomTitle = el.querySelector('[data-testid="dose-nudge-atom-title"]');
      expect(atomTitle?.textContent).toContain('Sprint Planning Essentials');
      drainAuxiliary(mock);
      mock.verify();
      fx.destroy();
    });

    it('renders upsell card when familiar_nudge.requires_standard_tier = true (Basic user)', () => {
      TestBed.resetTestingModule();
      vi.useRealTimers();
      const nudge: FamiliarNudge = {
        familiar_name: 'Eira',
        atom_id: 'atom-nudge-001',
        atom_title: 'Sprint Planning Essentials',
        requires_standard_tier: true,
      };
      vi.useFakeTimers();
      const { fixture: fx, httpMock: mock } = setup({ familiar_nudge: nudge });
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-nudge-upsell"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="dose-nudge-card"]')).toBeNull();
      const upgradeCta = el.querySelector('[data-testid="dose-nudge-upgrade-cta"]');
      expect(upgradeCta).not.toBeNull();
      drainAuxiliary(mock);
      mock.verify();
      fx.destroy();
    });

    it('nudge play button routes to /a/atoms/{id}/play', () => {
      TestBed.resetTestingModule();
      vi.useRealTimers();
      const nudge: FamiliarNudge = {
        familiar_name: 'Eira',
        atom_id: 'atom-nudge-001',
        atom_title: 'Sprint Planning Essentials',
        requires_standard_tier: false,
      };
      vi.useFakeTimers();
      const { fixture: fx, httpMock: mock } = setup({ familiar_nudge: nudge });
      const el = fx.nativeElement as HTMLElement;
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      (el.querySelector('[data-testid="dose-nudge-play"]') as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith(
        ['/a', 'atoms', 'atom-nudge-001', 'play'],
        expect.objectContaining({ queryParams: { returnUrl: '/a/daily-dose' } }),
      );
      drainAuxiliary(mock);
      mock.verify();
      fx.destroy();
    });
  });

  // ── Play CTA routing (WS-12) ───────────────────────────────────────

  describe('Phyllis demo touchpoints', () => {
    it('XP rollup shows +45 (sum of 10+15+20)', () => {
      const xp = element.querySelector('[data-testid="dose-total-xp"]');
      expect(xp?.textContent).toContain('+45 XP');
    });

    it('Play CTA routes to /a/atoms/{id}/play with returnUrl', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const play = element.querySelector(
        '[data-testid="dose-card-play-atom-cspo-sprint-review-001"]',
      ) as HTMLButtonElement;
      play.click();
      expect(spy).toHaveBeenCalledWith(
        ['/a', 'atoms', 'atom-cspo-sprint-review-001', 'play'],
        expect.objectContaining({ queryParams: { returnUrl: '/a/daily-dose' } }),
      );
    });
  });

  // ── Eira the Curious — Familiar panel ─────────────────────────────

  describe('Eira the Curious — Familiar panel', () => {
    it('renders the Familiar panel', () => {
      const panel = element.querySelector('[data-testid="dose-familiar-panel"]');
      expect(panel?.textContent).toContain('Eira the Curious');
    });

    it('exposes the Familiar quote', () => {
      const quote = element.querySelector('[data-testid="dose-familiar-quote"]');
      expect(quote?.textContent?.trim()).toBeTruthy();
    });
  });

  // ── Countdown timer ────────────────────────────────────────────────

  describe('countdown timer (Tomorrow)', () => {
    it('renders the countdown chip', () => {
      const cd = element.querySelector('[data-testid="dose-countdown"]');
      expect(cd?.textContent?.trim()).toMatch(/^\d\d:\d\d:\d\d$/);
    });

    it('updates the countdown after 1 second of fake time', () => {
      const cd = element.querySelector('[data-testid="dose-countdown"]');
      const before = cd?.textContent?.trim();
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
      const after = cd?.textContent?.trim();
      expect(after).not.toBe(before);
    });
  });

  // ── Pure helpers ───────────────────────────────────────────────────

  describe('helpers', () => {
    it('formatHoursUntil returns 00:00:00 in the past', () => {
      expect(formatHoursUntil('2020-01-01T00:00:00Z', new Date('2026-05-12T00:00:00Z'))).toBe(
        '00:00:00',
      );
    });

    it('formatHoursUntil returns a sane HH:MM:SS for 1h05m10s', () => {
      const now = new Date('2026-05-12T00:00:00Z');
      const next = new Date('2026-05-12T01:05:10Z').toISOString();
      expect(formatHoursUntil(next, now)).toBe('01:05:10');
    });

    it('categoryBadgeClass maps review/new/stretch correctly', () => {
      expect(categoryBadgeClass('review')).toBe('badge-info');
      expect(categoryBadgeClass('new')).toBe('badge-success');
      expect(categoryBadgeClass('stretch')).toBe('badge-warning');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // AUGMENTED COVERAGE (uncovered branches / methods / states)
  // ════════════════════════════════════════════════════════════════════

  /**
   * Mount a fresh module WITHOUT auto-flushing the dose request, returning
   * the live request handles. Lets a test assert the loading state and/or
   * flush the dose with a custom mana payload (for the secondary mana gate).
   */
  function mountFresh(): {
    fx: ComponentFixture<DailyDoseComponent>;
    mock: HttpTestingController;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DailyDoseComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideMockAiTransparency(),
        provideRouter([]),
        TranslateService,
      ],
    });
    const fx = TestBed.createComponent(DailyDoseComponent);
    const mock = TestBed.inject(HttpTestingController);
    return { fx, mock };
  }

  /** Flush dose + streak + familiars + a CUSTOM mana wallet (no familiar_plan). */
  function flushWithMana(mock: HttpTestingController, dose: DailyDose, mana: unknown): void {
    mock
      .expectOne((r) => r.url.includes('/api/familiar/daily-dose') && !r.url.endsWith('/ai'))
      .flush(dose);
    drainStreak(mock);
    for (const req of mock.match((r) => r.url.includes('/api/v1/me/familiars'))) {
      if (!req.cancelled) req.flush({ items: [] });
    }
    for (const req of mock.match((r) => r.url.includes('/api/v1/me/mana'))) {
      if (!req.cancelled) req.flush(mana as object);
    }
    // Drain the B2-C progressive-enhancement AI call (fired post-success).
    for (const req of mock.match((r) => r.url.endsWith('/api/familiar/daily-dose/ai'))) {
      if (!req.cancelled) {
        req.flush({ greeting: '', ai_picks: [], narrative: '', degraded: true });
      }
    }
  }

  // ── Loading state ──────────────────────────────────────────────────

  describe('loading state', () => {
    it('renders the loading spinner before the dose resolves', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      // Dose + streak are still in-flight → loading branch.
      expect(el.querySelector('[data-testid="aplus-daily-dose-loading"]')).not.toBeNull();
      expect(el.querySelector('#aplus-daily-dose-heading')).toBeNull();
      // Drain everything to satisfy verify().
      mock.expectOne((r) => r.url.includes('/api/familiar/daily-dose')).flush(CANONICAL_DAILY_DOSE);
      drainStreak(mock);
      drainAuxiliary(mock);
      fx.detectChanges();
      mock.verify();
      fx.destroy();
    });
  });

  // ── Familiar greeting + recommender narrative (success path) ───────

  describe('familiar greeting + narrative (success path)', () => {
    it('renders greeting + narrative directly on first load when present', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      mock
        .expectOne((r) => r.url.includes('/api/familiar/daily-dose'))
        .flush({
          ...CANONICAL_DAILY_DOSE,
          familiarGreeting: 'Good to see you again.',
          recommenderNarrative: 'Two Ebbinghaus-overdue atoms plus one fresh tile.',
        });
      drainStreak(mock);
      drainAuxiliary(mock);
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-familiar-greeting"]')?.textContent).toContain(
        'Good to see you again',
      );
      expect(el.querySelector('[data-testid="dose-familiar-narrative"]')?.textContent).toContain(
        'fresh tile',
      );
      mock.verify();
      fx.destroy();
    });

    it('omits greeting + narrative blocks when absent', () => {
      // The default fixture carries neither field.
      expect(element.querySelector('[data-testid="dose-familiar-greeting"]')).toBeNull();
      expect(element.querySelector('[data-testid="dose-familiar-narrative"]')).toBeNull();
    });
  });

  // ── Secondary mana gate (nudgeRequiresUpgrade client-side) ─────────

  describe('secondary mana gate (nudgeRequiresUpgrade)', () => {
    const baseNudge: FamiliarNudge = {
      familiar_name: 'Eira',
      atom_id: 'atom-nudge-777',
      atom_title: 'Velocity Forecasting',
      requires_standard_tier: false,
    };

    it('renders upsell when nudge present but wallet has NO familiar_plan subsidy', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushWithMana(
        mock,
        { ...CANONICAL_DAILY_DOSE, familiar_nudge: baseNudge },
        {
          balance_units: 50,
          lifetime_earned: 100,
          lifetime_spent: 50,
          subsidy_breakdown: [{ units: 50, source: 'tenant_pool' }],
        },
      );
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      // No familiar_plan subsidy ⇒ treated as Basic ⇒ upsell card, not nudge card.
      expect(el.querySelector('[data-testid="dose-nudge-upsell"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="dose-nudge-card"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('renders nudge card when wallet HAS a familiar_plan subsidy (Standard+)', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushWithMana(
        mock,
        { ...CANONICAL_DAILY_DOSE, familiar_nudge: baseNudge },
        {
          balance_units: 50,
          lifetime_earned: 100,
          lifetime_spent: 50,
          subsidy_breakdown: [{ units: 50, source: 'familiar_plan' }],
        },
      );
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-nudge-card"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="dose-nudge-upsell"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('treats a missing subsidy_breakdown as Basic (renders upsell)', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushWithMana(
        mock,
        { ...CANONICAL_DAILY_DOSE, familiar_nudge: baseNudge },
        { balance_units: 50, lifetime_earned: 100, lifetime_spent: 50 },
      );
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-nudge-upsell"]')).not.toBeNull();
      mock.verify();
      fx.destroy();
    });
  });

  // ── Component method branches (direct invocation) ──────────────────

  describe('component method branches', () => {
    it('playActiveAtom routes for the active carousel atom', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const comp = fixture.componentInstance;
      comp.playActiveAtom();
      expect(spy).toHaveBeenCalledWith(
        ['/a', 'atoms', 'atom-cspo-sprint-review-001', 'play'],
        expect.objectContaining({ queryParams: { returnUrl: '/a/daily-dose' } }),
      );
    });

    it('playNudgeAtom is a no-op when there is no nudge', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      // Default fixture has no familiar_nudge.
      fixture.componentInstance.playNudgeAtom();
      expect(spy).not.toHaveBeenCalled();
    });

    it('playNudgeAtom is a no-op when the nudge requires Standard tier', () => {
      TestBed.resetTestingModule();
      vi.useRealTimers();
      const nudge: FamiliarNudge = {
        familiar_name: 'Eira',
        atom_id: 'atom-nudge-001',
        atom_title: 'Sprint Planning Essentials',
        requires_standard_tier: true,
      };
      vi.useFakeTimers();
      const { fixture: fx, httpMock: mock } = setup({ familiar_nudge: nudge });
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      fx.componentInstance.playNudgeAtom();
      expect(spy).not.toHaveBeenCalled();
      drainAuxiliary(mock);
      mock.verify();
      fx.destroy();
    });

    it('goPrev at index 0 is a no-op (guarded by canGoPrev)', () => {
      const comp = fixture.componentInstance;
      expect(comp.activeIndex()).toBe(0);
      comp.goPrev();
      expect(comp.activeIndex()).toBe(0);
    });

    it('goNext at the last index is a no-op (guarded by canGoNext)', () => {
      const comp = fixture.componentInstance;
      comp.selectIndex(2); // last of 3 atoms
      expect(comp.activeIndex()).toBe(2);
      comp.goNext();
      expect(comp.activeIndex()).toBe(2);
    });

    it('selectIndex ignores a negative index', () => {
      const comp = fixture.componentInstance;
      comp.selectIndex(1);
      comp.selectIndex(-1);
      expect(comp.activeIndex()).toBe(1);
    });

    it('selectIndex ignores an out-of-range index', () => {
      const comp = fixture.componentInstance;
      comp.selectIndex(1);
      comp.selectIndex(99);
      expect(comp.activeIndex()).toBe(1);
    });

    it('categoryLabelKey returns the per-category i18n key', () => {
      const comp = fixture.componentInstance;
      expect(comp.categoryLabelKey(CANONICAL_DAILY_DOSE.atoms[0])).toBe(
        'aplus.daily_dose.category_review',
      );
      expect(comp.categoryLabelKey(CANONICAL_DAILY_DOSE.atoms[1])).toBe(
        'aplus.daily_dose.category_new',
      );
      expect(comp.categoryLabelKey(CANONICAL_DAILY_DOSE.atoms[2])).toBe(
        'aplus.daily_dose.category_stretch',
      );
    });

    it('retentionLabel derives the i18n key from category when no explicit state', () => {
      const comp = fixture.componentInstance;
      // review → low ; stretch → medium ; new → unknown
      expect(comp.retentionLabel(CANONICAL_DAILY_DOSE.atoms[0])).toBe(
        'aplus.daily_dose.retention_low',
      );
      expect(comp.retentionLabel(CANONICAL_DAILY_DOSE.atoms[2])).toBe(
        'aplus.daily_dose.retention_medium',
      );
      expect(comp.retentionLabel(CANONICAL_DAILY_DOSE.atoms[1])).toBe(
        'aplus.daily_dose.retention_unknown',
      );
    });

    it('retentionLabel honours an explicit retention_state over the category proxy', () => {
      const comp = fixture.componentInstance;
      expect(
        comp.retentionLabel({ ...CANONICAL_DAILY_DOSE.atoms[0], retention_state: 'high' }),
      ).toBe('aplus.daily_dose.retention_high');
    });

    it('retentionColorVar uses the design-system token for the derived state', () => {
      const comp = fixture.componentInstance;
      expect(comp.retentionColorVar(CANONICAL_DAILY_DOSE.atoms[0])).toBe(
        'var(--chora-retention-low)',
      );
    });
  });

  // ── progressPercent reactivity ─────────────────────────────────────

  describe('progress fill', () => {
    it('progress fill grows as the carousel advances', () => {
      const fill = element.querySelector('.dose-progress__fill') as HTMLElement;
      // 1/3 ⇒ 33%
      expect(fill.style.width).toBe('33%');
      const next = element.querySelector('[data-testid="dose-stack-next"]') as HTMLButtonElement;
      next.click();
      fixture.detectChanges();
      // 2/3 ⇒ 67%
      expect(fill.style.width).toBe('67%');
      next.click();
      fixture.detectChanges();
      // 3/3 ⇒ 100%
      expect(fill.style.width).toBe('100%');
    });
  });

  // ── streakAtRisk additional branches ───────────────────────────────

  describe('streakAtRisk branches', () => {
    function mountWithStreak(streakData: unknown): {
      fx: ComponentFixture<DailyDoseComponent>;
      mock: HttpTestingController;
    } {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      mock.expectOne((r) => r.url.includes('/api/familiar/daily-dose')).flush(CANONICAL_DAILY_DOSE);
      for (const req of mock.match((r) => r.url.includes('/api/v1/graphql'))) {
        if (!req.cancelled) req.flush(streakData as object);
      }
      drainAuxiliary(mock);
      fx.detectChanges();
      return { fx, mock };
    }

    it('is NOT at risk when the streak status is broken (even if >18h)', () => {
      const { fx, mock } = mountWithStreak({
        data: {
          myStreak: {
            currentDays: 0,
            longestStreak: 9,
            lastActivityAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
            status: 'broken',
          },
        },
      });
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-streak-at-risk"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('is NOT at risk when lastActivityAt is empty', () => {
      const { fx, mock } = mountWithStreak({
        data: {
          myStreak: {
            currentDays: 4,
            longestStreak: 9,
            lastActivityAt: '',
            status: 'active',
          },
        },
      });
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-streak"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="dose-streak-at-risk"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });
  });

  // ── Accessibility semantics ────────────────────────────────────────

  describe('a11y semantics', () => {
    it('non-active cards have aria-hidden=true', () => {
      const second = element.querySelector(
        '[data-testid="dose-card-atom-cspo-backlog-refine-002"]',
      );
      expect(second?.getAttribute('aria-hidden')).toBe('true');
    });

    it('active dot has aria-current=true', () => {
      const dot = element.querySelector('[data-testid="dose-stack-dot-0"]') as HTMLButtonElement;
      expect(dot.getAttribute('aria-current')).toBe('true');
    });

    it('retention indicators have aria-label', () => {
      const indicator = element.querySelector(
        '[data-testid="dose-card-retention-atom-cspo-sprint-review-001"]',
      );
      expect(indicator?.getAttribute('aria-label')).toBeTruthy();
    });

    it('streak badge has aria-label', () => {
      const streak = element.querySelector('[data-testid="dose-streak"]');
      expect(streak?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // BRANCH-COVERAGE WAVE — currently-uncovered conditional arms
  // ════════════════════════════════════════════════════════════════════

  /**
   * Mount in the ERROR state so `dose()` resolves to `null`. The component
   * instance is then poked directly to force evaluation of the null-dose /
   * empty-atoms arms of the derived computed signals (the template guards
   * them away in the error branch, so they are otherwise never evaluated).
   */
  function mountErrorState(): {
    fx: ComponentFixture<DailyDoseComponent>;
    mock: HttpTestingController;
  } {
    vi.useRealTimers();
    const { fx, mock } = mountFresh();
    vi.useFakeTimers();
    fx.detectChanges();
    mock
      .expectOne((r) => r.url.includes('/api/familiar/daily-dose'))
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    drainStreak(mock, true);
    drainAuxiliary(mock);
    fx.detectChanges();
    return { fx, mock };
  }

  describe('derived signals — null-dose / empty-atoms arms', () => {
    it('atoms() falls back to [] and activeAtom() to null when dose is null', () => {
      const { fx, mock } = mountErrorState();
      const comp = fx.componentInstance;
      // bid=2 — `this.dose()?.atoms ?? []` RHS fires (dose null).
      expect(comp.atoms()).toEqual([]);
      // bid=3 — `atoms[idx] ?? null` null arm (empty atoms, idx 0).
      expect(comp.activeAtom()).toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('composition() and totalXp() fall back when dose is null', () => {
      const { fx, mock } = mountErrorState();
      const comp = fx.componentInstance;
      // bid=4 — composition `?? null`.
      expect(comp.composition()).toBeNull();
      // bid=5 — totalXp `?? 0`.
      expect(comp.totalXp()).toBe(0);
      mock.verify();
      fx.destroy();
    });

    it('countdownLabel() returns the placeholder when dose is null', () => {
      const { fx, mock } = mountErrorState();
      // bid=6 — `if (!dose) return '--:--:--'` true arm.
      expect(fx.componentInstance.countdownLabel()).toBe('--:--:--');
      mock.verify();
      fx.destroy();
    });

    it('progressPercent() returns 0 for an empty atom list', () => {
      const { fx, mock } = mountErrorState();
      // bid=7 — `if (atoms.length === 0) return 0` true arm.
      expect(fx.componentInstance.progressPercent()).toBe(0);
      mock.verify();
      fx.destroy();
    });

    it('playActiveAtom() is a no-op when there is no active atom', () => {
      const { fx, mock } = mountErrorState();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      // bid=25 — `if (!atom) return` true arm (activeAtom null).
      fx.componentInstance.playActiveAtom();
      expect(spy).not.toHaveBeenCalled();
      mock.verify();
      fx.destroy();
    });

    it('errorKey() returns an empty string when the state is not error', () => {
      // bid=0 — `s.status === 'error' ? s.error : ''` falsy arm.
      // The default (beforeEach) fixture is in the success state.
      expect(fixture.componentInstance.errorKey()).toBe('');
    });
  });

  // ── Empty dose (the atom pool composed nothing) ─────────────────────
  //
  // The BFF answers 200 with `atoms: []` whenever the learner's atom universe
  // yields nothing (not enrolled, nothing projected yet). Before this block the
  // template had NO `@empty` and no length guard, so the page rendered the full
  // chrome (composition chips, prev/next nav, dot list, progress bar) wrapped
  // around a card stack containing zero cards, and the honest copy the BE
  // already composes in `message` was parsed and then dropped on the floor.
  //
  // Shape + testid convention mirror `campaign-practice` (`cp-empty`), which
  // already had this state machine.
  describe('empty dose (zero atoms composed)', () => {
    /** Mount a fresh fixture whose dose carries `atoms: []`. */
    function mountEmpty(doseOverride?: Partial<DailyDose>): {
      fx: ComponentFixture<DailyDoseComponent>;
      mock: HttpTestingController;
    } {
      TestBed.resetTestingModule();
      const r = setup({ atoms: [], ...doseOverride });
      return { fx: r.fixture, mock: r.httpMock };
    }

    it('renders the empty panel instead of an empty card stack', () => {
      const { fx, mock } = mountEmpty();
      const el = fx.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="dose-empty"]')).not.toBeNull();

      mock.verify();
      fx.destroy();
    });

    it('surfaces the BFF `message` copy verbatim (never drops it)', () => {
      const message =
        'No atoms queued yet - enrol in a course or check back once new atoms are published.';
      const { fx, mock } = mountEmpty({ message });
      const el = fx.nativeElement as HTMLElement;

      const panel = el.querySelector('[data-testid="dose-empty"]');
      expect(panel?.textContent).toContain(message);

      mock.verify();
      fx.destroy();
    });

    it('falls back to local copy when the BFF sends no message', () => {
      const { fx, mock } = mountEmpty();
      const el = fx.nativeElement as HTMLElement;

      const panel = el.querySelector('[data-testid="dose-empty"]');
      // translate pipe echoes the key in tests.
      expect(panel?.textContent).toContain('aplus.daily_dose.empty_body');

      mock.verify();
      fx.destroy();
    });

    it('treats a blank message as absent and uses the fallback copy', () => {
      const { fx, mock } = mountEmpty({ message: '   ' });
      const el = fx.nativeElement as HTMLElement;

      const panel = el.querySelector('[data-testid="dose-empty"]');
      expect(panel?.textContent).toContain('aplus.daily_dose.empty_body');

      mock.verify();
      fx.destroy();
    });

    it('suppresses the stack nav, dot list and progress bar', () => {
      const { fx, mock } = mountEmpty();
      const el = fx.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="dose-stack-prev"]')).toBeNull();
      expect(el.querySelector('[data-testid="dose-stack-next"]')).toBeNull();
      expect(el.querySelector('[data-testid="dose-stack-dots"]')).toBeNull();
      expect(el.querySelector('.dose-progress')).toBeNull();

      mock.verify();
      fx.destroy();
    });

    it('suppresses the composition chips (40/30/30 over zero atoms is a fiction)', () => {
      const { fx, mock } = mountEmpty();
      const el = fx.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="dose-composition"]')).toBeNull();

      mock.verify();
      fx.destroy();
    });

    it('offers a catalogue CTA so the learner has a real next step', () => {
      const { fx, mock } = mountEmpty();
      const el = fx.nativeElement as HTMLElement;

      const cta = el.querySelector('[data-testid="dose-empty-browse"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('A');
      expect(cta?.getAttribute('href')).toBe('/a/catalog');

      mock.verify();
      fx.destroy();
    });

    it('keeps the Companion rail (the greeting is still real)', () => {
      const { fx, mock } = mountEmpty();
      const el = fx.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="dose-familiar-panel"]')).not.toBeNull();

      mock.verify();
      fx.destroy();
    });

    // POSITIVE CONTROL: without this, a selector typo in the assertions above
    // would read as "empty state works" on every dose, populated or not.
    it('POSITIVE CONTROL: a populated dose still renders the stack and no empty panel', () => {
      TestBed.resetTestingModule();
      const { fixture: fx, httpMock: mock } = setup();
      const el = fx.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="dose-empty"]')).toBeNull();
      expect(el.querySelector('[data-testid="dose-stack-prev"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="dose-stack-dots"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="dose-composition"]')).not.toBeNull();

      mock.verify();
      fx.destroy();
    });

    it('isEmpty() is false while loading and while erroring', () => {
      const { fx, mock } = mountErrorState();
      // An error is NOT an empty dose; the two states must not collide.
      expect(fx.componentInstance.isEmpty()).toBe(false);
      expect((fx.nativeElement as HTMLElement).querySelector('[data-testid="dose-empty"]'))
        .toBeNull();

      mock.verify();
      fx.destroy();
    });
  });

  describe('guard true-arms (goPrev / nudgeRequiresUpgrade)', () => {
    it('goPrev() decrements the index when not at the first card', () => {
      const comp = fixture.componentInstance;
      comp.selectIndex(2);
      expect(comp.activeIndex()).toBe(2);
      // bid=21 — `if (this.canGoPrev())` true arm decrements.
      comp.goPrev();
      expect(comp.activeIndex()).toBe(1);
    });

    it('nudgeRequiresUpgrade() short-circuits to false when no nudge', () => {
      // bid=13 — `if (!nudge) return false` true arm. Default fixture has
      // no familiar_nudge, so this returns false without touching mana.
      expect(fixture.componentInstance.nudgeRequiresUpgrade()).toBe(false);
    });
  });

  describe('ngOnDestroy defensive guard', () => {
    it('destroying before ngOnInit runs leaves tickHandle null (no clearInterval)', () => {
      // bid=20 — the `if (this.tickHandle !== null)` FALSE arm. Creating the
      // component WITHOUT detectChanges() means ngOnInit (which sets the
      // handle) never fires; the DestroyRef teardown then sees a null handle.
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      // The constructor (ActiveFamiliarService roster + manaService.load())
      // fires two GETs at createComponent — drain them so verify() is clean.
      drainAuxiliary(mock);
      // No detectChanges() ⇒ ngOnInit never runs ⇒ tickHandle stays null.
      expect(() => fx.destroy()).not.toThrow();
      mock.verify();
      vi.useFakeTimers();
    });
  });

  // ── Focused mode (Growth Edge deep-link, Phase 2B) ─────────────────
  //
  // The dashboard links a learner to `/a/daily-dose?growth_edge_id=<id>&concept=<label>`
  // for a focused practice session on one Growth Edge. The component reads
  // those OPTIONAL query params from the ActivatedRoute snapshot, passes the
  // id to `service.load(id)`, and renders a focused-mode header. With no
  // `growth_edge_id`, behaviour is byte-identical to today (no header,
  // `load()` with no id).

  /**
   * Mount a fresh module with an ActivatedRoute snapshot carrying the given
   * query params, spying on DailyDoseService.load (no-op so no dose HTTP
   * fires — the focused header is independent of dose state). Only the
   * constructor's mana + familiar-roster GETs need draining.
   */
  function mountFocused(queryParams: Record<string, string>) {
    vi.useRealTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DailyDoseComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideMockAiTransparency(),
        provideRouter([]),
        TranslateService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    const service = TestBed.inject(DailyDoseService);
    const loadSpy = vi.spyOn(service, 'load').mockImplementation(() => undefined);
    const fx = TestBed.createComponent(DailyDoseComponent);
    const mock = TestBed.inject(HttpTestingController);
    vi.useFakeTimers();
    fx.detectChanges(); // ngOnInit → reads query params, calls load(...)
    drainAuxiliary(mock);
    fx.detectChanges();
    return { fx, mock, loadSpy };
  }

  describe('focused mode (growth_edge_id deep-link)', () => {
    it('reads growth_edge_id + concept, loads scoped, and renders the focused header', () => {
      const { fx, mock, loadSpy } = mountFocused({
        growth_edge_id: 'edge-xyz',
        concept: 'Fractions',
      });
      const el = fx.nativeElement as HTMLElement;

      // Second arg is the (absent) goal scope, asserted explicitly so the
      // arity check stays meaningful rather than silently ignoring extra args.
      expect(loadSpy).toHaveBeenCalledWith('edge-xyz', undefined);

      const header = el.querySelector('[data-testid="daily-dose-focused-header"]');
      expect(header).not.toBeNull();

      // back-to-dashboard affordance is a real anchor.
      const back = header?.querySelector('[data-testid="daily-dose-focused-back"]');
      expect(back).not.toBeNull();
      expect(back?.tagName).toBe('A');

      // the concept label is surfaced in the header copy.
      expect(header?.textContent).toContain('Fractions');

      mock.verify();
      fx.destroy();
    });

    it('falls back to a generic focused label when concept is absent', () => {
      const { fx, mock, loadSpy } = mountFocused({ growth_edge_id: 'edge-1' });
      const el = fx.nativeElement as HTMLElement;

      expect(loadSpy).toHaveBeenCalledWith('edge-1', undefined);

      const header = el.querySelector('[data-testid="daily-dose-focused-header"]');
      expect(header).not.toBeNull();
      // translate pipe echoes the key in tests — the generic key is rendered.
      expect(header?.textContent).toContain('aplus.daily_dose.focused_generic');

      mock.verify();
      fx.destroy();
    });

    it('does NOT render the focused header and loads with no id when growth_edge_id absent', () => {
      const { fx, mock, loadSpy } = mountFocused({});
      const el = fx.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="daily-dose-focused-header"]')).toBeNull();
      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy.mock.calls[0]?.[0]).toBeUndefined();

      mock.verify();
      fx.destroy();
    });

    it('retry() preserves the focused Growth Edge scope', () => {
      const { fx, mock, loadSpy } = mountFocused({ growth_edge_id: 'edge-1' });

      // init already loaded scoped; retry must re-load with the SAME id, not
      // silently fall back to the unscoped dose.
      fx.componentInstance.retry();
      expect(loadSpy).toHaveBeenLastCalledWith('edge-1', undefined);

      mock.verify();
      fx.destroy();
    });
  });

  // ── Goal-scoped dose (goal_id deep-link) ────────────────────────────
  //
  // The map links into the dose with an optional `?goal_id=<id>`. It is
  // forwarded to the service alongside any growth-edge scope. Absent → the
  // load call is exactly what it was before the param existed.
  //
  // NB `goal_id` is ALSO read in campaign mode (`?campaign_node=` present),
  // where ngOnInit returns early and no dose load happens at all; that path is
  // pinned separately in the campaign-practice describe.
  describe('goal-scoped dose (goal_id deep-link)', () => {
    it('forwards goal_id to the dose load', () => {
      const { fx, mock, loadSpy } = mountFocused({ goal_id: 'goal-7' });

      expect(loadSpy).toHaveBeenCalledWith(undefined, 'goal-7');

      mock.verify();
      fx.destroy();
    });

    it('forwards BOTH growth_edge_id and goal_id when both are present', () => {
      const { fx, mock, loadSpy } = mountFocused({
        growth_edge_id: 'edge-1',
        goal_id: 'goal-7',
      });

      expect(loadSpy).toHaveBeenCalledWith('edge-1', 'goal-7');

      mock.verify();
      fx.destroy();
    });

    it('retry() preserves the goal scope', () => {
      const { fx, mock, loadSpy } = mountFocused({ goal_id: 'goal-7' });

      fx.componentInstance.retry();
      expect(loadSpy).toHaveBeenLastCalledWith(undefined, 'goal-7');

      mock.verify();
      fx.destroy();
    });

    it('forwards undefined for goal_id when the param is absent', () => {
      const { fx, mock, loadSpy } = mountFocused({ growth_edge_id: 'edge-1' });

      expect(loadSpy.mock.calls[0]?.[1]).toBeUndefined();

      mock.verify();
      fx.destroy();
    });
  });

  // ── Goal-scope disclosure (ADR-242 D2) ──────────────────────────────
  //
  // When the request carried a goal_id AND the goal resolved, the BFF returns
  // an OPTIONAL `scope` block splitting the SERVED cards three ways: from this
  // goal / on its topics / from the learner's wider enrolment. The header
  // states that split verbatim, so a learner who asked to practise one goal can
  // see how much of today's dose actually came from it.
  //
  // Two suppressions are load-bearing. No `scope` block (no goal, or an older
  // response) renders NO line at all, never a guessed split; and an EMPTY dose
  // suppresses it exactly like the composition chips, because a split over zero
  // cards is a claim about nothing. Zero SEGMENTS, by contrast, stay: "0 from
  // this goal" is the honest statement the ADR asks for when a goal carries no
  // material.
  //
  // These mount a TranslateService fake holding the real en.json copy: the
  // default raw-key service echoes a key with no {{tokens}}, so it can never
  // catch a missing interpolation param (same reasoning as campaign-practice's
  // CHO-2144 block).
  describe('goal-scope disclosure (ADR-242 D2)', () => {
    const SCOPE_GOAL_ID = 'goal-7';

    // Hand-maintained copy of en.json. Keep BYTE-IDENTICAL: a stale fixture
    // passes every assertion while the shipped copy has moved on.
    const SCOPE_I18N: Record<string, string> = {
      'aplus.daily_dose.scope_split':
        '{{goal}} from this goal · {{topics}} on its topics · {{broader}} from your wider enrolment',
      'aplus.daily_dose.scope_aria': "Today's dose composition by goal",
    };

    class ScopeTranslateService {
      instant(key: string, params?: Record<string, string | number>): string {
        const text = SCOPE_I18N[key] ?? key;
        return params ? interpolateI18n(text, params) : text;
      }
    }

    /**
     * Mount the dose exactly as the map deep-links it (`?goal_id=`), with a
     * REAL service load flushed from `doseOverride`, because the disclosure reads the
     * loaded dose, so a mocked-out load (mountFocused) would render nothing.
     */
    function mountScoped(doseOverride?: Partial<DailyDose>): {
      fx: ComponentFixture<DailyDoseComponent>;
      mock: HttpTestingController;
    } {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [DailyDoseComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideMockAiTransparency(),
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { queryParamMap: convertToParamMap({ goal_id: SCOPE_GOAL_ID }) },
            },
          },
          {
            provide: TranslateService,
            useValue: new ScopeTranslateService() as unknown as TranslateService,
          },
        ],
      });
      const fx = TestBed.createComponent(DailyDoseComponent);
      const mock = TestBed.inject(HttpTestingController);
      fx.detectChanges();
      mock
        .expectOne((r) => r.url.includes('/api/familiar/daily-dose'))
        .flush({ ...CANONICAL_DAILY_DOSE, ...doseOverride });
      drainStreak(mock);
      fx.detectChanges();
      drainAuxiliary(mock);
      fx.detectChanges();
      return { fx, mock };
    }

    function scopeLine(fx: ComponentFixture<DailyDoseComponent>): Element | null {
      return (fx.nativeElement as HTMLElement).querySelector('[data-testid="dose-scope"]');
    }

    it('states the three-way split over the served cards', () => {
      const { fx, mock } = mountScoped({
        scope: { goal_id: SCOPE_GOAL_ID, from_goal: 3, on_topics: 1, broader: 1 },
      });

      const line = scopeLine(fx);
      expect(line).not.toBeNull();
      const text = line?.textContent ?? '';
      expect(text).toContain('3 from this goal');
      expect(text).toContain('1 on its topics');
      expect(text).toContain('1 from your wider enrolment');
      expect(text).not.toContain('{{'); // no unsubstituted i18n token
      expect(line?.getAttribute('aria-label')).toBe("Today's dose composition by goal");

      mock.verify();
      fx.destroy();
    });

    it('keeps a zero segment ("0 from this goal" is the statement, not a gap)', () => {
      const { fx, mock } = mountScoped({
        scope: { goal_id: SCOPE_GOAL_ID, from_goal: 0, on_topics: 0, broader: 5 },
      });

      const text = scopeLine(fx)?.textContent ?? '';
      expect(text).toContain('0 from this goal');
      expect(text).toContain('0 on its topics');
      expect(text).toContain('5 from your wider enrolment');

      mock.verify();
      fx.destroy();
    });

    it('renders NO line when the response carries no scope block', () => {
      const { fx, mock } = mountScoped(); // canonical dose: no `scope`

      expect(scopeLine(fx)).toBeNull();
      // POSITIVE CONTROL: the header band itself rendered, so the absence above
      // is the gate working and not a mis-typed selector against a blank page.
      expect(
        (fx.nativeElement as HTMLElement).querySelector('[data-testid="dose-composition"]'),
      ).not.toBeNull();

      mock.verify();
      fx.destroy();
    });

    it('suppresses the line on an EMPTY dose (a split over zero cards is a fiction)', () => {
      const { fx, mock } = mountScoped({
        atoms: [],
        scope: { goal_id: SCOPE_GOAL_ID, from_goal: 0, on_topics: 0, broader: 0 },
      });
      const el = fx.nativeElement as HTMLElement;

      expect(scopeLine(fx)).toBeNull();
      // Same suppression the composition chips already carry, and the empty
      // panel still explains the situation.
      expect(el.querySelector('[data-testid="dose-composition"]')).toBeNull();
      expect(el.querySelector('[data-testid="dose-empty"]')).not.toBeNull();

      mock.verify();
      fx.destroy();
    });
  });

  // ── Campaign practice mode (WS-C7 / CHO-2086) ──────────────────────
  //
  // A map hex-tap deep-links here with `?campaign_node=<id>&goal_id=<id>&
  // concept=<label>`. When present the page mounts the campaign-practice child
  // INSTEAD of the dose and skips the dose load + countdown tick. Absent →
  // byte-identical dose behaviour.
  describe('campaign practice mode (campaign_node deep-link)', () => {
    /** Mount with an ActivatedRoute snapshot carrying campaign params, spying
     *  on DailyDoseService.load so we can assert the dose flow is skipped. */
    function mountCampaign(queryParams: Record<string, string>) {
      vi.useRealTimers();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [DailyDoseComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideMockAiTransparency(),
          provideRouter([]),
          TranslateService,
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
          },
        ],
      });
      const service = TestBed.inject(DailyDoseService);
      const loadSpy = vi.spyOn(service, 'load').mockImplementation(() => undefined);
      const fx = TestBed.createComponent(DailyDoseComponent);
      const mock = TestBed.inject(HttpTestingController);
      vi.useFakeTimers();
      fx.detectChanges(); // ngOnInit reads campaign params, mounts the child
      return { fx, mock, loadSpy };
    }

    /** Drain the child's node-scoped question GET (fired by its own effect). */
    function drainCampaignGet(mock: HttpTestingController): void {
      for (const req of mock.match((r) => r.url.includes('/campaign/questions'))) {
        if (!req.cancelled) {
          req.flush({ status: 'none', concept_id: 'concept-9', concept_key: 'x', rung: 1 });
        }
      }
    }

    it('mounts the campaign-practice child and does NOT load the dose', () => {
      const { fx, mock, loadSpy } = mountCampaign({
        campaign_node: 'concept-9',
        goal_id: 'goal-9',
        concept: 'Fractions',
      });
      const el = fx.nativeElement as HTMLElement;
      expect(loadSpy).not.toHaveBeenCalled();
      expect(el.querySelector('chora-aplus-campaign-practice')).not.toBeNull();
      // the dose surface is NOT rendered in campaign mode
      expect(el.querySelector('[data-testid="aplus-daily-dose"]')).toBeNull();
      drainCampaignGet(mock);
      drainAuxiliary(mock);
      mock.verify();
      fx.destroy();
    });

    it('binds goalId / conceptId / conceptLabel from the query params', () => {
      const { fx, mock, loadSpy } = mountCampaign({
        campaign_node: 'concept-9',
        goal_id: 'goal-9',
        concept: 'Fractions',
      });
      expect(loadSpy).not.toHaveBeenCalled();
      expect(fx.componentInstance.campaignNode()).toBe('concept-9');
      expect(fx.componentInstance.campaignGoalId()).toBe('goal-9');
      expect(fx.componentInstance.campaignConcept()).toBe('Fractions');
      drainCampaignGet(mock);
      drainAuxiliary(mock);
      mock.verify();
      fx.destroy();
    });

    it('renders the dose (not the campaign child) when campaign_node is absent', () => {
      // byte-identical guard: the beforeEach already mounted the dose with no
      // campaign_node — the campaign child must NOT be present in that flow.
      expect(element.querySelector('chora-aplus-campaign-practice')).toBeNull();
      expect(element.querySelector('[data-testid="aplus-daily-dose"]')).not.toBeNull();
    });
  });

  // ── a11y (axe-core) ───────────────────────────────────────────────

  describe('a11y (axe-core)', () => {
    it('has zero critical/serious WCAG violations on default state', async () => {
      vi.useRealTimers();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    }, 15000);

    it('has zero critical/serious WCAG violations on the empty state', async () => {
      TestBed.resetTestingModule();
      const { fixture: fx, httpMock: mock } = setup({ atoms: [] });
      vi.useRealTimers();
      const el = fx.nativeElement as HTMLElement;
      // Guard the guard: assert the empty panel is actually mounted, else a
      // silent fallthrough would axe-scan the populated stack and pass.
      expect(el.querySelector('[data-testid="dose-empty"]')).not.toBeNull();

      const axe = (await import('axe-core')).default;
      const results = await axe.run(el);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);

      mock.verify();
      fx.destroy();
    }, 15000);

    it('has zero critical/serious WCAG violations with the scope disclosure', async () => {
      TestBed.resetTestingModule();
      const { fixture: fx, httpMock: mock } = setup({
        scope: { goal_id: 'goal-7', from_goal: 3, on_topics: 1, broader: 1 },
      });
      vi.useRealTimers();
      const el = fx.nativeElement as HTMLElement;
      // Guard the guard: the disclosure must actually be mounted, else this
      // scans the plain header and passes without testing anything.
      expect(el.querySelector('[data-testid="dose-scope"]')).not.toBeNull();

      const axe = (await import('axe-core')).default;
      const results = await axe.run(el);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);

      mock.verify();
      fx.destroy();
    }, 15000);
  });

  // ── AI greeting enrichment (B2-C / daily-dose/ai) ──────────────────
  //
  // Progressive enhancement: after the deterministic dose renders (templated
  // familiarQuote stub), DailyDoseService fetches the real greeting from
  // GET /api/familiar/daily-dose/ai and the Familiar panel swaps the stub for
  // it. On degrade/error the stub stays (no broken UI, no console spam).
  describe('AI greeting enrichment (B2-C)', () => {
    /** Flush dose + streak + familiars + mana but LEAVE /daily-dose/ai pending
     *  so the test can flush it with a bespoke payload. */
    function flushLeavingAi(mock: HttpTestingController, dose: DailyDose): void {
      mock
        .expectOne((r) => r.url.includes('/api/familiar/daily-dose') && !r.url.endsWith('/ai'))
        .flush(dose);
      drainStreak(mock);
      for (const req of mock.match((r) => r.url.includes('/api/v1/me/familiars'))) {
        if (!req.cancelled) req.flush({ items: [] });
      }
      for (const req of mock.match((r) => r.url.includes('/api/v1/me/mana'))) {
        if (!req.cancelled) {
          req.flush({
            balance_units: 100,
            lifetime_earned: 500,
            lifetime_spent: 400,
            subsidy_breakdown: [{ units: 100, source: 'familiar_plan' }],
          });
        }
      }
    }

    function aiReq(mock: HttpTestingController) {
      return mock.expectOne((r) => r.url.endsWith('/api/familiar/daily-dose/ai'));
    }

    it('swaps the deterministic familiarQuote for the real AI greeting', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushLeavingAi(mock, CANONICAL_DAILY_DOSE); // familiarQuote = 'Stay sharp...'
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      // Before /ai resolves, the deterministic stub shows.
      expect(el.querySelector('[data-testid="dose-familiar-quote"]')?.textContent).toContain(
        'Stay sharp',
      );

      aiReq(mock).flush({
        greeting: "Welcome back, Phyllis — let's revisit Sprint Review.",
        ai_picks: [],
        narrative: '',
        degraded: false,
      });
      fx.detectChanges();

      // The real greeting replaces the stub.
      expect(el.querySelector('[data-testid="dose-familiar-greeting"]')?.textContent).toContain(
        'Phyllis',
      );
      expect(el.querySelector('[data-testid="dose-familiar-quote"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('keeps the deterministic familiarQuote when /daily-dose/ai is degraded', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushLeavingAi(mock, CANONICAL_DAILY_DOSE);
      aiReq(mock).flush({
        greeting: 'templated fallback',
        ai_picks: [],
        narrative: '',
        degraded: true,
      });
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-familiar-quote"]')?.textContent).toContain(
        'Stay sharp',
      );
      expect(el.querySelector('[data-testid="dose-familiar-greeting"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('keeps the deterministic familiarQuote when /daily-dose/ai errors', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushLeavingAi(mock, CANONICAL_DAILY_DOSE);
      aiReq(mock).flush(null, { status: 503, statusText: 'Service Unavailable' });
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-familiar-quote"]')?.textContent).toContain(
        'Stay sharp',
      );
      expect(el.querySelector('[data-testid="dose-familiar-greeting"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('renders the AI recommender narrative when present', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushLeavingAi(mock, CANONICAL_DAILY_DOSE);
      aiReq(mock).flush({
        greeting: 'Hello again.',
        ai_picks: [],
        narrative: 'Picked 2 review atoms to widen your KG hex-fog.',
        degraded: false,
      });
      fx.detectChanges();
      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-familiar-narrative"]')?.textContent).toContain(
        'KG hex-fog',
      );
      mock.verify();
      fx.destroy();
    });
  });

  // ── AI picks (M2 / ADR-196) — recommended atoms surfaced as cards ──
  //
  // The /daily-dose/ai enrichment returns `ai_picks` (bare atom_ids). The
  // component resolves each to a LearningAtom (AtomService.loadAtom →
  // GET /api/v1/atoms/{id}) and renders the survivors as AtomCards. Fail-soft:
  // a pick that 404s/errors is skipped; the section hides when none resolve.
  describe('AI picks (M2 / ADR-196)', () => {
    function buildAtom(id: string): LearningAtom {
      return {
        id,
        tenant_id: 'tenant-1',
        atom_type: 'multiple_choice',
        difficulty: 3,
        language_code: 'en',
        tags: ['scrum'],
        status: 'published',
        created_by: 'gcid-1',
        created_at: '2026-05-12T00:00:00Z',
        updated_at: '2026-05-12T00:00:00Z',
        latest_revision: null,
      };
    }

    /** Flush dose + streak + familiars + mana, LEAVE /daily-dose/ai pending. */
    function flushLeavingAi(mock: HttpTestingController): void {
      mock
        .expectOne((r) => r.url.includes('/api/familiar/daily-dose') && !r.url.endsWith('/ai'))
        .flush(CANONICAL_DAILY_DOSE);
      drainStreak(mock);
      for (const req of mock.match((r) => r.url.includes('/api/v1/me/familiars'))) {
        if (!req.cancelled) req.flush({ items: [] });
      }
      for (const req of mock.match((r) => r.url.includes('/api/v1/me/mana'))) {
        if (!req.cancelled) {
          req.flush({
            balance_units: 100,
            lifetime_earned: 500,
            lifetime_spent: 400,
            subsidy_breakdown: [{ units: 100, source: 'familiar_plan' }],
          });
        }
      }
    }

    function flushAiPicks(mock: HttpTestingController, ids: readonly string[]): void {
      mock
        .expectOne((r) => r.url.endsWith('/api/familiar/daily-dose/ai'))
        .flush({ greeting: '', ai_picks: ids, narrative: '', degraded: false });
    }

    function atomReq(mock: HttpTestingController, id: string) {
      return mock.expectOne((r) => r.url.endsWith(`/api/v1/atoms/${id}`));
    }

    it('resolves ai_picks to atom cards (happy path)', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushLeavingAi(mock);
      fx.detectChanges();

      const el = fx.nativeElement as HTMLElement;
      // Before /ai resolves there is no picks section.
      expect(el.querySelector('[data-testid="dose-ai-picks"]')).toBeNull();

      flushAiPicks(mock, ['atom-pick-1', 'atom-pick-2']);
      fx.detectChanges(); // resolver effect fires the per-pick atom GETs
      atomReq(mock, 'atom-pick-1').flush(buildAtom('atom-pick-1'));
      atomReq(mock, 'atom-pick-2').flush(buildAtom('atom-pick-2'));
      fx.detectChanges();

      expect(el.querySelector('[data-testid="dose-ai-picks"]')).not.toBeNull();
      expect(el.querySelectorAll('[data-testid^="dose-ai-pick-"]').length).toBe(2);
      mock.verify();
      fx.destroy();
    });

    it('fail-soft: skips a pick that fails to load, renders the survivor', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushLeavingAi(mock);
      fx.detectChanges();
      flushAiPicks(mock, ['atom-ok', 'atom-bad']);
      fx.detectChanges();
      atomReq(mock, 'atom-ok').flush(buildAtom('atom-ok'));
      atomReq(mock, 'atom-bad').flush(null, { status: 404, statusText: 'Not Found' });
      fx.detectChanges();

      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-ai-picks"]')).not.toBeNull();
      expect(el.querySelectorAll('[data-testid^="dose-ai-pick-"]').length).toBe(1);
      expect(el.querySelector('[data-testid="dose-ai-pick-atom-ok"]')).not.toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('fail-soft: hides the section when every pick fails to load', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushLeavingAi(mock);
      fx.detectChanges();
      flushAiPicks(mock, ['atom-bad-1', 'atom-bad-2']);
      fx.detectChanges();
      atomReq(mock, 'atom-bad-1').flush(null, { status: 404, statusText: 'Not Found' });
      atomReq(mock, 'atom-bad-2').flush(null, { status: 500, statusText: 'Server Error' });
      fx.detectChanges();

      const el = fx.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="dose-ai-picks"]')).toBeNull();
      mock.verify();
      fx.destroy();
    });

    it('does NOT render the picks section when ai_picks is empty', () => {
      // The default beforeEach `setup()` flushes /ai with an empty ai_picks.
      expect(element.querySelector('[data-testid="dose-ai-picks"]')).toBeNull();
    });

    it('clicking an AI-pick card opens the atom player (openAiPick)', () => {
      vi.useRealTimers();
      const { fx, mock } = mountFresh();
      vi.useFakeTimers();
      fx.detectChanges();
      flushLeavingAi(mock);
      fx.detectChanges();
      flushAiPicks(mock, ['atom-pick-1']);
      fx.detectChanges();
      atomReq(mock, 'atom-pick-1').flush(buildAtom('atom-pick-1'));
      fx.detectChanges();

      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      fx.componentInstance.openAiPick(buildAtom('atom-pick-1'));
      expect(spy).toHaveBeenCalledWith(
        ['/a', 'atoms', 'atom-pick-1', 'play'],
        expect.objectContaining({ queryParams: { returnUrl: '/a/daily-dose' } }),
      );
      mock.verify();
      fx.destroy();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHO-2403: companion rail, breed art + greeter-targeted CTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The rail used to be a bare accent-filled disc with the level pinned to it:
 * no `img` anywhere, so the learner read a name against a blank circle. And
 * its CTA used the bare `/a/companion` front door, which resolves by
 * `isActive`, while the greeting is chosen by topic-match with a GrowthExp
 * tie-break (CHO-1577). Two selection rules on one panel means the dose can
 * name one companion and open another.
 *
 * `ActiveFamiliarService` is stubbed rather than driven through HTTP: the
 * component already injects it, and the rail's dispatch effect resolves the
 * greeter's full growth state, so the rail's art is a pure read off `active()`.
 * Stubbing it states the companion identity directly, which is the whole
 * subject of these tests.
 */
describe('DailyDoseComponent companion rail (CHO-2403)', () => {
  const GREETER_ID = '01920000-0000-7000-8000-00000000fa11';
  const OTHER_ID = '01920000-0000-7000-8000-00000000b0b0';

  function growthState(
    over: Partial<FamiliarGrowthState> = {},
  ): FamiliarGrowthState {
    return {
      familiarId: GREETER_ID,
      growthStage: 4,
      stageName: 'structural',
      species: 'phoenix',
      shinyVariant: false,
      rarity: 'common',
      expCurrent: 120,
      expNextThreshold: 200,
      expCumulative: 620,
      effectiveLlmTier: 'flash',
      effectiveMaxOutputTokens: 1024,
      unlockedTools: [],
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
      hatchedAt: '2026-06-01T00:00:00Z',
      lastStageUpAt: null,
      displayName: 'Eira the Curious',
      ...over,
    };
  }

  /** Mount with an explicitly-stated companion identity + greeting. */
  function mountRail(opts: {
    companion: FamiliarGrowthState | null;
    greeterId?: string | null;
  }): { fx: ComponentFixture<DailyDoseComponent>; mock: HttpTestingController } {
    TestBed.resetTestingModule();
    const activeStub = {
      active: signal(opts.companion).asReadonly(),
      mood: signal('idle' as const).asReadonly(),
      recordActivity: () => undefined,
      refresh: () => undefined,
      setActiveFamiliarId: () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [DailyDoseComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideMockAiTransparency(),
        provideRouter([]),
        TranslateService,
        { provide: ActiveFamiliarService, useValue: activeStub },
      ],
    });
    const fx = TestBed.createComponent(DailyDoseComponent);
    const mock = TestBed.inject(HttpTestingController);
    fx.detectChanges();

    const greeting =
      opts.greeterId === null
        ? {}
        : {
            greeting_from: {
              familiar_id: opts.greeterId ?? GREETER_ID,
              name: 'Eira the Curious',
            },
          };
    mock
      .expectOne((r) => r.url.includes('/api/familiar/daily-dose') && !r.url.endsWith('/ai'))
      .flush({ ...CANONICAL_DAILY_DOSE, ...greeting });
    drainStreak(mock);
    fx.detectChanges();
    drainAuxiliary(mock);
    fx.detectChanges();
    return { fx, mock };
  }

  function teardown(fx: ComponentFixture<DailyDoseComponent>, mock: HttpTestingController): void {
    fx.destroy();
    drainAuxiliary(mock);
  }

  it('renders the greeting Familiar as breed art, not an empty disc', () => {
    const { fx, mock } = mountRail({ companion: growthState() });
    const el = fx.nativeElement as HTMLElement;

    const art = el.querySelector('[data-testid="breed-art"]');
    expect(art).not.toBeNull();
    const img = art?.querySelector('img');
    expect(img?.getAttribute('src')).toBe(
      '/assets/familiars/phoenix/phoenix-stage-4.png',
    );
    teardown(fx, mock);
  });

  it('names the companion in the art alt text (a11y)', () => {
    const { fx, mock } = mountRail({ companion: growthState() });
    const el = fx.nativeElement as HTMLElement;

    const img = el.querySelector('[data-testid="breed-art"] img');
    expect(img?.getAttribute('alt')).toContain('Eira the Curious');
    teardown(fx, mock);
  });

  it('renders NO art when the resolved companion is not the greeter', () => {
    // The Pingu-versus-Vasper race: the roster bootstrap made another
    // Familiar active and the dispatch has not landed yet. Showing that
    // one's portrait would depict a companion the panel did not name.
    const { fx, mock } = mountRail({
      companion: growthState({ familiarId: OTHER_ID, species: 'penguin' }),
    });
    const el = fx.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="breed-art"]')).toBeNull();
    // The rest of the rail must survive that refusal.
    expect(el.querySelector('[data-testid="dose-familiar-name"]')).not.toBeNull();
    teardown(fx, mock);
  });

  it('renders NO art when no companion state has resolved at all', () => {
    const { fx, mock } = mountRail({ companion: null });
    const el = fx.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="breed-art"]')).toBeNull();
    expect(el.querySelector('[data-testid="dose-familiar-panel"]')).not.toBeNull();
    teardown(fx, mock);
  });

  it('renders the breed-neutral pod for a pre-hatch greeter (ADR-149)', () => {
    const { fx, mock } = mountRail({
      companion: growthState({ growthStage: 0, species: '' }),
    });
    const el = fx.nativeElement as HTMLElement;

    const img = el.querySelector('[data-testid="breed-art"] img');
    expect(img?.getAttribute('src')).toBe('/assets/familiars/pods/pod-standard.png');
    teardown(fx, mock);
  });

  it('passes the shiny cosmetic through to the art', () => {
    const { fx, mock } = mountRail({
      companion: growthState({ shinyVariant: true }),
    });
    const el = fx.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="breed-art"].is-shiny')).not.toBeNull();
    teardown(fx, mock);
  });

  it('points the open-companion CTA at the greeting Familiar by id', () => {
    const { fx, mock } = mountRail({ companion: growthState() });
    const el = fx.nativeElement as HTMLElement;

    const link = el.querySelector('[data-testid="dose-familiar-link"]');
    expect(link?.getAttribute('href')).toBe(`/a/companion/${GREETER_ID}`);
    teardown(fx, mock);
  });

  it('falls back to the bare front door when the dose names no greeter', () => {
    const { fx, mock } = mountRail({ companion: growthState(), greeterId: null });
    const el = fx.nativeElement as HTMLElement;

    const link = el.querySelector('[data-testid="dose-familiar-link"]');
    expect(link?.getAttribute('href')).toBe('/a/companion');
    teardown(fx, mock);
  });

  it('keeps the level badge out of the accessibility tree', () => {
    // The badge duplicates the "familiar level N" rank line directly below it.
    const { fx, mock } = mountRail({ companion: growthState() });
    const el = fx.nativeElement as HTMLElement;

    const badge = el.querySelector('.dose-familiar__level');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    teardown(fx, mock);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHO-2403: goal-attached companion precedence (owner ruling 2026-08-20)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three rules could name the Companion on this rail, and until now the panel
 * used a fourth: the dose greeting picks by topic-match with a GrowthExp
 * tie-break (CHO-1577); the `/a/companion` front door picks by `isActive`; and
 * a knowledge-graph Goal carries the Companion the learner personally
 * attached to it. The owner ruled the GOAL wins when the dose is scoped to
 * one, falling back to the topic match when it is not.
 *
 * The goal's Companion is read from `GoalService.goals()`, the plain
 * `GET /api/v1/me/goals` list. Deliberately NOT from
 * `/goals/{id}/knowledge`: that read claims a reflection row and schedules an
 * LLM call (ADR-235), which must never be fired to decorate a panel.
 */
describe('DailyDoseComponent goal-attached companion (CHO-2403)', () => {
  const GREETER_ID = '01920000-0000-7000-8000-00000000fa11';
  const GOAL_COMPANION_ID = '01920000-0000-7000-8000-0000000060a1';
  const GOAL_ID = '01920000-0000-7000-8000-00000000900a';

  function growthState(over: Partial<FamiliarGrowthState> = {}): FamiliarGrowthState {
    return {
      familiarId: GREETER_ID,
      growthStage: 4,
      stageName: 'structural',
      species: 'phoenix',
      shinyVariant: false,
      rarity: 'common',
      expCurrent: 120,
      expNextThreshold: 200,
      expCumulative: 620,
      effectiveLlmTier: 'flash',
      effectiveMaxOutputTokens: 1024,
      unlockedTools: [],
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
      hatchedAt: '2026-06-01T00:00:00Z',
      lastStageUpAt: null,
      displayName: 'Eira the Curious',
      ...over,
    };
  }

  function goalDto(over: Partial<GoalDTO> = {}): GoalDTO {
    return {
      goalId: GOAL_ID,
      kind: 'curiosity',
      conceptSet: [],
      status: 'active',
      northStarNote: '',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      ...over,
    };
  }

  function mount(opts: {
    companion: FamiliarGrowthState | null;
    goals: readonly GoalDTO[];
    goalIdParam: string | null;
  }): { fx: ComponentFixture<DailyDoseComponent>; mock: HttpTestingController } {
    TestBed.resetTestingModule();
    const activeStub = {
      active: signal(opts.companion).asReadonly(),
      mood: signal('idle' as const).asReadonly(),
      recordActivity: () => undefined,
      refresh: () => undefined,
      setActiveFamiliarId: () => undefined,
    };
    const goalStub = {
      goals: signal(opts.goals).asReadonly(),
      load: () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [DailyDoseComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideMockAiTransparency(),
        provideRouter([]),
        TranslateService,
        { provide: ActiveFamiliarService, useValue: activeStub },
        { provide: GoalService, useValue: goalStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(
                opts.goalIdParam ? { goal_id: opts.goalIdParam } : {},
              ),
            },
          },
        },
      ],
    });
    const fx = TestBed.createComponent(DailyDoseComponent);
    const mock = TestBed.inject(HttpTestingController);
    fx.detectChanges();
    mock
      .expectOne((r) => r.url.includes('/api/familiar/daily-dose') && !r.url.endsWith('/ai'))
      .flush({
        ...CANONICAL_DAILY_DOSE,
        greeting_from: { familiar_id: GREETER_ID, name: 'Eira the Curious' },
      });
    drainStreak(mock);
    fx.detectChanges();
    drainAuxiliary(mock);
    fx.detectChanges();
    return { fx, mock };
  }

  function teardown(fx: ComponentFixture<DailyDoseComponent>, mock: HttpTestingController): void {
    fx.destroy();
    drainAuxiliary(mock);
  }

  it('opens the GOAL\'s companion, not the topic-matched greeter', () => {
    const { fx, mock } = mount({
      companion: growthState({ familiarId: GOAL_COMPANION_ID, species: 'owl' }),
      goals: [goalDto({ attachedFamiliarId: GOAL_COMPANION_ID })],
      goalIdParam: GOAL_ID,
    });
    const el = fx.nativeElement as HTMLElement;

    const link = el.querySelector('[data-testid="dose-familiar-link"]');
    expect(link?.getAttribute('href')).toBe(`/a/companion/${GOAL_COMPANION_ID}`);
    teardown(fx, mock);
  });

  it('draws the GOAL\'s companion art, and refuses the greeter\'s', () => {
    const { fx, mock } = mount({
      companion: growthState({ familiarId: GOAL_COMPANION_ID, species: 'owl', growthStage: 3 }),
      goals: [goalDto({ attachedFamiliarId: GOAL_COMPANION_ID })],
      goalIdParam: GOAL_ID,
    });
    const el = fx.nativeElement as HTMLElement;

    const img = el.querySelector('[data-testid="breed-art"] img');
    expect(img?.getAttribute('src')).toBe('/assets/familiars/owl/owl-stage-3.png');
    teardown(fx, mock);
  });

  it('refuses to draw the GREETER when the goal named someone else', () => {
    // The resolved companion is still the greeter (dispatch has not caught up
    // with the goal override). The rail names the goal's companion, so the
    // greeter's face must not appear under it.
    const { fx, mock } = mount({
      companion: growthState({ familiarId: GREETER_ID, species: 'phoenix' }),
      goals: [goalDto({ attachedFamiliarId: GOAL_COMPANION_ID })],
      goalIdParam: GOAL_ID,
    });
    const el = fx.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="breed-art"]')).toBeNull();
    teardown(fx, mock);
  });

  it('falls back to the greeter when the goal has NO attached companion', () => {
    const { fx, mock } = mount({
      companion: growthState(),
      goals: [goalDto({ attachedFamiliarId: undefined })],
      goalIdParam: GOAL_ID,
    });
    const el = fx.nativeElement as HTMLElement;

    const link = el.querySelector('[data-testid="dose-familiar-link"]');
    expect(link?.getAttribute('href')).toBe(`/a/companion/${GREETER_ID}`);
    expect(el.querySelector('[data-testid="breed-art"]')).not.toBeNull();
    teardown(fx, mock);
  });

  it('falls back to the greeter when the scoped goal is not in the list', () => {
    const { fx, mock } = mount({
      companion: growthState(),
      goals: [goalDto({ goalId: 'some-other-goal', attachedFamiliarId: GOAL_COMPANION_ID })],
      goalIdParam: GOAL_ID,
    });
    const el = fx.nativeElement as HTMLElement;

    const link = el.querySelector('[data-testid="dose-familiar-link"]');
    expect(link?.getAttribute('href')).toBe(`/a/companion/${GREETER_ID}`);
    teardown(fx, mock);
  });

  it('does NOT consult goals at all when the dose is not goal-scoped', () => {
    // An unscoped dose must not pay for a goals read, and must keep the
    // greeter even if some other goal holds a companion.
    const { fx, mock } = mount({
      companion: growthState(),
      goals: [goalDto({ attachedFamiliarId: GOAL_COMPANION_ID })],
      goalIdParam: null,
    });
    const el = fx.nativeElement as HTMLElement;

    const link = el.querySelector('[data-testid="dose-familiar-link"]');
    expect(link?.getAttribute('href')).toBe(`/a/companion/${GREETER_ID}`);
    teardown(fx, mock);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHO-2403: the rail's name and stage must describe the companion it DRAWS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `familiarName` and `familiarLevel` on the dose wire are the GREETER's: the
 * BFF overrides both from the greeting selection, and `familiarLevel` is that
 * Familiar's ADR-149 GrowthStage, not a separate scale.
 *
 * So when a Goal's attached Companion outranks the greeter, binding the
 * heading to the dose fields would print one Companion's name over another
 * Companion's portrait. That is the very defect this story exists to remove,
 * reintroduced one element to the left.
 */
describe('DailyDoseComponent rail identity coherence (CHO-2403)', () => {
  const GREETER_ID = '01920000-0000-7000-8000-00000000fa11';
  const GOAL_COMPANION_ID = '01920000-0000-7000-8000-0000000060a1';
  const GOAL_ID = '01920000-0000-7000-8000-00000000900a';

  function mount(companion: FamiliarGrowthState | null, goals: readonly GoalDTO[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DailyDoseComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideMockAiTransparency(),
        provideRouter([]),
        TranslateService,
        {
          provide: ActiveFamiliarService,
          useValue: {
            active: signal(companion).asReadonly(),
            mood: signal('idle' as const).asReadonly(),
            recordActivity: () => undefined,
            refresh: () => undefined,
            setActiveFamiliarId: () => undefined,
          },
        },
        { provide: GoalService, useValue: { goals: signal(goals).asReadonly(), load: () => undefined } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ goal_id: GOAL_ID }) } },
        },
      ],
    });
    const fx = TestBed.createComponent(DailyDoseComponent);
    const mock = TestBed.inject(HttpTestingController);
    fx.detectChanges();
    mock
      .expectOne((r) => r.url.includes('/api/familiar/daily-dose') && !r.url.endsWith('/ai'))
      .flush({
        ...CANONICAL_DAILY_DOSE,
        familiarName: 'Eira the Curious',
        familiarLevel: 5,
        greeting_from: { familiar_id: GREETER_ID, name: 'Eira the Curious' },
      });
    drainStreak(mock);
    fx.detectChanges();
    drainAuxiliary(mock);
    fx.detectChanges();
    return { fx, mock };
  }

  function goalCompanion(): FamiliarGrowthState {
    return {
      familiarId: GOAL_COMPANION_ID,
      growthStage: 3,
      stageName: 'awakened',
      species: 'owl',
      shinyVariant: false,
      rarity: 'common',
      expCurrent: 10,
      expNextThreshold: 100,
      expCumulative: 310,
      effectiveLlmTier: 'flash',
      effectiveMaxOutputTokens: 1024,
      unlockedTools: [],
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
      hatchedAt: '2026-06-01T00:00:00Z',
      lastStageUpAt: null,
      displayName: 'Pingu',
      ...{},
    };
  }

  const attachedGoal: GoalDTO = {
    goalId: GOAL_ID,
    kind: 'curiosity',
    conceptSet: [],
    status: 'active',
    northStarNote: '',
    attachedFamiliarId: GOAL_COMPANION_ID,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  };

  it('names the companion it draws, not the dose greeter', () => {
    const { fx, mock } = mount(goalCompanion(), [attachedGoal]);
    const el = fx.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="dose-familiar-name"]')?.textContent?.trim()).toBe('Pingu');
    fx.destroy();
    drainAuxiliary(mock);
  });

  it('states the drawn companion\'s stage, not the greeter\'s', () => {
    const { fx, mock } = mount(goalCompanion(), [attachedGoal]);
    const el = fx.nativeElement as HTMLElement;

    // The dose said 5 (the greeter's stage); the drawn Companion is at 3.
    const rank = el.querySelector('[data-testid="dose-familiar-rank"]')?.textContent ?? '';
    expect(rank).toContain('3');
    expect(rank).not.toContain('5');
    fx.destroy();
    drainAuxiliary(mock);
  });

  it('labels the art with the companion it actually shows', () => {
    const { fx, mock } = mount(goalCompanion(), [attachedGoal]);
    const el = fx.nativeElement as HTMLElement;

    const img = el.querySelector('[data-testid="breed-art"] img');
    expect(img?.getAttribute('src')).toBe('/assets/familiars/owl/owl-stage-3.png');
    expect(img?.getAttribute('alt')).toContain('Pingu');
    fx.destroy();
    drainAuxiliary(mock);
  });

  it('keeps the dose values when the greeter IS the companion of record', () => {
    // No goal bond: nothing outranks the greeter, so the wire fields stand.
    const { fx, mock } = mount(null, [{ ...attachedGoal, attachedFamiliarId: undefined }]);
    const el = fx.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="dose-familiar-name"]')?.textContent?.trim()).toBe(
      'Eira the Curious',
    );
    expect(el.querySelector('[data-testid="dose-familiar-rank"]')?.textContent).toContain('5');
    fx.destroy();
    drainAuxiliary(mock);
  });
});
