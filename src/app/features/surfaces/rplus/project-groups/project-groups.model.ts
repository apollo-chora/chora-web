/**
 * Project Groups model — R+ Stage C-lite wave-2b (M15b).
 *
 * Surfaces the chora-delivery ProjectGroup aggregate (state machine
 * FORMING → ACTIVE → SUBMITTED → GRADED) to the R+ instructor view.
 *
 * Domain vocabulary anchors:
 *   - `ProjectGroup` — chora-delivery aggregate (course-scoped team)
 *   - `Course` — cross-aggregate UUID reference via `courseId`
 *   - `Member` — `{ gcid, role }` where role ∈ {`leader`, `member`}
 *
 * Wire shape matches the BFF passthrough of
 * `services/chora-delivery/internal/adapter/http/project_group_handler.go`
 * `projectGroupDTO`. The mapping function `mapWireToGroup` enforces a
 * narrow TS surface even though the backend payload carries optional
 * grading-only fields (score_pct / grader_gcid / graded_at / feedback).
 */

/**
 * The four canonical states of the ProjectGroup FSM.
 */
export type ProjectGroupState = 'FORMING' | 'ACTIVE' | 'SUBMITTED' | 'GRADED';

/**
 * Severity / colour bucket for the state badge — drives BEM modifier
 * + accent picking on the card chip.
 */
export type ProjectGroupBadge =
  | 'badge-forming'
  | 'badge-active'
  | 'badge-submitted'
  | 'badge-graded';

/**
 * Single group member binding.
 */
export interface ProjectGroupMember {
  readonly gcid: string;
  readonly role: 'leader' | 'member';
}

/**
 * Canonical TS shape — the FE consumes only this narrow projection,
 * never the raw wire payload.
 */
export interface ProjectGroup {
  readonly id: string;
  readonly tenantId: string;
  readonly courseId: string;
  readonly name: string;
  readonly state: ProjectGroupState;
  readonly members: readonly ProjectGroupMember[];
  /** Populated when state ∈ {SUBMITTED, GRADED}. */
  readonly submittedAt?: string;
  /** Populated when state = GRADED. */
  readonly scorePct?: number;
  /** Populated when state = GRADED. */
  readonly graderGcid?: string;
  /** Populated when state = GRADED. */
  readonly gradedAt?: string;
  /** Populated when state = GRADED. */
  readonly feedback?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Wire envelope from the BFF list endpoint
 * (`GET /api/v1/project-groups[?course_id=]`).
 */
export interface ProjectGroupList {
  readonly items: readonly ProjectGroup[];
}

/**
 * Wire DTO matching `projectGroupDTO` in
 * `services/chora-delivery/internal/adapter/http/project_group_handler.go`.
 * snake_case keys; optional grading fields appear only post-Grade().
 */
export interface ProjectGroupWire {
  readonly id: string;
  readonly tenant_id: string;
  readonly course_id: string;
  readonly name: string;
  readonly state: ProjectGroupState;
  readonly members: readonly {
    readonly gcid: string;
    readonly role: string;
  }[];
  readonly submitted_at?: string;
  readonly score_pct?: number;
  readonly grader_gcid?: string;
  readonly graded_at?: string;
  readonly feedback?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Wire list envelope from the BFF.
 */
export interface ProjectGroupListWire {
  readonly items: readonly ProjectGroupWire[];
}

/**
 * Narrows the wire role to the canonical TS union. Unknown roles
 * default to `member` — the backend's NewProjectGroup() already
 * canonicalises so this is purely defensive.
 */
export function normaliseRole(role: string): 'leader' | 'member' {
  return role === 'leader' ? 'leader' : 'member';
}

/**
 * Maps a wire-format ProjectGroupWire into the narrow TS shape.
 */
export function mapWireToGroup(w: ProjectGroupWire): ProjectGroup {
  return {
    id: w.id,
    tenantId: w.tenant_id,
    courseId: w.course_id,
    name: w.name,
    state: w.state,
    members: w.members.map((m) => ({
      gcid: m.gcid,
      role: normaliseRole(m.role),
    })),
    submittedAt: w.submitted_at,
    scorePct: w.score_pct,
    graderGcid: w.grader_gcid,
    gradedAt: w.graded_at,
    feedback: w.feedback,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

/**
 * Resolves the badge bucket for a given group state — used to pick
 * the SCSS modifier on the state chip.
 */
export function badgeForState(state: ProjectGroupState): ProjectGroupBadge {
  switch (state) {
    case 'FORMING':
      return 'badge-forming';
    case 'ACTIVE':
      return 'badge-active';
    case 'SUBMITTED':
      return 'badge-submitted';
    case 'GRADED':
      return 'badge-graded';
  }
}

/**
 * Picks the FontAwesome glyph for the state badge icon.
 */
export function iconForState(state: ProjectGroupState): string {
  switch (state) {
    case 'FORMING':
      return 'fa-users-line';
    case 'ACTIVE':
      return 'fa-bolt';
    case 'SUBMITTED':
      return 'fa-paper-plane';
    case 'GRADED':
      return 'fa-square-check';
  }
}

/**
 * Reports whether the SUBMIT CTA should render. Only ACTIVE groups
 * accept submit per the FSM (FORMING → ACTIVE via Activate(); ACTIVE
 * → SUBMITTED via Submit()).
 */
export function canSubmit(g: ProjectGroup): boolean {
  return g.state === 'ACTIVE';
}

/**
 * Reports whether the GRADE CTA should render. Only SUBMITTED groups
 * accept grade per the FSM.
 */
export function canGrade(g: ProjectGroup): boolean {
  return g.state === 'SUBMITTED';
}

/**
 * Reports whether the roster may still be edited (add / remove members).
 * Mirrors the BE `ProjectGroup.MembersMutable()` invariant: membership is
 * mutable only while the group is FORMING or ACTIVE; it freezes at SUBMITTED
 * / GRADED (the grade attaches to a fixed roster).
 */
export function membersMutable(g: ProjectGroup): boolean {
  return g.state === 'FORMING' || g.state === 'ACTIVE';
}
