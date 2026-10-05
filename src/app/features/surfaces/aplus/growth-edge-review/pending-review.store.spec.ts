import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  PendingReviewStore,
  PENDING_REVIEW_STORAGE_KEY,
} from './pending-review.store';

/**
 * PendingReviewStore (CHO-2337) — the localStorage wrapper that remembers the
 * one Growth-Edge diagnosis parked at the HITL review interrupt so the
 * `/a/knowledge` banner can re-offer it after the drawer is closed. It has no
 * Angular deps, so it is exercised as a plain object (no TestBed needed).
 */
describe('PendingReviewStore', () => {
  let store: PendingReviewStore;

  beforeEach(() => {
    localStorage.clear();
    store = new PendingReviewStore();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips the parked upload id through set → get', () => {
    store.set('up-1');
    expect(store.get()).toBe('up-1');
    expect(localStorage.getItem(PENDING_REVIEW_STORAGE_KEY)).toBe('up-1');
  });

  it('get returns null when nothing is parked', () => {
    expect(store.get()).toBeNull();
  });

  it('clear forgets the parked id', () => {
    store.set('up-2');
    store.clear();
    expect(store.get()).toBeNull();
    expect(localStorage.getItem(PENDING_REVIEW_STORAGE_KEY)).toBeNull();
  });

  it('set fails soft (never throws) when the storage backend throws', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    try {
      expect(() => store.set('up-3')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('get fails soft (returns null) when the storage backend throws', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    try {
      expect(store.get()).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
