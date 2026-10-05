/**
 * Scheduling model — R+ Stage 3 wave 2.
 *
 * Domain vocabulary anchors:
 *   - `Class` / `ClassSession` — a scheduled deliverable instance
 *   - `Cohort` — group of learners taking the Class
 *   - `Instructor` — facilitator (`Mr. Chen` for CSPO 2026-A)
 *
 * Wave 2 ports `rplus-class-scheduling-week.html`. The Stitch HTML had
 * a C+ Connect+ sidebar regression (Stage 1 P0 audit) — we strip the
 * stale branding and render under the R+ amber accent only.
 *
 * Week-of-2026-05-18 fixture: CSPO 6 sessions × 3 hours each, instructor
 * `Mr. Chen`, venue `MTM HQ Room 401`, Singapore timezone (Asia/Singapore).
 */

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface ClassSession {
  /** Stable session id. */
  readonly sessionId: string;
  /**
   * Raw opaque course id (cross-aggregate ref). Carried through so the
   * component can resolve the real course title against the courses() list
   * it fetches; the service cannot resolve it alone (one class at a time).
   */
  readonly courseId: string;
  /** Short code derived from the course id; the fallback when the title is unresolved. */
  readonly courseCode: string;
  /** Day of the week. */
  readonly day: DayOfWeek;
  /** ISO date string `YYYY-MM-DD`. */
  readonly dateIso: string;
  /** Start time in `HH:mm` Asia/Singapore. */
  readonly startTime: string;
  /** End time in `HH:mm` Asia/Singapore. */
  readonly endTime: string;
  /** Duration in hours (matches Stitch HTML annotation). */
  readonly durationHours: number;
  /**
   * Raw opaque instructor GCID (no people-directory lookup is wired, so this
   * is also the display fallback, so render the genuine id, never a faked name).
   */
  readonly instructorGcid: string;
  /** Raw room id (cross-aggregate ref); `''` for legacy free-text-only rows. */
  readonly roomId: string;
  /** Room display name derived from the booked Room (may be `''` on legacy rows). */
  readonly venue: string;
  /** Seat budget for the class (from the wire `max_capacity`; 0 when absent). */
  readonly maxCapacity: number;
}

/**
 * A published course as consumed by the scheduling course + instructor
 * pickers. Sourced from `GET /api/v1/courses?state=PUBLISHED`. `label` is the
 * human title (title ?? description), truncated for the picker; `id` is the
 * option value posted as `course_id`; `instructorGcids` seeds the scoped
 * instructor picker with NO extra fetch.
 */
export interface SchedulingCourseOption {
  readonly id: string;
  readonly label: string;
  readonly instructorGcids: readonly string[];
}

export interface SchedulingWeek {
  /** ISO date of the Monday of the week (e.g., `2026-05-18`). */
  readonly weekStartIso: string;
  /** Human-readable week header (e.g., `Week of 18 May 2026`). */
  readonly weekLabel: string;
  /** Timezone identifier (Asia/Singapore). */
  readonly timezone: string;
  /** Timezone display label (e.g., `SGT (UTC+08:00)`). */
  readonly timezoneLabel: string;
  /** Sessions placed inside this week. */
  readonly sessions: readonly ClassSession[];
}

export const ORDERED_DAYS: readonly DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/**
 * Group sessions by day-of-week. Preserves insertion order within each day.
 */
export function groupSessionsByDay(
  sessions: readonly ClassSession[],
): Readonly<Record<DayOfWeek, readonly ClassSession[]>> {
  const grouped: Record<DayOfWeek, ClassSession[]> = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
  for (const s of sessions) {
    grouped[s.day].push(s);
  }
  return grouped;
}

// ── CHO-2333: room-lane packing ─────────────────────────────────────────────

/**
 * A vertical span inside one day column: `start` is the 1-based grid row and
 * `span` the number of rows it occupies (>= 1). `end` is `start + span`,
 * exclusive, matching CSS-grid `grid-row: start / span n` line semantics, so
 * a span ending on line N and one starting on line N do NOT overlap.
 */
export interface LaneSpan {
  readonly start: number;
  readonly span: number;
}

/** Horizontal placement of one span: 0-based `lane` within a `lanes`-wide cluster. */
export interface LaneAssignment {
  readonly lane: number;
  readonly lanes: number;
}

/**
 * Pack a single day's spans into side-by-side lanes so no two VISUALLY
 * overlapping spans share a lane (CHO-2333). Overlap is decided on the grid
 * rows the cards actually occupy, which guarantees the rendered result never
 * hides a card behind another.
 *
 * Algorithm (the standard calendar column-packing): sort by start; group spans
 * into connected overlap CLUSTERS; inside each cluster greedily assign every
 * span to the earliest lane whose previous occupant has already ended. A
 * cluster's `lanes` is its column count (the max concurrent overlap), shared by
 * every member so their widths line up. Non-overlapping spans form singleton
 * clusters and read as `{ lane: 0, lanes: 1 }` (full width).
 *
 * Returns assignments in the SAME order as the input so the caller can zip them
 * straight back onto its cards.
 */
export function assignLanes(
  items: readonly LaneSpan[],
): readonly LaneAssignment[] {
  const n = items.length;
  if (n === 0) {
    return [];
  }
  const order = items.map((s, i) => ({
    i,
    start: s.start,
    end: s.start + Math.max(1, s.span),
  }));
  order.sort((a, b) => a.start - b.start || a.end - b.end);

  const lane = new Array<number>(n).fill(0);
  const lanes = new Array<number>(n).fill(1);

  let members: number[] = []; // original indices in the open cluster
  let colEnds: number[] = []; // last end row per lane in the open cluster
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const closeCluster = (): void => {
    const count = colEnds.length || 1;
    for (const idx of members) {
      lanes[idx] = count;
    }
    members = [];
    colEnds = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const ev of order) {
    // A span that starts at/after every open span has ended closes the cluster.
    if (members.length > 0 && ev.start >= clusterEnd) {
      closeCluster();
    }
    let placed = -1;
    for (let c = 0; c < colEnds.length; c++) {
      if (ev.start >= colEnds[c]!) {
        placed = c;
        break;
      }
    }
    if (placed === -1) {
      placed = colEnds.length;
      colEnds.push(ev.end);
    } else {
      colEnds[placed] = ev.end;
    }
    lane[ev.i] = placed;
    members.push(ev.i);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  closeCluster();

  return items.map((_, i) => ({ lane: lane[i]!, lanes: lanes[i]! }));
}

// ── CHO-2334: drag-to-reschedule computation ────────────────────────────────

/** Minutes between two `HH:mm` marks, floored at 1 so a duration is never <= 0. */
export function minutesBetweenHHMM(startHHMM: string, endHHMM: string): number {
  const toMin = (hhmm: string): number => {
    const [h, m] = hhmm.split(':');
    return (parseInt(h ?? '0', 10) || 0) * 60 + (parseInt(m ?? '0', 10) || 0);
  };
  return Math.max(1, toMin(endHHMM) - toMin(startHHMM));
}

/**
 * Map a drop of a dragged session onto a `(day, hour)` grid slot to the new
 * RFC3339-UTC start/end, PRESERVING the original duration (CHO-2334). The drop
 * snaps to the top of the target hour.
 *
 * `weekStartIso` is the Monday of the displayed ISO week; `targetDayIndex` is
 * 1 (Mon) .. 7 (Sun) so the new date is `Monday + (targetDayIndex - 1)` days.
 * Times are composed in UTC to match how the week-view reads stored timestamps
 * (the SGT label is a pre-existing display simplification).
 */
export function computeDropReschedule(input: {
  readonly weekStartIso: string;
  readonly targetDayIndex: number;
  readonly targetHour: number;
  readonly durationMinutes: number;
}): { readonly startsAt: string; readonly endsAt: string } {
  const parts = input.weekStartIso.split('-');
  const y = parseInt(parts[0] ?? '1970', 10);
  const mo = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  const dayOffset = Math.max(0, Math.min(6, Math.round(input.targetDayIndex) - 1));
  const hour = Math.max(0, Math.min(23, Math.round(input.targetHour)));
  const startMs = Date.UTC(y, mo - 1, d + dayOffset, hour, 0, 0, 0);
  const durMs = Math.max(1, Math.round(input.durationMinutes)) * 60_000;
  return {
    startsAt: toRfc3339UtcSeconds(new Date(startMs)),
    endsAt: toRfc3339UtcSeconds(new Date(startMs + durMs)),
  };
}

/** Format a Date as `YYYY-MM-DDTHH:mm:ssZ` (UTC, second precision). */
function toRfc3339UtcSeconds(dt: Date): string {
  const p2 = (v: number): string => String(v).padStart(2, '0');
  const y = dt.getUTCFullYear();
  const mo = p2(dt.getUTCMonth() + 1);
  const d = p2(dt.getUTCDate());
  const h = p2(dt.getUTCHours());
  const mi = p2(dt.getUTCMinutes());
  const s = p2(dt.getUTCSeconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}
