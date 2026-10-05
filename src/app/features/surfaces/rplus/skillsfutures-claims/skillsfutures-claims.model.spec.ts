/**
 * SkillsFutures Claims model spec — pure functions only.
 *
 * Covers: stateBadgeVariant, formatSGD, shortNricHash.
 */
import { describe, it, expect } from 'vitest';
import {
  formatSGD,
  shortNricHash,
  stateBadgeVariant,
  SKILLSFUTURES_CLAIM_STATES,
} from './skillsfutures-claims.model';

describe('stateBadgeVariant', () => {
  it('maps PENDING → badge-warning', () => {
    expect(stateBadgeVariant('PENDING')).toBe('badge-warning');
  });

  it('maps APPROVED → badge-success', () => {
    expect(stateBadgeVariant('APPROVED')).toBe('badge-success');
  });

  it('maps REJECTED → badge-neutral', () => {
    expect(stateBadgeVariant('REJECTED')).toBe('badge-neutral');
  });

  it('maps DISBURSED → badge-info', () => {
    expect(stateBadgeVariant('DISBURSED')).toBe('badge-info');
  });

  it('exposes the 4 canonical claim states', () => {
    expect(SKILLSFUTURES_CLAIM_STATES).toEqual([
      'PENDING',
      'APPROVED',
      'REJECTED',
      'DISBURSED',
    ]);
  });
});

describe('formatSGD', () => {
  it('formats 50000 cents as S$500.00', () => {
    const formatted = formatSGD(50000);
    expect(formatted).toContain('500.00');
  });

  it('formats 0 cents with 2 decimal places', () => {
    const formatted = formatSGD(0);
    expect(formatted).toContain('0.00');
  });

  it('formats 12345 cents with sub-dollar precision', () => {
    const formatted = formatSGD(12345);
    expect(formatted).toContain('123.45');
  });
});

describe('shortNricHash', () => {
  it('strips the sha256: prefix and truncates to 12 chars + ellipsis', () => {
    const hash =
      'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const short = shortNricHash(hash);
    expect(short.startsWith('0123456789ab')).toBe(true);
    expect(short.endsWith('…')).toBe(true);
  });

  it('returns the body unchanged when ≤ 12 chars', () => {
    expect(shortNricHash('abcdef')).toBe('abcdef');
    expect(shortNricHash('sha256:abcdef')).toBe('abcdef');
  });

  it('handles bare hashes without a colon prefix', () => {
    const long = '0123456789abcdef0123456789abcdef';
    const short = shortNricHash(long);
    expect(short).toBe('0123456789ab…');
  });
});
