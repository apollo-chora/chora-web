/**
 * RED spec: the Diagnose tab lists the diagnoses parked at the HITL review
 * interrupt (C4 frontend slice 2 item 2).
 *
 * A diagnosis that parks at the bounded interrupt is a SUCCESS waiting on the
 * learner, not a failure, and until now the panel said nothing about it: the
 * only way back was the /a/knowledge banner or the URL. This lists them where
 * the learner already is, each deep-linking to the live review route
 * (`aplus.routes.ts:358`, which must keep preceding the redirect fold).
 *
 * Two rules the spec exists to hold.
 *
 * The read is LAZY. It fires when the Diagnose tab is on screen and not before,
 * the same discipline the Companion reflection already follows: a panel the
 * learner never opened should cost nothing.
 *
 * The list is GOAL-SCOPED by the CALLER. The collection takes only
 * `?status=awaiting_review` (`growth_edge_pending_reviews.go:59` refuses a bare
 * GET, and there is no goal parameter), so every learner row comes back and the
 * filtering is ours to do on `goal_id`. A row from another map rendered here
 * would be a diagnosis attributed to a goal it does not belong to.
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
const OTHER_GOAL = 'goal-2';
const FAM_ID = 'fam-1';

const MEMORY = `${BFF}/api/v1/me/familiars/${FAM_ID}/memory?goal_id=${GOAL_ID}`;
const GROWTH = `${BFF}/api/v1/me/familiars/${FAM_ID}/growth`;
const SUGGEST = `${BFF}/api/v1/me/concept-graph/suggestions`;
const UPLOADS = `${BFF}/api/v1/me/growth-edges/uploads`;
const KNOWLEDGE = `${BFF}/api/v1/me/goals/${GOAL_ID}/knowledge`;

/** The real memory wire shape; an invented one crashes the memory sub-panel. */
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

const CONCEPTS: readonly ConceptNode[] = [
  { conceptId: 'c1', title: 'Fractions', atomRefs: [] },
  { conceptId: 'c2', title: 'Decimals', atomRefs: [] },
];

/**
 * One parked row. Pass `null` for "no goal at all": `undefined` would trigger
 * the parameter DEFAULT and quietly give the row this goal, which is how the
 * first cut of this helper tested the opposite of what it claimed.
 */
function parked(
  uploadId: string,
  goalId: string | null = GOAL_ID,
): Record<string, unknown> {
  return {
    upload_id: uploadId,
    upload_kind: 'marked_test',
    status: 'AWAITING_REVIEW',
    ...(goalId ? { goal_id: goalId } : {}),
    created_at: '2026-09-01T00:00:00Z',
  };
}

describe('MapFamiliarPanel parked diagnoses', () => {
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
    fixture.destroy();
    httpMock.verify();
  });

  function testid<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return element.querySelector<T>(`[data-testid="${id}"]`);
  }

  /** Mount on one tab, settling the reads that tab makes. */
  function mount(section: 'diagnose' | 'familiar'): void {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.componentRef.setInput('attachedFamiliarId', FAM_ID);
    fixture.componentRef.setInput('focalConceptId', 'c1');
    fixture.componentRef.setInput('concepts', CONCEPTS);
    fixture.componentRef.setInput('focalWon', true);
    fixture.componentRef.setInput('isRoot', false);
    fixture.componentRef.setInput('section', section);
    fixture.detectChanges();
    httpMock.expectOne(MEMORY).flush(memory());
    // The header portrait's growth GET is fire-and-forget enrichment; this
    // spec does not exercise it, so error it the way the sibling spec does.
    httpMock
      .match(GROWTH)
      .forEach(
        (r) =>
          !r.cancelled &&
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' }),
      );
    httpMock
      .expectOne((r) => r.url.split('?')[0] === SUGGEST)
      .flush({ suggestions: [] });
    if (section === 'familiar') {
      httpMock.expectOne(KNOWLEDGE).flush({
        goalId: GOAL_ID,
        reflection: { text: '', status: 'none' },
        shakyConcepts: [],
        memories: [],
      });
    }
    fixture.detectChanges();
  }

  /** Answer the parked-diagnoses read with the given rows. */
  function flushParked(rows: Record<string, unknown>[]): void {
    const req = httpMock.expectOne(
      (r) => r.url === UPLOADS && r.method === 'GET',
    );
    expect(req.request.params.get('status')).toBe('awaiting_review');
    req.flush({ items: rows });
    fixture.detectChanges();
  }

  it('does NOT read the parked list while the Diagnose tab is closed', () => {
    // Same discipline as the Companion reflection: a panel the learner never
    // opened should cost nothing.
    mount('familiar');

    expect(httpMock.match((r) => r.url === UPLOADS)).toHaveLength(0);
  });

  it('lists this goal, and deep-links each row to its review', () => {
    mount('diagnose');
    flushParked([parked('u-1')]);

    const list = testid('map-familiar-parked');
    expect(list).toBeTruthy();

    const link = list!.querySelector<HTMLAnchorElement>('a');
    expect(link?.getAttribute('href')).toBe('/a/growth-edges/review/u-1');
  });

  it('drops a row belonging to a DIFFERENT map', () => {
    // The collection takes no goal parameter, so every learner row arrives and
    // the filtering is ours. Rendering another map's diagnosis here would
    // attribute it to a goal it does not belong to.
    mount('diagnose');
    flushParked([parked('u-1'), parked('u-other', OTHER_GOAL)]);

    const links = testid('map-familiar-parked')!.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/a/growth-edges/review/u-1');
  });

  it('drops a row carrying NO goal at all', () => {
    // A non-goal upload (the learner diagnosed from outside a map) is not this
    // map's business, and `goal_id` is omitted rather than blank on the wire.
    mount('diagnose');
    flushParked([parked('u-nogoal', null)]);

    expect(testid('map-familiar-parked')).toBeNull();
  });

  it('renders no heading at all when nothing is parked', () => {
    // An empty section header reads as "loading" or as a defect.
    mount('diagnose');
    flushParked([]);

    expect(testid('map-familiar-parked')).toBeNull();
  });
});
