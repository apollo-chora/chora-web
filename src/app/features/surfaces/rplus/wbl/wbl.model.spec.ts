/**
 * WBL model spec — type guards + derived helpers.
 *
 * Verifies:
 *   - `isPlacementState` narrows correctly across all 4 FSM values
 *   - `isPlacement` rejects malformed envelopes (missing field / wrong type)
 *   - `stateBadgeVariant` returns the correct glass-badge class per state
 *   - `completionPercent` clamps + rounds correctly across edge cases
 *
 * Pure-function tests — no TestBed needed per chora-web/CLAUDE.md §6.
 */
import { describe, it, expect } from 'vitest';
import {
  Placement,
  completionPercent,
  isPlacement,
  isPlacementState,
  stateBadgeVariant,
} from './wbl.model';

function validPlacement(): Placement {
  return {
    id: 'p-1',
    tenantId: 'tenant-001',
    gcid: 'gcid-phyllis',
    courseId: 'course-cspo',
    hostOrgName: 'Acme Pte Ltd',
    supervisorName: 'Jane Tan',
    supervisorEmail: 'jane.tan@acme.example',
    startDate: '2026-06-01T00:00:00Z',
    endDate: '2026-08-31T00:00:00Z',
    hoursRequired: 240,
    hoursCompleted: 0,
    state: 'SCHEDULED',
    evaluatorNotes: '',
    createdAt: '2026-05-26T10:00:00Z',
    updatedAt: '2026-05-26T10:00:00Z',
  };
}

describe('isPlacementState', () => {
  it('accepts SCHEDULED', () => {
    expect(isPlacementState('SCHEDULED')).toBe(true);
  });

  it('accepts IN_PROGRESS', () => {
    expect(isPlacementState('IN_PROGRESS')).toBe(true);
  });

  it('accepts COMPLETED', () => {
    expect(isPlacementState('COMPLETED')).toBe(true);
  });

  it('accepts WITHDRAWN', () => {
    expect(isPlacementState('WITHDRAWN')).toBe(true);
  });

  it('rejects unknown FSM values', () => {
    expect(isPlacementState('DRAFT')).toBe(false);
    expect(isPlacementState('CONFIRMED')).toBe(false);
    expect(isPlacementState('')).toBe(false);
    expect(isPlacementState(null)).toBe(false);
    expect(isPlacementState(undefined)).toBe(false);
    expect(isPlacementState(42)).toBe(false);
  });
});

describe('isPlacement', () => {
  it('accepts a fully-formed Placement', () => {
    expect(isPlacement(validPlacement())).toBe(true);
  });

  it('rejects null + undefined', () => {
    expect(isPlacement(null)).toBe(false);
    expect(isPlacement(undefined)).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(isPlacement('p-1')).toBe(false);
    expect(isPlacement(42)).toBe(false);
    expect(isPlacement([])).toBe(false);
  });

  it('rejects when id is missing', () => {
    const p = { ...validPlacement() } as Record<string, unknown>;
    delete p['id'];
    expect(isPlacement(p)).toBe(false);
  });

  it('rejects when hoursRequired is a string', () => {
    const p = { ...validPlacement(), hoursRequired: '240' } as unknown;
    expect(isPlacement(p)).toBe(false);
  });

  it('rejects when state is not a known FSM value', () => {
    const p = { ...validPlacement(), state: 'DRAFT' } as unknown;
    expect(isPlacement(p)).toBe(false);
  });

  it('rejects when evaluatorNotes is not a string', () => {
    const p = { ...validPlacement(), evaluatorNotes: null } as unknown;
    expect(isPlacement(p)).toBe(false);
  });
});

describe('stateBadgeVariant', () => {
  it('SCHEDULED → badge-info', () => {
    expect(stateBadgeVariant('SCHEDULED')).toBe('badge-info');
  });

  it('IN_PROGRESS → badge-success', () => {
    expect(stateBadgeVariant('IN_PROGRESS')).toBe('badge-success');
  });

  it('COMPLETED → badge-success', () => {
    expect(stateBadgeVariant('COMPLETED')).toBe('badge-success');
  });

  it('WITHDRAWN → badge-neutral', () => {
    expect(stateBadgeVariant('WITHDRAWN')).toBe('badge-neutral');
  });
});

describe('completionPercent', () => {
  it('returns 0 when no hours accrued', () => {
    expect(completionPercent(0, 240)).toBe(0);
  });

  it('returns 50 at the halfway point', () => {
    expect(completionPercent(120, 240)).toBe(50);
  });

  it('returns 100 when fully accrued', () => {
    expect(completionPercent(240, 240)).toBe(100);
  });

  it('rounds to the nearest integer', () => {
    expect(completionPercent(80, 240)).toBe(33);
    expect(completionPercent(160, 240)).toBe(67);
  });

  it('clamps to 0 on negative inputs (corrupt payload guard)', () => {
    expect(completionPercent(-5, 240)).toBe(0);
  });

  it('clamps to 100 on over-credit (corrupt payload guard)', () => {
    expect(completionPercent(300, 240)).toBe(100);
  });

  it('returns 0 when hoursRequired is zero (corrupt payload guard)', () => {
    expect(completionPercent(50, 0)).toBe(0);
  });

  it('returns 0 when hoursRequired is negative (corrupt payload guard)', () => {
    expect(completionPercent(50, -10)).toBe(0);
  });
});
