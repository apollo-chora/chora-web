/**
 * InstructorRosterService (CHO-2316).
 *
 * Lists ALL of the caller-tenant's instructors so the course-release panel can
 * offer a checklist instead of a hand-typed GCID textarea. Calls the real BFF
 * route `GET /api/v1/admin/tenant-members?role=INSTRUCTOR` per
 * `chora-contracts/openapi/identity-admin.yaml#searchTenantMembers` (q is
 * optional; empty q returns members, so role-only = list-all). TRAINING_ADMIN /
 * TENANT_ADMIN is already authorised for this route.
 *
 * Unlike the assessment member-picker (search-as-you-type), this is a full
 * roster: it pages through `next_page_token` to completion and concatenates,
 * so a tenant with more than one page of instructors is never silently
 * truncated. Errors propagate fail-loud (per feedback_no_stubs_real_wiring) so
 * the caller renders an error + retry rather than a fabricated empty list.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { EMPTY, type Observable, expand, reduce } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  TenantMemberSummary,
  TenantMemberSearchResponse,
} from '../assessments/assessment-instantiation/assessment-instantiation.model';

const TENANT_MEMBERS_PATH = '/api/v1/admin/tenant-members';
/** Largest page the endpoint allows (enum [10,20,50,100]) — fewest round-trips. */
const PAGE_SIZE = '100';

@Injectable({ providedIn: 'root' })
export class InstructorRosterService {
  private readonly bff = inject(BffClientService);

  /** Every instructor in the caller's tenant, paged to completion. */
  listInstructors(): Observable<readonly TenantMemberSummary[]> {
    const fetchPage = (
      token: string | null,
    ): Observable<TenantMemberSearchResponse> => {
      let params = new HttpParams()
        .set('role', 'INSTRUCTOR')
        .set('page_size', PAGE_SIZE);
      if (token) {
        params = params.set('page_token', token);
      }
      return this.bff.get<TenantMemberSearchResponse>(
        TENANT_MEMBERS_PATH,
        params,
      );
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
