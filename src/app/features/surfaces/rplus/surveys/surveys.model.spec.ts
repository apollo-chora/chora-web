/**
 * Surveys model spec — pure functions only.
 *
 * Covers: stateBadgeVariant, stateLabelKey, canAcceptResponse, canPublish,
 * canClose.
 */
import { describe, it, expect } from 'vitest';
import {
  SURVEY_STATES,
  QUESTION_TYPES,
  stateBadgeVariant,
  stateLabelKey,
  canAcceptResponse,
  canPublish,
  canClose,
} from './surveys.model';

describe('SURVEY_STATES', () => {
  it('exposes the 3 canonical survey states', () => {
    expect(SURVEY_STATES).toEqual(['DRAFT', 'DISTRIBUTED', 'CLOSED']);
  });
});

describe('QUESTION_TYPES', () => {
  it('exposes the 3 canonical question types', () => {
    expect(QUESTION_TYPES).toEqual(['LIKERT', 'TEXT', 'MULTIPLE_CHOICE']);
  });
});

describe('stateBadgeVariant', () => {
  it('maps DRAFT → badge-neutral', () => {
    expect(stateBadgeVariant('DRAFT')).toBe('badge-neutral');
  });

  it('maps DISTRIBUTED → badge-success', () => {
    expect(stateBadgeVariant('DISTRIBUTED')).toBe('badge-success');
  });

  it('maps CLOSED → badge-info', () => {
    expect(stateBadgeVariant('CLOSED')).toBe('badge-info');
  });
});

describe('stateLabelKey', () => {
  it('produces a translation key namespaced under rplus.surveys.state', () => {
    expect(stateLabelKey('DRAFT')).toBe('rplus.surveys.state.DRAFT');
    expect(stateLabelKey('DISTRIBUTED')).toBe(
      'rplus.surveys.state.DISTRIBUTED',
    );
    expect(stateLabelKey('CLOSED')).toBe('rplus.surveys.state.CLOSED');
  });
});

describe('canAcceptResponse', () => {
  it('returns true ONLY for DISTRIBUTED', () => {
    expect(canAcceptResponse('DRAFT')).toBe(false);
    expect(canAcceptResponse('DISTRIBUTED')).toBe(true);
    expect(canAcceptResponse('CLOSED')).toBe(false);
  });
});

describe('canPublish', () => {
  it('returns true ONLY for DRAFT', () => {
    expect(canPublish('DRAFT')).toBe(true);
    expect(canPublish('DISTRIBUTED')).toBe(false);
    expect(canPublish('CLOSED')).toBe(false);
  });
});

describe('canClose', () => {
  it('returns true ONLY for DISTRIBUTED', () => {
    expect(canClose('DRAFT')).toBe(false);
    expect(canClose('DISTRIBUTED')).toBe(true);
    expect(canClose('CLOSED')).toBe(false);
  });
});
