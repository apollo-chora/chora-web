/**
 * HeaderGoalControlComponent — the A+ "My Knowledge" dashboard header goal
 * control + learning-goals drawer (SP2.8).
 *
 * The trigger shows the learner's surfaced Goal (progress ring / bullseye +
 * name + status badge), or a "Set your first learning goal" CTA when there is
 * none. Tapping it opens a glass drawer (mirrors the my-knowledge map switcher,
 * CHO-2046) offering three real actions:
 *   - SWITCH goal   → navigate to that goal's map (`/a/knowledge/{goalId}`),
 *                     exactly as the map switcher does ("a map IS a Goal");
 *   - ＋ NEW goal    → the existing goal-set picker (GoalService.create);
 *   - LET A FAMILIAR PROPOSE → the growth-edges surface, where the weakness
 *     analyser / Familiar surfaces real learning suggestions (there is no
 *     first-class "Familiar proposes a goal" endpoint yet — flagged as a
 *     follow-up; we route to the real suggestions rather than fabricate one).
 *
 * Self-contained (mirrors the wrapper cards): it injects the root GoalService,
 * READS its `activeGoal` / `goals` signals, and refreshes via `load()` only
 * after a create. The shell owns the initial `GoalService.load()`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { GoalService } from '../goal/goal.service';
import { GoalPickerComponent } from '../goal/goal-picker.component';
import { GoalProgressRingComponent } from '../goal/goal-progress-ring.component';
import type { GoalDTO } from '../goal/goal.model';

@Component({
  selector: 'chora-aplus-header-goal-control',
  imports: [TranslatePipe, GoalPickerComponent, GoalProgressRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header-goal-control.component.html',
  styleUrl: './header-goal-control.component.scss',
})
export class HeaderGoalControlComponent {
  private readonly goalService = inject(GoalService);
  private readonly router = inject(Router);

  /** The single surfaced Goal (active > maintenance > achieved; never retired). */
  readonly activeGoal = this.goalService.activeGoal;

  /** Every non-retired goal — the switch list. */
  readonly switchableGoals = computed<readonly GoalDTO[]>(() =>
    this.goalService.goals().filter((g) => g.status !== 'retired'),
  );

  /** Human label for the active goal — its target, else its concepts, else ''. */
  readonly goalDisplay = computed<string>(() => this.displayFor(this.activeGoal()));

  /** i18n key for the active goal's kind (the name fallback when display is ''). */
  readonly goalKindLabelKey = computed<string>(() => {
    const g = this.activeGoal();
    return g ? `aplus.dashboard.goal.kind_${g.kind}` : '';
  });

  /** i18n key for the active goal's status badge. */
  readonly goalStatusKey = computed<string>(() => {
    const g = this.activeGoal();
    return g ? `aplus.dashboard.goal.status_${g.status}` : '';
  });

  /** Semantic badge class for the goal status (NOT a faked %). */
  readonly goalStatusClass = computed<string>(() => {
    switch (this.activeGoal()?.status) {
      case 'achieved':
        return 'badge-success';
      case 'maintenance':
        return 'badge-warning';
      default:
        return 'badge-info';
    }
  });

  /** Whether the learning-goals drawer is open. */
  readonly drawerOpen = signal<boolean>(false);
  /** Whether the new-goal picker modal is open. */
  readonly pickerOpen = signal<boolean>(false);

  /** Fixed anchor for the dropdown popover, computed from the trigger on open
   *  so the goals list drops BELOW the header control (not a full-height left
   *  slab overlapping the sidebar). Viewport-clamped. */
  readonly popoverTop = signal<number>(0);
  readonly popoverLeft = signal<number>(0);
  readonly popoverMaxHeight = signal<number>(560);
  /** Offsets to fill the viewport with the click-catcher backdrop (see below). */
  readonly backdropTop = signal<number>(0);
  readonly backdropLeft = signal<number>(0);
  private static readonly POPOVER_WIDTH = 360;

  // ── Drawer (anchored dropdown popover) ────────────────────────────────
  openDrawer(ev?: Event): void {
    const trigger = ev?.currentTarget as HTMLElement | null;
    if (trigger && typeof trigger.getBoundingClientRect === 'function') {
      const r = trigger.getBoundingClientRect();
      // A glass ancestor (`backdrop-filter`) is the containing block for our
      // `position: fixed` popover, so `top/left` are relative to IT, not the
      // viewport. Compensate by its offset so the popover lands at the trigger's
      // true viewport position (and the backdrop still covers the whole screen).
      const cb = this.fixedContainingBlockOffset(trigger);
      const maxLeft = window.innerWidth - HeaderGoalControlComponent.POPOVER_WIDTH - 16;
      this.popoverTop.set(r.bottom - cb.top + 8);
      this.popoverLeft.set(Math.max(16, Math.min(r.left, maxLeft)) - cb.left);
      // Cap the height to the room below the trigger so the actions never fall
      // off the bottom of the viewport (the list scrolls inside if it is long).
      this.popoverMaxHeight.set(Math.max(220, window.innerHeight - r.bottom - 24));
      this.backdropTop.set(-cb.top);
      this.backdropLeft.set(-cb.left);
    }
    this.drawerOpen.set(true);
  }

  /**
   * Viewport offset of the nearest ancestor that establishes a containing block
   * for `position: fixed` descendants (a `transform` / `filter` /
   * `backdrop-filter` / `perspective`). `{0,0}` when none (true viewport).
   */
  private fixedContainingBlockOffset(from: HTMLElement): { top: number; left: number } {
    let el = from.parentElement;
    while (el && el !== document.body && typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(el);
      if (
        cs.transform !== 'none' ||
        cs.filter !== 'none' ||
        (cs.backdropFilter && cs.backdropFilter !== 'none') ||
        cs.perspective !== 'none'
      ) {
        const rr = el.getBoundingClientRect();
        return { top: rr.top, left: rr.left };
      }
      el = el.parentElement;
    }
    return { top: 0, left: 0 };
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  // ── Switch goal (a map IS a Goal — navigate to its map) ───────────────
  switchToGoal(goalId: string): void {
    this.closeDrawer();
    void this.router.navigate(['/a/knowledge', goalId]);
  }

  // ── New goal (picker) ─────────────────────────────────────────────────
  openPicker(): void {
    this.closeDrawer();
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  /** A goal was created — close the picker + drawer + refresh the goals. */
  onGoalCreated(_goal: GoalDTO): void {
    this.pickerOpen.set(false);
    this.drawerOpen.set(false);
    this.goalService.load();
  }

  // ── Let a Familiar propose one ────────────────────────────────────────
  /**
   * No first-class "Familiar proposes a goal" endpoint exists yet; route to the
   * growth-edges surface, where the weakness analyser / Familiar surfaces real
   * learning suggestions the learner can turn into an edge-goal.
   */
  proposeViaFamiliar(): void {
    this.closeDrawer();
    void this.router.navigate(['/a/growth-edges']);
  }

  // ── Display helpers ───────────────────────────────────────────────────
  /** target → conceptSet → '' (kind label is the template fallback). */
  displayFor(g: GoalDTO | null): string {
    if (!g) return '';
    const target = g.choraTargetRef?.trim();
    if (target) return target;
    if (g.conceptSet.length > 0) return g.conceptSet.join(', ');
    return '';
  }

  /** i18n key for a goal's kind (row-name fallback). */
  kindKeyFor(g: GoalDTO): string {
    return `aplus.dashboard.goal.kind_${g.kind}`;
  }

  /** True when this goal is the currently-surfaced one. */
  isCurrent(g: GoalDTO): boolean {
    return g.goalId === this.activeGoal()?.goalId;
  }
}
