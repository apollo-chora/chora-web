/**
 * MemberDirectoryService - role-generic tenant-member roster for the shared
 * `chora-member-multiselect` checklist.
 *
 * Lists EVERY member of the caller's tenant for a given role so the checklist
 * can offer a tick-box list (up to ~100) rather than a hand-typed GCID list.
 * Calls the real BFF route `GET /api/v1/admin/tenant-members?role=<ROLE>` per
 * `chora-contracts/openapi/identity-admin.yaml#searchTenantMembers` (q is
 * optional; role-only = list-all). TRAINING_ADMIN / TENANT_ADMIN is already
 * authorised for this route.
 *
 * Generalises `InstructorRosterService.listInstructors()` (which hard-wires
 * `role=INSTRUCTOR`) to any UI role the checklist accepts, so a Roster wants
 * `role=LEARNER` and a Sections/Schedule people-picker wants `role=INSTRUCTOR`
 * from the same adapter. Like that service it pages through `next_page_token`
 * to completion and concatenates, so a tenant with more than one page is never
 * silently truncated. Errors propagate fail-loud (per
 * `feedback_no_stubs_real_wiring`) so the component renders an error + retry
 * rather than a fabricated empty list.
 *
 * All HTTP goes through `BffClientService` (chora-web/CLAUDE.md §3 BFF-only).
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { EMPTY, type Observable, expand, reduce } from 'rxjs';

import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  TenantMemberRole,
  TenantMemberSummary,
  TenantMemberSearchResponse,
} from '../../../features/surfaces/rplus/assessments/assessment-instantiation/assessment-instantiation.model';

/** UI role the checklist accepts (lowercase) - maps to the API role enum. */
export type MemberDirectoryRole = 'learner' | 'instructor';

const TENANT_MEMBERS_PATH = '/api/v1/admin/tenant-members';
/** Largest page the endpoint allows (enum [10,20,50,100]) - fewest round-trips. */
const PAGE_SIZE = '100';

/** UI role → API `TenantMemberRole` query value. */
const ROLE_PARAM: Readonly<Record<MemberDirectoryRole, TenantMemberRole>> = {
  learner: 'LEARNER',
  instructor: 'INSTRUCTOR',
};

@Injectable({ providedIn: 'root' })
export class MemberDirectoryService {
  private readonly bff = inject(BffClientService);

  /** Every member holding `role` in the caller's tenant, paged to completion. */
  listMembers(role: MemberDirectoryRole): Observable<readonly TenantMemberSummary[]> {
    const apiRole = ROLE_PARAM[role];

    const fetchPage = (
      token: string | null,
    ): Observable<TenantMemberSearchResponse> => {
      let params = new HttpParams()
        .set('role', apiRole)
        .set('page_size', PAGE_SIZE);
      if (token) {
        params = params.set('page_token', token);
      }
      return this.bff.get<TenantMemberSearchResponse>(TENANT_MEMBERS_PATH, params);
    };

    return fetchPage(null).pipe(
      expand((resp) =>
        resp.next_page_token ? fetchPage(resp.next_page_token) : EMPTY,
      ),
      reduce(
        (acc, resp) => [...acc, ...resp.items],
        [] as readonly TenantMemberSummary[],
      ),
    );
  }
}
