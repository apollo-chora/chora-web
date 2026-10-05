// rooms.model.ts - the canonical FE model for the DURABLE room lane (CHO-2294).
//
// Rooms live in chora_delivery.rooms (mig 0051, CHO-2191) and are the thing the
// room_id-keyed double-book / over-capacity gate constrains on. This file is the
// single owner of the room types; offerings.model.ts re-exports them so the
// Schedule-tab picker and the Campus Operations rooms screen cannot drift into
// two shapes.
//
// NOT to be confused with the free-text `room` STRING used by the Sections panel
// and /r/scheduling. That is a separate, undurable concept and reconciling it is
// deliberately out of scope here (see CHO-2294 scope note).

/**
 * A bookable Room (FE camelCase). `capacity` is the physical seat count (> 0);
 * the BE 409s when an offering's seat budget exceeds it.
 *
 * `campusId` is optional BY DESIGN: a scheduling room needs no campus, and every
 * room created before Campus Operations gained a rooms screen has a blank one.
 * Any per-campus grouping must therefore treat blank as "unassigned" rather than
 * dropping the row.
 */
export interface RoomOption {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly campusId?: string;
}

/**
 * Wire (snake_case) room row from `GET|POST /api/v1/rooms` and the
 * `PATCH /api/v1/rooms/{id}` 200 body. `updated_at` only rides the PATCH DTO and
 * is optional so the create/list shapes stay valid; nothing on the FE reads it.
 */
export interface BackendRoom {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly campus_id?: string;
  readonly branch_id?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

/** Wire envelope for the rooms list (`{ rooms: [...] }`, created_at-ordered). */
export interface BackendRoomsList {
  readonly rooms?: readonly BackendRoom[];
}

/** Create-room request (FE camelCase). Blank optional ids never reach the wire. */
export interface CreateRoomRequest {
  readonly name: string;
  readonly capacity: number;
  readonly campusId?: string;
  readonly branchId?: string;
}

/**
 * Update-room patch (FE camelCase) for `PATCH /api/v1/rooms/{id}` (CHO-2332).
 * A PARTIAL update: only the fields present are sent, so a name-only edit never
 * blanks capacity. The BE requires at least one field and 400s a blank name or a
 * capacity <= 0, 404s an unknown id, and 403s a non-admin caller.
 */
export interface UpdateRoomRequest {
  readonly name?: string;
  readonly capacity?: number;
}

/** Map one wire room row to the FE model. */
export function mapBackendRoom(r: BackendRoom): RoomOption {
  const out: RoomOption = {
    id: r.id,
    name: r.name,
    capacity: r.capacity,
  };
  // Only surface campusId when the wire actually carried one, so "absent" and
  // "empty string" do not become the same value downstream.
  if (r.campus_id !== undefined && r.campus_id.length > 0) {
    return { ...out, campusId: r.campus_id };
  }
  return out;
}
