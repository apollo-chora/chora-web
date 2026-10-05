/**
 * LiveClassroomPlayComponent — R+ Live Classroom expansion (ADR-168 Task #9).
 *
 * Presenter live-play view for a running LiveQuizSession. Opens the WS to
 * `/api/v1/live-quizzes/{sessionId}/ws` (via LiveClassroomPlayService) and
 * renders:
 *
 *   1. The live response tally for the current question (bar distribution).
 *   2. A leaderboard (top-N by cumulative score) — populated from `event`
 *      frames when the BE carries leaderboard data.
 *   3. Per-option explainers, revealed per the quiz's `explainerMode`.
 *
 * Route: /r/classroom/play/:sessionId  (sessionId bound via
 * withComponentInputBinding). The optional `explainerMode` query param +
 * `quizId` carry the parent quiz context so the reveal policy is honoured
 * without an extra fetch; absent → defaults to END_OF_QUESTION.
 *
 * Standalone, OnPush, signal-first per chora-web/CLAUDE.md §3.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import {
  coerceExplainerMode,
  type ExplainerMode,
} from '../quiz-builder/quiz-builder.model';
import { LiveClassroomPlayService } from './live-classroom-play.service';
import {
  buildTallyRows,
  shouldRevealExplainers,
  type LivePlayTallyRow,
} from './live-classroom-play.model';

@Component({
  selector: 'chora-rplus-live-classroom-play',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './live-classroom-play.component.html',
  styleUrl: './live-classroom-play.component.scss',
})
export class LiveClassroomPlayComponent implements OnInit {
  private readonly play = inject(LiveClassroomPlayService);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param — the LiveQuizSession id to follow. */
  readonly sessionId = input<string>('');
  /** Optional query param — the quiz's explainer disclosure policy. */
  readonly explainerMode = input<string>('END_OF_QUESTION');

  readonly connectionState = this.play.connectionState;
  readonly snapshot = this.play.snapshot;
  readonly leaderboard = this.play.topLeaderboard;

  /**
   * L5.2 (CHO-1704): prefer the BE's nickname-keyed snapshot scoreboard over
   * the legacy gcid-accumulated board; fall back so old frames keep working.
   */
  readonly boardRows = computed<readonly { name: string; score: number }[]>(() => {
    const snapBoard = this.snapshot()?.scoreboard ?? [];
    if (snapBoard.length > 0) {
      return snapBoard.map((r) => ({ name: r.nickname, score: r.score }));
    }
    return this.leaderboard().map((e) => ({ name: e.displayName, score: e.score }));
  });

  /** Podium rows — only once the session has CLOSED (the finale moment). */
  readonly podium = computed(() => {
    const snap = this.snapshot();
    if (!snap || snap.state !== 'CLOSED') return [];
    return snap.podium ?? [];
  });

  /** Coerced explainer policy. */
  readonly mode = computed<ExplainerMode>(() =>
    coerceExplainerMode(this.explainerMode()),
  );

  readonly state = computed(() => this.snapshot()?.state ?? 'ARMED');

  /**
   * The question the tally is rendered for — the question with the most
   * recent responses (highest count of choices). The BE snapshot only
   * carries questions that have at least one response, so we pick the last
   * key deterministically (questionIds sort lexicographically; the current
   * one is whichever the instructor advanced to). Empty until a response
   * lands.
   */
  readonly currentQuestionId = computed<string>(() => {
    const snap = this.snapshot();
    if (!snap) return '';
    const qids = Object.keys(snap.responseCounts).sort();
    return qids.length > 0 ? qids[qids.length - 1]! : '';
  });

  readonly tallyRows = computed<readonly LivePlayTallyRow[]>(() =>
    buildTallyRows(this.snapshot(), this.currentQuestionId()),
  );

  readonly totalResponses = computed<number>(
    () => this.snapshot()?.totalResponses ?? 0,
  );

  readonly explainersRevealed = computed<boolean>(() =>
    shouldRevealExplainers(this.mode(), this.state()),
  );

  readonly isClosed = computed<boolean>(() => this.state() === 'CLOSED');

  ngOnInit(): void {
    const id = this.sessionId().trim();
    if (id.length > 0) {
      this.play.connect(id);
    }
    this.destroyRef.onDestroy(() => this.play.disconnect());
  }
}
