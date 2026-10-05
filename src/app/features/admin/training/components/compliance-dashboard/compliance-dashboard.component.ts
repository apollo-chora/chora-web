/**
 * ComplianceDashboardComponent — Department rollup table with red/amber/green
 * status badges, deadline countdown, and auto-schedule remediation.
 *
 * Route: /admin/training/compliance
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
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { Subscription } from 'rxjs';
import {
  TrainingAdminService,
  type ComplianceDepartment,
} from '../../services/training-admin.service';

@Component({
  selector: 'chora-compliance-dashboard',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './compliance-dashboard.component.html',
  styleUrl: './compliance-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComplianceDashboardComponent implements OnInit, OnDestroy {
  private readonly trainingService = inject(TrainingAdminService);

  readonly complianceState = this.trainingService.complianceState;
  readonly complianceData = this.trainingService.complianceData;

  readonly remediatingDept = signal<string | null>(null);

  readonly departments = computed(
    () => this.complianceData()?.departments ?? [],
  );
  readonly overallCompletion = computed(
    () => this.complianceData()?.overall_completion_pct ?? 0,
  );
  readonly totalOverdue = computed(
    () => this.complianceData()?.total_overdue ?? 0,
  );
  readonly nextDeadline = computed(
    () => this.complianceData()?.next_deadline ?? '',
  );

  readonly complianceError = computed(() => {
    const s = this.complianceState();
    return s.status === 'error' ? s.error.message : '';
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.trainingService.loadCompliance().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.trainingService.resetState();
  }

  scheduleRemediation(dept: ComplianceDepartment): void {
    this.remediatingDept.set(dept.department_id);

    this.subscriptions.add(
      this.trainingService
        .scheduleRemediation(dept.department_id)
        .subscribe({
          next: () => {
            this.remediatingDept.set(null);
            // Reload data
            this.subscriptions.add(
              this.trainingService.loadCompliance().subscribe(),
            );
          },
          error: () => this.remediatingDept.set(null),
        }),
    );
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'green':
        return 'compliance-dashboard__badge--green';
      case 'amber':
        return 'compliance-dashboard__badge--amber';
      case 'red':
        return 'compliance-dashboard__badge--red';
      default:
        return '';
    }
  }

  formatDate(isoString: string): string {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  }

  isRemediating(departmentId: string): boolean {
    return this.remediatingDept() === departmentId;
  }
}
