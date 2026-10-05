/**
 * MemberEntitySearchPort — real `EntitySearchPort` adapter (CHO-1930 / ADR-205)
 * that advances chora-entity-picker B0 → B2 for the `member` entity kind. Fed
 * into the transaction-history learner filter via `[searchPortOverride]` (no
 * global ENTITY_SEARCH_PORTS registration needed). Also reused by the R+
 * offering workspace's people pickers (roster / attendance / sections /
 * schedule, CHO-18 spine-pass workstream C) — the ONLY tenant-member search
 * adapter; a `role` facet override (below) lets an instructor-scoped picker
 * reuse it instead of a parallel adapter.
 *
 * Backing route: `GET /api/v1/admin/tenant-members` (gateway → chora-identity
 * `search_tenant_members_handler`), the same real member search R+ uses. Role
 * defaults to `learner` (the tx-history drill and the roster/attendance
 * pickers all target learners) but a caller MAY override it via the `role`
 * facet (`instructor` for the sections lead / schedule instructor pickers —
 * `tenant_memberships.role` is a genuine closed enum that includes it, not an
 * admin alias). We also forward an optional `managed_tenant_id` facet (MASTER
 * scope scopes the roster to the selected franchisee — see the component's
 * learner-picker gate).
 *
 * Fail-loud (no silent empty): search errors PROPAGATE so the picker renders its
 * error state; they are never swallowed into an empty page.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { type Observable, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  EntityFacets,
  EntityRef,
  EntitySearchPage,
  EntitySearchPort,
  EntityType,
} from '../../chora-entity-picker/entity-picker.model';

/** Subset of the `TenantMemberSummary` wire row the picker needs. */
interface TenantMemberRow {
  readonly gcid: string;
  readonly display_name?: string | null;
  readonly email?: string | null;
}

/** `GET /api/v1/admin/tenant-members` response shape. */
interface TenantMemberSearchResponse {
  readonly items?: readonly TenantMemberRow[];
  readonly next_page_token?: string | null;
}

@Injectable({ providedIn: 'root' })
export class MemberEntitySearchPort implements EntitySearchPort {
  private readonly bff = inject(BffClientService);

  readonly entityType: EntityType = 'member';

  search(
    q: string,
    facets: EntityFacets,
    cursor: string | null,
  ): Observable<EntitySearchPage> {
    const role = facets['role']?.trim() || 'learner';
    let params = new HttpParams().set('q', q).set('role', role);
    const franchisee = facets['managed_tenant_id'];
    if (franchisee) {
      params = params.set('managed_tenant_id', franchisee);
    }
    if (cursor) {
      params = params.set('page_token', cursor);
    }
    return this.bff
      .get<TenantMemberSearchResponse>('/api/v1/admin/tenant-members', params)
      .pipe(map((res) => this.toPage(res)));
  }

  /**
   * Best-effort hydration: the member search has no batch-by-id endpoint, so a
   * pre-set id resolves to itself as the label (a UUID fallback — fail-loud
   * honest, never a fabricated name). The real display name lands on the next
   * search. Selected chips already carry their name (parent owns `value`), so
   * this only matters for a deep-linked / restored filter.
   */
  resolve(ids: readonly string[]): Observable<readonly EntityRef[]> {
    return of(ids.map((id) => ({ id, label: id })));
  }

  private toPage(res: TenantMemberSearchResponse): EntitySearchPage {
    const items: EntityRef[] = (res.items ?? []).map((m) => {
      const label = (m.display_name ?? '').trim() || m.gcid;
      const email = m.email?.trim();
      return email ? { id: m.gcid, label, sublabel: email } : { id: m.gcid, label };
    });
    return { items, nextCursor: res.next_page_token ?? null };
  }
}
