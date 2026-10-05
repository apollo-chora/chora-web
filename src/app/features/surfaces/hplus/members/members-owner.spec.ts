/**
 * MembersComponent, ownership (S7-B8 / UX refactor R21).
 *
 * Two things this screen has to get right, and today it does neither.
 *
 * 1. The owner must be VISIBLE. Ownership is a real row in
 *    chora_tenancy.members and, since identity migration 0041, in the mirror
 *    the roster reads. Before this change KNOWN_ROLES was a five-value
 *    allowlist without `owner`, and toVm filtered unknown roles out then fell
 *    back to ['learner']. So the first roster load after the migration would
 *    have rendered the owner of the organisation as a LEARNER. That is worse
 *    than the old invisible-owner bug, because it is confidently wrong.
 *
 * 2. The owner must not be strippable from this screen. The backend now
 *    refuses with 409 and a named code, so nothing can actually be destroyed;
 *    the point of the UI work is that an admin should not be offered an action
 *    the server will refuse, and when a refusal does arrive (a stale roster,
 *    another admin's change) it must read as an ownership message rather than
 *    as "already a member" or "server error", which is where a bare 409 lands
 *    in the two existing classifiers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { MembersComponent } from './members.component';
import { TenantMembersAdminService } from '../../../admin/tenant-admin/services/tenant-members-admin.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { RbacService } from '../../../../core/services/rbac.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  AdminAckResult,
  TenantMemberMutationResult,
  TenantMembersListResult,
  TenantMemberSummary,
} from '../../../admin/tenant-admin/models/tenant-members-admin.model';

const owner: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-0000000000aa',
  email: 'owner@mtm.sg',
  display_name: 'Wei Ling',
  roles: ['OWNER', 'ADMIN'],
  last_active_at: '2026-09-02T09:00:00Z',
};

const member: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-0000000000bb',
  email: 'anika@mtm.sg',
  display_name: 'Anika',
  roles: ['INSTRUCTOR'],
  last_active_at: '2026-09-02T08:00:00Z',
};

interface OwnerMocks {
  setRoles: ReturnType<typeof vi.fn>;
  removeMember: ReturnType<typeof vi.fn>;
  toastShow: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
}

function setupOwner(opts: {
  rows?: readonly TenantMemberSummary[];
  setRolesResult?: TenantMemberMutationResult;
  removeResult?: AdminAckResult;
} = {}): { fixture: ComponentFixture<MembersComponent>; mocks: OwnerMocks } {
  const roster: TenantMembersListResult = {
    kind: 'success',
    rows: [...(opts.rows ?? [owner, member])],
  };
  const mocks: OwnerMocks = {
    setRoles: vi.fn(() => of(opts.setRolesResult ?? ({ kind: 'success', member } as TenantMemberMutationResult))),
    removeMember: vi.fn(() => of(opts.removeResult ?? ({ kind: 'success' } as AdminAckResult))),
    toastShow: vi.fn(),
    confirm: vi.fn(() => Promise.resolve(true)),
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
          roster: vi.fn(() => of(roster)),
          add: vi.fn(),
          changeRole: vi.fn(),
          setRoles: mocks.setRoles,
          setDisplayName: vi.fn(),
          createInvite: vi.fn(),
          listInvites: vi.fn(() => of({ kind: 'success', invites: [] })),
          revokeInvite: vi.fn(),
          removeMember: mocks.removeMember,
          listManagedTenants: vi.fn(() => of({ kind: 'success', tenants: [] })),
        },
      },
      { provide: ToastService, useValue: { show: mocks.toastShow } },
      { provide: RbacService, useValue: { hasRole: vi.fn(() => false) } },
      { provide: ConfirmDialogService, useValue: { confirm: mocks.confirm } },
    ],
  });
  const fixture = TestBed.createComponent(MembersComponent);
  fixture.detectChanges();
  return { fixture, mocks };
}

function root(fixture: ComponentFixture<MembersComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('MembersComponent ownership (S7-B8)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  describe('the owner is visible', () => {
    it('keeps the owner role instead of filtering it out and defaulting to learner', () => {
      const { fixture } = setupOwner();
      const row = root(fixture).querySelector(`[data-testid="member-row-${owner.gcid}"]`);
      expect(row).toBeTruthy();
      const roles = row!.getAttribute('data-roles') ?? '';
      expect(roles).toContain('owner');
      expect(roles).not.toContain('learner');
    });

    it('marks the owner row distinctly', () => {
      const { fixture } = setupOwner();
      expect(
        root(fixture).querySelector(`[data-testid="member-owner-badge-${owner.gcid}"]`),
      ).toBeTruthy();
      expect(
        root(fixture).querySelector(`[data-testid="member-owner-badge-${member.gcid}"]`),
      ).toBeFalsy();
    });

    it('does not offer owner as a grantable role chip', () => {
      // Ownership is not admin-grantable: rendering a checkbox for it would
      // promise something every layer below refuses.
      const { fixture } = setupOwner();
      expect(
        root(fixture).querySelector(`[data-testid="member-role-${member.gcid}-owner"]`),
      ).toBeFalsy();
    });
  });

  describe('ownership cannot be stripped from the roster', () => {
    it('disables the role editor on the owner row and leaves it live elsewhere', () => {
      const { fixture } = setupOwner();
      const ownerFieldset = root(fixture).querySelector(
        `[data-testid="member-roles-${owner.gcid}"]`,
      ) as HTMLFieldSetElement | null;
      const memberFieldset = root(fixture).querySelector(
        `[data-testid="member-roles-${member.gcid}"]`,
      ) as HTMLFieldSetElement | null;
      expect(ownerFieldset?.disabled).toBe(true);
      expect(memberFieldset?.disabled).toBe(false);
    });

    it('disables remove on the owner row and leaves it live elsewhere', () => {
      const { fixture } = setupOwner();
      const ownerRemove = root(fixture).querySelector(
        `[data-testid="member-remove-${owner.gcid}"]`,
      ) as HTMLButtonElement | null;
      const memberRemove = root(fixture).querySelector(
        `[data-testid="member-remove-${member.gcid}"]`,
      ) as HTMLButtonElement | null;
      expect(ownerRemove?.disabled).toBe(true);
      expect(memberRemove?.disabled).toBe(false);
    });

    it('refuses a programmatic role save on the owner without calling the API', () => {
      // The disabled fieldset is the courtesy; this is the guard. A stale
      // roster, a keyboard path or a future template change must not be able
      // to post a role set that drops ownership.
      const { fixture, mocks } = setupOwner();
      const cmp = fixture.componentInstance;
      const ownerVm = cmp.members().find((m) => m.gcid === owner.gcid)!;
      cmp.saveRoleEdit(ownerVm);
      expect(mocks.setRoles).not.toHaveBeenCalled();
      expect(mocks.toastShow).toHaveBeenCalledWith(
        'hplus.members.owner.cannotChangeRoles',
        'error',
      );
    });

    it('refuses a programmatic remove of the owner without calling the API', async () => {
      const { fixture, mocks } = setupOwner();
      const cmp = fixture.componentInstance;
      const ownerVm = cmp.members().find((m) => m.gcid === owner.gcid)!;
      await cmp.removeMember(ownerVm);
      expect(mocks.removeMember).not.toHaveBeenCalled();
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.owner.cannotRemove', 'error');
    });
  });

  describe('a server ownership refusal reads as an ownership problem', () => {
    it('names the refusal when a role save is rejected', () => {
      // Reachable in real life: the roster is a snapshot, and another admin
      // can hand ownership over between the load and the save.
      const { fixture, mocks } = setupOwner({
        setRolesResult: { kind: 'owner-protected', reason: 'owner-role' },
      });
      const cmp = fixture.componentInstance;
      const memberVm = cmp.members().find((m) => m.gcid === member.gcid)!;
      cmp.saveRoleEdit(memberVm);
      expect(mocks.setRoles).toHaveBeenCalled();
      expect(mocks.toastShow).toHaveBeenCalledWith(
        'hplus.members.owner.cannotChangeRoles',
        'error',
      );
      expect(mocks.toastShow).not.toHaveBeenCalledWith(
        'hplus.members.toast.roleChangeFailed',
        'error',
      );
    });

    it('names the refusal when a remove is rejected', async () => {
      const { fixture, mocks } = setupOwner({
        removeResult: { kind: 'owner-protected', reason: 'last-owner' },
      });
      const cmp = fixture.componentInstance;
      const memberVm = cmp.members().find((m) => m.gcid === member.gcid)!;
      await cmp.removeMember(memberVm);
      expect(mocks.removeMember).toHaveBeenCalled();
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.members.owner.cannotRemove', 'error');
      expect(mocks.toastShow).not.toHaveBeenCalledWith(
        'hplus.members.toast.removeFailed',
        'error',
      );
    });

    it('keeps the refused row on the roster', async () => {
      // The optimistic drop on a successful remove must not fire here: the
      // member is still there, and a roster that lies is how an admin ends up
      // believing an organisation has no owner.
      const { fixture } = setupOwner({
        removeResult: { kind: 'owner-protected', reason: 'last-owner' },
      });
      const cmp = fixture.componentInstance;
      const memberVm = cmp.members().find((m) => m.gcid === member.gcid)!;
      await cmp.removeMember(memberVm);
      fixture.detectChanges();
      expect(
        root(fixture).querySelector(`[data-testid="member-row-${member.gcid}"]`),
      ).toBeTruthy();
    });
  });
});
