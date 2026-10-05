/**
 * RED spec: a goal-level suggestion is visible from ANY node, not only the root
 * (C4 frontend slice 2 item 3).
 *
 * ADR-238 D4 surfaces an UNMATCHED weakness (one whose concept-match found no
 * target on the map) as a concept suggestion, because a goal-level growth edge
 * paints on no node and WS-4 retired the only browsable edge list, so without
 * it the weakness surfaces nowhere at all.
 *
 * To survive the read-time goal fence, which keeps only rows whose focal sits in
 * the goal's subtree (`concept_suggestion_handler.go:457`, and a whole-map row
 * with an empty focal is in NO subtree), D4 anchors that row at the goal ROOT
 * (`weakness_analyzed_subscriber.go:371`). That fixed the storage problem and
 * left a reachability one: the panel reads suggestions scoped to the FOCAL
 * concept, and the backend's focal read returns "that concept's rows plus
 * whole-map ones", so a root-anchored row reached a learner only when they
 * happened to be standing on the root. "Never dropped" was true in storage and
 * false in the UI, which is the same trap in a new costume.
 *
 * The contract this must NOT break while fixing that: a suggestion anchored on a
 * DIFFERENT node must still not leak onto this one. That narrowing exists so a
 * stale prior-generate batch does not fan around the wrong concept, and it is
 * preserved here by filtering client-side rather than by widening what renders.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../../environments/environment';
import { MapFamiliarPanelComponent } from './map-familiar-panel.component';
import type { ConceptNode } from '../../discovery-graph/concept-graph.model';
import type { FamiliarMapMemory } from '../../discovery-graph/familiar-map.model';
import { PENDING_REVIEW_STORAGE_KEY } from '../../growth-edge-review/pending-review.store';

const BFF = environment.bffBaseUrl;
const GOAL_ID = 'goal-1';
const FAM_ID = 'fam-1';
const ROOT = 'c-root';
const FOCAL = 'c1';
const OTHER = 'c2';

const MEMORY = `${BFF}/api/v1/me/familiars/${FAM_ID}/memory?goal_id=${GOAL_ID}`;
const GROWTH = `${BFF}/api/v1/me/familiars/${FAM_ID}/growth`;
const SUGGEST = `${BFF}/api/v1/me/concept-graph/suggestions`;
const UPLOADS = `${BFF}/api/v1/me/growth-edges/uploads`;

const CONCEPTS: readonly ConceptNode[] = [
  { conceptId: ROOT, title: 'Scrum', atomRefs: [] },
  { conceptId: FOCAL, title: 'Fractions', atomRefs: [] },
  { conceptId: OTHER, title: 'Decimals', atomRefs: [] },
];

function memory(): FamiliarMapMemory {
  return {
    familiarId: FAM_ID,
    name: 'Sage',
    focus: 'Algebra',
    persona: 'Encouraging',
    rules: {},
    evolutionTier: 'hatchling',
    skills: [],
    hasMemory: false,
    memories: [],
    visibleNeighbors: [],
  };
}

/** One pending suggestion. `focal` omitted = a whole-map row. */
function suggestion(
  suggestionId: string,
  focal?: string,
): Record<string, unknown> {
  return {
    suggestionId,
    kind: 'concept',
    status: 'pending',
    title: `Title ${suggestionId}`,
    ...(focal ? { focalConceptId: focal } : {}),
  };
}

describe('MapFamiliarPanel goal-level suggestions', () => {
  let fixture: ComponentFixture<MapFamiliarPanelComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapFamiliarPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MapFamiliarPanelComponent);
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem(PENDING_REVIEW_STORAGE_KEY);
    for (const suffix of ['/skills', '/growth']) {
      httpMock
        .match((r) => r.url.endsWith(suffix))
        .forEach((r) => {
          if (!r.cancelled) {
            r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
          }
        });
    }
    httpMock
      .match((r) => r.url === UPLOADS && r.method === 'GET')
      .forEach((r) => !r.cancelled && r.flush({ items: [] }));
    fixture.destroy();
    httpMock.verify();
  });

  function testid<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return element.querySelector<T>(`[data-testid="${id}"]`);
  }

  /**
   * Mount the Suggestions tab standing on `focal`, and answer the suggestions
   * read with `rows`. Returns the intercepted request so a test can assert on
   * the call SHAPE as well as on what it rendered.
   */
  function mount(focal: string, rows: Record<string, unknown>[]) {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.componentRef.setInput('attachedFamiliarId', FAM_ID);
    fixture.componentRef.setInput('focalConceptId', focal);
    fixture.componentRef.setInput('rootConceptId', ROOT);
    fixture.componentRef.setInput('concepts', CONCEPTS);
    fixture.componentRef.setInput('focalWon', true);
    fixture.componentRef.setInput('isRoot', focal === ROOT);
    fixture.componentRef.setInput('section', 'suggestions');
    fixture.detectChanges();
    httpMock.expectOne(MEMORY).flush(memory());
    httpMock
      .match(GROWTH)
      .forEach(
        (r) =>
          !r.cancelled &&
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' }),
      );
    const req = httpMock.expectOne((r) => r.url.split('?')[0] === SUGGEST);
    req.flush({ suggestions: rows });
    fixture.detectChanges();
    return req;
  }

  it('shows a ROOT-anchored suggestion while standing on a non-root node', () => {
    // The whole point: D4 anchors at the root to survive the goal fence, which
    // made the row invisible from anywhere else.
    mount(FOCAL, [suggestion('s-goal', ROOT)]);

    expect(testid('map-familiar-goal-suggestions')).toBeTruthy();
    expect(testid('map-familiar-goal-suggestions')!.textContent).toContain(
      'Title s-goal',
    );
  });

  it('still keeps another node\'s suggestion off this node', () => {
    // The focal narrowing exists so a stale batch anchored elsewhere does not
    // fan around the wrong concept. Fixing reachability must not undo it.
    mount(FOCAL, [suggestion('s-other', OTHER)]);

    expect(testid('map-familiar-goal-suggestions')).toBeNull();
    expect(element.textContent).not.toContain('Title s-other');
  });

  it('still renders this node\'s own suggestions where they always were', () => {
    mount(FOCAL, [suggestion('s-mine', FOCAL)]);

    expect(testid('map-familiar-suggestion-list')).toBeTruthy();
    expect(testid('map-familiar-suggestion-list')!.textContent).toContain(
      'Title s-mine',
    );
  });

  it('reads ONCE, goal-scoped, with no focal parameter', () => {
    // One call shape the handler already accepts (`?goalId=`), narrowed
    // client-side, rather than a second request per tab open.
    const req = mount(FOCAL, []);

    expect(req.request.params.get('goalId')).toBe(GOAL_ID);
    expect(req.request.params.get('focalConceptId')).toBeNull();
    expect(httpMock.match((r) => r.url.split('?')[0] === SUGGEST)).toHaveLength(0);
  });

  it('does not show the same row twice while standing ON the root', () => {
    // On the root the row is already this node's own, so a goal-level section
    // beside it would render it a second time.
    mount(ROOT, [suggestion('s-goal', ROOT)]);

    expect(testid('map-familiar-goal-suggestions')).toBeNull();
    expect(testid('map-familiar-suggestion-list')!.textContent).toContain(
      'Title s-goal',
    );
  });
});
