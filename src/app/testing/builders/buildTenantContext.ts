import type { TenantContext } from '../../core/auth/tenant-context.service';

/**
 * Test data builder for `TenantContext` — the per-membership shape the
 * tenant picker + switcher consume after the Stage-2 cutover.
 *
 * Per `chora-web/CLAUDE.md` §6 — never inline object literals in specs.
 */
export function buildTenantContext(
  overrides: Partial<TenantContext> = {},
): TenantContext {
  return {
    id: 'tenant-alpha',
    name: 'Alpha School',
    slug: 'alpha-school',
    logoUrl: null,
    roles: ['learner'],
    surfaces: ['aplus'],
    isDefault: false,
    ...overrides,
  };
}
