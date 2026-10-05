import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';

/**
 * Reaction kinds supported by the backend reaction.Type domain.
 *
 * Mirrors `services/chora-sharing/internal/domain/reaction/reaction.go`:
 *   TypeCurious, TypeInsightful, TypeLike, TypeInspired
 */
export type ReactionKind = 'curious' | 'insightful' | 'like' | 'inspired';

/** Metadata for each reaction kind — icon path + i18n label keys. */
export interface ReactionMeta {
  readonly kind: ReactionKind;
  /** SVG path data (24×24 viewBox). */
  readonly icon: string;
  /** i18n key for the aria-label / tooltip (singular). */
  readonly labelKey: string;
  /** i18n key for the count label (plural form, e.g. "likes"). */
  readonly countLabelKey: string;
}

/** All reaction kinds in display order, with their SVG icon + label. */
export const REACTIONS: readonly ReactionMeta[] = [
  {
    kind: 'curious',
    icon: 'M12 18h.01M8.5 8C8.5 6.5 9.5 5.5 12 5.5s3.5 1 3.5 2.5c0 2.5-3.5 2-3.5 4.5',
    labelKey: 'cplus.feed.reaction_curious',
    countLabelKey: 'cplus.feed.reaction_curious_plural',
  },
  {
    kind: 'insightful',
    icon: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.5.5 1 1.5 1 2.5h6c0-1 .5-2 1-2.5A6 6 0 0 0 12 3z',
    labelKey: 'cplus.feed.reaction_insightful',
    countLabelKey: 'cplus.feed.reaction_insightful_plural',
  },
  {
    kind: 'like',
    icon: 'M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3',
    labelKey: 'cplus.feed.reaction_like',
    countLabelKey: 'cplus.feed.reaction_like_plural',
  },
  {
    kind: 'inspired',
    icon: 'M12 3l1.9 5.8L20 10l-4.5 3.3L17 20l-5-3.5L7 20l1.5-6.7L4 10l6.1-1.2L12 3z',
    labelKey: 'cplus.feed.reaction_inspired',
    countLabelKey: 'cplus.feed.reaction_inspired_plural',
  },
];

/** Response from POST /v1/posts/{post_id}/reactions — backend owns toggle. */
interface ToggleReactionResponse {
  readonly reaction: {
    readonly reaction_id: string;
    readonly kind: string;
  } | null;
  readonly reaction_counts: Record<string, number>;
}

/**
 * C+ (Circle+) reactions service.
 *
 * POSTs to `/v1/posts/{post_id}/reactions` with `{ kind }`. The backend
 * handles toggle logic (add / remove / switch). The response carries the
 * user's active reaction (null when toggled off) + updated per-type counts.
 *
 * The frontend NEVER decides whether to add or remove — it just POSTs
 * and applies the response.
 */
@Injectable({ providedIn: 'root' })
export class CplusReactionsService {
  private readonly bff = inject(BffClientService);

  /**
   * Per-post reaction state: the user's active kind (null = none) +
   * the latest per-type counts from the backend.
   */
  private readonly _postState = signal<Map<string, { kind: ReactionKind | null; counts: Record<string, number> }>>(new Map());
  readonly postState = this._postState.asReadonly();

  /** Returns the user's active reaction kind for a post, or null. */
  getReaction(postId: string): ReactionKind | null {
    return this._postState().get(postId)?.kind ?? null;
  }

  /** Returns the per-type count for a post, or 0. */
  getCount(postId: string, kind: ReactionKind): number {
    return this._postState().get(postId)?.counts?.[kind] ?? 0;
  }

  /** Initialize counts + the user's active reaction from feed card data. */
  initFromCard(postId: string, counts: Record<string, number> | undefined, myReaction: string | undefined): void {
    const existing = this._postState().get(postId);
    if (existing) return;
    this._postState.update((m) => {
      const next = new Map(m);
      next.set(postId, {
        kind: (myReaction as ReactionKind | null) ?? null,
        counts: counts ?? {},
      });
      return next;
    });
  }

  /**
   * POST a reaction. The backend toggles (add/remove/switch) and returns
   * the updated state. The frontend just applies the response.
   */
  async react(postId: string, kind: ReactionKind): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.bff.post<ToggleReactionResponse>(`/v1/posts/${postId}/reactions`, { kind }),
      );
      this._postState.update((m) => {
        const next = new Map(m);
        next.set(postId, {
          kind: res.reaction ? (res.reaction.kind as ReactionKind) : null,
          counts: res.reaction_counts ?? {},
        });
        return next;
      });
    } catch {
      // Fail silent on the signal — the error interceptor shows a toast.
    }
  }
}
