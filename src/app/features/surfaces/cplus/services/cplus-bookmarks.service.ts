import { Injectable, inject, signal } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  BookmarkEntry,
  BookmarksPage,
  BookmarkState,
} from '../models/cplus-bookmarks.model';

/** Gateway-exposed bookmark paths (chora-gateway → chora-sharing). */
const BOOKMARK_LIST_PATH = '/v1/me/bookmarks';
const DEFAULT_LIMIT = 20;

/**
 * C+ (Circle+) bookmarks service — atom save-to-collection.
 *
 * Bookmark (save) and unbookmark (remove) atoms. List the caller's
 * bookmarked atoms via `GET /v1/me/bookmarks` with keyset cursor pagination.
 * Fail-loud with `cplus.bookmarks.*` i18n keys on error — no mock fallback.
 */
@Injectable({ providedIn: 'root' })
export class CplusBookmarksService {
  private readonly bff = inject(BffClientService);

  private readonly _state = signal<BookmarkState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  /** Track which atom IDs are bookmarked (for UI toggle state). */
  private readonly _bookmarkedIds = signal<Set<string>>(new Set());
  readonly bookmarkedIds = this._bookmarkedIds.asReadonly();

  /** Check if an atom is bookmarked. */
  isBookmarked(atomId: string): boolean {
    return this._bookmarkedIds().has(atomId);
  }

  /** Bookmark an atom (save to collection). */
  async bookmark(atomId: string): Promise<boolean> {
    this._state.set({ status: 'saving' });
    try {
      const headers = new HttpHeaders().set(
        'Idempotency-Key',
        `bookmark-${atomId}-${Date.now()}`,
      );
      await firstValueFrom(
        this.bff.post<void>(`/v1/atoms/${atomId}/bookmark`, {}, { headers }),
      );
      this._state.set({ status: 'saved' });
      this._bookmarkedIds.update((s) => new Set(s).add(atomId));
      return true;
    } catch (err) {
      this._state.set({
        status: 'error',
        error: { code: 'BOOKMARK_FAILED', message: this.errorKey(err) },
      });
      return false;
    }
  }

  /** Remove a bookmark (unsave from collection). */
  async unbookmark(atomId: string): Promise<boolean> {
    this._state.set({ status: 'removing' });
    try {
      await firstValueFrom(
        this.bff.delete<void>(`/v1/atoms/${atomId}/bookmark`),
      );
      this._state.set({ status: 'removed' });
      this._bookmarkedIds.update((s) => {
        const next = new Set(s);
        next.delete(atomId);
        return next;
      });
      return true;
    } catch (err) {
      this._state.set({
        status: 'error',
        error: { code: 'UNBOOKMARK_FAILED', message: this.errorKey(err) },
      });
      return false;
    }
  }

  /** List the caller's bookmarks (paginated). */
  async listBookmarks(
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<readonly BookmarkEntry[]> {
    let path = `${BOOKMARK_LIST_PATH}?limit=${limit}`;
    const trimmed = cursor?.trim() ?? '';
    if (trimmed !== '') {
      path += `&cursor=${encodeURIComponent(trimmed)}`;
    }
    try {
      const resp = await firstValueFrom(
        this.bff.get<BookmarksPage>(path),
      );
      const bookmarks = resp?.bookmarks ?? [];
      // Track bookmarked IDs for UI toggle.
      this._bookmarkedIds.update((s) => {
        const next = new Set(s);
        for (const b of bookmarks) {
          next.add(b.atom_id);
        }
        return next;
      });
      return bookmarks;
    } catch {
      return [];
    }
  }

  /** Toggle bookmark state for an atom. */
  async toggle(atomId: string): Promise<void> {
    if (this.isBookmarked(atomId)) {
      await this.unbookmark(atomId);
    } else {
      await this.bookmark(atomId);
    }
  }

  /** i18n key for a bookmark failure (fail-loud, no mock fallback). */
  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401) return 'cplus.bookmarks.error_unauthenticated';
      if (e.status === 403) return 'cplus.bookmarks.error_forbidden';
      if (e.status >= 500) return 'cplus.bookmarks.error_upstream';
    }
    return 'cplus.bookmarks.error_generic';
  }
}
