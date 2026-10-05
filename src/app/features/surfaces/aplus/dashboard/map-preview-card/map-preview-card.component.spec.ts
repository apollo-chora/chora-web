import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject, of, throwError } from 'rxjs';

import { MapPreviewCardComponent } from './map-preview-card.component';
import { GoalService } from '../goal/goal.service';
import { MapsService } from '../../my-knowledge/maps.service';
import { LastVisitedMapService } from '../../../../../core/services/last-visited-map.service';
import type { GoalDTO } from '../goal/goal.model';
import type { MapGraph } from '../../my-knowledge/maps.model';

/**
 * MapPreviewCardComponent spec — the A+ dashboard "live map-preview" wrapper
 * (SP2.3, map-dominant, default first). It surfaces a live mini fisheye of the
 * learner's ACTIVE map (reusing `ConceptLensMapComponent`) and makes the WHOLE
 * tile a single tap target → the full-view canvas at `/a/knowledge/{goalId}`,
 * labelled "Zoom in" (NOT "Resume"). No active goal → a "start / pick a map"
 * affordance routing to the maps entry `/a/knowledge`.
 *
 * i18n test contract: the translate pipe emits RAW keys in tests, so we assert
 * on data-testid + routerLink hrefs, never translated copy.
 */

// ── Fakes ────────────────────────────────────────────────────────────────
// A tiny GoalService fake: the card only reads `activeGoal` (a signal). We back
// it with a writable signal so tests can flip active/empty and re-active.
function makeGoalMock(active: GoalDTO | null = null, all: readonly GoalDTO[] = []) {
  const activeGoal = signal<GoalDTO | null>(active);
  const goals = signal<readonly GoalDTO[]>(all);
  return { activeGoal, goals };
}
type GoalMock = ReturnType<typeof makeGoalMock>;

// A LastVisitedMapService fake: the card reads `lastVisitedId` (a signal) to
// prefer the last-opened map over the active one (fallback when null/absent).
function makeLastVisitedMock(lastId: string | null = null) {
  const lastVisitedId = signal<string | null>(lastId);
  return { lastVisitedId };
}
type LastVisitedMock = ReturnType<typeof makeLastVisitedMock>;

// A MapsService fake: the card only calls `getGraph(goalId)`. Default returns a
// small real-shaped painted graph; tests override for loading / error paths.
function makeMapsMock(graph: MapGraph = mapGraph()) {
  const getGraph = vi.fn((_goalId: string) => of(graph));
  return { getGraph };
}
type MapsMock = ReturnType<typeof makeMapsMock>;

function goal(over: Partial<GoalDTO> = {}): GoalDTO {
  return {
    goalId: 'g1',
    kind: 'curiosity',
    conceptSet: [],
    status: 'active',
    northStarNote: 'Master fractions',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

/** Root "Fractions" → one child; the minimal painted map graph. */
function mapGraph(over: Partial<MapGraph> = {}): MapGraph {
  return {
    goalId: 'g1',
    title: 'Fractions',
    rootConceptId: 'root',
    concepts: [
      { conceptId: 'root', title: 'Fractions', atomRefs: [] },
      { conceptId: 'num', title: 'Numerator', atomRefs: [] },
    ],
    edges: [
      {
        edgeId: 'e1',
        sourceConceptId: 'root',
        targetConceptId: 'num',
        class: 'hierarchy',
        provenance: 'learner_authored',
      },
    ],
    ...over,
  };
}

function build(
  goals: GoalMock,
  maps: MapsMock,
  lastVisited: LastVisitedMock = makeLastVisitedMock(),
): ComponentFixture<MapPreviewCardComponent> {
  TestBed.configureTestingModule({
    imports: [MapPreviewCardComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: GoalService, useValue: goals },
      { provide: MapsService, useValue: maps },
      { provide: LastVisitedMapService, useValue: lastVisited },
    ],
  });
  const fixture = TestBed.createComponent(MapPreviewCardComponent);
  // Two CD passes: the first flushes the graph-fetch effect (writes the graph
  // signals); the second renders the fisheye that now depends on them.
  fixture.detectChanges();
  fixture.detectChanges();
  return fixture;
}

function testid(
  fixture: ComponentFixture<MapPreviewCardComponent>,
  id: string,
): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
}

describe('MapPreviewCardComponent', () => {
  let goals: GoalMock;
  let maps: MapsMock;

  beforeEach(() => {
    TestBed.resetTestingModule();
    goals = makeGoalMock();
    maps = makeMapsMock();
  });

  it('renders the preview tile', () => {
    goals.activeGoal.set(goal());
    const fixture = build(goals, maps);
    expect(testid(fixture, 'aplus-dashboard-map-preview')).toBeTruthy();
  });

  it('shows the "Zoom in" label (not "Resume") for an active goal', () => {
    goals.activeGoal.set(goal());
    const fixture = build(goals, maps);
    const zoom = testid(fixture, 'aplus-dashboard-map-preview-zoom');
    expect(zoom).toBeTruthy();
    // Raw i18n key in tests — the copy is "Zoom in", never "Resume".
    expect(zoom?.textContent).toContain('aplus.dashboard.map_preview.zoom_in');
    expect(zoom?.textContent?.toLowerCase()).not.toContain('resume');
  });

  it('routes the whole tile to /a/knowledge/{goalId} for a goal', () => {
    goals.activeGoal.set(goal({ goalId: 'g-42' }));
    maps = makeMapsMock(mapGraph({ goalId: 'g-42' }));
    const fixture = build(goals, maps);
    const tile = testid(fixture, 'aplus-dashboard-map-preview');
    expect(tile?.getAttribute('href')).toBe('/a/knowledge/g-42');
  });

  it('surfaces the LAST VISITED map over the active one and routes to it', () => {
    const active = goal({ goalId: 'g-active', status: 'active' });
    const visited = goal({
      goalId: 'g-visited',
      status: 'active',
      northStarNote: 'Solar System',
    });
    goals = makeGoalMock(active, [active, visited]);
    maps = makeMapsMock(mapGraph({ goalId: 'g-visited' }));
    const fixture = build(goals, maps, makeLastVisitedMock('g-visited'));
    // The tile resumes the LAST-VISITED map, not the (different) active one.
    expect(testid(fixture, 'aplus-dashboard-map-preview')?.getAttribute('href')).toBe(
      '/a/knowledge/g-visited',
    );
  });

  it('falls back to the active map when the last-visited goal is retired', () => {
    const active = goal({ goalId: 'g-active', status: 'active' });
    const retired = goal({ goalId: 'g-old', status: 'retired' });
    goals = makeGoalMock(active, [active, retired]);
    maps = makeMapsMock(mapGraph({ goalId: 'g-active' }));
    const fixture = build(goals, maps, makeLastVisitedMock('g-old'));
    expect(testid(fixture, 'aplus-dashboard-map-preview')?.getAttribute('href')).toBe(
      '/a/knowledge/g-active',
    );
  });

  it('falls back to the active map when the last-visited id matches no goal', () => {
    const active = goal({ goalId: 'g-active', status: 'active' });
    goals = makeGoalMock(active, [active]);
    maps = makeMapsMock(mapGraph({ goalId: 'g-active' }));
    const fixture = build(goals, maps, makeLastVisitedMock('g-ghost'));
    expect(testid(fixture, 'aplus-dashboard-map-preview')?.getAttribute('href')).toBe(
      '/a/knowledge/g-active',
    );
  });

  it('fetches the active map graph by goalId', () => {
    goals.activeGoal.set(goal({ goalId: 'g-77' }));
    maps = makeMapsMock(mapGraph({ goalId: 'g-77' }));
    build(goals, maps);
    expect(maps.getGraph).toHaveBeenCalledWith('g-77');
  });

  it('renders the live fisheye (reuses the concept-lens render) when the graph loads', () => {
    goals.activeGoal.set(goal());
    const fixture = build(goals, maps);
    // The reused ConceptLensMapComponent renders its own testid'd root + scene.
    expect(testid(fixture, 'concept-lens-map')).toBeTruthy();
    expect(testid(fixture, 'concept-lens-scene')).toBeTruthy();
    // The fisheye lives inside an INERT, decorative canvas (whole tile navigates).
    const canvas = testid(fixture, 'aplus-dashboard-map-preview-canvas');
    expect(canvas).toBeTruthy();
    expect(canvas?.hasAttribute('inert')).toBe(true);
  });

  it('shows a placeholder (not the fisheye) while the graph is loading', () => {
    goals.activeGoal.set(goal());
    // A never-emitting stream keeps the card in the loading state.
    maps = { getGraph: vi.fn(() => new Subject<MapGraph>().asObservable()) };
    const fixture = build(goals, maps);
    expect(testid(fixture, 'concept-lens-scene')).toBeFalsy();
    expect(testid(fixture, 'aplus-dashboard-map-preview-placeholder')).toBeTruthy();
    // The tile is still a working link to the map while it loads.
    expect(testid(fixture, 'aplus-dashboard-map-preview')?.getAttribute('href')).toBe(
      '/a/knowledge/g1',
    );
  });

  it('fails soft on a graph load error — the tile still routes to the map', () => {
    goals.activeGoal.set(goal());
    maps = { getGraph: vi.fn(() => throwError(() => new Error('boom'))) };
    const fixture = build(goals, maps);
    // No crash, no fisheye, but the tile is present and still navigates.
    expect(testid(fixture, 'concept-lens-scene')).toBeFalsy();
    expect(testid(fixture, 'aplus-dashboard-map-preview-placeholder')).toBeTruthy();
    expect(testid(fixture, 'aplus-dashboard-map-preview')?.getAttribute('href')).toBe(
      '/a/knowledge/g1',
    );
  });

  it('renders the empty state routing to the maps entry when there is no active goal', () => {
    // activeGoal stays null.
    const fixture = build(goals, maps);
    expect(testid(fixture, 'aplus-dashboard-map-preview-empty')).toBeTruthy();
    // No "Zoom in" affordance in the empty state.
    expect(testid(fixture, 'aplus-dashboard-map-preview-zoom')).toBeFalsy();
    // Whole tile routes to the maps entry (no goalId).
    expect(testid(fixture, 'aplus-dashboard-map-preview')?.getAttribute('href')).toBe(
      '/a/knowledge',
    );
    // No graph fetch fires without an active goal.
    expect(maps.getGraph).not.toHaveBeenCalled();
  });

  it('re-fetches the graph when the active goal changes', () => {
    goals.activeGoal.set(goal({ goalId: 'g1' }));
    const fixture = build(goals, maps);
    expect(maps.getGraph).toHaveBeenCalledWith('g1');

    goals.activeGoal.set(goal({ goalId: 'g2' }));
    fixture.detectChanges();
    expect(maps.getGraph).toHaveBeenCalledWith('g2');
    expect(maps.getGraph).toHaveBeenCalledTimes(2);
  });

  it('focuses the fisheye on the map root when present', () => {
    goals.activeGoal.set(goal());
    const fixture = build(goals, maps); // default graph is rooted on "root"
    const c = fixture.componentInstance;
    expect(c.focusId()).toBe('root');
    expect(c.rootConceptId()).toBe('root');
    expect(c.mapTitle()).toBe('Fractions');
  });

  it('falls back to the first concept when the map has no explicit root', () => {
    goals.activeGoal.set(goal());
    maps = makeMapsMock(
      mapGraph({
        rootConceptId: undefined,
        concepts: [
          { conceptId: 'first', title: 'First', atomRefs: [] },
          { conceptId: 'second', title: 'Second', atomRefs: [] },
        ],
      }),
    );
    const fixture = build(goals, maps);
    expect(fixture.componentInstance.focusId()).toBe('first');
    expect(fixture.componentInstance.rootConceptId()).toBeUndefined();
  });

  it('exposes empty fisheye inputs when there is no active map', () => {
    const fixture = build(goals, maps); // no active goal
    const c = fixture.componentInstance;
    expect(c.concepts()).toEqual([]);
    expect(c.conceptEdges()).toEqual([]);
    expect(c.rootConceptId()).toBeUndefined();
    expect(c.mapTitle()).toBe('');
    expect(c.focusId()).toBe('');
  });

  it('yields an empty focus + placeholder for a rootless, concept-less map', () => {
    goals.activeGoal.set(goal());
    maps = makeMapsMock(mapGraph({ rootConceptId: undefined, concepts: [], edges: [] }));
    const fixture = build(goals, maps);
    expect(fixture.componentInstance.focusId()).toBe('');
    // An empty graph shows the placeholder, never the fisheye.
    expect(testid(fixture, 'aplus-dashboard-map-preview-placeholder')).toBeTruthy();
    expect(testid(fixture, 'concept-lens-scene')).toBeFalsy();
  });

  it('has no critical/serious accessibility violations (active-goal state)', async () => {
    goals.activeGoal.set(goal());
    const fixture = build(goals, maps);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  it('has no critical/serious accessibility violations (empty state)', async () => {
    const fixture = build(goals, maps);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
