import { describe, it, expect } from 'vitest';
import { statusBadge, capacityPercent } from './exams.model';

describe('exams.model', () => {
  describe('statusBadge', () => {
    it('maps Open for registration → badge-success', () => {
      expect(statusBadge('Open for registration')).toBe('badge-success');
    });
    it('maps Full → badge-warning', () => {
      expect(statusBadge('Full')).toBe('badge-warning');
    });
    it('maps Scheduled → badge-info', () => {
      expect(statusBadge('Scheduled')).toBe('badge-info');
    });
    it('maps Closed → badge-neutral', () => {
      expect(statusBadge('Closed')).toBe('badge-neutral');
    });
  });

  describe('capacityPercent', () => {
    it('returns 0 when capacity is 0', () => {
      expect(capacityPercent(5, 0)).toBe(0);
    });
    it('rounds to nearest integer', () => {
      expect(capacityPercent(22, 30)).toBe(73);
    });
    it('returns 100 when fully booked', () => {
      expect(capacityPercent(30, 30)).toBe(100);
    });
  });
});
