/**
 * NotificationsTickerComponent — the A+ dashboard-as-hub CONDITIONAL ticker
 * (SP2.7). A lean strip that sits between the header and the draggable groups
 * and surfaces transient nudges: celebration one-shots (streak moved to the
 * header today-strip — it is ambient, not transient; this also kills the
 * former double-render)
 * (grew-edge 🌱 / goal-graduated 🎓), and a due-review nudge ("N concepts due").
 *
 * CONDITIONAL by contract: when it has zero items the component renders NOTHING
 * (the host collapses) and `hasItems()` reports false so the shell can gate its
 * own `@if`. Belt-and-braces — the template root is itself `@if (hasItems())`.
 *
 * Every item is REAL — no item is fabricated:
 *   - grew-edge 🌱 ← `GrowthEdgesService.list()` + `GrownEdgeTrackerService`
 *                    (the same honest detector the dashboard + growth-edges page
 *                    use — the tracker's localStorage baseline dedups so the
 *                    first surface after a grow celebrates, never twice).
 *   - goal 🎓      ← `GoalService.goals()` + `GraduatedGoalTrackerService`.
 *   - due          ← `DailyDoseService.dose().atom_breakdown.ebbinghaus`
 *                    (the spaced-repetition/overdue bucket; item only when > 0).
 *
 * Familiar-hatched celebrations and tenant-news are intentionally ABSENT — no
 * real FE signal exists for either (see the component's SP2.7 report). We refuse
 * to fabricate them rather than render a hollow item.
 *
 * Not persistent: items are dismissable in-memory only (no localStorage) — a
 * reload re-derives them from the live signals; the celebration one-shots are
 * already deduped by their trackers, so a dismissed celebration stays gone.
 *
 * Per chora-web CLAUDE.md §3 — standalone, signal state, OnPush, BFF-only HTTP.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, take } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { GoalService } from '../goal/goal.service';
import {
  GrowthEdgesService,
  type GrowthEdge,
} from '../../growth-edges/growth-edges.service';
import { GrownEdgeTrackerService } from '../../../../../core/services/grown-edge-tracker.service';
import { GraduatedGoalTrackerService } from '../../../../../core/services/graduated-goal-tracker.service';
import { DailyDoseService } from '../../daily-dose/daily-dose.service';
import type { GoalDTO } from '../goal/goal.model';

/**
 * A single ticker entry. Discriminated on `kind` so the template renders each
 * kind's copy explicitly (no overloaded fields) while the list stays a plain,
 * ordered, testable array.
 */
export type TickerItem =
  | {
      readonly kind: 'celebration-edge';
      readonly id: string;
      readonly conceptLabel: string;
      readonly extraCount: number;
    }
  | { readonly kind: 'celebration-goal'; readonly id: string; readonly goalLabel: string }
  | { readonly kind: 'due'; readonly id: string; readonly count: number };

/** Stable ids — at most one of each kind, so a per-kind id is enough for
 *  `@for` tracking + dismissal. */
const ID_EDGE = 'ticker-celebration-edge';
const ID_GOAL = 'ticker-celebration-goal';
const ID_DUE = 'ticker-due';

@Component({
  selector: 'chora-aplus-notifications-ticker',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications-ticker.component.html',
  styleUrl: './notifications-ticker.component.scss',
})
export class NotificationsTickerComponent {
  private readonly goalService = inject(GoalService);
  private readonly growthEdgesService = inject(GrowthEdgesService);
  private readonly grownEdgeTracker = inject(GrownEdgeTrackerService);
  private readonly graduatedGoalTracker = inject(GraduatedGoalTrackerService);
  private readonly dailyDoseService = inject(DailyDoseService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Due-review (real: today's dose ebbinghaus/overdue bucket) ─────────
  private readonly dueCount = computed<number>(
    () => this.dailyDoseService.dose()?.atom_breakdown?.ebbinghaus ?? 0,
  );

  // ── Celebration one-shots (set once by the detectors below) ───────────
  private readonly grewEdge = signal<{
    conceptLabel: string;
    extraCount: number;
  } | null>(null);
  private readonly goalGraduation = signal<{ goalLabel: string } | null>(null);
  /** Guards the goals-detection effect so it runs at most once. */
  private graduationDetected = false;

  /** Ids the learner dismissed this session (in-memory, non-persistent). */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set<string>());

  /**
   * The ordered ticker items derived from the live signals, BEFORE dismissal.
   * Order: celebrations (edge → goal) lead as rare joyful rewards, then the
   * actionable due nudge.
   */
  private readonly allItems = computed<readonly TickerItem[]>(() => {
    const items: TickerItem[] = [];

    const edge = this.grewEdge();
    if (edge) {
      items.push({
        kind: 'celebration-edge',
        id: ID_EDGE,
        conceptLabel: edge.conceptLabel,
        extraCount: edge.extraCount,
      });
    }

    const grad = this.goalGraduation();
    if (grad) {
      items.push({
        kind: 'celebration-goal',
        id: ID_GOAL,
        goalLabel: grad.goalLabel,
      });
    }

    const due = this.dueCount();
    if (due > 0) {
      items.push({ kind: 'due', id: ID_DUE, count: due });
    }

    return items;
  });

  /** The VISIBLE items — the derived set minus anything dismissed this session. */
  readonly items = computed<readonly TickerItem[]>(() => {
    const gone = this.dismissed();
    return this.allItems().filter((i) => !gone.has(i.id));
  });

  /**
   * Public: true when the ticker has at least one visible item. The shell reads
   * this to decide whether to render the ticker slot at all (CONDITIONAL).
   */
  readonly hasItems = computed<boolean>(() => this.items().length > 0);

  constructor() {
    // Grew-edge celebration: fetch the shakiest-first edges INCLUDING grown
    // ones and detect newly-grown once. SOFT-FAIL to empty — a degraded
    // growth-edges upstream must never break the dashboard (mirrors
    // DashboardComponent.loadGrowthEdges).
    this.growthEdgesService
      .list({ sort: 'strength_desc', include_grown: true, page_size: 50 })
      .pipe(
        map((page) => page.items),
        catchError(() => of<GrowthEdge[]>([])),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((edges) => {
        const newly = this.grownEdgeTracker.detectNewlyGrown(edges);
        if (newly.length > 0) {
          this.grewEdge.set({
            conceptLabel: newly[0].concept_label,
            extraCount: newly.length - 1,
          });
        }
      });

    // Goal-graduation celebration: goals load async, so detect once they are
    // present. Guarded to run at most once (the tracker also dedups across
    // reloads via its per-learner localStorage baseline).
    effect(() => {
      const goals = this.goalService.goals();
      if (this.graduationDetected || goals.length === 0) return;
      untracked(() => this.detectGoalGraduation(goals));
    });
  }

  /** Dismiss one item by id (in-memory, non-persistent). */
  dismiss(id: string): void {
    this.dismissed.update((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  private detectGoalGraduation(goals: readonly GoalDTO[]): void {
    this.graduationDetected = true;
    const newly = this.graduatedGoalTracker.detectNewlyGraduated(
      goals.map((g) => ({ id: g.goalId, status: g.status })),
    );
    if (newly.length === 0) return;
    const graduated = goals.find((g) => g.goalId === newly[0].id);
    if (!graduated) return;
    this.goalGraduation.set({ goalLabel: this.goalLabelFor(graduated) });
  }

  /**
   * Display label for a graduated goal — target ref, else its concept set, else
   * its north-star note, else '' (the template then shows only the celebratory
   * phrase). Never a fabricated placeholder.
   */
  private goalLabelFor(g: GoalDTO): string {
    const target = g.choraTargetRef?.trim();
    if (target) return target;
    if (g.conceptSet.length > 0) return g.conceptSet.join(', ');
    return g.northStarNote?.trim() ?? '';
  }
}
