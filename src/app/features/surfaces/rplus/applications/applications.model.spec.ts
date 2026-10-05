import { expect, vi } from 'vitest';
import {
  applicationStatusBadge,
  normaliseApplicationStatus,
  applicationStateLabel,
  APPLICATION_STATE_OPTIONS,
  type ApplicationStateFilter,
  type ApplicationStatus,
  type ApplicationStatusBadge,
} from './applications.model';

describe('applications.model', () => {
  describe('applicationStatusBadge', () => {
    // switch over ApplicationStatus — exercise EVERY case arm.
    it('returns badge-info for SUBMITTED', () => {
      expect(applicationStatusBadge('SUBMITTED')).toBe('badge-info');
    });

    it('returns badge-info for IN_REVIEW (shares the SUBMITTED fall-through arm)', () => {
      expect(applicationStatusBadge('IN_REVIEW')).toBe('badge-info');
    });

    it('returns badge-warning for OFFER_MADE', () => {
      expect(applicationStatusBadge('OFFER_MADE')).toBe('badge-warning');
    });

    it('returns badge-success for ACCEPTED', () => {
      expect(applicationStatusBadge('ACCEPTED')).toBe('badge-success');
    });

    it('returns badge-success for PAID (shares the ACCEPTED fall-through arm)', () => {
      expect(applicationStatusBadge('PAID')).toBe('badge-success');
    });

    it('returns badge-success for ENROLLED (its own dedicated arm)', () => {
      expect(applicationStatusBadge('ENROLLED')).toBe('badge-success');
    });

    it('returns badge-danger for REJECTED', () => {
      expect(applicationStatusBadge('REJECTED')).toBe('badge-danger');
    });

    it('returns badge-neutral for WITHDRAWN', () => {
      expect(applicationStatusBadge('WITHDRAWN')).toBe('badge-neutral');
    });

    it('covers every ApplicationStatus value with a valid badge variant', () => {
      const statuses: ApplicationStatus[] = [
        'SUBMITTED',
        'IN_REVIEW',
        'OFFER_MADE',
        'ACCEPTED',
        'PAID',
        'ENROLLED',
        'REJECTED',
        'WITHDRAWN',
      ];
      const allowed: ApplicationStatusBadge[] = [
        'badge-info',
        'badge-warning',
        'badge-success',
        'badge-neutral',
        'badge-danger',
      ];
      for (const s of statuses) {
        // every arm must return — no undefined fall-through
        expect(allowed).toContain(applicationStatusBadge(s));
      }
    });
  });

  describe('normaliseApplicationStatus', () => {
    // switch over the normalised string — hit EVERY case + the default.
    it('maps "submitted" → SUBMITTED', () => {
      expect(normaliseApplicationStatus('submitted')).toBe('SUBMITTED');
    });

    it('maps "under_review" → IN_REVIEW (domain enum form)', () => {
      expect(normaliseApplicationStatus('under_review')).toBe('IN_REVIEW');
    });

    it('maps "in_review" → IN_REVIEW (wire form, shared arm)', () => {
      expect(normaliseApplicationStatus('in_review')).toBe('IN_REVIEW');
    });

    it('maps "offer_made" → OFFER_MADE', () => {
      expect(normaliseApplicationStatus('offer_made')).toBe('OFFER_MADE');
    });

    it('maps "accepted" → ACCEPTED', () => {
      expect(normaliseApplicationStatus('accepted')).toBe('ACCEPTED');
    });

    it('maps "paid" → PAID', () => {
      expect(normaliseApplicationStatus('paid')).toBe('PAID');
    });

    it('maps "enrolled" → ENROLLED', () => {
      expect(normaliseApplicationStatus('enrolled')).toBe('ENROLLED');
    });

    it('maps "rejected" → REJECTED', () => {
      expect(normaliseApplicationStatus('rejected')).toBe('REJECTED');
    });

    it('maps "withdrawn" → WITHDRAWN', () => {
      expect(normaliseApplicationStatus('withdrawn')).toBe('WITHDRAWN');
    });

    it('trims surrounding whitespace before matching', () => {
      // exercises the .trim() branch of the normalisation pipeline
      expect(normaliseApplicationStatus('  paid  ')).toBe('PAID');
    });

    it('lower-cases mixed-case input before matching', () => {
      // exercises the .toLowerCase() branch of the normalisation pipeline
      expect(normaliseApplicationStatus('AcCePtEd')).toBe('ACCEPTED');
    });

    it('combines trim + lowercase for a mixed-case padded value', () => {
      expect(normaliseApplicationStatus('  OFFER_MADE \t')).toBe('OFFER_MADE');
    });

    it('falls back to SUBMITTED and warns on an unknown status (default arm)', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        expect(normaliseApplicationStatus('totally_bogus')).toBe('SUBMITTED');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('totally_bogus'),
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('falls back to SUBMITTED and warns on an empty string (default arm)', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        expect(normaliseApplicationStatus('')).toBe('SUBMITTED');
        expect(warnSpy).toHaveBeenCalledTimes(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('falls back to SUBMITTED on whitespace-only input (default arm after trim)', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        expect(normaliseApplicationStatus('   ')).toBe('SUBMITTED');
        expect(warnSpy).toHaveBeenCalledTimes(1);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('applicationStateLabel', () => {
    // switch over ApplicationStateFilter — hit EVERY case arm (incl. ALL).
    it('labels ALL as "All states"', () => {
      expect(applicationStateLabel('ALL')).toBe('All states');
    });

    it('labels SUBMITTED as "Submitted"', () => {
      expect(applicationStateLabel('SUBMITTED')).toBe('Submitted');
    });

    it('labels IN_REVIEW as "In review"', () => {
      expect(applicationStateLabel('IN_REVIEW')).toBe('In review');
    });

    it('labels OFFER_MADE as "Offer made"', () => {
      expect(applicationStateLabel('OFFER_MADE')).toBe('Offer made');
    });

    it('labels ACCEPTED as "Accepted"', () => {
      expect(applicationStateLabel('ACCEPTED')).toBe('Accepted');
    });

    it('labels PAID as "Paid"', () => {
      expect(applicationStateLabel('PAID')).toBe('Paid');
    });

    it('labels ENROLLED as "Enrolled"', () => {
      expect(applicationStateLabel('ENROLLED')).toBe('Enrolled');
    });

    it('labels REJECTED as "Rejected"', () => {
      expect(applicationStateLabel('REJECTED')).toBe('Rejected');
    });

    it('labels WITHDRAWN as "Withdrawn"', () => {
      expect(applicationStateLabel('WITHDRAWN')).toBe('Withdrawn');
    });

    it('produces a non-empty label for every selectable option', () => {
      for (const opt of APPLICATION_STATE_OPTIONS) {
        const label = applicationStateLabel(opt);
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('APPLICATION_STATE_OPTIONS', () => {
    it('lists ALL first then the eight canonical statuses in order', () => {
      const expected: ApplicationStateFilter[] = [
        'ALL',
        'SUBMITTED',
        'IN_REVIEW',
        'OFFER_MADE',
        'ACCEPTED',
        'PAID',
        'ENROLLED',
        'REJECTED',
        'WITHDRAWN',
      ];
      expect([...APPLICATION_STATE_OPTIONS]).toEqual(expected);
    });
  });
});
