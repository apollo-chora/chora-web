import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';

import { CplusDuelsService } from '../../services/cplus-duels.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import { CplusPageHeaderComponent } from '../shared/cplus-page-header/cplus-page-header.component';
import { CplusCardComponent } from '../shared/cplus-card/cplus-card.component';
import type { CplusBreadcrumbItem } from '../shared/cplus-breadcrumb/cplus-breadcrumb.component';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { environment } from '../../../../../../environments/environment';

type DuelStep = 'lobby' | 'searching' | 'arena';

/** Duel gameplay mode (classic sequential vs blitz). */
type DuelMode = 'classic' | 'blitz';

/** Blitz win condition. */
type BlitzVariant = 'timed' | 'race';

/** WS4 question-count presets (both players must agree). */
type QuestionPreset = 'quick' | 'standard' | 'marathon';
const PRESET_COUNT: Record<QuestionPreset, number> = {
  quick: 5,
  standard: 10,
  marathon: 15,
};

/** WS1 category presets (mirrors the profiler 6-category taxonomy + overall). */
type CategoryPreset = 'overall' | 'programming' | 'mathematics' | 'science' | 'humanities' | 'arts' | 'languages';
const CATEGORY_LABELS: readonly CategoryPreset[] = [
  'overall', 'programming', 'mathematics', 'science', 'humanities', 'arts', 'languages',
] as const;

/** Blitz question delivered via blitz_start frame. */
interface BlitzQuestion {
  readonly round_no: number;
  readonly atom_id: string;
  readonly question: string;
  readonly options: readonly string[];
}

/** Blitz per-answer result for display. */
interface BlitzAnswerResult {
  readonly correct: boolean;
  readonly points: number;
}

@Component({
  selector: 'chora-cplus-duels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    CplusPageHeaderComponent,
    CplusCardComponent,
  ],
  templateUrl: './cplus-duels.component.html',
  styleUrl: './cplus-duels.component.scss',
})
export class CplusDuelsComponent implements OnInit, OnDestroy {
  private readonly duelsService = inject(CplusDuelsService);
  private readonly auth = inject(AuthService);

  readonly myGcid = computed(() => this.auth.gcid());
  readonly ratingState = this.duelsService.ratingState;
  readonly leaderboardState = this.duelsService.leaderboardState;
  readonly queueState = this.duelsService.queueState;

  readonly breadcrumb: CplusBreadcrumbItem[] = [
    { label: 'C+', path: '/c/feed' },
    { label: 'Duels', path: null },
  ];

  readonly step = signal<DuelStep>('lobby');
  readonly duelId = signal<string | null>(null);
  readonly wsConnected = signal(false);
  readonly wsReconnecting = signal(false);
  readonly connectionLost = signal(false);
  readonly currentRound = signal(0);
  readonly totalRounds = signal(0);
  readonly scoreMe = signal(0);
  readonly scoreOpponent = signal(0);
  /** WS5: combo streak count for the streak indicator. */
  readonly comboMe = signal(0);
  readonly question = signal<string>('');
  readonly options = signal<readonly string[]>([]);
  readonly selectedAnswer = signal<string | null>(null);
  readonly lastResult = signal<{ correct: boolean; points: number; timeout?: boolean } | null>(null);
  /** Contextual hype/encouragement message shown after each answer. */
  readonly hypeMessage = signal<string | null>(null);
  /** True when the player answered wrong but the round is still open (opponent can steal). */
  readonly waitingForOpponent = signal(false);
  readonly duelOutcome = signal<'win' | 'loss' | 'draw' | null>(null);
  readonly searchError = signal<string | null>(null);
  /** WS4: selected question-count preset for the next queue. */
  readonly selectedPreset = signal<QuestionPreset>('quick');
  /** WS1: selected category for matchmaking + leaderboard. */
  readonly selectedCategory = signal<CategoryPreset>('overall');
  /** Blitz: selected gameplay mode (classic vs blitz). */
  readonly selectedMode = signal<DuelMode>('classic');
  /** Blitz: selected win condition (timed vs race). Only used when mode=blitz. */
  readonly selectedBlitzVariant = signal<BlitzVariant>('timed');
  /** Blitz: all questions delivered at once via blitz_start frame. */
  readonly blitzQuestions = signal<readonly BlitzQuestion[]>([]);
  /** Blitz: map of round_no → whether this player answered. */
  readonly blitzAnswered = signal<Set<number>>(new Set());
  /** Blitz: map of round_no → last result for that question. */
  readonly blitzResults = signal<Map<number, BlitzAnswerResult>>(new Map());
  /** Blitz: time limit in seconds for timed variant (0 for race). */
  readonly blitzTimeLimitSec = signal(0);
  /** Blitz: countdown string for the overall blitz timer. */
  readonly blitzCountdown = signal<string>('');
  readonly categoryLabels = CATEGORY_LABELS;
  /** MM:ss countdown string derived from expires_at (WS2/G2). */
  readonly searchCountdown = signal<string>('');
  /** Per-round countdown string (M:SS) derived from the server-stamped deadline_at. */
  readonly roundCountdown = signal<string>('');
  /** Server-time offset (ms) so the countdown is clock-skew-safe. */
  private serverTimeOffsetMs = 0;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  /** Per-round timer (separate from the matchmaking countdown). */
  private roundCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly BASE_RECONNECT_DELAY_MS = 1000;
  private queueNonce = 0;
  /** Timestamp (ms) the current round started — used to compute answer_time_ms. */
  private roundStartedAtMs = 0;
  /** Blitz: timestamp (ms) the blitz started — for answer_time_ms in blitz mode. */
  private blitzStartedAtMs = 0;
  /** Blitz: overall countdown timer. */
  private blitzCountdownTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * The challenger GCID captured from the snapshot frame. round_resolved +
   * duel_completed frames carry scores but not the role assignment, so we
   * remember which role the viewer plays from the snapshot to map scores
   * correctly (Bug 4 fix).
   */
  private snapshotChallengerGcid = '';

  ngOnInit(): void {
    void this.duelsService.loadMyRating();
    void this.duelsService.loadLeaderboard();
  }
  ngOnDestroy(): void {
    this.stopHeartbeat();
    this.stopCountdown();
    this.stopRoundCountdown();
    this.stopBlitzCountdown();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeWebSocket();
  }

  async findMatch(): Promise<void> {
    this.searchError.set(null);
    this.queueNonce++;
    const key = `queue-${Date.now()}-${this.queueNonce}`;
    const resp = await this.duelsService.enterQueue(
      key,
      undefined,
      PRESET_COUNT[this.selectedPreset()],
      this.selectedCategory(),
      this.selectedMode(),
      this.selectedBlitzVariant(),
    );

    if (resp && resp.status === 'finding') {
      this.syncServerOffset(resp.now);
      this.step.set('searching');
      this.startCountdown(resp.expires_at);
      this.startHeartbeat();
    } else if (this.queueState().status === 'error') {
      this.searchError.set((this.queueState() as { error: { message: string } }).error.message);
    }
  }

  selectMode(mode: DuelMode): void {
    this.selectedMode.set(mode);
  }

  selectBlitzVariant(variant: BlitzVariant): void {
    this.selectedBlitzVariant.set(variant);
  }

  get isBlitz(): boolean {
    return this.selectedMode() === 'blitz';
  }

  selectPreset(preset: QuestionPreset): void {
    this.selectedPreset.set(preset);
  }

  selectCategory(category: CategoryPreset): void {
    this.selectedCategory.set(category);
    void this.duelsService.loadLeaderboard(category);
  }

  async cancelMatchmaking(): Promise<void> {
    this.stopHeartbeat();
    this.stopCountdown();
    await this.duelsService.cancelQueue();
    this.step.set('lobby');
    this.duelsService.resetQueue();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      const status = await this.duelsService.heartbeat();
      if (!status) return;
      this.syncServerOffset(status.now);

      if (status.status === 'matched' && status.duel_id) {
        this.stopHeartbeat();
        this.stopCountdown();
        this.enterArena(status.duel_id);
      } else if (status.status === 'expired' || status.status === 'abandoned') {
        this.stopHeartbeat();
        this.stopCountdown();
        this.handleTimeout();
      } else if (status.status === 'finding' && status.expires_at) {
        // Refresh the countdown from the server's expires_at (the queue
        // row may have been re-queued with a fresh deadline).
        this.startCountdown(status.expires_at);
      }
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Start a clock-skew-safe countdown to expiresAt (WS2/G2). The server
   * includes `now` in the heartbeat so the FE can compute the offset
   * between client + server clocks. Updates every 1s.
   */
  private startCountdown(expiresAt?: string): void {
    if (!expiresAt) return;
    const deadline = Date.parse(expiresAt);
    if (Number.isNaN(deadline)) return;
    this.stopCountdown();
    this.tickCountdown(deadline);
    this.countdownTimer = setInterval(() => this.tickCountdown(deadline), 1_000);
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.searchCountdown.set('');
  }

  /**
   * Sync the client↔server clock offset from a server-stamped `now`.
   * Convention: remainingMs = deadlineMs - Date.now() + offset, so the
   * offset is clientNow - serverNow. Without this the countdowns render
   * the skew as extra time (e.g. a 405s drift shows 7:00 on a 15s round)
   * while the server enforces the real deadline.
   */
  private syncServerOffset(serverNow?: string): void {
    if (!serverNow) return;
    const serverMs = Date.parse(serverNow);
    if (Number.isNaN(serverMs)) return;
    this.serverTimeOffsetMs = Date.now() - serverMs;
  }

  private tickCountdown(deadlineMs: number): void {
    const remainingMs = deadlineMs - Date.now() + this.serverTimeOffsetMs;
    if (remainingMs <= 0) {
      this.searchCountdown.set('0:00');
      return;
    }
    const totalSec = Math.floor(remainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    this.searchCountdown.set(`${min}:${sec.toString().padStart(2, '0')}`);
  }

  /**
   * Start the per-round countdown using the server-stamped deadline_at.
   * Clock-skew-safe via serverTimeOffsetMs (same offset as the search
   * countdown). Fires every 500ms for a smoother bar.
   */
  private startRoundCountdown(deadlineAt?: string): void {
    this.stopRoundCountdown();
    if (!deadlineAt) return;
    const deadline = Date.parse(deadlineAt);
    if (Number.isNaN(deadline)) return;
    this.tickRoundCountdown(deadline);
    this.roundCountdownTimer = setInterval(() => this.tickRoundCountdown(deadline), 500);
  }

  private stopRoundCountdown(): void {
    if (this.roundCountdownTimer !== null) {
      clearInterval(this.roundCountdownTimer);
      this.roundCountdownTimer = null;
    }
    this.roundCountdown.set('');
  }

  private tickRoundCountdown(deadlineMs: number): void {
    const remainingMs = deadlineMs - Date.now() + this.serverTimeOffsetMs;
    if (remainingMs <= 0) {
      this.roundCountdown.set('0:00');
      this.stopRoundCountdown();
      return;
    }
    const totalSec = Math.ceil(remainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    this.roundCountdown.set(`${min}:${sec.toString().padStart(2, '0')}`);
  }

  private handleTimeout(): void {
    this.searchError.set('cplus.duels.no_match');
    this.step.set('lobby');
    this.duelsService.resetQueue();
  }

  private enterArena(duelId: string): void {
    this.duelId.set(duelId);
    this.step.set('arena');
    this.duelsService.resetQueue();
    this.connectWebSocket(duelId);
  }

  backToLobby(): void {
    this.step.set('lobby');
    this.duelOutcome.set(null);
    this.connectionLost.set(false);
    this.stopRoundCountdown();
    this.stopBlitzCountdown();
    this.blitzQuestions.set([]);
    this.blitzAnswered.set(new Set());
    this.blitzResults.set(new Map());
    this.hypeMessage.set(null);
    this.closeWebSocket();
    void this.duelsService.loadMyRating();
    void this.duelsService.loadLeaderboard();
  }

  private closeWebSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect loop during manual close
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected.set(false);
    this.wsReconnecting.set(false);
    this.reconnectAttempts = 0;
  }

  private connectWebSocket(duelId: string): void {
    // Browsers cannot set the Authorization header on a native WebSocket
    // handshake (RFC 6455 — the constructor takes only a URL + subprotocols).
    // The gateway's extractSessionToken accepts ?access_token= for WS
    // upgrade requests only (jwt_auth.go), so pass the session JWT via
    // query param. The gateway strips it before forwarding to chora-sharing
    // and stamps X-Tenant-Id + gcid headers from the validated claims.
    const token = this.auth.getToken();
    const tokenParam = token ? `?access_token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${environment.wsBaseUrl}/v1/duels/${duelId}/ws${tokenParam}`;

    // Don't reconnect if the duel is already completed or the user left.
    if (this.duelOutcome() !== null || this.step() !== 'arena') {
      return;
    }

    this.ws = new WebSocket(wsUrl);
    this.ws.onopen = () => {
      this.wsConnected.set(true);
      this.wsReconnecting.set(false);
      this.reconnectAttempts = 0;
      // The server sends a full snapshot on connect, so reconnection
      // after a transient drop resumes the duel seamlessly.
    };
    this.ws.onclose = () => {
      this.wsConnected.set(false);
      // Don't reconnect if the duel is over or the user left the arena.
      if (this.duelOutcome() !== null || this.step() !== 'arena') {
        return;
      }
      this.scheduleReconnect(duelId);
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleWsMessage(msg);
      } catch {
        // ignore malformed
      }
    };
  }

  private scheduleReconnect(duelId: string): void {
    if (this.reconnectAttempts >= CplusDuelsComponent.MAX_RECONNECT_ATTEMPTS) {
      this.wsReconnecting.set(false);
      this.connectionLost.set(true);
      return;
    }
    this.wsReconnecting.set(true);
    const delay = CplusDuelsComponent.BASE_RECONNECT_DELAY_MS
      * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket(duelId);
    }, delay);
  }

  private handleWsMessage(msg: { kind: string; payload: unknown }): void {
    const p = msg.payload as Record<string, unknown>;
    switch (msg.kind) {
      case 'snapshot': {
        this.snapshotChallengerGcid = String(p['challenger_gcid'] ?? '');
        this.scoreMe.set(this.mapScoreToMe(p));
        this.scoreOpponent.set(this.mapScoreToOpponent(p));
        this.comboMe.set(this.mapComboToMe(p));
        this.totalRounds.set(Number(p['total_rounds'] ?? 0));
        break;
      }
      case 'blitz_start': {
        const questions = (p['questions'] as Record<string, unknown>[]) ?? [];
        this.blitzQuestions.set(questions.map(q => ({
          round_no: Number(q['round_no'] ?? 0),
          atom_id: String(q['atom_id'] ?? ''),
          question: String(q['question'] ?? ''),
          options: (q['options'] as string[]) ?? [],
        })));
        this.blitzTimeLimitSec.set(Number(p['time_limit_sec'] ?? 0));
        this.blitzAnswered.set(new Set());
        this.blitzResults.set(new Map());
        this.blitzStartedAtMs = Date.now();
        this.syncServerOffset(String(p['server_now'] ?? ''));
        if (p['started_at'] && p['time_limit_sec']) {
          this.startBlitzCountdown(String(p['started_at']), Number(p['time_limit_sec']));
        }
        break;
      }
      case 'blitz_answer_resolved': {
        const roundNo = Number(p['round_no'] ?? 0);
        const correct = Boolean(p['correct']);
        const points = Number(p['points_awarded'] ?? 0);
        this.scoreMe.set(this.mapScoreToMe(p));
        this.scoreOpponent.set(this.mapScoreToOpponent(p));
        this.comboMe.set(Number(p['current_combo'] ?? 0));
        const answered = new Set(this.blitzAnswered());
        answered.add(roundNo);
        this.blitzAnswered.set(answered);
        const results = new Map(this.blitzResults());
        results.set(roundNo, { correct, points });
        this.blitzResults.set(results);
        this.hypeMessage.set(this.generateHype(correct, points, false, true));
        const duelStatus = String(p['duel_status'] ?? '');
        if (duelStatus === 'completed') {
          this.stopBlitzCountdown();
          const winner = String(p['winner_gcid'] ?? '');
          if (winner === '') {
            this.duelOutcome.set('draw');
          } else if (winner === this.myGcid()) {
            this.duelOutcome.set('win');
          } else {
            this.duelOutcome.set('loss');
          }
          setTimeout(() => {
            void this.duelsService.loadMyRating();
            void this.duelsService.loadLeaderboard();
          }, 500);
        }
        break;
      }
      case 'round_start': {
        this.currentRound.set(Number(p['round_no'] ?? 0));
        this.question.set(String(p['question'] ?? ''));
        this.options.set((p['options'] as string[]) ?? []);
        this.selectedAnswer.set(null);
        this.lastResult.set(null);
        this.hypeMessage.set(null);
        this.waitingForOpponent.set(false);
        this.roundStartedAtMs = Date.now();
        // Sync the clock offset from the server clock stamped on the frame
        // itself — skew correction travels with the question and does not
        // depend on which queue responses happened to carry `now`. The
        // deadline is server-stamped at first serve (round 1) or at round
        // advance (2+), so it is already truthful; do NOT re-derive the
        // offset from deadline_at - timer_sec (that would hide latency by
        // resetting the displayed timer to full).
        this.syncServerOffset(String(p['server_now'] ?? ''));
        this.startRoundCountdown(String(p['deadline_at'] ?? ''));
        break;
      }
      case 'round_resolved': {
        this.stopRoundCountdown();
        this.scoreMe.set(this.mapScoreToMe(p));
        this.scoreOpponent.set(this.mapScoreToOpponent(p));
        const correct = Boolean(p['correct']);
        const points = Number(p['points_awarded'] ?? 0);
        const duelStatus = String(p['duel_status'] ?? '');
        this.lastResult.set({
          correct,
          points,
        });
        this.hypeMessage.set(this.generateHype(correct, points, false, false));
        // FCFS: a wrong answer doesn't resolve the round — the opponent
        // can still steal. Show a "waiting" state until the next
        // round_start (round advanced) or round_timeout arrives.
        this.waitingForOpponent.set(!correct && duelStatus === 'in_progress');
        break;
      }
      case 'round_timeout': {
        this.stopRoundCountdown();
        this.waitingForOpponent.set(false);
        // WS3: the server-side round timer fired. The round auto-resolved
        // as both-unanswered (no points, no winner). Show a skip result +
        // advance to the next round.
        this.scoreMe.set(this.mapScoreToMe(p));
        this.scoreOpponent.set(this.mapScoreToOpponent(p));
        this.lastResult.set({ correct: false, points: 0, timeout: true });
        this.hypeMessage.set(this.generateHype(false, 0, true, false));
        break;
      }
      case 'duel_completed': {
        this.stopRoundCountdown();
        this.waitingForOpponent.set(false);
        this.scoreMe.set(this.mapScoreToMe(p));
        this.scoreOpponent.set(this.mapScoreToOpponent(p));
        const winner = String(p['winner_gcid'] ?? '');
        if (winner === '') {
          this.duelOutcome.set('draw');
        } else if (winner === this.myGcid()) {
          this.duelOutcome.set('win');
        } else {
          this.duelOutcome.set('loss');
        }
        setTimeout(() => {
          void this.duelsService.loadMyRating();
          void this.duelsService.loadLeaderboard();
        }, 500);
        break;
      }
      case 'error': {
        // Surface WS errors instead of silently swallowing them —
        // previously a missing case here hid "duel not found" (tenant
        // context bug) as a silent "stuck" arena. BUT ignore errors
        // when the duel is already completed (FCFS race: opponent
        // clicks an answer after the other player already won) — those
        // are expected and shouldn't show in the lobby as a search error.
        if (this.duelOutcome() !== null) {
          break;
        }
        this.searchError.set(String(p['message'] ?? 'duel error'));
        break;
      }
    }
  }

  /**
   * Map the challenger/opponent wire scores to "me"/"opponent" based on
   * which participant the viewer is (Bug 4 fix). The snapshot frame carries
   * challenger_gcid + opponent_gcid; for round_resolved + duel_completed
   * we fall back to the snapshot's role assignment (stored when the snapshot
   * frame arrived). If the viewer's GCID is unknown, we default to the
   * challenger view (preserves the prior behaviour for the challenger).
   */
  private mapScoreToMe(p: Record<string, unknown>): number {
    const challenger = String(p['challenger_gcid'] ?? this.snapshotChallengerGcid ?? '');
    const me = this.myGcid();
    if (me && me === challenger) {
      return Number(p['score_challenger'] ?? 0);
    }
    return Number(p['score_opponent'] ?? 0);
  }

  private mapScoreToOpponent(p: Record<string, unknown>): number {
    const challenger = String(p['challenger_gcid'] ?? this.snapshotChallengerGcid ?? '');
    const me = this.myGcid();
    if (me && me === challenger) {
      return Number(p['score_opponent'] ?? 0);
    }
    return Number(p['score_challenger'] ?? 0);
  }

  /** WS5: map the combo streak to "me" based on viewer role. */
  private mapComboToMe(p: Record<string, unknown>): number {
    const challenger = String(p['challenger_gcid'] ?? this.snapshotChallengerGcid ?? '');
    const me = this.myGcid();
    if (me && me === challenger) {
      return Number(p['combo_challenger'] ?? 0);
    }
    return Number(p['combo_opponent'] ?? 0);
  }

  /** Generate a contextual hype/encouragement message after an answer. */
  private generateHype(correct: boolean, _points: number, isTimeout: boolean, isBlitz: boolean): string {
    const me = this.scoreMe();
    const opp = this.scoreOpponent();
    const combo = this.comboMe();
    const round = this.currentRound();
    const total = this.totalRounds();
    const remaining = total - round;

    if (isTimeout) {
      const timeouts = ['Time slipped away — regroup and focus!', 'No worries, the next one is yours!', 'Shake it off — let\u2019s go again!'];
      return timeouts[Math.floor(Math.random() * timeouts.length)];
    }

    if (correct) {
      const leading = me > opp;
      const tied = me === opp;
      const gap = Math.abs(me - opp);

      if (combo >= 3) {
        return `🔥 ${combo}x streak! You\u2019re on fire!`;
      }
      if (leading && gap > 30) {
        return `Dominating! ${gap} points ahead — keep pushing!`;
      }
      if (leading && gap > 0) {
        return `You\u2019re in the lead! Stay sharp!`;
      }
      if (tied) {
        return `All tied up — break the deadlock!`;
      }
      if (isBlitz && remaining > 0) {
        return `Nice! ${remaining} question${remaining > 1 ? 's' : ''} left — go go go!`;
      }
      if (!leading && gap <= 15) {
        return `Almost there — just ${gap} point${gap > 1 ? 's' : ''} behind!`;
      }
      const praise = ['Cracked it!', 'Nailed it!', 'Too easy!', 'Locked in!', 'On target!'];
      return praise[Math.floor(Math.random() * praise.length)];
    }

    // Wrong answer — encouragement
    const losing = me < opp;
    const gap = opp - me;

    if (losing && gap > 40) {
      return `Tough one — but the comeback starts now!`;
    }
    if (losing && gap > 15) {
      return `That\u2019s okay — ${gap} points is nothing. Next one is yours!`;
    }
    if (combo === 0 && round > 1) {
      return `Shake it off — reset and charge the next one!`;
    }
    const encouragement = [
      'No stress — next question is yours!',
      'That\u2019s okay, you\u2019ve got this!',
      'Brush it off — keep going!',
      'Stay focused — the next one counts!',
    ];
    return encouragement[Math.floor(Math.random() * encouragement.length)];
  }

  selectAnswer(answer: string): void {
    this.selectedAnswer.set(answer);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Compute answer_time_ms so the backend speed bonus (WS0 Bug 2) is
      // live — before this the FE never sent it, leaving the speed bonus
      // as dead code. Falls back to 0 if round_start never arrived.
      const answerTimeMs = this.roundStartedAtMs > 0
        ? Math.max(0, Date.now() - this.roundStartedAtMs)
        : 0;
      this.ws.send(JSON.stringify({
        round_no: this.currentRound(),
        answer,
        answer_time_ms: answerTimeMs,
      }));
    }
  }

  /** Blitz: send an answer for a specific question (any order). */
  selectBlitzAnswer(roundNo: number, answer: string): void {
    if (this.blitzAnswered().has(roundNo)) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const answerTimeMs = this.blitzStartedAtMs > 0
        ? Math.max(0, Date.now() - this.blitzStartedAtMs)
        : 0;
      this.ws.send(JSON.stringify({
        round_no: roundNo,
        answer,
        answer_time_ms: answerTimeMs,
      }));
    }
  }

  private startBlitzCountdown(startedAt: string, timeLimitSec: number): void {
    this.stopBlitzCountdown();
    const start = Date.parse(startedAt);
    if (Number.isNaN(start)) return;
    const deadline = start + timeLimitSec * 1000;
    this.tickBlitzCountdown(deadline);
    this.blitzCountdownTimer = setInterval(() => this.tickBlitzCountdown(deadline), 500);
  }

  private stopBlitzCountdown(): void {
    if (this.blitzCountdownTimer !== null) {
      clearInterval(this.blitzCountdownTimer);
      this.blitzCountdownTimer = null;
    }
    this.blitzCountdown.set('');
  }

  private tickBlitzCountdown(deadlineMs: number): void {
    const remainingMs = deadlineMs - Date.now() + this.serverTimeOffsetMs;
    if (remainingMs <= 0) {
      this.blitzCountdown.set('0:00');
      this.stopBlitzCountdown();
      return;
    }
    const totalSec = Math.ceil(remainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    this.blitzCountdown.set(`${min}:${sec.toString().padStart(2, '0')}`);
  }

  shortGcid(gcid: string): string {
    const short = gcid.replace(/^gcid-/, '').replace(/-/g, '').slice(0, 8);
    return short ? `gcid-${short}` : gcid;
  }
}
