/**
 * ProjectGroupsService — R+ Stage C-lite wave-2b (M15b).
 *
 * Real BFF wiring (per `feedback_no_stubs_real_wiring`):
 *
 *   POST  /api/v1/project-groups                 — create FORMING
 *   GET   /api/v1/project-groups[?course_id=]    — list
 *   POST  /api/v1/project-groups/{id}/submit     — ACTIVE → SUBMITTED
 *   POST  /api/v1/project-groups/{id}/grade      — SUBMITTED → GRADED
 *
 * The BFF (`chora-gateway`) proxies these prefixes to chora-delivery's
 * `project_group_handler.go`. The list endpoint defaults to the caller's
 * current tenant when no `course_id` filter is supplied.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  type ProjectGroup,
  type ProjectGroupListWire,
  type ProjectGroupWire,
  mapWireToGroup,
} from './project-groups.model';

interface GradeRequest {
  readonly scorePct: number;
  readonly feedback?: string;
}

/**
 * Create payload (camelCase FE surface). Maps onto the snake_case
 * `createProjectGroupReq` consumed by chora-delivery's
 * `handleProjectGroupCreate`. The backend constructor requires `course_id`
 * + `name` (both non-empty); `members` may be empty at FORMING (Activate()
 * later requires ≥1) and each member is `{ gcid, role }` with role ∈
 * {leader, member}.
 */
export interface CreateProjectGroupRequest {
  readonly courseId: string;
  readonly name: string;
  readonly members: ReadonlyArray<{
    readonly gcid: string;
    readonly role: 'leader' | 'member';
  }>;
}

@Injectable({ providedIn: 'root' })
export class ProjectGroupsService {
  private readonly bff = inject(BffClientService);

  /**
   * Creates a FORMING project group. POSTs the snake_case
   * `createProjectGroupReq` body to the BFF root endpoint; the backend
   * returns the freshly-minted `projectGroupDTO` (201). RBAC
   * (instructor / admin / training-admin) is enforced server-side — a
   * 403 surfaces loud to the caller per `feedback_no_stubs_real_wiring`.
   */
  create(req: CreateProjectGroupRequest): Observable<ProjectGroup> {
    return this.bff
      .post<ProjectGroupWire>('/api/v1/project-groups', {
        course_id: req.courseId,
        name: req.name,
        members: req.members.map((m) => ({ gcid: m.gcid, role: m.role })),
      })
      .pipe(map(mapWireToGroup));
  }

  /**
   * Lists project groups for the caller's tenant. When `courseId` is
   * supplied the list is narrowed to that course; otherwise all
   * groups in the tenant scope are returned.
   */
  list(courseId?: string): Observable<readonly ProjectGroup[]> {
    const suffix = courseId
      ? `?course_id=${encodeURIComponent(courseId)}`
      : '';
    return this.bff
      .get<ProjectGroupListWire>(`/api/v1/project-groups${suffix}`)
      .pipe(map((resp) => resp.items.map(mapWireToGroup)));
  }

  /**
   * Transitions ACTIVE → SUBMITTED via the BFF.
   */
  submit(groupId: string): Observable<ProjectGroup> {
    return this.bff
      .post<ProjectGroupWire>(
        `/api/v1/project-groups/${encodeURIComponent(groupId)}/submit`,
        {},
      )
      .pipe(map(mapWireToGroup));
  }

  /**
   * Transitions SUBMITTED → GRADED via the BFF.
   */
  grade(groupId: string, body: GradeRequest): Observable<ProjectGroup> {
    return this.bff
      .post<ProjectGroupWire>(
        `/api/v1/project-groups/${encodeURIComponent(groupId)}/grade`,
        {
          score_pct: body.scorePct,
          feedback: body.feedback ?? '',
        },
      )
      .pipe(map(mapWireToGroup));
  }
}
