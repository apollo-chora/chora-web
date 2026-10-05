/**
 * FamiliarMapService — chora-gateway client for the familiar-per-map flow
 * (ADR-212 WS-3). Wired through `BffClientService` per chora-web/CLAUDE.md §3.
 *
 * Fail-loud: raw Observables so subscribers see the real gateway error. No
 * fixtures / fallbacks.
 *
 * FE-facing paths (gateway → chora-consumption `/v1/me/familiars/*`):
 *   POST /api/v1/me/familiars/acquire
 *   GET  /api/v1/me/familiars/bindings
 *   GET  /api/v1/me/familiars/{familiarId}/memory
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AcquireFamiliarRequest,
  AcquiredFamiliar,
  FamiliarBindingsResponse,
  FamiliarMapMemory,
} from './familiar-map.model';

const BASE = '/api/v1/me/familiars';

@Injectable({ providedIn: 'root' })
export class FamiliarMapService {
  private readonly bff = inject(BffClientService);

  /** POST: acquire a Familiar for a map. Returns the new binding (201). */
  acquire(request: AcquireFamiliarRequest): Observable<AcquiredFamiliar> {
    return this.bff.post<AcquiredFamiliar>(`${BASE}/acquire`, request);
  }

  /** GET the learner's map↔Familiar bindings. */
  listBindings(): Observable<FamiliarBindingsResponse> {
    return this.bff.get<FamiliarBindingsResponse>(`${BASE}/bindings`);
  }

  /**
   * GET a Familiar's memory + persona/rules/focus + visible-neighbour citations.
   *
   * `goalId` scopes the visible-neighbour block to that map's concept subtree
   * (ADR-214). Omit it ONLY from a non-map caller: a ConceptNode carries no goal
   * column, so an unscoped read returns the learner's WHOLE flat concept space
   * and lists every other map's concepts on this one.
   */
  getMemory(familiarId: string, goalId?: string): Observable<FamiliarMapMemory> {
    const scope = goalId?.trim()
      ? `?goal_id=${encodeURIComponent(goalId.trim())}`
      : '';
    return this.bff.get<FamiliarMapMemory>(
      `${BASE}/${encodeURIComponent(familiarId)}/memory${scope}`,
    );
  }
}
