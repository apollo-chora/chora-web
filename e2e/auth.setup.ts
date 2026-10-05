import { test as setup } from '@playwright/test';

const ROLES = [
  { name: 'learner', path: 'e2e/fixtures/.auth/learner.json' },
  { name: 'instructor', path: 'e2e/fixtures/.auth/instructor.json' },
  { name: 'tenant-admin', path: 'e2e/fixtures/.auth/tenant-admin.json' },
  { name: 'content-manager', path: 'e2e/fixtures/.auth/content-manager.json' },
];

for (const role of ROLES) {
  setup(`generate storage state for ${role.name}`, async ({ page }) => {
    // Set mock refresh_token cookie — consumed by AuthService.silentRefresh()
    await page.context().addCookies([
      {
        name: 'refresh_token',
        value: `mock-refresh-${role.name}`,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    await page.context().storageState({ path: role.path });
  });
}
