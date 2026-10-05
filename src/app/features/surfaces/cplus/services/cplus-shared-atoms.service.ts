import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  FeedScope,
  SharedAtomFeedEntry,
  SharedAtomsFeedPage,
  SharedAtomsFeedState,
} from '../models/cplus-shared-atoms.model';

const SHARED_ATOMS_PATH = '/v1/feed/shared-atoms';
const DEFAULT_LIMIT = 20;

@Injectable({ providedIn: 'root' })
export class CplusSharedAtomsService {
  private readonly bff = inject(BffClientService);

  private readonly _state = signal<SharedAtomsFeedState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  private readonly _scope = signal<FeedScope>('tenant');
  readonly scope = this._scope.asReadonly();

  private readonly _allCards = signal<readonly SharedAtomFeedEntry[]>([]);
  readonly cards = this._allCards.asReadonly();

  private readonly _nextCursor = signal<string>('');
  readonly nextCursor = this._nextCursor.asReadonly();

  readonly hasMore = computed<boolean>(() => this._nextCursor() !== '');

  private readonly _loadingMore = signal(false);
  readonly loadingMore = this._loadingMore.asReadonly();

  async loadFeed(scope: FeedScope = 'tenant', limit = DEFAULT_LIMIT): Promise<readonly SharedAtomFeedEntry[]> {
    this._scope.set(scope);
    this._state.set({ status: 'loading' });
    this._allCards.set([]);
    this._nextCursor.set('');
    return this.fetchPage(undefined, limit);
  }

  async loadMore(): Promise<readonly SharedAtomFeedEntry[]> {
    const cursor = this._nextCursor();
    if (cursor === '' || this._loadingMore()) {
      return [];
    }
    this._loadingMore.set(true);
    try {
      return await this.fetchPage(cursor, DEFAULT_LIMIT, true);
    } finally {
      this._loadingMore.set(false);
    }
  }

  private async fetchPage(
    cursor: string | undefined,
    limit: number,
    append = false,
  ): Promise<readonly SharedAtomFeedEntry[]> {
    let params = new HttpParams()
      .set('limit', String(limit))
      .set('scope', this._scope());
    const trimmed = cursor?.trim() ?? '';
    if (trimmed !== '') {
      params = params.set('cursor', trimmed);
    }
    try {
      const resp = await firstValueFrom(
        this.bff.get<SharedAtomsFeedPage>(SHARED_ATOMS_PATH, params),
      );
      const cards = resp?.cards ?? [];
      const next = resp?.next_cursor ?? '';
      if (append) {
        this._allCards.update((existing) => [...existing, ...cards]);
      } else {
        this._allCards.set(cards);
      }
      this._nextCursor.set(next);
      this._state.set({ status: 'success', cards: this._allCards(), nextCursor: next });
      return cards;
    } catch (err) {
      this._state.set({
        status: 'error',
        error: { code: 'FEED_LOAD_FAILED', message: this.errorKey(err) },
      });
      return [];
    }
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401) return 'cplus.feed.error_unauthenticated';
      if (e.status === 403) return 'cplus.feed.error_forbidden';
      if (e.status >= 500) return 'cplus.feed.error_upstream';
    }
    return 'cplus.feed.error_generic';
  }

  removeCard(shareEntryId: string): void {
    this._allCards.update((cards) => cards.filter((c) => c.share_entry_id !== shareEntryId));
    this._state.update((s) =>
      s.status === 'success'
        ? { ...s, cards: this._allCards() }
        : s,
    );
  }
}
