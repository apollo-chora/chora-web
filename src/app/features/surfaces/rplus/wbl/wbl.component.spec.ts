/**
 * WblComponent spec — R+ /r/wbl Work-Based Learning placements admin.
 *
 * Verifies the screen renders the surface-rplus accent + tenant header +
 * total count, renders one row per placement with state badge + Withdraw
 * CTA, and renders the empty-state when the backend returns no items
 * (per feedback_no_stubs_real_wiring — empty BE ⇒ empty FE, not a faked
 * fixture).
 *
 * M15b Stage-C wave-3 adds composer panel coverage:
 *   - composer is hidden by default + opens on header CTA click
 *   - all 9 fields rendered with snake_case formControlNames
 *   - Submit POSTs the snake_case createWblPlacementReq envelope through
 *     WblService.create() → /api/v1/wbl-placements
 *   - 4xx surfaces an inline error banner without closing the panel
 *   - 2xx closes the panel + triggers a list reload (switchMap on reloadKey)
 *
 * Pattern mirrors certifications.component.spec.ts: real BFF wiring via
 * HttpTestingController + TenantContextService set explicitly + axe-core
 * smoke for WCAG 2.1 AA.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WblComponent } from './wbl.component';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { environment } from '../../../../../environments/environment';
// The test harness's translate pipe emits KEYS, not English, so pluralization
// COPY is asserted against en.json directly (offering-analytics.i18n.spec pattern).
import en from '../../../../../../public/assets/i18n/en.json';

const PLACEMENT_PATH = `${environment.bffBaseUrl}/api/v1/wbl-placements`;

interface BackendPlacementStub {
  id: string;
  tenant_id: string;
  gcid: string;
  course_id: string;
  host_org_name: string;
  supervisor_name: string;
  supervisor_email: string;
  start_date: string;
  end_date: string;
  hours_required: number;
  hours_completed: number;
  state: string;
  evaluator_notes?: string;
  /** CHO-2335: resolved display fields, omitted by BE when unresolved. */
  learner_name?: string;
  course_title?: string;
  created_at: string;
  updated_at: string;
}

const STUB_PLACEMENTS: readonly BackendPlacementStub[] = [
  {
    id: 'p-cspo-001',
    tenant_id: 'tenant-001',
    gcid: 'gcid-phyllis',
    course_id: 'course-cspo',
    host_org_name: 'Acme Pte Ltd',
    supervisor_name: 'Jane Tan',
    supervisor_email: 'jane.tan@acme.example',
    start_date: '2026-06-01T00:00:00Z',
    end_date: '2026-08-31T00:00:00Z',
    hours_required: 240,
    hours_completed: 80,
    state: 'IN_PROGRESS',
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
  },
  {
    id: 'p-dsa-002',
    tenant_id: 'tenant-001',
    gcid: 'gcid-mei',
    course_id: 'course-dsa-101',
    host_org_name: 'Beta Labs',
    supervisor_name: 'Marcus Thorne',
    supervisor_email: 'marcus@beta.example',
    start_date: '2026-07-01T00:00:00Z',
    end_date: '2026-09-30T00:00:00Z',
    hours_required: 120,
    hours_completed: 0,
    state: 'SCHEDULED',
    created_at: '2026-05-25T15:30:00Z',
    updated_at: '2026-05-25T15:30:00Z',
  },
];

function setup(items: readonly BackendPlacementStub[] = STUB_PLACEMENTS): {
  fixture: ComponentFixture<WblComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [WblComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const tenants = TestBed.inject(TenantContextService);
  tenants.setCurrentTenant({
    id: 'tenant-001',
    name: 'MTM Singapore',
    slug: 'mtm',
    logoUrl: null,
  });
  const fixture = TestBed.createComponent(WblComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock.expectOne(PLACEMENT_PATH).flush({ items });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('WblComponent', () => {
  let fixture: ComponentFixture<WblComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const root = element.querySelector('[data-testid="rplus-wbl"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('uses a semantic <section> root', () => {
      const root = element.querySelector('[data-testid="rplus-wbl"]');
      expect(root?.tagName).toBe('SECTION');
    });

    it('does NOT render any other surface-* accent classes', () => {
      const root = element.querySelector('[data-testid="rplus-wbl"]');
      expect(root?.className).not.toContain('surface-aplus');
      expect(root?.className).not.toContain('surface-cplus');
      expect(root?.className).not.toContain('surface-hplus');
      expect(root?.className).not.toContain('surface-oplus');
    });
  });

  describe('header', () => {
    it('shows the current tenant name from TenantContextService', () => {
      const tenant = element.querySelector('[data-testid="wbl-tenant"]');
      expect(tenant?.textContent).toContain('MTM Singapore');
    });

    it('shows total placement count from the BFF response', () => {
      const total = element.querySelector('[data-testid="wbl-total"]');
      expect(total?.textContent).toContain('2');
    });

    it('renders a "New Placement" header CTA', () => {
      const cta = element.querySelector('[data-testid="wbl-create-cta"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('BUTTON');
    });
  });

  describe('list', () => {
    it('renders one row per placement (2 total)', () => {
      const rows = element.querySelectorAll('[data-testid^="wbl-row-"]');
      expect(rows.length).toBe(2);
    });

    it('renders the CSPO placement with host + learner + supervisor', () => {
      const row = element.querySelector('[data-testid="wbl-row-p-cspo-001"]');
      expect(row?.textContent).toContain('Acme Pte Ltd');
      expect(row?.textContent).toContain('gcid-phyllis');
      expect(row?.textContent).toContain('Jane Tan');
    });

    it('renders the IN_PROGRESS state badge on the CSPO row', () => {
      const badge = element.querySelector('[data-testid="wbl-state-p-cspo-001"]');
      expect(badge?.textContent?.trim()).toBe('IN_PROGRESS');
    });

    it('renders the SCHEDULED state badge on the DSA row', () => {
      const badge = element.querySelector('[data-testid="wbl-state-p-dsa-002"]');
      expect(badge?.textContent?.trim()).toBe('SCHEDULED');
    });

    it('renders hours completed / required on each row', () => {
      const hours = element.querySelector('[data-testid="wbl-hours-p-cspo-001"]');
      expect(hours?.textContent).toContain('80');
      expect(hours?.textContent).toContain('240');
    });

    it('renders a progress bar with the correct aria-valuenow', () => {
      const progress = element.querySelector('[data-testid="wbl-progress-p-cspo-001"]');
      // 80 / 240 = 33%
      expect(progress?.getAttribute('aria-valuenow')).toBe('33');
      expect(progress?.getAttribute('role')).toBe('progressbar');
    });

    it('exposes per-row Withdraw CTA', () => {
      const cta = element.querySelector('[data-testid="wbl-withdraw-p-cspo-001"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('BUTTON');
    });

    it('clickable mailto: link on the supervisor email', () => {
      const row = element.querySelector('[data-testid="wbl-row-p-cspo-001"]');
      const link = row?.querySelector('a[href^="mailto:"]');
      expect(link?.getAttribute('href')).toBe('mailto:jane.tan@acme.example');
    });
  });

  describe('a11y', () => {
    it('renders an <h1> heading per surface', () => {
      const heading = element.querySelector('h1');
      expect(heading).not.toBeNull();
    });

    it('uses semantic role="list" on the placements list', () => {
      const list = element.querySelector('.wbl__list');
      expect(list?.getAttribute('role')).toBe('list');
    });

    it('has zero critical/serious WCAG violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    }, 30000);
  });
});

describe('WblComponent — terminal-state rows', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup([
      {
        id: 'p-completed',
        tenant_id: 'tenant-001',
        gcid: 'gcid-phyllis',
        course_id: 'course-cspo',
        host_org_name: 'Acme Pte Ltd',
        supervisor_name: 'Jane Tan',
        supervisor_email: 'jane.tan@acme.example',
        start_date: '2026-01-01T00:00:00Z',
        end_date: '2026-03-31T00:00:00Z',
        hours_required: 240,
        hours_completed: 240,
        state: 'COMPLETED',
        created_at: '2025-12-15T10:00:00Z',
        updated_at: '2026-04-01T15:00:00Z',
      },
      {
        id: 'p-withdrawn',
        tenant_id: 'tenant-001',
        gcid: 'gcid-mei',
        course_id: 'course-dsa-101',
        host_org_name: 'Beta Labs',
        supervisor_name: 'Marcus Thorne',
        supervisor_email: 'marcus@beta.example',
        start_date: '2026-02-01T00:00:00Z',
        end_date: '2026-04-30T00:00:00Z',
        hours_required: 120,
        hours_completed: 30,
        state: 'WITHDRAWN',
        evaluator_notes: '[WITHDRAWN] learner moved abroad',
        created_at: '2026-01-25T15:30:00Z',
        updated_at: '2026-02-10T09:00:00Z',
      },
    ]);
    httpMock = built.httpMock;
    element = built.fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders the 100% progress fill on a COMPLETED row', () => {
    const progress = element.querySelector('[data-testid="wbl-progress-p-completed"]');
    expect(progress?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('disables the Withdraw CTA on COMPLETED rows', () => {
    const cta = element.querySelector('[data-testid="wbl-withdraw-p-completed"]');
    expect(cta?.hasAttribute('disabled')).toBe(true);
  });

  it('disables the Withdraw CTA on WITHDRAWN rows', () => {
    const cta = element.querySelector('[data-testid="wbl-withdraw-p-withdrawn"]');
    expect(cta?.hasAttribute('disabled')).toBe(true);
  });

  it('shows the [WITHDRAWN] evaluator note on a WITHDRAWN row', () => {
    const row = element.querySelector('[data-testid="wbl-row-p-withdrawn"]');
    expect(row?.textContent).toContain('[WITHDRAWN] learner moved abroad');
  });
});

describe('WblComponent — empty state', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup([]);
    httpMock = built.httpMock;
    element = built.fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders the empty-state message when no placements exist', () => {
    const empty = element.querySelector('[data-testid="wbl-empty"]');
    expect(empty).not.toBeNull();
  });

  it('renders zero rows in the empty case', () => {
    const rows = element.querySelectorAll('[data-testid^="wbl-row-"]');
    expect(rows.length).toBe(0);
  });

  it('shows total count of 0', () => {
    const total = element.querySelector('[data-testid="wbl-total"]');
    expect(total?.textContent).toContain('0');
  });
});

describe('WblComponent — composer panel', () => {
  let fixture: ComponentFixture<WblComponent>;
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

  it('is hidden by default', () => {
    expect(element.querySelector('[data-testid="wbl-composer"]')).toBeNull();
  });

  it('opens when the header CTA is clicked', () => {
    const cta = element.querySelector<HTMLButtonElement>('[data-testid="wbl-create-cta"]');
    cta!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="wbl-composer"]')).not.toBeNull();
  });

  it('renders every required field with formControlName bindings', () => {
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-create-cta"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="wbl-composer-gcid"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wbl-composer-course"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wbl-composer-host"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wbl-composer-role"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wbl-composer-start"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wbl-composer-end"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wbl-composer-supervisor"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wbl-composer-supervisor-email"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="wbl-composer-hours"]')).not.toBeNull();
  });

  it('disables Submit when the form is invalid (empty draft)', () => {
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-create-cta"]')!.click();
    fixture.detectChanges();
    const submit = element.querySelector<HTMLButtonElement>('[data-testid="wbl-composer-submit"]');
    expect(submit?.disabled).toBe(true);
  });

  it('closes on Cancel without firing a POST', () => {
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-create-cta"]')!.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-composer-cancel"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="wbl-composer"]')).toBeNull();
    // afterEach httpMock.verify() asserts no outstanding POST fired.
  });

  it('POSTs the snake-case envelope on a valid submit + closes + reloads', () => {
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-create-cta"]')!.click();
    fixture.detectChanges();

    fixture.componentInstance.draft.setValue({
      gcid: 'gcid-new',
      course_id: 'course-new',
      host_org_name: 'Gamma Co',
      role_title: 'Intern',
      start_date: '2026-09-01',
      end_date: '2026-12-01',
      supervisor_name: 'Pat Lee',
      supervisor_email: 'pat@gamma.example',
      hours_required: 100,
    });
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-testid="wbl-composer-submit"]')!.click();
    fixture.detectChanges();

    const post = httpMock.expectOne(PLACEMENT_PATH);
    expect(post.request.method).toBe('POST');
    // WblService.create() widens bare YYYY-MM-DD dates from the <input
    // type="date"> draft to RFC3339 start-of-day UTC (toRfc3339StartOfDayUtc)
    // — the chora-delivery handler decodes start_date/end_date into Go
    // time.Time, which rejects a bare calendar date. Assert the widened wire.
    expect(post.request.body).toEqual({
      gcid: 'gcid-new',
      course_id: 'course-new',
      host_org_name: 'Gamma Co',
      supervisor_name: 'Pat Lee',
      supervisor_email: 'pat@gamma.example',
      start_date: '2026-09-01T00:00:00Z',
      end_date: '2026-12-01T00:00:00Z',
      hours_required: 100,
    });
    post.flush({
      id: 'p-new',
      tenant_id: 'tenant-001',
      gcid: 'gcid-new',
      course_id: 'course-new',
      host_org_name: 'Gamma Co',
      supervisor_name: 'Pat Lee',
      supervisor_email: 'pat@gamma.example',
      start_date: '2026-09-01T00:00:00Z',
      end_date: '2026-12-01T00:00:00Z',
      hours_required: 100,
      hours_completed: 0,
      state: 'SCHEDULED',
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    });
    fixture.detectChanges();

    // Composer closes on success.
    expect(element.querySelector('[data-testid="wbl-composer"]')).toBeNull();
    // List reload fires (switchMap on reloadKey).
    const reload = httpMock.expectOne(PLACEMENT_PATH);
    expect(reload.request.method).toBe('GET');
    reload.flush({ items: [] });
    fixture.detectChanges();
  });

  it('surfaces an inline error banner on a 4xx (and keeps the panel open)', () => {
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-create-cta"]')!.click();
    fixture.detectChanges();

    fixture.componentInstance.draft.setValue({
      gcid: 'gcid-bad',
      course_id: 'course-bad',
      host_org_name: 'Bad Co',
      role_title: '',
      start_date: '2026-09-01',
      end_date: '2026-08-01', // end before start
      supervisor_name: 'Pat Lee',
      supervisor_email: 'pat@bad.example',
      hours_required: 100,
    });
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-testid="wbl-composer-submit"]')!.click();
    fixture.detectChanges();

    const post = httpMock.expectOne(PLACEMENT_PATH);
    post.flush(
      { error: 'wbl: end_date must be on or after start_date' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    const banner = element.querySelector('[data-testid="wbl-composer-error"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('end_date');
    // Composer panel stays open so the author can fix + retry.
    expect(element.querySelector('[data-testid="wbl-composer"]')).not.toBeNull();
  });
});

describe('WblComponent — confirm-gated row withdraw', () => {
  let fixture: ComponentFixture<WblComponent>;
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

  it('fires NO DELETE when the confirm dialog is cancelled', async () => {
    const confirmDialog = TestBed.inject(ConfirmDialogService);
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-withdraw-p-dsa-002"]')!.click();
    confirmDialog._resolve(false);
    await Promise.resolve();
    fixture.detectChanges();
    // afterEach httpMock.verify() asserts no outstanding DELETE fired.
  });

  it('fires DELETE + reloads the list when confirmed', async () => {
    const confirmDialog = TestBed.inject(ConfirmDialogService);
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-withdraw-p-dsa-002"]')!.click();
    confirmDialog._resolve(true);
    await Promise.resolve();
    fixture.detectChanges();

    const del = httpMock.expectOne(`${PLACEMENT_PATH}/p-dsa-002`);
    expect(del.request.method).toBe('DELETE');
    del.flush({
      id: 'p-dsa-002',
      tenant_id: 'tenant-001',
      gcid: 'gcid-mei',
      course_id: 'course-dsa-101',
      host_org_name: 'Beta Labs',
      supervisor_name: 'Marcus Thorne',
      supervisor_email: 'marcus@beta.example',
      start_date: '2026-07-01T00:00:00Z',
      end_date: '2026-09-30T00:00:00Z',
      hours_required: 120,
      hours_completed: 0,
      state: 'WITHDRAWN',
      evaluator_notes: '[WITHDRAWN] DELETE /api/v1/wbl-placements',
      created_at: '2026-05-25T15:30:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    });
    fixture.detectChanges();

    // List reload fires (reloadKey bump → switchMap re-list).
    const reload = httpMock.expectOne(PLACEMENT_PATH);
    expect(reload.request.method).toBe('GET');
    reload.flush({ items: [] });
    fixture.detectChanges();
  });
});

describe('WblComponent — composer submit guards + trimming', () => {
  let fixture: ComponentFixture<WblComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    // Open the composer for every guard test.
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-create-cta"]')!.click();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('onSubmit() fires NO POST + marks the form touched when invalid', () => {
    // Draft is empty/invalid by default.
    expect(fixture.componentInstance.draft.invalid).toBe(true);
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    // markAllAsTouched flips the control touched-state.
    expect(fixture.componentInstance.draft.get('gcid')?.touched).toBe(true);
    expect(fixture.componentInstance.submitting()).toBe(false);
    // afterEach httpMock.verify() asserts no POST went out.
  });

  it('onSubmit() is a no-op while a previous submit is still inflight', () => {
    fixture.componentInstance.draft.setValue({
      gcid: 'g1',
      course_id: 'c1',
      host_org_name: 'Org 1',
      role_title: '',
      start_date: '2026-09-01',
      end_date: '2026-12-01',
      supervisor_name: 'Sup 1',
      supervisor_email: 'sup1@example.com',
      hours_required: 50,
    });
    fixture.detectChanges();

    // First submit — leaves one POST inflight (submitting() stays true).
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    expect(fixture.componentInstance.submitting()).toBe(true);
    const first = httpMock.expectOne(PLACEMENT_PATH);

    // Second submit while inflight must NOT enqueue a second POST.
    fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    // Flush the original so verify() is clean.
    first.flush({
      id: 'p1',
      tenant_id: 'tenant-001',
      gcid: 'g1',
      course_id: 'c1',
      host_org_name: 'Org 1',
      supervisor_name: 'Sup 1',
      supervisor_email: 'sup1@example.com',
      start_date: '2026-09-01T00:00:00Z',
      end_date: '2026-12-01T00:00:00Z',
      hours_required: 50,
      hours_completed: 0,
      state: 'SCHEDULED',
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    });
    fixture.detectChanges();
    // The success reload GET.
    httpMock.expectOne(PLACEMENT_PATH).flush({ items: [] });
    fixture.detectChanges();
  });

  it('trims whitespace from each field before POSTing the envelope', () => {
    // Email is left un-padded: Validators.email runs on the raw control
    // value (pre-trim), so a padded email would mark the form invalid and
    // block submit. The component trims gcid/course/host/supervisor.
    fixture.componentInstance.draft.setValue({
      gcid: '  gcid-pad  ',
      course_id: '  course-pad  ',
      host_org_name: '  Padded Co  ',
      role_title: '  Intern  ',
      start_date: '2026-09-01',
      end_date: '2026-12-01',
      supervisor_name: '  Padded Sup  ',
      supervisor_email: 'padded@example.com',
      hours_required: 80,
    });
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-testid="wbl-composer-submit"]')!.click();
    fixture.detectChanges();

    const post = httpMock.expectOne(PLACEMENT_PATH);
    expect(post.request.body).toEqual({
      gcid: 'gcid-pad',
      course_id: 'course-pad',
      host_org_name: 'Padded Co',
      supervisor_name: 'Padded Sup',
      supervisor_email: 'padded@example.com',
      start_date: '2026-09-01T00:00:00Z',
      end_date: '2026-12-01T00:00:00Z',
      hours_required: 80,
    });
    post.flush({
      id: 'p-pad',
      tenant_id: 'tenant-001',
      gcid: 'gcid-pad',
      course_id: 'course-pad',
      host_org_name: 'Padded Co',
      supervisor_name: 'Padded Sup',
      supervisor_email: 'padded@example.com',
      start_date: '2026-09-01T00:00:00Z',
      end_date: '2026-12-01T00:00:00Z',
      hours_required: 80,
      hours_completed: 0,
      state: 'SCHEDULED',
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    });
    fixture.detectChanges();
    httpMock.expectOne(PLACEMENT_PATH).flush({ items: [] });
    fixture.detectChanges();
  });

  it('onCancel() clears submitting + composerError signals', () => {
    fixture.componentInstance.composerError.set('boom');
    fixture.componentInstance.submitting.set(true);
    fixture.componentInstance.onCancel();
    fixture.detectChanges();
    expect(fixture.componentInstance.composerOpen()).toBe(false);
    expect(fixture.componentInstance.composerError()).toBeNull();
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('onCompose() resets the draft + clears a stale error banner', () => {
    // Dirty the form + set a stale error, then re-open.
    fixture.componentInstance.draft.get('gcid')?.setValue('stale');
    fixture.componentInstance.composerError.set('previous failure');
    fixture.componentInstance.onCompose();
    fixture.detectChanges();
    expect(fixture.componentInstance.draft.get('gcid')?.value).toBe('');
    expect(fixture.componentInstance.draft.get('hours_required')?.value).toBe(1);
    expect(fixture.componentInstance.composerError()).toBeNull();
    expect(fixture.componentInstance.composerOpen()).toBe(true);
  });
});

describe('WblComponent — create error-message extraction', () => {
  let fixture: ComponentFixture<WblComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-create-cta"]')!.click();
    fixture.detectChanges();
    fixture.componentInstance.draft.setValue({
      gcid: 'g',
      course_id: 'c',
      host_org_name: 'H',
      role_title: '',
      start_date: '2026-09-01',
      end_date: '2026-12-01',
      supervisor_name: 'S',
      supervisor_email: 's@example.com',
      hours_required: 10,
    });
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function submitAndFail(body: unknown, status: number, statusText: string): void {
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-composer-submit"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(PLACEMENT_PATH).flush(body as Object | null, { status, statusText });
    fixture.detectChanges();
  }

  it('surfaces the { message } body shape on a 422 (inner.message branch)', () => {
    // Angular puts the parsed JSON body in HttpErrorResponse.error, so the
    // flush body IS e.error. A { message } object hits the inner.message
    // branch of extractErrorMessage.
    submitAndFail({ message: 'unprocessable supervisor email' }, 422, 'Unprocessable Entity');
    expect(fixture.componentInstance.composerError()).toBe('unprocessable supervisor email');
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('falls back to the generic message on a 5xx with no parsable body', () => {
    // A 500 with an empty/no body → extractErrorMessage default.
    submitAndFail(null, 500, 'Internal Server Error');
    const msg = fixture.componentInstance.composerError();
    // HttpErrorResponse for a 5xx with null body yields the framework's
    // "Http failure response ..." message (top-level e.message branch).
    expect(typeof msg).toBe('string');
    expect((msg ?? '').length).toBeGreaterThan(0);
    expect(fixture.componentInstance.composerError()).not.toBeNull();
  });

  it('keeps the panel open + re-enables submit after the error', () => {
    submitAndFail({ error: 'nope' }, 400, 'Bad Request');
    expect(element.querySelector('[data-testid="wbl-composer"]')).not.toBeNull();
    expect(fixture.componentInstance.submitting()).toBe(false);
    expect(fixture.componentInstance.composerError()).toBe('nope');
  });
});

describe('WblComponent — withdraw re-entrancy + error reload', () => {
  let fixture: ComponentFixture<WblComponent>;
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

  it('re-lists (reloadKey bump) even when the withdraw DELETE errors', async () => {
    const confirmDialog = TestBed.inject(ConfirmDialogService);
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-withdraw-p-dsa-002"]')!.click();
    confirmDialog._resolve(true);
    await Promise.resolve();
    fixture.detectChanges();

    const del = httpMock.expectOne(`${PLACEMENT_PATH}/p-dsa-002`);
    expect(del.request.method).toBe('DELETE');
    del.flush(
      { error: 'wbl: concurrent terminal transition' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    // withdrawing() reset + a re-list GET fires from the error branch.
    expect(fixture.componentInstance.withdrawing()).toBe(false);
    const reload = httpMock.expectOne(PLACEMENT_PATH);
    expect(reload.request.method).toBe('GET');
    reload.flush({ items: [] });
    fixture.detectChanges();
  });

  it('onWithdrawClicked() is a no-op while a withdraw is already inflight', async () => {
    const confirmDialog = TestBed.inject(ConfirmDialogService);
    // Drive the first withdraw to inflight (DELETE pending).
    element.querySelector<HTMLButtonElement>('[data-testid="wbl-withdraw-p-dsa-002"]')!.click();
    confirmDialog._resolve(true);
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.withdrawing()).toBe(true);
    const del = httpMock.expectOne(`${PLACEMENT_PATH}/p-dsa-002`);

    // Second call while inflight short-circuits BEFORE opening a dialog —
    // resolves immediately with no further HTTP.
    await fixture.componentInstance.onWithdrawClicked('p-cspo-001');
    fixture.detectChanges();

    // Flush the original DELETE so verify() is clean (its error branch
    // re-lists; flush that GET too).
    del.flush({
      id: 'p-dsa-002',
      tenant_id: 'tenant-001',
      gcid: 'gcid-mei',
      course_id: 'course-dsa-101',
      host_org_name: 'Beta Labs',
      supervisor_name: 'Marcus Thorne',
      supervisor_email: 'marcus@beta.example',
      start_date: '2026-07-01T00:00:00Z',
      end_date: '2026-09-30T00:00:00Z',
      hours_required: 120,
      hours_completed: 0,
      state: 'WITHDRAWN',
      created_at: '2026-05-25T15:30:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    });
    fixture.detectChanges();
    httpMock.expectOne(PLACEMENT_PATH).flush({ items: [] });
    fixture.detectChanges();
  });
});

describe('WblComponent - display enrichment + human formatting (CHO-2335)', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  const ENRICHED: BackendPlacementStub = {
    id: 'p-enriched',
    tenant_id: 'tenant-001',
    gcid: 'gcid-raw-learner-1',
    course_id: 'course-raw-1',
    host_org_name: 'Acme Pte Ltd',
    supervisor_name: 'Jane Tan',
    supervisor_email: 'jane.tan@acme.example',
    start_date: '2026-06-01T00:00:00Z',
    end_date: '2026-08-31T00:00:00Z',
    hours_required: 240,
    hours_completed: 80,
    state: 'IN_PROGRESS',
    learner_name: 'Alice Tan',
    course_title: 'Intro to Robotics',
    created_at: '2026-05-26T10:00:00Z',
    // Nanosecond precision, the raw bug value the FE must never render.
    updated_at: '2026-05-26T10:00:00.123456789Z',
  };

  const RAW: BackendPlacementStub = {
    id: 'p-raw',
    tenant_id: 'tenant-001',
    gcid: 'gcid-raw-learner-2',
    course_id: 'course-raw-2',
    host_org_name: 'Beta Labs',
    supervisor_name: 'Marcus Thorne',
    supervisor_email: 'marcus@beta.example',
    start_date: '2026-07-01T00:00:00Z',
    end_date: '2026-09-30T00:00:00Z',
    hours_required: 120,
    hours_completed: 0,
    state: 'SCHEDULED',
    // learner_name + course_title intentionally OMITTED → id fallback.
    created_at: '2026-05-25T15:30:00Z',
    updated_at: '2026-05-25T15:30:00Z',
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup([ENRICHED, RAW]);
    httpMock = built.httpMock;
    element = built.fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders the resolved learner_name on the enriched row', () => {
    const row = element.querySelector('[data-testid="wbl-row-p-enriched"]');
    expect(row?.textContent).toContain('Alice Tan');
    // The raw gcid must NOT show once a name resolves.
    expect(row?.textContent).not.toContain('gcid-raw-learner-1');
  });

  it('renders the resolved course_title on the enriched row', () => {
    const row = element.querySelector('[data-testid="wbl-row-p-enriched"]');
    expect(row?.textContent).toContain('Intro to Robotics');
    expect(row?.textContent).not.toContain('course-raw-1');
  });

  it('falls back to the raw gcid when learner_name is absent', () => {
    const row = element.querySelector('[data-testid="wbl-row-p-raw"]');
    expect(row?.textContent).toContain('gcid-raw-learner-2');
    expect(row?.textContent).not.toContain('Alice Tan');
  });

  it('falls back to the raw course_id when course_title is absent', () => {
    const row = element.querySelector('[data-testid="wbl-row-p-raw"]');
    expect(row?.textContent).toContain('course-raw-2');
  });

  it('renders a human-formatted start date, never raw ISO', () => {
    const t = element.querySelector('[data-testid="wbl-start-p-enriched"]');
    // 'd MMM y' (UTC) → "1 Jun 2026".
    expect(t?.textContent).toContain('Jun');
    expect(t?.textContent).toContain('2026');
    expect(t?.textContent).not.toContain('T00:00:00');
    expect(t?.textContent).not.toContain('2026-06-01T');
    // Machine-readable datetime attr keeps the ISO value for a11y.
    expect(t?.getAttribute('datetime')).toBe('2026-06-01T00:00:00Z');
  });

  it('renders a human-formatted end date, never raw ISO', () => {
    const t = element.querySelector('[data-testid="wbl-end-p-enriched"]');
    expect(t?.textContent).toContain('Aug');
    expect(t?.textContent).not.toContain('T00:00:00');
  });

  it('renders a human-formatted Updated timestamp with no nanoseconds', () => {
    const t = element.querySelector('[data-testid="wbl-updated-p-enriched"]');
    expect(t?.textContent).not.toContain('.123456789');
    expect(t?.textContent).not.toContain('T10:00:00');
    expect(t?.textContent).toContain('2026');
    // The datetime attr still carries the machine ISO.
    expect(t?.getAttribute('datetime')).toBe('2026-05-26T10:00:00.123456789Z');
  });
});

describe('WblComponent - count pluralization (CHO-2335)', () => {
  let httpMock: HttpTestingController;

  // The template binds `totalCountLabelKey() | translate`; the harness echoes
  // the key, so we assert the SELECTED key here + the COPY against en.json below.
  function keyFor(items: readonly BackendPlacementStub[]): {
    key: string;
    total: number;
  } {
    TestBed.resetTestingModule();
    const built = setup(items);
    httpMock = built.httpMock;
    const c = built.fixture.componentInstance;
    return { key: c.totalCountLabelKey(), total: c.totalPlacements() };
  }

  afterEach(() => httpMock.verify());

  it('selects the SINGULAR label key for exactly one placement', () => {
    const { key, total } = keyFor([STUB_PLACEMENTS[0]!]);
    expect(total).toBe(1);
    expect(key).toBe('rplus.wbl.total_label_one');
  });

  it('selects the PLURAL label key for multiple placements', () => {
    const { key, total } = keyFor(STUB_PLACEMENTS);
    expect(total).toBe(2);
    expect(key).toBe('rplus.wbl.total_label');
  });

  it('selects the PLURAL label key for zero placements', () => {
    const { key, total } = keyFor([]);
    expect(total).toBe(0);
    expect(key).toBe('rplus.wbl.total_label');
  });

  it('the en.json copy is singular vs plural (the "1 placements" bug)', () => {
    const wbl = (en as unknown as { rplus: { wbl: Record<string, string> } }).rplus.wbl;
    // Singular noun carries no trailing plural "s"; the plural does.
    expect(wbl['total_label_one']).toMatch(/\bplacement\b/);
    expect(wbl['total_label_one']).not.toContain('placements');
    expect(wbl['total_label']).toContain('placements');
  });
});

describe('WblComponent — computed projections', () => {
  let httpMock: HttpTestingController;
  let component: WblComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup([
      {
        id: 'p-zero',
        tenant_id: 'tenant-001',
        gcid: 'gcid-zero',
        course_id: 'course-zero',
        host_org_name: 'Zero Co',
        supervisor_name: 'Zee',
        supervisor_email: 'zee@example.com',
        start_date: '2026-06-01T00:00:00Z',
        end_date: '2026-08-31T00:00:00Z',
        hours_required: 0, // corrupt payload → completionPercent clamps to 0
        hours_completed: 40,
        state: 'IN_PROGRESS',
        created_at: '2026-05-26T10:00:00Z',
        updated_at: '2026-05-26T10:00:00Z',
      },
    ]);
    httpMock = built.httpMock;
    component = built.fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('items() pre-computes completionPct (0% when hoursRequired is 0)', () => {
    const rows = component.items();
    expect(rows.length).toBe(1);
    expect(rows[0].completionPct).toBe(0);
  });

  it('totalPlacements() reflects the single returned item', () => {
    expect(component.totalPlacements()).toBe(1);
  });

  it('tenantName() reflects the BFF tenantName off the current tenant', () => {
    expect(component.tenantName()).toBe('MTM Singapore');
  });

  it('reloadCount() exposes the reactive reload key (starts at 0)', () => {
    expect(component.reloadCount()).toBe(0);
  });

  it('badge() maps each FSM state to its glassmorphism variant', () => {
    expect(component.badge('SCHEDULED')).toBe('badge-info');
    expect(component.badge('IN_PROGRESS')).toBe('badge-success');
    expect(component.badge('COMPLETED')).toBe('badge-success');
    expect(component.badge('WITHDRAWN')).toBe('badge-neutral');
  });
});

/**
 * Net-new branch coverage (AUGMENT) — the existing suites always flush the
 * initial list() GET, so the null-`data()` right-hand arms of the
 * tenantName / totalPlacements / items computeds were never exercised, and
 * the `Number(raw.hours_required) || 0` NaN fallback in onSubmit was never
 * driven. These two describe blocks close those gaps without weakening any
 * existing test.
 */
describe('WblComponent — null-data computed fallbacks (pre-response)', () => {
  let component: WblComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [WblComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(WblComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    // Trigger the list() GET but deliberately DO NOT flush it — data() stays
    // at its `initialValue: null`, exercising the ?? '' / ?? 0 / ?? [] arms.
    fixture.detectChanges();
  });

  afterEach(() => {
    // Flush the still-pending initial GET so verify() is clean.
    httpMock.expectOne(PLACEMENT_PATH).flush({ items: [] });
    httpMock.verify();
  });

  it('tenantName() falls back to "" when data() is null', () => {
    expect(component.tenantName()).toBe('');
  });

  it('totalPlacements() falls back to 0 when data() is null', () => {
    expect(component.totalPlacements()).toBe(0);
  });

  it('items() falls back to [] when data() is null', () => {
    expect(component.items()).toEqual([]);
  });
});

describe('WblComponent — onSubmit hours_required NaN fallback', () => {
  let fixture: ComponentFixture<WblComponent>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup([]);
    fixture = built.fixture;
    httpMock = built.httpMock;
    fixture.componentInstance.onCompose();
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('coerces a non-numeric hours_required to 0 via the Number(..)||0 arm', () => {
    fixture.componentInstance.draft.setValue({
      gcid: 'g-nan',
      course_id: 'c-nan',
      host_org_name: 'NaN Co',
      role_title: '',
      start_date: '2026-09-01',
      end_date: '2026-12-01',
      supervisor_name: 'Sup',
      supervisor_email: 'sup@example.com',
      // A bare string flows through the raw value untouched; Number(..) on it
      // yields NaN, so the || 0 fallback fires.
      hours_required: 'not-a-number' as unknown as number,
    });
    fixture.detectChanges();

    fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const post = httpMock.expectOne(PLACEMENT_PATH);
    expect(post.request.method).toBe('POST');
    expect((post.request.body as { hours_required: number }).hours_required).toBe(0);
    post.flush({
      id: 'p-nan',
      tenant_id: 'tenant-001',
      gcid: 'g-nan',
      course_id: 'c-nan',
      host_org_name: 'NaN Co',
      supervisor_name: 'Sup',
      supervisor_email: 'sup@example.com',
      start_date: '2026-09-01T00:00:00Z',
      end_date: '2026-12-01T00:00:00Z',
      hours_required: 0,
      hours_completed: 0,
      state: 'SCHEDULED',
      created_at: '2026-05-26T00:00:00Z',
      updated_at: '2026-05-26T00:00:00Z',
    });
    fixture.detectChanges();
    // Success reload GET.
    httpMock.expectOne(PLACEMENT_PATH).flush({ items: [] });
    fixture.detectChanges();
  });
});
