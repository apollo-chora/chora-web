/**
 * Assessment Instantiation model — R+ Phase X.4 (ADR-155 D9 explicit-cohort).
 *
 * Wires the instructor-facing R+ surface for instantiating a published
 * test-set as a live Assessment. Mirrors the wire shape EXACTLY from
 * `chora-contracts/openapi/delivery-assessments.yaml` (snake_case) +
 * `chora-contracts/openapi/delivery-test-sets.yaml` for the picker list +
 * `chora-contracts/openapi/identity-admin.yaml` for the cohort picker.
 *
 * Route hosted here:
 *   - `/r/assessments/new` → AssessmentInstantiationComponent
 *
 * BFF routes hit (via BffClientService, gateway prefix `/api/`):
 *   - GET  /api/v1/test-sets?state=PUBLISHED                    → listTestSets
 *   - GET  /api/v1/admin/tenant-members?q=…                  → searchTenantMembers
 *   - POST /api/v1/assessments                                  → createAssessment
 *
 * Per ADR-155 D9 the `invited_gcids[]` explicit-cohort mode demands ≥1 chip;
 * empty cohort → fail-loud validation per `feedback_no_stubs_real_wiring`.
 */

import { formatDate } from '@angular/common';

// ── Test-set list slice (delivery-test-sets.yaml `TestSet`) ──

/** Lifecycle state for a published test-set in the picker. */
export type TestSetState = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Real-wire DTO row for the test-set picker (light projection). */
export interface TestSetPickerRow {
  readonly test_set_id: string;
  readonly tenant_id: string;
  readonly author_gcid: string;
  readonly title: string;
  readonly description?: string | null;
  readonly learner_facing_name?: string | null;
  readonly state: TestSetState;
  readonly total_points: number;
  readonly question_count: number;
  readonly revision_number?: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly published_at: string | null;
}

/** Cursor-paginated test-set list response (matches `TestSetListResponse`). */
export interface TestSetListResponse {
  readonly items: readonly TestSetPickerRow[];
  readonly next_page_token: string | null;
  readonly total: number | null;
}

// ── Tenant-member search slice (identity-admin.yaml `TenantMemberSummary`) ──

/** Role names enumerated per identity-admin.yaml. */
export type TenantMemberRole =
  | 'LEARNER'
  | 'INSTRUCTOR'
  | 'ADMIN'
  | 'AUDITOR'
  | 'OWNER'
  | 'SUPPORT_AGENT';

/**
 * Real-wire DTO for a tenant member shown in the picker dropdown +
 * carried as a chip once selected. Mirrors the OpenAPI
 * `TenantMemberSummary` schema.
 */
export interface TenantMemberSummary {
  readonly gcid: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly avatar_url?: string | null;
  readonly roles: readonly TenantMemberRole[];
  readonly last_active_at: string | null;
}

/** Paginated tenant-members response. */
export interface TenantMemberSearchResponse {
  readonly items: readonly TenantMemberSummary[];
  readonly next_page_token: string | null;
  readonly total?: number;
}

// ── createAssessment request/response (delivery-assessments.yaml) ──

/**
 * `CreateAssessmentRequest` body for `POST /api/v1/assessments`. Mirrors the
 * OpenAPI schema; ONLY required fields are non-optional here.
 *
 * Per X.4 brief the FE sends the minimum body shape:
 *   `{test_set_id, title, invited_gcids:[...], auto_release:false, start_at?, end_at?}`
 *
 * The OpenAPI schema names the window fields `scheduled_open_at` +
 * `scheduled_close_at` (not `start_at` / `end_at`); the FE serialises to
 * the canonical names so BE accepts the body without a translation shim.
 */
export interface CreateAssessmentRequest {
  readonly test_set_id: string;
  readonly title_override: string;
  readonly invited_gcids: readonly string[];
  readonly grading_config_override?: { readonly auto_release: boolean };
  readonly scheduled_open_at?: string;
  readonly scheduled_close_at?: string;
  readonly max_attempts: number;
  /**
   * Anti-cheat: when true, each learner sees the MCQ options in a
   * per-learner scrambled order (the correct answer isn't always in the
   * same slot). Default OFF — options keep their authored order (owner
   * 2026-06-21). Grading is option_id-based so scrambling is safe.
   */
  readonly shuffle_mcq_options?: boolean;
}

/** Server-echo response slice — enough fields to navigate. */
export interface CreatedAssessment {
  readonly assessment_id: string;
  readonly tenant_id: string;
  readonly instructor_gcid: string;
  readonly test_set_id: string;
  readonly title: string;
  readonly invited_gcids: readonly string[] | null;
  readonly state: string;
  readonly created_at: string;
}

// ── AsyncState discriminated unions ──

/** Test-set picker list-load state. */
export type TestSetListLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly TestSetPickerRow[] }
  | { readonly status: 'error'; readonly error: string };

/** Member-picker search state for the dropdown. */
export type MemberSearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly TenantMemberSummary[] }
  | { readonly status: 'error'; readonly error: string };

/**
 * Field-level validation errors echoed back from the BFF on 400/422.
 *
 * Keys: `test_set_id` / `title` / `invited_gcids` / `auto_release` /
 * `scheduled_open_at` / `scheduled_close_at` / `__form__` (banner).
 */
export type CreateAssessmentFieldErrors = Readonly<Record<string, string>>;

/** Mutation state for the submit CTA. */
export type CreateAssessmentState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly assessment: CreatedAssessment }
  | {
      readonly status: 'error';
      readonly errorKey: string;
      readonly fieldErrors?: CreateAssessmentFieldErrors;
    };

// ── Helpers ──

/** Title validation matches the OpenAPI maxLength + non-empty constraint. */
export function isTitleValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 200;
}

/** Cohort validation — ADR-155 D9 explicit-cohort mode requires ≥1 chip. */
export function isCohortValid(chips: readonly string[]): boolean {
  return chips.length > 0;
}

/** Full-form validity gate for the submit CTA. */
export function isFormValid(snapshot: {
  testSetId: string | null;
  title: string;
  invitedGcids: readonly string[];
}): boolean {
  if (!snapshot.testSetId) return false;
  if (!isTitleValid(snapshot.title)) return false;
  if (!isCohortValid(snapshot.invitedGcids)) return false;
  return true;
}

/**
 * Build the canonical `CreateAssessmentRequest` body from the form
 * snapshot. Optional date fields drop out when blank so the BFF gets a
 * cleanly-typed body (no empty-string serialisations).
 */
export function buildCreateAssessmentRequest(snapshot: {
  testSetId: string;
  title: string;
  invitedGcids: readonly string[];
  autoRelease: boolean;
  startAt: string | null;
  endAt: string | null;
  /** Anti-cheat per-learner MCQ option scramble. Default OFF. */
  shuffleMcqOptions: boolean;
}): CreateAssessmentRequest {
  // FE-BUG-LEG2B-A (2026-05-16): BE rejects flat `auto_release` field;
  // it lives nested under `grading_config_override.auto_release`. Per
  // user 2026-05-15 directive: FE conforms to BE shape.
  const body: {
    test_set_id: string;
    title_override: string;
    invited_gcids: string[];
    grading_config_override?: { auto_release: boolean };
    max_attempts: number;
    scheduled_open_at?: string;
    scheduled_close_at?: string;
    shuffle_mcq_options: boolean;
  } = {
    test_set_id: snapshot.testSetId,
    title_override: snapshot.title.trim(),
    invited_gcids: [...snapshot.invitedGcids],
    grading_config_override: { auto_release: snapshot.autoRelease },
    // Default 1 attempt — matches OpenAPI `max_attempts` min:1; FE form
    // does not surface attempt count in v1, so we lock to the safe min.
    max_attempts: 1,
    // Anti-cheat — explicit on every create so an omitted field can never
    // re-enable the old default-ON behaviour at the BE.
    shuffle_mcq_options: snapshot.shuffleMcqOptions,
  };
  if (snapshot.startAt && snapshot.startAt.length > 0) {
    body.scheduled_open_at = snapshot.startAt;
  }
  if (snapshot.endAt && snapshot.endAt.length > 0) {
    body.scheduled_close_at = snapshot.endAt;
  }
  return body as CreateAssessmentRequest;
}

/**
 * Format a tenant-member row for the result-dropdown display line:
 * `display_name • email • last_active_at`. Falls back gracefully when
 * one or more fields are null. Pure helper — testable in isolation.
 *
 * `last_active_at` is a raw ISO-8601 timestamp on the wire; render it as a
 * human date (`d MMM y`, UTC) so R+ rows never leak microsecond ISO. This
 * mirrors the R+ WBL Placements page (`{{ x | date: 'd MMM y' : 'UTC' }}`,
 * CHO-2335) — `formatDate` is the string-context equivalent of that pipe.
 */
export function formatMemberRowLabel(member: TenantMemberSummary): string {
  const segments: string[] = [];
  if (member.display_name) segments.push(member.display_name);
  if (member.email) segments.push(member.email);
  if (member.last_active_at) {
    segments.push(formatDate(member.last_active_at, 'd MMM y', 'en-US', 'UTC'));
  }
  if (segments.length === 0) {
    // Worst case: render the GCID prefix so the row isn't blank
    segments.push(member.gcid);
  }
  return segments.join(' • ');
}
