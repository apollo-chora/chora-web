/**
 * PipelinePublicationComponent — Publication confirmation modal/page for
 * admins to publish a pipeline template with scheduling and cohort notification.
 *
 * Route: admin/admissions/templates/:id/publish
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
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { AdmissionAdminService } from '../../services/admission-admin.service';
import type { PipelineTemplate } from '../../models/admission.model';
import { STAGE_TYPE_LABELS } from '../../models/admission.model';

@Component({
  selector: 'chora-pipeline-publication',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './pipeline-publication.component.html',
  styleUrl: './pipeline-publication.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelinePublicationComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly admissionAdmin = inject(AdmissionAdminService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly publishing = signal(false);
  readonly template = signal<PipelineTemplate | null>(null);
  readonly openDate = signal('');
  readonly notificationCohortIds = signal<string[]>([]);
  readonly cohortInput = signal('');
  readonly confirmChecked = signal(false);

  // --- Constants ---
  readonly stageTypeLabels = STAGE_TYPE_LABELS;

  // --- Computed ---
  readonly canPublish = computed(
    () =>
      this.template() !== null &&
      this.openDate().trim().length > 0 &&
      this.confirmChecked() &&
      !this.publishing(),
  );

  readonly stageSummary = computed(() => {
    const tpl = this.template();
    if (!tpl) return [];
    return tpl.stages.map((s, i) => ({
      order: i + 1,
      name: s.name || `Stage ${i + 1}`,
      type: s.type,
      required: s.required,
    }));
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadTemplate(id);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private loadTemplate(id: string): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.admissionAdmin.loadTemplate(id).subscribe({
        next: (template) => {
          if (template) {
            this.template.set(template);
            if (template.open_date) {
              this.openDate.set(template.open_date);
            }
          }
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.admissions.template_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  addCohort(): void {
    const value = this.cohortInput().trim();
    if (value && !this.notificationCohortIds().includes(value)) {
      this.notificationCohortIds.update((ids) => [...ids, value]);
      this.cohortInput.set('');
    }
  }

  removeCohort(index: number): void {
    this.notificationCohortIds.update((ids) => ids.filter((_, i) => i !== index));
  }

  publish(): void {
    const tpl = this.template();
    if (!tpl || !this.canPublish()) return;

    this.publishing.set(true);
    this.subscriptions.add(
      this.admissionAdmin
        .publishTemplate(tpl.id, {
          open_date: this.openDate(),
          notification_cohort_ids: this.notificationCohortIds(),
        })
        .subscribe({
          next: (result) => {
            this.publishing.set(false);
            if (result) {
              this.toast.show('admin.admissions.publish_success', 'success');
              this.router.navigate(['/admin/admissions']);
            } else {
              this.toast.show('admin.admissions.publish_error', 'error');
            }
          },
          error: () => {
            this.publishing.set(false);
            this.toast.show('admin.admissions.publish_error', 'error');
          },
        }),
    );
  }

  goBack(): void {
    const tpl = this.template();
    if (tpl) {
      this.router.navigate(['/admin/admissions/templates', tpl.id, 'edit']);
    } else {
      this.router.navigate(['/admin/admissions']);
    }
  }

  trackByIndex(index: number): number {
    return index;
  }
}
