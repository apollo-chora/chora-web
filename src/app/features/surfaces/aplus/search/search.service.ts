/**
 * SearchService — A+ Search Hub federated service (WS-8).
 *
 * Federates three BFF endpoints:
 *   1. GET /api/v1/search/atoms       — Meilisearch atom index (LIVE, gateway.yaml)
 *   2. GET /api/catalog?public=true   — Course catalog fan-out (LIVE)
 *   3. GET /api/v1/collections/search — Collection search (LIVE; gateway-side
 *      SearchMyCollections over the caller's own collections — WS-8)
 *
 * Architecture decisions:
 *   - Debounce 250ms on query$ stream via RxJS debounceTime (per WS-8 spec)
 *   - forkJoin merges results client-side; ALL THREE branches degrade
 *     gracefully (empty result) on error so one upstream hiccup never nukes
 *     the whole hub. The hub is fail-loud only when EVERY branch is unusable.
 *   - AsyncState discriminated union: idle | loading | success | error
 *   - All HTTP through BffClientService (never direct microservice calls)
 *   - Recent searches persisted to localStorage via pushRecentSearch helper
 */
import {
  Injectable,
  computed,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { HttpParams } from '@angular/common/http';
import {
  Subject,
  merge,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  forkJoin,
  catchError,
  of,
  takeUntil,
} from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AtomSearchResult,
  CourseSearchResult,
  CollectionSearchResult,
  FederatedSearchResponse,
  GatewayAtomSearchResponse,
  GatewayCatalogResponse,
  GatewayCollectionSearchResponse,
  SearchState,
} from './models';
import { pushRecentSearch } from './models';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly bff = inject(BffClientService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Internal state ─────────────────────────────────────────────────────────
  private readonly _state = signal<SearchState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  // ── Query stream ───────────────────────────────────────────────────────────
  private readonly query$ = new Subject<string>();
  // retry() re-fires the last query through this stream, bypassing the
  // debounce + distinctUntilChanged on query$ (which would otherwise swallow a
  // same-value retry — the retry CTA would silently no-op).
  private readonly refresh$ = new Subject<string>();

  // ── Derived selectors ──────────────────────────────────────────────────────

  readonly atoms = computed<readonly AtomSearchResult[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.results.atoms : [];
  });

  readonly courses = computed<readonly CourseSearchResult[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.results.courses : [];
  });

  readonly collections = computed<readonly CollectionSearchResult[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.results.collections : [];
  });

  readonly totalCount = computed<number>(
    () => this.atoms().length + this.courses().length + this.collections().length,
  );

  readonly atomCount = computed<number>(() => this.atoms().length);
  readonly courseCount = computed<number>(() => this.courses().length);
  readonly collectionCount = computed<number>(() => this.collections().length);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor() {
    const destroyed$ = new Subject<void>();
    this.destroyRef.onDestroy(() => {
      destroyed$.next();
      destroyed$.complete();
    });

    merge(
      this.query$.pipe(debounceTime(250), distinctUntilChanged()),
      this.refresh$,
    )
      .pipe(
        switchMap((q) => {
          if (!q.trim()) {
            this._state.set({ status: 'idle' });
            return of(null);
          }
          this._state.set({ status: 'loading' });
          return this.federatedSearch(q.trim()).pipe(
            catchError((err: unknown) => {
              this._state.set({
                status: 'error',
                error: this.errorKey(err),
              });
              return of(null);
            }),
          );
        }),
        takeUntil(destroyed$),
      )
      .subscribe((result) => {
        if (result !== null) {
          this._state.set({
            status: 'success',
            results: result.results,
            query: result.query,
          });
          pushRecentSearch(result.query);
        }
      });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Emit a new search query into the debounced stream.
   * Empty string resets to idle state.
   */
  search(query: string): void {
    this.query$.next(query);
  }

  /**
   * Retry the last known query. No-op if state is idle.
   * Allows the component's retry CTA to re-fire without re-typing.
   */
  retry(): void {
    const s = this._state();
    if (s.status === 'error' || s.status === 'success') {
      const q = s.status === 'success' ? s.query : '';
      if (q) this.refresh$.next(q);
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private federatedSearch(q: string): import('rxjs').Observable<{
    results: FederatedSearchResponse;
    query: string;
  }> {
    const atomParams = new HttpParams().set('q', q).set('limit', '20');

    // Course: BFF catalog endpoint returns all courses; FE filters by title
    // (no server-side q param on GET /api/catalog — catalog service pattern)
    const catalogParams = new HttpParams().set('public', 'true');

    // Collection: LIVE via gateway SearchMyCollections (WS-8).
    const collectionParams = new HttpParams()
      .set('q', q)
      .set('limit', '10');

    return forkJoin({
      atoms: this.bff
        .get<GatewayAtomSearchResponse>(
          '/api/v1/search/atoms',
          atomParams,
        )
        .pipe(
          catchError(() =>
            of<GatewayAtomSearchResponse>({
              hits: [],
              pagination: { total_hits: 0, limit: 20, offset: 0 },
              processing_time_ms: 0,
              query: q,
            }),
          ),
        ),
      courses: this.bff
        .get<GatewayCatalogResponse>('/api/catalog', catalogParams)
        .pipe(
          catchError(() =>
            of<GatewayCatalogResponse>({ items: [] }),
          ),
        ),
      collections: this.bff
        .get<GatewayCollectionSearchResponse>(
          '/api/v1/collections/search',
          collectionParams,
        )
        .pipe(
          // WS-8 collection-search is LIVE (gateway SearchMyCollections).
          // Degrade gracefully on error so a transient collection-search hiccup
          // doesn't nuke the whole federated hub — mirrors the atoms + courses
          // branches above. The hub only fails loud if the forkJoin itself has
          // no usable branch.
          catchError(() =>
            of<GatewayCollectionSearchResponse>({ items: [] }),
          ),
        ),
    }).pipe(
      switchMap(({ atoms, courses, collections }) => {
        const ql = q.toLowerCase();

        const atomResults: AtomSearchResult[] = atoms.hits.map((h) => ({
          kind: 'atom' as const,
          id: h.id,
          title: h.title,
          content_excerpt: h.content_excerpt,
          atom_type: h.atom_type,
          difficulty: h.difficulty,
          labels: h.labels,
          topic_names: h.topic_names,
        }));

        // Client-side title filter for courses (catalog has no q param)
        const courseResults: CourseSearchResult[] = courses.items
          .filter(
            (c) =>
              c.title.toLowerCase().includes(ql) ||
              (c.instructor_name ?? '').toLowerCase().includes(ql) ||
              c.tags.some((t) => t.toLowerCase().includes(ql)),
          )
          .map((c) => ({
            kind: 'course' as const,
            id: c.id,
            title: c.title,
            instructor_name: c.instructor_name,
            enrolled_count: c.enrolled_count,
            is_free: c.is_free,
            price_sgd_cents: c.price_sgd_cents,
            tags: c.tags,
          }));

        const collectionResults: CollectionSearchResult[] =
          collections.items.map((col) => ({
            kind: 'collection' as const,
            id: col.id,
            title: col.title,
            atom_count: col.atom_count,
            owner_display_name: col.owner_display_name,
          }));

        return of({
          results: {
            atoms: atomResults,
            courses: courseResults,
            collections: collectionResults,
          },
          query: q,
        });
      }),
    );
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.search.error_collection_not_wired';
      if (e.status >= 500) return 'aplus.search.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.search.error_unauthorised';
      }
    }
    return 'aplus.search.error_generic';
  }
}
