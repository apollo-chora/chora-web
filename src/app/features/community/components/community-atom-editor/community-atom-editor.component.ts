/**
 * CommunityAtomEditorComponent — Rich text + markdown editor for community atom contributions.
 *
 * Route: /community/contribute
 *
 * Features:
 *   - Rich text + markdown editor
 *   - Atom type selector dropdown
 *   - Media upload zone (drag-drop)
 *   - Draft auto-save every 30s using effect() + interval
 *   - Tag input
 *   - Loading, submitting states
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import {
  ALL_ATOM_TYPES,
  ATOM_TYPE_LABELS,
} from '../../models/community.model';
import type { AtomType, SubmitCommunityAtomRequest } from '../../models/community.model';

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: string };

type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'chora-community-atom-editor',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './community-atom-editor.component.html',
  styleUrl: './community-atom-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityAtomEditorComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  readonly atomTypes = ALL_ATOM_TYPES;
  readonly atomTypeLabels = ATOM_TYPE_LABELS;

  // ---------------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------------

  readonly title = signal('');
  readonly content = signal('');
  readonly selectedType = signal<AtomType>('factoid');
  readonly tags = signal<string[]>([]);
  readonly tagInput = signal('');
  readonly mediaFiles = signal<File[]>([]);
  readonly isDragOver = signal(false);

  // ---------------------------------------------------------------------------
  // Submission state
  // ---------------------------------------------------------------------------

  readonly submitState = signal<SubmitState>({ status: 'idle' });
  readonly autoSaveState = signal<AutoSaveState>('idle');
  readonly lastSavedAt = signal<string | null>(null);

  readonly canSubmit = computed(() => {
    return (
      this.title().trim().length > 0 &&
      this.content().trim().length > 0 &&
      this.submitState().status !== 'submitting'
    );
  });

  readonly isDirty = signal(false);

  private subscriptions = new Subscription();

  constructor() {
    // Mark dirty when any form field changes
    effect(() => {
      this.title();
      this.content();
      this.selectedType();
      this.tags();
      this.isDirty.set(true);
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.loadDraft();
    this.startAutoSave();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Auto-save (every 30s)
  // ---------------------------------------------------------------------------

  private startAutoSave(): void {
    this.subscriptions.add(
      interval(30_000).subscribe(() => {
        if (this.isDirty() && this.content().trim().length > 0) {
          this.saveDraft();
        }
      }),
    );
  }

  private saveDraft(): void {
    this.autoSaveState.set('saving');

    const draft = {
      title: this.title(),
      content: this.content(),
      atom_type: this.selectedType(),
      tags: this.tags(),
    };

    this.subscriptions.add(
      this.bff.put<void>(
        '/api/v1/community/drafts/current',
        draft,
      ).subscribe({
        next: () => {
          this.autoSaveState.set('saved');
          this.isDirty.set(false);
          this.lastSavedAt.set(new Date().toISOString());
        },
        error: () => {
          this.autoSaveState.set('error');
        },
      }),
    );
  }

  private loadDraft(): void {
    this.subscriptions.add(
      this.bff.get<{
        title: string;
        content: string;
        atom_type: AtomType;
        tags: string[];
      } | null>('/api/v1/community/drafts/current').subscribe({
        next: (draft) => {
          if (draft) {
            this.title.set(draft.title || '');
            this.content.set(draft.content || '');
            this.selectedType.set(draft.atom_type || 'factoid');
            this.tags.set(draft.tags || []);
            this.isDirty.set(false);
          }
        },
        error: () => {
          // No draft found, start fresh
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // User actions
  // ---------------------------------------------------------------------------

  onTitleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.title.set(target.value);
  }

  onContentInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.content.set(target.value);
  }

  onTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectedType.set(target.value as AtomType);
  }

  onTagInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.tagInput.set(target.value);
  }

  onTagInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addTag();
    }
  }

  addTag(): void {
    const tag = this.tagInput().trim().toLowerCase();
    if (tag && !this.tags().includes(tag)) {
      this.tags.update((prev) => [...prev, tag]);
    }
    this.tagInput.set('');
  }

  removeTag(tag: string): void {
    this.tags.update((prev) => prev.filter((t) => t !== tag));
  }

  // ---------------------------------------------------------------------------
  // Drag-drop media upload
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
      this.addFiles(files);
    }
  }

  onFileSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.addFiles(target.files);
    }
  }

  removeFile(index: number): void {
    this.mediaFiles.update((prev) => prev.filter((_, i) => i !== index));
  }

  private addFiles(fileList: FileList): void {
    const newFiles = Array.from(fileList);
    this.mediaFiles.update((prev) => [...prev, ...newFiles]);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.submitState.set({ status: 'submitting' });

    const payload: SubmitCommunityAtomRequest = {
      title: this.title().trim(),
      content: this.content().trim(),
      atom_type: this.selectedType(),
      tags: this.tags(),
    };

    this.subscriptions.add(
      this.bff.post<{ id: string }>(
        '/api/v1/community/atoms',
        payload,
      ).subscribe({
        next: () => {
          this.submitState.set({ status: 'success' });
          this.toast.show('community.atom_submitted', 'success');
          this.resetForm();
        },
        error: (err: Error) => {
          this.submitState.set({ status: 'error', error: err.message });
          this.toast.show('community.atom_submit_error', 'error');
        },
      }),
    );
  }

  private resetForm(): void {
    this.title.set('');
    this.content.set('');
    this.selectedType.set('factoid');
    this.tags.set([]);
    this.mediaFiles.set([]);
    this.isDirty.set(false);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  trackByTag(_index: number, tag: string): string {
    return tag;
  }

  trackByFileIndex(index: number): number {
    return index;
  }
}
