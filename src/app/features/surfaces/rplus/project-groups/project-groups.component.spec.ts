/**
 * ProjectGroupsComponent spec — R+ /r/project-groups.
 *
 * Verifies the screen: renders the surface-rplus accent, lists one card
 * per project group from the BFF response, and drives the real create
 * flow (New group CTA → inline form → POST /api/v1/project-groups →
 * refetch + close on success; fail-loud `role="alert"` on error). Uses
 * the real HttpTestingController + BffClientService wiring (no
 * service-level mocks per feedback_no_stubs_real_wiring).
 *
 * Both list (GET) and create (POST) hit the same `/api/v1/project-groups`
 * path, so requests are matched by an explicit method+url predicate to
 * stay unambiguous.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ProjectGroupsComponent } from './project-groups.component';
import { environment } from '../../../../../environments/environment';

interface WireMember {
  gcid: string;
  role: string;
}
interface WireGroup {
  id: string;
  tenant_id: string;
  course_id: string;
  name: string;
  state: 'FORMING' | 'ACTIVE' | 'SUBMITTED' | 'GRADED';
  members: WireMember[];
  submitted_at?: string;
  score_pct?: number;
  grader_gcid?: string;
  graded_at?: string;
  feedback?: string;
  created_at: string;
  updated_at: string;
}

const STUB_GROUPS: readonly WireGroup[] = [
  {
    id: 'pg-001',
    tenant_id: 'tenant-001',
    course_id: 'course-dsa-101',
    name: 'Team Mercury',
    state: 'ACTIVE',
    members: [
      { gcid: 'gcid-phyllis', role: 'leader' },
      { gcid: 'gcid-mei', role: 'member' },
    ],
    created_at: '2026-05-25T10:00:00Z',
    updated_at: '2026-05-25T10:00:00Z',
  },
  {
    id: 'pg-002',
    tenant_id: 'tenant-001',
    course_id: 'course-dsa-101',
    name: 'Team Venus',
    state: 'SUBMITTED',
    members: [{ gcid: 'gcid-sam', role: 'leader' }],
    submitted_at: '2026-05-26T12:00:00Z',
    created_at: '2026-05-25T11:00:00Z',
    updated_at: '2026-05-26T12:00:00Z',
  },
];

const PG_URL = `${environment.bffBaseUrl}/api/v1/project-groups`;

function setup(groups: readonly WireGroup[] = STUB_GROUPS): {
  fixture: ComponentFixture<ProjectGroupsComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [ProjectGroupsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap({}) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProjectGroupsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  // initial list GET (no course filter)
  httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: groups });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('ProjectGroupsComponent', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const root = element.querySelector('[data-testid="rplus-project-groups"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('uses a semantic <section> root', () => {
      const root = element.querySelector('[data-testid="rplus-project-groups"]');
      expect(root?.tagName).toBe('SECTION');
    });
  });

  describe('list', () => {
    it('renders one card per project group (2 total)', () => {
      const cards = element.querySelectorAll('[data-testid^="project-group-card-"]');
      expect(cards.length).toBe(2);
    });

    it('shows the group count from the BFF response', () => {
      const count = element.querySelector('[data-testid="project-groups-count"]');
      expect(count?.textContent).toContain('2');
    });

    it('renders the create CTA', () => {
      const cta = element.querySelector('[data-testid="project-groups-create-cta"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('BUTTON');
    });
  });

  describe('a11y', () => {
    it('renders a heading per surface', () => {
      expect(element.querySelector('h1')).not.toBeNull();
    });

    it('has zero critical/serious WCAG violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});

describe('ProjectGroupsComponent — empty state', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup([]);
    httpMock = built.httpMock;
    element = built.fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders the empty-state message when no groups are in scope', () => {
    expect(element.querySelector('[data-testid="project-groups-empty"]')).not.toBeNull();
  });

  it('shows a group count of 0', () => {
    const count = element.querySelector('[data-testid="project-groups-count"]');
    expect(count?.textContent).toContain('0');
  });
});

describe('ProjectGroupsComponent — create flow', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: ProjectGroupsComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup(); // initial GET flushed with STUB_GROUPS
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('opens the create form only after the New group CTA is clicked', () => {
    expect(element.querySelector('[data-testid="project-groups-create-form"]')).toBeNull();
    (
      element.querySelector('[data-testid="project-groups-create-cta"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="project-groups-create-form"]')).not.toBeNull();
  });

  it('POSTs the create request, refetches the list, and closes the form on success', () => {
    component.onCreateClicked();
    component.formName.set('Team Mars');
    component.formCourseId.set('course-dsa-101');
    component.formMembers.set('gcid-lead\ngcid-two');
    fixture.detectChanges();

    component.onCreateSubmit();

    const post = httpMock.expectOne((r) => r.method === 'POST' && r.url === PG_URL);
    expect(post.request.body).toEqual({
      course_id: 'course-dsa-101',
      name: 'Team Mars',
      members: [
        { gcid: 'gcid-lead', role: 'leader' },
        { gcid: 'gcid-two', role: 'member' },
      ],
    });
    post.flush({
      id: 'pg-003',
      tenant_id: 'tenant-001',
      course_id: 'course-dsa-101',
      name: 'Team Mars',
      state: 'FORMING',
      members: [
        { gcid: 'gcid-lead', role: 'leader' },
        { gcid: 'gcid-two', role: 'member' },
      ],
      created_at: '2026-06-02T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    });

    // success → reloadKey bump → real refetch. The refetch flows through
    // toObservable(reloadKey) → switchMap(service.list()), whose effect only
    // re-emits on a change-detection tick — so flush the CD cycle (mirroring
    // the initial GET in setup()) before the GET request is observable.
    fixture.detectChanges();
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: STUB_GROUPS });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="project-groups-create-form"]')).toBeNull();
  });

  it('surfaces a loud error and keeps the form open when the create POST fails', () => {
    component.onCreateClicked();
    component.formName.set('Team Pluto');
    component.formCourseId.set('course-missing');
    fixture.detectChanges();

    component.onCreateSubmit();

    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === PG_URL)
      .flush({ message: 'course not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="project-groups-create-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('404');
    // No refetch fired (verify() asserts no stray GET) and the form stays
    // open so the user can correct + retry.
    expect(element.querySelector('[data-testid="project-groups-create-form"]')).not.toBeNull();
  });

  it('canCreate gates submit — false until both name + course present, then opens', () => {
    component.onCreateClicked();
    fixture.detectChanges();
    // Submit button rendered but disabled while form is incomplete.
    const submitBtn = element.querySelector(
      '[data-testid="project-groups-create-submit"]',
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(component.canCreate()).toBe(false);

    component.formName.set('Only name');
    fixture.detectChanges();
    expect(component.canCreate()).toBe(false);

    component.formCourseId.set('course-x');
    fixture.detectChanges();
    expect(component.canCreate()).toBe(true);
    expect(
      (element.querySelector('[data-testid="project-groups-create-submit"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('onCreateSubmit is a no-op when canCreate() is false (no POST fired)', () => {
    component.onCreateClicked();
    component.formName.set(''); // invalid — name blank
    component.formCourseId.set('course-x');
    fixture.detectChanges();
    component.onCreateSubmit();
    // verify() in afterEach asserts no stray POST request was made.
    expect(component.creating()).toBe(false);
  });

  it('onCancelCreate closes + resets all form fields', () => {
    component.onCreateClicked();
    component.formName.set('Scratch');
    component.formCourseId.set('course-scratch');
    component.formMembers.set('gcid-a\ngcid-b');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="project-groups-create-form"]')).not.toBeNull();

    component.onCancelCreate();
    fixture.detectChanges();
    expect(component.createFormOpen()).toBe(false);
    expect(component.formName()).toBe('');
    expect(component.formCourseId()).toBe('');
    expect(component.formMembers()).toBe('');
    expect(element.querySelector('[data-testid="project-groups-create-form"]')).toBeNull();
  });

  it('parses comma-separated members and marks only the first as leader', () => {
    component.onCreateClicked();
    component.formName.set('Team Comma');
    component.formCourseId.set('course-dsa-101');
    component.formMembers.set('gcid-1, gcid-2 , gcid-3');
    fixture.detectChanges();

    component.onCreateSubmit();

    const post = httpMock.expectOne((r) => r.method === 'POST' && r.url === PG_URL);
    expect(post.request.body).toEqual({
      course_id: 'course-dsa-101',
      name: 'Team Comma',
      members: [
        { gcid: 'gcid-1', role: 'leader' },
        { gcid: 'gcid-2', role: 'member' },
        { gcid: 'gcid-3', role: 'member' },
      ],
    });
    post.flush({
      id: 'pg-comma',
      tenant_id: 'tenant-001',
      course_id: 'course-dsa-101',
      name: 'Team Comma',
      state: 'FORMING',
      members: [{ gcid: 'gcid-1', role: 'leader' }],
      created_at: '2026-06-02T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    });
    fixture.detectChanges();
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: STUB_GROUPS });
    fixture.detectChanges();
  });
});

describe('ProjectGroupsComponent — loading state', () => {
  it('renders the loading placeholder before the initial GET resolves', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectGroupsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectGroupsComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    // GET is in-flight, data() === null → isLoading() true.
    expect(fixture.componentInstance.isLoading()).toBe(true);
    expect(element.querySelector('[data-testid="project-groups-loading"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="project-groups-empty"]')).toBeNull();

    // Resolve so the pipe completes and verify() stays clean.
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: [] });
    fixture.detectChanges();
    expect(fixture.componentInstance.isLoading()).toBe(false);
    httpMock.verify();
  });
});

describe('ProjectGroupsComponent — list fetch error', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectGroupsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    fixture = TestBed.createComponent(ProjectGroupsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url === PG_URL)
      .flush(
        { message: 'tenant scope unavailable' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('surfaces the list fetch failure in a role="alert" header panel', () => {
    const alert = element.querySelector('[data-testid="project-groups-error"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('503');
    expect(alert?.textContent).toContain('tenant scope unavailable');
  });

  it('exposes the fetch error via listError() and clears loading', () => {
    const c = fixture.componentInstance;
    expect(c.isLoading()).toBe(false);
    expect(c.listError()).toContain('503');
    expect(c.errorMessage()).toContain('503');
    expect(c.groupCount()).toBe(0);
    // The grid renders the empty fallback (groups() is [] on error).
    expect(element.querySelector('[data-testid="project-groups-empty"]')).not.toBeNull();
  });
});

describe('ProjectGroupsComponent — course filter', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  const FILTERED_URL = `${PG_URL}?course_id=course-dsa-101`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectGroupsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ course_id: 'course-dsa-101' }),
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ProjectGroupsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url === FILTERED_URL)
      .flush({ items: STUB_GROUPS });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('passes ?course_id= through to the list GET', () => {
    // setup() above asserts the filtered URL was the one requested.
    expect(fixture.componentInstance.groupCount()).toBe(2);
  });

  it('onCreateClicked seeds the course id from the active filter', () => {
    const c = fixture.componentInstance;
    expect(c.formCourseId()).toBe('');
    c.onCreateClicked();
    expect(c.createFormOpen()).toBe(true);
    expect(c.formCourseId()).toBe('course-dsa-101');
  });
});

describe('ProjectGroupsComponent — card rendering', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  const GRADED: WireGroup = {
    id: 'pg-graded',
    tenant_id: 'tenant-001',
    course_id: 'course-dsa-101',
    name: 'Team Graded',
    state: 'GRADED',
    members: [
      { gcid: 'gcid-aaaaaaaaaaaaaa', role: 'leader' },
      { gcid: 'short', role: 'member' },
    ],
    submitted_at: '2026-05-26T12:00:00Z',
    score_pct: 87,
    grader_gcid: 'gcid-grader',
    graded_at: '2026-05-27T09:00:00Z',
    feedback: 'Strong systems design, tighten the API contract.',
    created_at: '2026-05-25T10:00:00Z',
    updated_at: '2026-05-27T09:00:00Z',
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup([STUB_GROUPS[0], STUB_GROUPS[1], GRADED]);
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders the state badge with the state-specific class + i18n key', () => {
    const badge = element.querySelector('[data-testid="project-group-state-pg-001"]');
    expect(badge?.className).toContain('badge-active');
    expect(badge?.textContent).toContain('rplus.projectGroups.state.ACTIVE');
  });

  it('renders the member count meta for each card', () => {
    const members = element.querySelector('[data-testid="project-group-members-pg-001"]');
    expect(members?.textContent?.trim()).toBe('2');
  });

  it('renders the score meta only on a GRADED group', () => {
    const score = element.querySelector('[data-testid="project-group-score-pg-graded"]');
    expect(score?.textContent).toContain('87%');
    // ACTIVE group has no score meta.
    expect(element.querySelector('[data-testid="project-group-score-pg-001"]')).toBeNull();
  });

  it('renders the feedback block only when feedback is present', () => {
    const fb = element.querySelector('[data-testid="project-group-feedback-pg-graded"]');
    expect(fb?.textContent).toContain('Strong systems design');
    expect(element.querySelector('[data-testid="project-group-feedback-pg-001"]')).toBeNull();
  });

  it('renders the submitted-at meta for submitted/graded groups', () => {
    expect(element.querySelector('[data-testid="project-group-submitted-pg-002"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="project-group-submitted-pg-001"]')).toBeNull();
  });

  it('renders the SUBMIT CTA only on the ACTIVE group', () => {
    expect(element.querySelector('[data-testid="project-group-submit-pg-001"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="project-group-submit-pg-002"]')).toBeNull();
  });

  it('renders the GRADE CTA only on the SUBMITTED group', () => {
    expect(element.querySelector('[data-testid="project-group-grade-pg-002"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="project-group-grade-pg-001"]')).toBeNull();
  });

  it('renders the no-action placeholder on a GRADED (terminal) group', () => {
    expect(
      element.querySelector('[data-testid="project-group-no-action-pg-graded"]'),
    ).not.toBeNull();
    // ACTIVE/SUBMITTED groups have an action CTA, not the placeholder.
    expect(element.querySelector('[data-testid="project-group-no-action-pg-001"]')).toBeNull();
  });

  it('truncates a long gcid to 8 chars + ellipsis, leaves short ones intact', () => {
    const c = fixture.componentInstance;
    expect(c.shortGcid('gcid-aaaaaaaaaaaaaa')).toBe('gcid-aaa…');
    expect(c.shortGcid('short')).toBe('short');
    // boundary: exactly 12 chars stays untouched.
    expect(c.shortGcid('twelvecharss')).toBe('twelvecharss');
  });

  it('helper getters proxy the model predicates', () => {
    const c = fixture.componentInstance;
    const active = c.groups().find((g) => g.id === 'pg-001')!;
    const submitted = c.groups().find((g) => g.id === 'pg-002')!;
    const graded = c.groups().find((g) => g.id === 'pg-graded')!;
    expect(c.canSubmitGroup(active)).toBe(true);
    expect(c.canGradeGroup(active)).toBe(false);
    expect(c.canGradeGroup(submitted)).toBe(true);
    expect(c.canSubmitGroup(submitted)).toBe(false);
    expect(c.canSubmitGroup(graded)).toBe(false);
    expect(c.canGradeGroup(graded)).toBe(false);
    expect(c.badgeClass(graded)).toBe('badge-graded');
    expect(c.stateIcon(graded)).toBe('fa-square-check');
  });
});

describe('ProjectGroupsComponent — submit FSM advance', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: ProjectGroupsComponent;
  const SUBMIT_URL = `${PG_URL}/pg-001/submit`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('POSTs to /{id}/submit, marks pending then refetches on success', () => {
    const btn = element.querySelector(
      '[data-testid="project-group-submit-pg-001"]',
    ) as HTMLButtonElement;
    btn.click();

    // pending → CTA disabled while the POST is in-flight.
    expect(component.isPending('pg-001')).toBe(true);
    fixture.detectChanges();
    expect(
      (element.querySelector('[data-testid="project-group-submit-pg-001"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    const post = httpMock.expectOne((r) => r.method === 'POST' && r.url === SUBMIT_URL);
    expect(post.request.body).toEqual({});
    post.flush({
      ...STUB_GROUPS[0],
      state: 'SUBMITTED',
      submitted_at: '2026-06-02T00:00:00Z',
    });

    // success → clear pending + reloadKey bump → refetch.
    expect(component.isPending('pg-001')).toBe(false);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: STUB_GROUPS });
    fixture.detectChanges();
    expect(component.errorMessage()).toBeNull();
  });

  it('surfaces a loud action error and clears pending when submit fails', () => {
    component.submit(component.groups().find((g) => g.id === 'pg-001')!);
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === SUBMIT_URL)
      .flush({ error: 'group not active' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(component.isPending('pg-001')).toBe(false);
    const alert = element.querySelector('[data-testid="project-groups-error"]');
    expect(alert?.textContent).toContain('409');
    expect(alert?.textContent).toContain('group not active');
    // No refetch fired (verify() asserts no stray GET).
  });

  it('submit() is a no-op for a non-ACTIVE group (no POST)', () => {
    const submitted = component.groups().find((g) => g.id === 'pg-002')!;
    component.submit(submitted);
    // verify() asserts no /submit POST was issued.
    expect(component.isPending('pg-002')).toBe(false);
  });

  it('submit() is a no-op while the same group is already pending', () => {
    const active = component.groups().find((g) => g.id === 'pg-001')!;
    component.submit(active);
    const first = httpMock.expectOne((r) => r.method === 'POST' && r.url === SUBMIT_URL);
    // Second call while pending must not fire a second POST.
    component.submit(active);
    first.flush({ ...STUB_GROUPS[0], state: 'SUBMITTED' });
    fixture.detectChanges();
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: STUB_GROUPS });
    fixture.detectChanges();
  });
});

describe('ProjectGroupsComponent — grade FSM advance', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: ProjectGroupsComponent;
  const GRADE_URL = `${PG_URL}/pg-002/grade`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('POSTs the placeholder 100% grade payload and refetches on success', () => {
    const btn = element.querySelector(
      '[data-testid="project-group-grade-pg-002"]',
    ) as HTMLButtonElement;
    btn.click();

    const post = httpMock.expectOne((r) => r.method === 'POST' && r.url === GRADE_URL);
    expect(post.request.body).toEqual({ score_pct: 100, feedback: '' });
    post.flush({
      ...STUB_GROUPS[1],
      state: 'GRADED',
      score_pct: 100,
      graded_at: '2026-06-02T00:00:00Z',
    });

    expect(component.isPending('pg-002')).toBe(false);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: STUB_GROUPS });
    fixture.detectChanges();
    expect(component.errorMessage()).toBeNull();
  });

  it('surfaces a loud action error and clears pending when grade fails', () => {
    component.grade(component.groups().find((g) => g.id === 'pg-002')!);
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === GRADE_URL)
      .flush('plain text failure', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    fixture.detectChanges();

    expect(component.isPending('pg-002')).toBe(false);
    const alert = element.querySelector('[data-testid="project-groups-error"]');
    expect(alert?.textContent).toContain('500');
    expect(alert?.textContent).toContain('plain text failure');
  });

  it('grade() is a no-op for a non-SUBMITTED group (no POST)', () => {
    const active = component.groups().find((g) => g.id === 'pg-001')!;
    component.grade(active);
    expect(component.isPending('pg-001')).toBe(false);
  });

  it('grade() is a no-op while the same group is already pending (no second POST)', () => {
    const submitted = component.groups().find((g) => g.id === 'pg-002')!;
    component.grade(submitted);
    const first = httpMock.expectOne((r) => r.method === 'POST' && r.url === GRADE_URL);
    // Second grade() while the first POST is in-flight must short-circuit on
    // the isPending(g.id) guard — no second POST is fired.
    component.grade(submitted);
    expect(component.isPending('pg-002')).toBe(true);
    first.flush({
      ...STUB_GROUPS[1],
      state: 'GRADED',
      score_pct: 100,
      graded_at: '2026-06-02T00:00:00Z',
    });
    fixture.detectChanges();
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: STUB_GROUPS });
    fixture.detectChanges();
    expect(component.isPending('pg-002')).toBe(false);
  });
});

describe('ProjectGroupsComponent — onCreateClicked course-id seeding arms', () => {
  function build(routeCourseId?: string): ProjectGroupsComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectGroupsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(routeCourseId ? { course_id: routeCourseId } : {}),
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectGroupsComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const url = routeCourseId ? `${PG_URL}?course_id=${encodeURIComponent(routeCourseId)}` : PG_URL;
    httpMock.expectOne((r) => r.method === 'GET' && r.url === url).flush({ items: [] });
    fixture.detectChanges();
    httpMock.verify();
    return fixture.componentInstance;
  }

  it('does NOT seed the course id when there is no active route filter', () => {
    // courseId is undefined → the `if (this.courseId && ...)` guard short-
    // circuits on the falsy first operand. formCourseId stays empty.
    const c = build(undefined);
    expect(c.formCourseId()).toBe('');
    c.onCreateClicked();
    expect(c.createFormOpen()).toBe(true);
    expect(c.formCourseId()).toBe('');
  });

  it('does NOT overwrite a course id the user already typed (second-operand false)', () => {
    // courseId present (truthy first operand) but formCourseId already has a
    // value → `formCourseId().trim().length === 0` is FALSE, so the seed is
    // skipped and the user's value is preserved.
    const c = build('course-route-101');
    c.formCourseId.set('course-user-typed');
    c.onCreateClicked();
    expect(c.createFormOpen()).toBe(true);
    expect(c.formCourseId()).toBe('course-user-typed');
  });
});

describe('ProjectGroupsComponent — describeHttpError arms', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: ProjectGroupsComponent;
  const SUBMIT_URL = `${PG_URL}/pg-001/submit`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('renders the bare auto-generated message (no "status —" prefix) on a status-0 network error', () => {
    // A transport-level failure yields HttpErrorResponse.status === 0, so the
    // `status ?? 0` keeps 0 AND the final `status ? ... : message` ternary
    // takes the FALSE arm → bare message, no "<status> —" prefix.
    component.submit(component.groups().find((g) => g.id === 'pg-001')!);
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === SUBMIT_URL)
      .error(new ProgressEvent('error'));
    fixture.detectChanges();

    const msg = component.errorMessage();
    expect(msg).not.toBeNull();
    expect(msg).not.toContain('0 —');
    expect(component.isPending('pg-001')).toBe(false);
  });

  it('falls back to the HttpErrorResponse.message when the object body has neither message nor error', () => {
    // body is an object lacking `message` and `error` keys → the
    // `body.message ?? body.error ?? message` chain falls through to the
    // existing `err.message`. status is non-zero so the prefix is present.
    component.submit(component.groups().find((g) => g.id === 'pg-001')!);
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === SUBMIT_URL)
      .flush({ detail: 'opaque', code: 7 }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    const alert = element.querySelector('[data-testid="project-groups-error"]');
    expect(alert?.textContent).toContain('422');
    // Neither the detail nor code leaked in as the message body source.
    expect(alert?.textContent).not.toContain('opaque');
  });

  it('uses the HttpErrorResponse.message when the body is null (object/string branches both skipped)', () => {
    // body === null → `if (body && ...)` is false AND
    // `else if (typeof body === 'string' ...)` is false → message stays as
    // the auto-generated err.message. status non-zero → prefixed.
    component.submit(component.groups().find((g) => g.id === 'pg-001')!);
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === SUBMIT_URL)
      .flush(null, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    const alert = element.querySelector('[data-testid="project-groups-error"]');
    expect(alert?.textContent).toContain('400');
  });

  it('ignores a whitespace-only string body and keeps the auto-generated message', () => {
    // body is a string but `body.trim()` is empty → the
    // `typeof body === 'string' && body.trim()` short-circuits on the falsy
    // trim() → message stays as err.message.
    component.submit(component.groups().find((g) => g.id === 'pg-001')!);
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === SUBMIT_URL)
      .flush('   ', { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();

    const alert = element.querySelector('[data-testid="project-groups-error"]');
    expect(alert?.textContent).toContain('502');
    expect(component.isPending('pg-001')).toBe(false);
  });
});

describe('ProjectGroupsComponent — loading skeletons (CHO-1830)', () => {
  // Build a fixture with the initial list GET still in flight so
  // data() === null → isLoading() true (skeletons visible).
  function buildLoading(): {
    fixture: ComponentFixture<ProjectGroupsComponent>;
    httpMock: HttpTestingController;
    element: HTMLElement;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectGroupsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectGroupsComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // initial GET in-flight, not yet flushed
    return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
  }

  it('renders skeleton cards (not a text placeholder) while the initial GET is in flight', () => {
    const { fixture, httpMock, element } = buildLoading();

    const loading = element.querySelector('[data-testid="project-groups-loading"]');
    expect(loading).not.toBeNull();
    // Skeleton container announces itself as a busy live region for SR users.
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(loading?.getAttribute('aria-live')).toBe('polite');
    // Several pulse skeleton cards render — NOT the old single text node.
    const skeletons = element.querySelectorAll('.project-groups__skeleton-card');
    expect(skeletons.length).toBeGreaterThan(0);
    // Loading is visually distinct from the genuinely-empty state.
    expect(element.querySelector('[data-testid="project-groups-empty"]')).toBeNull();

    // Resolve so the pipe completes and verify() stays clean.
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: [] });
    fixture.detectChanges();
    httpMock.verify();
  });

  it('marks the skeleton cards decorative (aria-hidden) so SR users hear only the busy region', () => {
    const { fixture, httpMock, element } = buildLoading();

    const skeletons = Array.from(element.querySelectorAll('.project-groups__skeleton-card'));
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(true);

    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: [] });
    fixture.detectChanges();
    httpMock.verify();
  });
});

describe('ProjectGroupsComponent — list error retry (CHO-1830)', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectGroupsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    fixture = TestBed.createComponent(ProjectGroupsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url === PG_URL)
      .flush(
        { message: 'tenant scope unavailable' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders a retry button inside the fail-loud error banner on a list-fetch failure', () => {
    const alert = element.querySelector('[data-testid="project-groups-error"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    const retry = element.querySelector('[data-testid="project-groups-retry"]');
    expect(retry).not.toBeNull();
    expect(retry?.tagName).toBe('BUTTON');
  });

  it('retry re-triggers the list GET and renders the recovered groups on success', () => {
    const retry = element.querySelector(
      '[data-testid="project-groups-retry"]',
    ) as HTMLButtonElement;
    expect(retry).not.toBeNull();
    retry.click();

    // reloadKey bump → toObservable effect re-emits on the next CD tick → GET.
    fixture.detectChanges();
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: STUB_GROUPS });
    fixture.detectChanges();

    // Error cleared; the canonical groups now render.
    expect(fixture.componentInstance.listError()).toBeNull();
    expect(element.querySelector('[data-testid="project-groups-error"]')).toBeNull();
    expect(element.querySelectorAll('[data-testid^="project-group-card-"]').length).toBe(2);
  });

  it('onRetry() bumps the reload trigger and re-fetches the list', () => {
    fixture.componentInstance.onRetry();
    fixture.detectChanges();
    httpMock.expectOne((r) => r.method === 'GET' && r.url === PG_URL).flush({ items: [] });
    fixture.detectChanges();
    expect(fixture.componentInstance.listError()).toBeNull();
  });
});

describe('ProjectGroupsComponent — action error has no list-retry (CHO-1830)', () => {
  let fixture: ComponentFixture<ProjectGroupsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: ProjectGroupsComponent;
  const SUBMIT_URL = `${PG_URL}/pg-001/submit`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup(); // list loads OK with STUB_GROUPS
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('shows the error banner but NOT the list-retry button when a submit action fails', () => {
    component.submit(component.groups().find((g) => g.id === 'pg-001')!);
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === SUBMIT_URL)
      .flush({ error: 'group not active' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    // Action error surfaces loud in the shared banner...
    const alert = element.querySelector('[data-testid="project-groups-error"]');
    expect(alert?.textContent).toContain('409');
    // ...but a *list* retry is meaningless for an action error, so it is hidden.
    expect(element.querySelector('[data-testid="project-groups-retry"]')).toBeNull();
  });
});
