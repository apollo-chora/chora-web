/**
 * MergeRequestComponent — Admin-assisted GCID merge request form with status tracking.
 *
 * Route: /settings/identity/merge-request
 *
 * For cases where automatic merge is not possible (different emails, no OIDC link).
 * User submits evidence of account ownership for admin review.
 *
 * Features:
 *   - Form: target email, reason, evidence file upload (drag-and-drop)
 *   - Ownership confirmation checkbox
 *   - Post-submission status timeline: submitted -> admin_review -> approved/denied
 *   - If pending request exists, shows status instead of form
 *   - Denied requests show reason + re-submit option
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
import { PortabilityService } from '../../portability/services/portability.service';
import type {
  AdminMergeRequest,
  AdminMergeRequestStatus,
  AdminMergeRequestTimelineStep,
} from '../../portability/models/portability.model';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_REASON_LENGTH = 20;
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
  selector: 'chora-merge-request',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './merge-request.component.html',
  styleUrl: './merge-request.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MergeRequestComponent implements OnInit, OnDestroy {
  private readonly portabilityService = inject(PortabilityService);
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
  readonly existingRequest = signal<AdminMergeRequest | null>(null);
  readonly targetEmail = signal('');
  readonly reason = signal('');
  readonly ownershipConfirmed = signal(false);
  readonly files = signal<File[]>([]);
  readonly filePreviews = signal<Map<string, string>>(new Map());
  readonly dragOver = signal(false);
  readonly fileErrors = signal<string[]>([]);

  // --- Computed ---
  readonly charCount = computed(() => this.reason().length);
  readonly charsRemaining = computed(() => MAX_REASON_LENGTH - this.reason().length);

  readonly isEmailValid = computed(() => {
    const email = this.targetEmail().trim();
    return email.length > 0 && email.includes('@') && email.includes('.');
  });

  readonly isReasonValid = computed(
    () => this.reason().trim().length >= MIN_REASON_LENGTH &&
          this.reason().length <= MAX_REASON_LENGTH,
  );

  readonly canSubmit = computed(
    () => this.isEmailValid()
      && this.isReasonValid()
      && this.ownershipConfirmed()
      && !this.submitting(),
  );

  readonly hasExistingRequest = computed(() => this.existingRequest() !== null);

  readonly isPending = computed(() => {
    const req = this.existingRequest();
    return req !== null && (req.status === 'submitted' || req.status === 'admin_review');
  });

  readonly isDenied = computed(() => {
    const req = this.existingRequest();
    return req !== null && req.status === 'denied';
  });

  readonly isApproved = computed(() => {
    const req = this.existingRequest();
    return req !== null && req.status === 'approved';
  });

  readonly timelineSteps = computed<AdminMergeRequestTimelineStep[]>(() => {
    const request = this.existingRequest();
    if (!request) return [];

    const status = request.status;
    const isDecision = status === 'approved' || status === 'denied';

    return [
      {
        key: 'submitted' as AdminMergeRequestStatus,
        label: 'identity.merge_request.timeline_submitted',
        timestamp: request.submitted_at,
        completed: true,
        current: status === 'submitted',
        icon: 'send',
      },
      {
        key: 'admin_review' as AdminMergeRequestStatus,
        label: 'identity.merge_request.timeline_admin_review',
        timestamp: request.reviewed_at,
        completed: status === 'admin_review' || isDecision,
        current: status === 'admin_review',
        icon: 'rate_review',
      },
      {
        key: (status === 'denied' ? 'denied' : 'approved') as AdminMergeRequestStatus,
        label: isDecision
          ? (status === 'approved'
            ? 'identity.merge_request.timeline_approved'
            : 'identity.merge_request.timeline_denied')
          : 'identity.merge_request.timeline_decision',
        timestamp: request.resolved_at,
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
    this.loadExistingRequest();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.revokeAllPreviews();
    this.portabilityService.resetAdminMergeRequestState();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadExistingRequest(): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.portabilityService.loadAdminMergeRequest().subscribe({
        next: (request) => {
          this.existingRequest.set(request);
          this.loading.set(false);
        },
        error: () => {
          // No existing request or 404 — show form
          this.existingRequest.set(null);
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Form handlers
  // -------------------------------------------------------------------------

  onEmailInput(value: string): void {
    this.targetEmail.set(value);
  }

  onReasonInput(value: string): void {
    this.reason.set(value);
  }

  onOwnershipToggle(checked: boolean): void {
    this.ownershipConfirmed.set(checked);
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
    const file = this.files()[index];
    if (file) {
      this.revokePreview(file.name);
    }
    this.files.update((current) => current.filter((_, i) => i !== index));
    this.fileErrors.set([]);
  }

  isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
  }

  getPreview(fileName: string): string | null {
    return this.filePreviews().get(fileName) ?? null;
  }

  private addFiles(newFiles: File[]): void {
    const errors: string[] = [];
    const currentFiles = this.files();
    const validFiles: File[] = [];

    for (const file of newFiles) {
      if (currentFiles.length + validFiles.length >= MAX_FILES) {
        errors.push('identity.merge_request.error_max_files');
        break;
      }

      if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
        errors.push('identity.merge_request.error_invalid_type');
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push('identity.merge_request.error_file_too_large');
        continue;
      }

      validFiles.push(file);

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        this.filePreviews.update((previews) => {
          const updated = new Map(previews);
          updated.set(file.name, url);
          return updated;
        });
      }
    }

    if (validFiles.length > 0) {
      this.files.update((current) => [...current, ...validFiles]);
    }

    this.fileErrors.set(errors);
  }

  private revokePreview(fileName: string): void {
    const previews = this.filePreviews();
    const url = previews.get(fileName);
    if (url) {
      URL.revokeObjectURL(url);
      this.filePreviews.update((current) => {
        const updated = new Map(current);
        updated.delete(fileName);
        return updated;
      });
    }
  }

  private revokeAllPreviews(): void {
    for (const url of this.filePreviews().values()) {
      URL.revokeObjectURL(url);
    }
    this.filePreviews.set(new Map());
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  submitRequest(): void {
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.fileErrors.set([]);

    const formData = new FormData();
    formData.append('target_email', this.targetEmail().trim());
    formData.append('reason', this.reason().trim());
    formData.append('ownership_confirmed', 'true');

    for (const file of this.files()) {
      formData.append('evidence', file, file.name);
    }

    this.subscriptions.add(
      this.portabilityService.submitAdminMergeRequest(formData).subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result) {
            this.existingRequest.set(result);
            this.toast.show('identity.merge_request.submit_success', 'success');
          } else {
            this.toast.show('identity.merge_request.submit_error', 'error');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('identity.merge_request.submit_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Re-submit (after denial)
  // -------------------------------------------------------------------------

  onResubmit(): void {
    this.existingRequest.set(null);
    this.resetForm();
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

  private resetForm(): void {
    this.targetEmail.set('');
    this.reason.set('');
    this.ownershipConfirmed.set(false);
    this.revokeAllPreviews();
    this.files.set([]);
    this.fileErrors.set([]);
  }
}
