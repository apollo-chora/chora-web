/**
 * DailyDoseComponent stories — WS-12 Ebbinghaus + Familiar nudge + streak.
 *
 * Variants:
 *   - EmptyState: loading skeleton (no dose yet)
 *   - FiveDosesWithMixedRetention: 5 atoms ordered low→medium→unknown (Ebbinghaus)
 *   - WithFamiliarNudge: familiar nudge card + dose atoms
 *   - ManaGatedUpsell: Basic-tier user → upsell card instead of nudge
 *   - StreakAtRisk: streak >18h stale → pulse animation + warning chip
 *   - GoalScopedWithDisclosure: goal-first dose → three-way scope line (ADR-242 D2)
 *   - ErrorState: BFF 5xx → fail-loud banner + retry CTA
 *
 * Per coding-angular-storybook: stubs DailyDoseService state via a wrapper
 * component injecting a preset signal. No real HTTP. Tablet viewport (768px)
 * primary canvas.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { signal, computed } from '@angular/core';
import { RouterModule } from '@angular/router';

import { DailyDoseComponent } from './daily-dose.component';
import { DailyDoseService } from './daily-dose.service';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import { provideMockAiTransparency } from '../../../../testing/mock-ai-transparency';
import type { FamiliarGrowthState } from '../../../../core/familiar/familiar-growth.model';
import type { BreedMood } from '../../../../shared/components/breed-art/breed-art.component';
import type {
  DailyDose,
  DailyDoseState,
  DoseScope,
  FamiliarNudge,
  DailyDoseStreak,
} from './daily-dose.model';

// ── Stub service factory ──────────────────────────────────────────────────────

function makeStubService(state: DailyDoseState): Partial<DailyDoseService> {
  const _state = signal(state);
  const dose = computed<DailyDose | null>(() => {
    const s = _state();
    return s.status === 'success' ? s.data : null;
  });
  return {
    state: _state.asReadonly(),
    dose,
    // B2-C: the component reads these for the AI-greeting progressive
    // enhancement. Stories render the deterministic greeting (null AI signals).
    aiGreeting: signal<string | null>(null).asReadonly(),
    aiNarrative: signal<string | null>(null).asReadonly(),
    // M2 / ADR-196: the component's constructor effect CALLS `aiPicks()`.
    // Omitting it threw "aiPicks is not a function" on every story render;
    // the page still painted because the throw was inside an effect, so the
    // stories looked healthy while erroring on mount. Empty = no picks
    // section, which is what these stories are meant to show.
    aiPicks: signal<readonly string[]>([]).asReadonly(),
    load: () => undefined,
  } as unknown as Partial<DailyDoseService>;
}

// ── Companion stub (CHO-2403) ────────────────────────────────────────────────

/** UUIDv7 shared by the dose greeting and the resolved companion below. */
const GREETER_ID = '01920000-0000-7000-8000-00000000fa11';

/**
 * Stub for ActiveFamiliarService, the source of the rail's breed art.
 *
 * These stories are NOT hermetic: DailyDoseComponent's root services fire
 * real XHR at api.chora.site, which fails on CORS from the Storybook origin
 * and would fail in Chromatic too (no auth, no CORS). A rail sourced from the
 * LIVE service therefore resolves to null and renders no art in any snapshot,
 * so the visual-regression diff for this fix would silently be zero pixels
 * while the production code was perfectly correct. Stating the companion here
 * is what puts the art in the snapshot.
 *
 * `familiarId` matches the dose's `greeting_from.familiar_id` on purpose: the
 * rail refuses to draw a companion it cannot prove is the greeter.
 */
function makeCompanionStub(
  over: Partial<FamiliarGrowthState> = {},
  mood: BreedMood = 'idle',
) {
  const companion = {
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
  } as FamiliarGrowthState;
  return {
    active: signal<FamiliarGrowthState | null>(companion).asReadonly(),
    mood: signal<BreedMood>(mood).asReadonly(),
    recordActivity: () => undefined,
    refresh: () => undefined,
    setActiveFamiliarId: () => undefined,
  };
}

/**
 * Providers for a story. The last two make these stories HERMETIC.
 *
 * Chromatic flagged six of the eight as unstable, and it was right: the
 * component's remaining root services fired real XHR at api.chora.site, which
 * dies on CORS from a story origin with nondeterministic timing. Unstable
 * snapshots make a visual diff worthless, because there is no way to tell
 * pixel churn from the change the diff exists to show.
 *
 * Both stubs are PIXEL-NEUTRAL by construction, so removing the network
 * removes the noise without moving the image: `ai-label-chip` renders nothing
 * until its disclosure loads and the stub leaves it null, exactly as the
 * failing fetch did; and `mana()` was already null on every failed request,
 * so the mana gate evaluates identically. The gated-upsell story is driven by
 * `requires_standard_tier` on the nudge, not by the wallet.
 */
function providersFor(
  state: DailyDoseState,
  companion: ReturnType<typeof makeCompanionStub> = makeCompanionStub(),
) {
  return [
    { provide: DailyDoseService, useValue: makeStubService(state) },
    { provide: ActiveFamiliarService, useValue: companion },
    {
      provide: MeManaService,
      useValue: { mana: signal(null).asReadonly(), load: () => undefined },
    },
    provideMockAiTransparency(),
  ];
}

// ── Deterministic clock ───────────────────────────────────────────────────────

/**
 * The single instant every story in this file pretends "now" is.
 *
 * The dose card renders a live countdown (`countdownLabel` recomputes from a
 * 1s `setInterval`), so with a real clock every capture painted a different
 * string. Chromatic build 290 marked six of the eight stories UNSTABLE and
 * auto-ignored all six changes - exactly the six that draw a dose card. The
 * two that draw none, Empty State and Error State, stayed stable. The result
 * was visual-regression cover that could never be reviewed.
 *
 * `parameters.frozenClock` (see `.storybook/preview.ts`) pins `Date.now()` for
 * the render, so the interval keeps firing but writes the same value. The
 * fixtures below are module-level constants evaluated at IMPORT time, before
 * any decorator runs, so they must derive from this constant rather than
 * calling `Date.now()` themselves - otherwise the countdown's two halves would
 * come from two different clocks and drift straight back.
 *
 * Value: 2026-01-15T09:00:00Z, chosen only for being fixed and unremarkable.
 * Every derived instant below is an offset from it, so the countdown reads
 * 14:00:00 on every capture, forever.
 */
const FROZEN_NOW = Date.UTC(2026, 0, 15, 9, 0, 0);
const MINUTE = 1000 * 60;
const HOUR = MINUTE * 60;

// ── Sample data ───────────────────────────────────────────────────────────────

const ACTIVE_STREAK: DailyDoseStreak = {
  currentDays: 7,
  longestStreak: 14,
  lastActivityAt: new Date(FROZEN_NOW - 30 * MINUTE).toISOString(), // 30 min ago - safe
  status: 'active',
};

const STALE_STREAK: DailyDoseStreak = {
  currentDays: 3,
  longestStreak: 10,
  lastActivityAt: new Date(FROZEN_NOW - 20 * HOUR).toISOString(), // 20h ago - at risk
  status: 'active',
};

const SAMPLE_DOSE: DailyDose = {
  doseId: 'dose-ws12-demo-001',
  servedOn: new Date(FROZEN_NOW).toISOString().slice(0, 10),
  atoms: [
    {
      atomId: 'atom-sr-ebbinghaus-001',
      courseCode: 'CSPO',
      title: 'Sprint Review — Overdue Review',
      summary: 'This atom is due for review per the Ebbinghaus forgetting curve.',
      category: 'review',
      topic: 'Scrum Events',
      xpOnComplete: 10,
      // retention_state absent → derived from category as 'low'
    },
    {
      atomId: 'atom-sr-weakness-002',
      courseCode: 'CSPO',
      title: 'Backlog Refinement — Weakness Drill',
      summary: 'Spaced-repetition lag detected — reinforcement needed.',
      category: 'stretch',
      topic: 'Scrum Events',
      xpOnComplete: 15,
      // retention_state absent → 'medium'
    },
    {
      atomId: 'atom-lean-new-003',
      courseCode: 'LEAN',
      title: 'Lean Startup — Hypothesis Mapping',
      summary: 'No prior history — curiosity-driven discovery atom.',
      category: 'new',
      topic: 'Product Vision',
      xpOnComplete: 20,
      // retention_state absent → 'unknown'
    },
    {
      atomId: 'atom-explicit-high-004',
      courseCode: 'CSPO',
      title: 'Daily Standups — Explicit High Retention',
      summary: 'BE returned explicit high retention state for this atom.',
      category: 'review',
      topic: 'Scrum Events',
      xpOnComplete: 8,
      retention_state: 'high', // explicit BE field — shows fa-circle-check in green
    },
    {
      atomId: 'atom-stretch-005',
      courseCode: 'LEAN',
      title: 'Value Stream Mapping — Stretch Challenge',
      summary: 'Stretch atom from the curiosity KG hex-fog.',
      category: 'new',
      topic: 'Lean Practices',
      xpOnComplete: 25,
    },
  ],
  composition: { reviewPercent: 40, newPercent: 30, stretchPercent: 30 },
  totalXpAvailable: 78,
  // Exactly 14h after FROZEN_NOW, so the countdown paints 14:00:00 every time.
  nextDoseAt: new Date(FROZEN_NOW + 14 * HOUR).toISOString(),
  familiarName: 'Eira the Curious',
  // Matches the companion stub's growthStage on purpose. `familiarLevel` on
  // the wire IS the greeting Familiar's ADR-149 GrowthStage, which is 0 to 6,
  // so the old value of 12 was impossible data: no Familiar can be at stage
  // 12. Left as-is it would make the rail's rank line move in visual
  // regression for a reason production would never reproduce.
  familiarLevel: 4,
  familiarQuote:
    'Spaced practice beats last-minute cramming every time — Ebbinghaus proved it.',
  familiarGreeting: "Welcome back! I've queued your most overdue atoms first.",
  // CHO-1577 N-Familiar dispatch: names WHICH Familiar is greeting. The rail
  // draws art only for this id, so it must match the companion stub above.
  greeting_from: {
    familiar_id: GREETER_ID,
    name: 'Eira the Curious',
  },
  recommenderNarrative:
    "2 overdue Ebbinghaus picks + 1 weakness + 2 curiosity atoms from your KG hex-fog.",
  streak: ACTIVE_STREAK,
};

/**
 * Goal-scope disclosure for the goal-first entry (ADR-242 D2). Counts are over
 * the SERVED cards and sum to SAMPLE_DOSE's 5 atoms: a goal-scoped dose that
 * had to reach past the goal for most of today's material still says so.
 */
const GOAL_SCOPE: DoseScope = {
  goal_id: '01920000-0000-7000-8000-0000000000aa',
  from_goal: 2,
  on_topics: 1,
  broader: 2,
};

const NUDGE: FamiliarNudge = {
  familiar_name: 'Eira',
  atom_id: 'atom-nudge-sprint-planning',
  atom_title: 'Sprint Planning — Capacity-Based Commitment',
  requires_standard_tier: false,
};

const NUDGE_GATED: FamiliarNudge = {
  ...NUDGE,
  requires_standard_tier: true,
};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<DailyDoseComponent> = {
  title: 'A+ / Daily Dose',
  component: DailyDoseComponent,
  decorators: [],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    // Pins Date.now() for every story in this file so the live countdown and
    // the streak-staleness check paint the same string on every capture. Set
    // on the meta, not per story: the two stories that draw no dose card were
    // already stable, and freezing them too costs nothing and keeps a future
    // card-rendering story from inheriting the instability by default.
    frozenClock: FROZEN_NOW,
    docs: {
      description: {
        component:
          'Daily Dose carousel with Ebbinghaus spaced-repetition ordering, ' +
          'per-Familiar nudge, mana-gated upsell, and streak indicator (WS-12).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<DailyDoseComponent>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const EmptyState: Story = {
  name: 'Empty State (loading)',
  render: () => ({
    props: {},
    moduleMetadata: {
      imports: [DailyDoseComponent, RouterModule.forRoot([])],
      providers: providersFor({ status: 'loading' }),
    },
    template: '<chora-aplus-daily-dose />',
  }),
};

export const FiveDosesWithMixedRetention: Story = {
  name: '5 Doses — Mixed Retention (Ebbinghaus ordering)',
  render: () => ({
    props: {},
    moduleMetadata: {
      imports: [DailyDoseComponent, RouterModule.forRoot([])],
      providers: providersFor({
        status: 'success',
        data: SAMPLE_DOSE,
      }),
    },
    template: '<chora-aplus-daily-dose />',
  }),
};

export const WithFamiliarNudge: Story = {
  name: 'With Familiar Nudge (Standard+ user)',
  render: () => ({
    props: {},
    moduleMetadata: {
      imports: [DailyDoseComponent, RouterModule.forRoot([])],
      providers: providersFor({
        status: 'success',
        data: { ...SAMPLE_DOSE, familiar_nudge: NUDGE },
      }),
    },
    template: '<chora-aplus-daily-dose />',
  }),
};

export const ManaGatedUpsell: Story = {
  name: 'Mana Gated — Basic Tier Upsell',
  render: () => ({
    props: {},
    moduleMetadata: {
      imports: [DailyDoseComponent, RouterModule.forRoot([])],
      providers: providersFor({
        status: 'success',
        data: { ...SAMPLE_DOSE, familiar_nudge: NUDGE_GATED },
      }),
    },
    template: '<chora-aplus-daily-dose />',
  }),
};

export const StreakAtRisk: Story = {
  name: 'Streak At Risk (>18h stale)',
  render: () => ({
    props: {},
    moduleMetadata: {
      imports: [DailyDoseComponent, RouterModule.forRoot([])],
      providers: providersFor({
        status: 'success',
        data: { ...SAMPLE_DOSE, streak: STALE_STREAK },
      }),
    },
    template: '<chora-aplus-daily-dose />',
  }),
};

export const GoalScopedWithDisclosure: Story = {
  name: 'Goal-Scoped Dose with Scope Disclosure (ADR-242 D2)',
  render: () => ({
    props: {},
    moduleMetadata: {
      imports: [DailyDoseComponent, RouterModule.forRoot([])],
      providers: providersFor({
        status: 'success',
        data: { ...SAMPLE_DOSE, scope: GOAL_SCOPE },
      }),
    },
    template: '<chora-aplus-daily-dose />',
  }),
};

export const ErrorState: Story = {
  name: 'Error State — BFF 5xx',
  render: () => ({
    props: {},
    moduleMetadata: {
      imports: [DailyDoseComponent, RouterModule.forRoot([])],
      providers: providersFor({
        status: 'error',
        error: 'aplus.daily_dose.error_upstream',
      }),
    },
    template: '<chora-aplus-daily-dose />',
  }),
};

/**
 * The identity gate (CHO-2403). The dose greeting names one Familiar while
 * the resolved companion is a DIFFERENT one, which is the real race: the
 * roster front door picks by `isActive`, the greeting picks by topic-match
 * with a GrowthExp tie-break, and for a moment they disagree.
 *
 * The rail deliberately renders NO art here rather than the other companion's
 * portrait. Showing it would put one Familiar's face under another Familiar's
 * name, which is the confusion this story exists to remove, so the empty disc
 * in this snapshot is the CORRECT output, not a regression.
 */
export const CompanionIdentityUnproven: Story = {
  name: 'Companion Identity Unproven (no art rather than the wrong face)',
  render: () => ({
    props: {},
    moduleMetadata: {
      imports: [DailyDoseComponent, RouterModule.forRoot([])],
      providers: providersFor(
        { status: 'success', data: SAMPLE_DOSE },
        makeCompanionStub({
          familiarId: '01920000-0000-7000-8000-00000000b0b0',
          species: 'penguin',
          displayName: 'Pingu',
        }),
      ),
    },
    template: '<chora-aplus-daily-dose />',
  }),
};
