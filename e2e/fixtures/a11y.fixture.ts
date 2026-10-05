import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Runs axe-core WCAG 2.1 AA audit. Fails on critical or serious violations.
 */
export async function runAxeAudit(page: Page, context?: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  const critical = results.violations.filter((v) => v.impact === 'critical');
  const serious = results.violations.filter((v) => v.impact === 'serious');

  expect(critical, `${context ?? 'Page'} has critical a11y violations`).toHaveLength(0);
  expect(serious, `${context ?? 'Page'} has serious a11y violations`).toHaveLength(0);

  return results;
}
