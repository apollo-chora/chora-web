/**
 * AppealComponent — Suspension appeal form with status tracking timeline.
 *
 * Route: /settings/account/appeal
 *
 * Features:
 *   - Structured appeal form (reason + evidence files)
 *   - File upload with drag-and-drop zone (images + PDFs, max 5 files, max 10MB each)
 *   - Character counter on textarea
 *   - Appeal lifecycle timeline (submitted -> under_review -> decision)
 *   - If appeal already exists, shows current status instead of form
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
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Component-specific types
// ---------------------------------------------------------------------------

export type AppealLifecycleStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'denied';

export interface SuspensionAppeal {
  id: string;
  restriction_id: string;
  appellant_gcid: string;
  reason: string;
  evidence_urls: string[];
  status: AppealLifecycleStatus;
  reviewer_gcid: string | null;
  reviewer_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  resolved_at: string | null;
}

export interface AppealTimelineStep {
  key: AppealLifecycleStatus;
  label: string;
  timestamp: string | null;
  completed: boolean;
  current: boolean;
  icon: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APPEAL_PATH = '/api/v1/governance/appeals/me';
const MIN_REASON_LENGTH = 50;
const MAX_REASON_LENGTH = 2000;
const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.pdf';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'chora-appeal',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './appeal.component.html',
  styleUrl: './appeal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppealComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // --- Constants exposed to template ---
  readonly minReasonLength = MIN_REASON_LENGTH;
  readonly maxReasonLength = MAX_REASON_LENGTH;
  readonly maxFiles = MAX_FILES;
  readonly maxFileSizeMb = MAX_FILE_SIZE_MB;
  readonly acceptedExtensions = ACCEPTED_EXTENSIONS;

  // --- State ---
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly existingAppeal = signal<SuspensionAppeal | null>(null);
  readonly reason = signal('');
  readonly files = signal<File[]>([]);
  readonly dragOver = signal(false);
  readonly fileErrors = signal<string[]>([]);

  // --- Computed ---
  readonly charCount = computed(() => this.reason().length);
  readonly charsRemaining = computed(() => MAX_REASON_LENGTH - this.reason().length);
  readonly isReasonValid = computed(
    () => this.reason().trim().length >= MIN_REASON_LENGTH &&
          this.reason().length <= MAX_REASON_LENGTH,
  );
  readonly canSubmit = computed(
    () => this.isReasonValid() && !this.submitting(),
  );
  readonly hasExistingAppeal = computed(() => this.existingAppeal() !== null);

  readonly timelineSteps = computed<AppealTimelineStep[]>(() => {
    const appeal = this.existingAppeal();
    if (!appeal) return [];

    const status = appeal.status;
    const isDecision = status === 'approved' || status === 'denied';

    return [
      {
        key: 'submitted',
        label: 'appeal.timeline_submitted',
        timestamp: appeal.submitted_at,
        completed: true,
        current: status === 'submitted',
        icon: 'send',
      },
      {
        key: 'under_review',
        label: 'appeal.timeline_under_review',
        timestamp: appeal.reviewed_at,
        completed: status === 'under_review' || isDecision,
        current: status === 'under_review',
        icon: 'pending',
      },
      {
        key: status === 'denied' ? 'denied' : 'approved',
        label: isDecision
          ? (status === 'approved' ? 'appeal.timeline_approved' : 'appeal.timeline_denied')
          : 'appeal.timeline_decision',
        timestamp: appeal.resolved_at,
        completed: isDecision,
        current: isDecision,
        icon: isDecision
          ? (status === 'approved' ? 'check_circle' : 'cancel')
          : 'gavel',
      },
    ];
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadExistingAppeal();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadExistingAppeal(): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.bff.get<SuspensionAppeal | null>(APPEAL_PATH).subscribe({
        next: (appeal) => {
          this.existingAppeal.set(appeal);
          this.loading.set(false);
        },
        error: () => {
          // No existing appeal or 404 — show form
          this.existingAppeal.set(null);
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Form handlers
  // -------------------------------------------------------------------------

  onReasonInput(value: string): void {
    this.reason.set(value);
  }

  // -------------------------------------------------------------------------
  // File handling
  // -------------------------------------------------------------------------

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = '';
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
    if (event.dataTransfer?.files) {
      this.addFiles(Array.from(event.dataTransfer.files));
    }
  }

  removeFile(index: number): void {
    this.files.update((current) => current.filter((_, i) => i !== index));
    this.fileErrors.set([]);
  }

  private addFiles(newFiles: File[]): void {
    const errors: string[] = [];
    const currentFiles = this.files();
    const validFiles: File[] = [];

    for (const file of newFiles) {
      if (currentFiles.length + validFiles.length >= MAX_FILES) {
        errors.push(`appeal.error_max_files`);
        break;
      }

      if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
        errors.push(`appeal.error_invalid_type`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`appeal.error_file_too_large`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      this.files.update((current) => [...current, ...validFiles]);
    }

    this.fileErrors.set(errors);
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  submitAppeal(): void {
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.fileErrors.set([]);

    const formData = new FormData();
    formData.append('reason', this.reason().trim());
    for (const file of this.files()) {
      formData.append('evidence', file, file.name);
    }

    // Use HttpClient directly for multipart/form-data
    this.subscriptions.add(
      this.bff.post<SuspensionAppeal>(APPEAL_PATH, formData).subscribe({
        next: (appeal) => {
          this.existingAppeal.set(appeal);
          this.submitting.set(false);
          this.toast.show('appeal.submit_success', 'success');
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('appeal.submit_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDateTime(isoString: string | null): string {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  statusIcon(status: AppealLifecycleStatus): string {
    switch (status) {
      case 'submitted': return 'send';
      case 'under_review': return 'pending';
      case 'approved': return 'check_circle';
      case 'denied': return 'cancel';
    }
  }
}
