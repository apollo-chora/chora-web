/**
 * BookingsService - R+ /r/bookings BFF wiring (real, no stubs).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService. The
 * chora-delivery backend exposes three booking routes, proxied at the legacy
 * (NOT /api/v1/) prefix the gateway forwards verbatim:
 *
 *   1. list()                 - GET   /api/bookings   (CHO-1622, 2026-06-01)
 *   2. create(req)            - POST  /api/bookings
 *   3. updateStatus(id, st)   - PATCH /api/bookings/{id}/status
 *
 * The GET-list route (CHO-1622) is tenant-scoped + pg-backed (durable) and
 * returns a `{ items, total }` BookingList envelope. The screen now hydrates
 * from this real fetch on init (replacing the prior session-local seed) and
 * still prepends create() results + patches status rows in place.
 *
 * Tenant + GCID are resolved off the validated mesh claims the chora-gateway
 * BFF stamps (RequireChoraSessionJWT). The downstream chora-delivery handler
 * scopes by tenant via X-Tenant-Id; no explicit tenant_id is sent on the
 * wire. The create payload carries `class_id` + `learner_gcid` exactly as
 * handlers.go::createBookingReq expects.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import {
  type Booking,
  type BookingStatus,
  type ClassOption,
  classOptionFromSession,
} from './bookings.model';
import type { ClassSession } from '../scheduling/scheduling.model';

/** On-the-wire booking envelope - handlers.go::bookingDTO. */
interface BackendBooking {
  readonly id: string;
  readonly class_id: string;
  readonly course_id: string;
  readonly tenant_id: string;
  readonly learner_gcid: string;
  readonly status: BookingStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at?: string;
}

/** On-the-wire list envelope - handlers.go::listBookings (BookingList). */
interface BackendBookingList {
  readonly items: readonly BackendBooking[];
  readonly total: number;
}

/** Create-booking request - handlers.go::createBookingReq (snake_case wire). */
export interface CreateBookingRequest {
  /** Class to book the learner onto. */
  readonly classId: string;
  /** Learner GCID being booked. */
  readonly learnerGcid: string;
}

@Injectable({ providedIn: 'root' })
export class BookingsService {
  private readonly bff = inject(BffClientService);
  // CHO-2336: the class picker sources its options from the durable
  // ScheduledClass list this service already owns, so the two screens are
  // provably the same class set (a booking's class_id IS a ScheduledClass id).
  private readonly scheduling = inject(SchedulingService);

  /**
   * Create a booking. POST /api/bookings with the snake_case
   * `{ class_id, learner_gcid }` body chora-delivery validates. Returns
   * 201 + the canonical bookingDTO, mapped into the typed Booking model.
   *
   * The backend rejects an over-capacity class with 409 (ErrClassAtCapacity)
   * and an unknown class with 404 - both surface as HttpErrorResponse so the
   * component can render a fail-loud banner.
   */
  create(req: CreateBookingRequest): Observable<Booking> {
    return this.bff
      .post<BackendBooking>('/api/bookings', {
        class_id: req.classId,
        learner_gcid: req.learnerGcid,
      })
      .pipe(map(mapBackendBooking));
  }

  /**
   * Transition a booking's status. PATCH /api/bookings/{id}/status with the
   * `{ status }` body. The backend validates the target against the allowed
   * lifecycle (pending / confirmed / attended / no-show) and rejects an
   * illegal transition with 409 (handlers.go::bookingSubHandler). A
   * transition INTO `confirmed` additionally emits
   * chora.delivery.booking.confirmed.v1 server-side.
   */
  updateStatus(bookingId: string, status: BookingStatus): Observable<Booking> {
    return this.bff
      .patch<BackendBooking>(
        `/api/bookings/${encodeURIComponent(bookingId)}/status`,
        { status },
      )
      .pipe(map(mapBackendBooking));
  }

  /**
   * List bookings for the current tenant. GET /api/bookings (CHO-1622) returns
   * a tenant-scoped, RLS-isolated, newest-first BookingList `{ items, total }`
   * - the chora-delivery handler resolves the tenant off the mesh-trust
   * X-Tenant-Id header the gateway stamps, so no query param is sent. Maps each
   * wire row into the typed Booking model; a backend/transport failure surfaces
   * as HttpErrorResponse so the component renders a fail-loud banner.
   */
  list(): Observable<readonly Booking[]> {
    return this.bff
      .get<BackendBookingList>('/api/bookings')
      .pipe(map((res) => (res.items ?? []).map(mapBackendBooking)));
  }

  /**
   * List the tenant's bookable classes for the create-booking class picker
   * (CHO-2336). Delegates to {@link SchedulingService.getCurrentWeek} - the only
   * source of durable ScheduledClass rows, whose ids are the exact `class_id`
   * the booking POST resolves via chora-delivery's Scheduling.Get. Each week
   * session projects to a `{ id, label }` option, ordered chronologically so
   * the dropdown reads top-to-bottom by start time.
   *
   * NOTE (week-scoped): the scheduling endpoint is bounded to one ISO week
   * (`ListByTenantWeek`); with no argument it returns the CURRENT week, so the
   * picker offers this week's classes. No "list-all-classes" route exists on
   * chora-delivery to widen this without a backend change.
   */
  listBookableClasses(): Observable<readonly ClassOption[]> {
    return this.scheduling.getCurrentWeek().pipe(
      map((week) =>
        [...week.sessions].sort(byStartChronological).map(classOptionFromSession),
      ),
    );
  }
}

/** Order sessions by calendar date then start time (earliest first). */
function byStartChronological(a: ClassSession, b: ClassSession): number {
  const left = `${a.dateIso} ${a.startTime}`;
  const right = `${b.dateIso} ${b.startTime}`;
  return left.localeCompare(right);
}

function mapBackendBooking(b: BackendBooking): Booking {
  return {
    id: b.id,
    classId: b.class_id,
    courseId: b.course_id,
    tenantId: b.tenant_id,
    learnerGcid: b.learner_gcid,
    status: b.status,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}
