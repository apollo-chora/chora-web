import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import {
  LearningAtom,
  AtomConnection,
  AtomType,
  AtomStatus,
  ValidateAnswerRequest,
  ValidationResult,
  AtomState,
  AtomListState,
  ValidationState,
  PageInfo,
} from '../models/atom.models';

// ---------------------------------------------------------------------------
// Atom Filter Params
// ---------------------------------------------------------------------------

export interface AtomFilterParams {
  topicId?: string;
  atomType?: AtomType;
  difficulty?: number;
  status?: AtomStatus;
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class AtomService {
  private readonly bff = inject(BffClientService);

  // --- Signals for current atom ---
  private readonly _atomState = signal<AtomState>({ status: 'idle' });
  readonly atomState = this._atomState.asReadonly();
  readonly currentAtom = computed(() => {
    const s = this._atomState();
    return s.status === 'success' ? s.atom : null;
  });

  // --- Signals for atom list ---
  private readonly _listState = signal<AtomListState>({ status: 'idle' });
  readonly listState = this._listState.asReadonly();
  readonly atoms = computed(() => {
    const s = this._listState();
    return s.status === 'success' ? s.atoms : [];
  });

  // --- Signals for validation ---
  private readonly _validationState = signal<ValidationState>({ status: 'idle' });
  readonly validationState = this._validationState.asReadonly();

  // ---------------------------------------------------------------------------
  // GraphQL Queries
  // ---------------------------------------------------------------------------

  loadAtom(id: string): Observable<LearningAtom | null> {
    this._atomState.set({ status: 'loading' });

    return this.bff.get<LearningAtom>(
      `/api/v1/atoms/${encodeURIComponent(id)}`,
    ).pipe(
      tap((atom) => {
        if (atom) {
          this._atomState.set({ status: 'success', atom });
        } else {
          this._atomState.set({
            status: 'error',
            error: { code: 'ATOM_NOT_FOUND', message: 'Atom not found' },
          });
        }
      }),
      catchError((err: Error) => {
        this._atomState.set({
          status: 'error',
          error: { code: 'ATOM_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  loadAtoms(params: AtomFilterParams = {}): Observable<AtomConnection | null> {
    this._listState.set({ status: 'loading' });

    const queryParts: string[] = [];
    if (params.topicId) queryParts.push(`topic_id=${params.topicId}`);
    if (params.atomType) queryParts.push(`atom_type=${params.atomType}`);
    if (params.difficulty) queryParts.push(`difficulty=${params.difficulty}`);
    if (params.status) queryParts.push(`status=${params.status}`);
    if (params.cursor) queryParts.push(`cursor=${params.cursor}`);
    if (params.limit) queryParts.push(`limit=${params.limit}`);
    const qs = queryParts.length ? `?${queryParts.join('&')}` : '';

    return this.bff.get<{ data: LearningAtom[]; page_info?: { has_next: boolean; cursor?: string } }>(
      `/api/v1/atoms${qs}`,
    ).pipe(
      map((res) => {
        const atoms = res.data ?? [];
        const edges = atoms.map((a) => ({ node: a, cursor: a.id }));
        const pageInfo: PageInfo = {
          has_next_page: res.page_info?.has_next ?? false,
          has_previous_page: false,
          start_cursor: atoms.length > 0 ? atoms[0].id : null,
          end_cursor: atoms.length > 0 ? atoms[atoms.length - 1].id : null,
        };
        return { edges, page_info: pageInfo, total_count: atoms.length } as AtomConnection;
      }),
      tap((conn) => {
        if (conn) {
          this._listState.set({
            status: 'success',
            atoms: conn.edges.map((e) => e.node),
            pageInfo: conn.page_info,
            totalCount: conn.total_count,
          });
        }
      }),
      catchError((err: Error) => {
        this._listState.set({
          status: 'error',
          error: { code: 'ATOM_LIST_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Answer Validation (REST — POST /api/v1/atoms/{atomId}/validate)
  // ---------------------------------------------------------------------------

  validateAnswer(atomId: string, request: ValidateAnswerRequest): Observable<ValidationResult | null> {
    return this.validateAnswerRest(atomId, request);
  }

  // ---------------------------------------------------------------------------
  // REST: Answer validation (alternative — POST /api/v1/atoms/{atomId}/validate)
  // ---------------------------------------------------------------------------

  validateAnswerRest(atomId: string, request: ValidateAnswerRequest): Observable<ValidationResult | null> {
    this._validationState.set({ status: 'submitting' });

    return this.bff.post<ValidationResult>(
      `/api/v1/atoms/${encodeURIComponent(atomId)}/validate`, request,
    ).pipe(
      tap((result) => {
        this._validationState.set({ status: 'success', result });
      }),
      catchError((err: Error) => {
        this._validationState.set({
          status: 'error',
          error: { code: 'VALIDATION_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetAtomState(): void {
    this._atomState.set({ status: 'idle' });
  }

  resetListState(): void {
    this._listState.set({ status: 'idle' });
  }

  resetValidationState(): void {
    this._validationState.set({ status: 'idle' });
  }
}
