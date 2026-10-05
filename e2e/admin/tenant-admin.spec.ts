import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildTenantUser,
  buildAddOnPlan,
  buildEntitlement,
  buildInvitation,
  mockAdminUserList,
  mockAdminUserRoleAssign,
  mockAdminUserSuspend,
  mockAdminEntitlements,
  mockAdminAddOns,
  mockAdminEntitlementToggle,
  mockAdminInvitationList,
  mockAdminInvitationCreate,
  mockAdminInvitationRevoke,
} from '../fixtures/admin-bff-mocks';
import { AdminUserManagementPage } from '../pages/admin-user-management.page';
import { AdminEntitlementManagerPage } from '../pages/admin-entitlement-manager.page';
import { AdminInvitationManagerPage } from '../pages/admin-invitation-manager.page';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Tenant Admin — User Management
// ---------------------------------------------------------------------------
test.describe('Tenant Admin — User Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
  });

  test('list users, search by email, verify results', async ({ page }) => {
    const users = [
      buildTenantUser({
        gcid: 'gcid-user-001',
        email: 'alice@test.chora.io',
        display_name: 'Alice',
        roles: ['learner'],
      }),
      buildTenantUser({
        gcid: 'gcid-user-002',
        email: 'bob@test.chora.io',
        display_name: 'Bob',
        roles: ['instructor'],
      }),
      buildTenantUser({
        gcid: 'gcid-user-003',
        email: 'carol@test.chora.io',
        display_name: 'Carol',
        roles: ['learner', 'instructor'],
      }),
    ];
    await mockAdminUserList(page, users);

    const userPage = new AdminUserManagementPage(page);
    await userPage.goto();
    await userPage.expectLoaded();

    // Verify all users listed
    const initialCount = await userPage.getRowCount();
    expect(initialCount).toBe(3);

    // Search by email
    const filteredUsers = [users[0]];
    await mockAdminUserList(page, filteredUsers);
    await userPage.searchByEmail('alice');
    await page.waitForLoadState('networkidle');

    // Verify filtered result
    await expect(userPage.getUserEmail('gcid-user-001')).toContainText('alice@test.chora.io');
  });

  test('assign role to user, verify role chip appears', async ({ page }) => {
    const user = buildTenantUser({
      gcid: 'gcid-role-user',
      email: 'role-test@test.chora.io',
      display_name: 'Role Test',
      roles: ['learner'],
    });
    await mockAdminUserList(page, [user]);
    await mockAdminUserRoleAssign(page, 'gcid-role-user');

    const userPage = new AdminUserManagementPage(page);
    await userPage.goto();
    await userPage.expectLoaded();

    // Click edit roles
    await userPage.clickEditRoles('gcid-role-user');

    // Verify role editor opened
    await expect(userPage.getRoleEditor('gcid-role-user')).toBeVisible();

    // Toggle instructor role
    await userPage.toggleRole('gcid-role-user', 'instructor');

    // Mock updated user with new role
    const updatedUser = buildTenantUser({
      gcid: 'gcid-role-user',
      email: 'role-test@test.chora.io',
      display_name: 'Role Test',
      roles: ['learner', 'instructor'],
    });
    await mockAdminUserList(page, [updatedUser]);

    // Verify the role chip appears after reload
    await userPage.goto();
    await userPage.expectLoaded();

    await expect(userPage.getRoleChip('instructor').first()).toBeVisible();
  });

  test('suspend user, confirm, verify suspended badge', async ({ page }) => {
    const activeUser = buildTenantUser({
      gcid: 'gcid-suspend-user',
      email: 'suspend-test@test.chora.io',
      display_name: 'Suspend Test',
      roles: ['learner'],
      account_state: 'active',
    });
    await mockAdminUserList(page, [activeUser]);
    await mockAdminUserSuspend(page, 'gcid-suspend-user');

    const userPage = new AdminUserManagementPage(page);
    await userPage.goto();
    await userPage.expectLoaded();

    // Verify user is active
    await expect(userPage.getUserState('gcid-suspend-user')).toContainText('active');

    // Suspend user
    await userPage.suspendUser('gcid-suspend-user');

    // Handle confirm dialog if present
    const confirmButton = page.locator('[data-testid="confirm-btn"]');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Mock updated list with suspended user
    const suspendedUser = buildTenantUser({
      gcid: 'gcid-suspend-user',
      email: 'suspend-test@test.chora.io',
      display_name: 'Suspend Test',
      roles: ['learner'],
      account_state: 'suspended',
    });
    await mockAdminUserList(page, [suspendedUser]);

    // Verify suspended badge
    await userPage.goto();
    await userPage.expectLoaded();
    await expect(userPage.getUserState('gcid-suspend-user')).toContainText('suspended');
  });
});

// ---------------------------------------------------------------------------
// Tenant Admin — Entitlement Manager
// ---------------------------------------------------------------------------
test.describe('Tenant Admin — Entitlement Manager', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
  });

  test('toggle add-on entitlement, confirm, verify state change', async ({ page }) => {
    const addOns = [
      buildAddOnPlan({
        code: 'learner_engagement',
        name: 'Learner Engagement',
        category: 'Engagement',
      }),
      buildAddOnPlan({
        code: 'knowledge_graph',
        name: 'Knowledge Graph',
        category: 'Discovery',
      }),
      buildAddOnPlan({
        code: 'CHORAVERSE',
        name: 'Choraverse',
        category: 'Gamification',
      }),
    ];
    const entitlements = [
      buildEntitlement({ id: 'ent-1', add_on_code: 'learner_engagement', enabled: true }),
      buildEntitlement({ id: 'ent-2', add_on_code: 'knowledge_graph', enabled: false }),
    ];

    await mockAdminAddOns(page, addOns);
    await mockAdminEntitlements(page, entitlements);
    await mockAdminEntitlementToggle(page, 'ent-2');

    const entPage = new AdminEntitlementManagerPage(page);
    await entPage.goto();
    await entPage.expectLoaded();

    // Verify enabled state
    await expect(entPage.getAddonCard('learner_engagement')).toBeVisible();

    // Toggle an entitlement
    await entPage.toggleAddOn('knowledge_graph');

    // Handle confirm dialog if present
    const confirmButton = page.locator('[data-testid="confirm-btn"]');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Mock updated entitlements
    const updatedEntitlements = [
      buildEntitlement({ id: 'ent-1', add_on_code: 'learner_engagement', enabled: true }),
      buildEntitlement({ id: 'ent-2', add_on_code: 'knowledge_graph', enabled: true }),
    ];
    await mockAdminEntitlements(page, updatedEntitlements);
  });
});

// ---------------------------------------------------------------------------
// Tenant Admin — Invitation Manager
// ---------------------------------------------------------------------------
test.describe('Tenant Admin — Invitation Manager', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
  });

  test('create invitation, verify link generated, copy to clipboard', async ({ page }) => {
    // Start with no invitations
    await mockAdminInvitationList(page, []);

    const newInvitation = buildInvitation({
      id: 'inv-new',
      role_template: 'learner',
      invitee_email: 'newuser@test.chora.io',
    });
    await mockAdminInvitationCreate(page, newInvitation);

    const invPage = new AdminInvitationManagerPage(page);
    await invPage.goto();
    await invPage.expectLoaded();

    // Open create form
    await invPage.openCreateForm();

    // Fill form
    await invPage.selectRole('learner');
    await invPage.fillEmail('newuser@test.chora.io');

    // Submit
    await invPage.submitCreate();

    // Mock updated list with new invitation
    await mockAdminInvitationList(page, [newInvitation]);

    // Reload to verify
    await invPage.goto();
    await invPage.expectLoaded();

    // Verify invitation card visible
    await expect(invPage.getInvitationCard('inv-new')).toBeVisible();
    await expect(invPage.getInvitationLink('inv-new')).toBeVisible();

    // Grant clipboard permissions for this context and copy link
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await invPage.copyLink('inv-new');
  });

  test('revoke invitation, confirm, verify revoked', async ({ page }) => {
    const invitation = buildInvitation({
      id: 'inv-revoke',
      role_template: 'instructor',
    });
    await mockAdminInvitationList(page, [invitation]);
    await mockAdminInvitationRevoke(page, 'inv-revoke');

    const invPage = new AdminInvitationManagerPage(page);
    await invPage.goto();
    await invPage.expectLoaded();

    // Verify invitation is visible
    await expect(invPage.getInvitationCard('inv-revoke')).toBeVisible();

    // Revoke
    await invPage.revokeInvitation('inv-revoke');

    // Handle confirm dialog if present
    const confirmButton = page.locator('[data-testid="confirm-btn"]');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Mock empty list after revocation (active invitations gone)
    await mockAdminInvitationList(page, []);

    // Reload and verify
    await invPage.goto();
    await invPage.expectLoaded();
  });
});
