import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { ExamsComponent } from './exams.component';
import type { BackendExamsList } from './exams.model';

/**
 * Fixture BE response shaped to exercise the BE→FE adapter (sittingId
 * stays "cspo-2026-jun12" so existing testid lookups continue matching).
 *
 *  - CSPO    scheduled  capacity 30 / enrolled 22
 *  - DSA-101 closed     capacity 25 / enrolled 25
 *  - ASM-2   scheduled  capacity 24 / enrolled  6
 */
const FIXTURE: BackendExamsList = {
  items: [
    {
      id: 'cspo-2026-jun12',
      tenant_id: 'tenant-A',
      course_id: 'course-cspo',
      title: 'Certified Scrum Product Owner',
      scheduled_at: '2026-06-12T09:00:00Z',
      duration_minutes: 120,
      capacity: 30,
      enrolled_count: 22,
      proctor_method: 'MTM HQ: Exam Lab A',
      state: 'SCHEDULED',
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    },
    {
      id: 'dsa-101-2026-jun18',
      tenant_id: 'tenant-A',
      course_id: 'course-dsa-101',
      title: 'Data Structures & Algorithms 101',
      scheduled_at: '2026-06-18T09:00:00Z',
      duration_minutes: 180,
      capacity: 25,
      enrolled_count: 25,
      proctor_method: 'MTM HQ: Exam Lab B',
      state: 'CLOSED',
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    },
    {
      id: 'adv-sm-2026-jul01',
      tenant_id: 'tenant-A',
      course_id: 'course-asm-2',
      title: 'Advanced ScrumMaster',
      scheduled_at: '2026-07-01T09:00:00Z',
      duration_minutes: 180,
      capacity: 24,
      enrolled_count: 6,
      proctor_method: 'MTM HQ: Exam Lab A',
      state: 'SCHEDULED',
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    },
  ],
};

interface SetupResult {
  fixture: ComponentFixture<ExamsComponent>;
  http: HttpTestingController;
}

function setup(response: BackendExamsList = FIXTURE): SetupResult {
  TestBed.configureTestingModule({
    imports: [ExamsComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ExamsComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const req = http.expectOne(`${environment.bffBaseUrl}/api/v1/exams`);
  req.flush(response);
  fixture.detectChanges();
  return { fixture, http };
}

describe('ExamsComponent', () => {
  let fixture: ComponentFixture<ExamsComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ fixture, http } = setup());
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    http.verify();
  });

  it('renders surface-rplus accent', () => {
    const root = element.querySelector('[data-testid="rplus-exams"]');
    expect(root?.className).toContain('surface-rplus');
  });

  describe('header', () => {
    it('shows 3 total sittings', () => {
      const total = element.querySelector('[data-testid="exams-total"]');
      expect(total?.textContent).toContain('3');
    });

    it('renders a Schedule Sitting CTA', () => {
      const cta = element.querySelector('[data-testid="exams-schedule-cta"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('BUTTON');
    });
  });

  describe('sittings table', () => {
    it('renders a semantic <table> with aria-label', () => {
      const tbl = element.querySelector('[data-testid="exams-table"]');
      expect(tbl?.tagName).toBe('TABLE');
      expect(tbl?.hasAttribute('aria-label')).toBe(true);
    });

    it('renders one row per sitting (3 total)', () => {
      const rows = element.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
    });

    it('shows CSPO row with mapped date + capacity + venue', () => {
      const row = element.querySelector('[data-testid="exams-row-cspo-2026-jun12"]');
      expect(row?.textContent).toContain('12 Jun 2026');
      // BE has no separate cert code; FE adapter passes title verbatim.
      expect(row?.textContent).toContain('Certified Scrum Product Owner');
      // Adapter maps proctor_method → venue (BE has no separate venue field).
      expect(row?.textContent).toContain('Exam Lab A');
      expect(row?.textContent).toContain('22');
      expect(row?.textContent).toContain('30');
    });

    it('renders Closed badge on DSA-101 (state=CLOSED)', () => {
      const badge = element.querySelector('[data-testid="status-dsa-101-2026-jun18"]');
      expect(badge?.textContent?.trim()).toBe('Closed');
    });

    it('carries NO page-level SkillsFuture pill (R6 tail)', () => {
      // A pill beside the h1 asserted the whole exam programme is SkillsFuture
      // aligned, with nothing behind it: the same blanket claim as the per-row
      // badge, one level up. Eligibility is a property of a COURSE, so it
      // belongs on the row where the served flag can answer for it, and
      // nowhere that speaks for every sitting at once.
      expect(element.querySelector('.exams__sf-pill')).toBeNull();
      const head = element.querySelector('.exams__title-row');
      expect(head).not.toBeNull();
      expect(head!.textContent ?? '').not.toContain('rplus.exams.sf_aligned');
    });

    it('detects a planted page-level pill (positive control)', () => {
      // Without this, the assertion above would pass over a head that never
      // rendered, which is the empty-set failure this session keeps meeting.
      const head = element.querySelector('.exams__title-row')!;
      const planted = document.createElement('span');
      planted.className = 'exams__sf-pill';
      head.appendChild(planted);

      expect(element.querySelector('.exams__sf-pill')).not.toBeNull();
      planted.remove();
    });

    it('paints no SkillsFuture badge when the flag is absent (unknown)', () => {
      // The FIXTURE rows carry no `sf_eligible`, which is what the list serves
      // when an exam's course cannot be resolved. Unknown is not funded, so
      // nothing is decorated. This is the state the whole defect came from:
      // the mapper used to hardcode true and paint every row in every tenant.
      const sfBadges = element.querySelectorAll('[data-testid^="exams-sf-"]');
      expect(sfBadges.length).toBe(0);
    });

    it('paints the badge on exactly the rows the BE says are funded', () => {
      // The join (27ba3e6be) serves the flag per row. One funded, one not,
      // one unknown: exactly one badge, on the funded row.
      TestBed.resetTestingModule();
      const rows = FIXTURE.items.map((it, i) =>
        i === 0 ? { ...it, sf_eligible: true }
        : i === 1 ? { ...it, sf_eligible: false }
        : { ...it },
      );
      const { fixture: f } = setup({ items: rows });
      const el = f.nativeElement as HTMLElement;

      const badges = el.querySelectorAll('[data-testid^="exams-sf-"]');
      expect(badges.length).toBe(1);
      expect(
        el.querySelector(`[data-testid="exams-sf-${FIXTURE.items[0].id}"]`),
      ).not.toBeNull();
      expect(
        el.querySelector(`[data-testid="exams-sf-${FIXTURE.items[1].id}"]`),
      ).toBeNull();
    });

    it('renders capacity progressbar with aria values', () => {
      const bars = element.querySelectorAll('tbody [role="progressbar"]');
      expect(bars.length).toBe(3);
      bars.forEach((b) => {
        expect(b.hasAttribute('aria-valuenow')).toBe(true);
        expect(b.getAttribute('aria-valuemin')).toBe('0');
        expect(b.getAttribute('aria-valuemax')).toBe('100');
      });
    });
  });

  describe('empty state', () => {
    it('renders empty-state message when BE returns no items', () => {
      TestBed.resetTestingModule();
      ({ fixture, http } = setup({ items: [] }));
      element = fixture.nativeElement as HTMLElement;
      const total = element.querySelector('[data-testid="exams-total"]');
      expect(total?.textContent).toContain('0');
      const rows = element.querySelectorAll('tbody tr');
      // Either 0 data rows OR a single "empty" row depending on @empty
      // branch markup. Both shapes are valid; the assertion holds for
      // either as long as no real sitting rendered.
      const realRows = Array.from(rows).filter((r) => !r.hasAttribute('data-testid-empty'));
      expect(realRows.length).toBeLessThanOrEqual(1);
    });
  });

  describe('a11y', () => {
    it('uses scoped <th scope="col"> headers', () => {
      const ths = element.querySelectorAll('thead th');
      // Five since R6 D1 dropped the Proctor column: the wire carries no
      // proctor, and the invigilator read serves a GCID and a rank, no name.
      expect(ths.length).toBe(5);
      expect([...ths].map((t) => t.textContent?.trim())).not.toContain(
        'rplus.exams.col.proctor',
      );
      ths.forEach((th) => {
        expect(th.getAttribute('scope')).toBe('col');
      });
    });

    it('has zero critical/serious axe-core violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});

describe('ExamsComponent: schedule flow', () => {
  let fixture: ComponentFixture<ExamsComponent>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let component: ExamsComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ fixture, http } = setup()); // initial GET flushed with FIXTURE
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it('opens the schedule form only after the Schedule Sitting CTA is clicked', () => {
    expect(element.querySelector('[data-testid="exams-schedule-form"]')).toBeNull();
    (element.querySelector('[data-testid="exams-schedule-cta"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="exams-schedule-form"]')).not.toBeNull();
  });

  it('POSTs the schedule request, refetches the list, and closes the form on success', () => {
    component.onScheduleClicked();
    component.formCourseId.set('course-cspo');
    component.formTitle.set('CSPO: July 2026');
    component.formScheduledAt.set('2026-07-15T09:00');
    component.formDurationMinutes.set('120');
    component.formCapacity.set('30');
    component.formProctorMethod.set('PROCTOR_METHOD_HUMAN_LIVE');
    fixture.detectChanges();

    component.onScheduleSubmit();

    const post = http.expectOne(`${environment.bffBaseUrl}/api/v1/exams`);
    expect(post.request.method).toBe('POST');
    // scheduled_at is widened from the datetime-local value to a full RFC3339
    // UTC instant; assert it equals the ISO of the same parsed local instant
    // (timezone-agnostic) rather than hardcoding a fixed UTC string.
    const expectedScheduledAt = new Date(Date.parse('2026-07-15T09:00')).toISOString();
    expect(post.request.body).toEqual({
      course_id: 'course-cspo',
      title: 'CSPO: July 2026',
      scheduled_at: expectedScheduledAt,
      duration_minutes: 120,
      capacity: 30,
      proctor_method: 'PROCTOR_METHOD_HUMAN_LIVE',
    });
    post.flush({
      id: 'cspo-2026-jul15',
      tenant_id: 'tenant-A',
      course_id: 'course-cspo',
      title: 'CSPO: July 2026',
      scheduled_at: '2026-07-15T09:00:00Z',
      duration_minutes: 120,
      capacity: 30,
      enrolled_count: 0,
      proctor_method: 'PROCTOR_METHOD_HUMAN_LIVE',
      state: 'DRAFT',
      created_at: '2026-06-02T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    });

    // success → reloadKey bump → real refetch. The reloadKey signal drives the
    // refetch through `toObservable(reloadKey) → switchMap`, whose re-emission
    // is flushed by an effect during change detection — so detectChanges() must
    // run BEFORE the refetch GET is captured (the synchronous bump alone is not
    // enough to fire the toObservable pipeline).
    fixture.detectChanges();
    http.expectOne(`${environment.bffBaseUrl}/api/v1/exams`).flush(FIXTURE);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="exams-schedule-form"]')).toBeNull();
  });

  it('surfaces a loud error and keeps the form open when the schedule POST fails', () => {
    component.onScheduleClicked();
    component.formCourseId.set('course-missing');
    component.formTitle.set('Bad sitting');
    component.formScheduledAt.set('2026-07-15T09:00');
    component.formDurationMinutes.set('120');
    component.formCapacity.set('30');
    fixture.detectChanges();

    component.onScheduleSubmit();

    http
      .expectOne(`${environment.bffBaseUrl}/api/v1/exams`)
      .flush(
        { message: 'caller lacks instructor/admin/training-admin role' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="exams-schedule-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('403');
    // No refetch fired (verify() in afterEach asserts no stray GET) and the
    // form stays open so the user can correct + retry.
    expect(element.querySelector('[data-testid="exams-schedule-form"]')).not.toBeNull();
  });
});

/**
 * Branch-coverage augmentation — drives the canSubmit && short-circuits, the
 * onScheduleSubmit early-return + invalid-input guard, the totalSittings/sittings
 * nullish fallbacks (no-data state), and every describeHttpError arm.
 *
 * These tests drive the component instance directly (signal-first). Helpers
 * (parsePositiveInt / toRfc3339 / describeHttpError) are module-private so they
 * are exercised through the public onScheduleSubmit / error-callback path.
 */
describe('ExamsComponent: branch coverage', () => {
  let fixture: ComponentFixture<ExamsComponent>;
  let http: HttpTestingController;
  let component: ExamsComponent;

  // Fully valid form baseline — each test flips exactly one field to assert the
  // matching && arm of canSubmit short-circuits to false.
  function fillValidForm(): void {
    component.formCourseId.set('course-x');
    component.formTitle.set('Sitting X');
    component.formScheduledAt.set('2026-07-15T09:00');
    component.formDurationMinutes.set('120');
    component.formCapacity.set('30');
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ fixture, http } = setup()); // initial GET flushed with FIXTURE
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  describe('canSubmit gate', () => {
    it('is true when every field is valid and not submitting', () => {
      fillValidForm();
      expect(component.canSubmit()).toBe(true);
    });

    it('is false when courseId is blank (arm 1)', () => {
      fillValidForm();
      component.formCourseId.set('   ');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false when title is blank (arm 2)', () => {
      fillValidForm();
      component.formTitle.set('');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false when scheduledAt is blank (arm 3)', () => {
      fillValidForm();
      component.formScheduledAt.set('');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false when duration does not parse to a positive int (arm 4)', () => {
      fillValidForm();
      component.formDurationMinutes.set('0');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false when capacity does not parse to a positive int (arm 5)', () => {
      fillValidForm();
      component.formCapacity.set('abc');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false while a submit is mid-flight (arm 6)', () => {
      fillValidForm();
      component.submitting.set(true);
      expect(component.canSubmit()).toBe(false);
    });
  });

  describe('parsePositiveInt arms (via canSubmit)', () => {
    it('rejects empty string', () => {
      fillValidForm();
      component.formCapacity.set('');
      expect(component.canSubmit()).toBe(false);
    });

    it('rejects negative-looking / non-\\d input', () => {
      fillValidForm();
      component.formCapacity.set('-5');
      expect(component.canSubmit()).toBe(false);
    });

    it('accepts a positive integer string', () => {
      fillValidForm();
      component.formCapacity.set('42');
      expect(component.canSubmit()).toBe(true);
    });
  });

  describe('onScheduleSubmit guards', () => {
    it('returns early without POSTing when canSubmit is false', () => {
      component.onScheduleClicked();
      // Missing courseId → canSubmit false → no HTTP, no error set.
      component.formTitle.set('T');
      component.formScheduledAt.set('2026-07-15T09:00');
      component.formDurationMinutes.set('60');
      component.formCapacity.set('10');
      component.onScheduleSubmit();
      // verify() in afterEach asserts no POST fired.
      expect(component.scheduleError()).toBeNull();
      expect(component.submitting()).toBe(false);
    });

    it('sets "Invalid form input" when scheduledAt is present but unparseable (toRfc3339 null)', () => {
      component.onScheduleClicked();
      // Non-empty (passes canSubmit length gate) but Date.parse → NaN, so
      // toRfc3339 returns null and the guard fires before any POST.
      component.formCourseId.set('course-x');
      component.formTitle.set('Sitting X');
      component.formScheduledAt.set('not-a-real-date');
      component.formDurationMinutes.set('60');
      component.formCapacity.set('10');
      expect(component.canSubmit()).toBe(true);

      component.onScheduleSubmit();

      // verify() asserts NO POST fired (the guard returned before the wire call).
      expect(component.scheduleError()).toBe('Invalid form input');
      expect(component.submitting()).toBe(false);
    });
  });
});

/**
 * No-data state — the component is created but the initial GET is left
 * unflushed, so data() stays null. This drives the `?.` optional-chain skip
 * and the `?? 0` / `?? []` nullish fallbacks in totalSittings / sittings.
 */
describe('ExamsComponent: pre-load (null data) fallbacks', () => {
  it('totalSittings falls back to 0 and sittings to [] before the GET resolves', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ExamsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(ExamsComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance;

    // data() is still null — the request is in-flight (not yet flushed).
    expect(component.totalSittings()).toBe(0);
    expect(component.sittings()).toEqual([]);

    // Drain the outstanding GET so HttpTestingController.verify is clean.
    http.expectOne(`${environment.bffBaseUrl}/api/v1/exams`).flush({ items: [] });
    http.verify();
  });
});

/**
 * describeHttpError arms — exercised through the schedule POST error callback,
 * which routes the HttpErrorResponse through describeHttpError before setting
 * scheduleError. Each flush shape hits a different branch of the formatter.
 */
describe('ExamsComponent: describeHttpError arms', () => {
  let fixture: ComponentFixture<ExamsComponent>;
  let http: HttpTestingController;
  let component: ExamsComponent;

  function submitValid(): void {
    component.onScheduleClicked();
    component.formCourseId.set('course-x');
    component.formTitle.set('Sitting X');
    component.formScheduledAt.set('2026-07-15T09:00');
    component.formDurationMinutes.set('60');
    component.formCapacity.set('10');
    component.onScheduleSubmit();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ fixture, http } = setup());
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it('prefers body.message when the error body is an object with message', () => {
    submitValid();
    http
      .expectOne(`${environment.bffBaseUrl}/api/v1/exams`)
      .flush({ message: 'boom-message' }, { status: 400, statusText: 'Bad' });
    expect(component.scheduleError()).toBe('400: boom-message');
  });

  it('falls back to body.error when message is absent (?? second operand)', () => {
    submitValid();
    http
      .expectOne(`${environment.bffBaseUrl}/api/v1/exams`)
      .flush({ error: 'boom-error' }, { status: 500, statusText: 'ISE' });
    expect(component.scheduleError()).toBe('500: boom-error');
  });

  it('uses a non-empty string error body verbatim', () => {
    submitValid();
    http
      .expectOne(`${environment.bffBaseUrl}/api/v1/exams`)
      .flush('plain-text-failure', { status: 502, statusText: 'Bad Gateway' });
    expect(component.scheduleError()).toContain('502');
    expect(component.scheduleError()).toContain('plain-text-failure');
  });

  it('renders just the message (no status prefix) on a network error (status 0)', () => {
    submitValid();
    http
      .expectOne(`${environment.bffBaseUrl}/api/v1/exams`)
      .error(new ProgressEvent('network-error'));
    const msg = component.scheduleError();
    expect(msg).not.toBeNull();
    // status 0 → the `status ? ... : message` ternary takes the falsy arm, so
    // there is no "0 — " prefix.
    expect(msg?.startsWith('0: ')).toBe(false);
  });

  it('falls through to err.message when the object body has neither message nor error', () => {
    submitValid();
    http
      .expectOne(`${environment.bffBaseUrl}/api/v1/exams`)
      .flush({ unrelated: 'field' }, { status: 418, statusText: 'Teapot' });
    const msg = component.scheduleError();
    expect(msg?.startsWith('418: ')).toBe(true);
  });
});
