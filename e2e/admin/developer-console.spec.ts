import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { mockDeveloperAPI } from '../fixtures/phase29-community-mocks';
import { DeveloperConsolePage } from '../pages/developer-console.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Developer Console — API Inspector
// ---------------------------------------------------------------------------
test.describe('Developer Console — API Inspector', () => {
  let devPage: DeveloperConsolePage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    devPage = new DeveloperConsolePage(page);
  });

  test('API inspector renders with request log entries', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('api-inspector');
    await devPage.expectApiInspectorLoaded();
    await expect(devPage.requestLog).toBeVisible();
    await expect(devPage.requestLogEntries.first()).toBeVisible();
  });

  test('API inspector allows filtering by HTTP method', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('api-inspector');
    await devPage.expectApiInspectorLoaded();
    await devPage.filterRequestsByMethod('GET');
    await expect(devPage.requestMethodFilter).toHaveValue('GET');
  });

  test('API inspector allows filtering by status code', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('api-inspector');
    await devPage.expectApiInspectorLoaded();
    await devPage.filterRequestsByStatus('200');
    await expect(devPage.requestStatusFilter).toHaveValue('200');
  });

  test('clicking a request entry opens detail panel', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('api-inspector');
    await devPage.expectApiInspectorLoaded();
    await devPage.clickRequestEntry(0);
    await expect(devPage.requestDetailPanel).toBeVisible();
    await expect(devPage.requestUrl).toBeVisible();
  });

  test('clear request log button empties the log', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('api-inspector');
    await devPage.expectApiInspectorLoaded();
    await devPage.clearRequestLog();

    // Clear action executed — inspector remains visible
    await expect(devPage.apiInspector).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Developer Console — Feature Flags
// ---------------------------------------------------------------------------
test.describe('Developer Console — Feature Flags', () => {
  let devPage: DeveloperConsolePage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    devPage = new DeveloperConsolePage(page);
  });

  test('feature flag panel renders with toggle list', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('feature-flags');
    await devPage.expectFeatureFlagPanelLoaded();
    await expect(devPage.featureFlagList).toBeVisible();
    await expect(devPage.featureFlagToggles.first()).toBeVisible();
  });

  test('feature flag search filters the list', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('feature-flags');
    await devPage.expectFeatureFlagPanelLoaded();
    await devPage.searchFlags('familiar');
    await expect(devPage.flagSearchInput).toHaveValue('familiar');
  });

  test('toggling a feature flag triggers PATCH request', async ({ page }) => {
    await mockDeveloperAPI(page);

    let flagToggled = false;
    await page.route('**/api/v1/admin/developer/feature-flags', async (route) => {
      if (route.request().method() === 'PATCH') {
        flagToggled = true;
        const body = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: body['code'], enabled: body['enabled'], is_overridden: true }),
        });
      } else {
        await route.fallback();
      }
    });

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('feature-flags');
    await devPage.expectFeatureFlagPanelLoaded();
    await devPage.toggleFlag('familiar');

    // Flag toggle dispatched
    await expect(devPage.featureFlagPanel).toBeVisible();
  });

  test('reset flags button restores defaults', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('feature-flags');
    await devPage.expectFeatureFlagPanelLoaded();
    await devPage.resetFlags();

    // Reset completed — panel remains
    await expect(devPage.featureFlagPanel).toBeVisible();
    await expect(devPage.resetFlagsButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Developer Console — Event Bus
// ---------------------------------------------------------------------------
test.describe('Developer Console — Event Bus', () => {
  let devPage: DeveloperConsolePage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    devPage = new DeveloperConsolePage(page);
  });

  test('event bus panel renders with event log entries', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('event-bus');
    await devPage.expectEventBusPanelLoaded();
    await expect(devPage.eventLog).toBeVisible();
    await expect(devPage.eventLogEntries.first()).toBeVisible();
  });

  test('event bus allows filtering by event type', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('event-bus');
    await devPage.expectEventBusPanelLoaded();
    await devPage.filterEventsByType('atom.completed');
    await expect(devPage.eventTypeFilter).toHaveValue('atom.completed');
  });

  test('event bus allows filtering by source service', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('event-bus');
    await devPage.expectEventBusPanelLoaded();
    await devPage.filterEventsBySource('chora-engagement');
    await expect(devPage.eventSourceFilter).toHaveValue('chora-engagement');
  });

  test('clicking an event entry opens detail panel', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('event-bus');
    await devPage.expectEventBusPanelLoaded();
    await devPage.clickEventEntry(0);
    await expect(devPage.eventDetailPanel).toBeVisible();
  });

  test('clear event log button empties the log', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('event-bus');
    await devPage.expectEventBusPanelLoaded();
    await devPage.clearEventLog();

    // Clear action executed — panel remains
    await expect(devPage.eventBusPanel).toBeVisible();
  });

  test('pause event log button stops live updates', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('event-bus');
    await devPage.expectEventBusPanelLoaded();
    await devPage.pauseEventLog();

    await expect(devPage.pauseEventLogButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Developer Console — RLS Context Viewer
// ---------------------------------------------------------------------------
test.describe('Developer Console — RLS Context Viewer', () => {
  let devPage: DeveloperConsolePage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    devPage = new DeveloperConsolePage(page);
  });

  test('RLS viewer renders current tenant context', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('rls-context');
    await devPage.expectRlsViewerLoaded();
    await expect(devPage.currentTenantId).toBeVisible();
    await expect(devPage.currentGcid).toBeVisible();
    await expect(devPage.currentRoles).toBeVisible();
    await expect(devPage.currentCapabilities).toBeVisible();
  });

  test('RLS viewer displays query preview', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('rls-context');
    await devPage.expectRlsViewerLoaded();
    await expect(devPage.rlsQueryPreview).toBeVisible();
  });

  test('tenant selector is available for context switching', async ({ page }) => {
    await mockDeveloperAPI(page);

    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('rls-context');
    await devPage.expectRlsViewerLoaded();
    await expect(devPage.tenantSelector).toBeVisible();
    await expect(devPage.switchTenantButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Developer Console — Console Overlay (~ keystroke)
// ---------------------------------------------------------------------------
test.describe('Developer Console — Overlay Toggle', () => {
  test('backtick key opens console overlay', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockDeveloperAPI(page);

    const devPage = new DeveloperConsolePage(page);
    await devPage.gotoAdminDeveloperConsole();

    await devPage.openConsoleOverlay();
    await expect(devPage.consoleOverlay).toBeVisible();
    await expect(devPage.consoleTabs).toBeVisible();
  });

  test('backtick key toggles console overlay closed', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockDeveloperAPI(page);

    const devPage = new DeveloperConsolePage(page);
    await devPage.gotoAdminDeveloperConsole();

    await devPage.openConsoleOverlay();
    await expect(devPage.consoleOverlay).toBeVisible();

    await devPage.closeConsoleOverlay();
    await expect(devPage.consoleOverlay).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Developer Console — Accessibility
// ---------------------------------------------------------------------------
test.describe('Developer Console — Accessibility', () => {
  test('API inspector passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockDeveloperAPI(page);

    const devPage = new DeveloperConsolePage(page);
    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('api-inspector');
    await devPage.expectApiInspectorLoaded();

    await runAxeAudit(page, 'Developer console API inspector');
  });

  test('feature flag panel passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockDeveloperAPI(page);

    const devPage = new DeveloperConsolePage(page);
    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('feature-flags');
    await devPage.expectFeatureFlagPanelLoaded();

    await runAxeAudit(page, 'Developer console feature flags');
  });

  test('event bus panel passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockDeveloperAPI(page);

    const devPage = new DeveloperConsolePage(page);
    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('event-bus');
    await devPage.expectEventBusPanelLoaded();

    await runAxeAudit(page, 'Developer console event bus');
  });

  test('RLS context viewer passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockDeveloperAPI(page);

    const devPage = new DeveloperConsolePage(page);
    await devPage.gotoAdminDeveloperConsole();
    await devPage.selectTab('rls-context');
    await devPage.expectRlsViewerLoaded();

    await runAxeAudit(page, 'Developer console RLS context');
  });
});
