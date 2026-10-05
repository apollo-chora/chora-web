/**
 * Phyllis N=4 Familiar roster fixtures for the Step 8 N-Familiar dispatch spec.
 *
 * Familiar roster (per `docs/m13/familiar-buildout-audit-2026-05-26.md` §3):
 *   - Eira   (…e1a0)  cspo/dragon   Stage 2  growth_exp=200   hatched
 *   - Aria   (…f1a1)  music/phoenix Stage 1  growth_exp=150   hatched
 *   - Mystery Egg (…f1a2)  unbound/dragon Stage 0 growth_exp=0  pre-hatch (MUST be filtered)
 *   - Ignis  (…f1a3)  physics/dragon Stage 4  growth_exp=9500  hatched (tie-break winner)
 *
 * Dispatch rules (Agent C, CHO-1577):
 *   1. Topic majority → that specialised Familiar greets.
 *   2. Tie-break → highest growth_exp among non-pre-hatch Familiars (Ignis wins at 9500).
 *   3. Mystery Egg (Stage 0, unbound) always filtered out.
 *
 * All UUIDs use the last 4 hex chars as suffix per the audit doc convention.
 * Full UUIDs are placeholder v4 values safe for mock use — they will be replaced
 * by real DB UUIDs once CHO-1540 (RLS-blind seed fix) lands in PROD.
 *
 * Per `feedback_no_local_cicd_run` — do NOT run `playwright test` locally.
 * Push and let CI / the user trigger the run.
 */
import { type Page } from '@playwright/test';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Familiar UUIDs — stable placeholders matching migration 0038 suffix pattern
// ---------------------------------------------------------------------------

/** Stable suffix identifiers per the Phase 0 audit. Full UUIDs are mocks. */
export const PHYLLIS_FAMILIAR_IDS = {
  EIRA: '00000000-0000-0000-0000-000000000000e1a0'.replace('0000000000000000', randomUUID().replace(/-/g, '').slice(0, 12) + '0000e1a0').slice(0, 36),
  ARIA: '00000000-0000-0000-0000-000000000000f1a1'.replace('0000000000000000', randomUUID().replace(/-/g, '').slice(0, 12) + '0000f1a1').slice(0, 36),
  MYSTERY_EGG: '00000000-0000-0000-0000-000000000000f1a2'.replace('0000000000000000', randomUUID().replace(/-/g, '').slice(0, 12) + '0000f1a2').slice(0, 36),
  IGNIS: '00000000-0000-0000-0000-000000000000f1a3'.replace('0000000000000000', randomUUID().replace(/-/g, '').slice(0, 12) + '0000f1a3').slice(0, 36),
} as const;

// Use clean, testable UUIDs — the suffix just needs to be unique & identifiable
export const EIRA_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaae1a0';
export const ARIA_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbf1a1';
export const MYSTERY_EGG_ID = 'ccccccccccccccccccccccccccccccccf1a2';
export const IGNIS_ID = 'ddddddddddddddddddddddddddddddddf1a3';

// Normalised to valid UUIDv4 format for API mocking
export const EIRA_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaaa0';
export const ARIA_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbbb1';
export const MYSTERY_EGG_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccccc2';
export const IGNIS_UUID = 'dddddddd-dddd-dddd-dddd-ddddddddddddd3';

// ---------------------------------------------------------------------------
// Familiar entity shape
// ---------------------------------------------------------------------------

export interface FamiliarFixture {
  familiar_id: string;
  name: string;
  species: string;
  specialization: string;
  growth_stage: number;
  evolution_tier: string;
  growth_exp: number;
  voice_accent: string;
  hatched_at: string | null;
  is_pre_hatch: boolean;
}

export const FAMILIAR_ROSTER: FamiliarFixture[] = [
  {
    familiar_id: EIRA_UUID,
    name: 'Eira',
    species: 'dragon',
    specialization: 'cspo',
    growth_stage: 2,
    evolution_tier: 'apprentice',
    growth_exp: 200,
    voice_accent: 'encouraging_cite_first',
    hatched_at: '2026-05-13T00:00:00Z',
    is_pre_hatch: false,
  },
  {
    familiar_id: ARIA_UUID,
    name: 'Aria',
    species: 'phoenix',
    specialization: 'music',
    growth_stage: 1,
    evolution_tier: 'apprentice',
    growth_exp: 150,
    voice_accent: 'warm_song_shaped',
    hatched_at: '2026-05-16T00:00:00Z',
    is_pre_hatch: false,
  },
  {
    familiar_id: MYSTERY_EGG_UUID,
    name: 'Mystery Egg',
    species: 'dragon',
    specialization: 'unbound',
    growth_stage: 0,
    evolution_tier: 'apprentice',
    growth_exp: 0,
    voice_accent: 'none',
    hatched_at: null,
    is_pre_hatch: true,
  },
  {
    familiar_id: IGNIS_UUID,
    name: 'Ignis',
    species: 'dragon',
    specialization: 'physics',
    growth_stage: 4,
    evolution_tier: 'adept',
    growth_exp: 9500,
    voice_accent: 'direct_socratic',
    hatched_at: '2026-05-01T00:00:00Z',
    is_pre_hatch: false,
  },
];

// ---------------------------------------------------------------------------
// Atom topic mix fixtures for dispatch scenario testing
// ---------------------------------------------------------------------------

export type TopicMix = 'cspo_majority' | 'music_majority' | 'physics_majority' | 'cspo_music_tie';

/**
 * Returns the atom_breakdown for a given topic scenario.
 * Each field value = number of atoms in that topic bucket.
 *
 * Dispatch result per CHO-1577 logic:
 *   - cspo_majority     → Eira  (3 cspo > 1 music, 1 physics)
 *   - music_majority    → Aria  (3 music > 1 cspo, 1 physics)
 *   - physics_majority  → Ignis (3 physics > 1 cspo, 1 music)
 *   - cspo_music_tie    → Ignis (2 cspo == 2 music; tie-break = highest growth_exp = Ignis 9500)
 */
export function buildAtomBreakdown(scenario: TopicMix): Record<string, unknown> {
  switch (scenario) {
    case 'cspo_majority':
      return {
        cspo: 3,
        music: 1,
        physics: 1,
        ebbinghaus: 2,
        curiosity: 2,
        weakness: 1,
      };
    case 'music_majority':
      return {
        cspo: 1,
        music: 3,
        physics: 1,
        ebbinghaus: 2,
        curiosity: 2,
        weakness: 1,
      };
    case 'physics_majority':
      return {
        cspo: 1,
        music: 1,
        physics: 3,
        ebbinghaus: 2,
        curiosity: 1,
        weakness: 2,
      };
    case 'cspo_music_tie':
      return {
        cspo: 2,
        music: 2,
        physics: 1,
        ebbinghaus: 2,
        curiosity: 2,
        weakness: 1,
      };
  }
}

/**
 * Returns the expected greeting Familiar ID for a given topic mix,
 * applying the N-Familiar dispatch algorithm.
 */
export function expectedGreetingFamiliar(scenario: TopicMix): string {
  switch (scenario) {
    case 'cspo_majority':
      return EIRA_UUID;
    case 'music_majority':
      return ARIA_UUID;
    case 'physics_majority':
      return IGNIS_UUID;
    case 'cspo_music_tie':
      // Tie-break: highest growth_exp among non-pre-hatch Familiars
      // Eira=200, Aria=150, Ignis=9500 → Ignis wins
      return IGNIS_UUID;
  }
}

// ---------------------------------------------------------------------------
// Mock atom entries (5 per dose)
// ---------------------------------------------------------------------------

function buildDoseAtom(topicSpecialization: string, index: number): Record<string, unknown> {
  // FE DailyDoseAtom shape (camelCase) — matches daily-dose.model.ts so the
  // component renders the card stack straight from the BFF response (the
  // service casts the JSON to DailyDose with no mapping). DailyDoseAtomCategory
  // is 'review' | 'new' | 'stretch'.
  const category = index < 2 ? 'review' : index < 4 ? 'new' : 'stretch';
  return {
    atomId: randomUUID(),
    courseCode: `${topicSpecialization.toUpperCase()}-101`,
    topic: topicSpecialization,
    title: `${topicSpecialization.toUpperCase()} Atom ${index + 1}`,
    summary: `Practice atom for ${topicSpecialization} (#${index + 1}).`,
    category,
    xpOnComplete: 10,
  };
}

/**
 * Builds the full daily-dose API response for a given topic scenario.
 * Always returns exactly 5 atoms (40/30/30 split approximation).
 * Includes `greeting_from` with the correct Familiar per dispatch logic.
 *
 * Used to mock `GET /api/familiar/daily-dose`.
 */
export function buildDailyDoseResponse(scenario: TopicMix): Record<string, unknown> {
  const breakdown = buildAtomBreakdown(scenario);
  const greetingFamiliarId = expectedGreetingFamiliar(scenario);
  const greetingFamiliar = FAMILIAR_ROSTER.find((f) => f.familiar_id === greetingFamiliarId)!;

  // Build 5 atoms reflecting the topic mix
  const atoms: Record<string, unknown>[] = [];
  const topicCounts = breakdown as Record<string, number>;
  for (const [topic, count] of Object.entries(topicCounts)) {
    if (typeof count === 'number' && ['cspo', 'music', 'physics'].includes(topic)) {
      for (let i = 0; i < count; i++) {
        atoms.push(buildDoseAtom(topic, atoms.length));
      }
    }
  }
  // Pad to exactly 5 if fewer
  while (atoms.length < 5) {
    atoms.push(buildDoseAtom('general', atoms.length));
  }
  // Trim to exactly 5
  const fiveAtoms = atoms.slice(0, 5);

  // FE DailyDose shape (camelCase) per daily-dose.model.ts. familiarName is set
  // to the dispatched greeting Familiar (the BE overrides it to the winner), and
  // familiarGreeting is populated so the `dose-familiar-greeting` bubble renders.
  const today = new Date();
  return {
    doseId: randomUUID(),
    servedOn: today.toISOString().slice(0, 10),
    atoms: fiveAtoms,
    composition: { reviewPercent: 40, newPercent: 30, stretchPercent: 30 },
    totalXpAvailable: fiveAtoms.length * 10,
    nextDoseAt: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    familiarName: greetingFamiliar.name,
    familiarLevel: greetingFamiliar.growth_stage,
    familiarGreeting: `${greetingFamiliar.name} is ready for today's dose!`,
    familiarQuote: `Let's keep the streak alive — ${greetingFamiliar.name}.`,
    recommenderNarrative: `Picked to match your ${scenario.replace('_', ' ')} focus.`,
    greeting_from: {
      familiar_id: greetingFamiliar.familiar_id,
      name: greetingFamiliar.name,
      voice_accent: greetingFamiliar.voice_accent,
    },
    atom_breakdown: breakdown,
  };
}

// ---------------------------------------------------------------------------
// Route mocks
// ---------------------------------------------------------------------------

/**
 * Mocks `GET /api/familiar/daily-dose` with the given scenario — the exact path
 * the aplus daily-dose service calls (daily-dose.service.ts: bff.get(
 * '/api/familiar/daily-dose')). The earlier `/bff/v1/me/familiar/daily-dose`
 * pattern never matched, so the real request fell through and the page hung on
 * the loading skeleton.
 */
export async function mockFamiliarDailyDose(page: Page, scenario: TopicMix): Promise<void> {
  const body = buildDailyDoseResponse(scenario);
  await page.route('**/api/familiar/daily-dose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Inject traceparent response header to satisfy Test 7 (OTLP trace assertion)
      headers: {
        'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  });
  // B2-C progressive enhancement: after the deterministic dose renders the
  // service fires GET /api/familiar/daily-dose/ai (the dose route glob above
  // does NOT match the deeper `/ai` path). Mock it `degraded` so the page keeps
  // the deterministic `familiarGreeting` from the dose fixture — hermetic and
  // deterministic, and prevents the long-running real call from stalling
  // `waitForLoadState('networkidle')`.
  await page.route('**/api/familiar/daily-dose/ai', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ greeting: '', ai_picks: [], narrative: '', degraded: true }),
    });
  });
  // daily-dose.service.load() forkJoins the dose with the myStreak GraphQL
  // query. Without a streak mock, streak$ never completes and forkJoin hangs,
  // leaving the page stuck on the loading skeleton (so dose-card-stack /
  // dose-familiar-greeting never render).
  await mockMyStreak(page);
}

/**
 * Mocks the `myStreak` GraphQL query (POST {bffBaseUrl}/api/v1/graphql) so the
 * daily-dose forkJoin completes. Non-streak GraphQL operations fall through to
 * an empty `data` payload (the dose page only issues myStreak).
 */
export async function mockMyStreak(page: Page): Promise<void> {
  await page.route('**/api/v1/graphql', async (route) => {
    const postData = route.request().postData() ?? '';
    const isStreak = postData.includes('myStreak');
    const data = isStreak
      ? {
          myStreak: {
            currentDays: 3,
            longestStreak: 5,
            lastActivityAt: '2026-05-29T00:00:00Z',
            status: 'active',
          },
        }
      : {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  });
}

/**
 * Mocks the familiar roster endpoint so FE `active-familiar.service.ts`
 * can resolve Phyllis's 4-Familiar roster.
 */
export async function mockPhyllisFamiliarRoster(page: Page): Promise<void> {
  await page.route('**/api/v1/me/familiars', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: FAMILIAR_ROSTER, total: FAMILIAR_ROSTER.length }),
    });
  });
}

/**
 * Mocks the familiar chat open endpoint. Used in Test 5 (chat persona open).
 * Returns enough of the persona shape for the chat panel to identify the Familiar.
 */
export async function mockFamiliarChatOpen(
  page: Page,
  familiarId: string,
): Promise<void> {
  const familiar = FAMILIAR_ROSTER.find((f) => f.familiar_id === familiarId)!;
  await page.route('**/api/v1/familiar/chat**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session_id: randomUUID(),
        familiar_id: familiar.familiar_id,
        familiar_name: familiar.name,
        voice_accent: familiar.voice_accent,
        persona_snapshot: {
          familiar_name: familiar.name,
          personality_traits: ['curious', 'encouraging'],
          evolution_stage: familiar.growth_stage,
          mood: 'engaged',
        },
        messages: [],
      }),
    });
  });
}
