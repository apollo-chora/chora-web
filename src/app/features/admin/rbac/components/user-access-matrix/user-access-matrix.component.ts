/**
 * UserAccessMatrixComponent — Tenant admin UI for viewing and managing user roles.
 *
 * Route: /admin/rbac
 *
 * Features:
 *   - Table of tenant users with multi-role badges
 *   - Role assignment dialog (dropdown of 11 roles)
 *   - Role revocation with confirmation
 *   - Effective permissions preview on role click
 *   - Search/filter users
 *   - Role-gated: tenant_admin capability required
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { RbacAdminService } from '../../services/rbac-admin.service';
import type {
  TenantUser,
  RbacRole,
  RoleCapabilities,
  EffectivePermission,
} from '../../models/rbac.model';
import {
  ALL_RBAC_ROLES,
  ROLE_LABELS,
} from '../../models/rbac.model';

@Component({
  selector: 'chora-user-access-matrix',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './user-access-matrix.component.html',
  styleUrl: './user-access-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAccessMatrixComponent implements OnInit, OnDestroy {
  private readonly rbacAdmin = inject(RbacAdminService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly users = signal<TenantUser[]>([]);
  readonly loading = signal(false);
  readonly totalUsers = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = signal(25);
  readonly searchQuery = signal('');

  // --- Role Capabilities (for permission preview) ---
  readonly roleCapabilities = signal<RoleCapabilities[]>([]);
  readonly capabilitiesLoading = signal(false);

  // --- Permission Preview ---
  readonly previewUserId = signal<string | null>(null);
  readonly previewPermissions = signal<EffectivePermission[]>([]);
  readonly previewLoading = signal(false);
  readonly previewRole = signal<RbacRole | null>(null);

  // --- Role Assignment Dialog ---
  readonly assignDialogVisible = signal(false);
  readonly assignTargetUser = signal<TenantUser | null>(null);
  readonly assignSelectedRole = signal<RbacRole | null>(null);
  readonly assignLoading = signal(false);

  // --- Constants ---
  readonly allRoles = ALL_RBAC_ROLES;
  readonly roleLabels = ROLE_LABELS;

  // --- Computed ---
  readonly isEmpty = computed(
    () => !this.loading() && this.users().length === 0,
  );

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalUsers() / this.pageSize())),
  );

  readonly availableRolesForAssignment = computed(() => {
    const user = this.assignTargetUser();
    if (!user) return ALL_RBAC_ROLES;
    return ALL_RBAC_ROLES.filter((r) => !user.roles.includes(r));
  });

  readonly previewRoleCapabilities = computed(() => {
    const role = this.previewRole();
    if (!role) return [];
    const match = this.roleCapabilities().find((rc) => rc.role === role);
    return match?.capabilities ?? [];
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadUsers();
    this.loadCapabilities();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadUsers(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.rbacAdmin.getUsers(this.currentPage(), this.pageSize(), this.searchQuery() || undefined).subscribe({
        next: (response) => {
          this.users.set(response.users);
          this.totalUsers.set(response.total);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.rbac.users_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  private loadCapabilities(): void {
    this.capabilitiesLoading.set(true);

    this.subscriptions.add(
      this.rbacAdmin.getCapabilities().subscribe({
        next: (caps) => {
          this.roleCapabilities.set(caps);
          this.capabilitiesLoading.set(false);
        },
        error: () => {
          this.capabilitiesLoading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  onSearch(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
    this.loadUsers();
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadUsers();
  }

  // -------------------------------------------------------------------------
  // Permission Preview
  // -------------------------------------------------------------------------

  showPermissionPreview(user: TenantUser): void {
    if (this.previewUserId() === user.gcid) {
      this.closePermissionPreview();
      return;
    }

    this.previewUserId.set(user.gcid);
    this.previewLoading.set(true);
    this.previewRole.set(null);

    this.subscriptions.add(
      this.rbacAdmin.getEffectivePermissions(user.gcid).subscribe({
        next: (response) => {
          this.previewPermissions.set(response.permissions);
          this.previewLoading.set(false);
        },
        error: () => {
          this.toast.show('admin.rbac.permissions_load_error', 'error');
          this.previewLoading.set(false);
        },
      }),
    );
  }

  closePermissionPreview(): void {
    this.previewUserId.set(null);
    this.previewPermissions.set([]);
    this.previewRole.set(null);
  }

  onRoleClick(role: RbacRole): void {
    this.previewRole.set(this.previewRole() === role ? null : role);
  }

  isPreviewOpen(gcid: string): boolean {
    return this.previewUserId() === gcid;
  }

  // -------------------------------------------------------------------------
  // Role Assignment Dialog
  // -------------------------------------------------------------------------

  openAssignDialog(user: TenantUser): void {
    this.assignTargetUser.set(user);
    this.assignSelectedRole.set(null);
    this.assignDialogVisible.set(true);
  }

  closeAssignDialog(): void {
    this.assignDialogVisible.set(false);
    this.assignTargetUser.set(null);
    this.assignSelectedRole.set(null);
  }

  onAssignRoleSelect(value: string): void {
    this.assignSelectedRole.set(value === '' ? null : value as RbacRole);
  }

  confirmAssignRole(): void {
    const user = this.assignTargetUser();
    const role = this.assignSelectedRole();
    if (!user || !role) return;

    this.assignLoading.set(true);

    this.subscriptions.add(
      this.rbacAdmin.assignRole({ gcid: user.gcid, role }).subscribe({
        next: () => {
          this.toast.show('admin.rbac.role_assigned', 'success');
          this.assignLoading.set(false);
          this.closeAssignDialog();
          this.loadUsers();
        },
        error: () => {
          this.toast.show('admin.rbac.role_assign_error', 'error');
          this.assignLoading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Role Revocation
  // -------------------------------------------------------------------------

  async revokeRole(user: TenantUser, role: RbacRole): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.rbac.revoke_title',
      message: 'admin.rbac.revoke_message',
      confirmText: 'admin.rbac.revoke_confirm',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.rbacAdmin.revokeRole(user.gcid, role).subscribe({
        next: () => {
          this.toast.show('admin.rbac.role_revoked', 'success');
          this.loadUsers();
        },
        error: () => {
          this.toast.show('admin.rbac.role_revoke_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  roleClass(role: string): string {
    return `user-access-matrix__role-badge--${role}`;
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  trackByGcid(_index: number, user: TenantUser): string {
    return user.gcid;
  }
}
