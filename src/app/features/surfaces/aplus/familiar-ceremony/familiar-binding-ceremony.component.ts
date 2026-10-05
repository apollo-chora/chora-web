/**
 * FamiliarBindingCeremonyComponent — the R3-5 familiar-side Summoning
 * affordance on `/a/companion/:id` (CR §4.2 seam re-cut 2026-07-03: profile →
 * Goal picker → the live `PATCH /goals/{id}` attach — two doors, one backend
 * with the map-side WS-E summon panel, which stays KG territory).
 *
 * MODAL-ONLY overlay (2026-07-08): the trigger now lives in the parent Hero
 * Card. The parent renders this component at the TRUE profile root — a sibling
 * of `.aplus-familiar`, beside `chora-aplus-familiar-stage-up-overlay` — so the
 * fixed overlay escapes the `container-type` / `backdrop-filter` containing
 * blocks that would otherwise trap `position:fixed` inside the narrow column.
 * Open state is parent-owned via the `open` input; the modal never self-hides —
 * it emits `closed` (Esc / backdrop / close button) and the parent flips `open`.
 *
 * Choreography once open (Dale's design language):
 *   → the false→true open edge loads the learner's Goals (GoalService — the
 *     live wire), captures focus into the dialog
 *   → unbound: pick a Goal → "Summon onto this Goal"
 *     (PATCH {attachedFamiliarId}) → on success the ceremony learning-edges
 *     panel reveals + auto-scouts (CHO-2040 R8-3)
 *   → already bound: honest bound line + "Scout growth edges" opens the same
 *     panel for the bound Goal (re-entry without a re-attach).
 *
 * Deliberately NO HTTP until opened — the goals fetch fires on the open edge
 * (keeps the profile page's existing specs hermetic). Attach conflicts (BE
 * 400/409) surface inline, fail-loud.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { GoalService } from '../dashboard/goal/goal.service';
import type { GoalDTO } from '../dashboard/goal/goal.model';
import { CeremonyEdgesPanelComponent } from './ceremony-edges-panel.component';

/** Attach-call state (the PATCH leg). */
type AttachState =
  | { readonly status: 'idle' }
  | { readonly status: 'inflight' }
  | { readonly status: 'error'; readonly error: string };

@Component({
  selector: 'chora-aplus-familiar-binding-ceremony',
  imports: [TranslatePipe, CeremonyEdgesPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-binding-ceremony.component.html',
  styleUrl: './familiar-binding-ceremony.component.scss',
})
export class FamiliarBindingCeremonyComponent {
  private readonly goalService = inject(GoalService);
  private readonly destroyRef = inject(DestroyRef);

  /** The profile page's Familiar — the summon subject. */
  readonly familiarId = input.required<string>();

  /** Parent-owned open state — drives the modal overlay (the modal never self-hides). */
  readonly open = input<boolean>(false);

  /** Emitted on Esc / backdrop / close button — the parent flips `open`. */
  readonly closed = output<void>();

  /** The modal dialog panel — focused on open, the manual focus-trap root. */
  readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');
  /** The learner's picked (not yet attached) Goal. */
  readonly pickedGoalId = signal<string | null>(null);
  readonly attach = signal<AttachState>({ status: 'idle' });
  /**
   * Non-null → the attach succeeded (or the bound Goal was re-entered) and
   * the ceremony learning-edges panel is live for this Goal.
   */
  readonly ceremonyGoalId = signal<string | null>(null);

  readonly goalsState = this.goalService.state;

  /** The Goal already bound to THIS Familiar (non-retired), if any. */
  readonly boundGoal = computed<GoalDTO | null>(() => {
    const s = this.goalsState();
    if (s.status !== 'success') return null;
    return (
      s.items.find(
        (g) =>
          g.attachedFamiliarId === this.familiarId() &&
          g.status !== 'retired',
      ) ?? null
    );
  });

  /** Goals this Familiar could be summoned onto (live, familiar-free). */
  readonly attachableGoals = computed<readonly GoalDTO[]>(() => {
    const s = this.goalsState();
    if (s.status !== 'success') return [];
    return s.items.filter(
      (g) =>
        (g.status === 'active' || g.status === 'maintenance') &&
        !g.attachedFamiliarId,
    );
  });

  readonly attaching = computed<boolean>(
    () => this.attach().status === 'inflight',
  );

  /** The element focused before the modal opened — focus returns here on close. */
  private previouslyFocusedElement: Element | null = null;

  /**
   * Guards the false→true open edge so the Goals fetch + focus capture fire
   * exactly once per open. Reset when the parent closes us, so a re-open
   * (component stays mounted at root) triggers a fresh load + focus capture.
   */
  private openedOnce = false;

  constructor() {
    // On the false→true open edge: remember the trigger, move focus into the
    // dialog, and load the live Goals ONCE (keeps "no HTTP until opened").
    // Mirrors FamiliarStageUpOverlayComponent's focus choreography.
    effect(() => {
      if (this.open()) {
        if (!this.openedOnce) {
          this.openedOnce = true;
          this.previouslyFocusedElement = document.activeElement;
          queueMicrotask(() => this.dialogPanel()?.nativeElement.focus());
          this.goalService.load();
        }
      } else {
        this.openedOnce = false;
      }
    });
  }

  /**
   * Close the modal (Esc / backdrop / close button): restore focus to the
   * trigger and emit `closed`. The parent owns `open` — we never self-hide.
   */
  close(): void {
    this.restoreFocus();
    this.closed.emit();
  }

  /** Escape closes; Tab cycles within the dialog (manual trap, no CDK dep). */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  retryGoals(): void {
    this.goalService.load();
  }

  pickGoal(goalId: string): void {
    if (this.attaching()) return;
    this.pickedGoalId.set(goalId);
  }

  /**
   * The live R3-5 attach: PATCH /api/v1/me/goals/{id}
   * {attachedFamiliarId}. Success reveals the learning-edges panel
   * (auto-scout) and refreshes the goals list so the bond renders.
   */
  summon(): void {
    const goalId = this.pickedGoalId();
    if (!goalId || this.attaching()) return;
    this.attach.set({ status: 'inflight' });
    this.goalService
      .update(goalId, { attachedFamiliarId: this.familiarId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.attach.set({ status: 'idle' });
          this.ceremonyGoalId.set(goalId);
          this.goalService.load(); // reflect the new bond in shared state
        },
        error: (err: unknown) => {
          this.attach.set({ status: 'error', error: this.attachErrorKey(err) });
        },
      });
  }

  /** Re-enter the ceremony for an already-bound Goal (no re-attach). */
  scoutBoundGoal(): void {
    const bound = this.boundGoal();
    if (!bound) return;
    this.ceremonyGoalId.set(bound.goalId);
  }

  /**
   * Display label for a Goal — mirrors the dashboard's precedence:
   * explicit target → conceptSet → kind (translated by the template).
   */
  goalLabel(g: GoalDTO): string {
    const target = g.choraTargetRef?.trim();
    if (target) return target;
    if (g.conceptSet.length > 0) return g.conceptSet.join(', ');
    return '';
  }

  goalKindKey(g: GoalDTO): string {
    return `familiar.ceremony.goal_kind_${g.kind}`;
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

  private attachErrorKey(err: unknown): string {
    const status = (err as { status?: number } | null)?.status ?? 0;
    if (status === 409) return 'familiar.ceremony.bind_error_conflict';
    if (status === 404) return 'familiar.ceremony.error_not_found';
    if (status === 401 || status === 403) {
      return 'familiar.ceremony.error_unauthorised';
    }
    if (status >= 500) return 'familiar.ceremony.error_upstream';
    return 'familiar.ceremony.bind_error';
  }
}
