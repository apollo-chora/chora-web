/**
 * Bookings model - R+ /r/bookings surface (Content Delivery).
 *
 * Maps the chora-delivery booking wire shapes into the typed FE model the
 * R+ Bookings screen renders. The backend exposes exactly TWO routes
 * (services/chora-delivery/internal/adapter/http/handlers.go):
 *
 *   POST  /api/bookings            - create a booking for a learner on a class
 *   PATCH /api/bookings/{id}/status - transition a booking's status
 *
 * There is NO GET-list route on chora-delivery yet, so the R+ screen does
 * NOT hydrate from a server roster. Instead it tracks the bookings created
 * within the current admin session in a signal-backed list (the component
 * owns that state) and reflects each PATCH result back into the same list.
 * When a `GET /api/bookings` (or `/api/v1/bookings`) handler lands, the
 * component swaps its seed list for a real `list()` fetch - the model and
 * mapper below already accept the canonical `bookingDTO` envelope.
 *
 * Backend `bookingDTO` (handlers.go::bookingDTO):
 *   {
 *     id: string,
 *     class_id: string,
 *     course_id: string,
 *     tenant_id: string,
 *     learner_gcid: string,
 *     status: "pending" | "confirmed" | "attended" | "no-show",
 *     created_at: ISO8601,
 *     updated_at: ISO8601,
 *     deleted_at?: ISO8601,
 *   }
 *
 * The Booking aggregate uses soft delete (deleted_at) per
 * .claude/rules/ddd-enforcement.md §5 - the FE never hard-removes a row.
 */
import type { ClassSession } from '../scheduling/scheduling.model';

/**
 * Canonical booking lifecycle status. Mirrors the wire enum the backend
 * validates in handlers.go::parseBookingStatus - kept lowercase + hyphenated
 * to match the on-the-wire string verbatim (`no-show`, not `noShow`).
 */
export type BookingStatus = 'pending' | 'confirmed' | 'attended' | 'no-show';

/** The four wire statuses in lifecycle order - drives the status <select>. */
export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'pending',
  'confirmed',
  'attended',
  'no-show',
];

export interface Booking {
  /** Booking UUIDv7 - opaque stable id. */
  readonly id: string;
  /** Class the learner is booked onto. */
  readonly classId: string;
  /** Source course id (denormalised onto the booking by the backend). */
  readonly courseId: string;
  /** Owning tenant id (always = current tenant - RLS-enforced). */
  readonly tenantId: string;
  /** Learner GCID the booking belongs to. */
  readonly learnerGcid: string;
  /** Current lifecycle status. */
  readonly status: BookingStatus;
  /** RFC-3339 creation timestamp. */
  readonly createdAt: string;
  /** RFC-3339 last-update timestamp. */
  readonly updatedAt: string;
}

/**
 * Header-level view model the R+ Bookings screen renders. `tenantName`
 * comes from TenantContextService; `bookings` is the session-tracked list
 * the component owns (no server GET-list route exists yet).
 */
export interface BookingsView {
  /** Tenant display name (header pill). */
  readonly tenantName: string;
  /** Total tracked bookings (badge count). */
  readonly totalBookings: number;
  /** Booking rows for the table. */
  readonly bookings: readonly Booking[];
}

/**
 * Returns the glassmorphism badge variant class for a booking status.
 *   pending   → badge-warning   (awaiting confirmation)
 *   confirmed → badge-success   (seat held)
 *   attended  → badge-info      (learner showed up)
 *   no-show   → badge-danger    (learner missed the class)
 */
export function statusBadgeVariant(
  status: BookingStatus,
): 'badge-warning' | 'badge-success' | 'badge-info' | 'badge-danger' {
  switch (status) {
    case 'pending':
      return 'badge-warning';
    case 'confirmed':
      return 'badge-success';
    case 'attended':
      return 'badge-info';
    case 'no-show':
      return 'badge-danger';
  }
}

/**
 * FontAwesome glyph (without the `fa-` prefix is added in the template)
 * for a booking status - drives the badge icon.
 */
export function statusIcon(status: BookingStatus): string {
  switch (status) {
    case 'pending':
      return 'fa-hourglass-half';
    case 'confirmed':
      return 'fa-circle-check';
    case 'attended':
      return 'fa-user-check';
    case 'no-show':
      return 'fa-user-xmark';
  }
}

/**
 * i18n key for the human-readable status label
 * (`rplus.bookings.status.pending`, etc.). Centralised so the template and
 * the <select> options stay in sync.
 */
export function statusLabelKey(status: BookingStatus): string {
  return `rplus.bookings.status.${statusKeySegment(status)}`;
}

/** `no-show` → `no_show` for a dot-notation i18n key segment. */
function statusKeySegment(status: BookingStatus): string {
  return status.replace('-', '_');
}

/**
 * A single option in the R+ Bookings class picker (CHO-2336). `id` is the
 * durable ScheduledClass id - the exact value the booking POST sends as
 * `class_id` (chora-delivery resolves it via Scheduling.Get in handlers.go).
 * `label` is a human-readable descriptor so a trainer picks a class by sight
 * instead of hand-typing a UUID.
 */
export interface ClassOption {
  /** ScheduledClass id - the booking's class_id. */
  readonly id: string;
  /** Human label: course code, date + start time, and room when known. */
  readonly label: string;
}

/**
 * Project a scheduled-class session (from SchedulingService's week view) into a
 * picker option. The ScheduledClass wire carries only an opaque `course_id`, so
 * the label uses the derived short course code, the calendar date + start time,
 * and the room name when the class has one - a middot-joined line the trainer
 * can recognise. The venue segment is omitted when the class has no room.
 */
export function classOptionFromSession(session: ClassSession): ClassOption {
  const parts = [session.courseCode, `${session.dateIso} ${session.startTime}`];
  if (session.venue) {
    parts.push(session.venue);
  }
  return { id: session.sessionId, label: parts.join(' · ') };
}
