/**
 * RED spec for the drawer Overview's "also on" list (C4 frontend slice 2).
 *
 * The concept the learner opened may also sit on a course path, and the Overview
 * says so: the course, and which module of it this concept is. `map-roads.spec`
 * pins the ORDER and the LABEL rule; this pins what reaches the DOM, which is
 * where two claims can go wrong that a pure test cannot see.
 *
 * The first is the link target. There is no module to deep-link: the learn route
 * reads `courseId` and no query params at all (course-learn.component.ts:73) and
 * no path-scoped route exists, so the ordinal is TEXT and the link opens the
 * course. A `?module=` link would point at a parameter no route reads.
 *
 * The second is the unresolved course. When the projection resolves no title the
 * wire omits it, and the drawer must render that identifier as an identifier: a
 * raw id sitting where a course name belongs reads to the learner as a course
 * actually called that.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { environment } from '../../../../../../environments/environment';
import { MapCanvasComponent } from './map-canvas.component';
import { LastVisitedMapService } from '../../../../../core/services/last-visited-map.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import type { MapGraph } from '../maps.model';
import type { ConceptNode } from '../../discovery-graph/concept-graph.model';

const BFF = environment.bffBaseUrl;
const GOAL_ID = 'goal-1';
const GRAPH = `${BFF}/api/v1/me/maps/${GOAL_ID}/graph`;
const GROWTH_EDGES = `${BFF}/api/v1/me/growth-edges`;
const SUGGESTIONS = `${BFF}/api/v1/me/concept-graph/suggestions`;

const CERT_ROAD = {
  pathId: 'p-cert',
  courseId: 'c-algebra',
  courseTitle: 'Algebra I',
  atomPosition: 4,
  atomCount: 2,
};

/** A road whose course_directory projection resolved no title. */
const UNRESOLVED_ROAD = {
  pathId: 'p-elective',
  courseId: 'c-9f2a',
  atomPosition: 1,
  atomCount: 1,
};

function concept(
  conceptId: string,
  title: string,
  over: Partial<ConceptNode> = {},
): ConceptNode {
  return { conceptId, title, atomRefs: [], ...over };
}

function graph(roads?: ConceptNode['roads']): MapGraph {
  return {
    goalId: GOAL_ID,
    title: 'Scrum',
    rootConceptId: 'c-root',
    concepts: [
      concept('c-root', 'Sprint'),
      concept('c-plan', 'Planning', { atomRefs: ['atom-1'], roads }),
    ],
    edges: [
      {
        edgeId: 'e1',
        sourceConceptId: 'c-root',
        targetConceptId: 'c-plan',
        class: 'hierarchy',
        provenance: 'learner_authored',
      },
    ],
  };
}

describe('MapCanvas Overview roads', () => {
  let fixture: ComponentFixture<MapCanvasComponent>;
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
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock
      .match(GROWTH_EDGES)
      .forEach((r) => !r.cancelled && r.flush({ items: [] }));
    httpMock
      .match((r) => r.url === SUGGESTIONS)
      .forEach((r) => !r.cancelled && r.flush({ suggestions: [] }));
    httpMock.verify();
  });

  function testid<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return element.querySelector<T>(`[data-testid="${id}"]`);
  }

  /** Mount the map, then open the drawer on the concept that carries the roads. */
  function openPlanning(roads?: ConceptNode['roads']): void {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.detectChanges();
    httpMock.expectOne(GRAPH).flush(graph(roads));
    fixture.detectChanges();
    element
      .querySelector('[data-testid="concept-lens-node-c-plan"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
  }

  it('names the course and the module, and links to the COURSE', () => {
    openPlanning([CERT_ROAD]);

    const list = testid('map-canvas-focal-roads');
    expect(list).toBeTruthy();

    const link = list!.querySelector<HTMLAnchorElement>('a');
    expect(link?.textContent?.trim()).toBe('Algebra I');
    // The route the SPA actually serves. No module anchor exists, so none is
    // fabricated into the href.
    expect(link?.getAttribute('href')).toBe('/a/courses/c-algebra/learn');
    expect(link?.getAttribute('href')).not.toContain('module');

    // The test TranslateService ECHOES keys, so the rendered module sentence is
    // the key, not the copy. Assert the ordinal reached the DOM as state.
    expect(testid('road-module')?.getAttribute('data-position')).toBe('4');
  });

  it('renders an unresolved course as an identifier, never as a name', () => {
    openPlanning([UNRESOLVED_ROAD]);

    const link = testid('map-canvas-focal-roads')!.querySelector('a')!;
    expect(link.textContent?.trim()).toBe('c-9f2a');
    // Marked so the eye and the screen reader both get told it is an id.
    expect(link.classList.contains('is-unresolved')).toBe(true);
  });

  it('says nothing at all when the concept sits on no road', () => {
    // A concept off every course path must not render an empty heading: a
    // section header with no rows reads as "loading" or as a defect.
    openPlanning(undefined);

    expect(testid('map-canvas-focal-roads')).toBeNull();
  });

  it('lists every road the concept sits on', () => {
    openPlanning([CERT_ROAD, UNRESOLVED_ROAD]);

    const links = testid('map-canvas-focal-roads')!.querySelectorAll('a');
    expect(links).toHaveLength(2);
    // Ordered by pathId: p-cert before p-elective.
    expect(links[0].textContent?.trim()).toBe('Algebra I');
    expect(links[1].textContent?.trim()).toBe('c-9f2a');
  });
});
