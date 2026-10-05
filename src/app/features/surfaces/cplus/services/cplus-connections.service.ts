import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  ConnectionEntry,
  ConnectionsPage,
  ConnectionsState,
  ConnectionType,
  EMPTY_RELATION_SETS,
  FollowSuggestionEntry,
  RelationSets,
  RelationshipAction,
  RelationshipActionState,
  SuggestionsState,
} from '../models/cplus-connections.model';

/** Gateway-exposed connections path (chora-gateway → chora-sharing). */
const CONNECTIONS_PATH = '/v1/connections';

/** Default page size; backend default 20, hard cap 100 (§7.2). */
const DEFAULT_LIMIT = 20;

/** Page size for relation-set derivation loads (backend hard cap). */
const RELATION_SET_LIMIT = 100;

/**
 * C+ (Circle+) connections service — Atom Sharing Redesign (Phase 3).
 *
 * Loads the real, tenant-scoped connection lists from the BFF
 * (`GET /v1/connections?type=following|followers|blocked`, chora-gateway
 * social aggregator fanning to chora-sharing) and exposes the wire DTOs
 * verbatim — no fabricated fields.
 *
 * `idle → loading → success | error`. On any HTTP failure the state goes to
 * `error` with a `cplus.connections.*` i18n key (fail-loud per the C+
 * directive — no mock fallback). Keyset cursor pagination via `next_cursor`.
 */
@Injectable({ providedIn: 'root' })
export class CplusConnectionsService {
  private readonly bff = inject(BffClientService);

  private readonly _state = signal<ConnectionsState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  /** Resolved connections — empty unless state is `success`. */
  readonly connections = computed<readonly ConnectionEntry[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.page.connections : [];
  });

  /** Keyset pagination cursor from the last page (empty when no more pages). */
  readonly nextCursor = computed<string>(() => {
    const s = this._state();
    return s.status === 'success' ? (s.page.next_cursor ?? '') : '';
  });

  /**
   * Load a page of connections from the BFF.
   *
   * @param type   Which list to load — `following` | `followers` | `blocked`.
   * @param cursor Opaque keyset cursor from a prior page (omit for first page).
   * @param limit  Page size (default 20, backend caps at 100).
   */
  async loadConnections(
    type: ConnectionType,
    cursor?: string,
    limit = DEFAULT_LIMIT,
  ): Promise<readonly ConnectionEntry[]> {
    this._state.set({ status: 'loading' });
    let params = new HttpParams()
      .set('type', type)
      .set('limit', String(limit));
    const trimmed = cursor?.trim() ?? '';
    if (trimmed !== '') {
      params = params.set('cursor', trimmed);
    }
    try {
      const resp = await firstValueFrom(
        this.bff.get<ConnectionsPage>(CONNECTIONS_PATH, params),
      );
      const page: ConnectionsPage = {
        connections: resp?.connections ?? [],
        ...(resp?.next_cursor ? { next_cursor: resp.next_cursor } : {}),
      };
      this._state.set({ status: 'success', page });
      return page.connections;
    } catch (err) {
      this._state.set({
        status: 'error',
        error: { code: 'CONNECTIONS_LOAD_FAILED', message: this.errorKey(err) },
      });
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Relation sets + relationship writes (follow / block plane only)
  // -------------------------------------------------------------------------

  private readonly _relationSets = signal<RelationSets>(EMPTY_RELATION_SETS);
  readonly relationSets = this._relationSets.asReadonly();

  private readonly _actionState = signal<RelationshipActionState>({ status: 'idle' });
  readonly actionState = this._actionState.asReadonly();

  /**
   * Refresh the lookup sets that drive per-row action availability:
   * following + blocked lists (first RELATION_SET_LIMIT entries). Best-effort
   * derivation over the loaded pages — an absent GCID renders as "no known
   * relation", never fabricated.
   */
  async loadRelationSets(): Promise<boolean> {
    try {
      const [following, blocked] = await Promise.all([
        this.fetchGcidList('following'),
        this.fetchGcidList('blocked'),
      ]);
      this._relationSets.set({
        following: new Set(following),
        blocked: new Set(blocked),
      });
      return true;
    } catch {
      // Keep the previous sets — action buttons degrade to their prior
      // knowledge; list loads surface their own fail-loud error states.
      return false;
    }
  }

  private readonly _suggestionsState = signal<SuggestionsState>({ status: 'idle' });
  readonly suggestionsState = this._suggestionsState.asReadonly();

  /**
   * Load hybrid suggestions (Phase 1 —
   * `GET /v1/connections/suggestions`, ranked by shared interest tags +
   * mutual follows, exclusion-filtered server-side). Fail-loud on error;
   * never fabricated.
   */
  async loadSuggestions(): Promise<readonly FollowSuggestionEntry[] | null> {
    this._suggestionsState.set({ status: 'loading' });
    try {
      const resp = await firstValueFrom(
        this.bff.get<{ suggestions: FollowSuggestionEntry[] }>(
          `${CONNECTIONS_PATH}/suggestions`,
        ),
      );
      const suggestions = resp?.suggestions ?? [];
      this._suggestionsState.set({ status: 'success', suggestions });
      return suggestions;
    } catch (err) {
      this._suggestionsState.set({
        status: 'error',
        error: { code: 'SUGGESTIONS_LOAD_FAILED', message: this.errorKey(err) },
      });
      return null;
    }
  }

  /** Follow another member. */
  follow(gcid: string): Promise<boolean> {
    return this.performAction('follow', gcid, () =>
      firstValueFrom(
        this.bff.post<unknown>(`${CONNECTIONS_PATH}/follows`, { gcid }),
      ),
    );
  }

  /** Unfollow a member (idempotent). */
  unfollow(gcid: string): Promise<boolean> {
    return this.performAction('unfollow', gcid, () =>
      firstValueFrom(
        this.bff.delete<unknown>(`${CONNECTIONS_PATH}/follows/${gcid}`),
      ),
    );
  }

  /**
   * Block a member — the backend severs follows both directions and any
   * pending requests in one transaction (ADR-230 D1).
   */
  block(gcid: string): Promise<boolean> {
    return this.performAction('block', gcid, () =>
      firstValueFrom(
        this.bff.post<unknown>(`${CONNECTIONS_PATH}/blocks`, { gcid }),
      ),
    );
  }

  /** Unblock a member — restores nothing (re-earn follows). */
  unblock(gcid: string): Promise<boolean> {
    return this.performAction('unblock', gcid, () =>
      firstValueFrom(
        this.bff.delete<unknown>(`${CONNECTIONS_PATH}/blocks/${gcid}`),
      ),
    );
  }

  /**
   * Run one relationship write with pending/error action-state tracking.
   * Success resolves true and returns the action state to idle; failure
   * resolves false with the fail-loud i18n key (409 refusal copy stays
   * unspecific — the backend never discloses block existence/direction).
   */
  private async performAction(
    action: RelationshipAction,
    gcid: string,
    call: () => Promise<unknown>,
  ): Promise<boolean> {
    this._actionState.set({ status: 'pending', action, gcid });
    try {
      await call();
      this._actionState.set({ status: 'idle' });
      return true;
    } catch (err) {
      this._actionState.set({
        status: 'error',
        action,
        gcid,
        error: { code: 'RELATIONSHIP_ACTION_FAILED', message: this.actionErrorKey(err) },
      });
      return false;
    }
  }

  /** Load one connections list as bare GCIDs (relation-set derivation). */
  private async fetchGcidList(type: ConnectionType): Promise<string[]> {
    const params = new HttpParams()
      .set('type', type)
      .set('limit', String(RELATION_SET_LIMIT));
    const resp = await firstValueFrom(
      this.bff.get<ConnectionsPage>(CONNECTIONS_PATH, params),
    );
    return (resp?.connections ?? []).map((e) => e.gcid);
  }

  /** i18n key for a relationship-write failure. */
  private actionErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (e?.status === 409) return 'cplus.connections.error_refused';
    return this.errorKey(err);
  }

  /** i18n key for a connections-load failure (fail-loud, no mock fallback). */
  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401) return 'cplus.connections.error_unauthenticated';
      if (e.status === 403) return 'cplus.connections.error_forbidden';
      if (e.status >= 500) return 'cplus.connections.error_upstream';
    }
    return 'cplus.connections.error_generic';
  }
}
