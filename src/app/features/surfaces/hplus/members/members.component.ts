/**
 * H+ Members — L1 Tenant lane (CHO-1709): real chora-identity BFF wiring.
 *
 * The tenant admin reviews the TenantMembership roster (GET
 * /api/v1/admin/tenant-members — enriched USER projection per
 * identity-admin.yaml v1.4.0), adds members by email + role (POST), and
 * changes a member's role inline (PATCH {gcid}/role). Each row shows the
 * per-member GCID (Global Chora ID — opaque UUIDv7, cross-tenant portable
 * per `.claude/rules/ddd-enforcement.md` §9-10).
 *
 * Add-by-email targets EXISTING users — the 404 (must register first) and
 * 409 (already a member) business rejections render inline in the modal.
 * Membership REVOKE has no backend endpoint yet — named deferral on
 * CHO-1705 (no dead buttons rendered).
 */
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { RbacService } from '../../../../core/services/rbac.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { TenantMembersAdminService } from '../../../admin/tenant-admin/services/tenant-members-admin.service';
import {
  CHORA_MASTER_TENANT_ID,
  PendingInvite,
  TenantMemberRole,
  TenantMemberSummary,
} from '../../../admin/tenant-admin/models/tenant-members-admin.model';

/**
 * Roles the H+ members UI knows about. The first six are real
 * `membership_role` values the roster can return, `owner` since identity
 * migration 0041 (UX refactor R21); `training_admin` is a UI-only label the BE
 * resolves to `instructor` (role_catalog mig 0014), so it is offered ONLY as a
 * single-role invite option, never a server-returned chip nor a multi-role
 * REPLACE checkbox.
 *
 * `owner` is the mirror image: it IS server-returned and must render, but it
 * is never offered, because ownership is not admin-grantable. It appears in
 * KNOWN_ROLES and never in editableRoles.
 */
export type MemberRole =
  | 'learner'
  | 'author'
  | 'instructor'
  | 'admin'
  | 'auditor'
  | 'owner'
  | 'training_admin';

interface MemberVm {
  /** Row identity for @for track + testids — the member's GCID. */
  readonly id: string;
  readonly gcid: string;
  readonly displayName: string;
  readonly email: string;
  /**
   * All membership roles for this member (lowercased canonical tokens).
   * A single GCID can hold multiple rows in `chora_tenancy.members`
   * (e.g. `learner` + `instructor`) per CHO-1809's unique constraint
   * `(tenant_id, gcid, role)`. The template renders the full set as
   * chips; `primaryRole` drives the inline role-change `<select>` since
   * the existing PATCH `{gcid}/role` endpoint takes a single role and
   * REPLACES the row set (multi-role editing needs a separate BE
   * contract — out of this scope).
   */
  readonly roles: readonly MemberRole[];
  /** Convenience pointer to the first role — drives the row's `<select>`. */
  readonly primaryRole: MemberRole;
  /**
   * True when this member holds the tenant's `owner` row. Drives the badge and
   * disables the two destructive controls: ownership moves through the S7
   * handover, never through a role edit or a revoke.
   */
  readonly isOwner: boolean;
  readonly lastSeen: string;
}

type LoadState = 'loading' | 'ready' | 'error';
type InviteError =
  | 'user-not-found'
  | 'duplicate'
  | 'invalid'
  | 'forbidden'
  | 'server'
  | null;

/**
 * Pending-invites panel state. `hidden` = the list endpoint was forbidden /
 * unavailable (e.g. a tenant-less operator with no session tenant) — the
 * panel is suppressed rather than rendering an error block, since
 * pending-invite admin is tenant-scoped.
 */
type InvitesState = 'loading' | 'ready' | 'hidden';

/** Operator cross-tenant target-tenant option (WS4a). */
interface TargetTenant {
  readonly id: string;
  readonly name: string;
}

/** Load state for the operator's managed-sub-tenant hierarchy fetch. */
type HierarchyState = 'loading' | 'ready' | 'error';

// Real membership_role tokens the roster can return (lowercased), driving the
// toVm filter that guards against unknown/future tokens. `training_admin` is
// intentionally excluded: the BE stores it as `instructor`, so it is never a
// server-returned role (its inclusion would be dead code here).
//
// `owner` MUST be here. Without it toVm filters the owner out, finds an empty
// role list and falls back to ['learner'], so the first roster load after
// identity migration 0041 would render the owner of the organisation as a
// learner: confidently wrong, and worse than the invisible owner it replaced.
const KNOWN_ROLES: ReadonlySet<MemberRole> = new Set([
  'learner',
  'author',
  'instructor',
  'admin',
  'auditor',
  'owner',
]);

function isKnownRole(value: string): value is MemberRole {
  return KNOWN_ROLES.has(value as MemberRole);
}

function toVm(m: TenantMemberSummary): MemberVm {
  const roles = m.roles
    .map((r) => r.toLowerCase())
    .filter(isKnownRole);
  const safeRoles: readonly MemberRole[] = roles.length > 0 ? roles : ['learner'];
  return {
    id: m.gcid,
    gcid: m.gcid,
    displayName: m.display_name || '–',
    email: m.email,
    roles: safeRoles,
    primaryRole: safeRoles[0],
    isOwner: roles.includes('owner'),
    lastSeen: m.last_active_at,
  };
}

@Component({
  selector: 'chora-hplus-members',
  standalone: true,
  imports: [TranslatePipe, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
})
export class MembersComponent implements OnInit {
  private readonly membersApi = inject(TenantMembersAdminService);
  private readonly toast = inject(ToastService);
  private readonly rbac = inject(RbacService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly _state = signal<LoadState>('loading');
  private readonly _members = signal<readonly MemberVm[]>([]);
  private readonly _roleBusyGcid = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  readonly members = this._members.asReadonly();
  readonly roleBusyGcid = this._roleBusyGcid.asReadonly();
  readonly isEmpty = computed(
    () => this._state() === 'ready' && this._members().length === 0,
  );

  // ── Operator cross-tenant target selector (WS4a / ADR-194 D1) ────────
  // Shown ONLY when the session JWT carries `platform_operator` (the sole
  // cross-tenant principal, ADR-165). The read is reactive: hasRole() reads
  // the AuthService user() signal, so this recomputes on session change.
  readonly isOperator = computed(() => this.rbac.hasRole('platform_operator'));

  /** chora-master fixed UUID — exposed for the template's "Chora main" label. */
  readonly choraMasterId = CHORA_MASTER_TENANT_ID;

  // Managed sub-tenants (ADR-217) reachable by the operator, fetched live from
  // the recursive franchisee directory (GET /api/v1/admin/transactions/
  // franchisees) — chora-master's whole descendant subtree, independent of the
  // operator's current session tenant. NB /current/hierarchy is WRONG here: an
  // operator is a member of leaf franchises only, so that endpoint (the CURRENT
  // tenant's direct children) is always empty for them.
  private readonly _managedTenants = signal<readonly TargetTenant[]>([]);
  private readonly _hierarchyState = signal<HierarchyState>('loading');
  readonly hierarchyState = this._hierarchyState.asReadonly();

  /**
   * Operator target-tenant options: chora-master ("Chora main") as a stable
   * anchor (the platform tenant / onboarding target, WS6) followed by the
   * live managed sub-tenants from the hierarchy endpoint, deduped by id.
   */
  readonly targetTenants = computed<readonly TargetTenant[]>(() => {
    const out: TargetTenant[] = [
      { id: CHORA_MASTER_TENANT_ID, name: 'Chora main' },
    ];
    for (const t of this._managedTenants()) {
      if (!out.some((o) => o.id === t.id)) {
        out.push(t);
      }
    }
    return out;
  });

  /**
   * True once the hierarchy has loaded and the operator's parent tenant
   * manages no sub-tenants — drives the picker's empty state.
   */
  readonly hasNoManagedTenants = computed(
    () =>
      this._hierarchyState() === 'ready' && this._managedTenants().length === 0,
  );

  private readonly _targetTenantId = signal<string>(CHORA_MASTER_TENANT_ID);
  readonly targetTenantId = this._targetTenantId.asReadonly();

  onTargetTenantChange(event: Event): void {
    this._targetTenantId.set((event.target as HTMLSelectElement).value);
  }

  /**
   * Fetch the operator's managed tenants (franchises) for the invite-target
   * picker, from the recursive franchisee directory. Called from ngOnInit only
   * when the session is a platform operator. Fails loud: a non-success result
   * surfaces via the picker's error hint rather than silently showing an empty
   * list.
   */
  loadManagedTenants(): void {
    this._hierarchyState.set('loading');
    this.membersApi.listManagedTenants().subscribe((res) => {
      if (res.kind === 'success') {
        this._managedTenants.set(
          res.tenants.map((t) => ({ id: t.id, name: t.name })),
        );
        this._hierarchyState.set('ready');
        return;
      }
      this._managedTenants.set([]);
      this._hierarchyState.set('error');
    });
  }

  // Assignable membership roles for the multi-role invite checkbox group
  // (CHO-2206), shared with the CHO-1817 REPLACE editor. No `training_admin`
  // alias: instructor already confers the training_admin label at mint, so a
  // distinct checkbox would be redundant / indistinguishable from instructor.
  readonly editableRoles: readonly MemberRole[] = [
    'learner',
    'author',
    'instructor',
    'admin',
    'auditor',
  ];

  // ── Invite modal state ───────────────────────────────────────────────
  private readonly _showInvite = signal(false);
  private readonly _inviteEmail = signal('');
  // CHO-2206 — multi-role invite: the set of checked roles (default learner).
  // The BE (POST /tenant-invites) already accepts roles[] and grants every one.
  private readonly _inviteRoles = signal<ReadonlySet<MemberRole>>(new Set(['learner']));
  private readonly _inviteBusy = signal(false);
  private readonly _inviteError = signal<InviteError>(null);

  readonly showInvite = this._showInvite.asReadonly();
  readonly inviteEmail = this._inviteEmail.asReadonly();
  readonly inviteRoles = this._inviteRoles.asReadonly();
  readonly inviteBusy = this._inviteBusy.asReadonly();
  readonly inviteError = this._inviteError.asReadonly();

  // Submit needs a non-empty email AND ≥1 role (roles[] is required by the BE).
  readonly canSubmitInvite = computed(
    () =>
      this._inviteEmail().trim().length > 0 &&
      this._inviteRoles().size > 0 &&
      !this._inviteBusy(),
  );

  isInviteRoleSelected(role: MemberRole): boolean {
    return this._inviteRoles().has(role);
  }

  toggleInviteRole(role: MemberRole, checked: boolean): void {
    const next = new Set(this._inviteRoles());
    if (checked) {
      next.add(role);
    } else {
      next.delete(role);
    }
    this._inviteRoles.set(next);
  }

  ngOnInit(): void {
    this.load();
    this.loadInvites();
    // Only the cross-tenant operator uses the managed-sub-tenant picker.
    if (this.isOperator()) {
      this.loadManagedTenants();
    }
  }

  load(): void {
    this._state.set('loading');
    this.membersApi.roster().subscribe((res) => {
      if (res.kind === 'success') {
        this._members.set(res.rows.map(toVm));
        this._state.set('ready');
        return;
      }
      this._state.set('error');
    });
  }

  openInvite(): void {
    this._inviteEmail.set('');
    this._inviteRoles.set(new Set(['learner']));
    this._inviteError.set(null);
    this._showInvite.set(true);
  }

  cancelInvite(): void {
    this._showInvite.set(false);
  }

  onInviteEmailInput(event: Event): void {
    this._inviteEmail.set((event.target as HTMLInputElement).value);
    this._inviteError.set(null);
  }

  /**
   * Add-member action, routed through the unified cold-invite endpoint
   * (`POST /tenant-invites`, ADR-194 D2) which retires the old 404
   * user-not-found dead-end. An existing email is granted now
   * (`kind:'granted'`); a never-registered email becomes a pending invite
   * (`kind:'invited'`) auto-applied at first sign-in. When the caller is a
   * platform_operator the selected target tenant rides in the body
   * (operator cross-tenant path, D1); a tenant-admin omits it so the BFF
   * scopes from the session JWT.
   */
  submitInvite(): void {
    if (!this.canSubmitInvite()) return;
    const email = this._inviteEmail().trim();
    // Multi-role (CHO-2206): emit every checked role, in editableRoles order so
    // the payload is deterministic. The BE canonicalises + grants all of them.
    const selected = this._inviteRoles();
    const roles: readonly TenantMemberRole[] = this.editableRoles
      .filter((r) => selected.has(r))
      .map((r) => r.toUpperCase() as TenantMemberRole);
    // Operator → always target the selected tenant (a tenant-less operator
    // has no session tenant to scope from). Tenant-admin → omit (session).
    const targetTenant = this.isOperator() ? this._targetTenantId() : undefined;
    this._inviteBusy.set(true);
    this._inviteError.set(null);
    this.membersApi.createInvite(email, roles, targetTenant).subscribe((res) => {
      this._inviteBusy.set(false);
      switch (res.kind) {
        case 'granted':
          this._showInvite.set(false);
          this.toast.show('hplus.members.toast.added', 'success');
          // Refresh the roster truthfully: a same-tenant grant appears; an
          // operator cross-tenant grant correctly does NOT show in THIS
          // tenant's roster (the response carries no email/display_name, so
          // a re-fetch is the honest way to surface the new member).
          this.load();
          return;
        case 'invited':
          this._showInvite.set(false);
          this.toast.show('hplus.members.toast.invited', 'success');
          // Surface the new pending invite immediately (tenant-scoped list).
          if (this._invitesState() !== 'hidden') {
            this._invites.update((list) => [res.invite, ...list]);
            this._invitesState.set('ready');
          }
          return;
        case 'duplicate':
          // Keep the inline reason (modal stays open to correct) AND surface a
          // toast — otherwise a re-submit reads as "nothing happened" (CHO-2206
          // walk feedback fix). Warning: not a hard failure, the person exists.
          this._inviteError.set('duplicate');
          this.toast.show('hplus.members.error.duplicate', 'warning');
          return;
        case 'invalid':
          this._inviteError.set('invalid');
          this.toast.show('hplus.members.error.invalid', 'error');
          return;
        case 'forbidden':
          this._inviteError.set('forbidden');
          this.toast.show('hplus.members.error.forbidden', 'error');
          return;
        default:
          this._inviteError.set('server');
          this.toast.show('hplus.members.error.server', 'error');
      }
    });
  }

  inviteErrorKey(): string {
    switch (this._inviteError()) {
      case 'user-not-found':
        return 'hplus.members.error.userNotFound';
      case 'duplicate':
        return 'hplus.members.error.duplicate';
      case 'invalid':
        return 'hplus.members.error.invalid';
      case 'forbidden':
        return 'hplus.members.error.forbidden';
      default:
        return 'hplus.members.error.server';
    }
  }

  // ── Pending cold-invites (WS4c / ADR-194 D2) ─────────────────────────
  private readonly _invites = signal<readonly PendingInvite[]>([]);
  private readonly _invitesState = signal<InvitesState>('loading');
  private readonly _revokeBusyId = signal<string | null>(null);

  readonly invites = this._invites.asReadonly();
  readonly invitesState = this._invitesState.asReadonly();
  readonly revokeBusyId = this._revokeBusyId.asReadonly();

  /** True when there is at least one pending invite to render. */
  readonly hasPendingInvites = computed(
    () => this._invitesState() === 'ready' && this._invites().length > 0,
  );

  loadInvites(): void {
    this._invitesState.set('loading');
    this.membersApi.listInvites().subscribe((res) => {
      if (res.kind === 'success') {
        this._invites.set(res.invites);
        this._invitesState.set('ready');
        return;
      }
      // Forbidden / tenant-less operator / transport error → suppress the
      // panel rather than render an error block (pending-invite admin is
      // tenant-scoped; a missing list is not actionable here).
      this._invites.set([]);
      this._invitesState.set('hidden');
    });
  }

  revokePendingInvite(invite: PendingInvite): void {
    this._revokeBusyId.set(invite.invite_id);
    this.membersApi.revokeInvite(invite.invite_id).subscribe((res) => {
      this._revokeBusyId.set(null);
      if (res.kind === 'success' || res.kind === 'not-found') {
        // 404 ⇒ already gone (revoked/accepted elsewhere) — drop it locally
        // either way so the list never lies.
        this._invites.update((list) =>
          list.filter((i) => i.invite_id !== invite.invite_id),
        );
        this.toast.show('hplus.members.toast.inviteRevoked', 'success');
        return;
      }
      this.toast.show('hplus.members.toast.inviteRevokeFailed', 'error');
    });
  }

  // ── Remove member (WS4d / WS2b) ──────────────────────────────────────
  /**
   * Remove a member from the current tenant — soft-deletes all their roles
   * (DELETE /tenant-members/{gcid}). Confirm-gated; on success the row is
   * dropped optimistically. A 404 (already gone / cross-tenant) also drops
   * the row but flags it so the admin knows the roster was stale.
   */
  async removeMember(member: MemberVm): Promise<void> {
    if (this._roleBusyGcid() === member.gcid) return;
    if (member.isOwner) {
      // The button is disabled, so this is the second line: a stale roster, a
      // keyboard path or a future template edit must not be able to ask for
      // something the server will refuse. Not a confirm dialog either: there
      // is nothing to confirm.
      this.toast.show('hplus.members.owner.cannotRemove', 'error');
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'hplus.members.remove.confirmTitle',
      message: 'hplus.members.remove.confirmMessage',
      confirmText: 'hplus.members.remove.confirm',
      cancelText: 'hplus.members.remove.cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    this._roleBusyGcid.set(member.gcid);
    this.membersApi.removeMember(member.gcid).subscribe((res) => {
      this._roleBusyGcid.set(null);
      if (res.kind === 'success') {
        this._members.update((list) =>
          list.filter((m) => m.gcid !== member.gcid),
        );
        this.toast.show('hplus.members.toast.removed', 'success');
        return;
      }
      if (res.kind === 'not-found') {
        this._members.update((list) =>
          list.filter((m) => m.gcid !== member.gcid),
        );
        this.toast.show('hplus.members.toast.removeNotFound', 'error');
        return;
      }
      if (res.kind === 'owner-protected') {
        // Reachable without a stale UI: another admin can hand ownership over
        // between this roster load and this click. The row STAYS: dropping it
        // is how an admin ends up believing an organisation has no owner.
        this.toast.show('hplus.members.owner.cannotRemove', 'error');
        this.load();
        return;
      }
      this.toast.show('hplus.members.toast.removeFailed', 'error');
    });
  }

  onRowRoleChange(gcid: string, event: Event): void {
    const next = (event.target as HTMLSelectElement).value as MemberRole;
    const prev = this._members().find((m) => m.gcid === gcid)?.primaryRole;
    if (!prev || prev === next) return;
    this._roleBusyGcid.set(gcid);
    this.membersApi
      .changeRole(gcid, next.toUpperCase() as TenantMemberRole)
      .subscribe((res) => {
        this._roleBusyGcid.set(null);
        if (res.kind === 'success') {
          const updated = toVm(res.member);
          this._members.update((list) =>
            list.map((m) => (m.gcid === gcid ? updated : m)),
          );
          this.toast.show('hplus.members.toast.roleChanged', 'success');
          return;
        }
        this.toast.show('hplus.members.toast.roleChangeFailed', 'error');
        // Re-sync with the server so the select never lies.
        this.load();
      });
  }

  // ── Display-name inline editor (CHO-1817 follow-up) ──────────────────
  // Active edit state — at most one row in edit mode at a time. `null`
  // when no row is being edited; otherwise carries the row's gcid and
  // the draft string (so the input keeps focus + value across renders).
  private readonly _editingName = signal<{ gcid: string; draft: string } | null>(null);
  readonly editingName = this._editingName.asReadonly();

  isEditingName(member: MemberVm): boolean {
    return this._editingName()?.gcid === member.gcid;
  }

  /** Switch the row into name-edit mode, seeded with the current name. */
  beginEditName(member: MemberVm): void {
    if (this._roleBusyGcid() === member.gcid) return;
    this._editingName.set({
      gcid: member.gcid,
      draft: member.displayName === '–' ? '' : member.displayName,
    });
  }

  /** Update the in-flight draft as the admin types. */
  onEditNameInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this._editingName.update((s) => (s ? { ...s, draft: value } : s));
  }

  /** Drop the draft + leave edit mode. */
  cancelEditName(): void {
    this._editingName.set(null);
  }

  /**
   * Save the draft. Empty names are rejected client-side (BE will reject
   * too — belt + braces). On success the row's displayName updates and
   * the input collapses back to display mode.
   */
  saveEditName(member: MemberVm): void {
    const draft = this._editingName()?.draft.trim() ?? '';
    if (!draft) {
      this.toast.show('hplus.members.toast.displayNameRequired', 'error');
      return;
    }
    if (draft === member.displayName) {
      this.cancelEditName();
      return;
    }
    this._roleBusyGcid.set(member.gcid);
    this.membersApi.setDisplayName(member.gcid, draft).subscribe((res) => {
      this._roleBusyGcid.set(null);
      if (res.kind === 'success') {
        // The BE display-name handler returns roles=[] (editor doesn't
        // touch role state) — preserve the existing role chips by
        // only patching the displayName field on the VM.
        this._members.update((list) =>
          list.map((m) =>
            m.gcid === member.gcid
              ? { ...m, displayName: res.member.display_name || '–' }
              : m,
          ),
        );
        this.cancelEditName();
        this.toast.show('hplus.members.toast.displayNameSaved', 'success');
        return;
      }
      this.toast.show('hplus.members.toast.displayNameFailed', 'error');
    });
  }

  // ── Multi-role editor (CHO-1809) ─────────────────────────────────────
  // Per-row draft state — a set of role tokens the admin has toggled but
  // not yet saved. Keyed by gcid so several rows can be in dirty state
  // independently. A row is "dirty" iff its draft set differs from the
  // server's `roles`.
  private readonly _draftRoles = signal<Record<string, readonly MemberRole[]>>({});

  /** Roles the editor SHOULD show as checked for the given row. */
  effectiveRoles(member: MemberVm): readonly MemberRole[] {
    return this._draftRoles()[member.gcid] ?? member.roles;
  }

  /** True when the row's draft set differs from the server set. */
  isRowDirty(member: MemberVm): boolean {
    const draft = this._draftRoles()[member.gcid];
    if (!draft) return false;
    if (draft.length !== member.roles.length) return true;
    const serverSet = new Set(member.roles);
    return draft.some((r) => !serverSet.has(r));
  }

  /** Toggle a single role in the row's draft set. */
  toggleRole(member: MemberVm, role: MemberRole, checked: boolean): void {
    const current = this.effectiveRoles(member);
    const next = checked
      ? current.includes(role)
        ? current
        : [...current, role]
      : current.filter((r) => r !== role);
    this._draftRoles.update((m) => ({ ...m, [member.gcid]: next }));
  }

  /** Drop the draft + revert the row's checkboxes to server state. */
  cancelRoleEdit(member: MemberVm): void {
    this._draftRoles.update((m) => {
      const next = { ...m };
      delete next[member.gcid];
      return next;
    });
  }

  /**
   * Save the row's draft via PUT /tenant-members/{gcid}/roles. The BE
   * REPLACES the role set on both stores; the response carries the
   * canonical post-replace roster row.
   */
  saveRoleEdit(member: MemberVm): void {
    if (member.isOwner) {
      // Same reasoning as removeMember: the fieldset is disabled, this is the
      // guard. `owner` is not in editableRoles, so any set this screen could
      // build would drop it.
      this.toast.show('hplus.members.owner.cannotChangeRoles', 'error');
      return;
    }
    const draft = this.effectiveRoles(member);
    if (!draft.length) {
      // Empty role set isn't a valid state; force the admin to pick at
      // least one role (BE would reject with IDENTITY_INVALID_ROLE).
      this.toast.show('hplus.members.toast.atLeastOneRole', 'error');
      return;
    }
    this._roleBusyGcid.set(member.gcid);
    const upper = draft.map((r) => r.toUpperCase() as TenantMemberRole);
    this.membersApi.setRoles(member.gcid, upper).subscribe((res) => {
      this._roleBusyGcid.set(null);
      if (res.kind === 'success') {
        const updated = toVm(res.member);
        this._members.update((list) =>
          list.map((m) => (m.gcid === member.gcid ? updated : m)),
        );
        this.cancelRoleEdit(member);
        this.toast.show('hplus.members.toast.rolesSaved', 'success');
        return;
      }
      if (res.kind === 'owner-protected') {
        this.toast.show('hplus.members.owner.cannotChangeRoles', 'error');
        this.load();
        return;
      }
      this.toast.show('hplus.members.toast.roleChangeFailed', 'error');
      this.load();
    });
  }

  roleLabelKey(role: MemberRole): string {
    return `hplus.members.role.${role}`;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this._showInvite()) this._showInvite.set(false);
  }

  handleBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) this.cancelInvite();
  }
}
