/**
 * @axe-core/playwright shared helper.
 *
 * Per `chora-web/CLAUDE.md` §6 + `frontend-testing-stack` skill: every E2E
 * spec runs an axe-core WCAG 2.1 AA audit after first render and asserts
 * zero critical / serious violations. Per Chora cross-cutting rule the CI
 * a11y gate is non-blockable: zero violations or the build fails.
 *
 * Companion helper to the older `e2e/fixtures/a11y.fixture.ts` (kept for
 * backwards compatibility with existing accessibility specs). New specs
 * should import from this module.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Run an axe-core WCAG 2.1 AA audit on the current page and fail the test if
 * any violation has impact `critical` or `serious`.
 *
 * Returns the raw axe result so callers can do extra assertions if needed
 * (e.g. checking a specific rule id was evaluated).
 *
 * @param page    Playwright `Page` to scan.
 * @param label   Optional human-readable label included in assertion messages.
 */
export async function expectNoSeriousViolations(page: Page, label?: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious = results.violations.filter((v) => v.impact === 'serious');

  const ctx = label ?? 'page';
  expect(critical, `${ctx}: critical a11y violations\n${formatViolations(critical)}`).toHaveLength(0);
  expect(serious, `${ctx}: serious a11y violations\n${formatViolations(serious)}`).toHaveLength(0);

  return results;
}

function formatViolations(violations: { id: string; help: string; nodes: { target: unknown }[] }[]): string {
  if (violations.length === 0) {
    return '';
  }
  return violations
    .map((v) => `  - [${v.id}] ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`)
    .join('\n');
}
