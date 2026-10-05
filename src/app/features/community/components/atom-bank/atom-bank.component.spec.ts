import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { expect } from 'vitest';
import { AtomBankComponent } from './atom-bank.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import type { CommunityAtom } from '../../models/community.model';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ATOMS_URL = `${environment.bffBaseUrl}/api/v1/community/atoms`;

function makeAtom(overrides: Partial<CommunityAtom> = {}): CommunityAtom {
  return {
    id: 'atom-1',
    tenant_id: 'tenant-001',
    contributor_gcid: 'gcid-author',
    title: 'Newton First Law',
    content: 'An object in motion stays in motion.',
    atom_type: 'concept',
    status: 'approved',
    tags: ['physics', 'motion'],
    vote_score: 5,
    promoted_atom_id: null,
    metadata: null,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

const STUB_ATOMS: readonly CommunityAtom[] = [
  makeAtom({
    id: 'atom-concept',
    atom_type: 'concept',
    title: 'Newton First Law',
    tags: ['physics'],
    vote_score: 5,
  }),
  makeAtom({
    id: 'atom-factoid',
    atom_type: 'factoid',
    title: 'Water boils at 100C',
    content: 'At sea level.',
    tags: ['chemistry', 'temperature'],
    vote_score: 2,
  }),
  makeAtom({
    id: 'atom-procedure',
    atom_type: 'procedure',
    title: 'How to titrate',
    content: 'Step by step.',
    tags: [],
    vote_score: -1,
  }),
];

describe('AtomBankComponent', () => {
  let component: AtomBankComponent;
  let fixture: ComponentFixture<AtomBankComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AtomBankComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="atom-bank"]');
    expect(el).toBeTruthy();
  });

  it('should have filter controls', () => {
    const typeFilter = fixture.nativeElement.querySelector('[data-testid="filter-atom-type"]');
    const searchFilter = fixture.nativeElement.querySelector('[data-testid="filter-search"]');
    expect(typeFilter).toBeTruthy();
    expect(searchFilter).toBeTruthy();
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('approved')).toBe('atom-bank__status--approved');
    expect(component.statusClass('rejected')).toBe('atom-bank__status--rejected');
  });

  it('should update filterType on select change', () => {
    const event = { target: { value: 'concept' } } as unknown as Event;
    component.onFilterTypeChange(event);
    expect(component.filterType()).toBe('concept');
  });

  it('should update searchTerm on input change', () => {
    const event = { target: { value: 'test query' } } as unknown as Event;
    component.onSearchChange(event);
    expect(component.searchTerm()).toBe('test query');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

// ===========================================================================
// AUGMENTED — shell render, loading/success/empty/error states, filters,
// computed signals, vote success/error paths, and helpers.
// ===========================================================================

describe('AtomBankComponent — shell + header', () => {
  let fixture: ComponentFixture<AtomBankComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AtomBankComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges(); // triggers ngOnInit → GET (pending in these tests)
  });

  it('uses a semantic <section> root with role="main"', () => {
    const root = element.querySelector('[data-testid="atom-bank"]');
    expect(root?.tagName).toBe('SECTION');
    expect(root?.getAttribute('role')).toBe('main');
  });

  it('renders the page header title (translated key)', () => {
    const title = element.querySelector('[data-testid="atom-bank-title"]');
    expect(title?.textContent).toContain('community.atom_bank_title');
  });

  it('renders the filters region with type select and search input', () => {
    const filters = element.querySelector('[data-testid="atom-bank-filters"]');
    expect(filters).not.toBeNull();
    expect(element.querySelector('[data-testid="filter-atom-type"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="filter-search"]')).not.toBeNull();
  });

  it('renders one type option per atom type plus the "all" option', () => {
    const options = element.querySelectorAll('[data-testid="filter-atom-type"] option');
    // 4 atom types + the leading "all" option
    expect(options.length).toBe(5);
  });

  it('starts in the loading state on first detectChanges', () => {
    const loading = element.querySelector('[data-testid="atom-bank-loading"]');
    expect(loading).not.toBeNull();
    // 3 skeleton cards
    expect(loading?.querySelectorAll('.atom-bank__skeleton-card').length).toBe(3);
  });

  it('renders a live result count of 0 while loading', () => {
    const count = element.querySelector('[data-testid="result-count"]');
    expect(count?.textContent).toContain('0');
  });
});

describe('AtomBankComponent — loaded list (success)', () => {
  let fixture: ComponentFixture<AtomBankComponent>;
  let httpMock: HttpTestingController;
  let component: AtomBankComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AtomBankComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock.expectOne(ATOMS_URL).flush({ data: STUB_ATOMS });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('GETs the community atoms endpoint on init', () => {
    // The GET in beforeEach already asserts the path/verb; confirm state is success.
    expect(component.atomListState().status).toBe('success');
  });

  it('renders one card per atom (3 total)', () => {
    const cards = element.querySelectorAll('[data-testid="atom-card"]');
    expect(cards.length).toBe(3);
  });

  it('renders atom title, content, and vote score on a card', () => {
    const list = element.querySelector('[data-testid="atom-bank-list"]');
    expect(list?.textContent).toContain('Newton First Law');
    expect(list?.textContent).toContain('An object in motion');
    const scores = element.querySelectorAll('[data-testid="vote-score"]');
    expect(scores[0]?.textContent).toContain('5');
  });

  it('renders tags only for atoms that have them', () => {
    // atom-procedure has no tags → no tags container for that card
    const tagBlocks = element.querySelectorAll('[data-testid="atom-tags"]');
    // 2 of the 3 stub atoms have tags
    expect(tagBlocks.length).toBe(2);
  });

  it('computes atomCount equal to the number of filtered atoms', () => {
    expect(component.atomCount()).toBe(3);
    const count = element.querySelector('[data-testid="result-count"]');
    expect(count?.textContent).toContain('3');
  });

  it('does not render loading, error, or empty regions when populated', () => {
    expect(element.querySelector('[data-testid="atom-bank-loading"]')).toBeNull();
    expect(element.querySelector('[data-testid="atom-bank-error"]')).toBeNull();
    expect(element.querySelector('[data-testid="atom-bank-empty"]')).toBeNull();
  });

  it('applies a per-status class to the status badge', () => {
    const status = element.querySelector('[data-testid="atom-status"]');
    expect(status?.className).toContain('atom-bank__status--approved');
  });

  it('tracks atoms by id via trackByAtomId', () => {
    expect(component.trackByAtomId(0, STUB_ATOMS[1])).toBe('atom-factoid');
  });
});

describe('AtomBankComponent — filtering computed', () => {
  let fixture: ComponentFixture<AtomBankComponent>;
  let httpMock: HttpTestingController;
  let component: AtomBankComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AtomBankComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock.expectOne(ATOMS_URL).flush({ data: STUB_ATOMS });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('filters by atom type', () => {
    component.filterType.set('factoid');
    expect(component.filteredAtoms().length).toBe(1);
    expect(component.filteredAtoms()[0].id).toBe('atom-factoid');
  });

  it('keeps all atoms when type filter is "all"', () => {
    component.filterType.set('all');
    expect(component.filteredAtoms().length).toBe(3);
  });

  it('filters by search term matching the title (case-insensitive, trimmed)', () => {
    component.searchTerm.set('  NEWTON  ');
    expect(component.filteredAtoms().length).toBe(1);
    expect(component.filteredAtoms()[0].id).toBe('atom-concept');
  });

  it('filters by search term matching a tag', () => {
    component.searchTerm.set('chemistry');
    expect(component.filteredAtoms().length).toBe(1);
    expect(component.filteredAtoms()[0].id).toBe('atom-factoid');
  });

  it('combines type and search filters', () => {
    component.filterType.set('concept');
    component.searchTerm.set('water'); // matches only the factoid title
    expect(component.filteredAtoms().length).toBe(0);
  });

  it('returns an empty result set when nothing matches', () => {
    component.searchTerm.set('no-such-atom-anywhere');
    expect(component.filteredAtoms().length).toBe(0);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="atom-bank-empty"]')).not.toBeNull();
  });

  it('reflects the filtered count in the live result count', () => {
    component.filterType.set('factoid');
    fixture.detectChanges();
    const count = element.querySelector('[data-testid="result-count"]');
    expect(count?.textContent).toContain('1');
  });
});

describe('AtomBankComponent — empty state', () => {
  let fixture: ComponentFixture<AtomBankComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AtomBankComponent);
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock.expectOne(ATOMS_URL).flush({ data: [] });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders the empty-state region when the success list is empty', () => {
    const empty = element.querySelector('[data-testid="atom-bank-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute('role')).toBe('status');
    expect(empty?.textContent).toContain('community.no_atoms_found');
  });

  it('does not render any atom cards', () => {
    expect(element.querySelectorAll('[data-testid="atom-card"]').length).toBe(0);
  });
});

describe('AtomBankComponent — error state', () => {
  let fixture: ComponentFixture<AtomBankComponent>;
  let httpMock: HttpTestingController;
  let component: AtomBankComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AtomBankComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock
      .expectOne(ATOMS_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('sets the atomListState to error on a 5xx load failure', () => {
    const state = component.atomListState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('ATOMS_LOAD_FAILED');
    }
  });

  it('renders the error region with role="alert"', () => {
    const err = element.querySelector('[data-testid="atom-bank-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    expect(err?.textContent).toContain('community.atoms_load_error');
  });

  it('does not render the list, empty, or loading regions on error', () => {
    expect(element.querySelector('[data-testid="atom-bank-list"]')).toBeNull();
    expect(element.querySelector('[data-testid="atom-bank-empty"]')).toBeNull();
    expect(element.querySelector('[data-testid="atom-bank-loading"]')).toBeNull();
  });
});

describe('AtomBankComponent — voting', () => {
  let fixture: ComponentFixture<AtomBankComponent>;
  let httpMock: HttpTestingController;
  let component: AtomBankComponent;
  let toast: ToastService;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AtomBankComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock.expectOne(ATOMS_URL).flush({ data: STUB_ATOMS });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('POSTs an upvote and shows a success toast', () => {
    const toastSpy = vi.spyOn(toast, 'show');
    component.vote(makeAtom({ id: 'atom-concept' }), 'up');

    const req = httpMock.expectOne(`${ATOMS_URL}/atom-concept/vote`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ direction: 'up' });
    req.flush({
      id: 'vote-1',
      tenant_id: 'tenant-001',
      community_atom_id: 'atom-concept',
      voter_gcid: 'gcid-voter',
      direction: 'up',
      created_at: '2026-06-04T00:00:00Z',
    });

    expect(toastSpy).toHaveBeenCalledWith('community.vote_recorded', 'success');
  });

  it('optimistically bumps the vote score in state on a successful upvote', () => {
    component.vote(makeAtom({ id: 'atom-concept' }), 'up');
    httpMock.expectOne(`${ATOMS_URL}/atom-concept/vote`).flush({
      id: 'vote-2',
      tenant_id: 'tenant-001',
      community_atom_id: 'atom-concept',
      voter_gcid: 'gcid-voter',
      direction: 'up',
      created_at: '2026-06-04T00:00:00Z',
    });
    const updated = component.atoms().find((a) => a.id === 'atom-concept');
    expect(updated?.vote_score).toBe(6); // 5 + 1
  });

  it('decrements the vote score on a successful downvote', () => {
    component.vote(makeAtom({ id: 'atom-factoid' }), 'down');
    httpMock.expectOne(`${ATOMS_URL}/atom-factoid/vote`).flush({
      id: 'vote-3',
      tenant_id: 'tenant-001',
      community_atom_id: 'atom-factoid',
      voter_gcid: 'gcid-voter',
      direction: 'down',
      created_at: '2026-06-04T00:00:00Z',
    });
    const updated = component.atoms().find((a) => a.id === 'atom-factoid');
    expect(updated?.vote_score).toBe(1); // 2 - 1
  });

  it('clicking the upvote button on a card triggers a vote POST', () => {
    const upBtn = element.querySelector('[data-testid="btn-upvote"]') as HTMLButtonElement;
    expect(upBtn).not.toBeNull();
    upBtn.click();
    const req = httpMock.expectOne((r) => r.url.endsWith('/vote') && r.method === 'POST');
    expect(req.request.body).toEqual({ direction: 'up' });
    req.flush({
      id: 'vote-click',
      tenant_id: 'tenant-001',
      community_atom_id: 'atom-concept',
      voter_gcid: 'gcid-voter',
      direction: 'up',
      created_at: '2026-06-04T00:00:00Z',
    });
  });

  it('shows an error toast when the vote request fails (service swallows error → result null, no success toast)', () => {
    const toastSpy = vi.spyOn(toast, 'show');
    component.vote(makeAtom({ id: 'atom-concept' }), 'up');
    httpMock
      .expectOne(`${ATOMS_URL}/atom-concept/vote`)
      .flush({ message: 'nope' }, { status: 400, statusText: 'Bad Request' });

    // CHARACTERIZATION: voteOnAtom catchError returns of(null), so the
    // component's success branch sees a falsy result and the error branch of
    // subscribe never fires. Neither vote_recorded nor vote_error is shown.
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

describe('AtomBankComponent — helpers', () => {
  let component: AtomBankComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(AtomBankComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(ATOMS_URL).flush({ data: [] });
  });

  afterEach(() => httpMock.verify());

  it('formatDate returns a non-empty localized string for a valid ISO date', () => {
    const out = component.formatDate('2026-03-15T10:00:00Z');
    expect(out).toBeTruthy();
    expect(out).not.toBe('2026-03-15T10:00:00Z');
  });

  it('formatDate returns "Invalid Date" for a non-parseable string (characterization)', () => {
    // new Date('not-a-date') yields an Invalid Date whose toLocaleDateString()
    // does NOT throw — it returns "Invalid Date" — so the catch never fires.
    expect(component.formatDate('not-a-date')).toBe('Invalid Date');
  });

  it('statusClass builds a BEM modifier from the status', () => {
    expect(component.statusClass('under_review')).toBe('atom-bank__status--under_review');
    expect(component.statusClass('revision_requested')).toBe(
      'atom-bank__status--revision_requested',
    );
  });
});

describe('AtomBankComponent — lifecycle', () => {
  it('unsubscribes on destroy without throwing', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomBankComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(AtomBankComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(ATOMS_URL).flush({ data: STUB_ATOMS });
    fixture.detectChanges();

    expect(() => fixture.destroy()).not.toThrow();
    httpMock.verify();
  });
});
