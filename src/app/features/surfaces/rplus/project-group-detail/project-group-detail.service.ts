/**
 * ProjectGroupDetailService — R+ Wave-5 drill-down BFF wiring.
 *
 * Real BFF wiring (per `feedback_no_stubs_real_wiring`):
 *
 *   - get(id)        — GET  /api/v1/project-groups/{id}
 *   - submit(id)     — POST /api/v1/project-groups/{id}/submit  (ACTIVE → SUBMITTED)
 *   - grade(id, …)  — POST /api/v1/project-groups/{id}/grade   (SUBMITTED → GRADED)
 *
 * The BFF (`chora-gateway`) proxies these to chora-delivery's
 * `project_group_handler.go`. The detail endpoint defaults to the
 * caller's current tenant (X-Tenant-Id) via the validated mesh claims
 * the gateway stamps; cross-tenant ids return 404.
 *
 * `grade(id, …)` is restricted to instructor / admin / training-admin
 * roles (403 otherwise); `submit(id)` allows any in-tenant caller per
 * the BE handler. The FE surfaces auth errors as fail-loud i18n keys.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  type ProjectGroup,
  type ProjectGroupWire,
  mapWireToGroup,
} from './project-group-detail.model';

export interface GradeRequest {
  /** Score in percent, integer 0..100 (BE validates 0 ≤ scorePct ≤ 100). */
  readonly scorePct: number;
  /** Optional grader-written feedback; defaults to '' on the wire when omitted. */
  readonly feedback?: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectGroupDetailService {
  private readonly bff = inject(BffClientService);

  /**
   * Fetch a single project group by id. Cross-tenant ids 404 — propagated
   * unchanged so the component renders fail-loud with a Retry CTA.
   */
  get(groupId: string): Observable<ProjectGroup> {
    return this.bff
      .get<ProjectGroupWire>(
        `/api/v1/project-groups/${encodeURIComponent(groupId)}`,
      )
      .pipe(map(mapWireToGroup));
  }

  /**
   * Transitions ACTIVE → SUBMITTED via the BFF. Non-ACTIVE groups
   * return 409 (BE FSM guard `ErrNotActive`); the FE shows that as an
   * `errorConflict` i18n key.
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
   * Transitions SUBMITTED → GRADED via the BFF. The grader's gcid is
   * stamped by the BE from the validated mesh claims; the FE forwards
   * only the score + optional feedback.
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

  /**
   * Adds a member to a FORMING/ACTIVE group via
   * `POST /api/v1/project-groups/{id}/members`. Instructor/admin gated. A
   * SUBMITTED/GRADED roster 409s (BE `ErrMembersLocked`) and a duplicate gcid
   * 409s (`ErrMemberDuplicate`) — both propagate fail-loud. Returns the
   * updated group DTO.
   */
  addMember(
    groupId: string,
    gcid: string,
    role: 'leader' | 'member' = 'member',
  ): Observable<ProjectGroup> {
    return this.bff
      .post<ProjectGroupWire>(
        `/api/v1/project-groups/${encodeURIComponent(groupId)}/members`,
        { gcid, role },
      )
      .pipe(map(mapWireToGroup));
  }

  /**
   * Removes a member via
   * `DELETE /api/v1/project-groups/{id}/members/{gcid}`. A gcid that is not a
   * member 404s (BE `ErrMemberNotFound`) and a frozen roster 409s. Returns the
   * updated group DTO.
   */
  removeMember(groupId: string, gcid: string): Observable<ProjectGroup> {
    return this.bff
      .delete<ProjectGroupWire>(
        `/api/v1/project-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(gcid)}`,
      )
      .pipe(map(mapWireToGroup));
  }
}
