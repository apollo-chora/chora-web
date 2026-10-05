/**
 * AccountDashboardComponent — Admin account lifecycle management dashboard.
 *
 * Route: /admin/accounts
 *
 * Features:
 *   - Account list with state badges (active/suspended/pending_deletion/deleted)
 *   - Filter by account state
 *   - Search by name/email
 *   - Suspend/reactivate actions
 *   - Admin close account with reason dialog
 *   - Navigation to lifecycle event log
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
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  errorCodeOf,
  httpErrorView,
} from '../../../../../core/interceptors/api-error.model';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AccountLifecycleService } from '../../services/account-lifecycle.service';
import type { AdminAccount, AccountState } from '../../models/account-lifecycle.model';
import {
  ALL_ACCOUNT_STATES,
  ACCOUNT_STATE_LABELS,
} from '../../models/account-lifecycle.model';

@Component({
  selector: 'chora-account-dashboard',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './account-dashboard.component.html',
  styleUrl: './account-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDashboardComponent implements OnInit, OnDestroy {
  private readonly accountService = inject(AccountLifecycleService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly accounts = signal<AdminAccount[]>([]);
  readonly loading = signal(false);
  readonly totalAccounts = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = signal(25);
  readonly searchQuery = signal('');

  // --- Filters ---
  readonly filterState = signal<AccountState | null>(null);

  // --- Close Account Dialog ---
  readonly closeDialogVisible = signal(false);
  readonly closeTargetAccount = signal<AdminAccount | null>(null);
  readonly closeReason = signal('');
  readonly closeLoading = signal(false);

  // --- Suspend Dialog ---
  readonly suspendDialogVisible = signal(false);
  readonly suspendTargetAccount = signal<AdminAccount | null>(null);
  readonly suspendReason = signal('');
  readonly suspendLoading = signal(false);

  // --- Constants ---
  readonly allStates = ALL_ACCOUNT_STATES;
  readonly stateLabels = ACCOUNT_STATE_LABELS;

  // --- Computed ---
  readonly isEmpty = computed(
    () => !this.loading() && this.accounts().length === 0,
  );

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalAccounts() / this.pageSize())),
  );

  // --- Summary stats ---
  readonly activeCount = computed(() =>
    this.accounts().filter((a) => a.state === 'active').length,
  );
  readonly suspendedCount = computed(() =>
    this.accounts().filter((a) => a.state === 'suspended').length,
  );
  readonly pendingDeletionCount = computed(() =>
    this.accounts().filter((a) => a.state === 'pending_deletion').length,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadAccounts();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadAccounts(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.accountService.getAccounts(
        this.currentPage(),
        this.pageSize(),
        this.filterState() ?? undefined,
        this.searchQuery() || undefined,
      ).subscribe({
        next: (response) => {
          this.accounts.set(response.accounts);
          this.totalAccounts.set(response.total);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.account_lifecycle.accounts_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Search & Filter
  // -------------------------------------------------------------------------

  onSearch(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
    this.loadAccounts();
  }

  onStateFilter(value: string): void {
    this.filterState.set(value === '' ? null : value as AccountState);
    this.currentPage.set(1);
    this.loadAccounts();
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadAccounts();
  }

  // -------------------------------------------------------------------------
  // Suspend Account
  // -------------------------------------------------------------------------

  openSuspendDialog(account: AdminAccount): void {
    this.suspendTargetAccount.set(account);
    this.suspendReason.set('');
    this.suspendDialogVisible.set(true);
  }

  closeSuspendDialog(): void {
    this.suspendDialogVisible.set(false);
    this.suspendTargetAccount.set(null);
    this.suspendReason.set('');
  }

  onSuspendReasonInput(value: string): void {
    this.suspendReason.set(value);
  }

  confirmSuspend(): void {
    const account = this.suspendTargetAccount();
    const reason = this.suspendReason();
    if (!account || !reason.trim()) return;

    this.suspendLoading.set(true);

    this.subscriptions.add(
      this.accountService.suspendAccount({ gcid: account.gcid, reason: reason.trim() }).subscribe({
        next: () => {
          this.toast.show('admin.account_lifecycle.account_suspended', 'success');
          this.suspendLoading.set(false);
          this.closeSuspendDialog();
          this.loadAccounts();
        },
        error: () => {
          this.toast.show('admin.account_lifecycle.suspend_error', 'error');
          this.suspendLoading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Reactivate Account
  // -------------------------------------------------------------------------

  async reactivateAccount(account: AdminAccount): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.account_lifecycle.reactivate_title',
      message: 'admin.account_lifecycle.reactivate_message',
      confirmText: 'admin.account_lifecycle.reactivate_confirm',
      variant: 'info',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.accountService.reactivateAccount(account.gcid).subscribe({
        next: () => {
          this.toast.show('admin.account_lifecycle.account_reactivated', 'success');
          this.loadAccounts();
        },
        error: () => {
          this.toast.show('admin.account_lifecycle.reactivate_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Close Account (Admin)
  // -------------------------------------------------------------------------

  openCloseDialog(account: AdminAccount): void {
    this.closeTargetAccount.set(account);
    this.closeReason.set('');
    // A refusal from a previous attempt does not survive the dialog opening
    // again, or a stale organisation name would sit over a fresh account.
    this.closeOwnedTenants.set([]);
    this.closeOwnsTenantBlock.set(false);
    this.closeDialogVisible.set(true);
  }

  closeCloseDialog(): void {
    this.closeDialogVisible.set(false);
    this.closeTargetAccount.set(null);
    this.closeReason.set('');
  }

  onCloseReasonInput(value: string): void {
    this.closeReason.set(value);
  }

  /**
   * S7d. The organisations the target still owns, when the gateway refuses the
   * closure with CLOSURE_OWNS_TENANT (first-launch spec 13.7.2).
   *
   * A signal rather than a toast, and the dialog stays open behind it: the
   * operator's next step is a handover, and a message that vanishes cannot
   * carry the organisation's name or a link to the screen that unblocks it.
   */
  readonly closeOwnedTenants = signal<readonly ClosureOwnedTenant[]>([]);

  /**
   * Whether the refusal fired at all, kept separately from the list. The code
   * is what says "ownership blocked"; the list is what lets the copy name the
   * organisation. A refusal that arrived with no list still has to render,
   * because the block is real either way and an empty list is not an absent
   * refusal.
   */
  readonly closeOwnsTenantBlock = signal<boolean>(false);

  confirmCloseAccount(): void {
    this.closeOwnedTenants.set([]);
    this.closeOwnsTenantBlock.set(false);
    const account = this.closeTargetAccount();
    const reason = this.closeReason();
    if (!account || !reason.trim()) return;

    this.closeLoading.set(true);

    this.subscriptions.add(
      this.accountService.closeAccount({ gcid: account.gcid, reason: reason.trim() }).subscribe({
        next: () => {
          this.toast.show('admin.account_lifecycle.account_closed', 'success');
          this.closeLoading.set(false);
          this.closeCloseDialog();
          this.loadAccounts();
        },
        error: (err: unknown) => {
          this.closeLoading.set(false);
          const owned = ownedTenantsFromRefusal(err);
          if (owned !== null) {
            // Named, inline and persistent. No toast: this one has an action.
            this.closeOwnedTenants.set(owned);
            this.closeOwnsTenantBlock.set(true);
            return;
          }
          this.toast.show('admin.account_lifecycle.close_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  stateClass(state: AccountState): string {
    return `account-dashboard__state-badge--${state}`;
  }

  canSuspend(account: AdminAccount): boolean {
    return account.state === 'active';
  }

  canReactivate(account: AdminAccount): boolean {
    return account.state === 'suspended';
  }

  canClose(account: AdminAccount): boolean {
    return account.state === 'active' || account.state === 'suspended';
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}

/**
 * One organisation the closing account still owns, as the gateway's refusal
 * carries it. `tenant_slug` is chora-tenancy's slug (or the hyphenated tenant
 * name when no slug is set); it is an identifier, not a display name, so it is
 * printed verbatim rather than humanised back into a title.
 */
export interface ClosureOwnedTenant {
  readonly tenant_id: string;
  readonly tenant_slug: string;
}

/**
 * Read the ownership refusal out of a failed close, or null when the failure
 * is something else.
 *
 * Keyed on the envelope CODE, not the status: a 409 on this route can also be
 * "a saga already exists", and treating every conflict as an ownership block
 * would tell an operator to run a handover that changes nothing.
 *
 * Goes through httpErrorView because app.config.ts installs errorInterceptor,
 * which rethrows failures as ApiError; an `instanceof HttpErrorResponse` branch
 * here would be unreachable in production while passing in a bare spec harness
 * (the E1 item 4b defect).
 */
export function ownedTenantsFromRefusal(err: unknown): readonly ClosureOwnedTenant[] | null {
  const view = httpErrorView(err);
  if (errorCodeOf(view) !== 'CLOSURE_OWNS_TENANT') return null;
  const body = view?.body as { error?: { owned_tenants?: unknown } } | undefined;
  const rows = body?.error?.owned_tenants;
  if (!Array.isArray(rows)) {
    // The code said ownership, so the block is right even when the list did
    // not arrive. An empty list still renders the refusal and its link; it
    // just cannot name the organisation.
    return [];
  }
  return rows
    .filter((r): r is ClosureOwnedTenant => typeof r === 'object' && r !== null)
    .map((r) => ({
      tenant_id: String((r as ClosureOwnedTenant).tenant_id ?? ''),
      tenant_slug: String((r as ClosureOwnedTenant).tenant_slug ?? ''),
    }));
}
