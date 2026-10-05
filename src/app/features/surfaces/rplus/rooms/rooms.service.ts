// rooms.service.ts - the SINGLE owner of the durable room lane (CHO-2294).
//
// Wraps GET|POST /api/v1/rooms (chora_delivery.rooms, mig 0051). OfferingsService
// delegates its listRooms/createRoom here rather than holding a second copy, so
// the Schedule-tab picker and the Campus Operations rooms screen are provably
// the same list. That is the whole point of the ticket: before this there were
// three room concepts in the FE and no single owner.
//
// Errors PROPAGATE. A failing list must never resolve to [], because an empty
// tenant and a dead backend are different facts and the caller has to be able to
// tell them apart.
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  mapBackendRoom,
  type BackendRoom,
  type BackendRoomsList,
  type CreateRoomRequest,
  type RoomOption,
  type UpdateRoomRequest,
} from './rooms.model';

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly bff = inject(BffClientService);

  /**
   * List this tenant's bookable rooms. The BE returns `{ rooms: [...] }`
   * created_at-ordered and is tenant-scoped server-side (no campus filter
   * exists); mapping happens here.
   */
  listRooms(): Observable<readonly RoomOption[]> {
    return this.bff
      .get<BackendRoomsList>('/api/v1/rooms')
      .pipe(map((resp) => (resp.rooms ?? []).map(mapBackendRoom)));
  }

  /**
   * Create a bookable Room. 201 returns the created room. The BE 400s a blank
   * name or capacity <= 0 and 403s a non-admin caller.
   *
   * Blank campus/branch ids are DROPPED from the wire body: the BE binds them as
   * nullable UUIDs, so an empty string is a 22P02 invalid-uuid, not a NULL.
   */
  createRoom(req: CreateRoomRequest): Observable<RoomOption> {
    const body: Record<string, unknown> = {
      name: req.name,
      capacity: req.capacity,
    };
    if (req.campusId !== undefined && req.campusId.length > 0) {
      body['campus_id'] = req.campusId;
    }
    if (req.branchId !== undefined && req.branchId.length > 0) {
      body['branch_id'] = req.branchId;
    }
    return this.bff.post<BackendRoom>('/api/v1/rooms', body).pipe(map(mapBackendRoom));
  }

  /**
   * Update a Room (CHO-2332). Real PATCH /api/v1/rooms/{id} with a PARTIAL body:
   * only the fields present in `patch` reach the wire, so a name-only edit never
   * blanks the capacity. The 200 returns the updated room DTO, mapped here. The
   * BE 400s a blank name / capacity <= 0 / empty patch, 404s an unknown id, and
   * 403s a non-admin; all propagate unmodified so the component renders them loud
   * (never swallowed to a fake success).
   */
  updateRoom(id: string, patch: UpdateRoomRequest): Observable<RoomOption> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      body['name'] = patch.name;
    }
    if (patch.capacity !== undefined) {
      body['capacity'] = patch.capacity;
    }
    return this.bff
      .patch<BackendRoom>(`/api/v1/rooms/${encodeURIComponent(id)}`, body)
      .pipe(map(mapBackendRoom));
  }

  /**
   * Soft-delete a Room (CHO-2332). Real DELETE /api/v1/rooms/{id} returns 204
   * with no body (the row is soft-deleted server-side, never hard-deleted). A
   * 404 (already gone) propagates so the caller can surface it. Typed `void`:
   * there is no body to map.
   */
  deleteRoom(id: string): Observable<void> {
    return this.bff.delete<void>(`/api/v1/rooms/${encodeURIComponent(id)}`);
  }
}
