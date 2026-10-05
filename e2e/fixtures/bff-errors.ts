import { type Page } from '@playwright/test';

interface ErrorResponse {
  error: { code: string; message: string; details: Record<string, unknown> };
}

export async function mockBffError(
  page: Page,
  pathPattern: string,
  status: number,
  code: string,
  message: string,
): Promise<void> {
  await page.route(`**${pathPattern}`, async (route) => {
    const body: ErrorResponse = {
      error: { code, message, details: {} },
    };
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

export async function mock401(page: Page, path: string): Promise<void> {
  await mockBffError(page, path, 401, 'IAM_UNAUTHORIZED', 'Authentication required');
}

export async function mock403(page: Page, path: string): Promise<void> {
  await mockBffError(page, path, 403, 'ENTITLEMENT_ADDON_DISABLED', 'Add-on not enabled for tenant');
}

export async function mock404(page: Page, path: string): Promise<void> {
  await mockBffError(page, path, 404, 'RESOURCE_NOT_FOUND', 'Resource not found');
}

export async function mock429(page: Page, path: string): Promise<void> {
  await page.route(`**${path}`, async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'Retry-After': '60' },
      body: JSON.stringify({
        error: { code: 'RATE_LIMITED', message: 'Too many requests', details: {} },
      }),
    });
  });
}

export async function mock500(page: Page, path: string): Promise<void> {
  await mockBffError(page, path, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
