/**
 * Picker model contract guard — CHO-2216.
 *
 * The FE sort list and the BE sort whitelist are two copies of ONE contract
 * (question.sortFieldColumns in services/chora-creation/internal/domain/
 * question/search.go). They cannot be unified from here — the FE has no access
 * to the Go descriptor — so per the house rule for a duplicated table that
 * cannot yet be unified: TEST that they match. An unlisted sort field is a 400
 * at the boundary, i.e. a live broken control, not a type error.
 */
import { describe, it, expect } from 'vitest';

import {
  AUTHORABLE_QUESTION_TYPES,
  BE_WHITELISTED_SORT_FIELDS,
  DEFAULT_SORT,
  SORT_OPTIONS,
  type QuestionType,
} from './atom-question-picker.model';

describe('SORT_OPTIONS ↔ BE whitelist', () => {
  it('offers only sort FIELDS the BE whitelists (an unlisted field 400s)', () => {
    const offending = SORT_OPTIONS.map((o) => o.split(':')[0]).filter(
      (f) => !BE_WHITELISTED_SORT_FIELDS.includes(f),
    );
    expect(offending).toEqual([]);
  });

  it('offers only asc|desc directions (the contract grammar)', () => {
    const offending = SORT_OPTIONS.map((o) => o.split(':')[1]).filter(
      (d) => d !== 'asc' && d !== 'desc',
    );
    expect(offending).toEqual([]);
  });

  it('every option is well-formed field:direction', () => {
    for (const o of SORT_OPTIONS) {
      expect(o).toMatch(/^[a-z_]+:(asc|desc)$/);
    }
  });

  it('includes the DEFAULT_SORT so the initial state is a selectable option', () => {
    // Otherwise the select renders with nothing selected on first paint.
    expect(SORT_OPTIONS).toContain(DEFAULT_SORT);
  });

  it('includes updated_at — the AC names "sort by updated"', () => {
    expect(SORT_OPTIONS.some((o) => o.startsWith('updated_at:'))).toBe(true);
  });
});

describe('AUTHORABLE_QUESTION_TYPES', () => {
  it('is exactly the types an author can create and open', () => {
    expect([...AUTHORABLE_QUESTION_TYPES]).toEqual(['mcq', 'oe']);
  });

  it('excludes every reserved_* type — they have no authoring surface', () => {
    // Listing one would show the author a row they cannot open.
    const reserved = AUTHORABLE_QUESTION_TYPES.filter((t: QuestionType) =>
      t.startsWith('reserved_'),
    );
    expect(reserved).toEqual([]);
  });
});
