/**
 * MembersComponent spec — L1 Tenant lane (CHO-1709): the H+ Members
 * roster wired to the real chora-identity BFF surface via
 * TenantMembersAdminService (mocked here with discriminated results).
 * Replaces the wave-3 static-mock spec.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject } from 'rxjs';

import { MembersComponent } from './members.component';
import { TenantMembersAdminService } from '../../../admin/tenant-admin/services/tenant-members-admin.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { RbacService } from '../../../../core/services/rbac.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  CHORA_MASTER_TENANT_ID,
  CreateInviteResult,
  InvitesListResult,
  ManagedTenant,
  ManagedTenantsListResult,
  PendingInvite,
  TenantMemberMutationResult,
  TenantMembershipRow,
  TenantMemberSummary,
  TenantMembersListResult,
} from '../../../admin/tenant-admin/models/tenant-members-admin.model';

const anika: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000001999',
  email: 'anika@mtm.sg',
  display_name: 'Anika',
  roles: ['INSTRUCTOR'],
  last_active_at: '2026-06-10T12:00:00Z',
};

const dale: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000002000',
  email: 'dale@mtm.sg',
  display_name: 'Dale',
  roles: ['ADMIN'],
  last_active_at: '2026-06-10T11:00:00Z',
};

const grantedFixture: TenantMembershipRow = {
  membership_id: 'm-default',
  gcid: anika.gcid,
  tenant_id: 't-1',
  roles: ['INSTRUCTOR'],
  granted_at: '2026-06-25T00:00:00Z',
};

interface Mocks {
  roster: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  changeRole: ReturnType<typeof vi.fn>;
  setRoles: ReturnType<typeof vi.fn>;
  setDisplayName: ReturnType<typeof vi.fn>;
  createInvite: ReturnType<typeof vi.fn>;
  listInvites: ReturnType<typeof vi.fn>;
  revokeInvite: ReturnType<typeof vi.fn>;
  removeMember: ReturnType<typeof vi.fn>;
  toastShow: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  hasRole: ReturnType<typeof vi.fn>;
  listManagedTenants: ReturnType<typeof vi.fn>;
}

interface SetupOpts {
  invitesResult?: InvitesListResult;
  isOperator?: boolean;
  managedTenants?: readonly ManagedTenant[];
  managedTenantsResult?: ManagedTenantsListResult;
  confirmResult?: boolean;
  rosterObservable?: Observable<TenantMembersListResult>;
}

function setup(
  rosterResult: TenantMembersListResult = { kind: 'success', rows: [anika, dale] },
  opts: SetupOpts = {},
): { fixture: ComponentFixture<MembersComponent>; mocks: Mocks } {
  const invitesResult: InvitesListResult = opts.invitesResult ?? {
    kind: 'success',
    invites: [],
  };
  const mocks: Mocks = {
    roster: vi.fn(() => opts.rosterObservable ?? of(rosterResult)),
    add: vi.fn(),
    changeRole: vi.fn(),
    setRoles: vi.fn(),
    setDisplayName: vi.fn(() =>
      of({ kind: 'success', member: anika } as TenantMemberMutationResult),
    ),
    createInvite: vi.fn(() =>
      of({ kind: 'granted', membership: grantedFixture } as CreateInviteResult),
    ),
    listInvites: vi.fn(() => of(invitesResult)),
    revokeInvite: vi.fn(() => of({ kind: 'success' })),
    removeMember: vi.fn(() => of({ kind: 'success' })),
    toastShow: vi.fn(),
    confirm: vi.fn(() => Promise.resolve(opts.confirmResult ?? true)),
    hasRole: vi.fn(
      (r: string) => (opts.isOperator ?? false) && r.trim().toLowerCase() === 'platform_operator',
    ),
    listManagedTenants: vi.fn(() =>
      of(
        opts.managedTenantsResult ??
          ({
            kind: 'success',
            tenants: opts.managedTenants ?? [],
          } as ManagedTenantsListResult),
      ),
    ),
  };
  TestBed.configureTestingModule({
    imports: [MembersComponent],
    providers: [
      // RouterLink reached this template with the /h/ownership hand-over
      // link (E3 slice 7); without a router the whole component fails to
      // create, which is a harness gap rather than a behaviour change.
      provideRouter([]),
      {
        provide: TenantMembersAdminService,
        useValue: {
          roster: mocks.roster,
          add: mocks.add,
          changeRole: mocks.changeRole,
          setRoles: mocks.setRoles,
          setDisplayName: mocks.setDisplayName,
          createInvite: mocks.createInvite,
          listInvites: mocks.listInvites,
          revokeInvite: mocks.revokeInvite,
          removeMember: mocks.removeMember,
          listManagedTenants: mocks.listManagedTenants,
        },
      },
      { provide: ToastService, useValue: { show: mocks.toastShow } },
      { provide: RbacService, useValue: { hasRole: mocks.hasRole } },
      { provide: ConfirmDialogService, useValue: { confirm: mocks.confirm } },
    ],
  });
  const fixture = TestBed.createComponent(MembersComponent);
  fixture.detectChanges();
  return { fixture, mocks };
}

function el(fixture: ComponentFixture<MembersComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('MembersComponent (L1 — real BFF)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('roster hydration', () => {
    it('renders one row per roster member from the service', () => {
      const { fixture, mocks } = setup();
      expect(mocks.roster).toHaveBeenCalledTimes(1);
      const root = el(fixture);
      expect(root.querySelector(`[data-testid="member-row-${anika.gcid}"]`)).toBeTruthy();
      expect(root.querySelector(`[data-testid="member-row-${dale.gcid}"]`)).toBeTruthy();
      expect(root.textContent).toContain('anika@mtm.sg');
    });

    it('shows the loading state while the roster is in flight', () => {
      const pending = new Subject<TenantMembersListResult>();
      const { fixture } = setup(
        { kind: 'success', rows: [] },
        {
          rosterObservable: pending.asObservable(),
        },
      );
      expect(el(fixture).querySelector('[data-testid="members-loading"]')).toBeTruthy();
      pending.next({ kind: 'success', rows: [] });
      pending.complete();
      fixture.detectChanges();
      expect(el(fixture).querySelector('[data-testid="members-loading"]')).toBeFalsy();
    });

    it('shows the empty state when the roster is empty', () => {
      const { fixture } = setup({ kind: 'success', rows: [] });
      expect(el(fixture).querySelector('[data-testid="members-empty"]')).toBeTruthy();
      expect(el(fixture).querySelector('[data-testid="members-table"]')).toBeFalsy();
    });

    it('shows the error state with a retry that re-fetches', () => {
      const { fixture, mocks } = setup({ kind: 'server-error' });
      const root = el(fixture);
      expect(root.querySelector('[data-testid="members-error"]')).toBeTruthy();
      (root.querySelector('[data-testid="members-retry"]') as HTMLButtonElement).click();
      expect(mocks.roster).toHaveBeenCalledTimes(2);
    });

    it('never renders the wave-3 mock roster emails', () => {
      const { fixture } = setup({ kind: 'success', rows: [] });
      expect(el(fixture).textContent).not.toContain('chen@mtm.sg');
      expect(el(fixture).textContent).not.toContain('alice@partner.sg');
    });
  });

  describe('add member by email', () => {
    function openModal(fixture: ComponentFixture<MembersComponent>): void {
      (el(fixture).querySelector('[data-testid="invite-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    function typeEmail(fixture: ComponentFixture<MembersComponent>, value: string): void {
      const input = el(fixture).querySelector('[data-testid="invite-email"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    // CHO-2206 — toggle an invite-role checkbox by role token.
    function toggleInviteRole(
      fixture: ComponentFixture<MembersComponent>,
      role: string,
      checked: boolean,
    ): void {
      const cb = el(fixture).querySelector(
        `[data-testid="invite-role-${role}"]`,
      ) as HTMLInputElement;
      cb.checked = checked;
      cb.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    it('routes add through createInvite; on granted refreshes roster + toasts added', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [dale] });
      mocks.createInvite.mockReturnValue(
        of({ kind: 'granted', membership: grantedFixture } as CreateInviteResult),
      );

      openModal(fixture);
      typeEmail(fixture, 'anika@mtm.sg');
      // Single-role still works: drop the default learner, add instructor.
      toggleInviteRole(fixture, 'learner', false);
      toggleInviteRole(fixture, 'instructor', true);

      (el(fixture).querySelector('[data-testid="invite-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      // Non-operator → no body tenant_id (tenant from session).
      expect(mocks.createInvite).toHaveBeenCalledWith('anika@mtm.sg', ['INSTRUCTOR'], undefined);
      expect(mocks.add).not.toHaveBeenCalled();
      expect(el(fixture).querySelector('[data-testid="invite-modal"]')).toBeFalsy();
      // Roster re-fetched (init + post-grant) so the new member surfaces truthfully.
      expect(mocks.roster).toHaveBeenCalledTimes(2);
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.toast.added', 'success');
    });

    it('on a bare-email invited result shows pending success (NOT user-not-found)', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [] });
      const invite: PendingInvite = {
        invite_id: 'i-cold',
        email: 'ghost@mtm.sg',
        tenant_id: 't-1',
        roles: ['INSTRUCTOR'],
        status: 'pending',
        expires_at: '2026-07-25T00:00:00Z',
        created_at: '2026-06-25T00:00:00Z',
      };
      mocks.createInvite.mockReturnValue(of({ kind: 'invited', invite } as CreateInviteResult));

      openModal(fixture);
      typeEmail(fixture, 'ghost@mtm.sg');
      (el(fixture).querySelector('[data-testid="invite-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      // No inline error; modal closes; pending success toast; invite listed.
      expect(el(fixture).querySelector('[data-testid="invite-error"]')).toBeFalsy();
      expect(el(fixture).querySelector('[data-testid="invite-modal"]')).toBeFalsy();
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.toast.invited', 'success');
      expect(el(fixture).querySelector('[data-testid="pending-row-i-cold"]')).toBeTruthy();
    });

    it('renders the inline duplicate rejection and keeps the modal open', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      mocks.createInvite.mockReturnValue(of({ kind: 'duplicate' } as CreateInviteResult));

      openModal(fixture);
      typeEmail(fixture, 'anika@mtm.sg');
      (el(fixture).querySelector('[data-testid="invite-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el(fixture).querySelector('[data-testid="invite-error"]')?.textContent).toContain(
        'hplus.members.error.duplicate',
      );
      expect(el(fixture).querySelector('[data-testid="invite-modal"]')).toBeTruthy();
      // CHO-2206 walk feedback: a duplicate must ALSO toast, not just inline —
      // a re-submit otherwise reads as "nothing happened".
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.error.duplicate', 'warning');
    });

    it('disables submit while the email is empty', () => {
      const { fixture } = setup({ kind: 'success', rows: [] });
      openModal(fixture);
      const submit = el(fixture).querySelector(
        '[data-testid="invite-submit"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      typeEmail(fixture, 'a@b.c');
      expect(submit.disabled).toBe(false);
    });

    // CHO-2206 — multi-role invite (backend roles[] already supported).
    it('submits ALL selected roles in canonical order (multi-role invite)', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [] });
      mocks.createInvite.mockReturnValue(
        of({ kind: 'granted', membership: grantedFixture } as CreateInviteResult),
      );
      openModal(fixture);
      typeEmail(fixture, 'new@mtm.sg');
      // Default learner stays checked; add author + instructor.
      toggleInviteRole(fixture, 'author', true);
      toggleInviteRole(fixture, 'instructor', true);
      (el(fixture).querySelector('[data-testid="invite-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(mocks.createInvite).toHaveBeenCalledWith(
        'new@mtm.sg',
        ['LEARNER', 'AUTHOR', 'INSTRUCTOR'],
        undefined,
      );
    });

    it('pre-selects learner when the invite modal opens', () => {
      const { fixture } = setup();
      openModal(fixture);
      const learner = el(fixture).querySelector(
        '[data-testid="invite-role-learner"]',
      ) as HTMLInputElement;
      expect(learner.checked).toBe(true);
    });

    it('disables submit when a valid email has zero roles selected', () => {
      const { fixture } = setup();
      openModal(fixture);
      typeEmail(fixture, 'someone@mtm.sg');
      const submit = el(fixture).querySelector(
        '[data-testid="invite-submit"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
      toggleInviteRole(fixture, 'learner', false);
      expect(submit.disabled).toBe(true);
    });
  });

  // CHO-1809 multi-role REPLACE editor — the H+ Members page swapped its
  // single-role <select> for a checkbox-per-role list plus a Save / Cancel
  // pair that surfaces only when the draft set differs from the server
  // set. The save path calls setRoles (PUT /tenant-members/{gcid}/roles),
  // which replaces the role set on both stores.
  describe('multi-role REPLACE editor', () => {
    // Helper — toggle a checkbox by `data-testid` and re-render.
    function toggle(
      fixture: ComponentFixture<MembersComponent>,
      gcid: string,
      role: string,
      checked: boolean,
    ) {
      const cb = el(fixture).querySelector(
        `[data-testid="member-role-${gcid}-${role}"]`,
      ) as HTMLInputElement;
      cb.checked = checked;
      cb.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    it('renders one checkbox per canonical role (learner/instructor/admin/auditor)', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] });
      ['learner', 'instructor', 'admin', 'auditor'].forEach((r) => {
        expect(
          el(fixture).querySelector(`[data-testid="member-role-${anika.gcid}-${r}"]`),
        ).toBeTruthy();
      });
    });

    it('pre-checks the checkboxes for the server role set', () => {
      const member: TenantMemberSummary = { ...anika, roles: ['INSTRUCTOR', 'ADMIN'] };
      const { fixture } = setup({ kind: 'success', rows: [member] });
      const instructor = el(fixture).querySelector(
        `[data-testid="member-role-${member.gcid}-instructor"]`,
      ) as HTMLInputElement;
      const learner = el(fixture).querySelector(
        `[data-testid="member-role-${member.gcid}-learner"]`,
      ) as HTMLInputElement;
      expect(instructor.checked).toBe(true);
      expect(learner.checked).toBe(false);
    });

    it('hides Save/Cancel while the draft matches the server set', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] });
      expect(
        el(fixture).querySelector(`[data-testid="member-roles-save-${anika.gcid}"]`),
      ).toBeNull();
      expect(
        el(fixture).querySelector(`[data-testid="member-roles-cancel-${anika.gcid}"]`),
      ).toBeNull();
    });

    it('surfaces Save/Cancel once any checkbox diverges from the server set', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] });
      toggle(fixture, anika.gcid, 'admin', true);
      expect(
        el(fixture).querySelector(`[data-testid="member-roles-save-${anika.gcid}"]`),
      ).toBeTruthy();
      expect(
        el(fixture).querySelector(`[data-testid="member-roles-cancel-${anika.gcid}"]`),
      ).toBeTruthy();
    });

    it('Cancel reverts the draft back to the server set + hides the action row', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] });
      toggle(fixture, anika.gcid, 'admin', true);
      (
        el(fixture).querySelector(
          `[data-testid="member-roles-cancel-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      const admin = el(fixture).querySelector(
        `[data-testid="member-role-${anika.gcid}-admin"]`,
      ) as HTMLInputElement;
      expect(admin.checked).toBe(false);
      expect(
        el(fixture).querySelector(`[data-testid="member-roles-save-${anika.gcid}"]`),
      ).toBeNull();
    });

    it('PUTs the UPPERCASE role set via setRoles + updates the row on success', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      const replaced: TenantMemberSummary = { ...anika, roles: ['INSTRUCTOR', 'ADMIN'] };
      mocks.setRoles.mockReturnValue(
        of({ kind: 'success', member: replaced } as TenantMemberMutationResult),
      );

      toggle(fixture, anika.gcid, 'admin', true);
      (
        el(fixture).querySelector(
          `[data-testid="member-roles-save-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expect(mocks.setRoles).toHaveBeenCalledTimes(1);
      const [calledGcid, calledRoles] = mocks.setRoles.mock.calls[0];
      expect(calledGcid).toBe(anika.gcid);
      // Order-insensitive: the BE accepts any order.
      expect([...calledRoles].sort()).toEqual(['ADMIN', 'INSTRUCTOR']);
      // Row's data-roles reflects the BE response set.
      expect(
        el(fixture)
          .querySelector(`[data-testid="member-row-${anika.gcid}"]`)
          ?.getAttribute('data-roles')
          ?.split(' ')
          .sort(),
      ).toEqual(['admin', 'instructor']);
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.toast.rolesSaved', 'success');
    });

    it('removes a role when its checkbox is unchecked + Save sends the trimmed set', () => {
      const member: TenantMemberSummary = { ...anika, roles: ['LEARNER', 'INSTRUCTOR'] };
      const { fixture, mocks } = setup({ kind: 'success', rows: [member] });
      const replaced: TenantMemberSummary = { ...member, roles: ['INSTRUCTOR'] };
      mocks.setRoles.mockReturnValue(
        of({ kind: 'success', member: replaced } as TenantMemberMutationResult),
      );

      toggle(fixture, member.gcid, 'learner', false);
      (
        el(fixture).querySelector(
          `[data-testid="member-roles-save-${member.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expect(mocks.setRoles).toHaveBeenCalledWith(member.gcid, ['INSTRUCTOR']);
    });

    it('refuses to save an empty role set and toasts a clarifying error', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      // Uncheck the only role anika has — leaves an empty draft.
      toggle(fixture, anika.gcid, 'instructor', false);
      (
        el(fixture).querySelector(
          `[data-testid="member-roles-save-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expect(mocks.setRoles).not.toHaveBeenCalled();
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.toast.atLeastOneRole', 'error');
    });

    it('re-syncs the roster and toasts on a failed save', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      mocks.setRoles.mockReturnValue(of({ kind: 'server-error' } as TenantMemberMutationResult));

      toggle(fixture, anika.gcid, 'admin', true);
      (
        el(fixture).querySelector(
          `[data-testid="member-roles-save-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.toast.roleChangeFailed', 'error');
      // initial load + re-sync.
      expect(mocks.roster).toHaveBeenCalledTimes(2);
    });
  });

  // CHO-1809 — chora_tenancy.members carries multiple rows per (tenant,
  // gcid) under the widened `(tenant_id, gcid, role)` unique constraint.
  // The roster API returns the FULL role set in `roles[]`; the page
  // renders the canonical 4 chips and pre-checks the ones in the set.
  describe('multi-role display (chips + data-roles)', () => {
    const dualRole = (overrides: Partial<TenantMemberSummary> = {}): TenantMemberSummary => ({
      gcid: 'gcid-dual',
      email: 'dual@example.com',
      display_name: 'Dual Role',
      roles: ['LEARNER', 'INSTRUCTOR'],
      last_active_at: '2026-06-21T00:00:00Z',
      ...overrides,
    });

    it('pre-checks every checkbox in the server role set', () => {
      const member = dualRole();
      const { fixture } = setup({ kind: 'success', rows: [member] });
      const learner = el(fixture).querySelector(
        `[data-testid="member-role-${member.gcid}-learner"]`,
      ) as HTMLInputElement;
      const instructor = el(fixture).querySelector(
        `[data-testid="member-role-${member.gcid}-instructor"]`,
      ) as HTMLInputElement;
      const admin = el(fixture).querySelector(
        `[data-testid="member-role-${member.gcid}-admin"]`,
      ) as HTMLInputElement;
      expect(learner.checked).toBe(true);
      expect(instructor.checked).toBe(true);
      expect(admin.checked).toBe(false);
    });

    it('reflects the full role set on data-roles (space-separated)', () => {
      const member = dualRole({ roles: ['ADMIN', 'AUDITOR'] });
      const { fixture } = setup({ kind: 'success', rows: [member] });
      const row = el(fixture).querySelector(`[data-testid="member-row-${member.gcid}"]`);
      expect(row?.getAttribute('data-roles')?.split(' ').sort()).toEqual(['admin', 'auditor']);
    });

    it('defaults to a single LEARNER chip when the BE returns an empty roles[]', () => {
      // Guard against a malformed BE payload — toVm picks LEARNER as the
      // safe baseline so the row never renders with zero active roles.
      const member = dualRole({ roles: [] });
      const { fixture } = setup({ kind: 'success', rows: [member] });
      const learner = el(fixture).querySelector(
        `[data-testid="member-role-${member.gcid}-learner"]`,
      ) as HTMLInputElement;
      const instructor = el(fixture).querySelector(
        `[data-testid="member-role-${member.gcid}-instructor"]`,
      ) as HTMLInputElement;
      expect(learner.checked).toBe(true);
      expect(instructor.checked).toBe(false);
    });

    it('drops unknown role tokens from the checked set', () => {
      // BE evolves faster than FE; the FE shouldn't render a checkbox for
      // an unknown token nor crash on it.
      const member = dualRole({
        roles: ['LEARNER', 'GHOST_ROLE_FROM_FUTURE', 'INSTRUCTOR'],
      });
      const { fixture } = setup({ kind: 'success', rows: [member] });
      const row = el(fixture).querySelector(`[data-testid="member-row-${member.gcid}"]`);
      expect(row?.getAttribute('data-roles')?.split(' ').sort()).toEqual(['instructor', 'learner']);
      // No checkbox is rendered for the ghost token.
      expect(
        el(fixture).querySelector(
          `[data-testid="member-role-${member.gcid}-ghost_role_from_future"]`,
        ),
      ).toBeNull();
    });
  });

  // WS1 (CHO-1870) — Author + Training-Admin role-label exposure.
  // AUTHOR is a real membership_role (ADR-182 / mig 0020) that the roster was
  // silently coercing to learner. TRAINING_ADMIN is a UI label over the
  // instructor membership_role (role_catalog mig 0014); it is offered ONLY as
  // a single-role invite option (the BE resolves it to instructor), never as a
  // multi-role REPLACE checkbox (you can't hold a distinct training_admin row).
  describe('author + training-admin role exposure (WS1 / CHO-1870)', () => {
    const author: TenantMemberSummary = {
      gcid: 'gcid-author',
      email: 'writer@mtm.sg',
      display_name: 'Writer',
      roles: ['AUTHOR'],
      last_active_at: '2026-06-25T00:00:00Z',
    };

    function openInvite(fixture: ComponentFixture<MembersComponent>): void {
      (el(fixture).querySelector('[data-testid="invite-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('preserves an AUTHOR roster row instead of coercing it to learner', () => {
      const { fixture } = setup({ kind: 'success', rows: [author] });
      const row = el(fixture).querySelector(`[data-testid="member-row-${author.gcid}"]`);
      expect(row?.getAttribute('data-roles')).toBe('author');
      const authorBox = el(fixture).querySelector(
        `[data-testid="member-role-${author.gcid}-author"]`,
      ) as HTMLInputElement;
      expect(authorBox).toBeTruthy();
      expect(authorBox.checked).toBe(true);
      const learnerBox = el(fixture).querySelector(
        `[data-testid="member-role-${author.gcid}-learner"]`,
      ) as HTMLInputElement;
      expect(learnerBox.checked).toBe(false);
    });

    it('renders an author checkbox in the multi-role REPLACE editor', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] });
      expect(
        el(fixture).querySelector(`[data-testid="member-role-${anika.gcid}-author"]`),
      ).toBeTruthy();
    });

    it('renders learner/author/instructor/admin/auditor invite checkboxes', () => {
      const { fixture } = setup();
      openInvite(fixture);
      for (const role of ['learner', 'author', 'instructor', 'admin', 'auditor']) {
        expect(el(fixture).querySelector(`[data-testid="invite-role-${role}"]`)).toBeTruthy();
      }
      // The single-role <select> is retired (CHO-2206).
      expect(el(fixture).querySelector('[data-testid="invite-role"]')).toBeFalsy();
    });

    it('does NOT render a training_admin multi-role checkbox (instructor alias)', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] });
      expect(
        el(fixture).querySelector(`[data-testid="member-role-${anika.gcid}-training_admin"]`),
      ).toBeNull();
    });

    it('does NOT offer training_admin as an invite checkbox (instructor confers it at mint)', () => {
      const { fixture } = setup({ kind: 'success', rows: [] });
      openInvite(fixture);
      expect(el(fixture).querySelector('[data-testid="invite-role-training_admin"]')).toBeFalsy();
    });
  });

  describe('a11y + structure', () => {
    it('keeps the root testid + surface accent + single main + h1 + breadcrumb', () => {
      const { fixture } = setup();
      const root = el(fixture);
      const section = root.querySelector('[data-testid="hplus-members"]') as HTMLElement;
      expect(section).toBeTruthy();
      expect(section.classList.contains('surface-hplus')).toBe(true);
      expect(root.querySelectorAll('main').length).toBe(1);
      expect(root.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1);
      expect(root.querySelector('nav[aria-label]')).toBeTruthy();
    });

    it('labels every row role editor for screen readers (fieldset + aria-label)', () => {
      const { fixture } = setup();
      const fieldsets = el(fixture).querySelectorAll('.members__roles-fieldset');
      expect(fieldsets.length).toBe(2);
      fieldsets.forEach((f) => expect(f.getAttribute('aria-label')).toBeTruthy());
    });

    it('renders the invite modal as a labelled dialog', () => {
      const { fixture } = setup();
      (el(fixture).querySelector('[data-testid="invite-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const modal = el(fixture).querySelector('[data-testid="invite-modal"]');
      expect(modal?.getAttribute('role')).toBe('dialog');
      expect(modal?.getAttribute('aria-modal')).toBe('true');
      expect(modal?.getAttribute('aria-labelledby')).toBe('invite-modal-title');
    });

    it('has no critical/serious accessibility violations on the roster + panels', async () => {
      const invite: PendingInvite = {
        invite_id: 'i-axe',
        email: 'cold@mtm.sg',
        tenant_id: 't-1',
        roles: ['INSTRUCTOR'],
        status: 'pending',
        expires_at: '2026-07-25T00:00:00Z',
        created_at: '2026-06-25T00:00:00Z',
      };
      const { fixture } = setup(
        { kind: 'success', rows: [anika, dale] },
        { isOperator: true, invitesResult: { kind: 'success', invites: [invite] } },
      );
      // Open the invite modal so the operator selector is in the a11y sweep.
      (el(fixture).querySelector('[data-testid="invite-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(el(fixture));
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });

  // ── WS4a / ADR-194 D1 — operator cross-tenant target selector ────────
  describe('operator target-tenant selector (WS4a)', () => {
    function openModal(fixture: ComponentFixture<MembersComponent>): void {
      (el(fixture).querySelector('[data-testid="invite-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('hides the target-tenant selector for a non-operator admin', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] }, { isOperator: false });
      openModal(fixture);
      expect(el(fixture).querySelector('[data-testid="invite-target-tenant"]')).toBeNull();
    });

    it('shows the selector for an operator, listing chora-main + managed sub-tenants', () => {
      const { fixture } = setup(
        { kind: 'success', rows: [] },
        {
          isOperator: true,
          managedTenants: [{ id: 'tenant-acme', name: 'Acme Pte Ltd' }],
        },
      );
      openModal(fixture);
      const select = el(fixture).querySelector(
        '[data-testid="invite-target-tenant"]',
      ) as HTMLSelectElement;
      expect(select).toBeTruthy();
      const values = Array.from(select.options).map((o) => o.value);
      expect(values[0]).toBe(CHORA_MASTER_TENANT_ID); // chora-main default first
      expect(values).toContain('tenant-acme');
      // The managed sub-tenant option is labelled by name (the recursive
      // directory carries no member count).
      const acme = Array.from(select.options).find((o) => o.value === 'tenant-acme');
      expect(acme?.textContent).toContain('Acme Pte Ltd');
    });

    it('does not duplicate chora-master when it is also a managed sub-tenant', () => {
      const { fixture } = setup(
        { kind: 'success', rows: [] },
        {
          isOperator: true,
          managedTenants: [{ id: CHORA_MASTER_TENANT_ID, name: 'Chora main' }],
        },
      );
      openModal(fixture);
      const select = el(fixture).querySelector(
        '[data-testid="invite-target-tenant"]',
      ) as HTMLSelectElement;
      const masterOpts = Array.from(select.options).filter(
        (o) => o.value === CHORA_MASTER_TENANT_ID,
      );
      expect(masterOpts.length).toBe(1);
    });

    it('shows an empty state when the operator manages no sub-tenants', () => {
      const { fixture } = setup(
        { kind: 'success', rows: [] },
        { isOperator: true, managedTenants: [] },
      );
      openModal(fixture);
      expect(el(fixture).querySelector('[data-testid="no-managed-tenants"]')).toBeTruthy();
      // chora-main anchor remains selectable even with no managed sub-tenants.
      const select = el(fixture).querySelector(
        '[data-testid="invite-target-tenant"]',
      ) as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toEqual([CHORA_MASTER_TENANT_ID]);
    });

    it('surfaces a fail-loud error when the directory fetch fails', () => {
      const { fixture } = setup(
        { kind: 'success', rows: [] },
        {
          isOperator: true,
          managedTenantsResult: { kind: 'server-error' },
        },
      );
      openModal(fixture);
      expect(el(fixture).querySelector('[data-testid="managed-tenants-error"]')).toBeTruthy();
    });

    it('does not fetch managed tenants for a non-operator admin', () => {
      const { mocks } = setup({ kind: 'success', rows: [anika] }, { isOperator: false });
      expect(mocks.listManagedTenants).not.toHaveBeenCalled();
    });

    it('operator invite forwards the selected target tenant_id to createInvite', () => {
      const { fixture, mocks } = setup(
        { kind: 'success', rows: [] },
        {
          isOperator: true,
          managedTenants: [{ id: 'tenant-acme', name: 'Acme Pte Ltd' }],
        },
      );
      mocks.createInvite.mockReturnValue(
        of({ kind: 'granted', membership: grantedFixture } as CreateInviteResult),
      );
      openModal(fixture);
      // Pick the non-default managed sub-tenant.
      const select = el(fixture).querySelector(
        '[data-testid="invite-target-tenant"]',
      ) as HTMLSelectElement;
      select.value = 'tenant-acme';
      select.dispatchEvent(new Event('change'));
      const email = el(fixture).querySelector('[data-testid="invite-email"]') as HTMLInputElement;
      email.value = 'new@acme.sg';
      email.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (el(fixture).querySelector('[data-testid="invite-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(mocks.createInvite).toHaveBeenCalledWith('new@acme.sg', ['LEARNER'], 'tenant-acme');
    });

    it('defaults the operator target to chora-main', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [] }, { isOperator: true });
      mocks.createInvite.mockReturnValue(
        of({ kind: 'granted', membership: grantedFixture } as CreateInviteResult),
      );
      openModal(fixture);
      const email = el(fixture).querySelector('[data-testid="invite-email"]') as HTMLInputElement;
      email.value = 'new@mtm.sg';
      email.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (el(fixture).querySelector('[data-testid="invite-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(mocks.createInvite).toHaveBeenCalledWith(
        'new@mtm.sg',
        ['LEARNER'],
        CHORA_MASTER_TENANT_ID,
      );
    });
  });

  // ── WS4c / ADR-194 D2 — pending cold-invite list + revoke ────────────
  describe('pending cold-invites (WS4c)', () => {
    const invite: PendingInvite = {
      invite_id: 'i-1',
      email: 'cold@mtm.sg',
      tenant_id: 't-1',
      roles: ['INSTRUCTOR'],
      status: 'pending',
      expires_at: '2026-07-25T00:00:00Z',
      created_at: '2026-06-25T00:00:00Z',
    };

    it('does not render the panel when there are no pending invites', () => {
      const { fixture } = setup();
      expect(el(fixture).querySelector('[data-testid="pending-invites"]')).toBeNull();
    });

    it('renders a pending-invite row from listInvites()', () => {
      const { fixture, mocks } = setup(
        { kind: 'success', rows: [anika] },
        { invitesResult: { kind: 'success', invites: [invite] } },
      );
      expect(mocks.listInvites).toHaveBeenCalledTimes(1);
      expect(el(fixture).querySelector('[data-testid="pending-invites"]')).toBeTruthy();
      const row = el(fixture).querySelector('[data-testid="pending-row-i-1"]');
      expect(row).toBeTruthy();
      expect(row?.textContent).toContain('cold@mtm.sg');
    });

    it('suppresses the panel when the list endpoint is forbidden', () => {
      const { fixture } = setup(
        { kind: 'success', rows: [anika] },
        { invitesResult: { kind: 'forbidden' } },
      );
      expect(el(fixture).querySelector('[data-testid="pending-invites"]')).toBeNull();
    });

    it('revoke removes the row + toasts on success', () => {
      const { fixture, mocks } = setup(
        { kind: 'success', rows: [anika] },
        { invitesResult: { kind: 'success', invites: [invite] } },
      );
      mocks.revokeInvite.mockReturnValue(of({ kind: 'success' }));
      (
        el(fixture).querySelector('[data-testid="pending-revoke-i-1"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(mocks.revokeInvite).toHaveBeenCalledWith('i-1');
      expect(el(fixture).querySelector('[data-testid="pending-row-i-1"]')).toBeNull();
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.toast.inviteRevoked', 'success');
    });

    it('revoke of an already-gone invite (404) still drops the row', () => {
      const { fixture, mocks } = setup(
        { kind: 'success', rows: [anika] },
        { invitesResult: { kind: 'success', invites: [invite] } },
      );
      mocks.revokeInvite.mockReturnValue(of({ kind: 'not-found' }));
      (
        el(fixture).querySelector('[data-testid="pending-revoke-i-1"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(el(fixture).querySelector('[data-testid="pending-row-i-1"]')).toBeNull();
    });

    it('keeps the row + error-toasts on a failed revoke', () => {
      const { fixture, mocks } = setup(
        { kind: 'success', rows: [anika] },
        { invitesResult: { kind: 'success', invites: [invite] } },
      );
      mocks.revokeInvite.mockReturnValue(of({ kind: 'server-error' }));
      (
        el(fixture).querySelector('[data-testid="pending-revoke-i-1"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(el(fixture).querySelector('[data-testid="pending-row-i-1"]')).toBeTruthy();
      expect(mocks.toastShow).toHaveBeenCalledWith(
        'hplus.members.toast.inviteRevokeFailed',
        'error',
      );
    });
  });

  // ── WS4d / WS2b — remove member (confirm-gated soft-delete) ──────────
  describe('remove member (WS4d)', () => {
    it('renders a remove action per roster row', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] });
      expect(el(fixture).querySelector(`[data-testid="member-remove-${anika.gcid}"]`)).toBeTruthy();
    });

    it('confirm → removeMember + drops the row + toasts removed', async () => {
      const { fixture, mocks } = setup(
        { kind: 'success', rows: [anika, dale] },
        { confirmResult: true },
      );
      mocks.removeMember.mockReturnValue(of({ kind: 'success' }));
      (
        el(fixture).querySelector(
          `[data-testid="member-remove-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      // Await the confirm promise microtask before the BFF call resolves.
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
      expect(mocks.confirm).toHaveBeenCalledTimes(1);
      expect(mocks.removeMember).toHaveBeenCalledWith(anika.gcid);
      expect(el(fixture).querySelector(`[data-testid="member-row-${anika.gcid}"]`)).toBeNull();
      expect(el(fixture).querySelector(`[data-testid="member-row-${dale.gcid}"]`)).toBeTruthy();
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.toast.removed', 'success');
    });

    it('cancel → does NOT call removeMember', async () => {
      const { fixture, mocks } = setup(
        { kind: 'success', rows: [anika] },
        { confirmResult: false },
      );
      (
        el(fixture).querySelector(
          `[data-testid="member-remove-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
      expect(mocks.removeMember).not.toHaveBeenCalled();
      expect(el(fixture).querySelector(`[data-testid="member-row-${anika.gcid}"]`)).toBeTruthy();
    });

    it('a 404 remove drops the stale row + warns', async () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] }, { confirmResult: true });
      mocks.removeMember.mockReturnValue(of({ kind: 'not-found' }));
      (
        el(fixture).querySelector(
          `[data-testid="member-remove-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
      expect(el(fixture).querySelector(`[data-testid="member-row-${anika.gcid}"]`)).toBeNull();
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.toast.removeNotFound', 'error');
    });

    it('short-circuits a remove while the row is busy from another edit', async () => {
      const pending = new Subject<TenantMemberMutationResult>();
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      mocks.setDisplayName.mockReturnValue(pending.asObservable());
      // Start a display-name save → marks the row busy (roleBusyGcid).
      (
        el(fixture).querySelector(`[data-testid="member-name-${anika.gcid}"]`) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const input = el(fixture).querySelector(
        `[data-testid="member-name-input-${anika.gcid}"]`,
      ) as HTMLInputElement;
      input.value = 'Busy Name';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (
        el(fixture).querySelector(
          `[data-testid="member-name-save-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      // Row is busy → removeMember's entry guard returns before the confirm.
      await (
        fixture.componentInstance as unknown as {
          removeMember: (m: { gcid: string }) => Promise<void>;
        }
      ).removeMember({ gcid: anika.gcid });
      expect(mocks.confirm).not.toHaveBeenCalled();
      pending.complete();
    });
  });

  // ── Inline error branches for the rerouted invite (coverage) ─────────
  describe('invite inline error branches', () => {
    function submit(fixture: ComponentFixture<MembersComponent>, email: string): void {
      (el(fixture).querySelector('[data-testid="invite-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const input = el(fixture).querySelector('[data-testid="invite-email"]') as HTMLInputElement;
      input.value = email;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (el(fixture).querySelector('[data-testid="invite-submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    const cases: { kind: CreateInviteResult['kind']; key: string }[] = [
      { kind: 'invalid', key: 'hplus.members.error.invalid' },
      { kind: 'forbidden', key: 'hplus.members.error.forbidden' },
      { kind: 'server-error', key: 'hplus.members.error.server' },
    ];

    cases.forEach(({ kind, key }) => {
      it(`renders the inline ${kind} error and keeps the modal open`, () => {
        const { fixture, mocks } = setup({ kind: 'success', rows: [] });
        const result = (
          kind === 'invalid' ? { kind: 'invalid', code: 'X' } : { kind }
        ) as CreateInviteResult;
        mocks.createInvite.mockReturnValue(of(result));
        submit(fixture, 'x@mtm.sg');
        expect(el(fixture).querySelector('[data-testid="invite-error"]')?.textContent).toContain(
          key,
        );
        expect(el(fixture).querySelector('[data-testid="invite-modal"]')).toBeTruthy();
        // CHO-2206 walk feedback: every invite error also toasts.
        expect(mocks.toastShow).toHaveBeenCalledWith(key, 'error');
      });
    });
  });

  // ── Display-name inline editor (pre-existing; coverage) ──────────────
  describe('display-name inline editor', () => {
    function clickName(fixture: ComponentFixture<MembersComponent>, gcid: string): void {
      (
        el(fixture).querySelector(`[data-testid="member-name-${gcid}"]`) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
    }
    function typeName(
      fixture: ComponentFixture<MembersComponent>,
      gcid: string,
      value: string,
    ): void {
      const input = el(fixture).querySelector(
        `[data-testid="member-name-input-${gcid}"]`,
      ) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('enters edit mode and saves a new display name', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      mocks.setDisplayName.mockReturnValue(
        of({
          kind: 'success',
          member: { ...anika, display_name: 'Anika Tan' },
        } as TenantMemberMutationResult),
      );
      clickName(fixture, anika.gcid);
      typeName(fixture, anika.gcid, 'Anika Tan');
      (
        el(fixture).querySelector(
          `[data-testid="member-name-save-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(mocks.setDisplayName).toHaveBeenCalledWith(anika.gcid, 'Anika Tan');
      expect(
        el(fixture).querySelector(`[data-testid="member-name-${anika.gcid}"]`)?.textContent,
      ).toContain('Anika Tan');
      expect(mocks.toastShow).toHaveBeenCalledWith(
        'hplus.members.toast.displayNameSaved',
        'success',
      );
    });

    it('rejects an empty display name client-side', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      clickName(fixture, anika.gcid);
      typeName(fixture, anika.gcid, '   ');
      (
        el(fixture).querySelector(
          `[data-testid="member-name-save-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(mocks.setDisplayName).not.toHaveBeenCalled();
      expect(mocks.toastShow).toHaveBeenCalledWith(
        'hplus.members.toast.displayNameRequired',
        'error',
      );
    });

    it('an unchanged name just exits edit mode without a save', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      clickName(fixture, anika.gcid);
      // Draft seeded with current name; save without changing it.
      (
        el(fixture).querySelector(
          `[data-testid="member-name-save-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(mocks.setDisplayName).not.toHaveBeenCalled();
      expect(
        el(fixture).querySelector(`[data-testid="member-name-input-${anika.gcid}"]`),
      ).toBeNull();
    });

    it('cancel drops the draft + leaves edit mode', () => {
      const { fixture } = setup({ kind: 'success', rows: [anika] });
      clickName(fixture, anika.gcid);
      expect(
        el(fixture).querySelector(`[data-testid="member-name-input-${anika.gcid}"]`),
      ).toBeTruthy();
      (
        el(fixture).querySelector(
          `[data-testid="member-name-cancel-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        el(fixture).querySelector(`[data-testid="member-name-input-${anika.gcid}"]`),
      ).toBeNull();
    });

    it('error-toasts when the save fails', () => {
      const { fixture, mocks } = setup({ kind: 'success', rows: [anika] });
      mocks.setDisplayName.mockReturnValue(
        of({ kind: 'server-error' } as TenantMemberMutationResult),
      );
      clickName(fixture, anika.gcid);
      typeName(fixture, anika.gcid, 'Different');
      (
        el(fixture).querySelector(
          `[data-testid="member-name-save-${anika.gcid}"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(mocks.toastShow).toHaveBeenCalledWith(
        'hplus.members.toast.displayNameFailed',
        'error',
      );
    });
  });

  // ── Modal dismissal (escape + backdrop) ──────────────────────────────
  describe('invite modal dismissal', () => {
    it('closes on backdrop click but not on inner content click', () => {
      const { fixture } = setup();
      (el(fixture).querySelector('[data-testid="invite-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      // Click inner content — stays open.
      (el(fixture).querySelector('.members__invite') as HTMLElement).click();
      fixture.detectChanges();
      expect(el(fixture).querySelector('[data-testid="invite-modal"]')).toBeTruthy();
      // Click the backdrop itself — closes.
      (el(fixture).querySelector('[data-testid="invite-modal"]') as HTMLElement).click();
      fixture.detectChanges();
      expect(el(fixture).querySelector('[data-testid="invite-modal"]')).toBeFalsy();
    });

    it('closes on Escape', () => {
      const { fixture } = setup();
      (el(fixture).querySelector('[data-testid="invite-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.componentInstance as unknown as { onEscape: () => void }).onEscape();
      fixture.detectChanges();
      expect(el(fixture).querySelector('[data-testid="invite-modal"]')).toBeFalsy();
    });
  });
});
