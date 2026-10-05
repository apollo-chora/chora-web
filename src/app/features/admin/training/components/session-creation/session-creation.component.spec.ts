import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SessionCreationComponent } from './session-creation.component';
import {
  TrainingAdminService,
  type AtomSearchResult,
} from '../../services/training-admin.service';
import { environment } from '../../../../../../environments/environment';

const ATOM_SEARCH_URL = `${environment.bffBaseUrl}/api/v1/atomic/atoms/search`;
const CREATE_SESSION_URL = `${environment.bffBaseUrl}/api/v1/training-admin/sessions`;

const STUB_ATOMS: readonly AtomSearchResult[] = [
  {
    id: 'atom-001',
    title: 'Intro to Photosynthesis',
    type: 'concept',
    topic_name: 'Biology',
    difficulty: 2,
  },
  {
    id: 'atom-002',
    title: 'Cellular Respiration',
    type: 'concept',
    topic_name: 'Biology',
    difficulty: 3,
  },
];

function makeAtom(id: string): AtomSearchResult {
  return {
    id,
    title: `Atom ${id}`,
    type: 'concept',
    topic_name: 'Topic',
    difficulty: 1,
  };
}

function setup(): {
  fixture: ComponentFixture<SessionCreationComponent>;
  component: SessionCreationComponent;
  element: HTMLElement;
  httpMock: HttpTestingController;
  service: TrainingAdminService;
} {
  TestBed.configureTestingModule({
    imports: [SessionCreationComponent, TranslateModule.forRoot()],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(SessionCreationComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  const service = TestBed.inject(TrainingAdminService);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    httpMock,
    service,
  };
}

describe('SessionCreationComponent', () => {
  let fixture: ComponentFixture<SessionCreationComponent>;
  let component: SessionCreationComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let service: TrainingAdminService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    component = built.component;
    element = built.element;
    httpMock = built.httpMock;
    service = built.service;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('shell render', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the section root with the title heading', () => {
      const root = element.querySelector('[data-testid="session-creation"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      const title = element.querySelector('.session-creation__title');
      expect(title?.textContent).toContain('training.session-creation.title');
    });

    it('renders the session detail form fields', () => {
      expect(
        element.querySelector('[data-testid="session-form"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="session-title-input"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="session-date-input"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="session-duration-input"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="session-participants-input"]'),
      ).not.toBeNull();
    });

    it('renders both the atom browser and the agenda panels', () => {
      expect(
        element.querySelector('[data-testid="atom-browser"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="session-agenda"]'),
      ).not.toBeNull();
    });

    it('initialises the default form-field signals', () => {
      expect(component.title()).toBe('');
      expect(component.description()).toBe('');
      expect(component.scheduledAt()).toBe('');
      expect(component.durationMinutes()).toBe(60);
      expect(component.maxParticipants()).toBe(30);
      expect(component.venueId()).toBe('');
    });
  });

  describe('empty agenda state', () => {
    it('shows the empty-agenda message and no total-duration line', () => {
      expect(
        element.querySelector('[data-testid="agenda-empty"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="total-duration"]'),
      ).toBeNull();
    });

    it('renders an agenda count of 0', () => {
      const count = element.querySelector('.session-creation__agenda-count');
      expect(count?.textContent).toContain('0');
    });

    it('keeps submit disabled while the agenda is empty', () => {
      const submit = element.querySelector(
        '[data-testid="session-submit-btn"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(component.canSubmit()).toBe(false);
    });
  });

  describe('atom search', () => {
    it('short-circuits and fires no HTTP for queries shorter than 2 chars', () => {
      component.searchQuery.set('a');
      component.searchAtoms();
      // afterEach httpMock.verify() asserts no request was made.
      expect(service.atomSearchState().status).toBe('idle');
    });

    it('does not fire HTTP for an empty / whitespace query', () => {
      component.searchQuery.set('   ');
      component.searchAtoms();
      expect(service.atomSearchState().status).toBe('idle');
    });

    it('fires the search GET and renders results on success', () => {
      component.searchQuery.set('bio');
      component.searchAtoms();

      const req = httpMock.expectOne(
        `${ATOM_SEARCH_URL}?q=bio`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: STUB_ATOMS });
      fixture.detectChanges();

      const items = element.querySelectorAll('.session-creation__atom-item');
      expect(items.length).toBe(2);
      const first = element.querySelector('.session-creation__atom-name');
      expect(first?.textContent).toContain('Intro to Photosynthesis');
      expect(component.atomResults().length).toBe(2);
    });

    it('url-encodes the query string', () => {
      component.searchQuery.set('cell biology');
      component.searchAtoms();
      const req = httpMock.expectOne(`${ATOM_SEARCH_URL}?q=cell%20biology`);
      req.flush({ data: [] });
      fixture.detectChanges();
      expect(component.atomResults().length).toBe(0);
    });

    it('shows the loading status indicator while the search is in flight', () => {
      component.searchQuery.set('bio');
      component.searchAtoms();
      fixture.detectChanges();

      const status = element.querySelector(
        '.session-creation__browser-status',
      );
      expect(status).not.toBeNull();
      expect(service.atomSearchState().status).toBe('loading');

      const req = httpMock.expectOne(`${ATOM_SEARCH_URL}?q=bio`);
      req.flush({ data: STUB_ATOMS });
    });

    it('handles a 5xx search error gracefully (empty results, no throw)', () => {
      component.searchQuery.set('bio');
      component.searchAtoms();

      const req = httpMock.expectOne(`${ATOM_SEARCH_URL}?q=bio`);
      req.flush(
        { error: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );
      fixture.detectChanges();

      expect(service.atomSearchState().status).toBe('error');
      expect(component.atomResults().length).toBe(0);
      // empty atom list → no result rows rendered
      expect(
        element.querySelectorAll('.session-creation__atom-item').length,
      ).toBe(0);
    });
  });

  describe('agenda management', () => {
    function flushSearch(): void {
      component.searchQuery.set('bio');
      component.searchAtoms();
      httpMock.expectOne(`${ATOM_SEARCH_URL}?q=bio`).flush({ data: STUB_ATOMS });
      fixture.detectChanges();
    }

    it('adds an atom to the agenda and renders the item', () => {
      flushSearch();
      component.addAtomToAgenda(STUB_ATOMS[0]);
      fixture.detectChanges();

      expect(component.agenda().length).toBe(1);
      const item = element.querySelector(
        '[data-testid="agenda-item-atom-001"]',
      );
      expect(item).not.toBeNull();
      expect(item?.textContent).toContain('Intro to Photosynthesis');
    });

    it('assigns order 1 and a default 15-minute duration to the first added atom', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      fixture.detectChanges();
      const entry = component.agenda()[0];
      expect(entry.order).toBe(1);
      expect(entry.duration_minutes).toBe(15);
      expect(entry.delivery_notes).toBe('');
    });

    it('does not add the same atom twice', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.addAtomToAgenda(STUB_ATOMS[0]);
      expect(component.agenda().length).toBe(1);
    });

    it('isAtomInAgenda reflects membership', () => {
      expect(component.isAtomInAgenda('atom-001')).toBe(false);
      component.addAtomToAgenda(STUB_ATOMS[0]);
      expect(component.isAtomInAgenda('atom-001')).toBe(true);
    });

    it('disables the add button + shows the Added label for atoms already in the agenda', () => {
      flushSearch();
      component.addAtomToAgenda(STUB_ATOMS[0]);
      fixture.detectChanges();

      const addBtn = element.querySelector(
        '[data-testid="add-atom-atom-001"]',
      ) as HTMLButtonElement;
      expect(addBtn.disabled).toBe(true);
      expect(addBtn.textContent).toContain('training.session-creation.added');
    });

    it('removes an atom and re-sequences the remaining orders', () => {
      component.addAtomToAgenda(makeAtom('a'));
      component.addAtomToAgenda(makeAtom('b'));
      component.addAtomToAgenda(makeAtom('c'));
      component.removeFromAgenda('b');

      const orders = component.agenda().map((x) => `${x.atom_id}:${x.order}`);
      expect(orders).toEqual(['a:1', 'c:2']);
    });

    it('renders the total-duration line and sums durations', () => {
      component.addAtomToAgenda(makeAtom('a')); // 15
      component.addAtomToAgenda(makeAtom('b')); // 15
      fixture.detectChanges();

      expect(component.totalDuration()).toBe(30);
      const total = element.querySelector('[data-testid="total-duration"]');
      expect(total?.textContent).toContain('30');
    });

    it('updateDuration changes only the targeted atom', () => {
      component.addAtomToAgenda(makeAtom('a'));
      component.addAtomToAgenda(makeAtom('b'));
      component.updateDuration('a', 45);

      expect(component.agenda().find((x) => x.atom_id === 'a')?.duration_minutes).toBe(
        45,
      );
      expect(component.agenda().find((x) => x.atom_id === 'b')?.duration_minutes).toBe(
        15,
      );
      expect(component.totalDuration()).toBe(60);
    });

    it('updateDeliveryNotes changes only the targeted atom', () => {
      component.addAtomToAgenda(makeAtom('a'));
      component.addAtomToAgenda(makeAtom('b'));
      component.updateDeliveryNotes('a', 'bring slides');

      expect(
        component.agenda().find((x) => x.atom_id === 'a')?.delivery_notes,
      ).toBe('bring slides');
      expect(
        component.agenda().find((x) => x.atom_id === 'b')?.delivery_notes,
      ).toBe('');
    });

    it('onAgendaDrop reorders the agenda and re-sequences orders', () => {
      component.addAtomToAgenda(makeAtom('a'));
      component.addAtomToAgenda(makeAtom('b'));
      component.addAtomToAgenda(makeAtom('c'));

      // Stub a CdkDragDrop-shaped event: move first item to the end.
      component.onAgendaDrop({
        previousIndex: 0,
        currentIndex: 2,
      } as never);

      const orders = component.agenda().map((x) => `${x.atom_id}:${x.order}`);
      expect(orders).toEqual(['b:1', 'c:2', 'a:3']);
    });
  });

  describe('canSubmit gating', () => {
    it('is false with title + date but no agenda', () => {
      component.title.set('My Session');
      component.scheduledAt.set('2026-07-01T10:00');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false with agenda but blank title', () => {
      component.scheduledAt.set('2026-07-01T10:00');
      component.addAtomToAgenda(makeAtom('a'));
      expect(component.canSubmit()).toBe(false);
    });

    it('is false when title is whitespace only', () => {
      component.title.set('   ');
      component.scheduledAt.set('2026-07-01T10:00');
      component.addAtomToAgenda(makeAtom('a'));
      expect(component.canSubmit()).toBe(false);
    });

    it('is true once title + date + at least one agenda item are present', () => {
      component.title.set('My Session');
      component.scheduledAt.set('2026-07-01T10:00');
      component.addAtomToAgenda(makeAtom('a'));
      fixture.detectChanges();

      expect(component.canSubmit()).toBe(true);
      const submit = element.querySelector(
        '[data-testid="session-submit-btn"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });
  });

  describe('submitSession', () => {
    function fillValidForm(): void {
      component.title.set('  Photosynthesis 101  ');
      component.description.set('  intro deck  ');
      component.scheduledAt.set('2026-07-01T10:00');
      component.durationMinutes.set(90);
      component.maxParticipants.set(25);
      component.addAtomToAgenda(makeAtom('a'));
      component.updateDuration('a', 30);
      component.updateDeliveryNotes('a', 'notes');
      fixture.detectChanges();
    }

    it('does nothing (no HTTP) when canSubmit is false', () => {
      component.submitSession();
      expect(component.isSubmitting()).toBe(false);
      // afterEach verify() asserts no POST fired.
    });

    it('POSTs a trimmed payload with the mapped agenda on submit', () => {
      fillValidForm();
      component.submitSession();

      const post = httpMock.expectOne(CREATE_SESSION_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({
        title: 'Photosynthesis 101',
        description: 'intro deck',
        scheduled_at: '2026-07-01T10:00',
        duration_minutes: 90,
        agenda: [
          {
            atom_id: 'a',
            order: 1,
            delivery_notes: 'notes',
            duration_minutes: 30,
          },
        ],
        max_participants: 25,
        venue_id: undefined,
      });

      expect(component.isSubmitting()).toBe(true);

      post.flush({
        id: 'sess-1',
        tenant_id: 't-1',
        title: 'Photosynthesis 101',
        description: 'intro deck',
        status: 'draft',
        scheduled_at: '2026-07-01T10:00',
        duration_minutes: 90,
        agenda: [],
        trainer_gcid: 'g-1',
        max_participants: 25,
        venue_id: null,
        created_at: '2026-06-04T00:00:00Z',
        updated_at: '2026-06-04T00:00:00Z',
      });
    });

    it('sends venue_id when a venue is set', () => {
      fillValidForm();
      component.venueId.set('venue-42');
      component.submitSession();

      const post = httpMock.expectOne(CREATE_SESSION_URL);
      expect(post.request.body.venue_id).toBe('venue-42');
      post.flush({
        id: 'sess-1',
        tenant_id: 't-1',
        title: 'X',
        description: '',
        status: 'draft',
        scheduled_at: '2026-07-01T10:00',
        duration_minutes: 90,
        agenda: [],
        trainer_gcid: 'g-1',
        max_participants: 25,
        venue_id: 'venue-42',
        created_at: '2026-06-04T00:00:00Z',
        updated_at: '2026-06-04T00:00:00Z',
      });
    });

    it('navigates to /admin/training and clears submitting on success', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi
        .spyOn(router, 'navigate')
        .mockResolvedValue(true);

      fillValidForm();
      component.submitSession();

      httpMock.expectOne(CREATE_SESSION_URL).flush({
        id: 'sess-1',
        tenant_id: 't-1',
        title: 'X',
        description: '',
        status: 'draft',
        scheduled_at: '2026-07-01T10:00',
        duration_minutes: 90,
        agenda: [],
        trainer_gcid: 'g-1',
        max_participants: 25,
        venue_id: null,
        created_at: '2026-06-04T00:00:00Z',
        updated_at: '2026-06-04T00:00:00Z',
      });
      fixture.detectChanges();

      expect(navSpy).toHaveBeenCalledWith(['/admin/training']);
      expect(component.isSubmitting()).toBe(false);
      expect(component.submitError()).toBe('');
    });

    it('renders the create label while idle and the creating label while in flight', () => {
      fillValidForm();
      let submit = element.querySelector(
        '[data-testid="session-submit-btn"]',
      ) as HTMLButtonElement;
      expect(submit.textContent).toContain('training.session-creation.create');

      component.submitSession();
      fixture.detectChanges();
      submit = element.querySelector(
        '[data-testid="session-submit-btn"]',
      ) as HTMLButtonElement;
      expect(submit.textContent).toContain(
        'training.session-creation.creating',
      );

      httpMock.expectOne(CREATE_SESSION_URL).flush({
        id: 'sess-1',
        tenant_id: 't-1',
        title: 'X',
        description: '',
        status: 'draft',
        scheduled_at: '2026-07-01T10:00',
        duration_minutes: 90,
        agenda: [],
        trainer_gcid: 'g-1',
        max_participants: 25,
        venue_id: null,
        created_at: '2026-06-04T00:00:00Z',
        updated_at: '2026-06-04T00:00:00Z',
      });
      fixture.detectChanges();
    });

    it('stays on the page and clears submitting when the POST fails (4xx)', () => {
      // PROD-BUG CHARACTERIZATION: TrainingAdminService.createSession() pipes
      // catchError(() => of(null)), so a failed POST NEVER propagates an error
      // to the component subscriber. The component's `error:` callback (which
      // would set submitError) is therefore unreachable dead code: the `next:`
      // branch always runs instead with session === null. We characterize the
      // ACTUAL behavior — submitError stays empty, no navigation, submitting
      // cleared, and the error banner does NOT appear despite the failure.
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fillValidForm();
      component.submitSession();

      httpMock
        .expectOne(CREATE_SESSION_URL)
        .flush(
          { error: 'venue unavailable' },
          { status: 400, statusText: 'Bad Request' },
        );
      fixture.detectChanges();

      expect(component.isSubmitting()).toBe(false);
      expect(component.submitError()).toBe('');
      expect(navSpy).not.toHaveBeenCalled();

      // Error banner is gated on submitError() being truthy → not rendered.
      const errEl = element.querySelector('[data-testid="submit-error"]');
      expect(errEl).toBeNull();
    });

    it('does NOT navigate when the create resolves with a null session (5xx)', () => {
      // Same swallow-to-null path: a 500 also resolves to of(null) inside the
      // service, so the component receives null in `next:`, never navigates.
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fillValidForm();
      component.submitSession();

      httpMock
        .expectOne(CREATE_SESSION_URL)
        .flush(
          { error: 'boom' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();

      expect(navSpy).not.toHaveBeenCalled();
      expect(component.isSubmitting()).toBe(false);
    });
  });
});
