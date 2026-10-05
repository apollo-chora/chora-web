/**
 * FamiliarPersonaService — chora-gateway client for the Grimoire Persona sheet
 * (CHO-2015, ADR-219 D2). Dedicated (not folded into FamiliarGrowthService) so
 * the Persona surface has a clean DDD boundary on the FE.
 *
 * The persona wire is camelCase END-TO-END and NOT `{data:T}`-enveloped
 * (FamiliarBridge proxies with `classify`, raw pass-through). Every response is
 * validated with a type guard and fails LOUD on a malformed shape — no
 * fabricated data (feedback_no_stubs_real_wiring). Downstream conflicts
 * (404 FAMILIAR_NOT_FOUND / 422 PERSONA_INVALID / 422 PERSONA_NOTE_BLOCKED /
 * 502 PERSONA_SCREEN_FAILED / 503 PERSONA_*_NOT_WIRED) propagate with their
 * status + code preserved so the tab renders the honest conflict.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BffClientService } from '../services/bff-client.service';
import type { PersonaEditRequest, PersonaView } from './familiar-persona.model';
import { isPersonaView } from './familiar-persona.model';

/** Throw on a malformed persona-view response (fail-loud). */
function expectPersonaView(raw: unknown): PersonaView {
  if (!isPersonaView(raw)) {
    throw new Error('familiar-persona: malformed persona response');
  }
  return raw;
}

@Injectable({ providedIn: 'root' })
export class FamiliarPersonaService {
  private readonly bff = inject(BffClientService);

  private url(familiarId: string): string {
    return `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/persona`;
  }

  /** GET the caller's current editable Persona view for a familiar. */
  getPersona(familiarId: string): Observable<PersonaView> {
    return this.bff.get<unknown>(this.url(familiarId)).pipe(map(expectPersonaView));
  }

  /**
   * PUT a full Persona edit. The server Model-Armor-screens the guidance note
   * BEFORE persisting (Block → 422 PERSONA_NOTE_BLOCKED); on success the
   * returned view carries the bumped version.
   */
  updatePersona(familiarId: string, body: PersonaEditRequest): Observable<PersonaView> {
    return this.bff.put<unknown>(this.url(familiarId), body).pipe(map(expectPersonaView));
  }
}
