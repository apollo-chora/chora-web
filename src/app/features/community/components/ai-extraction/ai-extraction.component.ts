/**
 * AiExtractionComponent — AI-powered atom extraction from uploaded documents.
 *
 * Route: /community/upload
 *
 * Features:
 *   - Split-pane: source document viewer left, extracted atom candidates right
 *   - Each candidate has confidence score (0-100%), accept/reject/edit buttons
 *   - Document upload with drag-drop
 *   - Processing state with progress indicator
 *   - Loading, error, and empty states
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

/** A candidate atom extracted by AI */
interface ExtractedCandidate {
  id: string;
  title: string;
  content: string;
  atom_type: string;
  confidence: number;
  tags: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'editing';
  edited_content?: string;
}

type ExtractionState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'processing'; progress: number }
  | { status: 'success'; candidates: ExtractedCandidate[]; document_preview: string }
  | { status: 'error'; error: { code: string; message: string } };

@Component({
  selector: 'chora-ai-extraction',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './ai-extraction.component.html',
  styleUrl: './ai-extraction.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiExtractionComponent implements OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly extractionState = signal<ExtractionState>({ status: 'idle' });
  readonly isDragOver = signal(false);
  readonly selectedFile = signal<File | null>(null);

  readonly candidates = computed(() => {
    const state = this.extractionState();
    return state.status === 'success' ? state.candidates : [];
  });

  readonly documentPreview = computed(() => {
    const state = this.extractionState();
    return state.status === 'success' ? state.document_preview : '';
  });

  readonly acceptedCount = computed(() =>
    this.candidates().filter((c) => c.status === 'accepted').length,
  );

  readonly rejectedCount = computed(() =>
    this.candidates().filter((c) => c.status === 'rejected').length,
  );

  readonly pendingCount = computed(() =>
    this.candidates().filter((c) => c.status === 'pending' || c.status === 'editing').length,
  );

  readonly canSubmitAccepted = computed(() =>
    this.acceptedCount() > 0,
  );

  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // File upload
  // ---------------------------------------------------------------------------

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectedFile.set(files[0]);
      this.startExtraction(files[0]);
    }
  }

  onFileSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.selectedFile.set(target.files[0]);
      this.startExtraction(target.files[0]);
    }
  }

  private startExtraction(file: File): void {
    this.extractionState.set({ status: 'uploading' });

    const formData = new FormData();
    formData.append('document', file);

    this.subscriptions.add(
      this.bff.post<{
        candidates: ExtractedCandidate[];
        document_preview: string;
      }>(
        '/api/v1/community/ai/extract',
        formData,
      ).subscribe({
        next: (result) => {
          const candidates = result.candidates.map((c) => ({
            ...c,
            status: 'pending' as const,
          }));
          this.extractionState.set({
            status: 'success',
            candidates,
            document_preview: result.document_preview,
          });
        },
        error: (err: Error) => {
          this.extractionState.set({
            status: 'error',
            error: { code: 'EXTRACTION_FAILED', message: err.message },
          });
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Candidate actions
  // ---------------------------------------------------------------------------

  acceptCandidate(candidateId: string): void {
    this.updateCandidateStatus(candidateId, 'accepted');
  }

  rejectCandidate(candidateId: string): void {
    this.updateCandidateStatus(candidateId, 'rejected');
  }

  startEditCandidate(candidateId: string): void {
    this.updateCandidateStatus(candidateId, 'editing');
  }

  onEditContent(candidateId: string, event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    const state = this.extractionState();
    if (state.status !== 'success') return;

    const updated = state.candidates.map((c) =>
      c.id === candidateId ? { ...c, edited_content: target.value } : c,
    );
    this.extractionState.set({
      ...state,
      candidates: updated,
    });
  }

  saveEdit(candidateId: string): void {
    const state = this.extractionState();
    if (state.status !== 'success') return;

    const updated = state.candidates.map((c) =>
      c.id === candidateId
        ? { ...c, content: c.edited_content || c.content, status: 'accepted' as const, edited_content: undefined }
        : c,
    );
    this.extractionState.set({
      ...state,
      candidates: updated,
    });
  }

  cancelEdit(candidateId: string): void {
    this.updateCandidateStatus(candidateId, 'pending');
  }

  private updateCandidateStatus(
    candidateId: string,
    status: ExtractedCandidate['status'],
  ): void {
    const state = this.extractionState();
    if (state.status !== 'success') return;

    const updated = state.candidates.map((c) =>
      c.id === candidateId ? { ...c, status } : c,
    );
    this.extractionState.set({
      ...state,
      candidates: updated,
    });
  }

  // ---------------------------------------------------------------------------
  // Submit accepted candidates
  // ---------------------------------------------------------------------------

  onSubmitAccepted(): void {
    const accepted = this.candidates().filter((c) => c.status === 'accepted');
    if (accepted.length === 0) return;

    this.subscriptions.add(
      this.bff.post<{ count: number }>(
        '/api/v1/community/atoms/bulk',
        { atoms: accepted.map((c) => ({ title: c.title, content: c.content, atom_type: c.atom_type, tags: c.tags })) },
      ).subscribe({
        next: (_result) => {
          this.toast.show('community.extraction.submitted', 'success');
          // Remove accepted from list
          const state = this.extractionState();
          if (state.status === 'success') {
            const remaining = state.candidates.filter((c) => c.status !== 'accepted');
            this.extractionState.set({ ...state, candidates: remaining });
          }
        },
        error: () => {
          this.toast.show('community.extraction.submit-error', 'error');
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  getConfidenceClass(confidence: number): string {
    if (confidence >= 80) return 'ai-extraction__confidence--high';
    if (confidence >= 50) return 'ai-extraction__confidence--medium';
    return 'ai-extraction__confidence--low';
  }

  trackByCandidateId(_index: number, candidate: ExtractedCandidate): string {
    return candidate.id;
  }

  onStartOver(): void {
    this.extractionState.set({ status: 'idle' });
    this.selectedFile.set(null);
  }
}
