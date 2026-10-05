import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../../environments/environment';
import { FamiliarMapComponent } from './familiar-map.component';
import { GoalService } from '../../dashboard/goal/goal.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type { GoalDTO } from '../../dashboard/goal/goal.model';
import type {
  FamiliarBinding,
  FamiliarMapMemory,
} from '../familiar-map.model';

const BFF = environment.bffBaseUrl;
const BASE = `${BFF}/api/v1/me/familiars`;

const BINDING: FamiliarBinding = {
  bindingId: 'bind-1',
  mapTheme: 'Algebra',
  familiarId: 'fam-1',
  acquisition: 'dev_hatched',
  createdAt: '2026-07-01T00:00:00Z',
};

function makeMemory(familiarId = 'fam-1'): FamiliarMapMemory {
  return {
    familiarId,
    name: 'Sage',
    focus: 'Algebra',
    persona: 'Patient mentor',
    rules: {},
    evolutionTier: 'hatchling',
    skills: [],
    hasMemory: false,
    memories: [],
    visibleNeighbors: [],
  };
}

/** Two learner goals (= maps) the acquire picker sources its options from. */
const GOALS: readonly GoalDTO[] = [
  {
    goalId: 'goal-1',
    kind: 'curiosity',
    conceptSet: [],
    status: 'active',
    northStarNote: 'Master Algebra',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    goalId: 'goal-2',
    kind: 'cert',
    conceptSet: [],
    status: 'active',
    northStarNote: '',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
];

/** Stub GoalService — the picker reads `goals()`; `load()` is a no-op here. */
const mockGoalService: Pick<GoalService, 'goals' | 'load'> = {
  goals: signal<readonly GoalDTO[]>(GOALS).asReadonly(),
  load: () => {},
};

describe('FamiliarMapComponent', () => {
  let fixture: ComponentFixture<FamiliarMapComponent>;
  let component: FamiliarMapComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FamiliarMapComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: GoalService, useValue: mockGoalService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FamiliarMapComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads bindings, auto-selects the first, and loads its memory', () => {
    fixture.detectChanges(); // ngOnInit → GET bindings
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [BINDING] });
    fixture.detectChanges();

    // auto-selected fam-1 ⇒ GET memory
    expect(component.selectedFamiliarId()).toBe('fam-1');
    httpMock.expectOne(`${BASE}/fam-1/memory`).flush(makeMemory());
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="fmap-bind-fam-1"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="fmemory-empty"]')).toBeTruthy();
  });

  it('renders the empty state and issues no memory request when there are no bindings', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="fmap-bindings-empty"]'),
    ).toBeTruthy();
    expect(component.selectedFamiliarId()).toBe('');
    httpMock.expectNone(`${BASE}/fam-1/memory`);
  });

  it('renders a map option per goal, valued by goalId, sourced from GoalService', () => {
    fixture.detectChanges(); // ngOnInit → GET bindings (goals come from the stub)
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
    fixture.detectChanges();

    const options = Array.from(
      element.querySelectorAll<HTMLOptionElement>(
        '[data-testid="fmap-goal"] option',
      ),
    );
    // disabled placeholder + one option per goal
    expect(options).toHaveLength(GOALS.length + 1);
    const values = options.map((o) => o.value);
    expect(values).toContain('goal-1');
    expect(values).toContain('goal-2');
    // north-star note is the label; kind is the fallback when the note is blank
    const labels = options.map((o) => o.textContent?.trim());
    expect(labels).toContain('Master Algebra');
    expect(labels).toContain('cert');
  });

  it('fails loud on a bindings error and retries', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE}/bindings`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="fmap-bindings-error"]'),
    ).toBeTruthy();

    element
      .querySelector<HTMLButtonElement>('[data-testid="fmap-bindings-retry"]')
      ?.click();
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
  });

  it('acquires a Familiar (dev_hatched) then reloads bindings + memory', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
    fixture.detectChanges();

    component.acquireForm.setValue({ goalId: 'goal-1', familiarName: 'Sage' });
    component.acquire();

    const req = httpMock.expectOne(`${BASE}/acquire`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      goalId: 'goal-1',
      familiarName: 'Sage',
      mode: 'dev_hatched',
    });
    req.flush({
      familiarId: 'fam-9',
      name: 'Sage',
      goalId: 'goal-1',
      acquisition: 'dev_hatched',
    });

    expect(component.selectedFamiliarId()).toBe('fam-9');
    // acquire success triggers a memory load + a bindings reload
    httpMock.expectOne(`${BASE}/fam-9/memory`).flush(makeMemory('fam-9'));
    httpMock.expectOne(`${BASE}/bindings`).flush({
      items: [{ ...BINDING, familiarId: 'fam-9', bindingId: 'bind-9' }],
    });
  });

  it('omits familiarName from the acquire body when left blank', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
    fixture.detectChanges();

    component.acquireForm.setValue({ goalId: 'goal-2', familiarName: '' });
    component.acquire();

    const req = httpMock.expectOne(`${BASE}/acquire`);
    expect(req.request.body).toEqual({ goalId: 'goal-2', mode: 'dev_hatched' });
    req.flush({
      familiarId: 'fam-2',
      name: 'Fam',
      goalId: 'goal-2',
      acquisition: 'dev_hatched',
    });
    httpMock.expectOne(`${BASE}/fam-2/memory`).flush(makeMemory('fam-2'));
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
  });

  it('does not POST acquire when the form is invalid', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
    fixture.detectChanges();

    component.acquireForm.setValue({ goalId: '', familiarName: '' });
    component.acquire();
    httpMock.expectNone(`${BASE}/acquire`);
  });

  it('toasts and clears the busy flag when acquire fails', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
    fixture.detectChanges();
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');

    component.acquireForm.setValue({ goalId: 'goal-1', familiarName: '' });
    component.acquire();
    httpMock
      .expectOne(`${BASE}/acquire`)
      .flush('nope', { status: 409, statusText: 'Conflict' });

    expect(spy).toHaveBeenCalledWith(
      'aplus.discovery.familiar.acquire_error',
      'error',
    );
    expect(component.acquiring()).toBe(false);
  });

  it('selectBinding loads the selected Familiar memory', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [] });
    fixture.detectChanges();

    component.selectBinding('fam-7');
    expect(component.selectedFamiliarId()).toBe('fam-7');
    httpMock.expectOne(`${BASE}/fam-7/memory`).flush(makeMemory('fam-7'));
    fixture.detectChanges();
  });

  it('renders the memory error state when the memory load fails', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/bindings`).flush({ items: [BINDING] });
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE}/fam-1/memory`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="fmemory-error"]')).toBeTruthy();
  });
});
