import { describe, it, expect } from 'vitest';
import { statusBadgeVariant } from './catalog.model';

describe('catalog.model — statusBadgeVariant', () => {
  it('maps Published → badge-success', () => {
    expect(statusBadgeVariant('Published')).toBe('badge-success');
  });
  it('maps Draft → badge-warning', () => {
    expect(statusBadgeVariant('Draft')).toBe('badge-warning');
  });
  it('maps Awaiting Review → badge-info', () => {
    expect(statusBadgeVariant('Awaiting Review')).toBe('badge-info');
  });
  it('maps Archived → badge-neutral', () => {
    expect(statusBadgeVariant('Archived')).toBe('badge-neutral');
  });
});
