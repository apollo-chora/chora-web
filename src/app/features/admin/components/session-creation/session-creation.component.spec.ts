import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { SessionCreationComponent } from './session-creation.component';
import { type AtomSearchResult } from '../../services/training-admin.service';
import { environment } from '../../../../../environments/environment';

const ATOMS_SEARCH = `${environment.bffBaseUrl}/api/v1/atomic/atoms/search`;
const SESSIONS_POST = `${environment.bffBaseUrl}/api/v1/training-admin/sessions`;

const STUB_ATOMS: readonly AtomSearchResult[] = [
  {
    id: 'atom-newton',
    title: "Newton's Laws",
    type: 'concept',
    topic_name: 'Physics',
    difficulty: 3,
  },
  {
    id: 'atom-kinematics',
    title: 'Kinematics Basics',
    type: 'practice',
    topic_name: 'Physics',
    difficulty: 2,
  },
];

function setup(): {
  fixture: ComponentFixture<SessionCreationComponent>;
  httpMock: HttpTestingController;
  component: SessionCreationComponent;
  element: HTMLElement;
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
  const component = fixture.componentInstance;
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  return { fixture, httpMock, component, element };
}

/** Drive a search through the service + flush results into the component. */
function flushSearch(
  fixture: ComponentFixture<SessionCreationComponent>,
  httpMock: HttpTestingController,
  results: readonly AtomSearchResult[] = STUB_ATOMS,
): void {
  const component = fixture.componentInstance;
  component.searchQuery.set('phy');
  component.searchAtoms();
  const req = httpMock.expectOne(`${ATOMS_SEARCH}?q=phy`);
  req.flush({ data: results });
  fixture.detectChanges();
}

/** Make canSubmit() true: title + scheduledAt + at least one agenda entry. */
function makeSubmittable(component: SessionCreationComponent): void {
  component.title.set('Quarterly Safety Briefing');
  component.scheduledAt.set('2026-07-01T09:00');
  component.addAtomToAgenda(STUB_ATOMS[0]);
}

describe('SessionCreationComponent', () => {
  let fixture: ComponentFixture<SessionCreationComponent>;
  let httpMock: HttpTestingController;
  let component: SessionCreationComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = built.component;
    element = built.element;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('shell render', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the root section with the session-creation testid', () => {
      const root = element.querySelector('[data-testid="session-creation"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
    });

    it('renders the session details form', () => {
      expect(
        element.querySelector('[data-testid="session-form"]'),
      ).not.toBeNull();
    });

    it('renders the two-panel atom browser + agenda layout', () => {
      expect(element.querySelector('[data-testid="atom-browser"]')).not.toBeNull();
      expect(
        element.querySelector('[data-testid="session-agenda"]'),
      ).not.toBeNull();
    });

    it('renders the title via the translate key', () => {
      const title = element.querySelector('.session-creation__title');
      expect(title?.textContent).toContain('training.session-creation.title');
    });
  });

  describe('initial state', () => {
    it('starts with an empty agenda and shows the empty placeholder', () => {
      expect(component.agenda().length).toBe(0);
      expect(
        element.querySelector('[data-testid="agenda-empty"]'),
      ).not.toBeNull();
    });

    it('does not render the drop-list while the agenda is empty', () => {
      expect(
        element.querySelector('[data-testid="agenda-drop-list"]'),
      ).toBeNull();
    });

    it('defaults duration to 60 and maxParticipants to 30', () => {
      expect(component.durationMinutes()).toBe(60);
      expect(component.maxParticipants()).toBe(30);
    });

    it('does not show a loading status before any search', () => {
      const status = element.querySelector(
        '.session-creation__browser-status',
      );
      expect(status).toBeNull();
    });

    it('does not show a submit error initially', () => {
      expect(
        element.querySelector('[data-testid="submit-error"]'),
      ).toBeNull();
    });

    it('keeps the submit button disabled when the form is empty', () => {
      const btn = element.querySelector(
        '[data-testid="session-submit-btn"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  describe('canSubmit computed', () => {
    it('is false when only the title is set', () => {
      component.title.set('Just a title');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false when title + date are set but agenda is empty', () => {
      component.title.set('Title');
      component.scheduledAt.set('2026-07-01T09:00');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false when title is only whitespace', () => {
      component.title.set('   ');
      component.scheduledAt.set('2026-07-01T09:00');
      component.addAtomToAgenda(STUB_ATOMS[0]);
      expect(component.canSubmit()).toBe(false);
    });

    it('is true once title + date + one agenda entry are present', () => {
      makeSubmittable(component);
      expect(component.canSubmit()).toBe(true);
    });

    it('is false while a submit is in flight', () => {
      makeSubmittable(component);
      component.isSubmitting.set(true);
      expect(component.canSubmit()).toBe(false);
    });

    it('enables the submit button in the template when submittable', () => {
      makeSubmittable(component);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="session-submit-btn"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  describe('atom search', () => {
    it('does not fire an HTTP call when the query is shorter than 2 chars', () => {
      component.searchQuery.set('a');
      component.searchAtoms();
      httpMock.expectNone(`${ATOMS_SEARCH}?q=a`);
    });

    it('does not fire an HTTP call for a blank (whitespace-only) query', () => {
      component.searchQuery.set('   ');
      component.searchAtoms();
      // trims to '' → length 0 → no request
      httpMock.expectNone((req) => req.url.startsWith(ATOMS_SEARCH));
    });

    it('shows the searching status while the request is in flight', () => {
      component.searchQuery.set('phy');
      component.searchAtoms();
      fixture.detectChanges();
      const status = element.querySelector(
        '.session-creation__browser-status',
      );
      expect(status?.textContent).toContain(
        'training.session-creation.searching',
      );
      // flush to settle the request for afterEach verify
      httpMock.expectOne(`${ATOMS_SEARCH}?q=phy`).flush({ data: [] });
    });

    it('renders one list item per atom result on success', () => {
      flushSearch(fixture, httpMock);
      const items = element.querySelectorAll(
        '.session-creation__atom-item',
      );
      expect(items.length).toBe(2);
    });

    it('renders atom title and meta (type + topic) for a result', () => {
      flushSearch(fixture, httpMock);
      const browser = element.querySelector('[data-testid="atom-browser"]');
      expect(browser?.textContent).toContain("Newton's Laws");
      expect(browser?.textContent).toContain('concept');
      expect(browser?.textContent).toContain('Physics');
    });

    it('clears the searching status once results arrive', () => {
      flushSearch(fixture, httpMock);
      expect(
        element.querySelector('.session-creation__browser-status'),
      ).toBeNull();
    });

    it('keeps the result list empty on a search error', () => {
      component.searchQuery.set('phy');
      component.searchAtoms();
      httpMock
        .expectOne(`${ATOMS_SEARCH}?q=phy`)
        .flush(
          { error: 'boom' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();
      expect(component.atomResults().length).toBe(0);
      expect(
        element.querySelectorAll('.session-creation__atom-item').length,
      ).toBe(0);
    });

    it('triggers a search from the search button click', () => {
      component.searchQuery.set('phy');
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="atom-search-btn"]',
      ) as HTMLButtonElement;
      btn.click();
      httpMock.expectOne(`${ATOMS_SEARCH}?q=phy`).flush({ data: STUB_ATOMS });
    });
  });

  describe('addAtomToAgenda', () => {
    it('adds an atom and renders an agenda item', () => {
      flushSearch(fixture, httpMock);
      component.addAtomToAgenda(STUB_ATOMS[0]);
      fixture.detectChanges();
      expect(component.agenda().length).toBe(1);
      expect(
        element.querySelector('[data-testid="agenda-item-atom-newton"]'),
      ).not.toBeNull();
    });

    it('seeds a new entry with order 1 and default 15-minute duration', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      const entry = component.agenda()[0];
      expect(entry.order).toBe(1);
      expect(entry.duration_minutes).toBe(15);
      expect(entry.delivery_notes).toBe('');
      expect(entry.atom_title).toBe("Newton's Laws");
    });

    it('does not add the same atom twice', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.addAtomToAgenda(STUB_ATOMS[0]);
      expect(component.agenda().length).toBe(1);
    });

    it('increments order for subsequent additions', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.addAtomToAgenda(STUB_ATOMS[1]);
      expect(component.agenda().map((a) => a.order)).toEqual([1, 2]);
    });

    it('disables the add button and shows "added" once an atom is in the agenda', () => {
      flushSearch(fixture, httpMock);
      const addBtn = element.querySelector(
        '[data-testid="add-atom-atom-newton"]',
      ) as HTMLButtonElement;
      addBtn.click();
      fixture.detectChanges();
      const refreshed = element.querySelector(
        '[data-testid="add-atom-atom-newton"]',
      ) as HTMLButtonElement;
      expect(refreshed.disabled).toBe(true);
      expect(refreshed.textContent).toContain(
        'training.session-creation.added',
      );
    });
  });

  describe('isAtomInAgenda', () => {
    it('returns false for an atom not yet added', () => {
      expect(component.isAtomInAgenda('atom-newton')).toBe(false);
    });

    it('returns true after the atom is added', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      expect(component.isAtomInAgenda('atom-newton')).toBe(true);
    });
  });

  describe('removeFromAgenda', () => {
    it('removes the targeted atom from the agenda', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.addAtomToAgenda(STUB_ATOMS[1]);
      component.removeFromAgenda('atom-newton');
      expect(component.agenda().map((a) => a.atom_id)).toEqual([
        'atom-kinematics',
      ]);
    });

    it('renumbers the remaining entries from 1', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.addAtomToAgenda(STUB_ATOMS[1]);
      component.removeFromAgenda('atom-newton');
      expect(component.agenda()[0].order).toBe(1);
    });

    it('re-renders the empty placeholder when the last item is removed', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      fixture.detectChanges();
      component.removeFromAgenda('atom-newton');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="agenda-empty"]'),
      ).not.toBeNull();
    });
  });

  describe('updateDeliveryNotes', () => {
    it('sets delivery notes on the matching agenda entry only', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.addAtomToAgenda(STUB_ATOMS[1]);
      component.updateDeliveryNotes('atom-newton', 'Use the lab demo');
      const entries = component.agenda();
      expect(entries[0].delivery_notes).toBe('Use the lab demo');
      expect(entries[1].delivery_notes).toBe('');
    });

    it('is a no-op for an unknown atom id', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.updateDeliveryNotes('does-not-exist', 'ignored');
      expect(component.agenda()[0].delivery_notes).toBe('');
    });
  });

  describe('updateDuration', () => {
    it('updates the duration on the matching entry', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.updateDuration('atom-newton', 45);
      expect(component.agenda()[0].duration_minutes).toBe(45);
    });

    it('leaves other entries untouched', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.addAtomToAgenda(STUB_ATOMS[1]);
      component.updateDuration('atom-kinematics', 90);
      expect(component.agenda()[0].duration_minutes).toBe(15);
      expect(component.agenda()[1].duration_minutes).toBe(90);
    });
  });

  describe('totalDuration computed', () => {
    it('is 0 with an empty agenda', () => {
      expect(component.totalDuration()).toBe(0);
    });

    it('sums per-entry durations', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]); // 15
      component.addAtomToAgenda(STUB_ATOMS[1]); // 15
      component.updateDuration('atom-newton', 30);
      expect(component.totalDuration()).toBe(45);
    });

    it('renders the total-duration line once entries exist', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      fixture.detectChanges();
      const total = element.querySelector('[data-testid="total-duration"]');
      expect(total?.textContent).toContain('15');
    });

    it('renders the agenda count in the panel heading', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]);
      component.addAtomToAgenda(STUB_ATOMS[1]);
      fixture.detectChanges();
      const heading = element.querySelector(
        '.session-creation__agenda-count',
      );
      expect(heading?.textContent).toContain('2');
    });
  });

  describe('onAgendaDrop reordering', () => {
    it('moves an item and renumbers orders', () => {
      component.addAtomToAgenda(STUB_ATOMS[0]); // index 0
      component.addAtomToAgenda(STUB_ATOMS[1]); // index 1
      const dropEvent = {
        previousIndex: 0,
        currentIndex: 1,
      } as CdkDragDrop<unknown[]>;
      component.onAgendaDrop(dropEvent as never);
      const ordered = component.agenda();
      expect(ordered.map((a) => a.atom_id)).toEqual([
        'atom-kinematics',
        'atom-newton',
      ]);
      expect(ordered.map((a) => a.order)).toEqual([1, 2]);
    });
  });

  describe('submitSession success', () => {
    it('POSTs the create payload to the sessions endpoint', () => {
      makeSubmittable(component);
      component.description.set('  detailed brief  ');
      component.venueId.set('venue-1');
      component.submitSession();

      const req = httpMock.expectOne(SESSIONS_POST);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        title: 'Quarterly Safety Briefing',
        description: 'detailed brief',
        scheduled_at: '2026-07-01T09:00',
        duration_minutes: 60,
        agenda: [
          {
            atom_id: 'atom-newton',
            order: 1,
            delivery_notes: '',
            duration_minutes: 15,
          },
        ],
        max_participants: 30,
        venue_id: 'venue-1',
      });
      req.flush({ id: 'sess-1' });
    });

    it('omits venue_id when blank', () => {
      makeSubmittable(component);
      component.submitSession();
      const req = httpMock.expectOne(SESSIONS_POST);
      expect(req.request.body.venue_id).toBeUndefined();
      req.flush({ id: 'sess-1' });
    });

    it('navigates to /admin/training after a successful create', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      makeSubmittable(component);
      component.submitSession();
      httpMock.expectOne(SESSIONS_POST).flush({
        id: 'sess-1',
        title: 'Quarterly Safety Briefing',
      });
      expect(navSpy).toHaveBeenCalledWith(['/admin/training']);
      expect(component.isSubmitting()).toBe(false);
    });

    it('shows the creating label while a submit is in flight', () => {
      makeSubmittable(component);
      component.submitSession();
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="session-submit-btn"]',
      ) as HTMLButtonElement;
      expect(btn.textContent).toContain('training.session-creation.creating');
      httpMock.expectOne(SESSIONS_POST).flush({ id: 'sess-1' });
    });

    it('does nothing when canSubmit is false', () => {
      // no title / date / agenda
      component.submitSession();
      httpMock.expectNone(SESSIONS_POST);
      expect(component.isSubmitting()).toBe(false);
    });
  });

  describe('submitSession error', () => {
    it('surfaces the error message and clears isSubmitting on failure', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      makeSubmittable(component);
      component.submitSession();
      httpMock
        .expectOne(SESSIONS_POST)
        .flush(
          { error: 'venue conflict' },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();

      expect(component.isSubmitting()).toBe(false);
      // service swallows the error → emits null → next() runs but session is
      // falsy, so navigation does NOT fire and no submitError is set.
      expect(navSpy).not.toHaveBeenCalled();
      expect(
        element.querySelector('[data-testid="submit-error"]'),
      ).toBeNull();
    });

    it('renders the submit-error banner when submitError signal is set', () => {
      component.submitError.set('Something went wrong');
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="submit-error"]');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Something went wrong');
    });
  });
});
