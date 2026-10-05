/**
 * GoalPickerComponent — minimal goal-set modal (ADR-204 §2, Slice G lens half).
 *
 * Deliberately NOT the full conversational / seed-first onboarding (deferred) —
 * a small Topology-C overlay that lets a learner set ONE goal: a kind selector,
 * a single target/topic field (kind-driven label), and an optional north-star
 * note. Mirrors the KgSeedFormComponent seam: it owns the `GoalService.create`
 * side-effect, surfaces the BE 422 INVALID_GOAL inline (fail-loud, no swallow),
 * and emits `(created)` on success — the parent (dashboard) refreshes + closes.
 *
 * Per chora-web CLAUDE.md §3 — standalone, signal state, OnPush, reactive form.
 * a11y (CLAUDE.md §10): role=dialog + aria-modal, Escape to cancel, focus trap,
 * focus restore (the proven mana-topup-modal / confirm-dialog pattern).
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  AbstractControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
  NonNullableFormBuilder,
} from '@angular/forms';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { GoalService } from './goal.service';
import {
  GoalDTO,
  GoalKind,
  GoalMutationError,
  CreateGoalRequest,
  kindRequiresTarget,
  mapGoalMutationError,
} from './goal.model';

/** Rejects an empty / whitespace-only value (Validators.required passes "   "). */
function nonBlankValidator(ctrl: AbstractControl): ValidationErrors | null {
  return String(ctrl.value ?? '').trim().length > 0 ? null : { required: true };
}

@Component({
  selector: 'chora-aplus-goal-picker',
  imports: [ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goal-picker.component.html',
  styleUrl: './goal-picker.component.scss',
})
export class GoalPickerComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly goalService = inject(GoalService);

  /** Selectable kinds in template order (curiosity first — the default lens). */
  readonly GOAL_KINDS: readonly GoalKind[] = [
    'curiosity',
    'cert',
    'course',
    'path',
    'theme_mastery',
    'edge',
  ];

  /**
   * One `target` control serves both roles: the curiosity TOPIC (→ conceptSet)
   * and the credential TARGET (→ choraTargetRef). It is always required in the
   * UI — the picker must know what the goal is about; this never violates the
   * contract's "curiosity allows no target" (a curiosity topic is a conceptSet,
   * not a choraTargetRef). The BE 422 remains the validator of record.
   */
  readonly form = this.fb.group({
    kind: this.fb.control<GoalKind>('curiosity', { validators: [Validators.required] }),
    target: this.fb.control<string>('', {
      validators: [nonBlankValidator, Validators.maxLength(160)],
    }),
    northStarNote: this.fb.control<string>('', {
      validators: [Validators.maxLength(280)],
    }),
  });

  readonly submitting = signal<boolean>(false);
  readonly submitError = signal<GoalMutationError | null>(null);

  /** Emitted with the new goal on success (parent refreshes + closes). */
  readonly created = output<GoalDTO>();
  /** Emitted on Cancel / Escape / backdrop click (parent closes). */
  readonly cancelled = output<void>();

  readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');
  private previouslyFocusedElement: Element | null = null;

  /** Credential kinds need a choraTargetRef; curiosity uses a topic instead. */
  get requiresTarget(): boolean {
    return kindRequiresTarget(this.form.controls.kind.value);
  }

  constructor() {
    // Capture the trigger (the "Set a goal" CTA) so focus can be restored.
    this.previouslyFocusedElement = document.activeElement;
    effect(() => {
      // Reading the viewChild signal re-fires this once the panel resolves.
      const panel = this.dialogPanel();
      if (panel) queueMicrotask(() => panel.nativeElement.focus());
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;
    const { kind, target, northStarNote } = this.form.getRawValue();
    const note = northStarNote.trim();
    const notePart = note ? { northStarNote: note } : {};
    const req: CreateGoalRequest = this.requiresTarget
      ? { kind, choraTargetRef: target.trim(), ...notePart }
      : { kind, conceptSet: this.parseConcepts(target), ...notePart };

    this.submitting.set(true);
    this.submitError.set(null);
    this.goalService.create(req).subscribe({
      next: (goal) => {
        this.submitting.set(false);
        this.restoreFocus();
        this.created.emit(goal);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.submitError.set(mapGoalMutationError(err));
      },
    });
  }

  onCancel(): void {
    if (this.submitting()) return;
    this.restoreFocus();
    this.cancelled.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
      return;
    }
    if (event.key === 'Tab') this.trapFocus(event);
  }

  /** Split a comma-separated topic string into a trimmed, de-blanked conceptSet. */
  private parseConcepts(raw: string): string[] {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.dialogPanel()?.nativeElement;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first || document.activeElement === panel) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private restoreFocus(): void {
    if (this.previouslyFocusedElement instanceof HTMLElement) {
      this.previouslyFocusedElement.focus();
    }
    this.previouslyFocusedElement = null;
  }
}
