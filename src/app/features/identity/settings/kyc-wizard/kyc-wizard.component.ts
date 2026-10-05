/**
 * KycWizardComponent — Learner-facing KYC verification wizard.
 *
 * Route: /settings/kyc
 *
 * Features:
 *   - 3-step wizard (document type selection + upload, liveness/selfie capture placeholder, review + submit)
 *   - Document upload with accepted formats (pdf, jpg, png, max 10MB)
 *   - Verification status tracking (pending_review, verified, rejected with reason)
 *   - Status display with timeline
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
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  KycVerificationLearner,
  KycLearnerState,
  KycDocType,
  KycTimelineEntry,
} from '../../../admin/governance/models/escalation.model';
import { KYC_LEARNER_STATUS_LABELS } from '../../../admin/governance/models/escalation.model';

type WizardStep = 'document' | 'selfie' | 'review';

const ACCEPTED_FORMATS = '.pdf,.jpg,.jpeg,.png';
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const DOC_TYPES: { value: KycDocType; label_key: string }[] = [
  { value: 'national_id', label_key: 'governance.doc_national_id' },
  { value: 'passport', label_key: 'governance.doc_passport' },
  { value: 'drivers_license', label_key: 'governance.doc_drivers_license' },
];

@Component({
  selector: 'chora-kyc-wizard',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './kyc-wizard.component.html',
  styleUrl: './kyc-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KycWizardComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // --- State ---
  private readonly _state = signal<KycLearnerState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly verification = computed(() => {
    const s = this._state();
    return s.status === 'success' ? s.data : null;
  });

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');

  // --- Existing verification status ---
  readonly hasExistingVerification = computed(() => {
    const v = this.verification();
    return v !== null && v.submitted_at !== null;
  });

  readonly verificationStatus = computed(() => this.verification()?.status ?? null);
  readonly rejectionReason = computed(() => this.verification()?.rejection_reason ?? null);
  readonly timeline = computed<KycTimelineEntry[]>(() => this.verification()?.timeline ?? []);

  // --- Wizard state ---
  readonly wizardStep = signal<WizardStep>('document');
  readonly wizardSteps: WizardStep[] = ['document', 'selfie', 'review'];

  readonly selectedDocType = signal<KycDocType | null>(null);
  readonly documentFileName = signal<string | null>(null);
  readonly documentFile = signal<File | null>(null);
  readonly selfieFileName = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly fileError = signal<string | null>(null);

  readonly wizardStepIndex = computed(() =>
    this.wizardSteps.indexOf(this.wizardStep()),
  );

  // --- Constants ---
  readonly docTypes = DOC_TYPES;
  readonly acceptedFormats = ACCEPTED_FORMATS;
  readonly maxFileSizeMb = MAX_FILE_SIZE_MB;
  readonly statusLabels = KYC_LEARNER_STATUS_LABELS;

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadVerification();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadVerification(): void {
    this._state.set({ status: 'loading' });
    this.subscriptions.add(
      this.bff
        .get<KycVerificationLearner>('/api/v1/identity/kyc')
        .subscribe({
          next: (data) => this._state.set({ status: 'success', data }),
          error: (err: Error) =>
            this._state.set({
              status: 'error',
              error: { code: 'KYC_LOAD_FAILED', message: err.message },
            }),
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Wizard navigation
  // -------------------------------------------------------------------------

  nextStep(): void {
    const idx = this.wizardStepIndex();
    if (idx < this.wizardSteps.length - 1) {
      this.wizardStep.set(this.wizardSteps[idx + 1]);
    }
  }

  prevStep(): void {
    const idx = this.wizardStepIndex();
    if (idx > 0) {
      this.wizardStep.set(this.wizardSteps[idx - 1]);
    }
  }

  // -------------------------------------------------------------------------
  // File handling
  // -------------------------------------------------------------------------

  onDocumentFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      this.documentFileName.set(null);
      this.documentFile.set(null);
      this.fileError.set(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.fileError.set('governance.file_too_large');
      this.documentFileName.set(null);
      this.documentFile.set(null);
      return;
    }

    this.fileError.set(null);
    this.documentFileName.set(file.name);
    this.documentFile.set(file);
  }

  onSelfieCapture(): void {
    // Placeholder — in production this would invoke camera API
    this.selfieFileName.set('selfie_capture.jpg');
  }

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  submit(): void {
    if (!this.selectedDocType() || !this.documentFile()) return;

    this.submitting.set(true);

    const formData = {
      document_type: this.selectedDocType(),
      document_file_name: this.documentFileName(),
      selfie_file_name: this.selfieFileName(),
    };

    this.subscriptions.add(
      this.bff
        .post<KycVerificationLearner>('/api/v1/identity/kyc', formData)
        .subscribe({
          next: (data) => {
            this.submitting.set(false);
            this._state.set({ status: 'success', data });
            this.toast.show('governance.kyc_submitted', 'success');
          },
          error: () => {
            this.submitting.set(false);
            this.toast.show('governance.kyc_submit_error', 'error');
          },
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDate(isoString: string | null): string {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  timelineStageClass(status: string): string {
    return `kyc-wizard__timeline-stage--${status}`;
  }

  statusClass(status: string): string {
    return `kyc-wizard__verification-status--${status}`;
  }
}
