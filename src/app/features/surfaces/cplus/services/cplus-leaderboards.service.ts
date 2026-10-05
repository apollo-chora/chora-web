import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardPage,
  LeaderboardPeriod,
  LeaderboardScope,
  LeaderboardsState,
} from '../models/cplus-leaderboards.model';

const LEADERBOARD_PATH = '/v1/leaderboard';
const DEFAULT_LIMIT = 20;

@Injectable({ providedIn: 'root' })
export class CplusLeaderboardsService {
  private readonly bff = inject(BffClientService);

  private readonly _state = signal<LeaderboardsState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  private readonly _allEntries = signal<readonly LeaderboardEntry[]>([]);
  readonly entries = this._allEntries.asReadonly();

  private readonly _nextCursor = signal<string>('');
  readonly nextCursor = this._nextCursor.asReadonly();

  readonly hasMore = computed<boolean>(() => this._nextCursor() !== '');

  private readonly _loadingMore = signal(false);
  readonly loadingMore = this._loadingMore.asReadonly();

  private _scope: LeaderboardScope = 'global';
  private _metric: LeaderboardMetric = 'xp';
  private _period: LeaderboardPeriod = 'all-time';
  private _scopeTargetId?: string;

  async loadBoard(
    scope: LeaderboardScope = 'global',
    metric: LeaderboardMetric = 'xp',
    period: LeaderboardPeriod = 'all-time',
    scopeTargetId?: string,
  ): Promise<readonly LeaderboardEntry[]> {
    this._scope = scope;
    this._metric = metric;
    this._period = period;
    this._scopeTargetId = scopeTargetId;
    this._state.set({ status: 'loading' });
    this._allEntries.set([]);
    this._nextCursor.set('');
    return this.fetchPage(undefined);
  }

  async loadMore(): Promise<readonly LeaderboardEntry[]> {
    const cursor = this._nextCursor();
    if (cursor === '' || this._loadingMore()) {
      return [];
    }
    this._loadingMore.set(true);
    try {
      return await this.fetchPage(cursor, true);
    } finally {
      this._loadingMore.set(false);
    }
  }

  private async fetchPage(
    cursor: string | undefined,
    append = false,
  ): Promise<readonly LeaderboardEntry[]> {
    let params = new HttpParams()
      .set('scope', this._scope)
      .set('metric', this._metric)
      .set('period', this._period)
      .set('limit', String(DEFAULT_LIMIT));
    const targetId = this._scopeTargetId?.trim() ?? '';
    if (targetId !== '') {
      params = params.set('scope_target_id', targetId);
    }
    const trimmedCursor = cursor?.trim() ?? '';
    if (trimmedCursor !== '') {
      params = params.set('cursor', trimmedCursor);
    }
    try {
      const resp = await firstValueFrom(
        this.bff.get<LeaderboardPage>(LEADERBOARD_PATH, params),
      );
      const entries = resp?.entries ?? [];
      const next = resp?.next_cursor ?? '';
      if (append) {
        this._allEntries.update((existing) => [...existing, ...entries]);
      } else {
        this._allEntries.set(entries);
      }
      this._nextCursor.set(next);
      const page: LeaderboardPage = {
        entries: this._allEntries(),
        next_cursor: next,
        computed_at: resp?.computed_at ?? '',
      };
      this._state.set({ status: 'success', page });
      return entries;
    } catch (err) {
      this._state.set({
        status: 'error',
        error: { code: 'LEADERBOARD_LOAD_FAILED', message: this.errorKey(err) },
      });
      return [];
    }
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401) return 'cplus.leaderboards.error_unauthenticated';
      if (e.status === 403) return 'cplus.leaderboards.error_forbidden';
      if (e.status >= 500) return 'cplus.leaderboards.error_upstream';
    }
    return 'cplus.leaderboards.error_generic';
  }
}
