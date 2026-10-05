import type { PostDraft } from '../../shared/models/moderation-verdict.model';

/**
 * Test data builder for `PostDraft` (C+ post composer).
 *
 * Per `chora-web/CLAUDE.md` §6 — never inline object literals in specs.
 */
export function buildPostDraft(overrides: Partial<PostDraft> = {}): PostDraft {
  return {
    content: 'Just mastered the Bayesian inference atom — priors finally clicked.',
    hashtags: ['bayesian-inference', 'streak'],
    ...overrides,
  };
}
