/**
 * MapPreviewCardComponent — the A+ dashboard "live map-preview" wrapper (SP2.3,
 * dashboard-as-hub redesign; map-dominant, the default-first draggable group).
 *
 * The tile is a live MINI fisheye of the learner's LAST VISITED map — it REUSES
 * the unit-tested `ConceptLensMapComponent` render (the same fisheye the full-view
 * canvas draws) fed by that map's painted graph (`MapsService.getGraph`).
 * The WHOLE tile is a single tap target that "zooms in" to the full-view canvas
 * at `/a/knowledge/{goalId}` — the affordance reads "Zoom in" (NOT
 * "Resume"). The embedded lens is rendered decoratively: the canvas is `inert`
 * (removed from the a11y tree + tab order) so the one tile link owns all
 * interaction — there are no nested controls to trip over.
 *
 * Surfaced map = the learner's last-visited map (`LastVisitedMapService`, an
 * FE-only record of the last map opened), falling back to `GoalService.activeGoal`
 * (priority active > maintenance > achieved) when none is recorded or it is
 * gone/retired. No non-retired goal → an empty "add a learning goal" affordance
 * routing to the maps entry `/a/knowledge` (a navigation, never a new backend
 * call). Fail-soft everywhere: a graph-load error/latency shows a calm
 * placeholder while the tile stays a working link, so a degraded map read never
 * breaks the dashboard.
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
import { take } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { GoalService } from '../goal/goal.service';
import type { GoalDTO } from '../goal/goal.model';
import { MapsService } from '../../my-knowledge/maps.service';
import { LastVisitedMapService } from '../../../../../core/services/last-visited-map.service';
import { ConceptLensMapComponent } from '../../my-knowledge/concept-lens-map/concept-lens-map.component';
import type { MapGraph } from '../../my-knowledge/maps.model';
import type {
  ConceptEdge,
  ConceptNode,
} from '../../discovery-graph/concept-graph.model';

/** Load phase of the active map's graph (drives fisheye vs. placeholder). */
type GraphStatus = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'chora-aplus-map-preview-card',
  imports: [RouterLink, TranslatePipe, ConceptLensMapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-preview-card.component.html',
  styleUrl: './map-preview-card.component.scss',
})
export class MapPreviewCardComponent {
  private readonly goalService = inject(GoalService);
  private readonly mapsService = inject(MapsService);
  private readonly lastVisited = inject(LastVisitedMapService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The single map the dashboard surfaces — the learner's LAST VISITED map (a
   * map IS a Goal, ADR-214), so the tile honestly resumes where they were. A
   * learner holds several maps; this is the one to jump back into. Falls back to
   * the highest-priority active goal (active > maintenance > achieved) when no
   * visit is recorded yet, or the last-visited map is gone/retired. `null` (⇒ the
   * empty "add a learning goal" path) only when the learner has no non-retired
   * goal at all.
   */
  readonly surfacedGoal = computed<GoalDTO | null>(() => {
    const lastId = this.lastVisited.lastVisitedId();
    if (lastId) {
      const hit = this.goalService
        .goals()
        .find((g) => g.goalId === lastId && g.status !== 'retired');
      if (hit) return hit;
    }
    return this.goalService.activeGoal();
  });

  /** True when there is a map to preview + zoom into. */
  readonly hasGoal = computed<boolean>(() => this.surfacedGoal() !== null);

  private readonly _graph = signal<MapGraph | null>(null);
  private readonly _graphStatus = signal<GraphStatus>('idle');

  /** The goalId whose graph is loaded — guards the re-fetch effect. */
  private loadedGoalId: string | null = null;

  /**
   * Router commands for the whole-tile link: the active map's full-view canvas,
   * or the maps entry (`/a/knowledge`) when there is no active map yet.
   */
  readonly tileLink = computed<readonly string[]>(() => {
    const g = this.surfacedGoal();
    return g ? ['/a/knowledge', g.goalId] : ['/a/knowledge'];
  });

  // ── Fisheye inputs (from the active map's painted graph) ─────────────
  readonly concepts = computed<readonly ConceptNode[]>(
    () => this._graph()?.concepts ?? [],
  );
  readonly conceptEdges = computed<readonly ConceptEdge[]>(
    () => this._graph()?.edges ?? [],
  );
  readonly rootConceptId = computed<string | undefined>(
    () => this._graph()?.rootConceptId,
  );
  /** The map's title (root-concept title); appended to the tile's aria-label. */
  readonly mapTitle = computed<string>(() => this._graph()?.title ?? '');

  /**
   * The concept the mini fisheye rests on — the map's explicit root (ADR-214),
   * else the first concept. Empty string only for an empty graph (the lens then
   * simply renders nothing — the placeholder covers that case in the template).
   */
  readonly focusId = computed<string>(() => {
    const g = this._graph();
    if (!g) return '';
    return g.rootConceptId ?? g.concepts[0]?.conceptId ?? '';
  });

  /** Show the live fisheye only once a non-empty graph has loaded. */
  readonly showFisheye = computed<boolean>(
    () => this._graphStatus() === 'ready' && this.concepts().length > 0,
  );

  constructor() {
    // Re-fetch the preview graph whenever the active map changes (goals arrive
    // async, so ngOnInit alone would miss the first one). Mirrors the map-canvas
    // goalId effect: read the tracked signal, do the side effect untracked.
    effect(() => {
      const g = this.surfacedGoal();
      untracked(() => this.syncGraph(g?.goalId ?? null));
    });
  }

  /**
   * Load the painted graph for `goalId` (or clear it when there is no active
   * map). Idempotent per goalId (guards the effect's re-runs). Fail-soft: an
   * error resolves to the `error` status (a calm placeholder), never a throw —
   * a degraded map read must not break the dashboard.
   */
  private syncGraph(goalId: string | null): void {
    if (goalId === this.loadedGoalId) return;
    this.loadedGoalId = goalId;
    if (!goalId) {
      this._graph.set(null);
      this._graphStatus.set('idle');
      return;
    }
    this._graph.set(null);
    this._graphStatus.set('loading');
    this.mapsService
      .getGraph(goalId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (graph) => {
          this._graph.set(graph);
          this._graphStatus.set('ready');
        },
        error: () => {
          this._graph.set(null);
          this._graphStatus.set('error');
        },
      });
  }
}
