import { describe, it, expect } from 'vitest';
import {
  ORDERED_DAYS,
  groupSessionsByDay,
  assignLanes,
  computeDropReschedule,
  minutesBetweenHHMM,
  ClassSession,
} from './scheduling.model';

describe('scheduling.model', () => {
  it('ORDERED_DAYS starts on monday and ends on sunday', () => {
    expect(ORDERED_DAYS[0]).toBe('monday');
    expect(ORDERED_DAYS[6]).toBe('sunday');
    expect(ORDERED_DAYS).toHaveLength(7);
  });

  describe('groupSessionsByDay', () => {
    const session = (id: string, day: ClassSession['day']): ClassSession => ({
      sessionId: id,
      courseId: 'course-cspo',
      courseCode: 'CSPO',
      day,
      dateIso: '2026-05-18',
      startTime: '09:00',
      endTime: '12:00',
      durationHours: 3,
      instructorGcid: 'gcid-chen',
      roomId: 'room-401',
      venue: 'MTM HQ Room 401',
      maxCapacity: 25,
    });

    it('returns 7 day buckets for an empty input', () => {
      const grouped = groupSessionsByDay([]);
      expect(Object.keys(grouped)).toHaveLength(7);
      for (const d of ORDERED_DAYS) {
        expect(grouped[d]).toHaveLength(0);
      }
    });

    it('places sessions into the correct day bucket', () => {
      const grouped = groupSessionsByDay([
        session('s1', 'monday'),
        session('s2', 'wednesday'),
        session('s3', 'monday'),
      ]);
      expect(grouped.monday).toHaveLength(2);
      expect(grouped.wednesday).toHaveLength(1);
      expect(grouped.tuesday).toHaveLength(0);
    });
  });

  // CHO-2333: overlapping sessions in one day must render side-by-side (each in
  // its own lane) so no card hides another. assignLanes is the pure packing
  // computation the day column drives its sub-columns from.
  describe('assignLanes (CHO-2333 room-lane packing)', () => {
    it('returns [] for no spans', () => {
      expect(assignLanes([])).toEqual([]);
    });

    it('gives a lone session the full width (lane 0 of 1)', () => {
      expect(assignLanes([{ start: 2, span: 3 }])).toEqual([{ lane: 0, lanes: 1 }]);
    });

    it('keeps two non-overlapping sessions both full-width (reuse lane 0)', () => {
      // start 1 span 1 (rows 1..2), start 3 span 1 (rows 3..4): disjoint.
      const out = assignLanes([
        { start: 1, span: 1 },
        { start: 3, span: 1 },
      ]);
      expect(out).toEqual([
        { lane: 0, lanes: 1 },
        { lane: 0, lanes: 1 },
      ]);
    });

    it('treats touching spans (end === next start) as non-overlapping', () => {
      // start 1 span 1 ends at row 2; start 2 span 1 begins at row 2 → no overlap.
      const out = assignLanes([
        { start: 1, span: 1 },
        { start: 2, span: 1 },
      ]);
      expect(out).toEqual([
        { lane: 0, lanes: 1 },
        { lane: 0, lanes: 1 },
      ]);
    });

    it('splits two overlapping sessions into two side-by-side lanes', () => {
      // A rows 1..4, B rows 2..4 overlap.
      const out = assignLanes([
        { start: 1, span: 3 },
        { start: 2, span: 2 },
      ]);
      expect(out).toEqual([
        { lane: 0, lanes: 2 },
        { lane: 1, lanes: 2 },
      ]);
    });

    it('preserves INPUT order in the returned assignments', () => {
      // Input order is B (later start) then A (earlier start); they overlap.
      const out = assignLanes([
        { start: 3, span: 2 }, // B rows 3..5
        { start: 1, span: 3 }, // A rows 1..4
      ]);
      // A (earlier) takes lane 0, B (later) takes lane 1, but the RESULT keeps
      // input order: index 0 == B, index 1 == A.
      expect(out).toEqual([
        { lane: 1, lanes: 2 },
        { lane: 0, lanes: 2 },
      ]);
    });

    it('packs a transitive cluster so two disjoint neighbours share one lane', () => {
      // A rows 1..5 overlaps both B (2..3) and C (3..4); B and C are disjoint
      // from each other so they reuse lane 1. Cluster needs 2 lanes.
      const out = assignLanes([
        { start: 1, span: 4 }, // A
        { start: 2, span: 1 }, // B
        { start: 3, span: 1 }, // C
      ]);
      expect(out).toEqual([
        { lane: 0, lanes: 2 },
        { lane: 1, lanes: 2 },
        { lane: 1, lanes: 2 },
      ]);
    });
  });

  // CHO-2334: dropping a dragged card onto a (day, hour) slot maps to a new
  // start/end that PRESERVES the original duration.
  describe('minutesBetweenHHMM', () => {
    it('computes whole-hour spans', () => {
      expect(minutesBetweenHHMM('09:00', '12:00')).toBe(180);
    });
    it('computes sub-hour spans', () => {
      expect(minutesBetweenHHMM('09:00', '09:30')).toBe(30);
    });
    it('never returns a non-positive duration', () => {
      expect(minutesBetweenHHMM('12:00', '09:00')).toBeGreaterThan(0);
    });
  });

  describe('computeDropReschedule (CHO-2334 drop → new time)', () => {
    it('maps a Wednesday 14:00 drop of a 3h class off the Monday anchor', () => {
      const out = computeDropReschedule({
        weekStartIso: '2026-05-18', // Monday
        targetDayIndex: 3, // Wednesday
        targetHour: 14,
        durationMinutes: 180,
      });
      expect(out.startsAt).toBe('2026-05-20T14:00:00Z');
      expect(out.endsAt).toBe('2026-05-20T17:00:00Z');
    });

    it('preserves a 90-minute duration and snaps to the hour', () => {
      const out = computeDropReschedule({
        weekStartIso: '2026-05-18',
        targetDayIndex: 1, // Monday
        targetHour: 9,
        durationMinutes: 90,
      });
      expect(out.startsAt).toBe('2026-05-18T09:00:00Z');
      expect(out.endsAt).toBe('2026-05-18T10:30:00Z');
    });

    it('places a Sunday (day 7) drop six days after the Monday anchor', () => {
      const out = computeDropReschedule({
        weekStartIso: '2026-05-18',
        targetDayIndex: 7, // Sunday
        targetHour: 10,
        durationMinutes: 60,
      });
      expect(out.startsAt).toBe('2026-05-24T10:00:00Z');
      expect(out.endsAt).toBe('2026-05-24T11:00:00Z');
    });
  });
});
