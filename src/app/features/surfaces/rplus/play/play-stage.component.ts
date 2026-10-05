/**
 * PlayStageComponent — L5.2 Live Classroom learner stage (CHO-1704 WS3, ADR-179).
 *
 * The chromeless `/play/:code` route (pattern: `invite/:code` — no layout
 * component). One full-bleed stage that walks the 7-stage learner journey
 * from `docs/design/ux_live_classroom_play.md`:
 *
 *   JOIN → LOBBY → GET-READY → QUESTION → LOCKED → REVEAL → PODIUM
 *
 * Behaviour:
 *   - Resolves `:code` via GET by-code, then polls the snapshot every 2s
 *     (visibility-paused, reusing the presenter's proven stream). Polling
 *     starts immediately — the stage stays on JOIN until the learner has a
 *     roster identity, and a refresh mid-game auto-resumes because the
 *     snapshot's per-caller `me.nickname` proves prior membership.
 *   - Countdown is SERVER-anchored: skew is estimated once from the first
 *     frame's `updated_at`; a 250ms tick drives the conic ring + the local
 *     QUESTION→REVEAL flip at 0 (the BE enforces the true window at submit).
 *   - Submit holds the 201 `your_result` hidden until REVEAL; 409
 *     duplicate_response = already answered (LOCKED); 409 locked/not-open =
 *     "Too late — eyes on the big screen".
 *   - The poll stream stops only after one final CLOSED frame, so PODIUM
 *     always has data before polling halts.
 *   - ADR-179 phone exception applies to THIS ROUTE ONLY: the option grid
 *     is 2×2 at ≥768px and single-column below.
 *
 * Standalone, OnPush, signal-first per chora-web conventions.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import {
  ClassroomSessionSnapshot,
  OpenQuestion,
  SessionByCode,
  YourResult,
} from '../classroom/classroom.model';
import {
  PlayService,
  PlayStage,
  answeredCount,
  deriveStage,
  estimateSkewMs,
  ordinal,
  remainingFraction,
  remainingMs,
} from './play.service';

/** Fixed shape+colour coding for the option grid (never colour alone). */
export const OPTION_SHAPES: readonly string[] = ['▲', '■', '●', '◆'];

/** Countdown refresh cadence — display only; stages flip off serverNow. */
const TICK_MS = 250;

@Component({
  selector: 'chora-play-stage',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './play-stage.component.html',
  styleUrl: './play-stage.component.scss',
})
export class PlayStageComponent implements OnInit {
  private readonly play = inject(PlayService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stop$ = new Subject<void>();

  /** Join code from the route param (display-normalised). */
  readonly code = signal<string>(
    (this.route.snapshot.paramMap.get('code') ?? '')
      .toUpperCase()
      .replace(/[\s-]/g, ''),
  );

  /** Resolved session ref; null until GET by-code lands. */
  readonly session = signal<SessionByCode | null>(null);
  /** by-code resolution failure (404 = no ARMED/LIVE session). */
  readonly resolveError = signal<HttpErrorResponse | null>(null);
  /** Polling failure (fail loud — the stage shows the status). */
  readonly pollError = signal<HttpErrorResponse | null>(null);

  /** Latest polled snapshot. */
  readonly snapshot = signal<ClassroomSessionSnapshot | null>(null);

  /** Nickname draft (JOIN stage input). */
  readonly nickname = signal<string>('');
  /** True while the join POST is inflight. */
  readonly joining = signal<boolean>(false);
  /** i18n key for the inline JOIN error ('' = none). */
  readonly joinErrorKey = signal<string>('');
  /** Set on join 200 — `me.nickname` covers the refresh/rejoin path. */
  private readonly joinedExplicitly = signal<boolean>(false);

  /** The question_id this learner has answered (first-write-wins). */
  readonly answeredQuestionId = signal<string>('');
  /** Held 201 `your_result` — hidden until REVEAL. */
  readonly heldResult = signal<YourResult | null>(null);
  /** True after a 409 question_locked/not-open submit. */
  readonly tooLate = signal<boolean>(false);
  /** True while a submit POST is inflight. */
  readonly submitting = signal<boolean>(false);

  /** Local clock tick (250ms) — drives the ring + local stage flips. */
  private readonly nowTick = signal<number>(Date.now());
  /** server − local skew, estimated once from the first frame. */
  private readonly skewMs = signal<number | null>(null);
  /** `me.rank` captured when the current question opened (Δ-rank base). */
  readonly rankBaseline = signal<number | null>(null);

  /** Skew-corrected server-now. */
  readonly serverNow = computed<number>(
    () => this.nowTick() + (this.skewMs() ?? 0),
  );

  /** Roster identity: explicit join 200 OR per-caller `me` on the wire. */
  readonly joined = computed<boolean>(
    () =>
      this.joinedExplicitly() ||
      (this.snapshot()?.me?.nickname ?? '') !== '',
  );

  /** The 7-stage machine — single source of truth for the template. */
  readonly stage = computed<PlayStage>(() =>
    deriveStage(this.snapshot(), {
      joined: this.joined(),
      answeredQuestionId: this.answeredQuestionId(),
      serverNowMs: this.serverNow(),
    }),
  );

  readonly question = computed<OpenQuestion | null>(
    () => this.snapshot()?.openQuestion ?? null,
  );

  /** Post-close answer review rows (§4.6) — empty until CLOSED. */
  readonly reviewEntries = computed(() => this.snapshot()?.reveals ?? []);

  /** Remaining ms (null = untimed → no ring). */
  readonly remaining = computed<number | null>(() => {
    const q = this.question();
    return q ? remainingMs(q, this.serverNow()) : null;
  });

  /** Whole seconds for the ring label, clamped ≥ 0. */
  readonly remainingSeconds = computed<number | null>(() => {
    const r = this.remaining();
    return r === null ? null : Math.ceil(r / 1000);
  });

  /** Conic-gradient sweep in degrees (remaining fraction × 360). */
  readonly ringDegrees = computed<number>(() => {
    const q = this.question();
    if (!q) return 0;
    return Math.round(remainingFraction(q, this.serverNow()) * 360);
  });

  /** Last-5s pulse (reduced-motion safe via CSS). */
  readonly pulsing = computed<boolean>(() => {
    const s = this.remainingSeconds();
    return s !== null && s > 0 && s <= 5;
  });

  /** "k answered" footer counter. */
  readonly answered = computed<number>(() => answeredCount(this.snapshot()));

  /** Own result for the REVEAL stage — held 201 first, snapshot fallback. */
  readonly revealResult = computed<YourResult | null>(() => {
    const q = this.question();
    const held = this.heldResult();
    if (held && held.questionId === (q?.questionId ?? '')) return held;
    const last = this.snapshot()?.me?.lastResult ?? null;
    if (last && last.questionId === (q?.questionId ?? '')) return last;
    return null;
  });

  /** Rank delta vs the question-open baseline (positive = moved up). */
  readonly rankDelta = computed<number | null>(() => {
    const baseline = this.rankBaseline();
    const rank = this.snapshot()?.me?.rank ?? 0;
    if (baseline === null || baseline <= 0 || rank <= 0) return null;
    return baseline - rank;
  });

  /** PODIUM: total field size (frozen board → roster count fallbacks). */
  readonly podiumTotal = computed<number>(() => {
    const s = this.snapshot();
    if (!s) return 0;
    return (
      s.finalScoreboard.length || s.participantCount || s.participants.length
    );
  });

  /** Expose helpers to the template. */
  readonly ordinal = ordinal;
  readonly shapes = OPTION_SHAPES;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.stop$.next();
      this.stop$.complete();
    });
    // Countdown tick — display cadence only (stages re-derive off serverNow).
    const tick = setInterval(() => this.nowTick.set(Date.now()), TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(tick));

    const code = this.code();
    if (!code) return;
    this.play
      .resolveCode(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ref) => {
          this.session.set(ref);
          this.startPolling(ref.sessionId);
        },
        error: (err: HttpErrorResponse) => this.resolveError.set(err),
      });
  }

  /** JOIN stage — claim the nickname. */
  join(): void {
    const ref = this.session();
    const nickname = this.nickname().trim();
    if (!ref || this.joining()) return;
    if (nickname.length < 2) {
      this.joinErrorKey.set('rplus.play.error_nickname_invalid');
      return;
    }
    this.joining.set(true);
    this.joinErrorKey.set('');
    this.play
      .join(ref.sessionId, nickname)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snap) => {
          this.joining.set(false);
          this.joinedExplicitly.set(true);
          this.applySnapshot(snap);
        },
        error: (err: HttpErrorResponse) => {
          this.joining.set(false);
          this.joinErrorKey.set(this.joinErrorKeyFor(err));
        },
      });
  }

  /** QUESTION stage — submit the tapped option LABEL (BE contract). */
  choose(label: string): void {
    const ref = this.session();
    const q = this.question();
    if (!ref || !q || this.submitting() || this.stage() !== 'QUESTION') return;
    this.submitting.set(true);
    this.play
      .submit(ref.sessionId, q.questionId, label)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outcome) => {
          this.submitting.set(false);
          this.answeredQuestionId.set(q.questionId);
          this.heldResult.set(outcome.yourResult);
          this.applySnapshot(outcome.snapshot);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          if (err.status === 409) {
            if (this.errorCode(err).includes('duplicate')) {
              // First-write-wins — someone (us, another tab) already answered.
              this.answeredQuestionId.set(q.questionId);
            } else {
              // question_locked / question_not_open / not LIVE.
              this.tooLate.set(true);
            }
          } else {
            this.pollError.set(err);
          }
        },
      });
  }

  /** PODIUM exit — back to the learner home. */
  exit(): void {
    void this.router.navigate(['/a/dashboard']);
  }

  /** Template input handler (signal-first, no ngModel). */
  onNicknameInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.nickname.set(target?.value ?? '');
  }

  private startPolling(sessionId: string): void {
    this.play
      .snapshotStream(sessionId, this.stop$)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snap) => this.applySnapshot(snap),
        error: (err: HttpErrorResponse) => this.pollError.set(err),
      });
  }

  /** Fold a frame in: skew once + per-question state resets. */
  private applySnapshot(snap: ClassroomSessionSnapshot): void {
    if (this.skewMs() === null && snap.updatedAt) {
      this.skewMs.set(estimateSkewMs(snap.updatedAt, Date.now()));
    }
    const prevQ = this.snapshot()?.openQuestion?.questionId ?? '';
    const nextQ = snap.openQuestion?.questionId ?? '';
    if (nextQ && nextQ !== prevQ) {
      // Fresh question — clear the per-question state + capture the rank
      // baseline the REVEAL Δ is measured against.
      this.heldResult.set(null);
      this.tooLate.set(false);
      this.rankBaseline.set(snap.me?.rank ?? null);
    }
    this.snapshot.set(snap);
  }

  /** Map a join failure onto its inline i18n key. */
  private joinErrorKeyFor(err: HttpErrorResponse): string {
    const code = this.errorCode(err);
    if (code.includes('profane')) return 'rplus.play.error_nickname_profane';
    if (code.includes('taken')) return 'rplus.play.error_nickname_taken';
    if (code.includes('closed')) return 'rplus.play.error_session_closed';
    if (err.status === 400) return 'rplus.play.error_nickname_invalid';
    if (err.status === 409) return 'rplus.play.error_nickname_taken';
    return 'rplus.play.error_generic';
  }

  /**
   * Error-code extraction. The stage 4xx envelope is pinned since
   * delivery-live-classroom v1.1.0 (`StageError.code`); the remaining keys
   * are defensive fallbacks for gateway/CDN-shaped errors.
   */
  private errorCode(err: HttpErrorResponse): string {
    const body: unknown = err.error;
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object') {
      for (const key of ['code', 'error', 'message', 'detail']) {
        const value = (body as Record<string, unknown>)[key];
        if (typeof value === 'string') return value;
      }
    }
    return '';
  }
}
