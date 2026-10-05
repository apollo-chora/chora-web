import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { of, throwError } from 'rxjs';
import { ChecklistBuilderComponent } from './checklist-builder.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { OnboardingAdminService } from '../../services/onboarding-admin.service';
import { environment } from '../../../../../../environments/environment';
import type { ChecklistTemplate, ChecklistItem } from '../../models/onboarding.model';

const TEMPLATES_URL = `${environment.bffBaseUrl}/api/v1/onboarding/templates`;

function makeItem(over: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 'item-1',
    name: 'Sign NDA',
    description: 'Sign the non-disclosure agreement',
    type: 'document_upload',
    required: true,
    due_date_offset_days: 3,
    linked_resource_url: null,
    order: 0,
    ...over,
  };
}

function makeTemplate(over: Partial<ChecklistTemplate> = {}): ChecklistTemplate {
  return {
    id: 'tpl-42',
    name: 'New Hire Onboarding',
    description: 'Default new-hire flow',
    items: [
      makeItem({ id: 'item-1', name: 'Sign NDA', order: 0 }),
      makeItem({ id: 'item-2', name: 'Watch orientation', type: 'orientation_video', order: 1 }),
    ],
    target_roles: ['learner', 'educator'],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...over,
  };
}

function dropEvent(prev: number, curr: number): CdkDragDrop<ChecklistItem[]> {
  return {
    previousIndex: prev,
    currentIndex: curr,
  } as unknown as CdkDragDrop<ChecklistItem[]>;
}

describe('ChecklistBuilderComponent', () => {
  let component: ChecklistBuilderComponent;
  let fixture: ComponentFixture<ChecklistBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChecklistBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChecklistBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with empty items', () => {
    expect(component.items().length).toBe(0);
  });

  it('should add an item when addItem is called', () => {
    component.addItem('document_upload');
    expect(component.items().length).toBe(1);
    expect(component.items()[0].type).toBe('document_upload');
  });

  it('should remove an item when removeItem is called', () => {
    component.addItem('form_completion');
    component.addItem('assessment');
    component.removeItem(0);
    expect(component.items().length).toBe(1);
    expect(component.items()[0].type).toBe('assessment');
  });

  it('should select an item', () => {
    component.addItem('orientation_video');
    component.selectItem(0);
    expect(component.selectedItemIndex()).toBe(0);
    expect(component.selectedItem()?.type).toBe('orientation_video');
  });

  it('should not allow save when no name is set', () => {
    component.addItem('profile_setup');
    expect(component.canSave()).toBe(false);
  });

  it('should allow save when name and items are set', () => {
    component.templateName.set('Test Checklist');
    component.addItem('custom');
    expect(component.canSave()).toBe(true);
  });

  it('should add and remove roles', () => {
    component.roleInput.set('learner');
    component.addRole();
    expect(component.targetRoles()).toEqual(['learner']);

    component.roleInput.set('educator');
    component.addRole();
    expect(component.targetRoles()).toEqual(['learner', 'educator']);

    component.removeRole('learner');
    expect(component.targetRoles()).toEqual(['educator']);
  });

  it('should not add duplicate roles', () => {
    component.roleInput.set('learner');
    component.addRole();
    component.roleInput.set('learner');
    component.addRole();
    expect(component.targetRoles()).toEqual(['learner']);
  });

  it('should update item properties', () => {
    component.addItem('custom');
    component.updateItemName(0, 'Test Item');
    expect(component.items()[0].name).toBe('Test Item');

    component.updateItemDescription(0, 'Description');
    expect(component.items()[0].description).toBe('Description');

    component.updateItemRequired(0, false);
    expect(component.items()[0].required).toBe(false);

    component.updateItemDueDateOffset(0, 7);
    expect(component.items()[0].due_date_offset_days).toBe(7);

    component.updateItemLinkedUrl(0, 'https://example.com');
    expect(component.items()[0].linked_resource_url).toBe('https://example.com');
  });

  // --- shell render ---------------------------------------------------------

  it('renders the builder root + "new template" title when not editing', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="checklist-builder"]')).not.toBeNull();
    const title = el.querySelector('[data-testid="builder-title"]');
    expect(title?.textContent).toContain('admin.onboarding.new_template');
    expect(component.isEditing()).toBe(false);
  });

  it('renders the empty-items placeholder + the item palette + footer when there are no items', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="empty-items"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="item-palette"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="builder-footer"]')).not.toBeNull();
    // one palette button per item type
    const paletteButtons = el.querySelectorAll('[data-testid^="add-item-"]');
    expect(paletteButtons.length).toBe(component.allItemTypes.length);
  });

  it('shows the no-item-selected hint when nothing is selected', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="no-item-selected"]')).not.toBeNull();
  });

  it('disables the save button while canSave is false', () => {
    const el = fixture.nativeElement as HTMLElement;
    const save = el.querySelector('[data-testid="save-btn"]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  // --- palette / config panel render after interaction ----------------------

  it('renders an item row + config panel once an item is added and selected', () => {
    const el = fixture.nativeElement as HTMLElement;
    const addBtn = el.querySelector(
      '[data-testid="add-item-assessment"]',
    ) as HTMLButtonElement;
    addBtn.click();
    fixture.detectChanges();

    // addItem auto-selects the new item -> config panel renders
    expect(el.querySelector('[data-testid="item-row-0"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="config-panel"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="item-name-input"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="empty-items"]')).toBeNull();
  });

  // --- addItem default shape ------------------------------------------------

  it('addItem creates a required item with sequential order + auto-selects it', () => {
    component.addItem('document_upload');
    component.addItem('assessment');
    const items = component.items();
    expect(items[0].order).toBe(0);
    expect(items[1].order).toBe(1);
    expect(items[1].required).toBe(true);
    expect(items[1].due_date_offset_days).toBeNull();
    expect(items[1].linked_resource_url).toBeNull();
    // last add auto-selects the newest
    expect(component.selectedItemIndex()).toBe(1);
    expect(component.selectedItem()?.type).toBe('assessment');
  });

  // --- selectedItem computed edge cases -------------------------------------

  it('selectedItem returns null when index is null or out of range', () => {
    expect(component.selectedItem()).toBeNull();
    component.selectedItemIndex.set(5); // out of range, no items
    expect(component.selectedItem()).toBeNull();
  });

  // --- removeItem selection-index adjustment branches -----------------------

  it('clears selection when the selected item itself is removed', () => {
    component.addItem('custom');
    component.addItem('custom');
    component.selectItem(1);
    component.removeItem(1);
    expect(component.selectedItemIndex()).toBeNull();
    expect(component.items().length).toBe(1);
  });

  it('decrements the selected index when an earlier item is removed', () => {
    component.addItem('custom');
    component.addItem('custom');
    component.addItem('custom');
    component.selectItem(2);
    component.removeItem(0);
    expect(component.selectedItemIndex()).toBe(1);
    // orders are re-sequenced after removal
    expect(component.items().map((i) => i.order)).toEqual([0, 1]);
  });

  it('keeps the selected index when a later item is removed', () => {
    component.addItem('custom');
    component.addItem('custom');
    component.addItem('custom');
    component.selectItem(0);
    component.removeItem(2);
    expect(component.selectedItemIndex()).toBe(0);
  });

  // --- onItemDrop reorder + selection follow --------------------------------

  it('reorders items and re-sequences order on drop', () => {
    component.addItem('document_upload'); // 0
    component.addItem('assessment'); // 1
    component.addItem('custom'); // 2
    component.onItemDrop(dropEvent(0, 2));
    const types = component.items().map((i) => i.type);
    expect(types).toEqual(['assessment', 'custom', 'document_upload']);
    expect(component.items().map((i) => i.order)).toEqual([0, 1, 2]);
  });

  it('moves selection with the dragged item when the dragged item was selected', () => {
    component.addItem('document_upload');
    component.addItem('assessment');
    component.addItem('custom');
    component.selectItem(0);
    component.onItemDrop(dropEvent(0, 2));
    expect(component.selectedItemIndex()).toBe(2);
  });

  it('shifts selection down when an item is dragged from above past the selection', () => {
    component.addItem('document_upload'); // 0
    component.addItem('assessment'); // 1 selected
    component.addItem('custom'); // 2
    component.selectItem(1);
    // drag index 0 -> 2: selection (1) is > prev(0) and <= curr(2) => decrement
    component.onItemDrop(dropEvent(0, 2));
    expect(component.selectedItemIndex()).toBe(0);
  });

  it('shifts selection up when an item is dragged from below to above the selection', () => {
    component.addItem('document_upload'); // 0
    component.addItem('assessment'); // 1
    component.addItem('custom'); // 2 -> select 1
    component.selectItem(1);
    // drag index 2 -> 0: selection (1) is < prev(2) and >= curr(0) => increment
    component.onItemDrop(dropEvent(2, 0));
    expect(component.selectedItemIndex()).toBe(2);
  });

  it('leaves selection null on drop when nothing was selected', () => {
    component.addItem('document_upload');
    component.addItem('assessment');
    component.selectedItemIndex.set(null); // addItem auto-selects; clear it
    component.onItemDrop(dropEvent(0, 1));
    expect(component.selectedItemIndex()).toBeNull();
  });

  // --- roles edge cases -----------------------------------------------------

  it('does not add an empty/whitespace role', () => {
    component.roleInput.set('   ');
    component.addRole();
    expect(component.targetRoles()).toEqual([]);
    // input cleared only on a real add; whitespace add leaves input untouched
    expect(component.roleInput()).toBe('   ');
  });

  it('trims and clears the input after adding a role', () => {
    component.roleInput.set('  admin  ');
    component.addRole();
    expect(component.targetRoles()).toEqual(['admin']);
    expect(component.roleInput()).toBe('');
  });

  // --- updateItemDueDateOffset null branch ----------------------------------

  it('updateItemDueDateOffset accepts null', () => {
    component.addItem('custom');
    component.updateItemDueDateOffset(0, null);
    expect(component.items()[0].due_date_offset_days).toBeNull();
  });

  it('updateItemLinkedUrl coerces an empty string to null', () => {
    component.addItem('custom');
    component.updateItemLinkedUrl(0, '');
    expect(component.items()[0].linked_resource_url).toBeNull();
  });

  // --- save guard -----------------------------------------------------------

  it('save() is a no-op when canSave is false (no HTTP, saving stays false)', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.save(); // no name, no items
    expect(component.saving()).toBe(false);
    httpMock.verify(); // asserts zero outstanding requests
  });

  // --- trackBy helpers ------------------------------------------------------

  it('trackByIndex returns the index and trackByItemType returns the type', () => {
    expect(component.trackByIndex(3)).toBe(3);
    expect(component.trackByItemType(0, 'assessment')).toBe('assessment');
  });

  // --- cancel ---------------------------------------------------------------

  it('cancel() navigates back to the onboarding root', () => {
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.cancel();
    expect(spy).toHaveBeenCalledWith(['/admin/onboarding']);
  });
});

// =============================================================================
// HTTP-driven flows: create / update / load — separate suites so we can vary
// the ActivatedRoute snapshot per-suite.
// =============================================================================

describe('ChecklistBuilderComponent — create flow', () => {
  let component: ChecklistBuilderComponent;
  let fixture: ComponentFixture<ChecklistBuilderComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChecklistBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChecklistBuilderComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit — no :id, no load
  });

  afterEach(() => httpMock.verify());

  it('does not call the load endpoint when there is no route id', () => {
    expect(component.isEditing()).toBe(false);
    // verify() in afterEach asserts no stray HTTP
  });

  it('POSTs a create request and navigates to the edit route on success', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    component.templateName.set('Quarterly Onboarding');
    component.templateDescription.set('Q3 hires');
    component.addItem('document_upload');
    component.roleInput.set('learner');
    component.addRole();

    component.save();
    expect(component.saving()).toBe(true);

    const req = httpMock.expectOne(TEMPLATES_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('Quarterly Onboarding');
    expect(req.request.body.description).toBe('Q3 hires');
    expect(req.request.body.target_roles).toEqual(['learner']);
    expect(req.request.body.items.length).toBe(1);

    req.flush(makeTemplate({ id: 'tpl-created-99' }));

    expect(component.saving()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.onboarding.template_saved',
      'success',
    );
    expect(navSpy).toHaveBeenCalledWith([
      '/admin/onboarding/templates',
      'tpl-created-99',
      'edit',
    ]);
  });

  it('shows a save-error toast when create succeeds HTTP-wise but returns a null body', () => {
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    component.templateName.set('X');
    component.addItem('custom');
    component.save();

    httpMock.expectOne(TEMPLATES_URL).flush(null);

    expect(component.saving()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.onboarding.template_save_error',
      'error',
    );
  });

  it('shows a save-error toast and clears saving on a 5xx create failure', () => {
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    component.templateName.set('X');
    component.addItem('custom');
    component.save();

    httpMock
      .expectOne(TEMPLATES_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(component.saving()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.onboarding.template_save_error',
      'error',
    );
  });
});

describe('ChecklistBuilderComponent — edit/load flow', () => {
  let component: ChecklistBuilderComponent;
  let fixture: ComponentFixture<ChecklistBuilderComponent>;
  let httpMock: HttpTestingController;

  function configure(routeId: string | null): void {
    TestBed.configureTestingModule({
      imports: [ChecklistBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (_k: string) => routeId } },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ChecklistBuilderComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  it('loads + applies the template on init when the route carries an id', () => {
    configure('tpl-42');
    fixture.detectChanges(); // ngOnInit -> loadTemplate

    expect(component.isEditing()).toBe(true);
    expect(component.loading()).toBe(true);

    const req = httpMock.expectOne(`${TEMPLATES_URL}/tpl-42`);
    expect(req.request.method).toBe('GET');
    req.flush(makeTemplate());

    expect(component.loading()).toBe(false);
    expect(component.templateName()).toBe('New Hire Onboarding');
    expect(component.templateDescription()).toBe('Default new-hire flow');
    expect(component.targetRoles()).toEqual(['learner', 'educator']);
    expect(component.items().length).toBe(2);
  });

  it('renders the "edit template" title + populated item rows after load', () => {
    configure('tpl-42');
    fixture.detectChanges();
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-42`).flush(makeTemplate());
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="builder-title"]')?.textContent).toContain(
      'admin.onboarding.edit_template',
    );
    expect(el.querySelectorAll('[data-testid^="item-row-"]').length).toBe(2);
    expect(el.querySelector('[data-testid="role-tags"]')?.textContent).toContain(
      'learner',
    );
  });

  it('PUTs an update request (not POST) when editing and saving', () => {
    configure('tpl-42');
    fixture.detectChanges();
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-42`).flush(makeTemplate());

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    component.templateName.set('Renamed Template');
    component.save();

    const req = httpMock.expectOne(`${TEMPLATES_URL}/tpl-42`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.name).toBe('Renamed Template');
    req.flush(makeTemplate({ name: 'Renamed Template' }));

    expect(component.saving()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.onboarding.template_saved',
      'success',
    );
    // editing => no navigation away
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('stops loading without applying a template when the GET fails (service swallows the error to null)', () => {
    // The service catchError()s the HTTP failure into of(null), so the
    // component's subscribe `next` fires with `null` (NOT the `error` cb).
    // ChecklistBuilderComponent only applies the template when the body is
    // truthy, so a failed load leaves the form pristine and stops the spinner.
    // The component's `error`-branch load-error toast is therefore unreachable
    // through the service today — characterizing actual (not intended) behavior.
    configure('tpl-broken');
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    fixture.detectChanges();
    httpMock
      .expectOne(`${TEMPLATES_URL}/tpl-broken`)
      .flush({ error: 'nope' }, { status: 404, statusText: 'Not Found' });

    expect(component.loading()).toBe(false);
    // no toast — the error was swallowed by the service before reaching the cb
    expect(toastSpy).not.toHaveBeenCalled();
    // applyTemplate was never called — name stays empty
    expect(component.templateName()).toBe('');
  });

  it('unsubscribes on destroy without error', () => {
    configure('tpl-42');
    fixture.detectChanges();
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-42`).flush(makeTemplate());
    expect(() => fixture.destroy()).not.toThrow();
  });
});

// =============================================================================
// Service-stub-driven branches that the HTTP path cannot reach.
//
// OnboardingAdminService.loadTemplate() catchError()s HTTP failures into
// of(null), so the COMPONENT's `error:` subscribe callback (template_load_error
// toast) is unreachable through real HTTP. We exercise it here by injecting a
// stub whose observable actually errors. Same technique covers the `next` with
// a null body (if (template) falsy) without an HTTP round-trip, and the
// onItemDrop "selection non-null but unaffected by the move" implicit-else arm.
// =============================================================================

describe('ChecklistBuilderComponent — stubbed-service branches', () => {
  class OnboardingAdminStub {
    loadTemplate = vi.fn(() => of<ChecklistTemplate | null>(makeTemplate()));
    createTemplate = vi.fn(() => of<ChecklistTemplate | null>(makeTemplate()));
    updateTemplate = vi.fn(() => of<ChecklistTemplate | null>(makeTemplate()));
  }

  let component: ChecklistBuilderComponent;
  let fixture: ComponentFixture<ChecklistBuilderComponent>;
  let admin: OnboardingAdminStub;

  function configure(routeId: string | null): void {
    admin = new OnboardingAdminStub();
    TestBed.configureTestingModule({
      imports: [ChecklistBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OnboardingAdminService, useValue: admin },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (_k: string) => routeId } },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ChecklistBuilderComponent);
    component = fixture.componentInstance;
  }

  it('shows the load-error toast + stops loading when loadTemplate errors (error callback arm)', () => {
    configure('tpl-err');
    admin.loadTemplate = vi.fn(() => throwError(() => new Error('load failed')));
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    fixture.detectChanges(); // ngOnInit -> loadTemplate -> error

    expect(admin.loadTemplate).toHaveBeenCalledWith('tpl-err');
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.onboarding.template_load_error',
      'error',
    );
    expect(component.loading()).toBe(false);
  });

  it('stops loading without applying when loadTemplate emits null (if (template) falsy)', () => {
    configure('tpl-null');
    admin.loadTemplate = vi.fn(() => of<ChecklistTemplate | null>(null));
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    fixture.detectChanges();

    // applyTemplate skipped -> form stays pristine, no toast, spinner cleared
    expect(component.templateName()).toBe('');
    expect(component.items().length).toBe(0);
    expect(component.loading()).toBe(false);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('leaves a non-null selection unchanged when a drop does not span it (onItemDrop implicit-else)', () => {
    configure(null);
    fixture.detectChanges();
    component.addItem('custom'); // 0 (auto-selected)
    component.addItem('custom'); // 1
    component.addItem('custom'); // 2
    component.selectItem(0); // selection at 0 (not null)

    // drag 1 -> 2: selected(0) !== prev(1); not (0 > 1); not (0 < 1 && 0 >= 2)
    component.onItemDrop({
      previousIndex: 1,
      currentIndex: 2,
    } as unknown as CdkDragDrop<ChecklistItem[]>);

    expect(component.selectedItemIndex()).toBe(0);
  });
});
