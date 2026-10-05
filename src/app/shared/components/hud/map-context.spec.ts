import { describe, it, expect } from 'vitest';
import { activeMapGoalId } from './map-context';

describe('activeMapGoalId', () => {
  it('reads the goal id from a map route', () => {
    expect(activeMapGoalId('/a/knowledge/goal-42')).toBe('goal-42');
  });

  it('is null on the atlas itself, which is not a map', () => {
    expect(activeMapGoalId('/a/knowledge')).toBeNull();
    expect(activeMapGoalId('/a/knowledge/')).toBeNull();
  });

  it('is null off the knowledge surface entirely', () => {
    expect(activeMapGoalId('/a/wallet')).toBeNull();
    expect(activeMapGoalId('/a/roster')).toBeNull();
  });

  it('ignores a query string and a fragment', () => {
    expect(activeMapGoalId('/a/knowledge/goal-42?lens=growth#node-7')).toBe('goal-42');
  });

  it('reads the goal id even with a deeper segment beneath it', () => {
    expect(activeMapGoalId('/a/knowledge/goal-42/settings')).toBe('goal-42');
  });

  it('is not fooled by a sibling route that merely starts with the same letters', () => {
    expect(activeMapGoalId('/a/knowledge-base/goal-42')).toBeNull();
  });
});
