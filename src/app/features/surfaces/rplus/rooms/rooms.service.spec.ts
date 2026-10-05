// rooms.service.spec.ts - the ONE room lane (CHO-2294).
//
// Before this, rooms had three FE concepts: the durable room_id picker inside
// the offering workspace Schedule tab, a free-text room string in Sections and
// /r/scheduling, and a dead Venue->Room tree pointing at endpoints that do not
// exist. RoomsService is the single owner of the durable lane
// (GET|POST /api/v1/rooms, chora_delivery.rooms, mig 0051); OfferingsService
// delegates to it so the picker and the admin screen cannot drift apart.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { RoomsService } from './rooms.service';
import { environment } from '../../../../../environments/environment';

describe('RoomsService', () => {
  let service: RoomsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RoomsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs /api/v1/rooms and maps the wire envelope', async () => {
    const promise = firstValueFrom(service.listRooms());

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rooms`);
    expect(req.request.method).toBe('GET');
    req.flush({
      rooms: [
        { id: 'room-1', name: 'Lab A', capacity: 30, campus_id: 'campus-1' },
        { id: 'room-2', name: 'Hall B', capacity: 120 },
      ],
    });

    const rooms = await promise;
    expect(rooms.length).toBe(2);
    expect(rooms[0]).toMatchObject({ id: 'room-1', name: 'Lab A', capacity: 30 });
    expect(rooms[1]).toMatchObject({ id: 'room-2', name: 'Hall B', capacity: 120 });
  });

  // A missing `rooms` key must read as an empty list, not throw. The BE omits
  // the key rather than sending null when a tenant has none.
  it('treats a missing rooms key as an empty list', async () => {
    const promise = firstValueFrom(service.listRooms());
    httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rooms`).flush({});
    expect(await promise).toEqual([]);
  });

  it('POSTs /api/v1/rooms with name + capacity', async () => {
    const promise = firstValueFrom(
      service.createRoom({ name: 'Studio C', capacity: 12 }),
    );

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rooms`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Studio C', capacity: 12 });
    req.flush({ id: 'room-3', name: 'Studio C', capacity: 12 });

    expect(await promise).toMatchObject({ id: 'room-3', name: 'Studio C' });
  });

  // Blank optional ids must be DROPPED from the wire body, not sent as "".
  // The BE binds campus_id/branch_id as NULL-able UUIDs; an empty string is a
  // 22P02 invalid-uuid, not a null.
  it('drops blank campus/branch ids from the wire body', async () => {
    const promise = firstValueFrom(
      service.createRoom({ name: 'Studio D', capacity: 8, campusId: '', branchId: '' }),
    );

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rooms`);
    expect(req.request.body).toEqual({ name: 'Studio D', capacity: 8 });
    expect(Object.keys(req.request.body as object)).not.toContain('campus_id');
    expect(Object.keys(req.request.body as object)).not.toContain('branch_id');
    req.flush({ id: 'room-4', name: 'Studio D', capacity: 8 });
    await promise;
  });

  it('sends campus_id when one is supplied', async () => {
    const promise = firstValueFrom(
      service.createRoom({ name: 'Studio E', capacity: 20, campusId: 'campus-9' }),
    );

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rooms`);
    expect(req.request.body).toMatchObject({ campus_id: 'campus-9' });
    req.flush({ id: 'room-5', name: 'Studio E', capacity: 20 });
    await promise;
  });

  // Fail loud: a failing list must propagate, never resolve to []. An empty
  // list and a dead backend must not be the same answer to the caller.
  it('propagates a list error rather than yielding an empty list', async () => {
    const promise = firstValueFrom(service.listRooms());
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/rooms`)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    await expect(promise).rejects.toBeTruthy();
  });

  // --- CHO-2332: Update + soft-Delete lane (coordinated FE+BE) ---------------
  // The list was Create+Read only; CHO-2332 adds Update (PATCH) + soft-Delete
  // (DELETE) on /api/v1/rooms/{id}. updateRoom is a PARTIAL patch: only the
  // fields present reach the wire, so a name-only edit never blanks capacity.
  // deleteRoom is a 204-no-body soft delete. Both FAIL LOUD: 400/403/404
  // propagate and must never resolve to a fabricated success.

  it('PATCHes /api/v1/rooms/{id} with the supplied fields and maps the 200 DTO', async () => {
    const promise = firstValueFrom(
      service.updateRoom('room-1', { name: 'Lab A2', capacity: 44 }),
    );

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rooms/room-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Lab A2', capacity: 44 });
    req.flush({
      id: 'room-1',
      name: 'Lab A2',
      capacity: 44,
      campus_id: 'campus-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-07-22T00:00:00Z',
    });

    expect(await promise).toMatchObject({
      id: 'room-1',
      name: 'Lab A2',
      capacity: 44,
      campusId: 'campus-1',
    });
  });

  // Partial patch stays partial: a name-only edit must NOT carry a capacity key.
  it('sends only the fields present in the patch body', async () => {
    const promise = firstValueFrom(service.updateRoom('room-2', { name: 'Renamed' }));

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rooms/room-2`);
    expect(req.request.body).toEqual({ name: 'Renamed' });
    expect(Object.keys(req.request.body as object)).not.toContain('capacity');
    req.flush({ id: 'room-2', name: 'Renamed', capacity: 120 });
    await promise;
  });

  // Fail loud: a rejected update (400 blank/≤0, 403 non-admin, 404 unknown id)
  // must propagate, never resolve.
  it('propagates an update error rather than swallowing it', async () => {
    const promise = firstValueFrom(service.updateRoom('room-1', { capacity: 0 }));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/rooms/room-1`)
      .flush(
        { error: 'capacity must be positive' },
        { status: 400, statusText: 'Bad Request' },
      );

    await expect(promise).rejects.toBeTruthy();
  });

  it('DELETEs /api/v1/rooms/{id} and resolves on a 204 no-body', async () => {
    const promise = firstValueFrom(service.deleteRoom('room-9'));

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/rooms/room-9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    await expect(promise).resolves.toBeNull();
  });

  it('propagates a delete error (e.g. 404 already gone) rather than swallowing it', async () => {
    const promise = firstValueFrom(service.deleteRoom('ghost'));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/rooms/ghost`)
      .flush({ error: 'not found' }, { status: 404, statusText: 'Not Found' });

    await expect(promise).rejects.toBeTruthy();
  });
});
