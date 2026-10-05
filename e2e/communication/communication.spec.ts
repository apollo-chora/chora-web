import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildNotificationPreference,
  buildTriggerRule,
  buildEmailTemplate,
  mockCommunicationPreferences,
  mockCommunicationTriggerRules,
  mockCommunicationEmailTemplates,
} from '../fixtures/wave4-bff-mocks';
import { CommunicationPage } from '../pages/communication.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Communication — Notification Preferences (Admin)
// ---------------------------------------------------------------------------
test.describe('Communication — Notification Preferences', () => {
  let commPage: CommunicationPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    commPage = new CommunicationPage(page);
  });

  test('notification preference toggles render', async ({ page }) => {
    const preferences = [
      buildNotificationPreference({ event_category: 'engagement', channel: 'email', enabled: true }),
      buildNotificationPreference({ event_category: 'engagement', channel: 'push', enabled: false }),
      buildNotificationPreference({ event_category: 'assessment', channel: 'email', enabled: true }),
      buildNotificationPreference({ event_category: 'assessment', channel: 'push', enabled: true }),
    ];
    await mockCommunicationPreferences(page, preferences);

    await commPage.gotoAdminPreferences();
    await commPage.expectPreferencesLoaded();
    await expect(commPage.notificationPreferences).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Communication — Trigger Rules
// ---------------------------------------------------------------------------
test.describe('Communication — Trigger Rules', () => {
  test('trigger rule list renders with mock data', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    const rules = [
      buildTriggerRule({
        id: 'tr-1',
        name: 'Streak reminder',
        event_type: 'streak_at_risk',
        is_active: true,
      }),
      buildTriggerRule({
        id: 'tr-2',
        name: 'Assessment deadline',
        event_type: 'assessment_deadline',
        is_active: true,
      }),
    ];
    await mockCommunicationTriggerRules(page, rules);

    const commPage = new CommunicationPage(page);
    await commPage.gotoTriggerRules();
    await commPage.expectTriggerRulesLoaded();
    await expect(commPage.triggerRuleList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Communication — Email Templates
// ---------------------------------------------------------------------------
test.describe('Communication — Email Templates', () => {
  test('email template editor panels render', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    const templates = [
      buildEmailTemplate({
        id: 'tpl-1',
        name: 'Welcome Email',
        category: 'onboarding',
      }),
      buildEmailTemplate({
        id: 'tpl-2',
        name: 'Password Reset',
        category: 'security',
      }),
    ];
    await mockCommunicationEmailTemplates(page, templates);

    const commPage = new CommunicationPage(page);
    await commPage.gotoEmailTemplates();
    await commPage.expectEmailTemplatesLoaded();
    await expect(commPage.templateList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Communication — Learner Preferences Route
// ---------------------------------------------------------------------------
test.describe('Communication — Learner Preferences', () => {
  test('learner preferences route renders notification preferences', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const preferences = [
      buildNotificationPreference({ event_category: 'engagement', channel: 'email', enabled: true }),
      buildNotificationPreference({ event_category: 'engagement', channel: 'push', enabled: false }),
    ];
    await mockCommunicationPreferences(page, preferences);

    const commPage = new CommunicationPage(page);
    await commPage.gotoLearnerPreferences();
    await commPage.expectPreferencesLoaded();
    await expect(commPage.notificationPreferences).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Communication — Accessibility
// ---------------------------------------------------------------------------
test.describe('Communication — Accessibility', () => {
  test('notification preferences page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    const preferences = [
      buildNotificationPreference({ event_category: 'engagement', channel: 'email', enabled: true }),
      buildNotificationPreference({ event_category: 'assessment', channel: 'push', enabled: true }),
    ];
    await mockCommunicationPreferences(page, preferences);

    const commPage = new CommunicationPage(page);
    await commPage.gotoAdminPreferences();
    await commPage.expectPreferencesLoaded();

    await runAxeAudit(page, 'Communication notification preferences');
  });
});
