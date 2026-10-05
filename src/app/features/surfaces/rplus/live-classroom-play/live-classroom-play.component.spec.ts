import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LiveClassroomPlayComponent } from './live-classroom-play.component';
import { LiveClassroomPlayService } from './live-classroom-play.service';
import type {
  LivePlayConnectionState,
} from './live-classroom-play.service';
import {
  topNLeaderboard,
  type LivePlayLeaderboardEntry,
  type LivePlaySnapshot,
} from './live-classroom-play.model';

/**
 * Fake LiveClassroomPlayService with writable signals so the spec can drive
 * the play view's render states without a real WebSocket. The component only
 * reads `connectionState`, `snapshot`, `topLeaderboard` and calls
 * `connect`/`disconnect`.
 */
class FakePlayService {
  readonly connectionState = signal<LivePlayConnectionState>('connecting');
  readonly snapshot = signal<LivePlaySnapshot | null>(null);
  private readonly _board = signal<readonly LivePlayLeaderboardEntry[]>([]);
  readonly topLeaderboard = signal<readonly LivePlayLeaderboardEntry[]>([]);
  connectSpy = vi.fn<(id: string) => void>();
  disconnectSpy = vi.fn<() => void>();

  connect(id: string): void {
    this.connectSpy(id);
  }
  disconnect(): void {
    this.disconnectSpy();
  }
  setBoard(entries: readonly LivePlayLeaderboardEntry[]): void {
    this._board.set(entries);
    this.topLeaderboard.set(topNLeaderboard(entries, 10));
  }
}

function snap(
  override: Partial<LivePlaySnapshot> = {},
): LivePlaySnapshot {
  return {
    id: 'sess-1',
    liveQuizId: 'lq-1',
    tenantId: 't',
    instructorGcid: 'g',
    state: 'LIVE',
    startedAt: null,
    endedAt: null,
    responseCounts: { q1: { A: 2, B: 6 } },
    totalResponses: 8,
    scoreboard: [],
    podium: [],
    ...override,
  };
}

describe('LiveClassroomPlayComponent', () => {
  let fixture: ComponentFixture<LiveClassroomPlayComponent>;
  let element: HTMLElement;
  let fake: FakePlayService;

  beforeEach(() => {
    fake = new FakePlayService();
    TestBed.configureTestingModule({
      imports: [LiveClassroomPlayComponent],
      providers: [{ provide: LiveClassroomPlayService, useValue: fake }],
    });
    fixture = TestBed.createComponent(LiveClassroomPlayComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('connects to the session id from the route input on init', () => {
    fixture.componentRef.setInput('sessionId', 'sess-99');
    fixture.detectChanges();
    expect(fake.connectSpy).toHaveBeenCalledWith('sess-99');
  });

  it('renders the surface-rplus accent root', () => {
    fixture.detectChanges();
    const root = element.querySelector(
      '[data-testid="rplus-live-classroom-play"]',
    );
    expect(root?.className).toContain('surface-rplus');
  });

  it('shows the connection-state badge', () => {
    fixture.detectChanges();
    const badge = element.querySelector(
      '[data-testid="live-play-connection"]',
    );
    expect(badge?.textContent).toContain(
      'rplus.liveClassroom.connection.connecting',
    );
  });

  it('renders the response tally bars for the current question', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fake.snapshot.set(snap());
    fixture.detectChanges();
    const barB = element.querySelector('[data-testid="live-play-bar-B"]');
    expect(barB?.textContent).toContain('6');
    expect(barB?.textContent).toContain('75%');
  });

  it('shows the tally empty state before any response', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fake.snapshot.set(snap({ responseCounts: {}, totalResponses: 0 }));
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="live-play-tally-empty"]'),
    ).not.toBeNull();
  });

  it('renders the leaderboard top-N rows', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fake.snapshot.set(snap());
    fake.setBoard([
      { gcid: 'g1', displayName: 'Ada', score: 30 },
      { gcid: 'g2', displayName: 'Bo', score: 50 },
    ]);
    fixture.detectChanges();
    const rows = element.querySelectorAll(
      '[data-testid^="live-play-board-row-"]',
    );
    expect(rows.length).toBe(2);
    // Bo (50) ranks first.
    expect(rows[0]?.textContent).toContain('Bo');
  });

  it('shows the leaderboard empty state when no scores yet', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="live-play-board-empty"]'),
    ).not.toBeNull();
  });

  it('reveals the explainer note per IMMEDIATE mode while LIVE', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fixture.componentRef.setInput('explainerMode', 'IMMEDIATE');
    fake.snapshot.set(snap({ state: 'LIVE' }));
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="live-play-reveal-note"]'),
    ).not.toBeNull();
  });

  it('does not reveal explainers under NEVER mode', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fixture.componentRef.setInput('explainerMode', 'NEVER');
    fake.snapshot.set(snap({ state: 'CLOSED' }));
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="live-play-reveal-note"]'),
    ).toBeNull();
  });

  it('shows the closed banner when the session is CLOSED', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fake.snapshot.set(snap({ state: 'CLOSED' }));
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="live-play-closed"]'),
    ).not.toBeNull();
  });

  it('disconnects on destroy', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fixture.detectChanges();
    fixture.destroy();
    expect(fake.disconnectSpy).toHaveBeenCalled();
  });

  // ── L5.2 nickname-keyed scoreboard + podium (CHO-1704 WS3) ────────────────

  it('prefers the snapshot nickname scoreboard over the legacy gcid board', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fake.snapshot.set(
      snap({
        scoreboard: [
          { nickname: 'AtomAce', score: 120, streak: 2, rank: 1 },
          { nickname: 'QuarkQueen', score: 90, streak: 0, rank: 2 },
        ],
      }),
    );
    fixture.detectChanges();
    const rows = element.querySelectorAll(
      '[data-testid^="live-play-board-row-"]',
    );
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('AtomAce');
    expect(rows[1]?.textContent).toContain('QuarkQueen');
  });

  it('renders the podium when the session closes with podium data', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fake.snapshot.set(
      snap({
        state: 'CLOSED',
        podium: [
          { nickname: 'QuarkQueen', score: 2000, streak: 3, rank: 1 },
          { nickname: 'BosonBoss', score: 1500, streak: 1, rank: 2 },
          { nickname: 'AtomAce', score: 1240, streak: 0, rank: 3 },
        ],
      }),
    );
    fixture.detectChanges();
    const podium = element.querySelector('[data-testid="live-play-podium"]');
    expect(podium).not.toBeNull();
    expect(podium?.textContent).toContain('QuarkQueen');
    expect(podium?.textContent).toContain('2000');
  });

  it('shows no podium while LIVE even if a scoreboard exists', () => {
    fixture.componentRef.setInput('sessionId', 'sess-1');
    fake.snapshot.set(
      snap({
        scoreboard: [{ nickname: 'AtomAce', score: 1, streak: 0, rank: 1 }],
      }),
    );
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="live-play-podium"]'),
    ).toBeNull();
  });
});
