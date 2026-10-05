/**
 * QuestionBank model — R+ reusable question pools + TestSet assembly.
 *
 * A `QuestionBank` is an author-owned, reusable pool of question references
 * (each question IS an atom intra-domain). From a bank an author assembles a
 * TestSet (async job) which is then attachable to an Offering via its
 * Assessments tab.
 *
 * Wire types are snake_case (`BackendQuestionBank*`); the FE model is camelCase
 * (`QuestionBank`). Mapping happens at the service boundary
 * (`question-banks.service.ts`) — the SAME idiom as `offerings.model.ts`. The
 * aggregate key on the wire is `question_bank_id` (NOT `id`), mapped → `id`
 * here (mirrors the offerings `assessment_id` → `id` lesson). Fail-loud: no
 * fixture fallback; the model mirrors the wire honestly (no invented fields).
 */

/** Bank visibility. BE contract: PRIVATE (owner-only) | TENANT_INTERNAL (tenant). */
export type QuestionBankVisibility = 'PRIVATE' | 'TENANT_INTERNAL';

/** FE (camelCase) membership row — one question's place in the bank. */
export interface QuestionBankItem {
  readonly questionId: string;
  readonly position: number;
  readonly addedAt: string;
  /**
   * The question stem. EMPTY when the backend resolved none, which the row
   * must render as an identifier rather than as a title: a bare UUID sitting
   * where a stem belongs reads as the question's name.
   */
  readonly prompt: string;
  readonly questionType: string;
}

/** FE (camelCase) question bank. */
export interface QuestionBank {
  readonly id: string;
  readonly tenantId: string;
  readonly ownerGcid: string;
  readonly name: string;
  readonly description: string;
  readonly visibility: QuestionBankVisibility;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Membership rows; populated by the detail GET (may be omitted on lists). */
  readonly items: readonly QuestionBankItem[];
}

/** FE (camelCase) "my banks" page. */
export interface QuestionBankPage {
  readonly items: readonly QuestionBank[];
  readonly total: number;
}

/** FE (camelCase) outcome of an assemble-test-set request (async job). */
export interface AssembleTestSetResult {
  readonly jobId: string;
  readonly testSetStatus: string;
}

// ── Wire (snake_case) shapes ────────────────────────────────────────────────

/**
 * Wire membership row.
 *
 * R6 D2: the backend's `listQuestions` returns EnrichedQuestionBankItem, which
 * resolves the question's stem by an intra-DB JOIN precisely so a row need not
 * show a bare id (`questionbank/service.go:129-131`). The FE declared this type
 * without `prompt` and so dropped it at the boundary, leaving the Detail page
 * rendering opaque UUIDs. Optional here because an older row, or one whose
 * lookup found nothing, legitimately has none.
 */
export interface BackendQuestionBankItem {
  readonly question_id: string;
  readonly position?: number;
  readonly added_at?: string;
  /** The question stem, resolved server-side. Absent when unresolved. */
  readonly prompt?: string;
  readonly question_type?: string;
  readonly atom_id?: string;
}

/** Wire question bank. */
export interface BackendQuestionBank {
  readonly question_bank_id: string;
  readonly tenant_id: string;
  readonly owner_gcid: string;
  readonly name: string;
  readonly description?: string;
  readonly visibility: string;
  readonly tags?: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly items?: readonly BackendQuestionBankItem[];
}

/** Wire "my banks" list response. */
export interface BackendQuestionBankPage {
  readonly items?: readonly BackendQuestionBank[];
  readonly total?: number;
}

/** Wire bank-questions list response. */
export interface BackendQuestionBankItemsPage {
  readonly items?: readonly BackendQuestionBankItem[];
  readonly total?: number;
}

/** Wire assemble-test-set response (202). */
export interface BackendAssembleTestSetResponse {
  readonly job_id: string;
  readonly test_set_status: string;
}

// ── i18n key builders (single source of truth for badge cells) ──────────────

/** i18n key for a visibility value (badge cell + create-form option share this). */
export function visibilityLabelKey(value: string): string {
  return `rplus.question_banks.visibility_value.${value}`;
}

// ── Mappers (wire → FE) ─────────────────────────────────────────────────────

/** Map one wire membership row to the FE model (defensive defaults). */
export function mapBackendQuestionBankItem(i: BackendQuestionBankItem): QuestionBankItem {
  return {
    questionId: i.question_id,
    position: i.position ?? 0,
    addedAt: i.added_at ?? '',
    prompt: (i.prompt ?? '').trim(),
    questionType: (i.question_type ?? '').trim(),
  };
}

/**
 * Map one wire bank to the FE model. `visibility` is cast to its union — an
 * unexpected token still renders (its badge i18n key resolves to the raw token)
 * rather than throwing and blanking the page on a single odd row.
 */
export function mapBackendQuestionBank(b: BackendQuestionBank): QuestionBank {
  return {
    id: b.question_bank_id,
    tenantId: b.tenant_id,
    ownerGcid: b.owner_gcid,
    name: b.name,
    description: b.description ?? '',
    visibility: b.visibility as QuestionBankVisibility,
    tags: b.tags ?? [],
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    items: (b.items ?? []).map(mapBackendQuestionBankItem),
  };
}

/** Map the wire "my banks" page to the FE page (defensive defaults). */
export function mapBackendQuestionBankPage(resp: BackendQuestionBankPage): QuestionBankPage {
  return {
    items: (resp.items ?? []).map(mapBackendQuestionBank),
    total: resp.total ?? 0,
  };
}

/** Map the wire assemble response to the FE result. */
export function mapBackendAssembleResult(r: BackendAssembleTestSetResponse): AssembleTestSetResult {
  return {
    jobId: r.job_id,
    testSetStatus: r.test_set_status,
  };
}
