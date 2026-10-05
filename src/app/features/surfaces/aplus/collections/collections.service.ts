/**
 * CollectionsService — A+ personal collections BFF wrapper (WS-6b).
 *
 * Calls the 8 Collection REST endpoints via BffClientService:
 *
 *   GET    /api/v1/me/collections              → list()
 *   GET    /api/v1/collections/{id}            → get(id)
 *   POST   /api/v1/collections                 → create(req)
 *   PATCH  /api/v1/collections/{id}            → update(id, patch)
 *   DELETE /api/v1/collections/{id}            → delete(id)
 *   POST   /api/v1/collections/{id}/atoms      → addAtom(...)
 *   DELETE /api/v1/collections/{id}/atoms/{atomId} → removeAtom(...)
 *   POST   /api/v1/collections/{id}/convert-to-study-list → convertToStudyList(id)
 *
 * BE WIRING STATUS (2026-05-26): chora-gateway now proxies all 7 Collection
 * routes. The service calls the contracted paths and surfaces errors
 * honestly via the fail-loud AsyncState error branch. No mock fallback
 * (per memory feedback_no_stubs_real_wiring).
 *
 * Domain vocabulary: Collection = curated ordered list of LearningAtoms.
 * NEVER "playlist", "folder", or "album".
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';
import type { Observable } from 'rxjs';

import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AddCollectionAtomRequest,
  Collection,
  CollectionAtomOpState,
  CollectionConvertState,
  CollectionDetailState,
  CollectionEditState,
  CollectionListResponse,
  CollectionListState,
  ConvertToStudyListResponse,
  CreateCollectionRequest,
  PatchCollectionRequest,
} from './collections.model';

@Injectable({ providedIn: 'root' })
export class CollectionsService {
  private readonly bff = inject(BffClientService);

  // ── List state ────────────────────────────────────────────────────────────

  private readonly _listState = signal<CollectionListState>({ status: 'loading' });
  readonly listState = this._listState.asReadonly();

  /** Convenience: items array when success, else empty readonly array. */
  readonly collections = computed<readonly Collection[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.items : [];
  });

  // ── Detail state ──────────────────────────────────────────────────────────

  private readonly _detailState = signal<CollectionDetailState>({ status: 'loading' });
  readonly detailState = this._detailState.asReadonly();

  /** Convenience: collection when detail success, else null. */
  readonly detailCollection = computed<Collection | null>(() => {
    const s = this._detailState();
    return s.status === 'success' ? s.collection : null;
  });

  // ── Edit state ────────────────────────────────────────────────────────────

  private readonly _editState = signal<CollectionEditState>({ status: 'idle' });
  readonly editState = this._editState.asReadonly();

  // ── Atom operation state (add/remove) ─────────────────────────────────────

  private readonly _atomOpState = signal<CollectionAtomOpState>({ status: 'idle' });
  readonly atomOpState = this._atomOpState.asReadonly();

  // ── Convert-to-study-list state (WS-4 · ADR-233) ───────────────────────────

  private readonly _convertState = signal<CollectionConvertState>({ status: 'idle' });
  readonly convertState = this._convertState.asReadonly();

  /** Convenience: the partial-success envelope when convert succeeded, else null. */
  readonly convertResult = computed<ConvertToStudyListResponse | null>(() => {
    const s = this._convertState();
    return s.status === 'success' ? s.result : null;
  });

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * List the caller's personal Collections.
   * GET /api/v1/me/collections
   * Fail loud: any 4xx/5xx → error state with explicit i18n key.
   */
  loadList(): void {
    this._listState.set({ status: 'loading' });
    this.bff
      .get<CollectionListResponse>('/api/v1/me/collections')
      .pipe(
        take(1),
        map(
          (resp): CollectionListState => ({
            status: 'success',
            items: resp.items,
            total: resp.total,
          }),
        ),
        catchError((err: unknown) =>
          of<CollectionListState>({
            status: 'error',
            error: this.listErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._listState.set(s));
  }

  /**
   * Fetch a single Collection by ID (visibility-gated).
   * GET /api/v1/collections/{id}
   * Fail loud: any 4xx/5xx → error state with explicit i18n key.
   */
  loadDetail(id: string): void {
    this._detailState.set({ status: 'loading' });
    this.bff
      .get<Collection>(`/api/v1/collections/${encodeURIComponent(id)}`)
      .pipe(
        take(1),
        map(
          (collection): CollectionDetailState => ({
            status: 'success',
            collection,
          }),
        ),
        catchError((err: unknown) =>
          of<CollectionDetailState>({
            status: 'error',
            error: this.detailErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._detailState.set(s));
  }

  /**
   * Create a new personal Collection.
   * POST /api/v1/collections → 201 Collection
   * Returns an Observable so callers can chain navigation on success.
   */
  create(req: CreateCollectionRequest): Observable<Collection> {
    this._editState.set({ status: 'submitting' });
    return this.bff.post<Collection>('/api/v1/collections', req).pipe(
      take(1),
      map((collection) => {
        this._editState.set({ status: 'success', collection });
        return collection;
      }),
      catchError((err: unknown) => {
        this._editState.set({
          status: 'error',
          error: this.editErrorKey(err),
        });
        throw err;
      }),
    );
  }

  /**
   * Update Collection metadata (owner only).
   * PATCH /api/v1/collections/{id} → 200 Collection
   * Returns an Observable so callers can chain navigation on success.
   */
  update(id: string, patch: PatchCollectionRequest): Observable<Collection> {
    this._editState.set({ status: 'submitting' });
    return this.bff.patch<Collection>(`/api/v1/collections/${encodeURIComponent(id)}`, patch).pipe(
      take(1),
      map((collection) => {
        this._editState.set({ status: 'success', collection });
        return collection;
      }),
      catchError((err: unknown) => {
        this._editState.set({
          status: 'error',
          error: this.editErrorKey(err),
        });
        throw err;
      }),
    );
  }

  /**
   * Soft-delete a Collection (owner only).
   * DELETE /api/v1/collections/{id} → 204
   * Returns an Observable so callers can chain navigation on success.
   */
  delete(id: string): Observable<void> {
    return this.bff.delete<void>(`/api/v1/collections/${encodeURIComponent(id)}`).pipe(
      take(1),
      catchError((err: unknown) => {
        // Surface the error but re-throw so the caller can handle
        const msg = this.detailErrorKey(err);
        this._detailState.set({ status: 'error', error: msg });
        throw err;
      }),
    );
  }

  /**
   * Add an atom to a Collection.
   * POST /api/v1/collections/{id}/atoms → 201 Collection
   */
  addAtom(collectionId: string, atomId: string, position?: number): Observable<Collection> {
    this._atomOpState.set({ status: 'pending', atomId });
    const req: AddCollectionAtomRequest = { atom_id: atomId, ...(position !== undefined ? { position } : {}) };
    return this.bff.post<Collection>(`/api/v1/collections/${encodeURIComponent(collectionId)}/atoms`, req).pipe(
      take(1),
      map((collection) => {
        this._atomOpState.set({ status: 'idle' });
        // Refresh detail state with updated collection
        this._detailState.set({ status: 'success', collection });
        return collection;
      }),
      catchError((err: unknown) => {
        this._atomOpState.set({
          status: 'error',
          error: this.atomOpErrorKey(err),
          atomId,
        });
        throw err;
      }),
    );
  }

  /**
   * Remove an atom from a Collection.
   * DELETE /api/v1/collections/{id}/atoms/{atomId} → 204
   */
  removeAtom(collectionId: string, atomId: string): Observable<void> {
    this._atomOpState.set({ status: 'pending', atomId });
    return this.bff
      .delete<void>(
        `/api/v1/collections/${encodeURIComponent(collectionId)}/atoms/${encodeURIComponent(atomId)}`,
      )
      .pipe(
        take(1),
        map(() => {
          this._atomOpState.set({ status: 'idle' });
          // Optimistically remove atom from detail state
          const current = this._detailState();
          if (current.status === 'success' && current.collection.atoms) {
            const updatedCollection: Collection = {
              ...current.collection,
              atoms: current.collection.atoms.filter((a) => a.atom_id !== atomId),
            };
            this._detailState.set({ status: 'success', collection: updatedCollection });
          }
        }),
        catchError((err: unknown) => {
          this._atomOpState.set({
            status: 'error',
            error: this.atomOpErrorKey(err),
            atomId,
          });
          throw err;
        }),
      );
  }

  /**
   * Convert a Collection into the caller's study list (WS-4 · ADR-233).
   * POST /api/v1/collections/{id}/convert-to-study-list → 201
   *
   * PARTIAL SUCCESS by design (D11): chora-creation re-evaluates the ADR-229
   * reuse disjunct PER ATOM against the CALLER's GCID at this moment. Atoms the
   * learner is still entitled to convert; atoms whose author has since narrowed,
   * unpublished, or unshared them are dropped and NAMED in `excluded`. The
   * Collection is NOT mutated — excluded atoms stay curated, so a later convert
   * picks them up if the author re-widens.
   *
   * Zero survivors → 409, never an empty study list (that would fabricate a
   * success). Re-throws so the caller can react; state is on `convertState`.
   */
  convertToStudyList(collectionId: string): Observable<ConvertToStudyListResponse> {
    this._convertState.set({ status: 'submitting' });
    return this.bff
      .post<ConvertToStudyListResponse>(
        `/api/v1/collections/${encodeURIComponent(collectionId)}/convert-to-study-list`,
        {},
      )
      .pipe(
        take(1),
        map((result) => {
          this._convertState.set({ status: 'success', result });
          return result;
        }),
        catchError((err: unknown) => {
          this._convertState.set({
            status: 'error',
            error: this.convertErrorKey(err),
          });
          throw err;
        }),
      );
  }

  /** Reset edit state to idle (call after navigating away from the form). */
  resetEditState(): void {
    this._editState.set({ status: 'idle' });
  }

  /** Reset convert state to idle (call when the learner dismisses the result). */
  resetConvertState(): void {
    this._convertState.set({ status: 'idle' });
  }

  // ── Error key helpers ──────────────────────────────────────────────────────

  private listErrorKey(err: unknown): string {
    const status = this.httpStatus(err);
    if (status === 401 || status === 403) return 'aplus.collections.error_unauthorised';
    if (status !== null && status >= 500) return 'aplus.collections.error_upstream';
    // GATEWAY_ROUTE_NOT_FOUND — endpoint not found in chora-gateway.
    return 'aplus.collections.error_gateway_not_wired';
  }

  private detailErrorKey(err: unknown): string {
    const status = this.httpStatus(err);
    if (status === 404) return 'aplus.collections.error_not_found';
    if (status === 401 || status === 403) return 'aplus.collections.error_unauthorised';
    if (status !== null && status >= 500) return 'aplus.collections.error_upstream';
    return 'aplus.collections.error_gateway_not_wired';
  }

  private editErrorKey(err: unknown): string {
    const status = this.httpStatus(err);
    if (status === 400) return 'aplus.collections.error_bad_request';
    if (status === 401 || status === 403) return 'aplus.collections.error_unauthorised';
    if (status === 409) return 'aplus.collections.error_conflict';
    if (status !== null && status >= 500) return 'aplus.collections.error_upstream';
    return 'aplus.collections.error_gateway_not_wired';
  }

  private atomOpErrorKey(err: unknown): string {
    const status = this.httpStatus(err);
    if (status === 404) return 'aplus.collections.error_atom_not_found';
    if (status === 409) return 'aplus.collections.error_atom_duplicate';
    if (status === 422) return 'aplus.collections.error_atom_cap_exceeded';
    if (status === 403) return 'aplus.collections.error_unauthorised';
    if (status !== null && status >= 500) return 'aplus.collections.error_upstream';
    return 'aplus.collections.error_gateway_not_wired';
  }

  /**
   * WS-4 / ADR-233 convert verdicts → i18n keys.
   *
   * ⚠ Reads the error body via `httpErrorView`, which normalises BOTH shapes:
   * the raw `HttpErrorResponse` (body on `.error`, what HttpTestingController
   * yields in specs) AND the runtime `ApiError` the global errorInterceptor
   * re-throws (body on **`.body`**). Reading `err.error` directly passes specs
   * and silently mis-classifies in production
   * (memory: reusable_fe_error_detail_apierror_body_not_error).
   *
   * ⚠ CHO-2174 — THE CODE IS CHECKED BEFORE THE STATUS, and the order below is
   * load-bearing. chora-creation now translates chora-sharing's consent-gate
   * refusals into real statuses (409 CREATION_ATOM_NOT_SHAREABLE, 403
   * CREATION_ATOM_REUSE_DENIED, 502 CREATION_SHARING_*) instead of the old 400
   * CREATION_COLLECTION_INVALID with an `rpc error:` chain in the message. Those
   * statuses COLLIDE with the ones already in use here, so a status-first match
   * would tell the learner two straight lies:
   *
   *   409 → "none of your atoms are available"  (no: ONE atom is unshareable)
   *   403 → "only the owner can convert this"   (no: the caller IS the owner —
   *                                              the ATOM's author refused)
   *
   * Any code we do not recognise still falls through to the status arms, and an
   * unrecognised status still lands on error_gateway_not_wired.
   */
  private convertErrorKey(err: unknown): string {
    const view = httpErrorView(err);
    const status = view?.status ?? this.httpStatus(err);
    const code = this.errorCode(err, view?.body);

    // ── CHO-2174: chora-sharing's verdicts, each owed its own sentence ────────
    // The atom has no reusable projection in chora-sharing (unpublished,
    // withdrawn, or its author narrowed it), so no reuse grant could be minted.
    if (code === 'CREATION_ATOM_NOT_SHAREABLE') {
      return 'aplus.collections.convert_error_atom_not_shareable';
    }
    // The ATOM's author refused THIS learner — not a collection-ownership problem.
    if (code === 'CREATION_ATOM_REUSE_DENIED') {
      return 'aplus.collections.convert_error_reuse_denied';
    }
    // The consent gate could not be evaluated / the grant could not be recorded,
    // so the conversion was REFUSED. Nothing changed — say so, rather than
    // shrugging with a generic "something went wrong".
    if (code === 'CREATION_SHARING_UNAVAILABLE' || code === 'CREATION_SHARING_GATE_ERROR') {
      return 'aplus.collections.convert_error_sharing_unavailable';
    }

    if (code === 'CREATION_COLLECTION_NO_ENTITLED_ATOMS' || status === 409) {
      return 'aplus.collections.convert_error_no_entitled_atoms';
    }
    if (code === 'CREATION_COLLECTION_FORBIDDEN' || status === 403 || status === 401) {
      return 'aplus.collections.convert_error_forbidden';
    }
    if (status === 404) return 'aplus.collections.error_not_found';
    if (status !== null && status >= 500) return 'aplus.collections.error_upstream';
    return 'aplus.collections.error_gateway_not_wired';
  }

  /**
   * Pull the domain error code out of either error shape.
   *
   * Three probes, because there are three real shapes in play:
   *   1. `ApiError.code`      — the runtime errorInterceptor's parsed envelope.
   *   2. `{error:{code}}`     — the nested envelope some services emit.
   *   3. `{code,message}`     — the FLAT envelope chora-creation's writeError
   *      actually emits. Without this probe an interceptor-less caller reads no
   *      code at all and silently falls back to the status — which, post
   *      CHO-2174, is precisely how a 409 CREATION_ATOM_NOT_SHAREABLE would get
   *      mislabelled "none of your atoms are available".
   */
  private errorCode(err: unknown, body: unknown): string | null {
    const direct = (err as { code?: unknown })?.code;
    if (typeof direct === 'string' && direct.length > 0) return direct;
    const envelope = (body as { error?: { code?: unknown } })?.error?.code;
    if (typeof envelope === 'string' && envelope.length > 0) return envelope;
    const flat = (body as { code?: unknown })?.code;
    return typeof flat === 'string' && flat.length > 0 ? flat : null;
  }

  private httpStatus(err: unknown): number | null {
    const e = err as { status?: number };
    return typeof e?.status === 'number' ? e.status : null;
  }
}
