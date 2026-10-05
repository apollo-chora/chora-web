// TODO(dedup): `resolveQuestionId` (+ its wire shape) duplicates
// aplus/question-banks/question-bank-atoms.service.ts. Promote to ONE shared
// question-atom resolver both surfaces import (Phase-A.2 follow-up — same dedup
// family as the deliberately-duplicated question-banks.{model,service}.ts).
/**
 * QuestionBankAtomsService (R+) — minimal /api/atoms/* adapter for the R+
 * question-bank detail. R+ only needs to resolve a picker/clone ATOM id → the
 * embedded QUESTION id before adding it to a bank (the bank references the
 * chora_creation.questions PK, not the atom id — posting the atom id 404s
 * CREATION_QUESTION_NOT_FOUND, QuestionLookup.Resolve). Mirrors the A+ fix.
 *
 * Per chora-web CLAUDE.md §3: all HTTP via BffClientService. Fail-loud: errors
 * propagate (no fixture) per feedback_no_stubs_real_wiring.
 */
import { Injectable, inject } from '@angular/core';
import { type Observable, map } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';

const ATOMS_PATH = '/api/atoms';

/** Embedded question id lives in the atom's type payload. */
interface WireAtomPayload {
  readonly question_id?: string;
}

interface WireAtom {
  readonly mcq_payload?: WireAtomPayload | null;
  readonly oe_payload?: WireAtomPayload | null;
  readonly essay_payload?: WireAtomPayload | null;
}

interface WireAtomEnvelope {
  readonly atom?: WireAtom;
}

@Injectable({ providedIn: 'root' })
export class QuestionBankAtomsService {
  private readonly bff = inject(BffClientService);

  /**
   * Resolve an ATOM id → the embedded QUESTION id (the questions-table PK a
   * QuestionBank actually references). Returns '' when the atom has no live
   * question (e.g. a seed atom) — the caller must NOT post in that case.
   */
  resolveQuestionId(atomId: string): Observable<string> {
    return this.bff
      .get<WireAtomEnvelope>(`${ATOMS_PATH}/${encodeURIComponent(atomId)}`)
      .pipe(
        map((env) => {
          const a = env.atom ?? {};
          const payload = a.mcq_payload ?? a.oe_payload ?? a.essay_payload ?? null;
          return payload?.question_id ?? '';
        }),
      );
  }
}
