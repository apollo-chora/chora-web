import { Injectable, inject, signal } from '@angular/core';
import { HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  BlitzVariant,
  DuelCategory,
  DuelDetail,
  DuelLeaderboardEntry,
  DuelListState,
  DuelMode,
  DuelRating,
  LeaderboardState,
  QueueResponse,
  QueueState,
  RatingState,
} from '../models/cplus-duel.model';

const DUELS_PATH = '/v1/duels';

@Injectable({ providedIn: 'root' })
export class CplusDuelsService {
  private readonly bff = inject(BffClientService);

  private readonly _queueState = signal<QueueState>({ status: 'idle' });
  readonly queueState = this._queueState.asReadonly();

  private readonly _listState = signal<DuelListState>({ status: 'idle' });
  readonly listState = this._listState.asReadonly();

  private readonly _ratingState = signal<RatingState>({ status: 'idle' });
  readonly ratingState = this._ratingState.asReadonly();

  private readonly _leaderboardState = signal<LeaderboardState>({ status: 'idle' });
  readonly leaderboardState = this._leaderboardState.asReadonly();

  async enterQueue(
    idempotencyKey: string,
    interestTags?: string[],
    questionCount?: number,
    category?: DuelCategory,
    mode?: DuelMode,
    blitzVariant?: BlitzVariant,
  ): Promise<QueueResponse | null> {
    this._queueState.set({ status: 'finding' });
    try {
      const body: Record<string, unknown> = {
        interest_tags: interestTags ?? [],
        question_count: questionCount ?? 5,
        category: category ?? 'overall',
        mode: mode ?? 'classic',
      };
      if (mode === 'blitz' && blitzVariant) {
        body['blitz_variant'] = blitzVariant;
      }
      const resp = await firstValueFrom(
        this.bff
          .post<QueueResponse>(`${DUELS_PATH}/queue`, body, {
            headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
          })
          .pipe(take(1)),
      );
      this._queueState.set({ status: 'finding', expires_at: resp.expires_at });
      return resp;
    } catch (err: unknown) {
      this._queueState.set({
        status: 'error',
        error: { code: 'DUEL_QUEUE_FAILED', message: this.errorKey(err) },
      });
      return null;
    }
  }

  async cancelQueue(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.bff.delete(`${DUELS_PATH}/queue`).pipe(take(1)),
      );
      this._queueState.set({ status: 'idle' });
      return true;
    } catch {
      return false;
    }
  }

  async heartbeat(): Promise<QueueResponse | null> {
    try {
      const resp = await firstValueFrom(
        this.bff.post<QueueResponse>(`${DUELS_PATH}/queue/heartbeat`, {}).pipe(take(1)),
      );
      if (resp.status === 'matched' && resp.duel_id) {
        this._queueState.set({ status: 'matched', duel_id: resp.duel_id });
      }
      return resp;
    } catch {
      return null;
    }
  }

  async getQueueStatus(): Promise<QueueResponse | null> {
    try {
      return await firstValueFrom(
        this.bff.get<QueueResponse>(`${DUELS_PATH}/queue/status`).pipe(take(1)),
      );
    } catch {
      return null;
    }
  }

  resetQueue(): void {
    this._queueState.set({ status: 'idle' });
  }

  async loadDuels(): Promise<void> {
    this._listState.set({ status: 'loading' });
    try {
      const resp = await firstValueFrom(
        this.bff.get<{ data: DuelDetail[] }>(DUELS_PATH).pipe(take(1)),
      );
      this._listState.set({ status: 'success', duels: resp.data ?? [] });
    } catch (err: unknown) {
      this._listState.set({
        status: 'error',
        error: { code: 'DUEL_LIST_FAILED', message: this.errorKey(err) },
      });
    }
  }

  async loadMyRating(): Promise<void> {
    this._ratingState.set({ status: 'loading' });
    try {
      const resp = await firstValueFrom(
        this.bff.get<DuelRating>(`${DUELS_PATH}/my-rating`).pipe(take(1)),
      );
      this._ratingState.set({ status: 'success', rating: resp });
    } catch (err: unknown) {
      this._ratingState.set({
        status: 'error',
        error: { code: 'DUEL_RATING_FAILED', message: this.errorKey(err) },
      });
    }
  }

  async loadLeaderboard(category?: DuelCategory): Promise<void> {
    this._leaderboardState.set({ status: 'loading' });
    try {
      let params: HttpParams | undefined;
      if (category && category !== 'overall') {
        params = new HttpParams().set('category', category);
      }
      const resp = await firstValueFrom<{ entries: DuelLeaderboardEntry[] }>(
        this.bff.get<{ entries: DuelLeaderboardEntry[] }>(`${DUELS_PATH}/leaderboard`, params).pipe(take(1)),
      );
      this._leaderboardState.set({ status: 'success', entries: resp.entries ?? [] });
    } catch (err: unknown) {
      this._leaderboardState.set({
        status: 'error',
        error: { code: 'DUEL_LEADERBOARD_FAILED', message: this.errorKey(err) },
      });
    }
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401) return 'cplus.duels.error_unauthenticated';
      if (e.status === 403) return 'cplus.duels.error_forbidden';
      if (e.status === 404) return 'cplus.duels.error_not_found';
      if (e.status === 409) return 'cplus.duels.error_conflict';
      if (e.status >= 500) return 'cplus.duels.error_upstream';
    }
    return 'cplus.duels.error_generic';
  }
}
