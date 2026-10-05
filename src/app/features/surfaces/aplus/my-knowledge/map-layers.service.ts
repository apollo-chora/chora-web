/**
 * The map's view-layer state: which lens is active, and whether Roads are drawn
 * (C4 frontend slice 1).
 *
 * This is the SINGLE owner of that state. It used to live inside
 * `MapCanvasComponent`, but the campaign HUD renders outside that component and
 * has to read and flip the same switches; two copies of "which lens is on" would
 * drift the moment either side set one without telling the other.
 *
 * # Hoisting changed the lifetime, so the reset is explicit
 *
 * A component instance dies when the learner opens a different map, which reset
 * the lens for free. A root-provided service does not die, so without
 * `resetFor` the learner would carry the Growth lens from one map onto the next
 * without asking for it. `resetFor` restores that behaviour and makes it
 * testable, and it deliberately resets only on a real map CHANGE: the canvas
 * re-runs it on every refetch, and treating a refetch as a change would throw
 * away a lens the learner picked seconds earlier.
 *
 * # Why Roads default ON
 *
 * The pass-4 mockup ships `roads: true`. A layer nobody discovers is a layer
 * nobody uses, so the toggle exists to turn Roads OFF rather than to find them.
 * The canvas shows the toggle only for a map that HAS a road, so a
 * curiosity-only map is not offered a switch that would do nothing.
 */
import { Injectable, signal } from '@angular/core';

/**
 * The active map lens. `explore` is the neutral structural view; the other three
 * re-emphasise the same nodes (they are overlays, never modes: no capability
 * changes with the lens, per the integrative-UI mandate).
 */
export type MapLens = 'explore' | 'growth' | 'mastery' | 'familiar';

const DEFAULT_LENS: MapLens = 'explore';
const DEFAULT_ROADS_VISIBLE = true;

@Injectable({ providedIn: 'root' })
export class MapLayersService {
  private readonly _lens = signal<MapLens>(DEFAULT_LENS);
  private readonly _roadsVisible = signal<boolean>(DEFAULT_ROADS_VISIBLE);

  /** The goal whose map the current layer state belongs to. */
  private openGoalId: string | null = null;

  /** The active lens. Read by the canvas, the fisheye renderer and the HUD. */
  readonly lens = this._lens.asReadonly();

  /** Whether the Roads layer is drawn. */
  readonly roadsVisible = this._roadsVisible.asReadonly();

  /**
   * Switch the active lens. A pure view-overlay change: it re-emphasises the
   * same nodes and never grants or removes a capability.
   */
  setLens(lens: MapLens): void {
    this._lens.set(lens);
  }

  /** Show or hide the Roads layer. */
  setRoadsVisible(visible: boolean): void {
    this._roadsVisible.set(visible);
  }

  /** Flip the Roads layer. */
  toggleRoads(): void {
    this._roadsVisible.update((v) => !v);
  }

  /**
   * Restore the defaults when the learner opens a DIFFERENT map.
   *
   * A no-op for the map already open, so the canvas can call it on every load
   * without stepping on a choice the learner just made.
   */
  resetFor(goalId: string): void {
    if (this.openGoalId === goalId) return;
    this.openGoalId = goalId;
    this._lens.set(DEFAULT_LENS);
    this._roadsVisible.set(DEFAULT_ROADS_VISIBLE);
  }
}
