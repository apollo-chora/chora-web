/**
 * Project Group Detail model — R+ Wave-5 drill-down.
 *
 * Re-exports the canonical `ProjectGroup` aggregate + wire mapper from
 * the sibling list directory so the FE has a single source of truth for
 * the snake_case → camelCase wire mapping. The detail screen does NOT
 * carry any extra fields today (the backend `projectGroupDTO` is
 * identical for list rows + single-fetch). The re-export keeps a clean
 * seam in case a follow-on iteration adds detail-only fields (e.g.,
 * deliverable attachments, rubric breakdown).
 *
 * Drill-down route: `/r/project-groups/:id` (rplus.routes.ts is owned
 * by master).
 */
export type {
  ProjectGroup,
  ProjectGroupBadge,
  ProjectGroupList,
  ProjectGroupListWire,
  ProjectGroupMember,
  ProjectGroupState,
  ProjectGroupWire,
} from '../project-groups/project-groups.model';

export {
  badgeForState,
  canGrade,
  canSubmit,
  iconForState,
  mapWireToGroup,
  membersMutable,
  normaliseRole,
} from '../project-groups/project-groups.model';
