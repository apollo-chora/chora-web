/**
 * PathBuilderComponent — Admin form for creating/editing LockedPaths.
 *
 * Routes:
 *   /admin/content/paths/new          — create mode
 *   /admin/content/paths/:id/edit     — edit mode
 *
 * Implements HasUnsavedChanges for the unsavedChangesGuard.
 * LockedPath is a collection aggregate — it queries atoms but does NOT own them.
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
import { ActivatedRoute, Router } from '@angular/router';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { HasUnsavedChanges } from '../../../../../core/guards/unsaved-changes.guard';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AdminPathService } from '../../services/admin-path.service';
import { AdminAtomService } from '../../services/admin-atom.service';
import {
  EnrollmentType,
  PathStepDraft,
  ALL_ENROLLMENT_TYPES,
  ENROLLMENT_TYPE_LABELS,
} from '../../models/admin-path.model';
import {
  AdminAtom,
  getAtomTitle,
  ADMIN_ATOM_TYPE_ICONS,
} from '../../models/admin-atom.model';

type EditorMode = 'create' | 'edit';

let stepIdCounter = 0;
function nextStepId(): string {
  stepIdCounter++;
  return `step-${stepIdCounter}`;
}

@Component({
  selector: 'chora-path-builder',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './path-builder.component.html',
  styleUrl: './path-builder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathBuilderComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly pathService = inject(AdminPathService);
  private readonly atomService = inject(AdminAtomService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly mode = signal<EditorMode>('create');
  readonly pathId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);

  // --- Steps ---
  readonly steps = signal<PathStepDraft[]>([]);

  // --- Atom Picker ---
  readonly atomPickerVisible = signal(false);
  readonly atomPickerAtoms = signal<AdminAtom[]>([]);
  readonly atomPickerLoading = signal(false);

  // --- Drag and Drop ---
  readonly draggedStepIndex = signal<number | null>(null);
  readonly dropTargetIndex = signal<number | null>(null);

  // --- Constants ---
  readonly allEnrollmentTypes = ALL_ENROLLMENT_TYPES;
  readonly enrollmentTypeLabels = ENROLLMENT_TYPE_LABELS;

  // --- Form ---
  readonly metaForm: FormGroup;

  // --- Computed ---
  readonly pageTitle = computed(() =>
    this.mode() === 'create'
      ? 'admin.paths.builder.create_title'
      : 'admin.paths.builder.edit_title',
  );

  readonly stepCount = computed(() => this.steps().length);

  readonly estimatedDurationMinutes = computed(() => {
    const val = this.metaForm.get('estimated_duration_minutes')?.value;
    return val ?? 0;
  });

  private dirty = false;
  private subscriptions = new Subscription();

  constructor() {
    this.metaForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(255)]],
      description: [''],
      estimated_duration_minutes: [null as number | null, [Validators.min(1)]],
      enrollment_type: ['open' as EnrollmentType, Validators.required],
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.mode.set('edit');
      this.pathId.set(id);
      this.loadPath(id);
    }

    this.subscriptions.add(
      this.metaForm.valueChanges.subscribe(() => { this.dirty = true; }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  // -------------------------------------------------------------------------
  // Data Loading
  // -------------------------------------------------------------------------

  private loadPath(id: string): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.pathService.getPath(id).subscribe({
        next: (path) => {
          this.metaForm.patchValue({
            title: path.title,
            description: path.description,
            estimated_duration_minutes: path.estimated_duration_ms
              ? Math.round(path.estimated_duration_ms / 60000)
              : null,
            enrollment_type: path.enrollment_type,
          });

          const stepDrafts: PathStepDraft[] = path.steps.map((step) => ({
            id: step.id,
            atom_id: step.atom_id,
            atom_title: step.atom_title ?? 'Untitled',
            atom_type: step.atom_type ?? 'multiple_choice',
            step_order: step.step_order,
            requires_previous: step.prerequisite_step_id !== null,
          }));
          this.steps.set(stepDrafts);

          this.loading.set(false);
          this.dirty = false;
        },
        error: () => {
          this.toast.show('admin.paths.builder.load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Step Management
  // -------------------------------------------------------------------------

  openAtomPicker(): void {
    this.atomPickerVisible.set(true);
    if (this.atomPickerAtoms().length === 0) {
      this.loadAtomCatalog();
    }
  }

  closeAtomPicker(): void {
    this.atomPickerVisible.set(false);
  }

  private loadAtomCatalog(): void {
    this.atomPickerLoading.set(true);
    this.subscriptions.add(
      this.atomService.getAtoms({ limit: 100, status: 'published' }).subscribe({
        next: (response) => {
          this.atomPickerAtoms.set(response.data);
          this.atomPickerLoading.set(false);
        },
        error: () => {
          this.atomPickerLoading.set(false);
        },
      }),
    );
  }

  addAtom(atom: AdminAtom): void {
    const step: PathStepDraft = {
      id: nextStepId(),
      atom_id: atom.id,
      atom_title: getAtomTitle(atom),
      atom_type: atom.atom_type,
      step_order: this.steps().length + 1,
      requires_previous: this.steps().length > 0,
    };
    this.steps.update((steps) => [...steps, step]);
    this.dirty = true;
    this.closeAtomPicker();
  }

  async removeStep(index: number): Promise<void> {
    if (this.steps().length === 1) {
      const confirmed = await this.confirmDialog.confirm({
        title: 'admin.paths.builder.remove_last_confirm_title',
        message: 'admin.paths.builder.remove_last_confirm_message',
        confirmText: 'admin.paths.builder.remove_confirm',
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    this.steps.update((steps) => {
      const next = steps.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
    this.dirty = true;
  }

  togglePrerequisite(index: number): void {
    this.steps.update((steps) =>
      steps.map((s, i) =>
        i === index ? { ...s, requires_previous: !s.requires_previous } : s,
      ),
    );
    this.dirty = true;
  }

  // -------------------------------------------------------------------------
  // Drag and Drop Reorder
  // -------------------------------------------------------------------------

  onStepDragStart(event: DragEvent, index: number): void {
    this.draggedStepIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  onStepDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dropTargetIndex.set(index);
  }

  onStepDragLeave(): void {
    this.dropTargetIndex.set(null);
  }

  onStepDrop(event: DragEvent, targetIndex: number): void {
    event.preventDefault();
    const sourceIndex = this.draggedStepIndex();
    if (sourceIndex === null || sourceIndex === targetIndex) {
      this.clearDragState();
      return;
    }

    this.steps.update((steps) => {
      const copy = [...steps];
      const [moved] = copy.splice(sourceIndex, 1);
      copy.splice(targetIndex, 0, moved);
      return copy.map((s, i) => ({ ...s, step_order: i + 1 }));
    });

    this.dirty = true;
    this.clearDragState();
  }

  onStepDragEnd(): void {
    this.clearDragState();
  }

  private clearDragState(): void {
    this.draggedStepIndex.set(null);
    this.dropTargetIndex.set(null);
  }

  getDropClass(index: number): string {
    if (this.dropTargetIndex() === index) {
      return 'path-builder__step--drop-target';
    }
    return '';
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  saveDraft(): void {
    this.save(false);
  }

  saveAndPublish(): void {
    this.save(true);
  }

  cancel(): void {
    this.router.navigate(['/admin/content/atoms']);
  }

  private save(_publish: boolean): void {
    if (this.metaForm.invalid) {
      this.metaForm.markAllAsTouched();
      this.toast.show('admin.paths.builder.fix_errors', 'warning');
      return;
    }

    this.saving.set(true);
    const formValue = this.metaForm.value;
    const durationMs = formValue.estimated_duration_minutes
      ? formValue.estimated_duration_minutes * 60000
      : null;

    const request = {
      title: formValue.title,
      description: formValue.description || undefined,
      estimated_duration_ms: durationMs,
      enrollment_type: formValue.enrollment_type as EnrollmentType,
    };

    const operation = this.mode() === 'create'
      ? this.pathService.createPath(request)
      : this.pathService.updatePath(this.pathId()!, request);

    this.subscriptions.add(
      operation.subscribe({
        next: () => {
          this.saving.set(false);
          this.dirty = false;
          this.toast.show('admin.paths.builder.save_success', 'success');
          this.router.navigate(['/admin/content/atoms']);
        },
        error: () => {
          this.saving.set(false);
          this.toast.show('admin.paths.builder.save_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  getAtomTypeIcon(type: string): string {
    return ADMIN_ATOM_TYPE_ICONS[type as keyof typeof ADMIN_ATOM_TYPE_ICONS] ?? 'quiz';
  }
}
