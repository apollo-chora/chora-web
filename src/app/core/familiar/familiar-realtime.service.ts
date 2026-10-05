/**
 * FamiliarRealtimeService — Familiar realtime events as a THIN ADAPTER over
 * the learner-scoped SSE channel (ADR-183, RealtimeChannelService).
 *
 * History: this service used to open its OWN EventSource to
 * `/api/v1/realtime/familiars/stream`, an endpoint no backend ever served
 * (the "1.5-real-2.5-stub realtime layer" audit finding). The multiplexed
 * chora-realtime channel is the real publisher now; this adapter keeps the
 * public API byte-for-byte (stream$/stageTransition$/sourceRevelation$ +
 * the emit seams) so the five consuming components need zero churn.
 *
 * Channel mapping (v1):
 *   familiar.leveled_up  → stageTransition$ {familiarId, fromStage, toStage}
 *   (bonded / retired / skin_equipped ride the channel's generic stream$ —
 *    no typed consumer here yet; source_revelation has NO channel topic and
 *    arrives exclusively via the post-hatch imperative seam.)
 *
 * Test/demo seam: `emit()` / `emitStageTransition()` / `emitSourceRevelation()`
 * push synthetic events exactly as before.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, share } from 'rxjs';
import type { Subscription } from 'rxjs';

import { environment } from '../../../environments/environment';
import { RealtimeChannelService } from '../realtime/realtime-channel.service';
import type {
  FamiliarRealtimeEvent,
  FamiliarStageUpEvent,
  FamiliarSourceRevelationEvent,
} from './familiar-growth.model';
import type { GrowthStage } from './familiar-growth.model';

/** Minimal payload for a stage-up overlay (WS-2). */
export interface FamiliarStageTransition {
  readonly familiarId: string;
  readonly fromStage: number;
  readonly toStage: number;
}

/** Minimal payload for a source-revelation overlay (WS-2). */
export interface FamiliarSourceRevelationPayload {
  readonly familiarId: string;
  readonly breed: string;
  readonly source: string;
}

@Injectable({ providedIn: 'root' })
export class FamiliarRealtimeService {
  private readonly channel = inject(RealtimeChannelService);

  private readonly subject = new Subject<FamiliarRealtimeEvent>();
  private bridge: Subscription | null = null;

  // ── WS-2: typed overlay subjects ────────────────────────────────
  private readonly _stageTransition$ =
    new Subject<FamiliarStageTransition>();
  private readonly _sourceRevelation$ =
    new Subject<FamiliarSourceRevelationPayload>();

  /** Emits on every `stage_up` realtime event + imperative seam calls. */
  readonly stageTransition$: Observable<FamiliarStageTransition> =
    this._stageTransition$.asObservable();

  /** Emits on `source_revelation` realtime event or post-hatch commit. */
  readonly sourceRevelation$: Observable<FamiliarSourceRevelationPayload> =
    this._sourceRevelation$.asObservable();

  /** Subscribe to the realtime stream. Idempotent: bridges the shared
   *  channel once per service instance regardless of subscriber count. */
  readonly stream$: Observable<FamiliarRealtimeEvent> = new Observable<FamiliarRealtimeEvent>(
    (subscriber) => {
      this.ensureConnected();
      const sub = this.subject.subscribe(subscriber);
      return () => sub.unsubscribe();
    },
  ).pipe(share());

  private ensureConnected(): void {
    if (this.bridge) return;

    // The channel's leveled_up frames feed the stage-up overlay path the
    // old per-domain SSE `stage_up` events drove.
    this.bridge = this.channel.familiarLeveledUp$.subscribe((p) => {
      this._stageTransition$.next({
        familiarId: p.familiar_id,
        fromStage: (p.from_stage ?? 0) as GrowthStage,
        toStage: p.to_stage as GrowthStage,
      });
    });

    // Open the shared channel (idempotent; flag-gated so an unconfigured
    // env degrades to the components' HTTP fallback exactly as before).
    if (environment.realtimeEnabled) {
      this.channel.connect();
    }
  }

  /** Test / dev seam — inject a synthetic event into the stream. */
  emit(event: FamiliarRealtimeEvent): void {
    this.subject.next(event);
    this.fanOut(event);
  }

  /** WS-2: imperative seam for stage-up (dev console / test injection). */
  emitStageTransition(payload: FamiliarStageTransition): void {
    this._stageTransition$.next(payload);
  }

  /** WS-2: imperative seam for source-revelation (post-hatch commit). */
  emitSourceRevelation(payload: FamiliarSourceRevelationPayload): void {
    this._sourceRevelation$.next(payload);
  }

  /** Route typed envelope fields into the respective overlay subjects. */
  private fanOut(event: FamiliarRealtimeEvent): void {
    if (event.type === 'stage_up') {
      const e = event as FamiliarStageUpEvent;
      this._stageTransition$.next({
        familiarId: e.familiarId,
        fromStage: e.stageFrom,
        toStage: e.stageTo,
      });
    } else if (event.type === 'source_revelation') {
      const e = event as FamiliarSourceRevelationEvent;
      this._sourceRevelation$.next({
        familiarId: e.familiarId,
        breed: '',   // breed not carried on the SSE envelope; resolved by overlay from growthState
        source: e.windowExpiresAt,
      });
    }
  }

  /** Stop bridging. The underlying channel is SHARED (notifications + mana
   *  ride it too) — its lifecycle belongs to the session (top-nav /
   *  NotificationService teardown), so this does NOT close it. */
  disconnect(): void {
    this.bridge?.unsubscribe();
    this.bridge = null;
  }
}
