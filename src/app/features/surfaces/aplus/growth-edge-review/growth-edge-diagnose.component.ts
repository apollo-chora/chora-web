import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { WeaknessReviewService } from './weakness-review.service';
import {
  StructuredClues,
  WeaknessUploadKind,
} from './weakness-review.models';

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.md'] as const;
const MAX_FILE_BYTES = 32 * 1024 * 1024; // 32 MiB (contract)
const NOTE_MAX = 280; // bounded clarification — NOT a prompt

type DiagnosePhase = 'idle' | 'uploading' | 'failed';

const UPLOAD_KINDS: readonly WeaknessUploadKind[] = [
  'marked_test',
  'notes',
  'scribble',
  'source_material',
];
const SUBJECTS = ['math', 'science', 'languages', 'humanities', 'other'] as const;
const LEVELS = [
  'primary',
  'lower_secondary',
  'upper_secondary',
  'pre_university',
  'other',
] as const;
const CONFIDENCES = ['low', 'medium', 'high'] as const;

/**
 * A+ Growth-Edge structured-clue upload (ADR-205 WS-8) — the "rich clue" door
 * for the graduated diagnosis crew. Steering is DATA, never instruction (D2):
 * bounded pickers (subject / level / confidence) plus ONE optional, length-
 * capped clarification note that never alters the agent's prompt. A textbook
 * (`source_material`) requires a one-tap upload-rights consent (D8). On upload
 * the learner is routed to the bounded HITL review. Ships DARK behind
 * `featureReadyGuard('growth-edge-review')`.
 */
@Component({
  selector: 'chora-aplus-growth-edge-diagnose',
  imports: [TranslatePipe, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './growth-edge-diagnose.component.html',
  styleUrl: './growth-edge-diagnose.component.scss',
})
export class GrowthEdgeDiagnoseComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(WeaknessReviewService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly uploadKinds = UPLOAD_KINDS;
  readonly subjects = SUBJECTS;
  readonly levels = LEVELS;
  readonly confidences = CONFIDENCES;
  readonly noteMax = NOTE_MAX;

  readonly form = this.fb.nonNullable.group({
    upload_kind: this.fb.nonNullable.control<WeaknessUploadKind>('marked_test', {
      validators: Validators.required,
    }),
    subject: this.fb.nonNullable.control(''),
    level: this.fb.nonNullable.control(''),
    confidence: this.fb.nonNullable.control(''),
    note: this.fb.nonNullable.control('', {
      validators: Validators.maxLength(NOTE_MAX),
    }),
    source_material_consent: this.fb.nonNullable.control(false),
  });

  readonly file = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly uploadPhase = signal<DiagnosePhase>('idle');

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    this.fileError.set(null);
    if (!picked) {
      this.file.set(null);
      return;
    }
    const lower = picked.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      this.fileError.set('aplus.growth_edge_review.diag_error_type');
      this.file.set(null);
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      this.fileError.set('aplus.growth_edge_review.diag_error_size');
      this.file.set(null);
      return;
    }
    this.file.set(picked);
  }

  /** Whether a textbook is being uploaded (needs the consent tap, D8). */
  isSourceMaterial(): boolean {
    return this.form.controls.upload_kind.value === 'source_material';
  }

  canSubmit(): boolean {
    if (!this.file() || this.fileError() || this.uploadPhase() === 'uploading') {
      return false;
    }
    if (this.form.invalid) {
      return false;
    }
    if (this.isSourceMaterial() && !this.form.controls.source_material_consent.value) {
      return false;
    }
    return true;
  }

  submit(): void {
    const f = this.file();
    if (!f || !this.canSubmit()) {
      return;
    }
    this.uploadPhase.set('uploading');
    const v = this.form.getRawValue();
    const clues: StructuredClues = {
      subject: v.subject,
      level: v.level,
      confidence: (v.confidence || undefined) as StructuredClues['confidence'],
      note: v.note,
    };
    this.service
      .upload(f, v.upload_kind, clues)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.router.navigate(['/a/growth-edges/review', job.upload_id]);
        },
        error: () => this.uploadPhase.set('failed'),
      });
  }

  kindKey(kind: WeaknessUploadKind): string {
    return `aplus.growth_edge_review.kind_${kind}`;
  }
  subjectKey(subject: string): string {
    return `aplus.growth_edge_review.subject_${subject}`;
  }
  levelKey(level: string): string {
    return `aplus.growth_edge_review.level_${level}`;
  }
  confidenceKey(confidence: string): string {
    return `aplus.growth_edge_review.confidence_${confidence}`;
  }
}
