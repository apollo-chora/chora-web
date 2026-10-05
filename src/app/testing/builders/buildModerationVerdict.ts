import type { ModerationVerdict } from '../../shared/models/moderation-verdict.model';

/**
 * Test data builder for `ModerationVerdict` — the chora-sharing 422 envelope.
 *
 * Per `chora-web/CLAUDE.md` §6 — never inline object literals in specs.
 * Defaults to a `refine` verdict with a `suggested_rewrite`; pass overrides
 * (`{ verdict: 'reject' }` etc.) for the other branches.
 */
export function buildModerationVerdict(
  overrides: Partial<ModerationVerdict> = {},
): ModerationVerdict {
  return {
    verdict: 'refine',
    reason: 'This post may come across as dismissive. Consider a kinder framing.',
    suggested_rewrite:
      'Great effort on the inference atom — here is a clearer way to phrase your takeaway.',
    ...overrides,
  };
}
