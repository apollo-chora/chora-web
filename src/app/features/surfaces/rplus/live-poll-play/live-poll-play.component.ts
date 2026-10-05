/**
 * LivePollPlayComponent — R+ live-polling learner FE (Track 2).
 *
 * Learner play view for a single LivePoll. Opens the WS to
 * `/api/v1/live-polls/{pollId}/ws` (via LivePollPlayService) and renders:
 *
 *   1. The poll question + votable option buttons. Clicking an option casts
 *      a vote via REST (`castVote`); first-vote-wins server-side.
 *   2. The live per-option tally (bar distribution from vote_count /
 *      total_votes), updated by `vote_recorded` events over the WS.
 *
 * Voting is disabled when the poll is CLOSED (or DRAFT — not yet open) or
 * once the learner has cast their vote.
 *
 * Route: /r/poll/:pollId  (pollId bound via withComponentInputBinding).
 *
 * Standalone, OnPush, signal-first per chora-web/CLAUDE.md §3. Tablet-first
 * glassmorphism per the R+ surface.
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
import { LivePollPlayService } from './live-poll-play.service';
import type { LivePollState } from './live-poll-play.model';

@Component({
  selector: 'chora-rplus-live-poll-play',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './live-poll-play.component.html',
  styleUrl: './live-poll-play.component.scss',
})
export class LivePollPlayComponent implements OnInit {
  private readonly play = inject(LivePollPlayService);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param — the LivePoll id to follow. */
  readonly pollId = input<string>('');

  readonly connectionState = this.play.connectionState;
  readonly snapshot = this.play.snapshot;
  readonly tallyRows = this.play.tallyRows;
  readonly hasVoted = this.play.hasVoted;
  readonly votingOpen = this.play.votingOpen;

  readonly state = computed<LivePollState>(
    () => this.snapshot()?.state ?? 'DRAFT',
  );

  readonly question = computed<string>(() => this.snapshot()?.question ?? '');

  readonly totalVotes = computed<number>(
    () => this.snapshot()?.totalVotes ?? 0,
  );

  readonly isClosed = computed<boolean>(() => this.state() === 'CLOSED');

  /** Voting is allowed only while OPEN and before the learner has voted. */
  readonly canVote = computed<boolean>(
    () => this.votingOpen() && !this.hasVoted(),
  );

  ngOnInit(): void {
    const id = this.pollId().trim();
    if (id.length > 0) {
      this.play.connect(id);
    }
    this.destroyRef.onDestroy(() => this.play.disconnect());
  }

  /**
   * Cast the learner's vote for `label`. Guarded by `canVote` so a closed
   * poll or a second click is a no-op. Errors are swallowed here (the WS is
   * the source of truth for the resulting tally); a failed POST simply leaves
   * the optimistic `hasVoted` flip — acceptable for a transient classroom
   * poll, and the learner sees no live tally update if it truly failed.
   */
  vote(label: string): void {
    if (!this.canVote()) return;
    this.play.castVote(label).subscribe({
      error: () => { /* silent: WS replays authoritative state */ },
    });
  }
}
