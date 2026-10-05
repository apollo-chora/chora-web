/**
 * DecisionPanelComponent — Reviewer interface for admission decisions.
 * Shows applications queue, per-application detail with evidence preview,
 * and approve/reject/defer actions with bulk mode support.
 *
 * Route: admin/admissions/review
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
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { AdmissionAdminService } from '../../services/admission-admin.service';
import type {
  ApplicationSummary,
  ApplicationDetail,
  DecisionType,
  RejectReasonCode,
} from '../../models/admission.model';
import {
  REJECT_REASON_LABELS,
  ALL_REJECT_REASONS,
  STAGE_TYPE_LABELS,
} from '../../models/admission.model';

@Component({
  selector: 'chora-decision-panel',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe],
  templateUrl: './decision-panel.component.html',
  styleUrl: './decision-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionPanelComponent implements OnInit, OnDestroy {
  private readonly admissionAdmin = inject(AdmissionAdminService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly loadingDetail = signal(false);
  readonly deciding = signal(false);
  readonly applications = signal<ApplicationSummary[]>([]);
  readonly selectedApplication = signal<ApplicationDetail | null>(null);
  readonly selectedApplicationId = signal<string | null>(null);
  readonly bulkMode = signal(false);
  readonly bulkSelected = signal<Set<string>>(new Set());
  readonly rejectReasonCode = signal<RejectReasonCode | null>(null);
  readonly rejectReasonDetail = signal('');
  readonly reviewerNote = signal('');
  readonly addingNote = signal(false);

  // --- Constants ---
  readonly rejectReasonLabels = REJECT_REASON_LABELS;
  readonly allRejectReasons = ALL_REJECT_REASONS;
  readonly stageTypeLabels = STAGE_TYPE_LABELS;

  // --- Computed ---
  readonly bulkSelectedCount = computed(() => this.bulkSelected().size);
  readonly hasSelection = computed(() => this.selectedApplication() !== null);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadApplications();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Applications Queue
  // ---------------------------------------------------------------------------

  loadApplications(): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.admissionAdmin.getApplications().subscribe({
        next: (apps) => {
          if (apps) {
            this.applications.set(apps);
          }
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.admissions.applications_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  selectApplication(app: ApplicationSummary): void {
    if (this.bulkMode()) return;

    this.selectedApplicationId.set(app.id);
    this.loadingDetail.set(true);

    this.subscriptions.add(
      this.admissionAdmin.getApplicationDetail(app.id).subscribe({
        next: (detail) => {
          if (detail) {
            this.selectedApplication.set(detail);
          }
          this.loadingDetail.set(false);
        },
        error: () => {
          this.toast.show('admin.admissions.detail_load_error', 'error');
          this.loadingDetail.set(false);
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Bulk Mode
  // ---------------------------------------------------------------------------

  toggleBulkMode(): void {
    this.bulkMode.update((m) => !m);
    if (!this.bulkMode()) {
      this.bulkSelected.set(new Set());
    }
  }

  toggleBulkSelect(appId: string): void {
    this.bulkSelected.update((current) => {
      const next = new Set(current);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }

  isBulkSelected(appId: string): boolean {
    return this.bulkSelected().has(appId);
  }

  // ---------------------------------------------------------------------------
  // Decisions
  // ---------------------------------------------------------------------------

  makeDecision(decision: DecisionType): void {
    if (this.bulkMode()) {
      this.makeBulkDecision(decision);
      return;
    }

    const app = this.selectedApplication();
    if (!app) return;

    this.deciding.set(true);
    const reasonCode =
      decision === 'rejected' ? this.rejectReasonCode() : null;
    const reasonDetail =
      decision === 'rejected' ? this.rejectReasonDetail() || null : null;

    this.subscriptions.add(
      this.admissionAdmin
        .recordDecision(app.id, decision, reasonCode, reasonDetail)
        .subscribe({
          next: (result) => {
            this.deciding.set(false);
            if (result) {
              this.toast.show('admin.admissions.decision_recorded', 'success');
              this.selectedApplication.set(null);
              this.selectedApplicationId.set(null);
              this.resetDecisionForm();
              this.loadApplications();
            } else {
              this.toast.show('admin.admissions.decision_error', 'error');
            }
          },
          error: () => {
            this.deciding.set(false);
            this.toast.show('admin.admissions.decision_error', 'error');
          },
        }),
    );
  }

  private makeBulkDecision(decision: DecisionType): void {
    const ids = Array.from(this.bulkSelected());
    if (ids.length === 0) return;

    this.deciding.set(true);
    const reasonCode =
      decision === 'rejected' ? this.rejectReasonCode() : null;
    const reasonDetail =
      decision === 'rejected' ? this.rejectReasonDetail() || null : null;

    this.subscriptions.add(
      this.admissionAdmin
        .bulkDecision({
          application_ids: ids,
          decision,
          reason_code: reasonCode,
          reason_detail: reasonDetail,
        })
        .subscribe({
          next: (result) => {
            this.deciding.set(false);
            if (result) {
              this.toast.show('admin.admissions.bulk_decision_recorded', 'success');
              this.bulkSelected.set(new Set());
              this.resetDecisionForm();
              this.loadApplications();
            } else {
              this.toast.show('admin.admissions.decision_error', 'error');
            }
          },
          error: () => {
            this.deciding.set(false);
            this.toast.show('admin.admissions.decision_error', 'error');
          },
        }),
    );
  }

  // ---------------------------------------------------------------------------
  // Reviewer Notes
  // ---------------------------------------------------------------------------

  addNote(): void {
    const app = this.selectedApplication();
    const note = this.reviewerNote().trim();
    if (!app || !note) return;

    this.addingNote.set(true);
    this.subscriptions.add(
      this.admissionAdmin.addReviewerNote(app.id, note).subscribe({
        next: (result) => {
          this.addingNote.set(false);
          if (result) {
            this.selectedApplication.update((current) => {
              if (!current) return current;
              return {
                ...current,
                reviewer_notes: [...current.reviewer_notes, result],
              };
            });
            this.reviewerNote.set('');
          }
        },
        error: () => {
          this.addingNote.set(false);
          this.toast.show('admin.admissions.note_error', 'error');
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resetDecisionForm(): void {
    this.rejectReasonCode.set(null);
    this.rejectReasonDetail.set('');
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'in_progress':
        return 'decision-panel__status--in-progress';
      case 'under_review':
        return 'decision-panel__status--under-review';
      case 'decided':
        return 'decision-panel__status--decided';
      case 'withdrawn':
        return 'decision-panel__status--withdrawn';
      default:
        return 'decision-panel__status--default';
    }
  }

  trackByAppId(_index: number, app: ApplicationSummary): string {
    return app.id;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
