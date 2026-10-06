/**
 * Bookings model spec - pure helpers (no TestBed).
 *
 * Covers the status → badge / icon / i18n-key mappings the component and
 * template depend on. The hyphenated `no-show` wire status MUST round-trip
 * to an underscore key segment so the i18n lookup stays a valid dot path.
 */
import { describe, it, expect } from 'vitest';
import {
  type BookingStatus,
  BOOKING_STATUSES,
  classOptionFromSession,
  statusBadgeVariant,
  statusIcon,
  statusLabelKey,
} from './bookings.model';
import type { ClassSession } from '../scheduling/scheduling.model';

function buildSession(overrides: Partial<ClassSession> = {}): ClassSession {
  return {
    sessionId: 'cls-1',
    courseId: 'course-cspo-1',
    courseCode: 'CSPO',
    day: 'tuesday',
    dateIso: '2026-05-19',
    startTime: '09:00',
    endTime: '12:00',
    durationHours: 3,
    instructorGcid: 'gcid-chen',
    roomId: 'room-401',
    venue: 'MTM HQ Room 401',
    maxCapacity: 0,
    ...overrides,
  };
}

describe('bookings.model', () => {
  it('exposes the four lifecycle statuses in order', () => {
    expect(BOOKING_STATUSES).toEqual([
      'pending',
      'confirmed',
      'attended',
      'no-show',
    ]);
  });

  describe('statusBadgeVariant', () => {
    const cases: readonly [BookingStatus, string][] = [
      ['pending', 'badge-warning'],
      ['confirmed', 'badge-success'],
      ['attended', 'badge-info'],
      ['no-show', 'badge-danger'],
    ];
    for (const [status, expected] of cases) {
      it(`maps ${status} → ${expected}`, () => {
        expect(statusBadgeVariant(status)).toBe(expected);
      });
    }
  });

  describe('statusIcon', () => {
    it('returns a fa- glyph for each status', () => {
      for (const status of BOOKING_STATUSES) {
        expect(statusIcon(status)).toMatch(/^fa-/);
      }
    });

    it('maps no-show to the user-xmark glyph', () => {
      expect(statusIcon('no-show')).toBe('fa-user-xmark');
    });
  });

  describe('statusLabelKey', () => {
    it('builds an rplus.bookings.status.* dot key', () => {
      expect(statusLabelKey('pending')).toBe('rplus.bookings.status.pending');
      expect(statusLabelKey('confirmed')).toBe(
        'rplus.bookings.status.confirmed',
      );
    });

    it('underscores the hyphen in no-show', () => {
      expect(statusLabelKey('no-show')).toBe('rplus.bookings.status.no_show');
    });
  });

  describe('classOptionFromSession', () => {
    it('uses the scheduled-class id as the option id (the booking class_id)', () => {
      const opt = classOptionFromSession(buildSession({ sessionId: 'cls-42' }));
      expect(opt.id).toBe('cls-42');
    });

    it('builds a human label carrying the code, date, start time and venue', () => {
      const opt = classOptionFromSession(buildSession());
      expect(opt.label).toContain('CSPO');
      expect(opt.label).toContain('2026-05-19');
      expect(opt.label).toContain('09:00');
      expect(opt.label).toContain('MTM HQ Room 401');
    });

    it('omits the venue segment when the class has no room', () => {
      const opt = classOptionFromSession(buildSession({ venue: '' }));
      expect(opt.label).toContain('CSPO');
      expect(opt.label).not.toContain('·  ·');
      expect(opt.label.endsWith('·')).toBe(false);
    });
  });
});
