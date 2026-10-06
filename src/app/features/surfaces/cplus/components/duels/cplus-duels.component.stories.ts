/**
 * CplusDuelsComponent stories — WS5 UI polish.
 *
 * Variants:
 *   - Lobby          — rating bar + preset selector + category tabs + leaderboard
 *   - Searching      — spinner + countdown + cancel
 *   - Arena          — question + options + combo streak + score
 *   - ArenaTimeout   — round_timeout result (skip)
 *   - Results        — win/loss/draw outcome + back-to-lobby
 *
 * Uses stub services injected via Storybook providers — no real HTTP/WS.
 * Tablet viewport (1024px) primary canvas per chora-web CLAUDE.md §4.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { CplusDuelsComponent } from './cplus-duels.component';
import { CplusDuelsService } from '../../services/cplus-duels.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import type {
  DuelRating,
  DuelLeaderboardEntry,
  QueueState,
  RatingState,
  LeaderboardState,
} from '../../models/cplus-duel.model';

const CHALLENGER_GCID = 'gcid-challenger-aaaa';

const RATING: DuelRating = {
  gcid: CHALLENGER_GCID,
  rating: 1247,
  wins: 10,
  losses: 3,
  draws: 2,
  peak_elo: 1300,
  completed_courses: 5,
  course_bonus: 100,
  proficiency: 1347,
};

const ENTRIES: readonly DuelLeaderboardEntry[] = [
  { gcid: 'gcid-aria', display_name: 'Aria', rating: 1500, wins: 20, losses: 1, draws: 0, peak_elo: 1550 },
  { gcid: 'gcid-jonas', display_name: 'Jonas', rating: 1400, wins: 15, losses: 3, draws: 1, peak_elo: 1450 },
  { gcid: CHALLENGER_GCID, display_name: 'You', rating: 1247, wins: 10, losses: 3, draws: 2, peak_elo: 1300 },
];

class StubAuthService {
  private readonly _gcid = signal(CHALLENGER_GCID);
  gcid() { return this._gcid(); }
  getToken() { return 'stub-token'; }
  roles() { return ['learner']; }
}

class StubDuelsService {
  readonly queueState = signal<QueueState>({ status: 'idle' });
  readonly ratingState = signal<RatingState>({ status: 'success', rating: RATING });
  readonly leaderboardState = signal<LeaderboardState>({ status: 'success', entries: ENTRIES });
  readonly listState = signal({ status: 'idle' });
  loadMyRating() { return Promise.resolve(); }
  loadLeaderboard() { return Promise.resolve(); }
  enterQueue() { return Promise.resolve(null); }
  cancelQueue() { return Promise.resolve(true); }
  heartbeat() { return Promise.resolve(null); }
  getQueueStatus() { return Promise.resolve(null); }
  resetQueue() { this.queueState.set({ status: 'idle' }); }
}

const meta: Meta<CplusDuelsComponent> = {
  title: 'C+/Duels/Duels',
  component: CplusDuelsComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tabletLandscape' },
  },
  decorators: [
    (_story) => ({
      applicationConfig: {
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: AuthService, useClass: StubAuthService },
          { provide: CplusDuelsService, useClass: StubDuelsService },
        ],
      },
    }),
  ],
};
export default meta;

type Story = StoryObj<CplusDuelsComponent>;

export const Lobby: Story = {};

export const Searching: Story = {
  render: () => ({
    template: `<chora-cplus-duels></chora-cplus-duels>`,
    applicationConfig: {
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: StubAuthService },
        {
          provide: CplusDuelsService,
          useFactory: () => {
            const svc = new StubDuelsService();
            svc.queueState.set({ status: 'finding', expires_at: '2026-07-26T08:10:00Z' });
            return svc;
          },
        },
      ],
    },
  }),
};

export const Arena: Story = {
  render: () => ({
    template: `<chora-cplus-duels></chora-cplus-duels>`,
    applicationConfig: {
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: StubAuthService },
        {
          provide: CplusDuelsService,
          useFactory: () => {
            const svc = new StubDuelsService();
            return svc;
          },
        },
      ],
    },
  }),
};
