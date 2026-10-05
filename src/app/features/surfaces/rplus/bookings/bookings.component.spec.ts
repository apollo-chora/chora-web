/**
 * BookingsComponent spec - R+ /r/bookings (CHO-2336 picker rewrite).
 *
 * The create form no longer holds two raw free-text ID inputs. It now composes
 * two pickers so a trainer never hand-types a UUID:
 *   - a CLASS dropdown sourced from the durable ScheduledClass list
 *     (BookingsService.listBookableClasses → GET /v1/scheduling/classes); the
 *     picked option id is the exact class_id the booking POST resolves.
 *   - the SHARED `chora-member-multiselect` (reused from the offering roster
 *     bulk-enrol checklist, capped to a single learner); the ticked gcid is the
 *     learner_gcid.
 *
 * Real BFF wiring via HttpTestingController for BookingsService (no service
 * mocks per feedback_no_stubs_real_wiring); the member picker's directory is
 * stubbed exactly as the sibling offering-workspace spec does, so the reused
 * checklist never issues an unflushed tenant-members GET. setup() flushes both
 * init GETs (empty bookings list + one scheduled class) so each test starts
 * from a clean, hydrated state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { BookingsComponent } from './bookings.component';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { MemberDirectoryService } from '../../../../shared/components/member-multiselect/member-directory.service';
import type { TenantMemberSummary } from '../assessments/assessment-instantiation/assessment-instantiation.model';
import { environment } from '../../../../../environments/environment';

const bff = environment.bffBaseUrl;

const G1 = '018f0000-0000-7000-8000-000000000001';
const G2 = '018f0000-0000-7000-8000-000000000002';

function backendBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-001',
    class_id: 'cls-1',
    course_id: 'course-cspo',
    tenant_id: 'tenant-001',
    learner_gcid: G1,
    status: 'pending',
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
    ...overrides,
  };
}

function backendClass(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cls-1',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-chen',
    room: 'MTM HQ Room 401',
    starts_at: '2026-05-19T09:00:00+00:00',
    ends_at: '2026-05-19T12:00:00+00:00',
    max_capacity: 25,
    ...overrides,
  };
}

function learner(gcid: string, displayName: string, email: string): TenantMemberSummary {
  return {
    gcid,
    email,
    display_name: displayName,
    avatar_url: null,
    roles: ['LEARNER'],
    last_active_at: '2026-07-20T00:00:00Z',
  };
}

const LEARNERS: readonly TenantMemberSummary[] = [
  learner(G1, 'Alice Learner', 'alice@example.com'),
  learner(G2, 'Bob Learner', 'bob@example.com'),
];

/** Configure a fresh TestBed with the picker's stubbed member directory. */
function configure(opts: { learners?: readonly TenantMemberSummary[]; setTenant?: boolean } = {}): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BookingsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: MemberDirectoryService,
        useValue: { listMembers: () => of(opts.learners ?? LEARNERS) },
      },
    ],
  });
  if (opts.setTenant !== false) {
    TestBed.inject(TenantContextService).setCurrentTenant({
      id: 'tenant-001',
      name: 'MTM Singapore',
      slug: 'mtm',
      logoUrl: null,
    });
  }
}

/** Flush the bookings-list init GET. */
function flushBookings(http: HttpTestingController, body: unknown = { items: [], total: 0 }): void {
  http.expectOne(`${bff}/api/bookings`).flush(body as object);
}

/** Flush the scheduling-classes init GET (the class-picker source). */
function flushClasses(http: HttpTestingController, classes: readonly unknown[] = [backendClass()]): void {
  http.expectOne(`${bff}/v1/scheduling/classes`).flush({ items: classes } as object);
}

interface Harness {
  fixture: ComponentFixture<BookingsComponent>;
  component: BookingsComponent;
  httpMock: HttpTestingController;
  element: HTMLElement;
}

function setup(opts: { classes?: readonly unknown[]; bookings?: unknown } = {}): Harness {
  configure();
  const fixture = TestBed.createComponent(BookingsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  flushBookings(httpMock, opts.bookings);
  flushClasses(httpMock, opts.classes);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
  };
}

/** Drive the native class dropdown to a given option (the ScheduledClass id). */
function pickClass(element: HTMLElement, classId: string): void {
  const select = element.querySelector<HTMLSelectElement>('[data-testid="bookings-class-picker"]')!;
  select.value = classId;
  select.dispatchEvent(new Event('change'));
}

/** Tick a learner in the reused member-multiselect checklist. */
function pickLearner(element: HTMLElement, gcid: string): void {
  const checkbox = element.querySelector<HTMLInputElement>(
    `[data-testid="member-multiselect-option-${gcid}"]`,
  )!;
  checkbox.dispatchEvent(new Event('change'));
}

describe('BookingsComponent', () => {
  let fixture: ComponentFixture<BookingsComponent>;
  let component: BookingsComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    const built = setup();
    fixture = built.fixture;
    component = built.component;
    httpMock = built.httpMock;
    element = built.element;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const root = element.querySelector('[data-testid="rplus-bookings"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('uses a semantic <section> root', () => {
      const root = element.querySelector('[data-testid="rplus-bookings"]');
      expect(root?.tagName).toBe('SECTION');
    });
  });

  describe('header', () => {
    it('shows the current tenant name from TenantContextService', () => {
      const tenant = element.querySelector('[data-testid="bookings-tenant"]');
      expect(tenant?.textContent).toContain('MTM Singapore');
    });

    it('starts with a total count of 0 after an empty hydration', () => {
      const total = element.querySelector('[data-testid="bookings-total"]');
      expect(total?.textContent).toContain('0');
    });
  });

  describe('empty state', () => {
    it('renders the empty-state message when the hydrated list is empty', () => {
      const empty = element.querySelector('[data-testid="bookings-empty"]');
      expect(empty).not.toBeNull();
    });
  });

  describe('create form - pickers (CHO-2336)', () => {
    it('replaces the raw class-id / learner-gcid text inputs with pickers', () => {
      // The hand-typed UUID inputs are gone.
      expect(element.querySelector('[data-testid="bookings-class-id"]')).toBeNull();
      expect(element.querySelector('[data-testid="bookings-learner-gcid"]')).toBeNull();
      // Replaced by a class dropdown + the reused member checklist.
      expect(element.querySelector('[data-testid="bookings-class-picker"]')?.tagName).toBe('SELECT');
      expect(element.querySelector('chora-member-multiselect')).not.toBeNull();
    });

    it('renders one class option per bookable class (excluding the placeholder)', () => {
      const select = element.querySelector<HTMLSelectElement>('[data-testid="bookings-class-picker"]')!;
      const realOptions = [...select.querySelectorAll('option')].filter((o) => o.value !== '');
      expect(realOptions).toHaveLength(1);
      expect(realOptions[0]!.value).toBe('cls-1');
    });

    it('updates selectedClassId when the class dropdown changes', () => {
      pickClass(element, 'cls-1');
      fixture.detectChanges();
      expect(component.selectedClassId()).toBe('cls-1');
    });

    it('resolves a ticked learner to learner_gcid via the reused member picker', () => {
      pickLearner(element, G2);
      fixture.detectChanges();
      expect(component.selectedLearnerGcid()).toBe(G2);
    });

    it('clears learner_gcid when the checklist selection is emptied', () => {
      pickLearner(element, G1);
      fixture.detectChanges();
      expect(component.selectedLearnerGcid()).toBe(G1);
      // Untick the same learner - the checklist emits an empty selection.
      pickLearner(element, G1);
      fixture.detectChanges();
      expect(component.selectedLearnerGcid()).toBe('');
    });

    it('keeps the Create CTA disabled until BOTH a class and a learner are picked', () => {
      const cta = element.querySelector<HTMLButtonElement>('[data-testid="bookings-create-cta"]')!;
      expect(cta.disabled).toBe(true);

      pickClass(element, 'cls-1');
      fixture.detectChanges();
      expect(cta.disabled).toBe(true); // learner still unpicked

      pickLearner(element, G1);
      fixture.detectChanges();
      expect(cta.disabled).toBe(false); // both now selected
    });

    it('POSTs the resolved class_id + learner_gcid and prepends the created row', () => {
      pickClass(element, 'cls-1');
      pickLearner(element, G1);
      fixture.detectChanges();

      component.onCreate();
      const req = httpMock.expectOne(`${bff}/api/bookings`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ class_id: 'cls-1', learner_gcid: G1 });
      req.flush(backendBooking());
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="bookings-row-booking-001"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="bookings-total"]')?.textContent).toContain('1');
    });

    it('does nothing (no HTTP) when nothing is selected', () => {
      component.onCreate();
      httpMock.expectNone(`${bff}/api/bookings`);
      expect(component.busy()).toBe(false);
    });

    it('canCreate is false while only a class is selected', () => {
      component.selectedClassId.set('cls-1');
      fixture.detectChanges();
      expect(component.canCreate()).toBe(false);
    });

    it('canCreate is false while only a learner is selected', () => {
      component.selectedLearnerGcid.set(G1);
      fixture.detectChanges();
      expect(component.canCreate()).toBe(false);
    });

    it('resets both pickers after a successful create', () => {
      pickClass(element, 'cls-1');
      pickLearner(element, G1);
      fixture.detectChanges();
      const nonceBefore = component.learnerPickerNonce();
      // The learner is genuinely ticked before the create.
      expect(
        element.querySelector<HTMLInputElement>(`[data-testid="member-multiselect-option-${G1}"]`)!.checked,
      ).toBe(true);

      component.onCreate();
      httpMock.expectOne(`${bff}/api/bookings`).flush(backendBooking());
      fixture.detectChanges();

      expect(component.selectedClassId()).toBe('');
      expect(component.selectedLearnerGcid()).toBe('');
      // The shared checklist reads its selection only at init, so the nonce
      // parity flip re-mounts it - the previously ticked learner is now clear.
      expect(component.learnerPickerNonce()).toBe(nonceBefore + 1);
      expect(
        element.querySelector<HTMLInputElement>(`[data-testid="member-multiselect-option-${G1}"]`)!.checked,
      ).toBe(false);
      const cta = element.querySelector<HTMLButtonElement>('[data-testid="bookings-create-cta"]')!;
      expect(cta.disabled).toBe(true);
    });
  });

  describe('class picker load states', () => {
    it('shows the loading hint while the scheduling GET is in flight', () => {
      configure();
      const localFixture = TestBed.createComponent(BookingsComponent);
      const localHttp = TestBed.inject(HttpTestingController);
      // Flush bookings but leave the scheduling GET pending.
      flushBookings(localHttp);
      localFixture.detectChanges();

      expect(localFixture.componentInstance.classLoadState()).toBe('loading');
      const el = localFixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="bookings-class-loading"]')).not.toBeNull();

      flushClasses(localHttp, []);
      localFixture.detectChanges();
      localHttp.verify();
      httpMock = localHttp;
    });

    it('shows a fail-loud class-picker error with a retry that refetches', () => {
      configure();
      const localFixture = TestBed.createComponent(BookingsComponent);
      const localHttp = TestBed.inject(HttpTestingController);
      flushBookings(localHttp);
      localHttp
        .expectOne(`${bff}/v1/scheduling/classes`)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      localFixture.detectChanges();

      const cmp = localFixture.componentInstance;
      const el = localFixture.nativeElement as HTMLElement;
      expect(cmp.classLoadState()).toBe('error');
      const retry = el.querySelector<HTMLButtonElement>('[data-testid="bookings-class-retry"]');
      expect(retry).not.toBeNull();

      retry!.click();
      localFixture.detectChanges();
      flushClasses(localHttp);
      localFixture.detectChanges();

      expect(cmp.classLoadState()).toBe('loaded');
      expect(cmp.classOptions()).toHaveLength(1);
      localHttp.verify();
      httpMock = localHttp;
    });

    it('disables the dropdown and shows an empty hint when no classes are scheduled', () => {
      const built = setup({ classes: [] });
      expect(built.component.classLoadState()).toBe('loaded');
      expect(built.component.classOptions()).toHaveLength(0);
      const select = built.element.querySelector<HTMLSelectElement>('[data-testid="bookings-class-picker"]')!;
      expect(select.disabled).toBe(true);
      expect(built.element.querySelector('[data-testid="bookings-class-empty"]')).not.toBeNull();
      httpMock = built.httpMock;
    });
  });

  describe('hydration on init', () => {
    it('GETs /api/bookings on construction and renders the returned rows', () => {
      configure();
      const localFixture = TestBed.createComponent(BookingsComponent);
      const localHttp = TestBed.inject(HttpTestingController);
      const req = localHttp.expectOne(`${bff}/api/bookings`);
      expect(req.request.method).toBe('GET');
      req.flush({ items: [backendBooking()], total: 1 });
      flushClasses(localHttp);
      localFixture.detectChanges();

      const el = localFixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="bookings-row-booking-001"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="bookings-total"]')?.textContent).toContain('1');
      localHttp.verify();
      httpMock = localHttp;
    });
  });

  describe('status update', () => {
    function createPendingBooking(): void {
      component.selectedClassId.set('cls-1');
      component.selectedLearnerGcid.set(G1);
      fixture.detectChanges();
      component.onCreate();
      httpMock.expectOne(`${bff}/api/bookings`).flush(backendBooking());
      fixture.detectChanges();
    }

    it('renders a status <select> per row', () => {
      createPendingBooking();
      const select = element.querySelector('[data-testid="bookings-status-select-booking-001"]');
      expect(select?.tagName).toBe('SELECT');
    });

    it('PATCHes /api/bookings/{id}/status and updates the row in place', () => {
      createPendingBooking();

      component.onStatusChange(component.items()[0]!, 'confirmed');
      const req = httpMock.expectOne(`${bff}/api/bookings/booking-001/status`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'confirmed' });
      req.flush(backendBooking({ status: 'confirmed' }));
      fixture.detectChanges();

      expect(component.items()[0]!.status).toBe('confirmed');
    });

    it('ignores a no-op status change (same status - no HTTP call)', () => {
      createPendingBooking();
      component.onStatusChange(component.items()[0]!, 'pending');
      httpMock.expectNone(`${bff}/api/bookings/booking-001/status`);
    });
  });

  describe('error handling', () => {
    it('surfaces a fail-loud banner on a 409 over-capacity rejection', () => {
      component.selectedClassId.set('cls-full');
      component.selectedLearnerGcid.set(G1);
      fixture.detectChanges();
      component.onCreate();
      httpMock
        .expectOne(`${bff}/api/bookings`)
        .flush({ error: 'class at capacity' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="bookings-mutation-error"]');
      expect(banner).not.toBeNull();
      expect(component.errorMessage()).toContain('capacity');
    });

    it('dismisses the mutation error banner on demand', () => {
      component.errorMessage.set('boom');
      fixture.detectChanges();
      component.dismissError();
      fixture.detectChanges();
      expect(component.errorMessage()).toBeNull();
      expect(element.querySelector('[data-testid="bookings-mutation-error"]')).toBeNull();
    });

    it('surfaces the "Class not found" banner on a 404 and preserves the selection', () => {
      component.selectedClassId.set('cls-ghost');
      component.selectedLearnerGcid.set(G1);
      fixture.detectChanges();

      component.onCreate();
      httpMock
        .expectOne(`${bff}/api/bookings`)
        .flush({ error: 'unknown class' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(component.errorMessage()).toContain('Class not found');
      expect(component.busy()).toBe(false);
      // A failed create keeps the picks so the trainer can retry.
      expect(component.selectedClassId()).toBe('cls-ghost');
      expect(component.selectedLearnerGcid()).toBe(G1);
    });
  });

  describe('a11y', () => {
    it('renders a heading per surface', () => {
      const heading = element.querySelector('h1');
      expect(heading).not.toBeNull();
    });

    it('has zero critical/serious WCAG violations', async () => {
      const axe = (await import('axe-core')).default;
      // Scope to this screen's OWN markup and exclude the reused
      // `chora-member-multiselect` - it owns its own a11y (and is composed here
      // unmodified per the CHO-2336 reuse directive), so its internal markup is
      // not this component's to assert or fix.
      const results = await axe.run({
        include: [['[data-testid="rplus-bookings"]']],
        exclude: [['chora-member-multiselect']],
      });
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });

  describe('loading state (bookings list)', () => {
    it('renders skeleton cards (not the empty-state) while the init GET is in flight', () => {
      configure();
      const localFixture = TestBed.createComponent(BookingsComponent);
      const localHttp = TestBed.inject(HttpTestingController);
      localFixture.detectChanges();

      expect(localFixture.componentInstance.loadState()).toBe('loading');
      const el = localFixture.nativeElement as HTMLElement;
      const loading = el.querySelector('[data-testid="bookings-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      expect(el.querySelector('[data-testid="bookings-empty"]')).toBeNull();

      flushBookings(localHttp);
      flushClasses(localHttp);
      localFixture.detectChanges();
      expect(localFixture.componentInstance.loadState()).toBe('loaded');
      expect(el.querySelector('[data-testid="bookings-empty"]')).not.toBeNull();
      localHttp.verify();
      httpMock = localHttp;
    });
  });

  describe('hydration error path (bookings list)', () => {
    function buildFailedLoad(): {
      localFixture: ComponentFixture<BookingsComponent>;
      localHttp: HttpTestingController;
      el: HTMLElement;
    } {
      configure();
      const localFixture = TestBed.createComponent(BookingsComponent);
      const localHttp = TestBed.inject(HttpTestingController);
      localFixture.detectChanges();
      localHttp
        .expectOne(`${bff}/api/bookings`)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
      flushClasses(localHttp);
      localFixture.detectChanges();
      return { localFixture, localHttp, el: localFixture.nativeElement as HTMLElement };
    }

    it('shows a fail-loud load-error banner with retry - NOT the empty-state', () => {
      const { localFixture, localHttp, el } = buildFailedLoad();
      const cmp = localFixture.componentInstance;

      expect(cmp.loadState()).toBe('error');
      expect(cmp.loadError()).toContain('500');
      expect(el.querySelector('[data-testid="bookings-error"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="bookings-retry"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="bookings-empty"]')).toBeNull();
      expect(el.querySelector('[data-testid="bookings-mutation-error"]')).toBeNull();
      localHttp.verify();
      httpMock = localHttp;
    });

    it('refetches the list when the retry button is clicked after a load error', () => {
      const { localFixture, localHttp, el } = buildFailedLoad();
      const cmp = localFixture.componentInstance;

      (el.querySelector('[data-testid="bookings-retry"]') as HTMLButtonElement).click();
      localFixture.detectChanges();

      localHttp
        .expectOne(`${bff}/api/bookings`)
        .flush({ items: [backendBooking()], total: 1 });
      localFixture.detectChanges();

      expect(cmp.loadState()).toBe('loaded');
      expect(el.querySelector('[data-testid="bookings-error"]')).toBeNull();
      expect(el.querySelector('[data-testid="bookings-row-booking-001"]')).not.toBeNull();
      localHttp.verify();
      httpMock = localHttp;
    });
  });

  describe('tenant fallback', () => {
    it('falls back to "Current tenant" when no tenant is set', () => {
      configure({ setTenant: false });
      const localFixture = TestBed.createComponent(BookingsComponent);
      const localHttp = TestBed.inject(HttpTestingController);
      flushBookings(localHttp);
      flushClasses(localHttp);
      localFixture.detectChanges();

      expect(localFixture.componentInstance.tenantName()).toBe('Current tenant');
      const tenant = (localFixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="bookings-tenant"]',
      );
      expect(tenant?.textContent).toContain('Current tenant');
      localHttp.verify();
      httpMock = localHttp;
    });
  });

  describe('status update - guards + errors', () => {
    function seedRow(status = 'pending'): void {
      component.selectedClassId.set('cls-1');
      component.selectedLearnerGcid.set(G1);
      fixture.detectChanges();
      component.onCreate();
      httpMock.expectOne(`${bff}/api/bookings`).flush(backendBooking({ status }));
      fixture.detectChanges();
    }

    it('skips the PATCH when the component is busy', () => {
      seedRow();
      component.busy.set(true);
      component.onStatusChange(component.items()[0]!, 'confirmed');
      httpMock.expectNone(`${bff}/api/bookings/booking-001/status`);
      component.busy.set(false);
    });

    it('surfaces a 409 illegal-transition banner + clears busy on failure', () => {
      seedRow();
      component.onStatusChange(component.items()[0]!, 'attended');
      httpMock
        .expectOne(`${bff}/api/bookings/booking-001/status`)
        .flush({ error: 'illegal transition' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(component.errorMessage()).toContain('capacity');
      expect(component.busy()).toBe(false);
      expect(component.items()[0]!.status).toBe('pending');
    });

    it('encodes a slashy booking id in the PATCH url', () => {
      configure();
      const localFixture = TestBed.createComponent(BookingsComponent);
      const localHttp = TestBed.inject(HttpTestingController);
      localHttp
        .expectOne(`${bff}/api/bookings`)
        .flush({ items: [backendBooking({ id: 'a/b' })], total: 1 });
      flushClasses(localHttp);
      localFixture.detectChanges();

      const cmp = localFixture.componentInstance;
      cmp.onStatusChange(cmp.items()[0]!, 'confirmed');
      const req = localHttp.expectOne(`${bff}/api/bookings/a%2Fb/status`);
      expect(req.request.method).toBe('PATCH');
      req.flush(backendBooking({ id: 'a/b', status: 'confirmed' }));
      localFixture.detectChanges();
      expect(cmp.items()[0]!.status).toBe('confirmed');
      localHttp.verify();
      httpMock = localHttp;
    });
  });

  describe('status helpers (badge / icon / labelKey)', () => {
    it('maps every status to its badge variant', () => {
      expect(component.badge('pending')).toBe('badge-warning');
      expect(component.badge('confirmed')).toBe('badge-success');
      expect(component.badge('attended')).toBe('badge-info');
      expect(component.badge('no-show')).toBe('badge-danger');
    });

    it('maps every status to its FontAwesome glyph', () => {
      expect(component.icon('pending')).toBe('fa-hourglass-half');
      expect(component.icon('confirmed')).toBe('fa-circle-check');
      expect(component.icon('attended')).toBe('fa-user-check');
      expect(component.icon('no-show')).toBe('fa-user-xmark');
    });

    it('maps every status to its i18n label key (no-show → no_show)', () => {
      expect(component.labelKey('pending')).toBe('rplus.bookings.status.pending');
      expect(component.labelKey('no-show')).toBe('rplus.bookings.status.no_show');
    });

    it('exposes the four lifecycle statuses in order', () => {
      expect(component.statuses).toEqual(['pending', 'confirmed', 'attended', 'no-show']);
    });
  });

  describe('row rendering details', () => {
    it('renders one status <select> with an option per lifecycle status', () => {
      component.selectedClassId.set('cls-1');
      component.selectedLearnerGcid.set(G1);
      fixture.detectChanges();
      component.onCreate();
      httpMock.expectOne(`${bff}/api/bookings`).flush(backendBooking());
      fixture.detectChanges();

      const select = element.querySelector('[data-testid="bookings-status-select-booking-001"]');
      const options = select?.querySelectorAll('option') ?? [];
      expect(options.length).toBe(4);
      expect(element.querySelector('[data-testid="bookings-status-booking-001"]')).not.toBeNull();
    });

    it('prepends a second created booking above the first (newest-first)', () => {
      component.selectedClassId.set('cls-a');
      component.selectedLearnerGcid.set(G1);
      fixture.detectChanges();
      component.onCreate();
      httpMock.expectOne(`${bff}/api/bookings`).flush(backendBooking({ id: 'booking-001' }));
      fixture.detectChanges();

      component.selectedClassId.set('cls-b');
      component.selectedLearnerGcid.set(G2);
      fixture.detectChanges();
      component.onCreate();
      httpMock.expectOne(`${bff}/api/bookings`).flush(backendBooking({ id: 'booking-002' }));
      fixture.detectChanges();

      expect(component.totalBookings()).toBe(2);
      expect(component.items()[0]!.id).toBe('booking-002');
      expect(component.items()[1]!.id).toBe('booking-001');
    });
  });
});
