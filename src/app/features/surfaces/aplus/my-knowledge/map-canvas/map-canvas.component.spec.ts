import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { environment } from '../../../../../../environments/environment';
import { MapCanvasComponent, provenanceKind } from './map-canvas.component';
import { LayoutService } from '../../../../../core/services/layout.service';
import { LastVisitedMapService } from '../../../../../core/services/last-visited-map.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type { MapCard, MapGraph } from '../maps.model';
import type { CampaignNodeState, MapCampaign } from '../campaign.model';
import type {
  ConceptEdge,
  ConceptNode,
  ConceptSuggestion,
} from '../../discovery-graph/concept-graph.model';
import type { GrowthEdge } from '../../growth-edges/growth-edges.service';

const BFF = environment.bffBaseUrl;
const GOAL_ID = 'goal-1';
const GRAPH = `${BFF}/api/v1/me/maps/${GOAL_ID}/graph`;
const CONCEPTS = `${BFF}/api/v1/me/concept-graph/concepts`;
const CONCEPT = (id: string) => `${BFF}/api/v1/me/concept-graph/concepts/${id}`;
const EDGES = `${BFF}/api/v1/me/concept-graph/edges`;
const REROOT = `${BFF}/api/v1/me/concept-graph/reroot`;
const GOAL = `${BFF}/api/v1/me/goals/${GOAL_ID}`;
const GROWTH_EDGES = `${BFF}/api/v1/me/growth-edges`;
const MAPS_LIST = `${BFF}/api/v1/me/maps`;
const SUGGESTIONS = `${BFF}/api/v1/me/concept-graph/suggestions`;
const CAMPAIGN_FOCUS = `${BFF}/api/v1/me/goals/${GOAL_ID}/campaign/focus`;
const CAMPAIGN_SEAL = `${BFF}/api/v1/me/goals/${GOAL_ID}/campaign/seal`;
const MERGE = (id: string) => `${BFF}/api/v1/me/concept-graph/concepts/${id}/merge`;
const SPLIT = (id: string) => `${BFF}/api/v1/me/concept-graph/concepts/${id}/split`;
const GRAPH_OF = (id: string) => `${BFF}/api/v1/me/maps/${id}/graph`;
const GOAL_OF = (id: string) => `${BFF}/api/v1/me/goals/${id}`;

/** A learner Growth Edge (the Growth-lens diagnosis source). */
function growthEdge(over: Partial<GrowthEdge> = {}): GrowthEdge {
  return {
    id: 'ge-1',
    concept_key: 'weak-spot',
    concept_label: 'Weak spot',
    tags: [],
    strength: 0.8,
    sources: ['derived'],
    descriptor: {
      summary: 'You slip on the edge cases.',
      misconceptions: ['Off-by-one', 'Confuses sprint with iteration'],
      suggested_angles: ['Re-derive from first principles', 'Do 3 worked examples'],
    },
    cached_drill_atom_ids: ['drill-1', 'drill-2'],
    status: 'active',
    first_seen_at: '2026-06-10T00:00:00Z',
    last_evidenced_at: '2026-06-10T00:00:00Z',
    ...over,
  };
}

function concept(conceptId: string, title: string, over: Partial<ConceptNode> = {}): ConceptNode {
  return { conceptId, title, atomRefs: [], ...over };
}

function edge(
  edgeId: string,
  source: string,
  target: string,
  cls: 'hierarchy' | 'lateral' = 'hierarchy',
): ConceptEdge {
  return {
    edgeId,
    sourceConceptId: source,
    targetConceptId: target,
    class: cls,
    provenance: 'learner_authored',
  };
}

/** The default two-concept map: Sprint (root) → Planning (has one atom). */
function graph(over: Partial<MapGraph> = {}): MapGraph {
  return {
    goalId: GOAL_ID,
    title: 'Scrum',
    rootConceptId: 'c-root',
    concepts: [
      concept('c-root', 'Sprint'),
      concept('c-plan', 'Planning', { atomRefs: ['atom-1'] }),
    ],
    edges: [edge('e1', 'c-root', 'c-plan', 'hierarchy')],
    ...over,
  };
}

function conceptDto(conceptId: string, title: string): Record<string, unknown> {
  return {
    conceptId,
    title,
    atomRefs: [],
    provenance: 'learner_authored',
    createdAt: '2026-07-02T00:00:00Z',
  };
}

function goalDto(): Record<string, unknown> {
  return {
    goalId: GOAL_ID,
    kind: 'curiosity',
    conceptSet: [],
    status: 'active',
    northStarNote: '',
    createdAt: '2026-07-02T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
  };
}

/** An Atlas map card — the switcher list item. */
function mapCard(goalId: string, over: Partial<MapCard> = {}): MapCard {
  return {
    goalId,
    title: 'Map ' + goalId,
    northStarNote: '',
    rootConceptId: 'r-' + goalId,
    kind: 'curiosity',
    status: 'active',
    conceptCount: 5,
    shakyCount: 0,
    masteredCount: 0,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
    ...over,
  };
}

describe('MapCanvasComponent', () => {
  let fixture: ComponentFixture<MapCanvasComponent>;
  let component: MapCanvasComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  const mockConfirmDialog = { confirm: vi.fn() };
  const mockLastVisited = { record: vi.fn() };

  beforeEach(async () => {
    mockConfirmDialog.confirm.mockReset().mockResolvedValue(true);
    mockLastVisited.record.mockReset();
    await TestBed.configureTestingModule({
      imports: [MapCanvasComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ConfirmDialogService, useValue: mockConfirmDialog },
        { provide: LastVisitedMapService, useValue: mockLastVisited },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MapCanvasComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The drawer prefetches the Growth-Edges diagnosis cache the moment a concept
    // is selected (Change 2 — the diagnosis is now available in EVERY lens, not
    // only after Growth-lens entry). Drain any still-open prefetch so verify()
    // stays clean; tolerant — a no-op when a test flushed its own edges GET, and
    // it leaves the prefetch `loading` throughout the body so a later map refetch
    // can't re-fire it.
    httpMock.match(GROWTH_EDGES).forEach((r) => !r.cancelled && r.flush({ items: [] }));
    // WS-C7: every successful map fetch also pulls whole-map suggestions for the
    // fog-ghost overlay. Drain them tolerantly (skip any the destroy teardown
    // already cancelled) so verify() stays clean.
    httpMock
      .match((r) => r.url === SUGGESTIONS)
      .forEach((r) => !r.cancelled && r.flush({ suggestions: [] }));
    httpMock.verify();
  });

  function testid<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return element.querySelector<T>(`[data-testid="${id}"]`);
  }

  /**
   * Tap a lens node by concept id. The node is an SVG <g> (no HTMLElement.click()
   * in jsdom), so dispatch a real bubbling click — the child lens emits `select`,
   * the parent focuses + opens the detail.
   */
  function tapNode(conceptId: string): void {
    element
      .querySelector(`[data-testid="concept-lens-node-${conceptId}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  /** setInput(goalId) → detectChanges (ngOnInit GET) → flush the map graph. */
  function mount(over: Partial<MapGraph> = {}): void {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.detectChanges();
    httpMock.expectOne(GRAPH).flush(graph(over));
    fixture.detectChanges();
  }

  /** Click a lens radio (real change-event wiring) then settle the view. */
  function selectLens(value: 'explore' | 'growth' | 'mastery' | 'familiar'): void {
    testid<HTMLInputElement>('map-canvas-lens-' + value)?.click();
    fixture.detectChanges();
  }

  /** Flush the one Growth-Edges GET the Growth lens fires on first entry. */
  function flushEdges(items: GrowthEdge[] = []): void {
    httpMock.expectOne(GROWTH_EDGES).flush({ items });
    fixture.detectChanges();
  }

  it('pure provenanceKind buckets the raw provenance string', () => {
    expect(provenanceKind('learner_authored')).toBe('you');
    expect(provenanceKind('familiar_suggested_accepted')).toBe('familiar');
    expect(provenanceKind('system_derived')).toBe('system');
    expect(provenanceKind(undefined)).toBe('system');
  });

  // CHO-2320: +Concept opens a form that renders at the top of the map, far from
  // the bottom toolbar button, so it read as "nothing happens". Opening now
  // focuses the name field (and scrolls it into view; scrollIntoView is a jsdom
  // no-op so only focus is asserted here).
  it('focuses the create-concept name field when +Concept opens (CHO-2320)', () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');
    mount();
    focusSpy.mockClear(); // ignore any mount-time focus

    component.openCreate();
    fixture.detectChanges();
    fixture.detectChanges(); // let the viewChild resolve + the effect run

    expect(testid('map-canvas-create-title')).toBeTruthy();
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  // CHO-2320 follow-up: selecting a node leaves the create form open, so a
  // second +Concept must RE-focus, not no-op on the unchanged createOpen.
  it('re-focuses the name field on a second +Concept while already open (CHO-2320)', () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');
    mount();
    component.openCreate(); // first open
    fixture.detectChanges();
    fixture.detectChanges();

    focusSpy.mockClear();
    component.openCreate(); // second open, form still open
    fixture.detectChanges();
    fixture.detectChanges();

    expect(component.createOpen()).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  // CHO-2322: the connect checkbox names the actual parent so a learner sees
  // where a new node will attach (arbitrary depth is intended; this is clarity,
  // not a depth cap). The test TranslateService echoes keys, so assert on state:
  // the label renders for a focal and binds the focal title.
  it('renders the named connect-under label bound to the focal parent (CHO-2322)', () => {
    mount(); // root 'c-root' titled 'Sprint' is the focal, the named parent
    component.openCreate();
    fixture.detectChanges();
    expect(testid('map-canvas-create-connect-label')).toBeTruthy();
    expect(component.focalConcept()?.title).toBe('Sprint');
  });

  it('collapses the app nav while the drawer is open and restores it on close', () => {
    // owner 2026-07-04: opening the detail drawer auto-collapses the left menu
    // bar to give the canvas + drawer more room; closing restores the default.
    const layout = TestBed.inject(LayoutService);
    mount();
    expect(layout.collapseRequest()).toBeNull();

    component.openDetail();
    expect(layout.collapseRequest()).toBe(true);

    component.closeDetail();
    expect(component.detailOpen()).toBe(false);
    expect(layout.collapseRequest()).toBeNull();
  });

  // ── SP1: overlay map-switcher + in-place switch + delete-in-rows ──────
  it('opening the switcher lists the maps and closes the concept drawer', () => {
    mount();
    component.openDetail(); // concept drawer open on the current map
    expect(component.detailOpen()).toBe(true);

    component.openSwitcher(); // fires a maps-list refresh
    httpMock.expectOne(MAPS_LIST).flush({ items: [mapCard('goal-1'), mapCard('goal-2')] });
    fixture.detectChanges();

    // mutually exclusive with the concept drawer (no two-drawer collision)
    expect(component.switcherOpen()).toBe(true);
    expect(component.detailOpen()).toBe(false);
    expect(testid('map-canvas-switcher')).toBeTruthy();
    expect(testid('map-switch-goal-2')).toBeTruthy();
  });

  it('switchToMap navigates to the map route and closes the switcher', () => {
    mount();
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.openSwitcher();
    httpMock.expectOne(MAPS_LIST).flush({ items: [mapCard('goal-1'), mapCard('goal-2')] });
    component.switchToMap('goal-2');

    expect(nav).toHaveBeenCalledWith(['/a/knowledge', 'goal-2']);
    expect(component.switcherOpen()).toBe(false);
  });

  it('records the opened map for the dashboard "last visited" surface', () => {
    mount(); // first load: goal-1
    expect(mockLastVisited.record).toHaveBeenCalledWith(GOAL_ID);

    // An in-place switch records the newly-opened map too.
    mockLastVisited.record.mockClear();
    fixture.componentRef.setInput('goalId', 'goal-2');
    fixture.detectChanges();
    httpMock.expectOne(GRAPH_OF('goal-2')).flush(
      graph({
        goalId: 'goal-2',
        title: 'Algebra',
        rootConceptId: 'a-root',
        concepts: [concept('a-root', 'Algebra')],
        edges: [],
      }),
    );
    fixture.detectChanges();
    expect(mockLastVisited.record).toHaveBeenCalledWith('goal-2');
  });

  it('re-fetches the graph IN PLACE when goalId changes (no remount)', () => {
    mount(); // goal-1 = "Scrum"
    expect(testid('map-canvas-title')?.textContent).toContain('Scrum');
    component.openDetail();

    fixture.componentRef.setInput('goalId', 'goal-2');
    fixture.detectChanges(); // goalId effect → closeDetail + reset trail + re-load

    httpMock.expectOne(GRAPH_OF('goal-2')).flush(
      graph({
        goalId: 'goal-2',
        title: 'Algebra',
        rootConceptId: 'a-root',
        concepts: [concept('a-root', 'Algebra')],
        edges: [],
      }),
    );
    fixture.detectChanges();

    expect(testid('map-canvas-title')?.textContent).toContain('Algebra');
    expect(component.detailOpen()).toBe(false);
  });

  it('promptDeleteMap opens the danger modal, DELETEs on confirm + toasts removed', async () => {
    mount(); // current = goal-1
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');
    component.openSwitcher();
    httpMock.expectOne(MAPS_LIST).flush({ items: [mapCard('goal-1'), mapCard('goal-2')] });

    await component.promptDeleteMap('goal-2');
    expect(mockConfirmDialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger' }),
    );
    httpMock
      .expectOne((r) => r.url === GOAL_OF('goal-2') && r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(MAPS_LIST).flush({ items: [mapCard('goal-1')] });
    fixture.detectChanges();

    expect(toastSpy).toHaveBeenCalledWith('aplus.knowledge.map_removed', 'success');
    expect(component.mapDeletingId()).toBeNull();
  });

  it('declining the confirm modal fires no DELETE', async () => {
    mount();
    mockConfirmDialog.confirm.mockResolvedValueOnce(false);
    component.openSwitcher();
    httpMock.expectOne(MAPS_LIST).flush({ items: [mapCard('goal-1'), mapCard('goal-2')] });

    await component.promptDeleteMap('goal-2');
    httpMock.expectNone((r) => r.method === 'DELETE');
  });

  it('deleting the CURRENT map (confirmed) navigates to another map', async () => {
    mount(); // current = goal-1
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.openSwitcher();
    httpMock.expectOne(MAPS_LIST).flush({ items: [mapCard('goal-1'), mapCard('goal-2')] });

    await component.promptDeleteMap('goal-1');
    httpMock
      .expectOne((r) => r.url === GOAL_OF('goal-1') && r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(MAPS_LIST).flush({ items: [mapCard('goal-2')] });

    expect(nav).toHaveBeenCalledWith(['/a/knowledge', 'goal-2']);
  });

  it('a switcher delete failure toasts an error (fail-loud)', async () => {
    mount();
    const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');
    component.openSwitcher();
    httpMock.expectOne(MAPS_LIST).flush({ items: [mapCard('goal-1'), mapCard('goal-2')] });

    await component.promptDeleteMap('goal-2');
    httpMock
      .expectOne((r) => r.url === GOAL_OF('goal-2') && r.method === 'DELETE')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(toastSpy).toHaveBeenCalledWith('aplus.knowledge.map_delete_error', 'error');
    expect(component.mapDeletingId()).toBeNull();
  });

  it('restores the app nav when the map is destroyed with the drawer still open', () => {
    const layout = TestBed.inject(LayoutService);
    mount();
    component.openDetail();
    expect(layout.collapseRequest()).toBe(true);

    fixture.destroy();
    expect(layout.collapseRequest()).toBeNull();
  });

  it('shows loading, then renders the map title + hex canvas + focal detail', () => {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.detectChanges();
    expect(testid('map-canvas-loading')).toBeTruthy();

    httpMock.expectOne(GRAPH).flush(graph());
    fixture.detectChanges();

    expect(testid('map-canvas-loading')).toBeFalsy();
    expect(testid('map-canvas-title')?.textContent).toContain('Scrum');
    // Default focal = the map's explicit rootConceptId (c-root = "Sprint").
    expect(element.querySelector('chora-aplus-concept-lens-map')).toBeTruthy();
    expect(testid('map-canvas-detail-title')?.textContent).toContain('Sprint');
    expect(component.focalId()).toBe('c-root');
  });

  it('labels a ceremony learning-edge in the drawer (remediate vs explore)', () => {
    mount({
      concepts: [
        concept('c-root', 'Sprint', { intent: 'remediate' }),
        concept('c-plan', 'Planning', { intent: 'explore' }),
      ],
    });
    // Focal = root (remediate) → the drawer Overview shows the Remediate chip only.
    expect(testid('map-canvas-intent-remediate')).toBeTruthy();
    expect(testid('map-canvas-intent-explore')).toBeFalsy();

    // Focus the explore child → the drawer swaps to the Explore chip.
    tapNode('c-plan');
    fixture.detectChanges();
    expect(testid('map-canvas-intent-explore')).toBeTruthy();
    expect(testid('map-canvas-intent-remediate')).toBeFalsy();
  });

  it('fails loud on a load error and retries', () => {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.detectChanges();
    httpMock.expectOne(GRAPH).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(testid('map-canvas-error')).toBeTruthy();
    testid<HTMLButtonElement>('map-canvas-retry')?.click();

    httpMock.expectOne(GRAPH).flush(graph());
    fixture.detectChanges();
    expect(testid('map-canvas-error')).toBeFalsy();
    expect(testid('map-canvas-title')?.textContent).toContain('Scrum');
  });

  it('renders the empty state (with a create-first CTA) when the map has no concepts', () => {
    mount({ concepts: [], edges: [], rootConceptId: undefined });
    expect(testid('map-canvas-empty')).toBeTruthy();
    expect(testid('map-canvas-empty-create')).toBeTruthy();
    expect(element.querySelector('chora-aplus-concept-lens-map')).toBeFalsy();
  });

  it('recenter pushes the trail and Back pops it', () => {
    mount();
    // focal = c-root (Sprint); tap its child c-plan on the lens to focus it.
    tapNode('c-plan');
    fixture.detectChanges();

    expect(component.focalId()).toBe('c-plan');
    expect(testid('map-canvas-detail-title')?.textContent).toContain('Planning');
    // Breadcrumb: Sprint (link crumb-0) / Planning (current).
    expect(testid('map-canvas-crumb-0')?.textContent).toContain('Sprint');
    expect(testid('map-canvas-crumb-current')?.textContent).toContain('Planning');

    const back = testid<HTMLButtonElement>('map-canvas-back');
    expect(back?.disabled).toBe(false);
    back?.click();
    fixture.detectChanges();
    expect(component.focalId()).toBe('c-root');
    expect(testid<HTMLButtonElement>('map-canvas-back')?.disabled).toBe(true);
  });

  it('a breadcrumb crumb click jumps back to that point in the trail', () => {
    mount();
    tapNode('c-plan'); // → c-plan
    fixture.detectChanges();
    expect(component.trail()).toEqual(['c-root', 'c-plan']);

    testid<HTMLButtonElement>('map-canvas-crumb-0')?.click(); // jump to Sprint
    fixture.detectChanges();
    expect(component.trail()).toEqual(['c-root']);
    expect(component.focalId()).toBe('c-root');
  });

  it('renders EVERY concept on the lens (no 6-face cap, no overflow drawer)', () => {
    const eight = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];
    mount({
      concepts: [concept('c-root', 'Root'), ...eight.map((n) => concept(n, n.toUpperCase()))],
      edges: eight.map((n, i) => edge(`e${i}`, 'c-root', n, 'lateral')),
      rootConceptId: 'c-root',
    });

    // The whole map is on screen: 9 lens nodes, and the old overflow drawer
    // (the 6-face cap workaround) no longer exists.
    expect(element.querySelectorAll('[data-testid^="concept-lens-node-"]').length).toBe(9);
    expect(testid('map-canvas-overflow-toggle')).toBeNull();
    expect(testid('map-canvas-overflow-drawer')).toBeNull();

    // Tapping a far node still focuses it (via the lens select output).
    tapNode('n8');
    fixture.detectChanges();
    expect(component.focalId()).toBe('n8');
  });

  it('creates a concept and connects it as a child of the focal, then refetches', () => {
    mount(); // focal = c-root
    testid<HTMLButtonElement>('map-canvas-create-toggle')?.click();
    fixture.detectChanges();

    const input = testid<HTMLInputElement>('map-canvas-create-title')!;
    input.value = 'Backlog';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    testid<HTMLButtonElement>('map-canvas-create-submit')?.click();

    // 1. mint the concept
    const cReq = httpMock.expectOne(CONCEPTS);
    expect(cReq.request.method).toBe('POST');
    expect(cReq.request.body).toEqual({ title: 'Backlog' });
    cReq.flush(conceptDto('c-new', 'Backlog'));

    // 2. connect focal → new as a hierarchy edge
    const eReq = httpMock.expectOne(EDGES);
    expect(eReq.request.body).toEqual({
      sourceConceptId: 'c-root',
      targetConceptId: 'c-new',
      class: 'hierarchy',
    });
    eReq.flush(edge('e-new', 'c-root', 'c-new', 'hierarchy'));

    // 3. refetch — the new concept is present, so it becomes the focal
    httpMock.expectOne(GRAPH).flush(
      graph({
        concepts: [
          concept('c-root', 'Sprint'),
          concept('c-plan', 'Planning', { atomRefs: ['atom-1'] }),
          concept('c-new', 'Backlog'),
        ],
        edges: [
          edge('e1', 'c-root', 'c-plan', 'hierarchy'),
          edge('e-new', 'c-root', 'c-new', 'hierarchy'),
        ],
      }),
    );
    fixture.detectChanges();

    expect(component.focalId()).toBe('c-new');
    expect(component.createOpen()).toBe(false);
  });

  it('creates a concept WITHOUT an edge when connect-as-child is unchecked', () => {
    mount();
    testid<HTMLButtonElement>('map-canvas-create-toggle')?.click();
    fixture.detectChanges();

    const input = testid<HTMLInputElement>('map-canvas-create-title')!;
    input.value = 'Standalone';
    input.dispatchEvent(new Event('input'));

    const checkbox = testid<HTMLInputElement>('map-canvas-create-connect')!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    testid<HTMLButtonElement>('map-canvas-create-submit')?.click();

    httpMock.expectOne(CONCEPTS).flush(conceptDto('c-new', 'Standalone'));
    httpMock.expectNone(EDGES); // no auto-connect
    httpMock.expectOne(GRAPH).flush(graph());
    fixture.detectChanges();
  });

  it('click-to-connect: pick a source node then a target node draws the edge', () => {
    mount();
    testid<HTMLButtonElement>('map-canvas-connect-toggle')?.click();
    fixture.detectChanges();

    // First tap = source.
    testid<HTMLButtonElement>('map-canvas-connect-node-c-root')?.click();
    fixture.detectChanges();
    expect(component.connectSourceId()).toBe('c-root');

    // Choose the lateral relationship, then tap the target.
    testid<HTMLButtonElement>('map-canvas-connect-class-lateral')?.click();
    fixture.detectChanges();
    testid<HTMLButtonElement>('map-canvas-connect-node-c-plan')?.click();

    const eReq = httpMock.expectOne(EDGES);
    expect(eReq.request.body).toEqual({
      sourceConceptId: 'c-root',
      targetConceptId: 'c-plan',
      class: 'lateral',
    });
    eReq.flush(edge('e-new', 'c-root', 'c-plan', 'lateral'));
    httpMock.expectOne(GRAPH).flush(graph());
    fixture.detectChanges();

    expect(component.connectMode()).toBe(false);
  });

  it('make-root re-roots the graph THEN re-anchors the Goal rootConceptId', () => {
    mount();
    // Focus a non-root concept so make-root is enabled.
    tapNode('c-plan');
    fixture.detectChanges();
    expect(component.focalId()).toBe('c-plan');

    const mk = testid<HTMLButtonElement>('concept-lens-make-root');
    expect(mk?.disabled).toBe(false);
    mk?.click();

    // 1. reroot the concept graph
    const rReq = httpMock.expectOne(REROOT);
    expect(rReq.request.body).toEqual({ newRootId: 'c-plan' });
    rReq.flush({ newRootId: 'c-plan', changed: true, edgesFlipped: 1 });

    // 2. re-anchor the Goal's root (ADR-214 D1)
    const gReq = httpMock.expectOne(GOAL);
    expect(gReq.request.method).toBe('PATCH');
    expect(gReq.request.body).toEqual({ rootConceptId: 'c-plan' });
    gReq.flush(goalDto());

    // 3. refetch
    httpMock.expectOne(GRAPH).flush(graph({ rootConceptId: 'c-plan' }));
    fixture.detectChanges();
    expect(component.focalId()).toBe('c-plan');
  });

  it('attaches an atom via the picker output (PATCH addAtomRefs, no UUID paste)', () => {
    mount(); // focal = c-root
    component.onAtomPicked({
      id: 'atom-9',
      title: 'What is a sprint?',
      stem: 'stem',
      question_type: 'mcq',
    });

    const pReq = httpMock.expectOne(CONCEPT('c-root'));
    expect(pReq.request.method).toBe('PATCH');
    expect(pReq.request.body).toEqual({ addAtomRefs: ['atom-9'] });
    pReq.flush(conceptDto('c-root', 'Sprint'));
    httpMock.expectOne(GRAPH).flush(graph());
    fixture.detectChanges();
  });

  it('bulk-attaches atoms via the picker bulk output', () => {
    mount();
    component.onAtomsPicked([
      { id: 'a1', title: 'q1', stem: 's', question_type: 'mcq' },
      { id: 'a2', title: 'q2', stem: 's', question_type: 'oe' },
    ]);
    const pReq = httpMock.expectOne(CONCEPT('c-root'));
    expect(pReq.request.body).toEqual({ addAtomRefs: ['a1', 'a2'] });
    pReq.flush(conceptDto('c-root', 'Sprint'));
    httpMock.expectOne(GRAPH).flush(graph());
    fixture.detectChanges();
  });

  it('detaches an atom from the focal concept (PATCH removeAtomRefs)', () => {
    mount();
    // Focus c-plan which carries atom-1.
    tapNode('c-plan');
    fixture.detectChanges();
    expect(testid('map-canvas-atoms')).toBeTruthy();

    testid<HTMLButtonElement>('map-canvas-atom-detach-0')?.click();
    const pReq = httpMock.expectOne(CONCEPT('c-plan'));
    expect(pReq.request.body).toEqual({ removeAtomRefs: ['atom-1'] });
    pReq.flush(conceptDto('c-plan', 'Planning'));
    httpMock.expectOne(GRAPH).flush(graph());
    fixture.detectChanges();
  });

  it('paints the provenance badge from the focal concept provenance', () => {
    mount({
      concepts: [concept('c-root', 'Root', { provenance: 'learner_authored' })],
      edges: [],
      rootConceptId: 'c-root',
    });
    expect(testid('map-canvas-provenance')?.getAttribute('data-provenance')).toBe('you');
  });

  it('shows the Familiar provenance badge for accepted suggestions', () => {
    mount({
      concepts: [
        concept('c-root', 'Root', {
          provenance: 'familiar_suggested_accepted',
        }),
      ],
      edges: [],
      rootConceptId: 'c-root',
    });
    expect(testid('map-canvas-provenance')?.getAttribute('data-provenance')).toBe('familiar');
  });

  it('paints shaky (+ due) and mastered overlay chips from the node', () => {
    mount({
      concepts: [
        concept('c-shaky', 'Weak spot', {
          growthEdge: {
            edgeId: 'ge-1',
            conceptKey: 'weak-spot',
            strength: 0.8,
            isDue: true,
          },
        }),
        concept('c-done', 'Solid', { mastered: true }),
      ],
      edges: [edge('e1', 'c-shaky', 'c-done', 'hierarchy')],
      rootConceptId: 'c-shaky',
    });
    // Focal = c-shaky.
    expect(testid('map-canvas-shaky')).toBeTruthy();
    expect(testid('map-canvas-due')).toBeTruthy();
    expect(testid('map-canvas-mastered')).toBeFalsy();

    // Focus c-done → mastered chip, no shaky.
    tapNode('c-done');
    fixture.detectChanges();
    expect(testid('map-canvas-mastered')).toBeTruthy();
    expect(testid('map-canvas-shaky')).toBeFalsy();
  });

  it('reveals the shared atom-question picker on toggle (no UUID paste path)', () => {
    mount();
    testid<HTMLButtonElement>('map-canvas-attach-toggle')?.click();
    fixture.detectChanges();

    expect(testid('map-canvas-picker')).toBeTruthy();
    expect(element.querySelector('chora-aplus-atom-question-picker')).toBeTruthy();

    // Drain the picker's own open-time candidate search so verify() is clean.
    // ADR-243: this drawer now opens the picker on the ENROLMENT entitlement, so
    // the open-time request is chora-consumption's attachable-atoms, not
    // chora-creation's reuse search.
    httpMock
      .match((r) => r.url.includes('/attachable-atoms'))
      .forEach((r) => r.flush({ items: [] }));
  });

  it('has no critical/serious accessibility violations on the canvas', async () => {
    mount();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ── WS-D lenses ─────────────────────────────────────────────────────

  it('defaults to the Explore lens and renders an accessible 3-option selector', () => {
    mount();
    expect(component.lens()).toBe('explore');
    const fs = testid('map-canvas-lens');
    expect(fs?.tagName).toBe('FIELDSET');
    expect(fs?.querySelector('legend')).toBeTruthy();
    expect(testid<HTMLInputElement>('map-canvas-lens-explore')?.checked).toBe(true);
    expect(testid('map-canvas-lens-growth')).toBeTruthy();
    expect(testid('map-canvas-lens-mastery')).toBeTruthy();
    // 'familiar' is NOT a map lens — it is a drawer tab now.
    expect(testid('map-canvas-lens-familiar')).toBeFalsy();
    expect(testid('map-canvas-lens-caption')).toBeTruthy();
    expect(testid('map-canvas')?.getAttribute('data-lens')).toBe('explore');
  });

  it('lens re-emphasises the MAP without hiding drawer capability (§5.1)', () => {
    // Post-redesign: the lens colours the map hexes + drives the map-level
    // mastery panel; the DRAWER content (provenance/atoms/diagnosis) is tab-
    // driven (Overview), so no lens ever hides a drawer capability.
    mount({
      concepts: [
        concept('c-root', 'Weak spot', {
          atomRefs: ['atom-1'],
          growthEdge: {
            edgeId: 'ge',
            conceptKey: 'weak-spot',
            strength: 0.8,
            isDue: true,
          },
        }),
      ],
      edges: [],
      rootConceptId: 'c-root',
    });

    // Explore (default, Overview tab): shaky/due cues + atoms present; the
    // map-level "done for me" panel (lens-gated) is not.
    expect(testid('map-canvas')?.getAttribute('data-lens')).toBe('explore');
    expect(testid('map-canvas-shaky')).toBeTruthy();
    expect(testid('map-canvas-due')).toBeTruthy();
    expect(testid('map-canvas-attach-toggle')).toBeTruthy();
    expect(testid('map-canvas-mastery-panel')).toBeFalsy();

    // Growth: re-emphasis via data-lens; drawer capability (atoms) unchanged.
    selectLens('growth');
    flushEdges();
    expect(testid('map-canvas')?.getAttribute('data-lens')).toBe('growth');
    expect(testid('map-canvas-shaky')).toBeTruthy();
    expect(testid('map-canvas-attach-toggle')).toBeTruthy();

    // Mastery: the map-level "done for me" panel appears; atoms still present.
    selectLens('mastery');
    expect(testid('map-canvas')?.getAttribute('data-lens')).toBe('mastery');
    expect(testid('map-canvas-mastery-panel')).toBeTruthy();
    expect(testid('map-canvas-attach-toggle')).toBeTruthy();

    // Back to Explore: the map-level panel is gone; the base canvas is intact.
    selectLens('explore');
    expect(testid('map-canvas-mastery-panel')).toBeFalsy();
    expect(testid('map-canvas-attach-toggle')).toBeTruthy();
  });

  it('Growth lens joins the focal to its Growth Edge by concept_key slug', () => {
    mount({
      concepts: [concept('c-root', 'Weak spot')], // slug → "weak-spot"
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([growthEdge()]); // concept_key "weak-spot" matches the slug

    expect(testid('map-canvas-diagnosis-summary')?.textContent).toContain(
      'You slip on the edge cases.',
    );
    expect(testid('map-canvas-misconceptions')?.textContent).toContain('Off-by-one');
    expect(testid('map-canvas-try-next')?.textContent).toContain('Re-derive from first principles');
    expect(testid('map-canvas-practice')).toBeTruthy();
    expect(testid('map-canvas-no-weakness')).toBeFalsy();
  });

  it('Growth lens prefers the painted growthEdge.conceptKey when present', () => {
    mount({
      concepts: [
        concept('c-root', 'A totally different title', {
          growthEdge: { edgeId: 'ge', conceptKey: 'painted-key', strength: 0.7 },
        }),
      ],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([growthEdge({ concept_key: 'painted-key' })]);
    expect(testid('map-canvas-diagnosis-summary')).toBeTruthy();
  });

  it('joins the diagnosis by stable edgeId when title-slug AND concept_key both differ', () => {
    // Robust join (Change 1): the painted growthEdge.edgeId IS the list
    // GrowthEdge.id (both the server LearnerWeakness.ID), so the diagnosis joins
    // by that stable id even when the concept title slugs to one thing and the
    // list concept_key is a THIRD thing — slug drift the painted-key + title-slug
    // fallbacks BOTH miss.
    mount({
      concepts: [
        concept('c-root', 'Sprint velocity forecasting', {
          // title slug ("sprint-velocity-forecasting") ≠ any list key; the painted
          // conceptKey is also absent from the list → neither fallback can hit.
          growthEdge: {
            edgeId: 'ge-1',
            conceptKey: 'painted-only-key',
            strength: 0.8,
          },
        }),
      ],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    // Same server id (ge-1) as the overlay, but a concept_key matching neither the
    // title slug nor the painted key → ONLY the stable-id join can hit.
    flushEdges([growthEdge({ id: 'ge-1', concept_key: 'totally-different' })]);

    expect(testid('map-canvas-diagnosis-summary')?.textContent).toContain(
      'You slip on the edge cases.',
    );
    expect(testid('map-canvas-no-weakness')).toBeFalsy();
  });

  it('Growth lens shows an honest "no weakness yet" note when nothing matches', () => {
    mount({
      concepts: [concept('c-root', 'Unmatched concept')],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([growthEdge({ concept_key: 'something-else' })]);
    expect(testid('map-canvas-no-weakness')).toBeTruthy();
    expect(testid('map-canvas-diagnosis-summary')).toBeFalsy();
  });

  it('reconciles a Shaky concept whose diagnosis does not join (no false "no weakness")', () => {
    // The read-model flagged this concept shaky (growthEdge overlay → Shaky chip),
    // but its detailed diagnosis doesn't join (a thin accept-stub, or a key
    // mismatch). The drawer must NOT deny the weakness with "no weakness signal
    // yet" — that contradicts the chip. It acknowledges the shaky flag instead.
    mount({
      concepts: [
        concept('c-root', 'Food Chains', {
          growthEdge: { edgeId: 'ge', conceptKey: 'food-chains', strength: 0.6 },
        }),
      ],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([growthEdge({ concept_key: 'something-else' })]); // no detail joins
    expect(testid('map-canvas-shaky')).toBeTruthy(); // the Shaky chip shows…
    expect(testid('map-canvas-shaky-undiagnosed')).toBeTruthy(); // …with a consistent note
    expect(testid('map-canvas-no-weakness')).toBeFalsy(); // never the contradiction
  });

  it('reconciles a remediate learning-edge with no diagnosis (map reads it shaky → drawer must too)', () => {
    // A ceremony remediate-intent concept reads shaky ON THE MAP (isShakyNode
    // folds remediate in) but carries no growthEdge overlay. The drawer diagnosis
    // must acknowledge it — not deny it with "no weakness signal", which would
    // contradict the map's shaky cue and the concept's own Remediate chip.
    mount({
      concepts: [concept('c-root', 'Reported Speech', { intent: 'remediate' })],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([]); // no diagnosis detail joins
    expect(testid('map-canvas-intent-remediate')).toBeTruthy(); // the Remediate chip shows…
    expect(testid('map-canvas-shaky-undiagnosed')).toBeTruthy(); // …with the consistent note
    expect(testid('map-canvas-no-weakness')).toBeFalsy(); // never the contradiction
  });

  it('deletes a non-root focal concept via an inline confirm (DELETE → refetch → close)', () => {
    mount();
    tapNode('c-plan'); // focus the non-root "Planning" concept → drawer opens
    fixture.detectChanges();
    expect(component.detailOpen()).toBe(true);
    // Two-step inline confirm — NO JS dialog (blocks the extension).
    expect(testid('map-canvas-concept-delete-trigger')).toBeTruthy();
    testid<HTMLButtonElement>('map-canvas-concept-delete-trigger')?.click();
    fixture.detectChanges();
    expect(testid('map-canvas-concept-delete-yes')).toBeTruthy();
    testid<HTMLButtonElement>('map-canvas-concept-delete-yes')?.click();
    // The existing soft-delete endpoint is hit…
    const del = httpMock.expectOne(CONCEPT('c-plan'));
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    // …the map refetches (mutate → fetch) and the drawer closes (focal is gone).
    httpMock.expectOne(GRAPH).flush(graph());
    fixture.detectChanges();
    expect(component.detailOpen()).toBe(false);
    expect(component.trail().includes('c-plan')).toBe(false);
  });

  it('never offers delete for the map ROOT concept (would orphan the map)', () => {
    mount();
    tapNode('c-root'); // the root
    fixture.detectChanges();
    expect(component.detailOpen()).toBe(true); // drawer open, but…
    expect(testid('map-canvas-concept-delete-trigger')).toBeFalsy(); // …no delete for root
  });

  it('Growth lens fails soft when Growth Edges cannot load (canvas unaffected)', () => {
    mount({
      concepts: [concept('c-root', 'Weak spot')],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    httpMock.expectOne(GROWTH_EDGES).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(testid('map-canvas-error')).toBeFalsy(); // canvas is NOT broken
    expect(testid('map-canvas-title')?.textContent).toContain('Scrum');
    expect(testid('map-canvas-diagnosis-error')).toBeTruthy();
    expect(testid('map-canvas-no-weakness')).toBeFalsy(); // no false "all clear"
  });

  it('Practice deep-links the daily-dose surface to the focal growth edge', () => {
    mount({
      concepts: [concept('c-root', 'Weak spot')],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([growthEdge({ cached_drill_atom_ids: ['drill-1', 'drill-2'] })]);

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    testid<HTMLButtonElement>('map-canvas-practice')?.click();
    // Concept-scoped RAG dose (not a generic one): pass the focal edge's id +
    // label as the ?growth_edge_id=&concept= params the dose surface reads.
    // ADR-242 D2: the goal rides along on every dose CTA off this map, so the
    // dose can scope to it and disclose where today's cards came from.
    expect(navigate).toHaveBeenCalledWith(['/a/daily-dose'], {
      queryParams: { growth_edge_id: 'ge-1', concept: 'Weak spot', goal_id: GOAL_ID },
    });
  });

  it('omits the Practice affordance when the matching edge has no drills', () => {
    mount({
      concepts: [concept('c-root', 'Weak spot')],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([growthEdge({ cached_drill_atom_ids: [] })]);
    expect(testid('map-canvas-diagnosis')).toBeTruthy();
    expect(testid('map-canvas-practice')).toBeFalsy();
  });

  it('loads Growth Edges once and caches them across lens switches', () => {
    mount({
      concepts: [concept('c-root', 'Weak spot')],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([growthEdge()]);
    selectLens('explore');
    selectLens('growth'); // re-entry must NOT refetch
    httpMock.expectNone(GROWTH_EDGES);
    expect(testid('map-canvas-diagnosis-summary')).toBeTruthy();
  });

  it('reloads the Growth cache on a refetch so a diagnose clears a stale "no weakness"', () => {
    mount({
      concepts: [concept('c-root', 'Weak spot')],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    // Initial cache has no edge for "weak-spot" → honest "no weakness yet".
    flushEdges([growthEdge({ concept_key: 'stale-key' })]);
    expect(testid('map-canvas-no-weakness')).toBeTruthy();

    // A completed diagnose (Familiar lens `changed` → refresh) silently refetches
    // the map; the refetch must re-pull Growth Edges so the cache isn't stale.
    component.refresh();
    httpMock.expectOne(GRAPH).flush(
      graph({
        concepts: [concept('c-root', 'Weak spot')],
        edges: [],
        rootConceptId: 'c-root',
      }),
    );
    httpMock.expectOne(GROWTH_EDGES).flush({ items: [growthEdge({ concept_key: 'weak-spot' })] });
    fixture.detectChanges();

    expect(testid('map-canvas-diagnosis-summary')).toBeTruthy();
    expect(testid('map-canvas-no-weakness')).toBeFalsy();
  });

  it('loads Growth Edges on concept select so the diagnosis shows in Explore too', () => {
    // Change 2: the diagnosis cache used to load ONLY on Growth-lens entry, so a
    // drawer opened in Explore/Mastery never fetched it and falsely read "no
    // weakness". Selecting a concept now prefetches the cache (idempotent,
    // fail-soft) → the diagnosis is live in EVERY lens the moment the drawer opens.
    mount({
      concepts: [
        concept('c-root', 'Sprint'),
        concept('c-weak', 'Weak spot'), // slug → "weak-spot"
      ],
      edges: [edge('e1', 'c-root', 'c-weak', 'hierarchy')],
      rootConceptId: 'c-root',
    });
    expect(component.lens()).toBe('explore'); // never enter the Growth lens

    tapNode('c-weak'); // open the concept → the prefetch fires on select
    fixture.detectChanges();

    const req = httpMock.expectOne(GROWTH_EDGES);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [growthEdge()] }); // concept_key "weak-spot" joins by slug
    fixture.detectChanges();

    expect(component.lens()).toBe('explore');
    expect(testid('map-canvas-diagnosis-summary')?.textContent).toContain(
      'You slip on the edge cases.',
    );
    expect(testid('map-canvas-no-weakness')).toBeFalsy();
  });

  it('Mastery lens marks the map "done for me" via goalService.update({personalComplete})', () => {
    mount(); // focal = Sprint, not done
    selectLens('mastery');
    expect(testid('map-canvas-done-badge')).toBeFalsy();

    testid<HTMLButtonElement>('map-canvas-done-toggle')?.click();

    const gReq = httpMock.expectOne(GOAL);
    expect(gReq.request.method).toBe('PATCH');
    expect(gReq.request.body).toEqual({ personalComplete: true });
    gReq.flush(goalDto());

    // On success the canvas re-fetches; the graph now reports personal completion.
    httpMock.expectOne(GRAPH).flush(graph({ personalCompletedAt: '2026-07-02T00:00:00Z' }));
    fixture.detectChanges();

    expect(component.isDone()).toBe(true);
    expect(testid('map-canvas-done-badge')).toBeTruthy();
    // The control now offers to reopen (the personal axis is reversible).
    expect(testid('map-canvas-done-toggle')?.textContent?.toLowerCase()).toContain('reopen');
  });

  it('Mastery lens reopens a completed map (personalComplete:false)', () => {
    mount({ personalCompletedAt: '2026-07-02T00:00:00Z' });
    selectLens('mastery');
    expect(component.isDone()).toBe(true);
    expect(testid('map-canvas-done-badge')).toBeTruthy();

    testid<HTMLButtonElement>('map-canvas-done-toggle')?.click();
    const gReq = httpMock.expectOne(GOAL);
    expect(gReq.request.body).toEqual({ personalComplete: false });
    gReq.flush(goalDto());
    httpMock.expectOne(GRAPH).flush(graph()); // no personalCompletedAt → reopened
    fixture.detectChanges();
    expect(component.isDone()).toBe(false);
  });

  it('Mastery band renders a consolidation meter for a mastered focal', () => {
    mount({
      concepts: [concept('c-root', 'Solid', { mastered: true })],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('mastery');
    expect(testid('map-canvas-mastery-band')).toBeTruthy();
    expect(component.focalMasteryPercent()).toBe(100);
    expect(testid('map-canvas-mastery-unknown')).toBeFalsy();
  });

  it('Mastery band derives the meter from strength as information (not a gate)', () => {
    mount({
      concepts: [
        concept('c-root', 'Getting there', {
          growthEdge: { edgeId: 'g', conceptKey: 'getting-there', strength: 0.75 },
        }),
      ],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('mastery');
    // masteryPercent(0.75) = 25 (mastery = 1 − shakiness).
    expect(component.focalMasteryPercent()).toBe(25);
    expect(testid('map-canvas-mastery-band')).toBeTruthy();
    expect(testid('map-canvas-mastery-unknown')).toBeFalsy();
  });

  it('Mastery band is honest when a concept has no signal (0 ≠ unknown)', () => {
    mount({
      concepts: [concept('c-root', 'Unknown')],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('mastery');
    expect(component.focalMasteryPercent()).toBeNull();
    expect(testid('map-canvas-mastery-unknown')).toBeTruthy();
  });

  it('mounts the shared Familiar panel on the Familiar drawer tab (WS-E integration)', () => {
    mount(); // the fixture graph has no Familiar bound.
    component.setTab('familiar');
    fixture.detectChanges();
    expect(element.querySelector('chora-aplus-map-familiar-panel')).toBeTruthy();
    expect(testid('map-canvas-tabpanel-familiar')).toBeTruthy();
    expect(component.panelSection()).toBe('familiar');
    // Drain the panel's own bootstrap fetch (the summon roster) so verify()
    // stays clean; the panel's behaviour is covered by its own spec.
    httpMock.match(() => true).forEach((r) => r.flush({ items: [] }));
  });

  // ── Goal-level Diagnose entry + auto-reveal (ADR-238 D2 / D5) ─────────
  it('the "Diagnose my map" header action opens the goal root on the Diagnose tab', () => {
    // ADR-238 D2: a goal-level entry that needs no pre-picked concept — it anchors
    // the drawer on the goal root (the goal IS the map) and shows the Diagnose tab.
    mount(); // root = c-root
    const btn = testid<HTMLButtonElement>('map-canvas-diagnose-my-map');
    expect(btn).toBeTruthy();
    btn?.click();
    fixture.detectChanges();

    expect(component.focalId()).toBe('c-root');
    expect(component.detailOpen()).toBe(true);
    expect(component.activeTab()).toBe('diagnose');

    // The Diagnose tab mounts the shared Familiar panel (summon state — the
    // fixture graph binds no Familiar); drain its bootstrap + the onSelect Growth-
    // Edges prefetch + the mount suggestions pull so verify() stays clean.
    httpMock
      .match(() => true)
      .forEach((r) => !r.cancelled && r.flush({ items: [], suggestions: [] }));
  });

  it('onDiagnosed switches the map to the Growth lens (auto-reveal where edges landed)', () => {
    // ADR-238 D5: the panel emitted `diagnosed` (≥1 edge placed) → the parent flips
    // to the Growth lens so the server-painted nodes light up. Growth-lens entry
    // lazily loads the Growth Edges (GROWTH_EDGES GET drained in afterEach).
    mount();
    expect(component.lens()).toBe('explore');
    component.onDiagnosed();
    expect(component.lens()).toBe('growth');
  });

  it('has no critical/serious accessibility violations across the lenses', async () => {
    mount({
      concepts: [concept('c-root', 'Weak spot', { atomRefs: ['a1'] })],
      edges: [],
      rootConceptId: 'c-root',
    });
    selectLens('growth');
    flushEdges([growthEdge()]);

    const axeMod = await import('axe-core').catch(() => null);
    if (!axeMod) return; // axe-core unavailable — skip per the canonical pattern.
    const axe = axeMod.default;

    const growth = await axe.run(fixture.nativeElement);
    expect(
      growth.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([]);

    selectLens('mastery');
    const mastery = await axe.run(fixture.nativeElement);
    expect(
      mastery.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toEqual([]);
  });

  // ── Detail drawer (map-canvas-detail) — click-to-open + tabs ─────────
  describe('detail drawer', () => {
    it('is CLOSED by default on load (map full-width, toolbar toggle gone)', () => {
      mount();
      expect(component.detailOpen()).toBe(false);
      const aside = testid('map-canvas-detail');
      expect(aside?.getAttribute('aria-hidden')).toBe('true');
      expect(aside?.classList.contains('is-open')).toBe(false);
      expect(testid('map-canvas-detail-backdrop')).toBeNull();
      // The old toolbar "Details" toggle no longer exists (trigger = the concept).
      expect(testid('map-canvas-detail-toggle')).toBeNull();
    });

    it('opens when a concept node is tapped (onSelect)', () => {
      mount();
      component.onSelect('c-root');
      fixture.detectChanges();
      expect(component.detailOpen()).toBe(true);
      const aside = testid('map-canvas-detail');
      expect(aside?.getAttribute('aria-hidden')).toBe('false');
      expect(aside?.classList.contains('is-open')).toBe(true);
      expect(testid('map-canvas-detail-backdrop')).not.toBeNull();
    });

    it('opens when a non-focus node is tapped (focuses AND opens its detail)', () => {
      mount();
      expect(component.detailOpen()).toBe(false);
      tapNode('c-plan');
      fixture.detectChanges();
      expect(component.focalId()).toBe('c-plan');
      expect(component.detailOpen()).toBe(true);
    });

    it('closes via the × close button', () => {
      mount();
      component.openDetail();
      fixture.detectChanges();
      testid('map-canvas-detail-close')?.click();
      fixture.detectChanges();
      expect(component.detailOpen()).toBe(false);
    });

    it('resets the drawer-aware lens shift to 0 on close (glide back to centre)', () => {
      mount();
      // jsdom has no layout, so opening leaves the measured shift at 0; force a
      // non-zero shift to prove close clears it.
      component.openDetail();
      component.lensShiftX.set(-160);
      fixture.detectChanges();
      component.closeDetail();
      expect(component.lensShiftX()).toBe(0);
    });

    it('closes on Escape when open, and is a no-op when already closed', () => {
      mount();
      component.onEscape(); // already closed → no-op
      expect(component.detailOpen()).toBe(false);
      component.openDetail();
      fixture.detectChanges();
      component.onEscape(); // open → closes
      fixture.detectChanges();
      expect(component.detailOpen()).toBe(false);
    });

    it('backdrop is a non-blocking dim — clicking it does NOT close the drawer', () => {
      mount();
      component.openDetail();
      fixture.detectChanges();
      const backdrop = testid('map-canvas-detail-backdrop');
      expect(backdrop).not.toBeNull();
      backdrop?.click();
      fixture.detectChanges();
      expect(component.detailOpen()).toBe(true);
    });

    it('renders all four drawer tabs as an accessible tablist (default Overview)', () => {
      mount();
      const tablist = testid('map-canvas-tabs');
      expect(tablist?.getAttribute('role')).toBe('tablist');
      for (const id of ['overview', 'suggestions', 'familiar', 'diagnose']) {
        const tab = testid('map-canvas-tab-' + id);
        expect(tab).toBeTruthy();
        expect(tab?.getAttribute('role')).toBe('tab');
      }
      expect(component.activeTab()).toBe('overview');
      expect(testid('map-canvas-tab-overview')?.getAttribute('aria-selected')).toBe('true');
    });

    it('Overview tab shows the concept content; the Familiar panel is on other tabs', () => {
      mount();
      // Overview (default): provenance + atoms present; the Familiar panel is not.
      expect(testid('map-canvas-tabpanel-overview')).toBeTruthy();
      expect(testid('map-canvas-provenance')).toBeTruthy();
      expect(testid('map-canvas-attach-toggle')).toBeTruthy();
      expect(testid('map-canvas-dose-link')).toBeTruthy();
      expect(element.querySelector('chora-aplus-map-familiar-panel')).toBeFalsy();
    });

    it('setTab("familiar") switches to the shared Familiar panel (section=familiar)', () => {
      mount();
      component.setTab('familiar');
      fixture.detectChanges();

      expect(component.activeTab()).toBe('familiar');
      expect(testid('map-canvas-tab-familiar')?.getAttribute('aria-selected')).toBe('true');
      expect(testid('map-canvas-tabpanel-familiar')).toBeTruthy();
      expect(element.querySelector('chora-aplus-map-familiar-panel')).toBeTruthy();
      // Overview-only content is gone.
      expect(testid('map-canvas-provenance')).toBeFalsy();
      expect(component.panelSection()).toBe('familiar');

      // Drain the panel's own summon-roster bootstrap so verify() stays clean.
      httpMock.match(() => true).forEach((r) => r.flush({ items: [] }));
    });
  });

  // ── Per-node objective / sub-goal (ADR-247, CHO-2328) ────────────────
  describe('sub-goal / objective', () => {
    it('renders the focal objective + a "you" provenance pill when set', () => {
      mount({
        concepts: [
          concept('c-root', 'Sprint', {
            subGoal: 'Ship a working increment each sprint',
            subGoalProvenance: 'learner_authored',
          }),
        ],
        edges: [],
        rootConceptId: 'c-root',
      });
      const display = testid('subgoal-display');
      expect(display).toBeTruthy();
      expect(display?.textContent).toContain('Ship a working increment each sprint');
      const pill = testid('subgoal-provenance-pill');
      expect(pill).toBeTruthy();
      expect(pill?.getAttribute('data-provenance')).toBe('you');
      expect(component.hasSubGoal()).toBe(true);
    });

    it('shows the Companion provenance pill for a familiar-suggested objective', () => {
      mount({
        concepts: [
          concept('c-root', 'Sprint', {
            subGoal: 'Understand sprint cadence',
            subGoalProvenance: 'familiar_suggested_accepted',
          }),
        ],
        edges: [],
        rootConceptId: 'c-root',
      });
      expect(testid('subgoal-provenance-pill')?.getAttribute('data-provenance')).toBe(
        'familiar',
      );
    });

    it('shows the "set an objective" affordance when unset (no pill)', () => {
      mount(); // default: the root concept has no objective
      expect(testid('subgoal-display')).toBeTruthy();
      expect(testid('subgoal-provenance-pill')).toBeFalsy();
      expect(component.hasSubGoal()).toBe(false);
    });

    it('inline edit saves the trimmed objective via patchConcept and updates the focal in place', () => {
      mount(); // focal = c-root, no objective
      testid<HTMLButtonElement>('subgoal-display')?.click(); // open the inline editor
      fixture.detectChanges();

      const input = testid<HTMLInputElement>('subgoal-input')!;
      expect(input).toBeTruthy();
      input.value = '  Reach story-point fluency  ';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      testid<HTMLButtonElement>('subgoal-save')?.click();

      // PATCH carries the TRIMMED objective; no full map refetch follows.
      const req = httpMock.expectOne(CONCEPT('c-root'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ subGoal: 'Reach story-point fluency' });
      req.flush({
        ...conceptDto('c-root', 'Sprint'),
        subGoal: 'Reach story-point fluency',
        subGoalProvenance: 'learner_authored',
      });
      fixture.detectChanges();

      // The local focal node reflects the save WITHOUT a reload (no GRAPH GET).
      expect(component.focalConcept()?.subGoal).toBe('Reach story-point fluency');
      expect(component.subGoalEditing()).toBe(false);
      expect(testid('subgoal-display')?.textContent).toContain('Reach story-point fluency');
      expect(testid('subgoal-provenance-pill')?.getAttribute('data-provenance')).toBe('you');
    });

    it('an empty save CLEARS the objective (PATCH subGoal:"")', () => {
      mount({
        concepts: [
          concept('c-root', 'Sprint', {
            subGoal: 'Old objective',
            subGoalProvenance: 'learner_authored',
          }),
        ],
        edges: [],
        rootConceptId: 'c-root',
      });
      expect(component.hasSubGoal()).toBe(true);
      testid<HTMLButtonElement>('subgoal-display')?.click();
      fixture.detectChanges();

      const input = testid<HTMLInputElement>('subgoal-input')!;
      input.value = '   '; // whitespace only → a clear
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      testid<HTMLButtonElement>('subgoal-save')?.click();
      const req = httpMock.expectOne(CONCEPT('c-root'));
      expect(req.request.body).toEqual({ subGoal: '' });
      req.flush({
        ...conceptDto('c-root', 'Sprint'),
        subGoal: '',
        subGoalProvenance: '',
      });
      fixture.detectChanges();

      expect(component.focalConcept()?.subGoal).toBe('');
      expect(component.hasSubGoal()).toBe(false);
      expect(testid('subgoal-display')).toBeTruthy(); // back to the "set" affordance
      expect(testid('subgoal-provenance-pill')).toBeFalsy();
    });

    it('cancel closes the objective editor without a PATCH', () => {
      mount();
      testid<HTMLButtonElement>('subgoal-display')?.click();
      fixture.detectChanges();
      expect(component.subGoalEditing()).toBe(true);

      testid<HTMLButtonElement>('subgoal-cancel')?.click();
      fixture.detectChanges();
      expect(component.subGoalEditing()).toBe(false);
      httpMock.expectNone(CONCEPT('c-root'));
    });

    it('a save failure toasts an error and keeps the editor open (fail-loud)', () => {
      mount();
      const toastSpy = vi.spyOn(TestBed.inject(ToastService), 'show');
      testid<HTMLButtonElement>('subgoal-display')?.click();
      fixture.detectChanges();
      const input = testid<HTMLInputElement>('subgoal-input')!;
      input.value = 'Objective';
      input.dispatchEvent(new Event('input'));
      testid<HTMLButtonElement>('subgoal-save')?.click();

      httpMock
        .expectOne(CONCEPT('c-root'))
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith('aplus.knowledge.action_error', 'error');
      expect(component.subGoalEditing()).toBe(true); // stays open so the learner can retry
    });

    it('Esc in the input cancels the edit and stops the drawer-close from firing', () => {
      mount();
      component.openDetail(); // drawer open on the focal
      component.openSubGoalEdit();
      fixture.detectChanges();
      expect(component.subGoalEditing()).toBe(true);

      // Esc must cancel the objective edit WITHOUT bubbling to the document
      // Escape handler that would otherwise close the whole drawer.
      const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      const stop = vi.spyOn(evt, 'stopPropagation');
      component.onSubGoalEscape(evt);
      fixture.detectChanges();

      expect(stop).toHaveBeenCalled();
      expect(component.subGoalEditing()).toBe(false);
      expect(component.detailOpen()).toBe(true); // the drawer stayed open
    });

    it('focuses the objective input when inline edit opens', () => {
      const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');
      mount();
      focusSpy.mockClear(); // ignore any mount-time focus

      component.openSubGoalEdit();
      fixture.detectChanges();
      fixture.detectChanges(); // let the viewChild resolve + the effect run

      expect(testid('subgoal-input')).toBeTruthy();
      expect(focusSpy).toHaveBeenCalled();
      focusSpy.mockRestore();
    });
  });

  // ══ Familiar Campaign (WS-C7 — CHO-2086) ═══════════════════════════════
  describe('campaign', () => {
    function nodeState(over: Partial<CampaignNodeState> = {}): CampaignNodeState {
      return {
        rungsCleared: 0,
        currentRungCorrect: 0,
        cooling: false,
        advancedToday: false,
        ...over,
      };
    }
    function campaignBlock(over: Partial<MapCampaign> = {}): MapCampaign {
      return {
        frontierTotal: 3,
        frontierWon: 1,
        canSeal: false,
        nodes: {},
        ...over,
      };
    }
    function suggestion(over: Partial<ConceptSuggestion> = {}): ConceptSuggestion {
      return { suggestionId: 's1', kind: 'concept', status: 'pending', ...over };
    }
    /** A map WITH a campaign + attached Familiar (the HUD/march happy path). */
    function withCampaign(over: Partial<MapCampaign> = {}): Partial<MapGraph> {
      return { attachedFamiliarId: 'fam-1', campaign: campaignBlock(over) };
    }

    // ── HUD visibility matrix (familiar × campaign × canSeal) ────────────
    it('shows the HUD when a Familiar rides the campaign (progress + march)', () => {
      mount(withCampaign({ frontierWon: 2, frontierTotal: 5, focusConceptId: 'c-plan' }));
      expect(testid('map-canvas-campaign-hud')).toBeTruthy();
      expect(testid('map-canvas-campaign-hud-empty')).toBeFalsy();
      expect(component.frontierWon()).toBe(2);
      expect(component.frontierTotal()).toBe(5);
      expect(testid('map-canvas-campaign-progress')).toBeTruthy();
      // Focus is c-plan ("Planning") → the march copy names it (i18n resolves at
      // runtime; the test TranslateService echoes keys, so assert on state).
      expect(component.focusTitle()).toBe('Planning');
      expect(component.isFocusUnassigned()).toBe(false);
      expect(testid('map-canvas-campaign-march')).toBeTruthy();
    });

    it('shows the inviting empty slot when the campaign has no Familiar', () => {
      mount({ campaign: campaignBlock(), attachedFamiliarId: undefined });
      expect(testid('map-canvas-campaign-hud')).toBeFalsy();
      expect(testid('map-canvas-campaign-hud-empty')).toBeTruthy();
    });

    // ── march copy names the marcher (CHO-2109) ──────────────────────────
    it('march copy names the familiar when the map read carries its name', () => {
      mount({
        ...withCampaign({ focusConceptId: 'c-plan' }),
        attachedFamiliarName: 'Ember',
      });
      expect(component.familiarName()).toBe('Ember');
      const march = testid('map-canvas-campaign-march');
      expect(march?.textContent).toContain('campaign_hud_march_named');
    });

    it('march copy falls back to neutral when the name is absent', () => {
      mount(withCampaign({ focusConceptId: 'c-plan' }));
      expect(component.familiarName()).toBe('');
      const march = testid('map-canvas-campaign-march');
      expect(march?.textContent).toContain('campaign_hud_march');
      expect(march?.textContent).not.toContain('campaign_hud_march_named');
    });

    it('renders NO campaign chrome when the map has no campaign block', () => {
      mount(); // default graph — no campaign
      expect(testid('map-canvas-campaign-hud')).toBeFalsy();
      expect(testid('map-canvas-campaign-hud-empty')).toBeFalsy();
      component.openDetail();
      fixture.detectChanges();
      expect(testid('map-canvas-campaign-panel')).toBeFalsy();
    });

    it('invites marching orders when the campaign focus is unassigned', () => {
      mount(withCampaign()); // no focusConceptId
      expect(component.isFocusUnassigned()).toBe(true);
      expect(testid('map-canvas-campaign-focus-state')).toBeFalsy();
    });

    it('paints the focus advanced-today chip in the HUD', () => {
      mount(
        withCampaign({
          focusConceptId: 'c-plan',
          nodes: { 'c-plan': nodeState({ advancedToday: true, rungsCleared: 2 }) },
        }),
      );
      expect(component.focusAdvancedToday()).toBe(true);
      expect(testid('map-canvas-campaign-focus-state')).toBeTruthy();
    });

    // ── Fog ghosts (projection + tap; CHO-2115 selected-node scoping) ────
    it('fans ghosts ONLY around the selected non-root focal (CHO-2115)', () => {
      mount(withCampaign());
      httpMock
        .expectOne((r) => r.url === SUGGESTIONS)
        .flush({
          suggestions: [
            suggestion({ suggestionId: 's-root', focalConceptId: 'c-root', title: 'RootGhost' }),
            suggestion({ suggestionId: 's-plan', focalConceptId: 'c-plan', title: 'PlanGhost' }),
            suggestion({ suggestionId: 's-edge', kind: 'edge', focalConceptId: 'c-plan' }),
            suggestion({ suggestionId: 's-done', status: 'accepted', focalConceptId: 'c-plan' }),
            suggestion({ suggestionId: 's-off', focalConceptId: 'ghost-elsewhere' }),
          ],
        });
      fixture.detectChanges();
      // Focal defaults to the ROOT → zero ghosts (root suppression), even
      // though a pending root-anchored suggestion exists.
      expect(component.focalId()).toBe('c-root');
      expect(component.fogGhosts().length).toBe(0);

      // Select a non-root node → ONLY its own pending concept ghosts fan.
      tapNode('c-plan');
      fixture.detectChanges();
      const ghosts = component.fogGhosts();
      expect(ghosts.length).toBe(1);
      expect(ghosts[0].suggestionId).toBe('s-plan');
      expect(ghosts[0].focalConceptId).toBe('c-plan');
    });

    it('selected node without pending suggestions fans nothing (CHO-2115)', () => {
      mount({
        ...withCampaign(),
        concepts: [
          concept('c-root', 'Sprint'),
          concept('c-plan', 'Planning', { atomRefs: ['atom-1'] }),
          concept('c-quad', 'Quadrants'),
        ],
        edges: [
          edge('e1', 'c-root', 'c-plan', 'hierarchy'),
          edge('e2', 'c-root', 'c-quad', 'hierarchy'),
        ],
      });
      httpMock
        .expectOne((r) => r.url === SUGGESTIONS)
        .flush({
          suggestions: [
            suggestion({ suggestionId: 's-plan', focalConceptId: 'c-plan', title: 'PlanGhost' }),
          ],
        });
      fixture.detectChanges();
      tapNode('c-quad');
      fixture.detectChanges();
      expect(component.fogGhosts().length).toBe(0);
    });

    it('fog-load failure fails soft (zero ghosts, map intact)', () => {
      mount(withCampaign());
      httpMock
        .expectOne((r) => r.url === SUGGESTIONS)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(component.fogGhosts().length).toBe(0);
      expect(testid('map-canvas-error')).toBeFalsy(); // canvas never broke
    });

    it('onFogTap focuses the anchor node and opens the Suggestions tab', () => {
      mount(withCampaign());
      component.onFogTap('c-plan');
      fixture.detectChanges();
      expect(component.focalId()).toBe('c-plan');
      expect(component.detailOpen()).toBe(true);
      expect(component.activeTab()).toBe('suggestions');
      // The Suggestions tab mounts the shared Familiar panel; drain its own
      // bootstrap fetches (covered by its spec) so verify() stays clean. Use a
      // superset body so both the suggestions loop (`{suggestions}`) and the
      // roster/memory fetches (`{items}`) parse without throwing.
      httpMock
        .match(() => true)
        .forEach((r) => !r.cancelled && r.flush({ items: [], suggestions: [] }));
    });

    // ── Drawer ladder panel ──────────────────────────────────────────────
    it('renders the 6 ladder pips + next revised-Bloom rung for the focal', () => {
      mount(withCampaign({ nodes: { 'c-root': nodeState({ rungsCleared: 3 }) } }));
      component.openDetail(); // drawer on c-root, Overview tab
      fixture.detectChanges();
      expect(testid('map-canvas-campaign-panel')).toBeTruthy();
      expect(
        testid('map-canvas-campaign-ladder')?.querySelectorAll('.mc-campaign__pip').length,
      ).toBe(6);
      expect(component.focalRungPips().filter(Boolean).length).toBe(3);
      // rungsCleared 3 → next rung 4 → the revised-Bloom "Analyze" label key.
      expect(component.focalNextRungLabelKey()).toBe('aplus.knowledge.campaign_rung_4');
      expect(testid('map-canvas-campaign-next')).toBeTruthy();
    });

    it('a won focal shows province + held-count and drops march/practice', () => {
      mount(
        withCampaign({
          nodes: {
            'c-root': nodeState({ rungsCleared: 6, wonAt: '2026-07-01T00:00:00Z' }),
            'c-plan': nodeState({ rungsCleared: 6, wonAt: '2026-07-02T00:00:00Z' }),
          },
        }),
      );
      component.openDetail(); // focal = c-root (won), with won descendant c-plan
      fixture.detectChanges();
      expect(component.focalWon()).toBe(true);
      expect(component.focalHeldCount()).toBe(1);
      expect(testid('map-canvas-campaign-won-at')).toBeTruthy();
      expect(testid('map-canvas-campaign-holds')).toBeTruthy();
      expect(testid('map-canvas-campaign-march-here')).toBeFalsy();
      expect(testid('map-canvas-campaign-practice')).toBeFalsy();
    });

    // ── March here / practice ────────────────────────────────────────────
    it('March here POSTs the campaign focus then silently refetches', () => {
      mount(withCampaign());
      component.openDetail(); // focal = c-root, not the campaign focus
      fixture.detectChanges();
      testid<HTMLButtonElement>('map-canvas-campaign-march-here')?.click();

      const req = httpMock.expectOne(CAMPAIGN_FOCUS);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ conceptId: 'c-root' });
      req.flush({ goalId: GOAL_ID, focusConceptId: 'c-root' });

      httpMock.expectOne(GRAPH).flush(graph(withCampaign({ focusConceptId: 'c-root' })));
      fixture.detectChanges();

      // Now the focal IS the march focus → "marching here" + stand-down.
      expect(testid('map-canvas-campaign-focus-here')).toBeTruthy();
      expect(testid('map-canvas-campaign-stand-down')).toBeTruthy();
    });

    it('Practice this hex deep-links the node-scoped campaign practice lane', () => {
      mount(withCampaign());
      component.openDetail();
      fixture.detectChanges();
      const nav = vi.spyOn(TestBed.inject(Router), 'navigate');
      testid<HTMLButtonElement>('map-canvas-campaign-practice')?.click();
      expect(nav).toHaveBeenCalledWith(['/a/daily-dose'], {
        queryParams: { campaign_node: 'c-root', goal_id: GOAL_ID, concept: 'Sprint' },
      });
    });

    // ── CHO-2314: a campaign hex's practice CTA routes to the banner lane ──
    // A non-focus campaign hex offers only the weakness "Practice" (requestPractice
    // → ?growth_edge_id), which credits the campaign but shows NO rung/paced/won
    // feedback. Route any live campaign hex to the ?campaign_node= banner lane.
    it('requestPractice routes a live campaign hex to the campaign lane, not the weakness dose (CHO-2314)', () => {
      mount(withCampaign({ nodes: { 'c-root': nodeState({ rungsCleared: 2 }) } }));
      component.openDetail(); // focal = c-root, a live (unwon) campaign hex
      fixture.detectChanges();
      const nav = vi.spyOn(TestBed.inject(Router), 'navigate');
      component.requestPractice();
      expect(nav).toHaveBeenCalledWith(['/a/daily-dose'], {
        queryParams: { campaign_node: 'c-root', goal_id: GOAL_ID, concept: 'Sprint' },
      });
    });

    it('requestPractice does NOT reroute a WON hex to the campaign lane (CHO-2314)', () => {
      mount(
        withCampaign({
          nodes: { 'c-root': nodeState({ rungsCleared: 6, wonAt: '2026-07-01T00:00:00Z' }) },
        }),
      );
      component.openDetail();
      fixture.detectChanges();
      const nav = vi.spyOn(TestBed.inject(Router), 'navigate');
      component.requestPractice();
      // A won hex has left the campaign; it must not deep-link the campaign lane.
      expect(nav).not.toHaveBeenCalledWith(['/a/daily-dose'], {
        queryParams: { campaign_node: 'c-root', goal_id: GOAL_ID, concept: 'Sprint' },
      });
      // ADR-242 D2: it lands on the weakness dose STILL carrying the goal (no
      // growth edge is painted here, so the goal is the only scope there is).
      expect(nav).toHaveBeenCalledWith(['/a/daily-dose'], {
        queryParams: { goal_id: GOAL_ID },
      });
    });

    it('surfaces a focus 422 (FOCUS_OUTSIDE_CAMPAIGN) as an honest inline notice', () => {
      mount(withCampaign());
      component.openDetail();
      fixture.detectChanges();
      testid<HTMLButtonElement>('map-canvas-campaign-march-here')?.click();
      httpMock
        .expectOne(CAMPAIGN_FOCUS)
        .flush(
          { code: 'FOCUS_OUTSIDE_CAMPAIGN', message: 'x' },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      fixture.detectChanges();
      expect(component.campaignActionError()).toBe('aplus.knowledge.campaign_focus_err_outside');
      expect(testid('map-canvas-campaign-error')).toBeTruthy();
    });

    // ── Merge / split affordances ────────────────────────────────────────
    it('Merge into a neighbour POSTs the merge and closes the drawer', () => {
      mount(withCampaign());
      tapNode('c-plan'); // focus non-root "Planning" (neighbour of root)
      fixture.detectChanges();
      testid<HTMLButtonElement>('map-canvas-campaign-merge-toggle')?.click();
      fixture.detectChanges();
      // The survivor picker lists c-plan's neighbour → c-root.
      const into = testid<HTMLButtonElement>('map-canvas-campaign-merge-into-c-root');
      expect(into).toBeTruthy();
      into?.click();

      const req = httpMock.expectOne(MERGE('c-plan'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ survivorConceptId: 'c-root' });
      req.flush({ survivorConceptId: 'c-root', absorbedConceptId: 'c-plan' });

      httpMock.expectOne(GRAPH).flush(graph(withCampaign()));
      fixture.detectChanges();
      expect(component.detailOpen()).toBe(false);
    });

    it('never offers merge/split on the map ROOT concept', () => {
      mount(withCampaign());
      component.openDetail(); // focal = c-root (the root)
      fixture.detectChanges();
      expect(component.focalCanRestructure()).toBe(false);
      expect(testid('map-canvas-campaign-merge-toggle')).toBeFalsy();
      expect(testid('map-canvas-campaign-split-toggle')).toBeFalsy();
    });

    it('Split into named children POSTs children + focusChildIndex', () => {
      mount(withCampaign());
      tapNode('c-plan');
      fixture.detectChanges();
      testid<HTMLButtonElement>('map-canvas-campaign-split-toggle')?.click();
      fixture.detectChanges();

      const c0 = testid<HTMLInputElement>('map-canvas-campaign-split-child-0')!;
      c0.value = 'Left';
      c0.dispatchEvent(new Event('input'));
      const c1 = testid<HTMLInputElement>('map-canvas-campaign-split-child-1')!;
      c1.value = 'Right';
      c1.dispatchEvent(new Event('input'));
      component.setSplitFocusIndex(1); // familiar marches on the 2nd child
      fixture.detectChanges();

      testid<HTMLButtonElement>('map-canvas-campaign-split-confirm')?.click();
      const req = httpMock.expectOne(SPLIT('c-plan'));
      expect(req.request.body).toEqual({
        children: [{ title: 'Left' }, { title: 'Right' }],
        focusChildIndex: 1,
      });
      req.flush({
        parentConceptId: 'c-plan',
        children: [
          { conceptId: 'c-l', title: 'Left', conceptKey: 'left' },
          { conceptId: 'c-r', title: 'Right', conceptKey: 'right' },
        ],
      });
      httpMock.expectOne(GRAPH).flush(graph(withCampaign()));
      fixture.detectChanges();
      expect(component.detailOpen()).toBe(false);
    });

    it('Split can grow up to six children', () => {
      mount(withCampaign());
      tapNode('c-plan');
      fixture.detectChanges();
      testid<HTMLButtonElement>('map-canvas-campaign-split-toggle')?.click();
      fixture.detectChanges();
      expect(component.splitChildren().length).toBe(2);
      testid<HTMLButtonElement>('map-canvas-campaign-split-add')?.click();
      fixture.detectChanges();
      expect(component.splitChildren().length).toBe(3);
    });

    it('surfaces a merge 409 (ROOT_IMMUTABLE) inline, drawer stays open', () => {
      mount(withCampaign());
      tapNode('c-plan');
      fixture.detectChanges();
      testid<HTMLButtonElement>('map-canvas-campaign-merge-toggle')?.click();
      fixture.detectChanges();
      testid<HTMLButtonElement>('map-canvas-campaign-merge-into-c-root')?.click();
      httpMock
        .expectOne(MERGE('c-plan'))
        .flush({ code: 'ROOT_IMMUTABLE', message: 'x' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(component.campaignActionError()).toBe(
        'aplus.knowledge.campaign_merge_err_root_immutable',
      );
      expect(testid('map-canvas-campaign-error')).toBeTruthy();
      expect(component.detailOpen()).toBe(true);
    });

    // ── Seal ceremony ────────────────────────────────────────────────────
    it('seal CTA appears when canSeal; success opens the celebration modal', () => {
      mount(withCampaign({ canSeal: true }));
      const cta = testid<HTMLButtonElement>('map-canvas-campaign-seal');
      expect(cta).toBeTruthy();
      cta?.click();

      const req = httpMock.expectOne(CAMPAIGN_SEAL);
      expect(req.request.method).toBe('POST');
      req.flush({
        goalId: GOAL_ID,
        sealedAt: '2026-07-10T00:00:00Z',
        isReseal: false,
        nodesWon: 4,
      });
      // success → silent refetch + celebration modal.
      httpMock.expectOne(GRAPH).flush(graph(withCampaign({ canSeal: false })));
      fixture.detectChanges();

      expect(testid('map-canvas-seal-modal')).toBeTruthy();
      expect(testid('map-canvas-seal-body')).toBeTruthy();
      expect(component.sealResult()?.nodesWon).toBe(4);
      expect(component.sealResult()?.isReseal).toBe(false);

      testid<HTMLButtonElement>('map-canvas-seal-dismiss')?.click();
      fixture.detectChanges();
      expect(testid('map-canvas-seal-modal')).toBeFalsy();
    });

    it('a FRONTIER_NOT_EMPTY seal 409 shows the remaining-hex count inline', () => {
      mount(withCampaign({ canSeal: true, frontierTotal: 5, frontierWon: 2 }));
      testid<HTMLButtonElement>('map-canvas-campaign-seal')?.click();
      httpMock
        .expectOne(CAMPAIGN_SEAL)
        .flush(
          { code: 'FRONTIER_NOT_EMPTY', message: 'x' },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();
      expect(component.sealError()).toBe('aplus.knowledge.campaign_seal_frontier_not_empty');
      expect(component.sealErrorCount()).toBe(3); // 5 − 2
      expect(testid('map-canvas-campaign-seal-error')).toBeTruthy();
      expect(component.sealResult()).toBeNull(); // no celebration on failure
    });

    it('the seal modal shows the reseal variant when isReseal', () => {
      mount(withCampaign({ canSeal: true }));
      testid<HTMLButtonElement>('map-canvas-campaign-seal')?.click();
      httpMock.expectOne(CAMPAIGN_SEAL).flush({
        goalId: GOAL_ID,
        sealedAt: '2026-07-10T00:00:00Z',
        isReseal: true,
        nodesWon: 1,
      });
      httpMock.expectOne(GRAPH).flush(graph(withCampaign({ canSeal: false })));
      fixture.detectChanges();
      expect(component.sealResult()?.isReseal).toBe(true);
      expect(testid('map-canvas-seal-modal')).toBeTruthy();
    });

    // ── Stand down / cooling / cancels ───────────────────────────────────
    it('Stand down clears the campaign focus (POST focus null)', () => {
      mount(withCampaign({ focusConceptId: 'c-root' }));
      component.openDetail(); // focal = c-root = the campaign focus
      fixture.detectChanges();
      expect(component.focalIsCampaignFocus()).toBe(true);
      expect(testid('map-canvas-campaign-march-here')).toBeFalsy();
      testid<HTMLButtonElement>('map-canvas-campaign-stand-down')?.click();
      const req = httpMock.expectOne(CAMPAIGN_FOCUS);
      expect(req.request.body).toEqual({ conceptId: null });
      req.flush({ goalId: GOAL_ID });
      httpMock.expectOne(GRAPH).flush(graph(withCampaign()));
      fixture.detectChanges();
    });

    it('paints the cooling cue on the focus (HUD) and the focal state (drawer)', () => {
      mount(
        withCampaign({
          focusConceptId: 'c-root',
          nodes: { 'c-root': nodeState({ rungsCleared: 2, cooling: true }) },
        }),
      );
      expect(component.focusCooling()).toBe(true);
      expect(testid('map-canvas-campaign-focus-state')).toBeTruthy();
      component.openDetail();
      fixture.detectChanges();
      expect(component.focalCooling()).toBe(true);
      expect(component.focalCampaignStateKey()).toBe('aplus.knowledge.campaign_cooling');
    });

    it('cancel closes the merge picker (and split form) without a request', () => {
      mount(withCampaign());
      tapNode('c-plan');
      fixture.detectChanges();
      testid<HTMLButtonElement>('map-canvas-campaign-merge-toggle')?.click();
      fixture.detectChanges();
      expect(component.mergeOpen()).toBe(true);
      testid<HTMLButtonElement>('map-canvas-campaign-merge-cancel')?.click();
      fixture.detectChanges();
      expect(component.mergeOpen()).toBe(false);

      testid<HTMLButtonElement>('map-canvas-campaign-split-toggle')?.click();
      fixture.detectChanges();
      expect(component.splitOpen()).toBe(true);
      testid<HTMLButtonElement>('map-canvas-campaign-split-cancel')?.click();
      fixture.detectChanges();
      expect(component.splitOpen()).toBe(false);
    });
  });
});
