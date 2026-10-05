/**
 * SummonWizardComponent — the A+ Cast "summon a Familiar to a learning goal"
 * step-by-step modal (SP2.5, dashboard-as-hub redesign).
 *
 * Familiars are DECOUPLED from maps: any Familiar → any Goal. The bond is the
 * real ADR-212 D5 goal→Familiar attach, persisted on the Goal
 * (`Goal.attachedFamiliarId`) and mutated via `PATCH /api/v1/me/goals/{id}`
 * (`GoalService.update`). The backend enforces a strict 1:1 bond
 * (`ErrAlreadyAttached` → 409): a Goal holds at most ONE Familiar. So:
 *   - a goal with NO Familiar        → attach directly (one PATCH).
 *   - a goal already bound to THIS   → idempotent re-attach (one PATCH).
 *   - a goal bound to a DIFFERENT one → the conflict step:
 *       • Replace   → detach the old + attach this (two PATCHes; 1:1 needs both).
 *       • Keep both → leave the existing binding untouched (NO PATCH). A goal
 *                     cannot hold two Familiars, so "both" means both survive —
 *                     the goal keeps its Familiar and this one stays free to
 *                     summon elsewhere. Nothing is faked (no-stub rule).
 *
 * Fail-loud: a PATCH failure surfaces an inline alert with a Retry — it NEVER
 * fabricates a summon success. On success it refreshes `GoalService` (so the
 * new binding is reflected) and emits `summoned(goalId)`; the parent closes.
 *
 * Per chora-web CLAUDE.md §3 — standalone, signal state, OnPush, BFF-only HTTP
 * (via GoalService). a11y (§10): role=dialog + aria-modal, Escape to close,
 * focus trap + restore (the proven goal-picker / confirm-dialog pattern).
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { switchMap, take } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { DashboardService } from '../dashboard.service';
import { GoalService } from '../goal/goal.service';
import type { FamiliarRosterItem } from '../dashboard.model';
import type { GoalDTO } from '../goal/goal.model';

/** Wizard flow step. `conflict` only appears for a goal bound to another Familiar. */
type WizardStep = 'pick' | 'conflict' | 'confirm';

/** Confirm mode: a plain attach, or a detach-then-attach replace (1:1 bond). */
type SummonMode = 'attach' | 'replace';

@Component({
  selector: 'chora-aplus-summon-wizard',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './summon-wizard.component.html',
  styleUrl: './summon-wizard.component.scss',
})
export class SummonWizardComponent {
  private readonly goalService = inject(GoalService);
  private readonly dashboardService = inject(DashboardService);

  /** The Familiar being summoned (the tapped Cast member). */
  readonly familiar = input.required<FamiliarRosterItem>();

  /** Emitted on Cancel / Escape / backdrop / "Keep both" (parent closes). */
  readonly closed = output<void>();
  /** Emitted with the goalId on a successful summon (parent closes + reflects). */
  readonly summoned = output<string>();

  readonly step = signal<WizardStep>('pick');
  readonly selectedGoal = signal<GoalDTO | null>(null);
  readonly mode = signal<SummonMode>('attach');
  readonly submitting = signal<boolean>(false);
  readonly errorKey = signal<string | null>(null);

  /**
   * Summonable goals — every live goal except retired ones (you don't summon a
   * Familiar to a retired map). Read straight off the shared GoalService signal;
   * DashboardComponent already `load()`s it.
   */
  readonly summonableGoals = () =>
    this.goalService.goals().filter((g) => g.status !== 'retired');

  /**
   * The name of the Familiar already bound to the selected goal (for the conflict
   * copy). Resolved from the shared roster by id; empty when the bound Familiar is
   * not in the current roster (the conflict copy then falls back to a generic label).
   */
  readonly conflictFamiliarName = (): string => {
    const fid = this.selectedGoal()?.attachedFamiliarId;
    if (!fid) return '';
    const roster = this.dashboardService.summary()?.familiars ?? [];
    return roster.find((f) => f.familiar_id === fid)?.name ?? '';
  };

  readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');
  private previouslyFocusedElement: Element | null = null;

  constructor() {
    this.previouslyFocusedElement = document.activeElement;
    effect(() => {
      const panel = this.dialogPanel();
      if (panel) queueMicrotask(() => panel.nativeElement.focus());
    });
  }

  /** The visible free-text title for a goal, or '' when it has none (kind label then). */
  goalTitle(g: GoalDTO): string {
    return (g.northStarNote ?? '').trim();
  }

  /** i18n key for a goal's kind label — the fallback when it has no note. */
  goalKindKey(g: GoalDTO): string {
    switch (g.kind) {
      case 'curiosity':
        return 'aplus.dashboard.cast.summon.kind_curiosity';
      case 'theme_mastery':
        return 'aplus.dashboard.cast.summon.kind_theme';
      case 'edge':
        return 'aplus.dashboard.cast.summon.kind_edge';
      default:
        return 'aplus.dashboard.cast.summon.kind_generic';
    }
  }

  /** Step 1 → pick a goal. Route to the conflict step only when it already holds
   *  a DIFFERENT Familiar; otherwise (empty or same) go straight to confirm. */
  pickGoal(g: GoalDTO): void {
    this.selectedGoal.set(g);
    this.errorKey.set(null);
    const bound = g.attachedFamiliarId;
    if (bound && bound !== this.familiar().familiar_id) {
      this.mode.set('replace');
      this.step.set('conflict');
    } else {
      this.mode.set('attach');
      this.step.set('confirm');
    }
  }

  /** Conflict → Replace: detach the old Familiar, then attach this one. */
  chooseReplace(): void {
    this.mode.set('replace');
    this.step.set('confirm');
  }

  /** Conflict → Keep both: the 1:1 bond can't hold two — leave the existing
   *  binding untouched (no mutation) and close. Both Familiars survive. */
  chooseKeepBoth(): void {
    this.restoreFocus();
    this.closed.emit();
  }

  /** Confirm → run the real summon (attach, or detach-then-attach for replace). */
  onConfirm(): void {
    const g = this.selectedGoal();
    if (!g || this.submitting()) return;
    const fid = this.familiar().familiar_id;
    this.submitting.set(true);
    this.errorKey.set(null);

    const attach$ =
      this.mode() === 'replace'
        ? this.goalService.update(g.goalId, { detachFamiliar: true }).pipe(
            switchMap(() =>
              this.goalService.update(g.goalId, { attachedFamiliarId: fid }),
            ),
          )
        : this.goalService.update(g.goalId, { attachedFamiliarId: fid });

    attach$.pipe(take(1)).subscribe({
      next: () => {
        this.submitting.set(false);
        // Refresh so the new binding (+ derived lens) is reflected everywhere.
        this.goalService.load();
        this.restoreFocus();
        this.summoned.emit(g.goalId);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorKey.set(this.mapSummonError(err));
      },
    });
  }

  /** Back one step (confirm/conflict → pick). */
  goBack(): void {
    if (this.submitting()) return;
    this.errorKey.set(null);
    this.step.set('pick');
    this.selectedGoal.set(null);
    this.mode.set('attach');
  }

  onCancel(): void {
    if (this.submitting()) return;
    this.restoreFocus();
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
      return;
    }
    if (event.key === 'Tab') this.trapFocus(event);
  }

  /** Map a summon PATCH failure to an i18n key — never a raw BE body (Security). */
  private mapSummonError(err: unknown): string {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? (err as { status?: number }).status
        : undefined;
    if (status === 404) return 'aplus.dashboard.cast.summon.error_not_found';
    if (status === 409) return 'aplus.dashboard.cast.summon.error_conflict';
    if (typeof status === 'number' && status >= 500) {
      return 'aplus.dashboard.cast.summon.error_upstream';
    }
    return 'aplus.dashboard.cast.summon.error_generic';
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
