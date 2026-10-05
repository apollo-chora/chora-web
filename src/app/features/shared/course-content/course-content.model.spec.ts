/**
 * course-content.model.spec.ts — unit tests for pure model functions.
 *
 * No TestBed required: these are pure-function tests for `isUrlRef`,
 * `contentKindIcon`, and `reorderItems`.
 */
import { describe, it, expect } from 'vitest';
import {
  isUrlRef,
  contentKindIcon,
  reorderItems,
} from './course-content.model';
import type { CourseContentItem, ContentKind } from './course-content.model';

function buildItem(
  overrides: Partial<CourseContentItem> = {},
): CourseContentItem {
  return {
    item_id: 'item-1',
    kind: 'atom',
    ref: '01000000-0000-7000-8000-000000000001',
    title: 'Introduction to Scrum',
    position: 1,
    ...overrides,
  };
}

describe('isUrlRef()', () => {
  it('returns true for video', () => {
    expect(isUrlRef('video')).toBe(true);
  });

  it('returns true for youtube', () => {
    expect(isUrlRef('youtube')).toBe(true);
  });

  it('returns true for document', () => {
    expect(isUrlRef('document')).toBe(true);
  });

  it('returns false for atom', () => {
    expect(isUrlRef('atom')).toBe(false);
  });

  it('returns false for assessment', () => {
    expect(isUrlRef('assessment')).toBe(false);
  });

  it('returns false for live_classroom', () => {
    expect(isUrlRef('live_classroom')).toBe(false);
  });
});

describe('contentKindIcon()', () => {
  const kinds: ContentKind[] = [
    'atom',
    'video',
    'youtube',
    'document',
    'live_classroom',
    'assessment',
  ];

  it('returns a non-empty string for every kind', () => {
    for (const kind of kinds) {
      expect(contentKindIcon(kind).length).toBeGreaterThan(0);
    }
  });

  it('returns "atom" for atom kind', () => {
    expect(contentKindIcon('atom')).toBe('atom');
  });

  it('returns "clipboard-check" for assessment kind', () => {
    expect(contentKindIcon('assessment')).toBe('clipboard-check');
  });

  it('returns "chalkboard-user" for live_classroom kind', () => {
    expect(contentKindIcon('live_classroom')).toBe('chalkboard-user');
  });
});

describe('reorderItems()', () => {
  it('returns the input unchanged when item is not found', () => {
    const items = [buildItem({ item_id: 'a', position: 1 })];
    const result = reorderItems(items, 'does-not-exist', 1);
    expect(result).toBe(items);
  });

  it('returns the input unchanged when delta would go out of bounds (up at index 0)', () => {
    const items = [
      buildItem({ item_id: 'a', position: 1 }),
      buildItem({ item_id: 'b', position: 2 }),
    ];
    const result = reorderItems(items, 'a', -1);
    expect(result).toBe(items);
  });

  it('returns the input unchanged when delta would go out of bounds (down at last)', () => {
    const items = [
      buildItem({ item_id: 'a', position: 1 }),
      buildItem({ item_id: 'b', position: 2 }),
    ];
    const result = reorderItems(items, 'b', 1);
    expect(result).toBe(items);
  });

  it('moves an item down by 1 and re-stamps positions', () => {
    const items = [
      buildItem({ item_id: 'a', position: 1 }),
      buildItem({ item_id: 'b', position: 2 }),
      buildItem({ item_id: 'c', position: 3 }),
    ];
    const result = reorderItems(items, 'a', 1);
    expect(result[0]!.item_id).toBe('b');
    expect(result[1]!.item_id).toBe('a');
    expect(result[2]!.item_id).toBe('c');
    expect(result[0]!.position).toBe(1);
    expect(result[1]!.position).toBe(2);
  });

  it('moves an item up by 1 and re-stamps positions', () => {
    const items = [
      buildItem({ item_id: 'a', position: 1 }),
      buildItem({ item_id: 'b', position: 2 }),
      buildItem({ item_id: 'c', position: 3 }),
    ];
    const result = reorderItems(items, 'c', -1);
    expect(result[0]!.item_id).toBe('a');
    expect(result[1]!.item_id).toBe('c');
    expect(result[2]!.item_id).toBe('b');
    expect(result[2]!.position).toBe(3);
  });

  it('returns a new array reference when a move occurs', () => {
    const items = [
      buildItem({ item_id: 'a', position: 1 }),
      buildItem({ item_id: 'b', position: 2 }),
    ];
    const result = reorderItems(items, 'a', 1);
    expect(result).not.toBe(items);
  });
});
