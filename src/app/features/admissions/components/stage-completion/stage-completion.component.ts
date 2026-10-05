/**
 * StageCompletionComponent — Per-stage content renderer for learner
 * admission applications. Uses @switch on stage type to render the
 * appropriate content (document upload, form, assessment, interview,
 * prerequisite check).
 *
 * Route: /admissions/apply/:pipelineId/stage/:stageId
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AdmissionService } from '../../services/admission.service';
import type {
  StageDetail,
  UploadedDocument,
  LearnerFormField,
  InterviewSlot,
  PrerequisiteResult,
} from '../../models/admission-learner.model';

@Component({
  selector: 'chora-stage-completion',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe],
  templateUrl: './stage-completion.component.html',
  styleUrl: './stage-completion.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StageCompletionComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly admissionService = inject(AdmissionService);
  private readonly toast = inject(ToastService);

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // --- State ---
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly uploading = signal(false);
  readonly stageDetail = signal<StageDetail | null>(null);
  readonly pipelineId = signal<string | null>(null);
  readonly applicationId = signal<string | null>(null);
  readonly stageId = signal<string | null>(null);
  readonly formResponses = signal<Record<string, unknown>>({});
  readonly dragOver = signal(false);
  readonly uploadProgress = signal<string | null>(null);
  readonly validationErrors = signal<string[]>([]);
  readonly selectedSlotId = signal<string | null>(null);

  // --- Computed ---
  readonly stageType = computed(() => this.stageDetail()?.stage_type ?? null);
  readonly documents = computed(() => this.stageDetail()?.documents ?? []);
  readonly formFields = computed(() => this.stageDetail()?.form_fields ?? []);
  readonly interviewSlots = computed(
    () => this.stageDetail()?.available_interview_slots ?? [],
  );
  readonly bookedSlot = computed(() => this.stageDetail()?.interview_slot ?? null);
  readonly prerequisiteResults = computed(
    () => this.stageDetail()?.prerequisite_results ?? [],
  );
  readonly allPrerequisitesPassed = computed(() =>
    this.prerequisiteResults().every((r) => r.passed),
  );
  readonly acceptedTypes = computed(
    () => this.stageDetail()?.accepted_file_types ?? [],
  );
  readonly maxFileSizeMb = computed(
    () => this.stageDetail()?.max_file_size_mb ?? 10,
  );
  readonly canSubmit = computed(() => {
    const detail = this.stageDetail();
    if (!detail) return false;

    switch (detail.stage_type) {
      case 'document_upload':
        return this.documents().length > 0;
      case 'form':
        return this.areRequiredFieldsFilled();
      case 'prerequisite_check':
        return this.allPrerequisitesPassed();
      case 'interview':
        return this.selectedSlotId() !== null || this.bookedSlot() !== null;
      case 'assessment':
        return true;
      default:
        return true;
    }
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const pipelineId = this.route.snapshot.paramMap.get('pipelineId');
    const stageId = this.route.snapshot.paramMap.get('stageId');
    this.pipelineId.set(pipelineId);
    this.stageId.set(stageId);

    // For now, applicationId is derived from pipeline context
    // In production, this would come from the route or a service
    this.applicationId.set(pipelineId);

    if (pipelineId && stageId) {
      this.loadStageDetail(pipelineId, stageId);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  private loadStageDetail(applicationId: string, stageId: string): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.admissionService.getStageDetail(applicationId, stageId).subscribe({
        next: (detail) => {
          if (detail) {
            this.stageDetail.set(detail);
            // Pre-fill form responses
            if (detail.form_responses) {
              this.formResponses.set({ ...detail.form_responses });
            }
            if (detail.interview_slot) {
              this.selectedSlotId.set(detail.interview_slot.id);
            }
          }
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admissions.stage_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Document Upload
  // ---------------------------------------------------------------------------

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.uploadFile(event.dataTransfer.files[0]);
    }
  }

  onKeyActivateUpload(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.fileInputRef?.nativeElement?.click();
    }
  }

  private uploadFile(file: File): void {
    const appId = this.applicationId();
    const stgId = this.stageId();
    if (!appId || !stgId) return;

    // Validate file size
    const maxBytes = this.maxFileSizeMb() * 1024 * 1024;
    if (file.size > maxBytes) {
      this.toast.show('admissions.file_too_large', 'error');
      return;
    }

    // Validate file type
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (
      this.acceptedTypes().length > 0 &&
      !this.acceptedTypes().includes(extension)
    ) {
      this.toast.show('admissions.file_type_not_accepted', 'error');
      return;
    }

    this.uploading.set(true);
    this.uploadProgress.set(file.name);

    this.subscriptions.add(
      this.admissionService.uploadDocument(appId, stgId, file).subscribe({
        next: (doc) => {
          this.uploading.set(false);
          this.uploadProgress.set(null);
          if (doc) {
            // Add to local state
            const current = this.stageDetail();
            if (current) {
              this.stageDetail.set({
                ...current,
                documents: [...current.documents, doc],
              });
            }
            this.toast.show('admissions.file_uploaded', 'success');
          } else {
            this.toast.show('admissions.upload_error', 'error');
          }
        },
        error: () => {
          this.uploading.set(false);
          this.uploadProgress.set(null);
          this.toast.show('admissions.upload_error', 'error');
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  onFormFieldChange(fieldId: string, value: unknown): void {
    this.formResponses.update((current) => ({
      ...current,
      [fieldId]: value,
    }));
  }

  private areRequiredFieldsFilled(): boolean {
    const fields = this.formFields();
    const responses = this.formResponses();
    return fields
      .filter((f) => f.required)
      .every((f) => {
        const val = responses[f.id];
        return val !== undefined && val !== null && val !== '';
      });
  }

  // ---------------------------------------------------------------------------
  // Interview
  // ---------------------------------------------------------------------------

  selectSlot(slotId: string): void {
    this.selectedSlotId.set(slotId);
  }

  // ---------------------------------------------------------------------------
  // Assessment
  // ---------------------------------------------------------------------------

  launchAssessment(): void {
    const detail = this.stageDetail();
    if (detail?.assessment_session_id) {
      this.router.navigate(['/learning/assessment', detail.assessment_session_id]);
    }
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  submitStage(): void {
    if (!this.canSubmit() || this.submitting()) return;

    const appId = this.applicationId();
    const stgId = this.stageId();
    if (!appId || !stgId) return;

    this.submitting.set(true);
    this.validationErrors.set([]);

    this.subscriptions.add(
      this.admissionService
        .submitStage(appId, {
          stage_id: stgId,
          form_responses:
            this.stageType() === 'form' ? this.formResponses() : undefined,
          interview_slot_id:
            this.stageType() === 'interview'
              ? (this.selectedSlotId() ?? undefined)
              : undefined,
        })
        .subscribe({
          next: (result) => {
            this.submitting.set(false);
            if (result) {
              this.toast.show('admissions.stage_submitted', 'success');
              this.router.navigate(['/admissions/apply', this.pipelineId()]);
            } else {
              this.toast.show('admissions.submit_error', 'error');
            }
          },
          error: () => {
            this.submitting.set(false);
            this.toast.show('admissions.submit_error', 'error');
          },
        }),
    );
  }

  goBack(): void {
    this.router.navigate(['/admissions/apply', this.pipelineId()]);
  }

  getScanStatusClass(doc: UploadedDocument): string {
    switch (doc.scan_status) {
      case 'clean':
        return 'stage-completion__scan--clean';
      case 'rejected':
        return 'stage-completion__scan--rejected';
      case 'scanning':
        return 'stage-completion__scan--scanning';
      default:
        return 'stage-completion__scan--pending';
    }
  }

  trackByDocId(_index: number, doc: UploadedDocument): string {
    return doc.id;
  }

  trackByFieldId(_index: number, field: LearnerFormField): string {
    return field.id;
  }

  trackBySlotId(_index: number, slot: InterviewSlot): string {
    return slot.id;
  }

  trackByResultId(_index: number, result: PrerequisiteResult): string {
    return result.id;
  }
}
