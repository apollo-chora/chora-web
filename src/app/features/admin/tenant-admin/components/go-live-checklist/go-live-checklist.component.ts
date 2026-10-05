/**
 * GoLiveChecklistComponent — Automated verification runner for go-live
 * readiness with per-test status tracking and overall score.
 *
 * Route: admin/tenant/settings/go-live
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import type { GoLiveTest, GoLiveTestStatus } from '../../models/tenant-lifecycle.model';

interface GoLiveTestDefinition {
  id: string;
  name: string;
  description: string;
  endpoint: string;
}

const TEST_DEFINITIONS: GoLiveTestDefinition[] = [
  {
    id: 'identity_provider',
    name: 'admin.go_live.test_identity_provider',
    description: 'admin.go_live.test_identity_provider_desc',
    endpoint: '/api/v1/tenants/go-live/test/identity',
  },
  {
    id: 'content_visibility',
    name: 'admin.go_live.test_content_visibility',
    description: 'admin.go_live.test_content_visibility_desc',
    endpoint: '/api/v1/tenants/go-live/test/content',
  },
  {
    id: 'dns_branding',
    name: 'admin.go_live.test_dns_branding',
    description: 'admin.go_live.test_dns_branding_desc',
    endpoint: '/api/v1/tenants/go-live/test/branding',
  },
  {
    id: 'payment_gateway',
    name: 'admin.go_live.test_payment_gateway',
    description: 'admin.go_live.test_payment_gateway_desc',
    endpoint: '/api/v1/tenants/go-live/test/payment',
  },
  {
    id: 'admin_user',
    name: 'admin.go_live.test_admin_user',
    description: 'admin.go_live.test_admin_user_desc',
    endpoint: '/api/v1/tenants/go-live/test/admin-user',
  },
];

@Component({
  selector: 'chora-go-live-checklist',
  standalone: true,
  imports: [TranslatePipe, NgClass],
  templateUrl: './go-live-checklist.component.html',
  styleUrl: './go-live-checklist.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoLiveChecklistComponent implements OnInit {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly tests = signal<GoLiveTest[]>([]);
  readonly runningAll = signal(false);

  // --- Computed ---
  readonly passedCount = computed(
    () => this.tests().filter((t) => t.status === 'passed').length,
  );

  readonly totalCount = computed(() => this.tests().length);

  readonly readinessScore = computed(() => {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.passedCount() / total) * 100);
  });

  readonly allPassed = computed(
    () => this.passedCount() === this.totalCount() && this.totalCount() > 0,
  );

  readonly hasRunningTest = computed(
    () => this.tests().some((t) => t.status === 'running'),
  );

  ngOnInit(): void {
    this.initializeTests();
  }

  // ---------------------------------------------------------------------------
  // Initialize
  // ---------------------------------------------------------------------------

  private initializeTests(): void {
    const initial: GoLiveTest[] = TEST_DEFINITIONS.map((def) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      status: 'pending' as GoLiveTestStatus,
      error_detail: null,
      last_run_at: null,
    }));
    this.tests.set(initial);
  }

  // ---------------------------------------------------------------------------
  // Run Tests
  // ---------------------------------------------------------------------------

  async runAllTests(): Promise<void> {
    this.runningAll.set(true);

    for (const def of TEST_DEFINITIONS) {
      await this.runSingleTest(def);
    }

    this.runningAll.set(false);

    if (this.allPassed()) {
      this.toast.show('admin.go_live.all_passed', 'success');
    } else {
      this.toast.show('admin.go_live.some_failed', 'warning');
    }
  }

  async runTest(testId: string): Promise<void> {
    const def = TEST_DEFINITIONS.find((d) => d.id === testId);
    if (!def) return;
    await this.runSingleTest(def);
  }

  private async runSingleTest(def: GoLiveTestDefinition): Promise<void> {
    this.updateTestStatus(def.id, 'running', null);

    try {
      const result = await new Promise<{ passed: boolean; error?: string }>(
        (resolve, reject) => {
          this.bff
            .post<{ passed: boolean; error?: string }>(def.endpoint, {})
            .subscribe({
              next: (res) => resolve(res),
              error: (err: Error) => reject(err),
            });
        },
      );

      if (result.passed) {
        this.updateTestStatus(def.id, 'passed', null);
      } else {
        this.updateTestStatus(def.id, 'failed', result.error ?? null);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.updateTestStatus(def.id, 'failed', error);
    }
  }

  private updateTestStatus(
    testId: string,
    status: GoLiveTestStatus,
    errorDetail: string | null,
  ): void {
    this.tests.update((current) =>
      current.map((t) =>
        t.id === testId
          ? {
              ...t,
              status,
              error_detail: errorDetail,
              last_run_at: new Date().toISOString(),
            }
          : t,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  getStatusIcon(status: GoLiveTestStatus): string {
    switch (status) {
      case 'pending':
        return 'radio_button_unchecked';
      case 'running':
        return 'sync';
      case 'passed':
        return 'check_circle';
      case 'failed':
        return 'error';
    }
  }

  getStatusClass(status: GoLiveTestStatus): string {
    switch (status) {
      case 'pending':
        return 'go-live-checklist__status--pending';
      case 'running':
        return 'go-live-checklist__status--running';
      case 'passed':
        return 'go-live-checklist__status--passed';
      case 'failed':
        return 'go-live-checklist__status--failed';
    }
  }

  trackByTestId(_index: number, test: GoLiveTest): string {
    return test.id;
  }
}
