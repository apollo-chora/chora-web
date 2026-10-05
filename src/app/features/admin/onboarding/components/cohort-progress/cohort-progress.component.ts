/**
 * CohortProgressComponent — Admin data table for monitoring onboarding
 * checklist completion across cohorts of learners.
 *
 * Route: admin/onboarding/cohorts
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
import { DatePipe, NgClass } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { OnboardingAdminService } from '../../services/onboarding-admin.service';
import type {
  CohortLearner,
  CohortStatus,
} from '../../models/onboarding.model';
import { COHORT_STATUS_LABELS } from '../../models/onboarding.model';

@Component({
  selector: 'chora-cohort-progress',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe, NgClass],
  templateUrl: './cohort-progress.component.html',
  styleUrl: './cohort-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CohortProgressComponent implements OnInit, OnDestroy {
  private readonly onboardingAdmin = inject(OnboardingAdminService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly cohortState = this.onboardingAdmin.cohortState;
  readonly searchQuery = signal('');
  readonly cohortFilter = signal<string>('');
  readonly selectedGcids = signal<Set<string>>(new Set());
  readonly sendingReminder = signal(false);

  // --- Constants ---
  readonly statusLabels = COHORT_STATUS_LABELS;

  // --- Computed ---
  readonly cohortProgress = computed(() => {
    const state = this.cohortState();
    return state.status === 'success' ? state.data : null;
  });

  readonly learners = computed(() => this.cohortProgress()?.learners ?? []);

  readonly filteredLearners = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    let learners = this.learners();

    if (query) {
      learners = learners.filter(
        (l) =>
          l.display_name.toLowerCase().includes(query) ||
          l.email.toLowerCase().includes(query),
      );
    }

    return learners;
  });

  readonly allSelected = computed(() => {
    const filtered = this.filteredLearners();
    if (filtered.length === 0) return false;
    const selected = this.selectedGcids();
    return filtered.every((l) => selected.has(l.gcid));
  });

  readonly selectedCount = computed(() => this.selectedGcids().size);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadCohortProgress();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  loadCohortProgress(): void {
    const filter = this.cohortFilter() || undefined;
    this.subscriptions.add(
      this.onboardingAdmin.getCohortProgress(filter).subscribe(),
    );
  }

  onCohortFilterChange(templateId: string): void {
    this.cohortFilter.set(templateId);
    this.selectedGcids.set(new Set());
    this.loadCohortProgress();
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  toggleSelectAll(): void {
    const filtered = this.filteredLearners();
    if (this.allSelected()) {
      this.selectedGcids.set(new Set());
    } else {
      this.selectedGcids.set(new Set(filtered.map((l) => l.gcid)));
    }
  }

  toggleSelect(gcid: string): void {
    this.selectedGcids.update((current) => {
      const next = new Set(current);
      if (next.has(gcid)) {
        next.delete(gcid);
      } else {
        next.add(gcid);
      }
      return next;
    });
  }

  isSelected(gcid: string): boolean {
    return this.selectedGcids().has(gcid);
  }

  // ---------------------------------------------------------------------------
  // Bulk Actions
  // ---------------------------------------------------------------------------

  sendReminder(): void {
    const gcids = [...this.selectedGcids()];
    if (gcids.length === 0) return;

    this.sendingReminder.set(true);
    this.subscriptions.add(
      this.onboardingAdmin.sendReminder(gcids).subscribe({
        next: (result) => {
          this.sendingReminder.set(false);
          if (result) {
            this.toast.show('admin.onboarding.reminder_sent', 'success');
            this.selectedGcids.set(new Set());
          } else {
            this.toast.show('admin.onboarding.reminder_error', 'error');
          }
        },
        error: () => {
          this.sendingReminder.set(false);
          this.toast.show('admin.onboarding.reminder_error', 'error');
        },
      }),
    );
  }

  exportCsv(): void {
    const templateId = this.cohortProgress()?.template_id;
    if (!templateId) return;

    this.subscriptions.add(
      this.onboardingAdmin.exportCohortCsv(templateId).subscribe({
        next: (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `cohort-progress-${templateId}.csv`;
            link.click();
            URL.revokeObjectURL(url);
            this.toast.show('admin.onboarding.export_success', 'success');
          }
        },
        error: () => {
          this.toast.show('admin.onboarding.export_error', 'error');
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  getStatusClass(status: CohortStatus): string {
    switch (status) {
      case 'on_track':
        return 'cohort-progress__status--on-track';
      case 'at_risk':
        return 'cohort-progress__status--at-risk';
      case 'overdue':
        return 'cohort-progress__status--overdue';
    }
  }

  trackByGcid(_index: number, learner: CohortLearner): string {
    return learner.gcid;
  }
}
