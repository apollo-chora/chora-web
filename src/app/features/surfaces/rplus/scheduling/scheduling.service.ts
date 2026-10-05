/**
 * SchedulingService — R+ Stage 3 week-view scheduling (real BFF wiring).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService. Calls
 * `GET /v1/scheduling/classes?week_iso=YYYY-MM-DD` on chora-gateway which
 * proxies verbatim to chora-delivery's schedulingClassesHandler.
 *
 * Backend response shape: { items: BackendScheduledClass[] }. Each
 * ScheduledClass carries id / tenant_id / course_id / instructor_gcid /
 * room_id / room / starts_at / ends_at / max_capacity. The mapping keeps the
 * raw cross-aggregate refs (courseId / instructorGcid / roomId) so the
 * component can resolve display names against the courses() + rooms() lists it
 * fetches, and derives:
 *
 *   - day (DayOfWeek)        : from starts_at weekday
 *   - dateIso (YYYY-MM-DD)   : from starts_at calendar date
 *   - startTime / endTime    : HH:mm in Asia/Singapore display tz
 *   - durationHours          : (ends_at - starts_at) in hours
 *   - courseCode             : a short code derived from the opaque course_id,
 *                              used only as the fallback when the component
 *                              cannot resolve a real title
 *   - venue / maxCapacity    : the room display name + seat budget straight
 *                              off the wire
 *
 * There is NO enrolled/booking count on the wire, so the card renders room +
 * capacity instead of a fabricated "0 enrolled" per feedback_no_stubs_real_wiring.
 *
 * `listPublishedCourses()` sources the course picker (Goal 1) and the
 * course-scoped instructor picker (Goal 2) from GET /api/v1/courses?state=PUBLISHED.
 *
 * Empty backend ⇒ empty week (sessions: []). The component renders an
 * empty-state grid rather than faking the legacy CSPO fixture.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  ClassSession,
  DayOfWeek,
  SchedulingCourseOption,
  SchedulingWeek,
} from './scheduling.model';

/**
 * Backend ScheduledClass DTO shape served by chora-delivery's
 * scheduling_handler. Matches scheduledClassDTO() in
 * services/chora-delivery/internal/adapter/http/scheduling_handler.go.
 */
interface BackendScheduledClass {
  readonly id: string;
  readonly tenant_id?: string;
  readonly course_id: string;
  readonly instructor_gcid: string;
  /** CHO-2299: the stable Room key (snake_case on the wire). */
  readonly room_id?: string;
  /** Display name derived from the booked Room. Legacy rows carry only this. */
  readonly room?: string;
  readonly starts_at: string; // RFC3339
  readonly ends_at: string; // RFC3339
  readonly max_capacity?: number;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly deleted_at?: string;
}

interface BackendScheduledClassesList {
  readonly items: readonly BackendScheduledClass[];
}

/**
 * Backend Course DTO (subset) served by chora-delivery's CJ#2 list handler
 * (`GET /api/v1/courses`). Only the fields the scheduling pickers consume are
 * declared. `instructor_gcids` seeds the course-scoped instructor picker so no
 * second fetch is needed; `title`/`description` label the course option.
 */
interface BackendCourse {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly instructor_gcids?: readonly string[];
  readonly state?: string;
}

interface BackendCoursesList {
  readonly items: readonly BackendCourse[];
}

/**
 * The CJ#2 list handler REQUIRES a `state` query param (400s without it) and
 * the value is UPPERCASE. The scheduling pickers only ever schedule PUBLISHED
 * courses. `page_size=50` mirrors the proven CatalogService / offerings reads.
 */
const COURSES_STATE = 'PUBLISHED';
const COURSES_PAGE_SIZE = 50;

/** Cap the picker option label so a pathological title cannot blow out the select. */
const MAX_COURSE_LABEL = 90;

/**
 * Input for {@link SchedulingService.createClass}. `startsAt` / `endsAt` are
 * RFC3339 timestamps (the component composes them from the date + HH:mm form
 * fields); the rest are the opaque cross-aggregate refs the backend stores
 * verbatim. Maps 1:1 onto chora-delivery's createScheduledClassReq.
 */
export interface CreateScheduledClassInput {
  readonly courseId: string;
  readonly instructorGcid: string;
  /** CHO-2299: the stable Room key. A free-text name is no longer a booking. */
  readonly roomId: string;
  readonly startsAt: string; // RFC3339
  readonly endsAt: string; // RFC3339
  readonly maxCapacity: number;
}

/**
 * Input for {@link SchedulingService.rescheduleClass} (CHO-2334). Only the
 * time window + the booked room can change; course / instructor / capacity are
 * immutable via this path. `roomId` carries the stable Room key; an empty
 * string is a legitimate ROOMLESS reschedule (the domain accepts it); a
 * free-text room name is NEVER sent, so the ratified no-free-text-booking
 * invariant (campusops.ValidateRoomBooking) cannot be tripped from here.
 */
export interface RescheduleScheduledClassInput {
  readonly startsAt: string; // RFC3339
  readonly endsAt: string; // RFC3339
  readonly roomId: string;
}

const ORDERED_WEEKDAY_KEYS: readonly DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

@Injectable({ providedIn: 'root' })
export class SchedulingService {
  private readonly bff = inject(BffClientService);

  /**
   * Fetch the week-view schedule.
   *
   * @param weekStartIso optional `YYYY-MM-DD` anchor inside the desired ISO
   * week. Omit to use the current ISO week (backend default).
   */
  getCurrentWeek(weekStartIso?: string): Observable<SchedulingWeek> {
    const params = weekStartIso
      ? new HttpParams().set('week_iso', weekStartIso)
      : undefined;
    return this.bff
      .get<BackendScheduledClassesList>('/v1/scheduling/classes', params)
      .pipe(
        map((resp) => buildWeek(weekStartIso, resp.items.map(mapBackendClass))),
      );
  }

  /**
   * Schedule a new class — POST /v1/scheduling/classes (CHO-1626). The
   * chora-delivery handler is gated to instructor / admin / training-admin
   * (a learner gets a 403 surfaced as a fail-loud banner). Returns the
   * created ClassSession mapped from the backend's verbatim echo so the
   * caller can optimistically place it; the component instead re-fetches the
   * week so the new card lands in its ISO-week column.
   */
  createClass(input: CreateScheduledClassInput): Observable<ClassSession> {
    return this.bff
      .post<BackendScheduledClass>('/v1/scheduling/classes', {
        course_id: input.courseId,
        instructor_gcid: input.instructorGcid,
        room_id: input.roomId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        max_capacity: input.maxCapacity,
      })
      .pipe(map(mapBackendClass));
  }

  /**
   * Reschedule an existing class. POST /v1/scheduling/classes/{id}/reschedule
   * (CHO-2334). Gated to instructor / admin / training-admin server-side. Sends
   * ONLY `starts_at` / `ends_at` / `room_id` (never a free-text `room`), so a
   * roomless class stays roomless and a roomed one keeps or swaps its Room key.
   * Errors PROPAGATE verbatim so the component can surface the server message
   * (e.g. the 409 `room_double_booked` collision copy) exactly like create.
   */
  rescheduleClass(
    id: string,
    input: RescheduleScheduledClassInput,
  ): Observable<ClassSession> {
    return this.bff
      .post<BackendScheduledClass>(
        `/v1/scheduling/classes/${encodeURIComponent(id)}/reschedule`,
        {
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          room_id: input.roomId,
        },
      )
      .pipe(map(mapBackendClass));
  }

  /**
   * Cancel (soft-delete) a class. POST /v1/scheduling/classes/{id}/cancel
   * (CHO-2334). The handler ignores the request body, so we send an empty
   * object rather than fabricate one. Idempotent server-side. Returns the
   * soft-deleted class echo; the component just refetches the week on success.
   */
  cancelClass(id: string): Observable<ClassSession> {
    return this.bff
      .post<BackendScheduledClass>(
        `/v1/scheduling/classes/${encodeURIComponent(id)}/cancel`,
        {},
      )
      .pipe(map(mapBackendClass));
  }

  /**
   * List the tenant's PUBLISHED courses for the scheduling course picker
   * (Goal 1) + the course-scoped instructor picker (Goal 2). Sends the
   * mandatory `state=PUBLISHED` param (the handler 400s without it). Each
   * option carries its own `instructor_gcids`, so the instructor picker needs
   * NO extra fetch. Errors PROPAGATE. A dead catalogue must read as a load
   * failure in the component, never as an empty course list.
   */
  listPublishedCourses(): Observable<readonly SchedulingCourseOption[]> {
    const params = new HttpParams()
      .set('state', COURSES_STATE)
      .set('page_size', String(COURSES_PAGE_SIZE));
    return this.bff
      .get<BackendCoursesList>('/api/v1/courses', params)
      .pipe(map((resp) => resp.items.map(mapCourseOption)));
  }
}

function mapCourseOption(c: BackendCourse): SchedulingCourseOption {
  const raw = (c.title?.trim() || c.description?.trim() || c.id).trim();
  const label =
    raw.length > MAX_COURSE_LABEL ? `${raw.slice(0, MAX_COURSE_LABEL - 3)}...` : raw;
  return {
    id: c.id,
    label,
    instructorGcids: c.instructor_gcids ?? [],
  };
}

function buildWeek(
  weekStartIsoArg: string | undefined,
  sessions: readonly ClassSession[],
): SchedulingWeek {
  const anchor = resolveWeekAnchor(weekStartIsoArg, sessions);
  const monday = mondayOfISOWeek(anchor);
  const weekStartIso = isoDate(monday);
  return {
    weekStartIso,
    weekLabel: `Week of ${formatHumanDate(monday)}`,
    timezone: 'Asia/Singapore',
    timezoneLabel: 'SGT (UTC+08:00)',
    sessions,
  };
}

/**
 * Resolve the calendar date this week-view should anchor on. The explicit
 * `weekStartIso` arg wins. When absent we anchor on the FIRST session's
 * starts_at; when also empty we fall back to `Date.now()` so the week
 * label still renders something coherent.
 */
function resolveWeekAnchor(
  weekStartIso: string | undefined,
  sessions: readonly ClassSession[],
): Date {
  if (weekStartIso) {
    return parseIsoDate(weekStartIso);
  }
  const first = sessions[0];
  if (first) {
    return parseIsoDate(first.dateIso);
  }
  return new Date();
}

function mapBackendClass(c: BackendScheduledClass): ClassSession {
  const startsAt = new Date(c.starts_at);
  const endsAt = new Date(c.ends_at);
  return {
    sessionId: c.id,
    courseId: c.course_id,
    courseCode: deriveCourseCode(c.course_id),
    day: ORDERED_WEEKDAY_KEYS[startsAt.getDay()]!,
    dateIso: isoDate(startsAt),
    startTime: timeHHMM(startsAt),
    endTime: timeHHMM(endsAt),
    durationHours: hoursBetween(startsAt, endsAt),
    instructorGcid: c.instructor_gcid,
    roomId: c.room_id ?? '',
    venue: c.room ?? '',
    maxCapacity: c.max_capacity ?? 0,
  };
}

/**
 * Derive a short course code from the opaque course_id. UUIDs collapse to
 * their leading 6 chars uppercase (e.g. `01970000...` ⇒ `019700`). Non-UUID
 * ids are uppercased + trimmed to 8 chars. Stable + readable for the chip.
 */
function deriveCourseCode(courseID: string): string {
  if (!courseID) {
    return 'COURSE';
  }
  // UUID-shaped (8-4-4-4-12) → leading 6 chars uppercase.
  if (courseID.length === 36 && courseID[8] === '-') {
    return courseID.slice(0, 6).toUpperCase();
  }
  return courseID.slice(0, 8).toUpperCase();
}

function parseIsoDate(isoDateStr: string): Date {
  // `YYYY-MM-DD` parsed via UTC midnight so weekday derivation is stable
  // regardless of the browser's local timezone offset.
  const parts = isoDateStr.split('-');
  const y = parseInt(parts[0] ?? '1970', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Hours between two dates, rounded to the nearest 0.5h, min 0.5. */
function hoursBetween(startsAt: Date, endsAt: Date): number {
  const ms = endsAt.getTime() - startsAt.getTime();
  const hours = ms / (3600 * 1000);
  if (!Number.isFinite(hours) || hours <= 0) {
    return 0.5;
  }
  // Round to nearest 0.5 with a 0.5 floor.
  const rounded = Math.max(0.5, Math.round(hours * 2) / 2);
  return rounded;
}

function mondayOfISOWeek(d: Date): Date {
  const copy = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = copy.getUTCDay(); // 0 = Sun … 6 = Sat
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + offsetToMonday);
  return copy;
}

function formatHumanDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
