/**
 * PipelineBuilderComponent — Admin interface for creating and editing
 * admission pipeline templates with drag-and-drop stage reordering.
 *
 * Route: admin/admissions/templates/new | admin/admissions/templates/:id/edit
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
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { AdmissionAdminService } from '../../services/admission-admin.service';
import type {
  PipelineTemplate,
  PipelineStage,
  StageType,
  StageConfig,
} from '../../models/admission.model';
import {
  ALL_STAGE_TYPES,
  STAGE_TYPE_LABELS,
  STAGE_TYPE_ICONS,
} from '../../models/admission.model';

@Component({
  selector: 'chora-pipeline-builder',
  standalone: true,
  imports: [FormsModule, TranslatePipe, CdkDrag, CdkDropList],
  templateUrl: './pipeline-builder.component.html',
  styleUrl: './pipeline-builder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineBuilderComponent implements OnInit, OnDestroy {
  protected readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly admissionAdmin = inject(AdmissionAdminService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly templateId = signal<string | null>(null);
  readonly templateName = signal('');
  readonly templateDescription = signal('');
  readonly programmeId = signal<string | null>(null);
  readonly programmeName = signal<string | null>(null);
  readonly openDate = signal<string | null>(null);
  readonly closeDate = signal<string | null>(null);
  readonly maxConcurrentApplications = signal(1);
  readonly stages = signal<PipelineStage[]>([]);
  readonly selectedStageIndex = signal<number | null>(null);

  // --- Constants ---
  readonly allStageTypes = ALL_STAGE_TYPES;
  readonly stageTypeLabels = STAGE_TYPE_LABELS;
  readonly stageTypeIcons = STAGE_TYPE_ICONS;

  // --- Computed ---
  readonly isEditing = computed(() => this.templateId() !== null);
  readonly selectedStage = computed(() => {
    const index = this.selectedStageIndex();
    if (index === null) return null;
    return this.stages()[index] ?? null;
  });
  readonly canSave = computed(
    () => this.templateName().trim().length > 0 && this.stages().length > 0,
  );

  private subscriptions = new Subscription();
  private stageCounter = 0;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.templateId.set(id);
      this.loadTemplate(id);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Template Loading
  // ---------------------------------------------------------------------------

  private loadTemplate(id: string): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.admissionAdmin.loadTemplate(id).subscribe({
        next: (template) => {
          if (template) {
            this.applyTemplate(template);
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

  private applyTemplate(template: PipelineTemplate): void {
    this.templateName.set(template.name);
    this.templateDescription.set(template.description);
    this.programmeId.set(template.programme_id);
    this.programmeName.set(template.programme_name);
    this.openDate.set(template.open_date);
    this.closeDate.set(template.close_date);
    this.maxConcurrentApplications.set(template.max_concurrent_applications);
    this.stages.set([...template.stages]);
    this.stageCounter = template.stages.length;
  }

  // ---------------------------------------------------------------------------
  // Stage Management
  // ---------------------------------------------------------------------------

  addStage(type: StageType): void {
    this.stageCounter++;
    const newStage: PipelineStage = {
      id: `stage-new-${this.stageCounter}`,
      name: '',
      type,
      order: this.stages().length,
      required: true,
      timeout_hours: null,
      instructions: '',
      config: this.defaultConfigForType(type),
    };
    this.stages.update((current) => [...current, newStage]);
    this.selectedStageIndex.set(this.stages().length - 1);
  }

  removeStage(index: number): void {
    this.stages.update((current) => {
      const updated = current.filter((_, i) => i !== index);
      return updated.map((s, i) => ({ ...s, order: i }));
    });
    if (this.selectedStageIndex() === index) {
      this.selectedStageIndex.set(null);
    } else if (
      this.selectedStageIndex() !== null &&
      this.selectedStageIndex()! > index
    ) {
      this.selectedStageIndex.update((i) => (i !== null ? i - 1 : null));
    }
  }

  selectStage(index: number): void {
    this.selectedStageIndex.set(index);
  }

  onStageDrop(event: CdkDragDrop<PipelineStage[]>): void {
    const current = [...this.stages()];
    moveItemInArray(current, event.previousIndex, event.currentIndex);
    this.stages.set(current.map((s, i) => ({ ...s, order: i })));

    // Update selected index if needed
    const selected = this.selectedStageIndex();
    if (selected !== null) {
      if (selected === event.previousIndex) {
        this.selectedStageIndex.set(event.currentIndex);
      } else if (
        selected > event.previousIndex &&
        selected <= event.currentIndex
      ) {
        this.selectedStageIndex.update((i) => (i !== null ? i - 1 : null));
      } else if (
        selected < event.previousIndex &&
        selected >= event.currentIndex
      ) {
        this.selectedStageIndex.update((i) => (i !== null ? i + 1 : null));
      }
    }
  }

  updateStageName(index: number, name: string): void {
    this.stages.update((current) =>
      current.map((s, i) => (i === index ? { ...s, name } : s)),
    );
  }

  updateStageRequired(index: number, required: boolean): void {
    this.stages.update((current) =>
      current.map((s, i) => (i === index ? { ...s, required } : s)),
    );
  }

  updateStageTimeout(index: number, timeoutHours: number | null): void {
    this.stages.update((current) =>
      current.map((s, i) =>
        i === index ? { ...s, timeout_hours: timeoutHours } : s,
      ),
    );
  }

  updateStageInstructions(index: number, instructions: string): void {
    this.stages.update((current) =>
      current.map((s, i) => (i === index ? { ...s, instructions } : s)),
    );
  }

  updateStageConfig(index: number, config: Partial<StageConfig>): void {
    this.stages.update((current) =>
      current.map((s, i) =>
        i === index ? { ...s, config: { ...s.config, ...config } } : s,
      ),
    );
  }

  updateAcceptedFileTypes(index: number, value: string): void {
    const types = value
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    this.updateStageConfig(index, { accepted_file_types: types });
  }

  updateLinkedAssessment(index: number, assessmentId: string): void {
    this.updateStageConfig(index, {
      linked_assessment_id: assessmentId || undefined,
    });
  }

  updateMaxFileSize(index: number, sizeMb: number): void {
    this.updateStageConfig(index, { max_file_size_mb: sizeMb });
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  save(): void {
    if (!this.canSave()) return;

    this.saving.set(true);
    const payload = this.buildPayload();

    const request$ = this.isEditing()
      ? this.admissionAdmin.updateTemplate(this.templateId()!, payload)
      : this.admissionAdmin.createTemplate(payload);

    this.subscriptions.add(
      request$.subscribe({
        next: (result) => {
          this.saving.set(false);
          if (result) {
            this.toast.show('admin.admissions.template_saved', 'success');
            if (!this.isEditing()) {
              this.router.navigate([
                '/admin/admissions/templates',
                result.id,
                'edit',
              ]);
            }
          } else {
            this.toast.show('admin.admissions.template_save_error', 'error');
          }
        },
        error: () => {
          this.saving.set(false);
          this.toast.show('admin.admissions.template_save_error', 'error');
        },
      }),
    );
  }

  private buildPayload(): Omit<
    PipelineTemplate,
    'id' | 'status' | 'created_at' | 'updated_at'
  > {
    return {
      name: this.templateName(),
      description: this.templateDescription(),
      programme_id: this.programmeId(),
      programme_name: this.programmeName(),
      stages: this.stages(),
      open_date: this.openDate(),
      close_date: this.closeDate(),
      max_concurrent_applications: this.maxConcurrentApplications(),
    };
  }

  private defaultConfigForType(type: StageType): StageConfig {
    switch (type) {
      case 'document_upload':
        return { accepted_file_types: ['pdf', 'jpg', 'png'], max_file_size_mb: 10 };
      case 'form':
        return { form_fields: [] };
      case 'assessment':
        return { linked_assessment_id: undefined };
      case 'decision':
        return { reviewer_gcids: [] };
      case 'prerequisite_check':
        return { prerequisite_rules: [] };
      case 'interview':
        return {};
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByStageType(_index: number, type: StageType): string {
    return type;
  }
}
