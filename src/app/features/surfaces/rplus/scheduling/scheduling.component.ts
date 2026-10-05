/**
 * SchedulingComponent — R+ Stage 3 wave 2.
 *
 * Ports `chora-web/.stitch-imports/rplus/rplus-class-scheduling-week.html`
 * into a standalone Angular component on the polyglass design system.
 *
 * Stage 1 R+ harmonize note: the Stitch HTML shipped with a C+ Connect+
 * sidebar regression. This component is mounted inside the main-layout
 * sidebar shell, so we DO NOT re-render the Stitch sidebar at all. The
 * spec verifies the C+ branding is fully scrubbed.
 *
 * Demo: Mr. Chen lands on /r/scheduling → sees CSPO week-of-18-May
 * (6 sessions × 3 hours each, MTM HQ Room 401, Singapore time).
 *
 * CHO-2333 (room lanes): overlapping same-day sessions render side-by-side in
 * their own sub-columns (see `assignLanes`) so no card hides another.
 * CHO-2334 (detail + reschedule/cancel + drag): clicking a card opens an
 * accessible detail dialog with Reschedule / Cancel actions, and a card can be
 * dragged to a new (day, hour) slot to reschedule in place.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RoomsService } from '../rooms/rooms.service';
import type { RoomOption } from '../rooms/rooms.model';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../core/services/translate.service';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import { SchedulingService } from './scheduling.service';
import {
  DayOfWeek,
  ORDERED_DAYS,
  SchedulingCourseOption,
  assignLanes,
  computeDropReschedule,
  groupSessionsByDay,
  minutesBetweenHHMM,
} from './scheduling.model';

/**
 * Display view-model for one week-grid session card. Built in `dayColumns`
 * from the raw ClassSession + the courses()/rooms() lookup maps so the card
 * shows human names (course title, room name) instead of opaque ids, plus the
 * seat capacity, never a fabricated enrolment count. It also carries the
 * precomputed grid placement (`dayCol` / `row` / `span`) and the room-lane
 * assignment (`lane` / `lanes`, CHO-2333) so the template is markup-only, and
 * the raw `dateIso` / `roomId` the detail dialog + reschedule need.
 */
interface SessionCard {
  readonly sessionId: string;
  readonly day: DayOfWeek;
  /** ISO date `YYYY-MM-DD` of the session (drives the reschedule form + detail). */
  readonly dateIso: string;
  readonly startTime: string;
  readonly endTime: string;
  /** Resolved course title, or the short course code when unresolved. */
  readonly courseTitle: string;
  /** Instructor display label: the GCID (no people directory is deployed). */
  readonly instructorLabel: string;
  /** Raw Room key; '' = roomless. Sent verbatim on reschedule. */
  readonly roomId: string;
  /** Room display name; `''` hides the room row. */
  readonly roomLabel: string;
  /** Seat budget; 0 hides the capacity row. */
  readonly maxCapacity: number;
  /** 1-indexed day column (Mon=1 … Sun=7). */
  readonly dayCol: number;
  /** 1-indexed grid row from the 08:00 baseline. */
  readonly row: number;
  /** Row span in hours (>= 1). */
  readonly span: number;
  /** 0-based sub-lane within an overlap cluster (CHO-2333). */
  readonly lane: number;
  /** Total sub-lanes in this card's overlap cluster (1 = full width). */
  readonly lanes: number;
}

interface DayColumn {
  readonly day: DayOfWeek;
  readonly labelKey: string;
  readonly sessions: readonly SessionCard[];
}

@Component({
  selector: 'chora-rplus-scheduling',
  imports: [TranslatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scheduling.component.html',
  styleUrl: './scheduling.component.scss',
})
export class SchedulingComponent {
  private readonly schedulingService = inject(SchedulingService);
  private readonly i18n = inject(TranslateService);

  constructor() {
    // WAI-ARIA dialog pattern: move initial focus into the detail dialog (its
    // close button) the moment it mounts. The viewChild resolves only while the
    // `@if (selectedCard())` block is rendered, so the effect fires on open and
    // no-ops on close.
    effect(() => {
      const btn = this.detailCloseBtn();
      if (btn) {
        btn.nativeElement.focus();
      }
    });
  }

  /**
   * Bumped after a successful create / reschedule / cancel so the week-view
   * re-fetches. Mirrors the WBL reloadKey idiom: `toObservable(reloadKey)` into
   * `switchMap(getCurrentWeek)`. Starts at 0, which emits immediately, so the
   * initial GET still fires once on mount.
   */
  private readonly reloadKey = signal<number>(0);

  private readonly data = toSignal(
    toObservable(this.reloadKey).pipe(
      switchMap(() => this.schedulingService.getCurrentWeek()),
    ),
    { initialValue: null },
  );

  readonly weekLabel = computed<string>(() => this.data()?.weekLabel ?? '');
  readonly timezoneLabel = computed<string>(
    () => this.data()?.timezoneLabel ?? '',
  );

  /** Hourly time slots 08:00 → 18:00 (matches Stitch HTML). */
  readonly hourSlots: readonly string[] = [
    '08:00',
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
    '18:00',
  ];

  /** course_id → human title, built from the fetched courses() catalogue. */
  private readonly courseTitleById = computed<ReadonlyMap<string, string>>(
    () => new Map(this.courses().map((c) => [c.id, c.label])),
  );

  /** room_id → room name, built from the fetched rooms() catalogue. */
  private readonly roomNameById = computed<ReadonlyMap<string, string>>(
    () => new Map(this.rooms().map((r) => [r.id, r.name])),
  );

  readonly dayColumns = computed<readonly DayColumn[]>(() => {
    const sessions = this.data()?.sessions ?? [];
    const titles = this.courseTitleById();
    const roomNames = this.roomNameById();
    const grouped = groupSessionsByDay(sessions);
    return ORDERED_DAYS.map((day) => {
      // First resolve display fields + grid placement per session…
      const base = grouped[day].map((s) => {
        const row = rowFromStart(s.startTime);
        const span = spanHours(s.startTime, s.endTime);
        return {
          sessionId: s.sessionId,
          day: s.day,
          dateIso: s.dateIso,
          startTime: s.startTime,
          endTime: s.endTime,
          // Prefer the resolved catalogue title; fall back to the short code so
          // an archived/unpublished course still reads as something, once.
          courseTitle: titles.get(s.courseId) ?? s.courseCode,
          // No people directory is deployed (see report), so render the genuine
          // GCID rather than a faked name.
          instructorLabel: s.instructorGcid,
          roomId: s.roomId,
          // The wire room name wins; fall back to the rooms() lookup, then the
          // raw id, so a legacy or unresolved row still names a room when it can.
          roomLabel: s.venue || roomNames.get(s.roomId) || s.roomId || '',
          maxCapacity: s.maxCapacity,
          dayCol: dayIndex(s.day),
          row,
          span,
        };
      });
      // …then pack the day into side-by-side lanes so overlaps never occlude.
      const laneAssignments = assignLanes(
        base.map((c) => ({ start: c.row, span: c.span })),
      );
      const cards: SessionCard[] = base.map((c, i) => ({
        ...c,
        lane: laneAssignments[i]!.lane,
        lanes: laneAssignments[i]!.lanes,
      }));
      return {
        day,
        labelKey: `rplus.scheduling.day.${day}`,
        sessions: cards,
      };
    });
  });

  // ── Create-form state (CHO-1626) ──────────────────────────────────────────
  /** Whether the "Schedule a class" form panel is expanded. */
  readonly formOpen = signal<boolean>(false);
  /** True while a create POST is in flight. */
  readonly busy = signal<boolean>(false);
  /** Fail-loud page-level scheduling error (create + drag-reschedule; null when clear). */
  readonly createError = signal<string | null>(null);

  readonly courseIdInput = signal<string>('');
  readonly instructorGcidInput = signal<string>('');
  // CHO-2299: the booking is a stable Room key now, not a typed name. The
  // options come from RoomsService, the single owner of the durable room lane,
  // so this picker and the offering-workspace Schedule tab cannot drift.
  readonly roomIdInput = signal<string>('');
  private readonly roomsService = inject(RoomsService);
  private readonly roomsResult = toSignal(
    this.roomsService.listRooms().pipe(catchError(() => of(null))),
    { initialValue: undefined },
  );
  readonly rooms = computed<readonly RoomOption[]>(() => this.roomsResult() ?? []);
  readonly roomsLoading = computed(() => this.roomsResult() === undefined);
  // null is a LOAD FAILURE, distinct from an empty catalogue. A dead rooms
  // backend must not read as "this tenant has no rooms".
  readonly roomsError = computed(() => this.roomsResult() === null);

  // Goal 1: the course is picked by id from the PUBLISHED catalogue, not typed
  // as an opaque UUID. Mirrors the rooms signal set: undefined = loading, null
  // = load failure (distinct from an empty catalogue), array = the courses.
  private readonly coursesResult = toSignal(
    this.schedulingService.listPublishedCourses().pipe(catchError(() => of(null))),
    { initialValue: undefined },
  );
  readonly courses = computed<readonly SchedulingCourseOption[]>(
    () => this.coursesResult() ?? [],
  );
  readonly coursesLoading = computed(() => this.coursesResult() === undefined);
  readonly coursesError = computed(() => this.coursesResult() === null);

  /** The currently chosen course, or undefined until one is picked. */
  readonly selectedCourse = computed<SchedulingCourseOption | undefined>(() =>
    this.courses().find((c) => c.id === this.courseIdInput()),
  );

  // Goal 2: the instructor picker is scoped to the chosen course's own
  // instructor_gcids (no extra fetch). Empty until a course is chosen.
  readonly instructorOptions = computed<readonly string[]>(
    () => this.selectedCourse()?.instructorGcids ?? [],
  );
  /** `YYYY-MM-DD` from a <input type="date">. */
  readonly dateInput = signal<string>('');
  /** `HH:mm` from <input type="time">. */
  readonly startTimeInput = signal<string>('09:00');
  readonly endTimeInput = signal<string>('12:00');
  readonly maxCapacityInput = signal<number>(20);

  /** Create CTA stays disabled until every required field carries a value. */
  readonly canCreate = computed<boolean>(
    () =>
      !this.busy() &&
      this.courseIdInput().trim().length > 0 &&
      this.instructorGcidInput().trim().length > 0 &&
      this.roomIdInput().trim().length > 0 &&
      this.dateInput().length > 0 &&
      this.startTimeInput().length > 0 &&
      this.endTimeInput().length > 0 &&
      this.maxCapacityInput() > 0,
  );

  /** Toggle the create-form panel (the header "Add Session" CTA). */
  toggleForm(): void {
    this.formOpen.update((open) => !open);
    if (!this.formOpen()) {
      this.createError.set(null);
    }
  }

  /** Dismiss the fail-loud create banner. */
  dismissError(): void {
    this.createError.set(null);
  }

  /**
   * Change the chosen course (Goal 1) and repopulate the instructor picker
   * (Goal 2): drop the selected instructor whenever the newly chosen course
   * does not carry it, so a stale pick can never be posted against the wrong
   * course.
   */
  onCourseChange(courseId: string): void {
    this.courseIdInput.set(courseId);
    const allowed =
      this.courses().find((c) => c.id === courseId)?.instructorGcids ?? [];
    if (!allowed.includes(this.instructorGcidInput())) {
      this.instructorGcidInput.set('');
    }
  }

  /**
   * Submit the create form. POSTs /v1/scheduling/classes (instructor/admin/
   * training-admin only — a learner gets a 403 surfaced as a banner). On
   * success: close + reset the form and bump reloadKey so the week re-fetches
   * (the new card appears if it falls in the current ISO week). The domain
   * re-validates ends_at > starts_at → 400 surfaced as a banner.
   */
  onCreate(): void {
    if (!this.canCreate()) {
      return;
    }
    this.busy.set(true);
    this.createError.set(null);
    this.schedulingService
      .createClass({
        courseId: this.courseIdInput().trim(),
        instructorGcid: this.instructorGcidInput().trim(),
        roomId: this.roomIdInput().trim(),
        startsAt: toRfc3339Utc(this.dateInput(), this.startTimeInput()),
        endsAt: toRfc3339Utc(this.dateInput(), this.endTimeInput()),
        maxCapacity: this.maxCapacityInput(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.resetForm();
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.createError.set(this.describeCreateError(err));
        },
      });
  }

  // ── Detail dialog + reschedule + cancel (CHO-2334) ────────────────────────
  /** The card whose detail dialog is open, or null when the dialog is closed. */
  readonly selectedCard = signal<SessionCard | null>(null);
  /** Stable DOM id wiring the dialog's aria-labelledby to its title. */
  readonly detailTitleId = 'rplus-scheduling-detail-title';
  /** The element that opened the dialog, so focus can return to it on close. */
  private detailTrigger: HTMLElement | null = null;
  private readonly detailCloseBtn =
    viewChild<ElementRef<HTMLButtonElement>>('detailCloseBtn');

  /** Reschedule sub-form state (inside the detail dialog). */
  readonly rescheduleOpen = signal<boolean>(false);
  readonly rsDate = signal<string>('');
  readonly rsStart = signal<string>('');
  readonly rsEnd = signal<string>('');
  readonly rsRoomId = signal<string>('');
  readonly rsBusy = signal<boolean>(false);
  readonly rsError = signal<string | null>(null);

  /** Cancel-confirm sub-flow state (in-app confirm, never native confirm()). */
  readonly confirmingCancel = signal<boolean>(false);
  readonly cancelBusy = signal<boolean>(false);
  readonly cancelError = signal<string | null>(null);

  /** Reschedule CTA stays disabled until date + start + end all carry a value. */
  readonly canReschedule = computed<boolean>(
    () =>
      !this.rsBusy() &&
      this.rsDate().length > 0 &&
      this.rsStart().length > 0 &&
      this.rsEnd().length > 0,
  );

  /** Open the detail dialog for a card, remembering the trigger for focus return. */
  openDetail(card: SessionCard, event?: Event): void {
    this.detailTrigger = (event?.currentTarget as HTMLElement | null) ?? null;
    this.rescheduleOpen.set(false);
    this.rsError.set(null);
    this.confirmingCancel.set(false);
    this.cancelError.set(null);
    this.selectedCard.set(card);
  }

  /** Close the detail dialog, reset its sub-state, and restore focus. */
  closeDetail(): void {
    this.selectedCard.set(null);
    this.rescheduleOpen.set(false);
    this.rsError.set(null);
    this.confirmingCancel.set(false);
    this.cancelError.set(null);
    const trigger = this.detailTrigger;
    this.detailTrigger = null;
    trigger?.focus();
  }

  /** Backdrop click closes only when the click landed on the overlay itself. */
  onDetailBackdrop(event: Event): void {
    if (event.target === event.currentTarget) {
      this.closeDetail();
    }
  }

  /** Escape closes the dialog when it is open (WAI-ARIA dialog pattern). */
  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (this.selectedCard()) {
      this.closeDetail();
    }
  }

  /** Reveal the reschedule sub-form, prefilled from the selected session. */
  openReschedule(): void {
    const card = this.selectedCard();
    if (!card) {
      return;
    }
    this.confirmingCancel.set(false);
    this.rsDate.set(card.dateIso);
    this.rsStart.set(card.startTime);
    this.rsEnd.set(card.endTime);
    this.rsRoomId.set(card.roomId);
    this.rsError.set(null);
    this.rescheduleOpen.set(true);
  }

  /** Back out of the reschedule sub-form to the default detail actions. */
  closeReschedule(): void {
    this.rescheduleOpen.set(false);
    this.rsError.set(null);
  }

  /**
   * Submit the reschedule. POSTs /v1/scheduling/classes/{id}/reschedule with the
   * new window + room_id only (never a free-text name). On success: reload the
   * week and close the dialog. On failure: surface the server message (e.g. the
   * 409 room_double_booked collision copy) inside the dialog, exactly like
   * create, and keep the dialog open so the user can pick another time.
   */
  onReschedule(): void {
    const card = this.selectedCard();
    if (!card || !this.canReschedule()) {
      return;
    }
    this.rsBusy.set(true);
    this.rsError.set(null);
    this.schedulingService
      .rescheduleClass(card.sessionId, {
        startsAt: toRfc3339Utc(this.rsDate(), this.rsStart()),
        endsAt: toRfc3339Utc(this.rsDate(), this.rsEnd()),
        roomId: this.rsRoomId().trim(),
      })
      .subscribe({
        next: () => {
          this.rsBusy.set(false);
          this.reloadKey.update((n) => n + 1);
          this.closeDetail();
        },
        error: (err: unknown) => {
          this.rsBusy.set(false);
          this.rsError.set(
            this.describeError(err, 'rplus.scheduling.reschedule.error_generic'),
          );
        },
      });
  }

  /** Ask for an in-app cancel confirmation (never the native confirm dialog). */
  requestCancel(): void {
    this.rescheduleOpen.set(false);
    this.cancelError.set(null);
    this.confirmingCancel.set(true);
  }

  /** Back out of the cancel confirmation without firing a request. */
  dismissCancel(): void {
    this.confirmingCancel.set(false);
  }

  /**
   * Confirm the cancel. POSTs /v1/scheduling/classes/{id}/cancel (soft-delete).
   * On success: reload the week and close the dialog. On failure: surface the
   * server message inside the confirm panel.
   */
  onConfirmCancel(): void {
    const card = this.selectedCard();
    if (!card || this.cancelBusy()) {
      return;
    }
    this.cancelBusy.set(true);
    this.cancelError.set(null);
    this.schedulingService.cancelClass(card.sessionId).subscribe({
      next: () => {
        this.cancelBusy.set(false);
        this.reloadKey.update((n) => n + 1);
        this.closeDetail();
      },
      error: (err: unknown) => {
        this.cancelBusy.set(false);
        this.cancelError.set(
          this.describeError(err, 'rplus.scheduling.cancel.error_generic'),
        );
      },
    });
  }

  // ── Drag-to-reschedule (CHO-2334) ─────────────────────────────────────────
  /** The session id currently being dragged (drives the drag visual), or null. */
  readonly draggingId = signal<string | null>(null);
  private draggedCard: SessionCard | null = null;
  /**
   * The `(day, hour)` cell the dragged card is hovering over, or null. Drives
   * the live drop-target highlight so the drop lands where the user expects
   * BEFORE they release (Goal 4). The keyboard-accessible reschedule form stays
   * the accessible fallback; this is a pointer-only visual aid.
   */
  readonly dropTarget = signal<{ readonly day: DayOfWeek; readonly hour: string } | null>(
    null,
  );

  /** Begin dragging a card. */
  onCardDragStart(card: SessionCard, event: DragEvent): void {
    this.draggedCard = card;
    this.draggingId.set(card.sessionId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.sessionId);
    }
  }

  /** End a drag (dropped or cancelled): drop the drag visual + the highlight. */
  onCardDragEnd(): void {
    this.draggedCard = null;
    this.draggingId.set(null);
    this.dropTarget.set(null);
  }

  /**
   * Allow a drop onto a grid slot (required for the drop event to fire) AND
   * record the hovered `(day, hour)` so that cell highlights as the live drop
   * target. Only writes the signal on an actual change to avoid churn from the
   * continuous dragover stream.
   */
  onSlotDragOver(day: DayOfWeek, hour: string, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const cur = this.dropTarget();
    if (!cur || cur.day !== day || cur.hour !== hour) {
      this.dropTarget.set({ day, hour });
    }
  }

  /** Clear the highlight when the drag leaves the cell it was marking. */
  onSlotDragLeave(day: DayOfWeek, hour: string): void {
    const cur = this.dropTarget();
    if (cur && cur.day === day && cur.hour === hour) {
      this.dropTarget.set(null);
    }
  }

  /** True for the `(day, hour)` cell the dragged card is currently over. */
  isDropTarget(day: DayOfWeek, hour: string): boolean {
    const t = this.dropTarget();
    return t !== null && t.day === day && t.hour === hour;
  }

  /**
   * Drop the dragged card onto a `(day, hour)` slot → reschedule to that slot,
   * PRESERVING the class duration (snapping to the hour). Same-slot drops are a
   * no-op (they would only self-collide). Preserves the card's room_id so the
   * booking is unchanged. Errors surface on the page-level banner.
   */
  onSlotDrop(day: DayOfWeek, hour: string, event: DragEvent): void {
    event.preventDefault();
    const card = this.draggedCard;
    const weekStartIso = this.data()?.weekStartIso;
    this.draggedCard = null;
    this.draggingId.set(null);
    this.dropTarget.set(null);
    if (!card || !weekStartIso) {
      return;
    }
    const targetHour = parseInt(hour.split(':')[0] ?? '8', 10);
    const { startsAt, endsAt } = computeDropReschedule({
      weekStartIso,
      targetDayIndex: dayIndex(day),
      targetHour,
      durationMinutes: minutesBetweenHHMM(card.startTime, card.endTime),
    });
    // Dropped back on its own slot: nothing to do (and it would self-collide).
    if (startsAt === toRfc3339Utc(card.dateIso, card.startTime)) {
      return;
    }
    this.createError.set(null);
    this.schedulingService
      .rescheduleClass(card.sessionId, {
        startsAt,
        endsAt,
        roomId: card.roomId.trim(),
      })
      .subscribe({
        next: () => {
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: unknown) => {
          this.createError.set(
            this.describeError(err, 'rplus.scheduling.reschedule.error_generic'),
          );
        },
      });
  }

  /**
   * Map a create failure to a user-readable banner (Goal 4) using the shared
   * error describer with the create-specific generic fallback.
   */
  private describeCreateError(err: unknown): string {
    return this.describeError(err, 'rplus.scheduling.create.error_generic');
  }

  /**
   * Map a scheduling-action failure to a user-readable message. Surfaces the
   * server-provided `error.message` when present (e.g. the 409
   * `room_double_booked` collision copy) so the human reason reaches the user;
   * the raw HTTP status is NEVER leaked. Falls back to a role/validation string
   * for 403/400/422, then to the caller's generic key. Uses `httpErrorView` so
   * it works against both the runtime `ApiError` and the raw `HttpErrorResponse`.
   */
  private describeError(err: unknown, genericKey: string): string {
    const view = httpErrorView(err);
    if (view) {
      const serverMessage = extractServerMessage(view.body);
      if (serverMessage) {
        return serverMessage;
      }
      if (view.status === 403) {
        return this.i18n.instant('rplus.scheduling.create.error_forbidden');
      }
      if (view.status === 400 || view.status === 422) {
        return this.i18n.instant('rplus.scheduling.create.error_validation');
      }
    }
    return this.i18n.instant(genericKey);
  }

  private resetForm(): void {
    this.courseIdInput.set('');
    this.instructorGcidInput.set('');
    this.roomIdInput.set('');
    this.dateInput.set('');
    this.startTimeInput.set('09:00');
    this.endTimeInput.set('12:00');
    this.maxCapacityInput.set(20);
  }
}

/**
 * 1-indexed day column (Mon=1 … Sun=7) within the absolute-overlay sessions
 * grid. Drives `--session-day` so each card lands in its day-of-week column.
 */
function dayIndex(day: DayOfWeek): number {
  const idx = ORDERED_DAYS.indexOf(day);
  return idx >= 0 ? idx + 1 : 1;
}

/**
 * 1-indexed grid row from the 08:00 baseline. "09:00" is row 2. Cap into the
 * 1..11 visible window (08:00 to 18:00).
 */
function rowFromStart(startTime: string): number {
  const hour = parseInt(startTime.split(':')[0] ?? '8', 10);
  return Math.max(1, Math.min(11, hour - 8 + 1));
}

/**
 * Row span in hours, rounded up so a 13:00 to 16:00 block reads as 3 rows tall.
 * Minimum 1 row.
 */
function spanHours(startTime: string, endTime: string): number {
  const sh = parseInt(startTime.split(':')[0] ?? '8', 10);
  const sm = parseInt(startTime.split(':')[1] ?? '0', 10);
  const eh = parseInt(endTime.split(':')[0] ?? '9', 10);
  const em = parseInt(endTime.split(':')[1] ?? '0', 10);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return Math.max(1, Math.ceil((endMin - startMin) / 60));
}

/**
 * Compose an RFC3339 UTC timestamp from a `YYYY-MM-DD` date + `HH:mm` time.
 * The week-view reads stored times as UTC (the display label says SGT — a
 * pre-existing simplification), so creating in UTC keeps the create→display
 * round-trip self-consistent.
 */
function toRfc3339Utc(dateIso: string, hhmm: string): string {
  return `${dateIso}T${hhmm}:00Z`;
}

/**
 * Pull a human message out of an error body across the shapes Chora services
 * emit: the IAM envelope `{ error: { message } }` (the 409 collision), a flat
 * `{ error: "..." }`, a bare `{ message }`, or a raw string. Returns null when
 * no human message is present, so the caller falls back to a generic string.
 */
function extractServerMessage(body: unknown): string | null {
  if (typeof body === 'string') {
    const s = body.trim();
    return s.length > 0 ? s : null;
  }
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const err = record['error'];
  if (typeof err === 'object' && err !== null) {
    const message = (err as Record<string, unknown>)['message'];
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err.trim();
  }
  const topMessage = record['message'];
  if (typeof topMessage === 'string' && topMessage.trim().length > 0) {
    return topMessage.trim();
  }
  return null;
}
