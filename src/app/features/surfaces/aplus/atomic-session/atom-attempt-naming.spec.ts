// ADR-246 D1 FE vocabulary guard (CHO umbrella story, 2026-07-21): the
// single-atom grading primitive is AtomAttempt in the FE vocabulary too.
// Kebab file/dir names, the component selector, and the frozen API routes
// (/v1/me/atom-sessions, /api/sessions) deliberately keep their legacy
// spellings; only the TypeScript vocabulary renames.
import { describe, expect, it } from 'vitest';

import type { AtomAttempt } from './atomic-session.model';
import { AtomAttemptService } from './atomic-session.service';

describe('ADR-246 AtomAttempt FE vocabulary', () => {
  it('exports the AtomAttempt type and AtomAttemptService', () => {
    const typeCheck: AtomAttempt | null = null;
    expect(typeCheck).toBeNull();
    expect(AtomAttemptService).toBeDefined();
  });
});
