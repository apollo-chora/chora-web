import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Observable } from 'rxjs';
import { CohortProgressComponent } from './cohort-progress.component';
import { OnboardingAdminService } from '../../services/onboarding-admin.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';
import type {
  CohortLearner,
  CohortProgress,
} from '../../models/onboarding.model';

const COHORTS_URL = `${environment.bffBaseUrl}/api/v1/onboarding/cohorts`;

function makeLearner(over: Partial<CohortLearner> = {}): CohortLearner {
  return {
    gcid: 'gcid-1',
    display_name: 'Ada Lovelace',
    email: 'ada@example.com',
    completion_percentage: 80,
    items_remaining: 1,
    total_items: 5,
    last_activity_at: '2026-06-01T00:00:00Z',
    status: 'on_track',
    ...over,
  };
}

const STUB_PROGRESS: CohortProgress = {
  template_id: 'tmpl-onboarding-1',
  template_name: 'New Hire Onboarding',
  total_learners: 3,
  average_completion: 60,
  learners: [
    makeLearner({
      gcid: 'gcid-1',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
      status: 'on_track',
      completion_percentage: 90,
    }),
    makeLearner({
      gcid: 'gcid-2',
      display_name: 'Grace Hopper',
      email: 'grace@example.com',
      status: 'at_risk',
      completion_percentage: 50,
      last_activity_at: null,
    }),
    makeLearner({
      gcid: 'gcid-3',
      display_name: 'Alan Turing',
      email: 'alan@example.com',
      status: 'overdue',
      completion_percentage: 10,
    }),
  ],
};

describe('CohortProgressComponent', () => {
  let component: CohortProgressComponent;
  let fixture: ComponentFixture<CohortProgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CohortProgressComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CohortProgressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no selections', () => {
    expect(component.selectedCount()).toBe(0);
  });

  it('should toggle learner selection', () => {
    component.toggleSelect('gcid-1');
    expect(component.isSelected('gcid-1')).toBe(true);

    component.toggleSelect('gcid-1');
    expect(component.isSelected('gcid-1')).toBe(false);
  });

  it('should return correct status class', () => {
    expect(component.getStatusClass('on_track')).toBe('cohort-progress__status--on-track');
    expect(component.getStatusClass('at_risk')).toBe('cohort-progress__status--at-risk');
    expect(component.getStatusClass('overdue')).toBe('cohort-progress__status--overdue');
  });

  it('should filter learners by search query', () => {
    expect(component.filteredLearners().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Augmented coverage — data loading, render states, selection, bulk actions.
// ---------------------------------------------------------------------------
describe('CohortProgressComponent — data + interactions', () => {
  let fixture: ComponentFixture<CohortProgressComponent>;
  let component: CohortProgressComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let service: OnboardingAdminService;

  function build(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CohortProgressComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(CohortProgressComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OnboardingAdminService);
    element = fixture.nativeElement as HTMLElement;
  }

  // Flush the ngOnInit-triggered initial load with the given payload.
  function flushInitial(payload: CohortProgress = STUB_PROGRESS): void {
    fixture.detectChanges(); // ngOnInit → loadCohortProgress() → GET
    httpMock.expectOne(COHORTS_URL).flush(payload);
    fixture.detectChanges();
  }

  beforeEach(() => build());

  afterEach(() => httpMock.verify());

  describe('initial load (success)', () => {
    beforeEach(() => flushInitial());

    it('issues the cohorts GET on init (no filter)', () => {
      // request already flushed in flushInitial; success state means it fired.
      expect(component.cohortState().status).toBe('success');
    });

    it('exposes the loaded cohort progress + learners', () => {
      expect(component.cohortProgress()?.template_id).toBe('tmpl-onboarding-1');
      expect(component.learners().length).toBe(3);
    });

    it('renders one row per learner', () => {
      const rows = element.querySelectorAll('[data-testid^="learner-row-"]');
      expect(rows.length).toBe(3);
    });

    it('renders the table container + real learner data', () => {
      const container = element.querySelector(
        '[data-testid="cohort-table-container"]',
      );
      expect(container).not.toBeNull();
      expect(container?.textContent).toContain('Ada Lovelace');
      expect(container?.textContent).toContain('grace@example.com');
    });

    it('shows a fallback for a learner with no last activity', () => {
      const grace = element.querySelector('[data-testid="learner-row-gcid-2"]');
      expect(grace?.textContent).toContain('admin.onboarding.no_activity');
    });
  });

  describe('search filtering', () => {
    beforeEach(() => flushInitial());

    it('filters by display name (case-insensitive)', () => {
      component.searchQuery.set('grace');
      expect(component.filteredLearners().length).toBe(1);
      expect(component.filteredLearners()[0].gcid).toBe('gcid-2');
    });

    it('filters by email substring', () => {
      component.searchQuery.set('alan@');
      expect(component.filteredLearners().length).toBe(1);
      expect(component.filteredLearners()[0].display_name).toBe('Alan Turing');
    });

    it('returns all learners when the query is blank/whitespace', () => {
      component.searchQuery.set('   ');
      expect(component.filteredLearners().length).toBe(3);
    });

    it('renders the empty state when the query matches nobody', () => {
      component.searchQuery.set('zzz-nobody');
      fixture.detectChanges();
      expect(component.filteredLearners().length).toBe(0);
      expect(
        element.querySelector('[data-testid="no-learners"]'),
      ).not.toBeNull();
    });
  });

  describe('selection', () => {
    beforeEach(() => flushInitial());

    it('toggleSelectAll selects every filtered learner then clears', () => {
      component.toggleSelectAll();
      expect(component.selectedCount()).toBe(3);
      expect(component.allSelected()).toBe(true);

      component.toggleSelectAll();
      expect(component.selectedCount()).toBe(0);
      expect(component.allSelected()).toBe(false);
    });

    it('allSelected reflects only the filtered subset', () => {
      component.searchQuery.set('grace');
      component.toggleSelect('gcid-2');
      // only the visible (filtered) learner is selected → allSelected true
      expect(component.allSelected()).toBe(true);
      // widen the view: now not everyone is selected
      component.searchQuery.set('');
      expect(component.allSelected()).toBe(false);
    });

    it('allSelected is false on an empty filtered set', () => {
      component.searchQuery.set('no-such-learner');
      expect(component.allSelected()).toBe(false);
    });

    it('select-all checkbox click selects all rows', () => {
      const checkbox = element.querySelector(
        '[data-testid="select-all-checkbox"]',
      ) as HTMLInputElement;
      checkbox.click();
      fixture.detectChanges();
      expect(component.selectedCount()).toBe(3);
    });
  });

  describe('cohort filter change', () => {
    beforeEach(() => flushInitial());

    it('refetches with the template_id param and clears selection', () => {
      component.toggleSelect('gcid-1');
      expect(component.selectedCount()).toBe(1);

      component.onCohortFilterChange('tmpl-xyz');
      expect(component.cohortFilter()).toBe('tmpl-xyz');
      expect(component.selectedCount()).toBe(0);

      const req = httpMock.expectOne(
        `${COHORTS_URL}?template_id=tmpl-xyz`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(STUB_PROGRESS);
    });
  });

  describe('send reminder (bulk action)', () => {
    beforeEach(() => flushInitial());

    it('is a no-op when nothing is selected (no HTTP, no spinner)', () => {
      component.sendReminder();
      expect(component.sendingReminder()).toBe(false);
      httpMock.expectNone(`${COHORTS_URL}/reminders`);
    });

    it('POSTs gcids, toasts success, and clears selection on success', () => {
      const toast = TestBed.inject(ToastService);
      const showSpy = vi.spyOn(toast, 'show');

      component.toggleSelect('gcid-1');
      component.toggleSelect('gcid-3');
      component.sendReminder();
      expect(component.sendingReminder()).toBe(true);

      const req = httpMock.expectOne(`${COHORTS_URL}/reminders`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ gcids: ['gcid-1', 'gcid-3'] });
      req.flush({ sent: 2 });

      expect(component.sendingReminder()).toBe(false);
      expect(component.selectedCount()).toBe(0);
      expect(showSpy).toHaveBeenCalledWith(
        'admin.onboarding.reminder_sent',
        'success',
      );
    });

    it('toasts an error when the service yields null (4xx swallowed to null)', () => {
      const toast = TestBed.inject(ToastService);
      const showSpy = vi.spyOn(toast, 'show');

      component.toggleSelect('gcid-1');
      component.sendReminder();

      // service .catchError(()=>of(null)) turns the 500 into a null `next`.
      httpMock
        .expectOne(`${COHORTS_URL}/reminders`)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(component.sendingReminder()).toBe(false);
      // selection NOT cleared on the null branch
      expect(component.selectedCount()).toBe(1);
      expect(showSpy).toHaveBeenCalledWith(
        'admin.onboarding.reminder_error',
        'error',
      );
    });

    it('toasts an error and resets the spinner on a thrown error', () => {
      const toast = TestBed.inject(ToastService);
      const showSpy = vi.spyOn(toast, 'show');

      // Force the service to emit through the error callback path.
      vi.spyOn(service, 'sendReminder').mockReturnValue(
        new Observable((sub) => sub.error(new Error('network'))),
      );

      component.toggleSelect('gcid-1');
      component.sendReminder();

      expect(component.sendingReminder()).toBe(false);
      expect(showSpy).toHaveBeenCalledWith(
        'admin.onboarding.reminder_error',
        'error',
      );
    });
  });

  describe('export CSV (bulk action)', () => {
    beforeEach(() => flushInitial());

    it('is a no-op when there is no loaded template_id', () => {
      // Re-build with no loaded progress to clear template_id.
      TestBed.resetTestingModule();
      build();
      fixture.detectChanges();
      httpMock.expectOne(COHORTS_URL).flush(null);
      fixture.detectChanges();

      component.exportCsv();
      httpMock.expectNone(`${COHORTS_URL}/export?template_id=tmpl-onboarding-1`);
    });

    it('GETs the export blob, triggers a download, and toasts success', () => {
      const toast = TestBed.inject(ToastService);
      const showSpy = vi.spyOn(toast, 'show');

      const createUrlSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:fake-url');
      const revokeUrlSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => undefined);
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);

      component.exportCsv();

      const req = httpMock.expectOne(
        `${COHORTS_URL}/export?template_id=tmpl-onboarding-1`,
      );
      expect(req.request.method).toBe('GET');
      // NOTE: bff.get<Blob> does NOT set responseType:'blob', so HttpClient
      // delivers a JSON body. The component passes whatever it receives to
      // URL.createObjectURL (mocked here). We flush a truthy JSON body to
      // exercise the success branch as it actually behaves at runtime.
      req.flush({ csv: 'a,b,c' });

      expect(createUrlSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeUrlSpy).toHaveBeenCalled();
      expect(showSpy).toHaveBeenCalledWith(
        'admin.onboarding.export_success',
        'success',
      );

      createUrlSpy.mockRestore();
      revokeUrlSpy.mockRestore();
      clickSpy.mockRestore();
    });

    it('does NOT toast on a failed export — service swallows the error to null', () => {
      // CHARACTERIZATION: OnboardingAdminService.exportCohortCsv pipes
      // catchError(() => of(null)), so a 4xx/5xx never reaches the component's
      // `error` callback. The component's `next` runs with blob === null, the
      // `if (blob)` guard is false, and NO download + NO toast happen.
      // The 'admin.onboarding.export_error' toast in exportCsv() is therefore
      // unreachable via this path (see prodBugFlag in notes).
      const toast = TestBed.inject(ToastService);
      const showSpy = vi.spyOn(toast, 'show');
      const createUrlSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:fake');

      component.exportCsv();
      httpMock
        .expectOne(`${COHORTS_URL}/export?template_id=tmpl-onboarding-1`)
        .flush(
          { error: 'denied' },
          { status: 403, statusText: 'Forbidden' },
        );

      expect(showSpy).not.toHaveBeenCalled();
      expect(createUrlSpy).not.toHaveBeenCalled();
      createUrlSpy.mockRestore();
    });
  });

  describe('render states', () => {
    it('renders the loading skeleton while the request is in flight', () => {
      fixture.detectChanges(); // ngOnInit → GET (pending)
      expect(
        element.querySelector('[data-testid="cohort-loading"]'),
      ).not.toBeNull();
      // resolve the pending request so afterEach verify() passes
      httpMock.expectOne(COHORTS_URL).flush(STUB_PROGRESS);
    });

    it('renders the error block when the load fails', () => {
      fixture.detectChanges();
      httpMock
        .expectOne(COHORTS_URL)
        .flush({ error: 'down' }, { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();

      expect(component.cohortState().status).toBe('error');
      expect(
        element.querySelector('[data-testid="cohort-error"]'),
      ).not.toBeNull();
      // no table container in the error state
      expect(
        element.querySelector('[data-testid="cohort-table-container"]'),
      ).toBeNull();
    });
  });

  describe('helpers', () => {
    beforeEach(() => flushInitial());

    it('trackByGcid returns the learner gcid', () => {
      expect(component.trackByGcid(0, makeLearner({ gcid: 'gcid-9' }))).toBe(
        'gcid-9',
      );
    });

    it('ngOnDestroy tears down subscriptions without throwing', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
