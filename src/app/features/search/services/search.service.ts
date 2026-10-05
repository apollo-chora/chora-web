/**
 * SearchService — REST adapter for gateway-owned Meilisearch endpoints.
 *
 * Source of truth: chora-contracts/openapi/gateway.yaml (Search tag)
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  AtomSearchResponse,
  TopicSearchResponse,
  PathSearchResponse,
  SearchState,
  TopicSearchState,
  PathSearchState,
  ActiveFilters,
  DifficultyLevel,
} from '../models/search.model';
import { DEFAULT_PAGE_SIZE } from '../models/search.model';

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const SEARCH_ATOMS_PATH = '/api/v1/search/atoms';
const SEARCH_TOPICS_PATH = '/api/v1/search/topics';
const SEARCH_PATHS_PATH = '/api/v1/search/paths';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly bff = inject(BffClientService);

  // --- Signal state (private + readonly) ---
  private readonly _atomSearchState = signal<SearchState>({ status: 'idle' });
  readonly atomSearchState = this._atomSearchState.asReadonly();

  private readonly _topicSearchState = signal<TopicSearchState>({ status: 'idle' });
  readonly topicSearchState = this._topicSearchState.asReadonly();

  private readonly _pathSearchState = signal<PathSearchState>({ status: 'idle' });
  readonly pathSearchState = this._pathSearchState.asReadonly();

  // --- Computed ---
  readonly atomHits = computed(() => {
    const s = this._atomSearchState();
    return s.status === 'success' ? s.response.hits : [];
  });

  readonly atomFacets = computed(() => {
    const s = this._atomSearchState();
    return s.status === 'success' ? s.response.facets : null;
  });

  readonly atomPagination = computed(() => {
    const s = this._atomSearchState();
    return s.status === 'success' ? s.response.pagination : null;
  });

  readonly topicHits = computed(() => {
    const s = this._topicSearchState();
    return s.status === 'success' ? s.response.hits : [];
  });

  readonly topicPagination = computed(() => {
    const s = this._topicSearchState();
    return s.status === 'success' ? s.response.pagination : null;
  });

  readonly pathHits = computed(() => {
    const s = this._pathSearchState();
    return s.status === 'success' ? s.response.hits : [];
  });

  readonly pathPagination = computed(() => {
    const s = this._pathSearchState();
    return s.status === 'success' ? s.response.pagination : null;
  });

  readonly isLoading = computed(() => {
    return (
      this._atomSearchState().status === 'loading' ||
      this._topicSearchState().status === 'loading' ||
      this._pathSearchState().status === 'loading'
    );
  });

  // -------------------------------------------------------------------------
  // Atom search
  // -------------------------------------------------------------------------

  searchAtoms(
    query: string,
    filters?: ActiveFilters,
    sort?: string,
    limit: number = DEFAULT_PAGE_SIZE,
    offset = 0,
  ): Observable<AtomSearchResponse | null> {
    this._atomSearchState.set({ status: 'loading' });

    let params = new HttpParams()
      .set('q', query)
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    if (filters?.types.length) {
      params = params.set('type', filters.types.join(','));
    }
    if (filters?.difficulties.length) {
      params = params.set('difficulty', filters.difficulties.join(','));
    }
    if (filters?.topic) {
      params = params.set('topic', filters.topic);
    }
    if (sort && sort !== 'relevance') {
      params = params.set('sort', sort);
    }

    return this.bff.get<AtomSearchResponse>(SEARCH_ATOMS_PATH, params).pipe(
      tap((response) => {
        this._atomSearchState.set({ status: 'success', response });
      }),
      catchError((err: Error) => {
        this._atomSearchState.set({
          status: 'error',
          error: { code: 'SEARCH_ATOMS_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Topic search
  // -------------------------------------------------------------------------

  searchTopics(
    query: string,
    limit: number = DEFAULT_PAGE_SIZE,
    offset = 0,
  ): Observable<TopicSearchResponse | null> {
    this._topicSearchState.set({ status: 'loading' });

    const params = new HttpParams()
      .set('q', query)
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    return this.bff.get<TopicSearchResponse>(SEARCH_TOPICS_PATH, params).pipe(
      tap((response) => {
        this._topicSearchState.set({ status: 'success', response });
      }),
      catchError((err: Error) => {
        this._topicSearchState.set({
          status: 'error',
          error: { code: 'SEARCH_TOPICS_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Path search
  // -------------------------------------------------------------------------

  searchPaths(
    query: string,
    topic?: string,
    limit: number = DEFAULT_PAGE_SIZE,
    offset = 0,
  ): Observable<PathSearchResponse | null> {
    this._pathSearchState.set({ status: 'loading' });

    let params = new HttpParams()
      .set('q', query)
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    if (topic) {
      params = params.set('topic', topic);
    }

    return this.bff.get<PathSearchResponse>(SEARCH_PATHS_PATH, params).pipe(
      tap((response) => {
        this._pathSearchState.set({ status: 'success', response });
      }),
      catchError((err: Error) => {
        this._pathSearchState.set({
          status: 'error',
          error: { code: 'SEARCH_PATHS_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  resetState(): void {
    this._atomSearchState.set({ status: 'idle' });
    this._topicSearchState.set({ status: 'idle' });
    this._pathSearchState.set({ status: 'idle' });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  buildActiveFilters(
    types: string[],
    difficulties: DifficultyLevel[],
    topic: string | null,
  ): ActiveFilters {
    return { types, difficulties, topic };
  }
}
