/**
 * CollectionsEditComponent — A+ personal collection create + edit form (WS-6b).
 *
 * Routes:
 *   `/a/study/collections/new`                   — create mode (collectionId absent)
 *   `/a/study/collections/:collectionId/edit`    — edit mode (collectionId present)
 *
 * Uses withComponentInputBinding so `:collectionId` maps to the optional
 * `collectionId` signal input. Parent adds both routes to aplus.routes.ts.
 *
 * Form fields (reactive):
 *   - title (required, ≤200 chars)
 *   - description (optional, ≤2000 chars, textarea)
 *   - visibility (radio: private / friends / tenant — ADR-233 D7 audience
 *     vocabulary, shared with atom reuse_visibility. `PUBLIC` is RETIRED: RLS
 *     capped collections at the tenant, so it never was public.)
 *
 * Create mode: POST /api/v1/collections → redirect to /a/study/collections/{new_id}
 * Edit mode: loads existing collection via GET, then PATCH on submit.
 *
 * Fail-loud per feedback_no_stubs_real_wiring: BFF endpoints not yet proxied
 * in chora-gateway (WS-6b-BE-A1). Error surfaces as contract-gap banner.
 *
 * Domain vocabulary: Collection = curated ordered list of LearningAtoms.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { CollectionsService } from '../collections.service';
import type { CollectionVisibility } from '../collections.model';

/** Trims whitespace then enforces maxLength — used for title. */
function maxLengthTrimmed(max: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = (control.value as string)?.trim() ?? '';
    return val.length > max ? { maxlength: { requiredLength: max, actualLength: val.length } } : null;
  };
}

@Component({
  selector: 'chora-aplus-collections-edit',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collections-edit.component.html',
  styleUrl: './collections-edit.component.scss',
})
export class CollectionsEditComponent {
  /** Present in edit mode; absent in create mode. */
  readonly collectionId = input<string>();

  private readonly collectionsService = inject(CollectionsService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  // ── Derived mode ───────────────────────────────────────────────────────
  readonly isEditMode = computed<boolean>(() => !!this.collectionId());

  // ── Edit state (create / update status) ────────────────────────────────
  readonly editState = this.collectionsService.editState;

  readonly isSubmitting = computed<boolean>(() => this.editState().status === 'submitting');
  readonly submitError = computed<string | null>(() => {
    const s = this.editState();
    return s.status === 'error' ? s.error : null;
  });
  readonly isContractGap = computed<boolean>(() => {
    const s = this.editState();
    return s.status === 'error' && s.error === 'aplus.collections.error_gateway_not_wired';
  });

  // ── Load state (edit mode: prefill from detail) ─────────────────────────
  readonly detailState = this.collectionsService.detailState;
  readonly isLoadingDetail = computed<boolean>(() => this.isEditMode() && this.detailState().status === 'loading');
  readonly detailLoadError = computed<string | null>(() => {
    if (!this.isEditMode()) return null;
    const s = this.detailState();
    return s.status === 'error' ? s.error : null;
  });

  // ── Reactive form ───────────────────────────────────────────────────────
  readonly form = this.fb.group({
    title: this.fb.control('', [
      Validators.required,
      Validators.minLength(1),
      maxLengthTrimmed(200),
    ]),
    description: this.fb.control(''),
    visibility: this.fb.control<CollectionVisibility>('private'),
  });

  /**
   * Tracks the title control's touched/value/status changes as a signal. Without
   * this, the `titleError` computed below reads only non-signal control state
   * (touched/valid) so it tracks no dependencies, is memoized at its initial
   * (null) value, and never recomputes after onSubmit() marks the form touched —
   * the validation error would never render. `AbstractControl.events` emits on
   * touched/value/status changes (incl. markAllAsTouched()).
   */
  private readonly titleEvents = toSignal(this.form.controls.title.events, {
    initialValue: null,
  });

  /** Whether the title field has a visible validation error. */
  readonly titleError = computed<string | null>(() => {
    this.titleEvents(); // re-run on any title touched/value/status change
    const ctrl = this.form.controls.title;
    if (!ctrl.touched || ctrl.valid) return null;
    if (ctrl.hasError('required') || ctrl.hasError('minlength')) return 'Title is required.';
    if (ctrl.hasError('maxlength')) return 'Title must be 200 characters or fewer.';
    return 'Invalid title.';
  });

  /** For Storybook / testing introspection. */
  readonly visibility = signal<CollectionVisibility>('private');

  constructor() {
    // In edit mode: load the collection and prefill the form.
    effect(() => {
      const id = this.collectionId();
      if (id) {
        this.collectionsService.loadDetail(id);
      }
    });

    // Prefill form when detail loads in edit mode.
    effect(() => {
      const s = this.detailState();
      if (s.status === 'success' && this.isEditMode()) {
        const col = s.collection;
        this.form.patchValue({
          title: col.title,
          description: col.description ?? '',
          visibility: col.visibility,
        });
        this.visibility.set(col.visibility);
      }
    });

    // Clean up edit state on destroy (not strictly needed but good hygiene).
    effect(() => {
      // intentional no-op read — reset is called in cancel/submit
    });
  }

  onVisibilityChange(v: CollectionVisibility): void {
    this.form.controls.visibility.setValue(v);
    this.visibility.set(v);
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.isSubmitting()) return;

    const { title, description, visibility } = this.form.getRawValue();
    const trimmedTitle = title.trim();

    const id = this.collectionId();
    if (id) {
      // Edit mode — PATCH
      this.collectionsService
        .update(id, {
          title: trimmedTitle,
          description: description.trim() || undefined,
          visibility,
        })
        .pipe(catchError(() => of(null)))
        .subscribe({
          next: (col) => {
            if (col) {
              this.router.navigate(['/a/study/collections', col.collection_id]);
            }
          },
        });
    } else {
      // Create mode — POST
      this.collectionsService
        .create({
          title: trimmedTitle,
          description: description.trim() || undefined,
          visibility,
        })
        .pipe(catchError(() => of(null)))
        .subscribe({
          next: (col) => {
            if (col) {
              this.router.navigate(['/a/study/collections', col.collection_id]);
            }
          },
        });
    }
  }

  onCancel(): void {
    this.collectionsService.resetEditState();
    const id = this.collectionId();
    if (id) {
      this.router.navigate(['/a/study/collections', id]);
    } else {
      this.router.navigate(['/a/study/collections']);
    }
  }
}
