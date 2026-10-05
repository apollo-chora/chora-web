import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { ChecklistViewComponent } from './checklist-view.component';
import { environment } from '../../../../../environments/environment';
import type {
  ChecklistItemProgress,
  LearnerChecklist,
} from '../../models/checklist.model';

const CHECKLIST_URL = `${environment.bffBaseUrl}/api/v1/onboarding/checklist`;

function makeItem(
  overrides: Partial<ChecklistItemProgress> = {},
): ChecklistItemProgress {
  return {
    id: 'item-1',
    name: 'Complete your profile',
    description: 'Add your name and avatar.',
    type: 'profile',
    required: true,
    status: 'pending',
    due_date: null,
    completed_at: null,
    linked_resource_url: null,
    ...overrides,
  };
}

function makeChecklist(
  overrides: Partial<LearnerChecklist> = {},
): LearnerChecklist {
  return {
    id: 'cl-1',
    template_id: 'tmpl-1',
    template_name: 'New Learner Onboarding',
    items: [
      makeItem({ id: 'item-1', name: 'Complete your profile', status: 'completed', completed_at: '2026-06-01T10:00:00Z' }),
      makeItem({ id: 'item-2', name: 'Read the welcome guide', status: 'pending', linked_resource_url: 'https://docs.chora.site/welcome' }),
      makeItem({ id: 'item-3', name: 'Join a circle', status: 'overdue', due_date: '2026-05-30T00:00:00Z', linked_resource_url: '/cplus/circles' }),
      makeItem({ id: 'item-4', name: 'Take first lesson', status: 'in_progress' }),
    ],
    completed_count: 1,
    total_count: 4,
    ...overrides,
  };
}

describe('ChecklistViewComponent', () => {
  let component: ChecklistViewComponent;
  let fixture: ComponentFixture<ChecklistViewComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChecklistViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChecklistViewComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  // ---------------------------------------------------------------------------
  // Pre-existing tests (DO NOT WEAKEN)
  // ---------------------------------------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute progress percentage', () => {
    expect(component.progressPercentage()).toBe(0);
  });

  it('should toggle item expansion', () => {
    component.toggleItem('item-1');
    expect(component.isExpanded('item-1')).toBe(true);

    component.toggleItem('item-1');
    expect(component.isExpanded('item-1')).toBe(false);
  });

  it('should return correct status icons', () => {
    expect(component.getStatusIcon('pending')).toBe('radio_button_unchecked');
    expect(component.getStatusIcon('in_progress')).toBe('pending');
    expect(component.getStatusIcon('completed')).toBe('check_circle');
    expect(component.getStatusIcon('overdue')).toBe('warning');
  });

  it('should collapse current item when another is expanded', () => {
    component.toggleItem('item-1');
    expect(component.isExpanded('item-1')).toBe(true);

    component.toggleItem('item-2');
    expect(component.isExpanded('item-1')).toBe(false);
    expect(component.isExpanded('item-2')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Init HTTP fetch + loading state
  // ---------------------------------------------------------------------------

  it('should issue a GET to the checklist endpoint on init', () => {
    const req = httpMock.expectOne(CHECKLIST_URL);
    expect(req.request.method).toBe('GET');
    req.flush(makeChecklist());
  });

  it('should render the loading skeleton before the response resolves', () => {
    // Request outstanding (not yet flushed) -> service is in loading state.
    httpMock.expectOne(CHECKLIST_URL);
    expect(component.checklistState().status).toBe('loading');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="checklist-loading"]')).toBeTruthy();
    expect(el.querySelectorAll('.checklist-view__skeleton-row').length).toBe(4);
  });

  it('should always render the title shell', () => {
    httpMock.expectOne(CHECKLIST_URL);
    const el = fixture.nativeElement as HTMLElement;
    const title = el.querySelector('[data-testid="checklist-title"]');
    expect(title?.textContent).toContain('onboarding.checklist.title');
  });

  // ---------------------------------------------------------------------------
  // Success path + computed signals + template
  // ---------------------------------------------------------------------------

  describe('after a successful load', () => {
    beforeEach(() => {
      const req = httpMock.expectOne(CHECKLIST_URL);
      req.flush(makeChecklist());
      fixture.detectChanges();
    });

    it('should move into the success state and expose the checklist', () => {
      expect(component.checklistState().status).toBe('success');
      expect(component.checklist()?.template_name).toBe('New Learner Onboarding');
    });

    it('should compute completed/total counts and percentage', () => {
      expect(component.completedCount()).toBe(1);
      expect(component.totalCount()).toBe(4);
      expect(component.progressPercentage()).toBe(25);
    });

    it('should expose the items array', () => {
      expect(component.items().length).toBe(4);
      expect(component.items()[1].name).toBe('Read the welcome guide');
    });

    it('should render the progress section with the computed count text', () => {
      const el = fixture.nativeElement as HTMLElement;
      const count = el.querySelector('[data-testid="progress-count"]');
      expect(count?.textContent).toContain('1 / 4 (25%)');
    });

    it('should set the progressbar aria-valuenow to the percentage', () => {
      const el = fixture.nativeElement as HTMLElement;
      const bar = el.querySelector('[data-testid="progress-bar"]');
      expect(bar?.getAttribute('aria-valuenow')).toBe('25');
    });

    it('should render one row per item', () => {
      const el = fixture.nativeElement as HTMLElement;
      const list = el.querySelector('[data-testid="checklist-items"]');
      expect(list?.querySelectorAll('.checklist-view__item').length).toBe(4);
    });

    it('should render item names as raw data', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Complete your profile');
      expect(el.textContent).toContain('Join a circle');
    });

    it('should mark the completed item row with the completed modifier class', () => {
      const el = fixture.nativeElement as HTMLElement;
      const row = el.querySelector('[data-testid="checklist-item-item-1"]');
      expect(row?.classList.contains('checklist-view__item--completed')).toBe(true);
    });

    it('should mark the overdue item row with the overdue modifier class', () => {
      const el = fixture.nativeElement as HTMLElement;
      const row = el.querySelector('[data-testid="checklist-item-item-3"]');
      expect(row?.classList.contains('checklist-view__item--overdue')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Expansion + details template
  // ---------------------------------------------------------------------------

  describe('item expansion details', () => {
    beforeEach(() => {
      const req = httpMock.expectOne(CHECKLIST_URL);
      req.flush(makeChecklist());
      fixture.detectChanges();
    });

    it('should expand details when an item header is clicked', () => {
      const el = fixture.nativeElement as HTMLElement;
      const header = el.querySelector(
        '[data-testid="checklist-item-item-2"] .checklist-view__item-header',
      ) as HTMLElement;
      header.click();
      fixture.detectChanges();

      expect(component.isExpanded('item-2')).toBe(true);
      const details = el.querySelector('[data-testid="item-details"]');
      expect(details).toBeTruthy();
      expect(details?.textContent).toContain('Add your name and avatar.');
    });

    it('should show a go-to-resource button only when a linked resource exists', () => {
      // item-2 has a linked_resource_url.
      component.toggleItem('item-2');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="go-to-resource-btn"]')).toBeTruthy();
    });

    it('should show a mark-complete button for non-completed items', () => {
      component.toggleItem('item-2');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="mark-complete-btn"]')).toBeTruthy();
    });

    it('should NOT show a mark-complete button for completed items', () => {
      // item-1 is completed.
      component.toggleItem('item-1');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="mark-complete-btn"]')).toBeNull();
    });

    it('should render the completed-on date for a completed expanded item', () => {
      component.toggleItem('item-1');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const details = el.querySelector('[data-testid="item-details"]');
      expect(details?.textContent).toContain('onboarding.checklist.completed_on');
    });
  });

  // ---------------------------------------------------------------------------
  // Error path
  // ---------------------------------------------------------------------------

  it('should move into the error state and render the error alert on a 500', () => {
    const req = httpMock.expectOne(CHECKLIST_URL);
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.checklistState().status).toBe('error');
    const el = fixture.nativeElement as HTMLElement;
    const err = el.querySelector('[data-testid="checklist-error"]');
    expect(err).toBeTruthy();
    expect(err?.textContent).toContain('onboarding.checklist.load_error');
    // No progress section while in error.
    expect(el.querySelector('[data-testid="progress-section"]')).toBeNull();
  });

  it('should move into the error state on a 404', () => {
    const req = httpMock.expectOne(CHECKLIST_URL);
    req.flush('nope', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(component.checklistState().status).toBe('error');
    expect(component.checklist()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // markComplete POST
  // ---------------------------------------------------------------------------

  describe('markComplete', () => {
    beforeEach(() => {
      const req = httpMock.expectOne(CHECKLIST_URL);
      req.flush(makeChecklist());
      fixture.detectChanges();
    });

    it('should POST to the item-complete endpoint and refresh state', () => {
      const item = makeItem({ id: 'item-2', status: 'pending' });
      component.markComplete(item);

      const req = httpMock.expectOne(
        `${CHECKLIST_URL}/items/item-2/complete`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});

      const updated = makeChecklist({ completed_count: 2 });
      req.flush(updated);
      expect(component.completedCount()).toBe(2);
    });

    it('should url-encode item ids with special characters', () => {
      const item = makeItem({ id: 'item/with space' });
      component.markComplete(item);

      const req = httpMock.expectOne(
        `${CHECKLIST_URL}/items/${encodeURIComponent('item/with space')}/complete`,
      );
      expect(req.request.method).toBe('POST');
      req.flush(makeChecklist());
    });

    it('should set the error state when markComplete fails', () => {
      const item = makeItem({ id: 'item-2' });
      component.markComplete(item);

      const req = httpMock.expectOne(
        `${CHECKLIST_URL}/items/item-2/complete`,
      );
      req.flush('fail', { status: 500, statusText: 'Server Error' });

      expect(component.checklistState().status).toBe('error');
    });
  });

  // ---------------------------------------------------------------------------
  // navigateToResource
  // ---------------------------------------------------------------------------

  describe('navigateToResource', () => {
    beforeEach(() => {
      const req = httpMock.expectOne(CHECKLIST_URL);
      req.flush(makeChecklist());
      fixture.detectChanges();
    });

    it('should open external (http) urls in a new tab', () => {
      const openSpy = vi
        .spyOn(window, 'open')
        .mockImplementation(() => null as unknown as Window);

      component.navigateToResource('https://docs.chora.site/welcome');

      expect(openSpy).toHaveBeenCalledWith(
        'https://docs.chora.site/welcome',
        '_blank',
        'noopener,noreferrer',
      );
      openSpy.mockRestore();
    });

    it('should route internally for relative urls', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi
        .spyOn(router, 'navigateByUrl')
        .mockResolvedValue(true);

      component.navigateToResource('/cplus/circles');

      expect(navSpy).toHaveBeenCalledWith('/cplus/circles');
      navSpy.mockRestore();
    });

    it('should do nothing when the url is null', () => {
      const openSpy = vi
        .spyOn(window, 'open')
        .mockImplementation(() => null as unknown as Window);
      const router = TestBed.inject(Router);
      const navSpy = vi
        .spyOn(router, 'navigateByUrl')
        .mockResolvedValue(true);

      component.navigateToResource(null);

      expect(openSpy).not.toHaveBeenCalled();
      expect(navSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
      navSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // Pure helpers
  // ---------------------------------------------------------------------------

  it('should map every status to an aria-label i18n key', () => {
    expect(component.getStatusAriaLabel('pending')).toBe(
      'onboarding.checklist.status_pending',
    );
    expect(component.getStatusAriaLabel('in_progress')).toBe(
      'onboarding.checklist.status_in_progress',
    );
    expect(component.getStatusAriaLabel('completed')).toBe(
      'onboarding.checklist.status_completed',
    );
    expect(component.getStatusAriaLabel('overdue')).toBe(
      'onboarding.checklist.status_overdue',
    );
    httpMock.expectOne(CHECKLIST_URL).flush(makeChecklist());
  });

  it('should track items by their id', () => {
    const item = makeItem({ id: 'item-99' });
    expect(component.trackByItemId(0, item)).toBe('item-99');
    httpMock.expectOne(CHECKLIST_URL).flush(makeChecklist());
  });

  it('should expose zero counts before any data resolves', () => {
    // Outstanding request -> checklist() is null -> defaults apply.
    httpMock.expectOne(CHECKLIST_URL);
    expect(component.completedCount()).toBe(0);
    expect(component.totalCount()).toBe(0);
    expect(component.progressPercentage()).toBe(0);
    expect(component.items()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  it('should unsubscribe on destroy without throwing', () => {
    httpMock.expectOne(CHECKLIST_URL).flush(makeChecklist());
    expect(() => fixture.destroy()).not.toThrow();
  });
});
