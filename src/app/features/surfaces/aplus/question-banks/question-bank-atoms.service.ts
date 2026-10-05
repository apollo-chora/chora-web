/**
 * QuestionBankAtomsService — the /api/atoms/* adapter for the A+ workbench
 * conveniences (preview-as-learner, inline quick-edit, tags/subject, clone).
 *
 * The bank-questions service (question-banks.service.ts) owns the delivery-side
 * /api/v1/question-banks/* surface; this sibling adapter owns the creation-side
 * /api/atoms/* surface so the two domains stay cleanly separated. Shared
 * question models (QuestionReview / EditableQuestion + their parsers) are reused
 * from shared/components — only the thin wire shapes are local here.
 *
 * DATA-FLOW NUANCE (resolved from test-set.service + atom-question-picker):
 * questions ARE atoms intra-domain, so a bank membership row stores the ATOM
 * id. The REAL question_id is EMBEDDED in the atom projection
 * (`mcq_payload.question_id` / `oe_payload.question_id` / `essay_payload.
 * question_id`). Preview + edit therefore GET /api/atoms/{id} first (learner-
 * safe projection, which also yields the embedded question_id), then operate on
 * the /api/atoms/{id}/questions/{qid} sub-resource for the author answer key
 * (edit) — mirroring the proven picker flow.
 *
 * Per chora-web CLAUDE.md §3: all HTTP via BffClientService. Fail-loud: errors
 * propagate untouched (no fixture) per feedback_no_stubs_real_wiring.
 *
 * Endpoints:
 *   - getAtom             GET   /api/atoms/{id}                       (learner-safe projection + meta)
 *   - getEditableQuestion GET   /api/atoms/{id} → GET /api/atoms/{id}/questions/{qid}
 *   - editQuestion        PATCH /api/atoms/{id}/questions/{qid}       (mints a new AtomRevision)
 *   - updateMeta          PATCH /api/atoms/{id}                       (ADR-156: tags + subject)
 *   - clone               POST  /api/atoms/{id}/clone                 (201 → new atom)
 */
import { Injectable, inject } from '@angular/core';
import { type Observable, map, switchMap } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  toQuestionReview,
  type AuthorQuestionRaw,
  type QuestionReview,
} from '../../../../shared/components/chora-question-review/chora-question-review.model';
import {
  toEditableQuestion,
  type EditableQuestion,
} from '../../../../shared/components/chora-question-editor/chora-question-editor.model';

const ATOMS_PATH = '/api/atoms';

/** Learner-safe option (NO `is_correct` — preview must not leak the answer key). */
export interface BankAtomOption {
  readonly label: string;
}

/**
 * The slice of an atom the workbench conveniences need: learner-safe preview
 * (prompt + options/stem), atom-level meta (tags + subject, ADR-156), and the
 * EMBEDDED question_id used to address the question sub-resource for edit.
 */
export interface BankAtom {
  readonly atomId: string;
  readonly atomType: string;
  readonly title: string;
  readonly subject: string;
  readonly tags: readonly string[];
  /** Embedded question UUID (NOT the atom id) — addresses the question sub-resource. */
  readonly questionId: string;
  readonly isOpenEnded: boolean;
  readonly prompt: string;
  /** Learner-safe options (MCQ only; empty for open-ended). */
  readonly options: readonly BankAtomOption[];
}

/** Outcome of a clone request (201). */
export interface ClonedAtom {
  readonly atomId: string;
  readonly clonedFrom: string;
}

/** Wire body for PATCH /api/atoms/{id}/questions/{qid} (partial edit). */
export interface EditQuestionRequest {
  readonly prompt?: string;
  readonly mcq_payload?: {
    readonly options: readonly {
      readonly option_id: string;
      readonly label: string;
      readonly is_correct: boolean;
      readonly explainer: string;
    }[];
  };
  readonly oe_payload?: { readonly model_answer: string };
  /**
   * Image fields are CLEAR-PATH ONLY. The BE (CHO-1974, resolvePatchImageRef)
   * applies per-field semantics: OMITTED ⇒ keep the durable gs:// ref forward,
   * `''` ⇒ explicit clear (Remove), value ⇒ set. A normal text save MUST omit
   * these (never echo the transient signed DISPLAY url back) so the durable ref
   * survives; `editsToRequest` deliberately never emits them. Only the "Remove
   * image" affordance sets `''` here. `image_url` = question/stem illustration;
   * `answer_image_url` = model-answer illustration.
   */
  readonly image_url?: string;
  readonly answer_image_url?: string;
}

// ── Wire shapes (snake_case; defensive optionals) ───────────────────────────

interface WireAtomPayload {
  readonly question_id?: string;
  readonly prompt?: string;
  readonly options?: readonly { readonly label?: string; readonly text?: string }[];
}

interface WireAtom {
  readonly atom_id?: string;
  readonly atom_type?: string;
  readonly title?: string;
  readonly subject?: string;
  readonly tags?: readonly string[];
  readonly mcq_payload?: WireAtomPayload | null;
  readonly oe_payload?: WireAtomPayload | null;
  readonly essay_payload?: WireAtomPayload | null;
}

interface WireAtomEnvelope {
  readonly atom?: WireAtom;
}

/**
 * Clone 201 = the flat cloned ATOM (verified against chora-creation
 * atom_clone_handler `writeJSON(StatusCreated, clone)` → `{atom_id,
 * cloned_from_atom_id, title, status, …}`). It is NOT a `{atom, question}`
 * envelope; only `atom_id` (the new variant) is load-bearing here.
 */
interface WireCloneResponse {
  readonly atom_id?: string;
  readonly cloned_from_atom_id?: string;
}

/** Map the GET /api/atoms/{id} envelope to the learner-safe `BankAtom`. */
function mapBankAtom(env: WireAtomEnvelope): BankAtom {
  const a = env.atom ?? {};
  const mcq = a.mcq_payload ?? null;
  const payload = mcq ?? a.oe_payload ?? a.essay_payload ?? null;
  const options = (mcq?.options ?? []).map((o) => ({
    label: (o.text?.trim() || o.label?.trim()) ?? '',
  }));
  return {
    atomId: a.atom_id ?? '',
    atomType: a.atom_type ?? '',
    title: a.title ?? '',
    subject: a.subject ?? '',
    tags: a.tags ?? [],
    questionId: payload?.question_id ?? '',
    isOpenEnded: !mcq,
    prompt: payload?.prompt ?? '',
    options,
  };
}

@Injectable({ providedIn: 'root' })
export class QuestionBankAtomsService {
  private readonly bff = inject(BffClientService);

  /**
   * Learner-safe atom projection + atom-level meta + the embedded question_id.
   * Powers preview-as-learner (prompt + options, NO answer key) and the
   * tags/subject editor pre-fill; also the first hop of the edit chain.
   */
  getAtom(atomId: string): Observable<BankAtom> {
    return this.bff
      .get<WireAtomEnvelope>(`${ATOMS_PATH}/${encodeURIComponent(atomId)}`)
      .pipe(map(mapBankAtom));
  }

  /**
   * Resolve a picker/clone ATOM id → the embedded QUESTION id (the
   * chora_creation.questions PK that a QuestionBank actually references). The
   * picker emits the atom id, but `addQuestion` validates `question_id` against
   * the questions table (QuestionLookup.Resolve → 404 if you post an atom id).
   * Returns '' when the atom has no live question (e.g. a seed atom) — the
   * caller must NOT post in that case. Reuses the learner-safe projection.
   */
  resolveQuestionId(atomId: string): Observable<string> {
    return this.getAtom(atomId).pipe(map((atom) => atom.questionId));
  }

  /**
   * Resolve the AUTHOR review for a bank row: GET the atom (for the embedded
   * question_id), then GET the AUTHOR question projection and normalise it to a
   * `QuestionReview` (the answer-key reveal — MCQ correct option + OE model
   * answer + rubric + images). Powers the workbench Preview via the shared
   * `ChoraQuestionReviewComponent` — the SAME author review the test-set editor
   * renders (curation surface: the author reviews the full question, not the
   * learner-safe projection). Same chain as `getEditableQuestion`, but stops at
   * the `QuestionReview` rather than converting to an `EditableQuestion`.
   */
  getQuestionReview(atomId: string): Observable<QuestionReview> {
    return this.getAtom(atomId).pipe(
      switchMap((atom) =>
        this.bff
          .get<AuthorQuestionRaw>(
            `${ATOMS_PATH}/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(atom.questionId)}`,
          )
          .pipe(map((raw) => toQuestionReview(raw))),
      ),
    );
  }

  /**
   * Resolve the editable question for a bank row: GET the atom (for the embedded
   * question_id), then GET the AUTHOR question projection (answer key) and
   * normalise it to an `EditableQuestion`. Returns the question_id too so the
   * caller can PATCH the same sub-resource on Save.
   */
  getEditableQuestion(atomId: string): Observable<{
    readonly questionId: string;
    readonly editable: EditableQuestion;
    /** Stem illustration URL (if any) so the quick-edit view can show it. */
    readonly questionImageUrl: string | null;
    /** Model-answer illustration URL (if any) — shown + removable in the panel. */
    readonly answerImageUrl: string | null;
  }> {
    return this.getAtom(atomId).pipe(
      switchMap((atom) =>
        this.bff
          .get<AuthorQuestionRaw>(
            `${ATOMS_PATH}/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(atom.questionId)}`,
          )
          .pipe(
            map((raw) => {
              const review = toQuestionReview(raw);
              return {
                questionId: atom.questionId,
                editable: toEditableQuestion(review),
                questionImageUrl: review.question_image_url,
                answerImageUrl: review.answer_image_url,
              };
            }),
          ),
      ),
    );
  }

  /**
   * Edit a question's content — PATCH /api/atoms/{id}/questions/{qid}. The BE
   * mints a NEW AtomRevision (append-only, non-destructive). 2xx → void.
   */
  editQuestion(
    atomId: string,
    questionId: string,
    req: EditQuestionRequest,
  ): Observable<void> {
    return this.bff
      .patch<void>(
        `${ATOMS_PATH}/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(questionId)}`,
        req,
      )
      .pipe(map(() => undefined));
  }

  /**
   * Edit atom-level metadata (ADR-156 Phase-1: free-text `subject` ≤64 +
   * free-form `tags`) — PATCH /api/atoms/{id}. 2xx → void; errors propagate.
   */
  updateMeta(
    atomId: string,
    meta: { readonly tags: readonly string[]; readonly subject: string },
  ): Observable<void> {
    return this.bff
      .patch<void>(`${ATOMS_PATH}/${encodeURIComponent(atomId)}`, {
        tags: meta.tags,
        subject: meta.subject,
      })
      .pipe(map(() => undefined));
  }

  /**
   * Clone an atom as a new variant — POST /api/atoms/{id}/clone. Optional
   * `title` overrides the default "Copy of …". 201 → the new atom ref.
   */
  clone(atomId: string, title?: string): Observable<ClonedAtom> {
    const body = title && title.trim().length > 0 ? { title: title.trim() } : {};
    return this.bff
      .post<WireCloneResponse>(`${ATOMS_PATH}/${encodeURIComponent(atomId)}/clone`, body)
      .pipe(map((r) => ({ atomId: r.atom_id ?? '', clonedFrom: r.cloned_from_atom_id ?? '' })));
  }
}

/**
 * Build the PATCH-question body from an `EditableQuestion` (mirrors the
 * test-set editor's `editsToRequest`). Empty `option_id` ⇒ the backend assigns
 * a UUIDv7 for a freshly-added option. Pure function — exported for reuse + test.
 */
export function editsToRequest(edits: EditableQuestion): EditQuestionRequest {
  if (edits.question_type === 'mcq') {
    return {
      prompt: edits.prompt.trim(),
      mcq_payload: {
        options: edits.options.map((o) => ({
          option_id: o.option_id ?? '',
          label: o.label.trim(),
          is_correct: o.is_correct,
          explainer: o.explainer.trim(),
        })),
      },
    };
  }
  return {
    prompt: edits.prompt.trim(),
    oe_payload: { model_answer: edits.model_answer.trim() },
  };
}
