/**
 * RlsContextViewerComponent — View current RLS session context and test tenant isolation.
 *
 * Route: /admin/developer/rls-context
 *
 * Features:
 *   - Display current tenant context (tenant_id, gcid, role, capabilities)
 *   - List all applied RLS policies with type and expression
 *   - Run tenant isolation tests across tables
 *   - Show test results with pass/fail status and execution time
 *   - Role-gated: super_admin only
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
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { DeveloperService } from '../../services/developer.service';
import { RLS_POLICY_TYPE_LABELS } from '../../models/developer.model';

@Component({
  selector: 'chora-rls-context-viewer',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './rls-context-viewer.component.html',
  styleUrl: './rls-context-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RlsContextViewerComponent implements OnInit, OnDestroy {
  private readonly developerService = inject(DeveloperService);
  private readonly toast = inject(ToastService);

  // --- Delegated signals ---
  readonly contextState = this.developerService.rlsContextState;
  readonly rlsContext = this.developerService.rlsContext;
  readonly testState = this.developerService.rlsTestState;
  readonly testResults = this.developerService.rlsTestResults;

  // --- Local state ---
  readonly expandedPolicyIndex = signal<number | null>(null);
  readonly testRunning = signal(false);

  // --- Constants ---
  readonly policyTypeLabels = RLS_POLICY_TYPE_LABELS;

  // --- Computed ---
  readonly policyCount = computed(() => {
    const ctx = this.rlsContext();
    return ctx ? ctx.rls_policies_applied.length : 0;
  });

  readonly enabledPolicyCount = computed(() => {
    const ctx = this.rlsContext();
    if (!ctx) return 0;
    return ctx.rls_policies_applied.filter((p) => p.enabled).length;
  });

  readonly capabilityCount = computed(() => {
    const ctx = this.rlsContext();
    return ctx ? ctx.capabilities.length : 0;
  });

  readonly allTestsPassed = computed(() => {
    const results = this.testResults();
    if (results.length === 0) return false;
    return results.every((r) => r.isolated && r.error === null);
  });

  readonly testPassCount = computed(
    () => this.testResults().filter((r) => r.isolated && r.error === null).length,
  );

  readonly testFailCount = computed(
    () => this.testResults().filter((r) => !r.isolated || r.error !== null).length,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.developerService.loadRlsContext().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.developerService.resetRlsState();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  runIsolationTest(): void {
    this.testRunning.set(true);
    this.subscriptions.add(
      this.developerService.testIsolation().subscribe({
        next: (results) => {
          this.testRunning.set(false);
          if (results) {
            const failed = results.filter((r) => !r.isolated || r.error !== null);
            if (failed.length === 0) {
              this.toast.show('admin.developer.rls_test_passed', 'success');
            } else {
              this.toast.show('admin.developer.rls_test_failed', 'error');
            }
          }
        },
        error: () => {
          this.testRunning.set(false);
          this.toast.show('admin.developer.rls_test_error', 'error');
        },
      }),
    );
  }

  refresh(): void {
    this.subscriptions.add(
      this.developerService.loadRlsContext().subscribe(),
    );
  }

  togglePolicyExpand(index: number): void {
    this.expandedPolicyIndex.update((current) =>
      current === index ? null : index,
    );
  }

  isPolicyExpanded(index: number): boolean {
    return this.expandedPolicyIndex() === index;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  policyTypeClass(type: string): string {
    return `rls-context-viewer__policy-type--${type}`;
  }

  testResultClass(result: { isolated: boolean; error: string | null }): string {
    if (result.error !== null) return 'rls-context-viewer__test-result--error';
    return result.isolated
      ? 'rls-context-viewer__test-result--pass'
      : 'rls-context-viewer__test-result--fail';
  }

  testResultLabel(result: { isolated: boolean; error: string | null }): string {
    if (result.error !== null) return 'admin.developer.rls_error';
    return result.isolated
      ? 'admin.developer.rls_isolated'
      : 'admin.developer.rls_not_isolated';
  }

  formatSessionStart(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByTable(_index: number, item: { table_name: string }): string {
    return item.table_name;
  }
}
