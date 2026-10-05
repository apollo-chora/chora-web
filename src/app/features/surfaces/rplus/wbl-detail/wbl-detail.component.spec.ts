/**
 * WblDetailComponent spec — R+ Wave-5 drill-down (`/r/wbl/:id`).
 *
 * Exercises the real `WblDetailService` against `HttpTestingController`
 * so the BFF wire contract is asserted end-to-end. No mocks, no stubs —
 * per `feedback_no_stubs_real_wiring`.
 *
 * Coverage matrix:
 *   - signal-input :id binding triggers the BFF GET
 *   - success branch renders all wire fields
 *   - error branch renders the alert + retry; retry refires the same GET
 *   - 404 branch surfaces the "not found" i18n key
 *   - Withdraw CTA disables on COMPLETED + WITHDRAWN
 *   - Withdraw is confirm-gated: cancel fires NO DELETE, confirm fires DELETE
 *   - PATCH form pre-fills from the loaded placement + PATCHes only the
 *     changed fields; 2xx replaces in-place; 4xx/409 surfaces an inline banner
 *   - PATCH form locks out on a terminal placement
 *   - axe-core a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { WblDetailComponent } from './wbl-detail.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { environment } from '../../../../../environments/environment';

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
  created_at: string;
  updated_at: string;
}

function backendStub(overrides: Partial<BackendPlacementStub> = {}): BackendPlacementStub {
  return {
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
    updated_at: '2026-05-26T11:00:00Z',
    ...overrides,
  };
}

function setup(id: string): {
  fixture: ComponentFixture<WblDetailComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [WblDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(WblDetailComponent);
  fixture.componentRef.setInput('id', id);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock };
}

function url(id: string): string {
  return `${environment.bffBaseUrl}/api/v1/wbl-placements/${encodeURIComponent(id)}`;
}

describe('WblDetailComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } catch {
      /* explicit verify already happened in the test body */
    }
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const { fixture, httpMock } = setup('p-cspo-001');
      httpMock.expectOne(url('p-cspo-001')).flush(backendStub());
      fixture.detectChanges();
      const root = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="rplus-wbl-detail"]',
      );
      expect(root?.className).toContain('surface-rplus');
      httpMock.verify();
    });
  });

  describe('GET wiring', () => {
    it('issues GET /api/v1/wbl-placements/{id} on initial render', () => {
      const { fixture, httpMock } = setup('p-cspo-001');
      const req = httpMock.expectOne(url('p-cspo-001'));
      expect(req.request.method).toBe('GET');
      req.flush(backendStub({ id: 'p-cspo-001' }));
      fixture.detectChanges();
      httpMock.verify();
    });

    it('URL-encodes the id segment', () => {
      const { fixture, httpMock } = setup('with/slash');
      const req = httpMock.expectOne(url('with/slash'));
      req.flush(backendStub({ id: 'with/slash' }));
      fixture.detectChanges();
      httpMock.verify();
    });
  });

  describe('success branch', () => {
    let fixture: ComponentFixture<WblDetailComponent>;
    let httpMock: HttpTestingController;
    let element: HTMLElement;

    beforeEach(() => {
      const built = setup('p-cspo-001');
      fixture = built.fixture;
      httpMock = built.httpMock;
      httpMock.expectOne(url('p-cspo-001')).flush(backendStub());
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the placement panel with the BE id badge', () => {
      const panel = element.querySelector('[data-testid="wbl-detail-panel-p-cspo-001"]');
      expect(panel).not.toBeNull();
    });

    it('shows the IN_PROGRESS state badge', () => {
      const badge = element.querySelector('[data-testid="wbl-detail-state-p-cspo-001"]');
      expect(badge?.textContent?.trim()).toBe('IN_PROGRESS');
    });

    it('renders the host org name', () => {
      const host = element.querySelector('[data-testid="wbl-detail-host"]');
      expect(host?.textContent).toContain('Acme Pte Ltd');
    });

    it('renders the learner gcid', () => {
      const learner = element.querySelector('[data-testid="wbl-detail-learner"]');
      expect(learner?.textContent).toContain('gcid-phyllis');
    });

    it('renders the supervisor name + mailto:email', () => {
      expect(element.querySelector('[data-testid="wbl-detail-supervisor"]')?.textContent).toContain(
        'Jane Tan',
      );
      const email = element.querySelector('[data-testid="wbl-detail-supervisor-email"]');
      expect(email?.getAttribute('href')).toBe('mailto:jane.tan@acme.example');
    });

    it('renders the hours fraction + progress bar with aria-valuenow', () => {
      const hours = element.querySelector('[data-testid="wbl-detail-hours"]');
      expect(hours?.textContent).toContain('80');
      expect(hours?.textContent).toContain('240');
      const progress = element.querySelector('[data-testid="wbl-detail-progress"]');
      // 80 / 240 → 33%
      expect(progress?.getAttribute('aria-valuenow')).toBe('33');
      expect(progress?.getAttribute('role')).toBe('progressbar');
    });

    it('renders the back-to-list breadcrumb link', () => {
      const back = element.querySelector('[data-testid="wbl-detail-back-link"]');
      expect(back?.tagName).toBe('A');
      expect(back?.getAttribute('href')).toBe('/r/wbl');
    });

    it('renders the bottom back CTA + Withdraw CTA enabled', () => {
      const back = element.querySelector('[data-testid="wbl-detail-back-cta"]');
      const withdraw = element.querySelector('[data-testid="wbl-detail-withdraw"]');
      expect(back).not.toBeNull();
      expect(withdraw).not.toBeNull();
      expect(withdraw?.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('terminal-state Withdraw CTA', () => {
    it('disables the Withdraw CTA on a COMPLETED placement', () => {
      const { fixture, httpMock } = setup('p-done');
      httpMock.expectOne(url('p-done')).flush(
        backendStub({
          id: 'p-done',
          state: 'COMPLETED',
          hours_completed: 240,
        }),
      );
      fixture.detectChanges();
      const withdraw = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-withdraw"]',
      );
      expect(withdraw?.hasAttribute('disabled')).toBe(true);
      httpMock.verify();
    });

    it('disables the Withdraw CTA on a WITHDRAWN placement', () => {
      const { fixture, httpMock } = setup('p-x');
      httpMock.expectOne(url('p-x')).flush(
        backendStub({
          id: 'p-x',
          state: 'WITHDRAWN',
          evaluator_notes: '[WITHDRAWN] learner moved abroad',
        }),
      );
      fixture.detectChanges();
      const withdraw = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-withdraw"]',
      );
      expect(withdraw?.hasAttribute('disabled')).toBe(true);
      const notes = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-notes"]',
      );
      expect(notes?.textContent).toContain('[WITHDRAWN]');
      httpMock.verify();
    });
  });

  describe('confirm-gated withdraw', () => {
    it('fires NO DELETE when the confirm dialog is cancelled', async () => {
      const { fixture, httpMock } = setup('p-cspo-001');
      httpMock.expectOne(url('p-cspo-001')).flush(backendStub());
      fixture.detectChanges();
      const confirmDialog = TestBed.inject(ConfirmDialogService);

      const withdraw = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-withdraw"]',
      ) as HTMLButtonElement;
      withdraw.click();
      // Resolve the dialog with `false` (user cancelled).
      confirmDialog._resolve(false);
      await Promise.resolve();
      fixture.detectChanges();

      // afterEach httpMock.verify() asserts no outstanding DELETE fired.
      httpMock.verify();
    });

    it('fires DELETE + transitions to WITHDRAWN when confirmed', async () => {
      const { fixture, httpMock } = setup('p-cspo-001');
      httpMock.expectOne(url('p-cspo-001')).flush(backendStub());
      fixture.detectChanges();
      const confirmDialog = TestBed.inject(ConfirmDialogService);

      const withdraw = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-withdraw"]',
      ) as HTMLButtonElement;
      withdraw.click();
      confirmDialog._resolve(true);
      await Promise.resolve();
      fixture.detectChanges();

      const del = httpMock.expectOne(url('p-cspo-001'));
      expect(del.request.method).toBe('DELETE');
      del.flush(
        backendStub({
          state: 'WITHDRAWN',
          evaluator_notes: '[WITHDRAWN] DELETE /api/v1/wbl-placements',
        }),
      );
      fixture.detectChanges();

      const badge = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-state-p-cspo-001"]',
      );
      expect(badge?.textContent?.trim()).toBe('WITHDRAWN');
      // Now terminal — Withdraw CTA is disabled.
      const cta = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-withdraw"]',
      );
      expect(cta?.hasAttribute('disabled')).toBe(true);
      httpMock.verify();
    });
  });

  describe('PATCH form', () => {
    let fixture: ComponentFixture<WblDetailComponent>;
    let httpMock: HttpTestingController;
    let element: HTMLElement;

    beforeEach(() => {
      const built = setup('p-cspo-001');
      fixture = built.fixture;
      httpMock = built.httpMock;
      // hours_completed 80 / 240, IN_PROGRESS — an open, editable placement.
      httpMock.expectOne(url('p-cspo-001')).flush(backendStub());
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the PATCH form with hours + notes inputs', () => {
      expect(element.querySelector('[data-testid="wbl-detail-patch-form"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="wbl-detail-hours-input"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="wbl-detail-notes-input"]')).not.toBeNull();
    });

    it('pre-fills the form from the loaded placement', () => {
      expect(fixture.componentInstance.patchDraft.getRawValue()).toEqual({
        hours_completed: 80,
        evaluator_notes: '',
      });
    });

    it('PATCHes only the changed fields + replaces in-place on 2xx', () => {
      fixture.componentInstance.patchDraft.setValue({
        hours_completed: 160,
        evaluator_notes: 'midpoint review: on track',
      });
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="wbl-detail-patch-submit"]')!.click();
      fixture.detectChanges();

      const patch = httpMock.expectOne(url('p-cspo-001'));
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({
        hours_completed: 160,
        evaluator_notes: 'midpoint review: on track',
      });
      patch.flush(
        backendStub({
          hours_completed: 160,
          evaluator_notes: 'midpoint review: on track',
        }),
      );
      fixture.detectChanges();

      const hours = element.querySelector('[data-testid="wbl-detail-hours"]');
      expect(hours?.textContent).toContain('160');
      const progress = element.querySelector('[data-testid="wbl-detail-progress"]');
      // 160 / 240 → 67%
      expect(progress?.getAttribute('aria-valuenow')).toBe('67');
      httpMock.verify();
    });

    it('omits an unchanged field from the PATCH body', () => {
      // Only change the notes; hours stays at the loaded 80.
      fixture.componentInstance.patchDraft.setValue({
        hours_completed: 80,
        evaluator_notes: 'supervisor signed off week 4',
      });
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="wbl-detail-patch-submit"]')!.click();
      fixture.detectChanges();

      const patch = httpMock.expectOne(url('p-cspo-001'));
      expect(patch.request.body).toEqual({
        evaluator_notes: 'supervisor signed off week 4',
      });
      patch.flush(backendStub({ evaluator_notes: 'supervisor signed off week 4' }));
      fixture.detectChanges();
      httpMock.verify();
    });

    it('surfaces an inline error banner on a 409 (over-hours / closed)', () => {
      fixture.componentInstance.patchDraft.setValue({
        hours_completed: 9999,
        evaluator_notes: '',
      });
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="wbl-detail-patch-submit"]')!.click();
      fixture.detectChanges();

      const patch = httpMock.expectOne(url('p-cspo-001'));
      patch.flush(
        { error: 'wbl: hours_completed exceeds hours_required' },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="wbl-detail-patch-error"]');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('exceeds');
      httpMock.verify();
    });

    it('fires NO PATCH when nothing changed', () => {
      // Submit without changing the pre-filled values.
      element.querySelector<HTMLButtonElement>('[data-testid="wbl-detail-patch-submit"]')!.click();
      fixture.detectChanges();
      // afterEach httpMock.verify() asserts no PATCH fired.
      httpMock.verify();
    });
  });

  describe('PATCH form — terminal lock-out', () => {
    it('locks out the PATCH form on a COMPLETED placement', () => {
      const { fixture, httpMock } = setup('p-done');
      httpMock.expectOne(url('p-done')).flush(
        backendStub({
          id: 'p-done',
          state: 'COMPLETED',
          hours_completed: 240,
        }),
      );
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="wbl-detail-patch-locked"]')).not.toBeNull();
      const submit = element.querySelector<HTMLButtonElement>(
        '[data-testid="wbl-detail-patch-submit"]',
      );
      expect(submit?.disabled).toBe(true);
      httpMock.verify();
    });
  });

  describe('error branch', () => {
    it('renders the 404 not-found banner with Retry CTA', () => {
      const { fixture, httpMock } = setup('missing');
      httpMock.expectOne(url('missing')).flush('not found', {
        status: 404,
        statusText: 'Not Found',
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const err = element.querySelector('[data-testid="wbl-detail-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector('[data-testid="wbl-detail-retry"]');
      expect(retry).not.toBeNull();
      httpMock.verify();
    });

    it('retry CTA refires the GET with the same id', () => {
      const { fixture, httpMock } = setup('p-1');
      httpMock.expectOne(url('p-1')).flush('upstream', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      fixture.detectChanges();
      const retry = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-retry"]',
      ) as HTMLButtonElement;
      retry.click();
      httpMock.expectOne(url('p-1')).flush(backendStub({ id: 'p-1' }));
      fixture.detectChanges();
      const panel = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-panel-p-1"]',
      );
      expect(panel).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations', async () => {
      const { fixture, httpMock } = setup('p-cspo-001');
      httpMock.expectOne(url('p-cspo-001')).flush(backendStub());
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);
  });

  // ── Augmented coverage (new) ──────────────────────────────────────────

  describe('loading state', () => {
    it('renders the loading skeleton before the GET resolves', () => {
      const { fixture, httpMock } = setup('p-loading');
      // Do NOT flush yet — the component is mid-fetch.
      expect(fixture.componentInstance.isLoading()).toBe(true);
      const el = fixture.nativeElement as HTMLElement;
      const loading = el.querySelector('[data-testid="wbl-detail-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      // No panel + no error while loading.
      expect(el.querySelector('[data-testid="wbl-detail-error"]')).toBeNull();
      // Drain the pending GET so afterEach verify() stays clean.
      httpMock.expectOne(url('p-loading')).flush(backendStub({ id: 'p-loading' }));
      fixture.detectChanges();
      httpMock.verify();
    });

    it('always echoes the :id signal in the header even mid-load', () => {
      const { fixture, httpMock } = setup('p-headerid');
      const idEl = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-id"]',
      );
      expect(idEl?.textContent?.trim()).toBe('p-headerid');
      httpMock.expectOne(url('p-headerid')).flush(backendStub({ id: 'p-headerid' }));
      fixture.detectChanges();
      httpMock.verify();
    });
  });

  describe('SCHEDULED open state', () => {
    let fixture: ComponentFixture<WblDetailComponent>;
    let httpMock: HttpTestingController;
    let element: HTMLElement;

    beforeEach(() => {
      const built = setup('p-sched');
      fixture = built.fixture;
      httpMock = built.httpMock;
      httpMock.expectOne(url('p-sched')).flush(
        backendStub({
          id: 'p-sched',
          state: 'SCHEDULED',
          hours_completed: 0,
        }),
      );
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the badge-info variant for SCHEDULED', () => {
      const badge = element.querySelector('[data-testid="wbl-detail-state-p-sched"]');
      expect(badge?.className).toContain('badge-info');
      expect(badge?.textContent?.trim()).toBe('SCHEDULED');
    });

    it('keeps the Withdraw CTA enabled + form editable while open', () => {
      const withdraw = element.querySelector('[data-testid="wbl-detail-withdraw"]');
      expect(withdraw?.hasAttribute('disabled')).toBe(false);
      expect(fixture.componentInstance.canEdit()).toBe(true);
      // No terminal lock-out banner on an open placement.
      expect(element.querySelector('[data-testid="wbl-detail-patch-locked"]')).toBeNull();
    });

    it('shows 0% progress for a freshly-scheduled placement', () => {
      const progress = element.querySelector('[data-testid="wbl-detail-progress"]');
      expect(progress?.getAttribute('aria-valuenow')).toBe('0');
      expect(fixture.componentInstance.completionPct()).toBe(0);
    });

    it('exposes hoursRequired as the input upper bound', () => {
      expect(fixture.componentInstance.hoursRequired()).toBe(240);
      const input = element.querySelector('[data-testid="wbl-detail-hours-input"]');
      expect(input?.getAttribute('max')).toBe('240');
    });
  });

  describe('badge() helper', () => {
    it('maps every FSM state to its design-system variant', () => {
      const { fixture, httpMock } = setup('p-badge');
      httpMock.expectOne(url('p-badge')).flush(backendStub({ id: 'p-badge' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      expect(c.badge('SCHEDULED')).toBe('badge-info');
      expect(c.badge('IN_PROGRESS')).toBe('badge-success');
      expect(c.badge('COMPLETED')).toBe('badge-success');
      expect(c.badge('WITHDRAWN')).toBe('badge-neutral');
      httpMock.verify();
    });
  });

  describe('error mapping by status', () => {
    it('maps 401 to the unauthorised i18n key', () => {
      const { fixture, httpMock } = setup('p-401');
      httpMock.expectOne(url('p-401')).flush('nope', {
        status: 401,
        statusText: 'Unauthorized',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('rplus.wblDetail.errorUnauthorised');
      httpMock.verify();
    });

    it('maps 403 to the unauthorised i18n key', () => {
      const { fixture, httpMock } = setup('p-403');
      httpMock.expectOne(url('p-403')).flush('forbidden', {
        status: 403,
        statusText: 'Forbidden',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('rplus.wblDetail.errorUnauthorised');
      httpMock.verify();
    });

    it('maps a 5xx to the upstream i18n key', () => {
      const { fixture, httpMock } = setup('p-500');
      httpMock.expectOne(url('p-500')).flush('boom', {
        status: 500,
        statusText: 'Internal Server Error',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('rplus.wblDetail.errorUpstream');
      httpMock.verify();
    });

    it('maps a 400 to the generic i18n key', () => {
      const { fixture, httpMock } = setup('p-400');
      httpMock.expectOne(url('p-400')).flush('bad request', {
        status: 400,
        statusText: 'Bad Request',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('rplus.wblDetail.errorGeneric');
      // The 404 path is asserted separately; this confirms the catch-all.
      httpMock.verify();
    });
  });

  describe('withdraw error path', () => {
    it('confirm → DELETE error → renders the error banner', async () => {
      const { fixture, httpMock } = setup('p-werr');
      httpMock.expectOne(url('p-werr')).flush(backendStub({ id: 'p-werr' }));
      fixture.detectChanges();
      const confirmDialog = TestBed.inject(ConfirmDialogService);

      const withdraw = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-withdraw"]',
      ) as HTMLButtonElement;
      withdraw.click();
      confirmDialog._resolve(true);
      await Promise.resolve();
      fixture.detectChanges();

      const del = httpMock.expectOne(url('p-werr'));
      expect(del.request.method).toBe('DELETE');
      del.flush('upstream', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      fixture.detectChanges();

      // The component flips to the error state (writePending cleared).
      const err = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-error"]',
      );
      expect(err).not.toBeNull();
      expect(fixture.componentInstance.errorKey()).toBe('rplus.wblDetail.errorUpstream');
      expect(fixture.componentInstance.isWithdrawPending()).toBe(false);
      httpMock.verify();
    });

    it('does NOT fire DELETE again while a withdraw is already pending', async () => {
      const { fixture, httpMock } = setup('p-wpend');
      httpMock.expectOne(url('p-wpend')).flush(backendStub({ id: 'p-wpend' }));
      fixture.detectChanges();
      const confirmDialog = TestBed.inject(ConfirmDialogService);

      // First withdraw → confirm → DELETE in flight (not flushed).
      const c = fixture.componentInstance;
      void c.withdraw();
      confirmDialog._resolve(true);
      await Promise.resolve();
      fixture.detectChanges();
      const del = httpMock.expectOne(url('p-wpend'));
      expect(c.isWithdrawPending()).toBe(true);

      // A re-entrant withdraw() while pending must short-circuit (guard).
      await c.withdraw();
      // Still exactly one DELETE outstanding — resolve it.
      del.flush(backendStub({ id: 'p-wpend', state: 'WITHDRAWN' }));
      fixture.detectChanges();
      expect(c.isWithdrawPending()).toBe(false);
      httpMock.verify();
    });
  });

  describe('savePatch guards', () => {
    it('blocks submit + marks touched when the form is invalid', () => {
      const { fixture, httpMock } = setup('p-inv');
      httpMock.expectOne(url('p-inv')).flush(backendStub({ id: 'p-inv' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      // Drive an invalid value (negative hours fails Validators.min(0)).
      c.patchDraft.setValue({
        hours_completed: -5,
        evaluator_notes: 'x',
      });
      fixture.detectChanges();
      expect(c.patchDraft.invalid).toBe(true);

      c.savePatch();
      fixture.detectChanges();
      // markAllAsTouched fired; no PATCH issued (afterEach verify proves it).
      expect(c.patchDraft.touched).toBe(true);
      httpMock.verify();
    });

    it('clears the inline patch banner when a fresh save starts', () => {
      const { fixture, httpMock } = setup('p-clr');
      httpMock.expectOne(url('p-clr')).flush(backendStub({ id: 'p-clr' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;

      // First save → 409 → banner populated.
      c.patchDraft.setValue({ hours_completed: 9999, evaluator_notes: '' });
      fixture.detectChanges();
      c.savePatch();
      httpMock
        .expectOne(url('p-clr'))
        .flush({ error: 'over hours' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(c.patchError()).toContain('over hours');

      // Second save (different valid value) → banner cleared while in flight.
      c.patchDraft.setValue({ hours_completed: 120, evaluator_notes: '' });
      fixture.detectChanges();
      c.savePatch();
      fixture.detectChanges();
      expect(c.patchError()).toBeNull();
      httpMock.expectOne(url('p-clr')).flush(backendStub({ id: 'p-clr', hours_completed: 120 }));
      fixture.detectChanges();
      httpMock.verify();
    });

    it('surfaces the inner BE message field when no error string present', () => {
      const { fixture, httpMock } = setup('p-msg');
      httpMock.expectOne(url('p-msg')).flush(backendStub({ id: 'p-msg' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.patchDraft.setValue({ hours_completed: 5000, evaluator_notes: '' });
      fixture.detectChanges();
      c.savePatch();
      // Envelope carries only `message`, not `error`.
      httpMock
        .expectOne(url('p-msg'))
        .flush({ message: 'placement closed for edits' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      const banner = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-patch-error"]',
      );
      expect(banner?.textContent).toContain('placement closed for edits');
      httpMock.verify();
    });

    it('surfaces the HttpErrorResponse.message when the body has no JSON envelope', () => {
      // When the BE returns a plain-text body (no { error } / { message }
      // envelope), Angular's HttpErrorResponse still carries its own
      // top-level `.message` ("Http failure response for …"), which
      // extractErrorMessage picks up BEFORE the "Request failed" fallback.
      // Characterise the real behaviour rather than the unreachable fallback.
      const { fixture, httpMock } = setup('p-fb');
      httpMock.expectOne(url('p-fb')).flush(backendStub({ id: 'p-fb' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.patchDraft.setValue({ hours_completed: 5000, evaluator_notes: '' });
      fixture.detectChanges();
      c.savePatch();
      httpMock.expectOne(url('p-fb')).flush('', {
        status: 500,
        statusText: 'Internal Server Error',
      });
      fixture.detectChanges();
      const banner = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="wbl-detail-patch-error"]',
      );
      expect(banner?.textContent).toContain('Http failure response');
      // Non-empty inline banner was rendered (error path exercised).
      expect((c.patchError() ?? '').length).toBeGreaterThan(0);
      httpMock.verify();
    });
  });

  describe('PATCH trims notes + re-seeds the draft', () => {
    it('trims whitespace before comparing + sends the trimmed value', () => {
      const { fixture, httpMock } = setup('p-trim');
      httpMock.expectOne(url('p-trim')).flush(backendStub({ id: 'p-trim' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.patchDraft.setValue({
        hours_completed: 80,
        evaluator_notes: '  week 4 review  ',
      });
      fixture.detectChanges();
      c.savePatch();
      const patch = httpMock.expectOne(url('p-trim'));
      expect(patch.request.body).toEqual({ evaluator_notes: 'week 4 review' });
      patch.flush(backendStub({ id: 'p-trim', evaluator_notes: 'week 4 review' }));
      fixture.detectChanges();
      // Draft re-seeded to the persisted value.
      expect(c.patchDraft.getRawValue()).toEqual({
        hours_completed: 80,
        evaluator_notes: 'week 4 review',
      });
      httpMock.verify();
    });
  });

  // ── Branch-focused augmentation (uncovered conditional arms) ───────────

  describe('computed signals in non-success states', () => {
    it('errorKey() returns "" while NOT in the error state (loading)', () => {
      // Mid-load, loadState is { status: 'loading' } — the ternary in
      // errorKey() takes the FALSY arm (line 126 `: ''`).
      const { fixture, httpMock } = setup('p-load-ek');
      const c = fixture.componentInstance;
      expect(c.isLoading()).toBe(true);
      expect(c.errorKey()).toBe('');
      // Drain the pending GET so afterEach verify() stays clean.
      httpMock.expectOne(url('p-load-ek')).flush(backendStub({ id: 'p-load-ek' }));
      fixture.detectChanges();
      // Still '' once success has landed (status !== 'error').
      expect(c.errorKey()).toBe('');
      httpMock.verify();
    });

    it('completionPct/canWithdraw/hoursRequired collapse with no placement', () => {
      // In the error state placement() is null — the `if (!p)` guards in
      // completionPct (line 136), canWithdraw (line 142) and the `?? 0`
      // fallback in hoursRequired (line 165) all take the null arm.
      const { fixture, httpMock } = setup('p-noplace');
      httpMock.expectOne(url('p-noplace')).flush('nope', {
        status: 404,
        statusText: 'Not Found',
      });
      fixture.detectChanges();
      const c = fixture.componentInstance;
      expect(c.isError()).toBe(true);
      expect(c.placement()).toBeNull();
      expect(c.completionPct()).toBe(0);
      expect(c.canWithdraw()).toBe(false);
      expect(c.canEdit()).toBe(false);
      expect(c.hoursRequired()).toBe(0);
      httpMock.verify();
    });
  });

  describe('savePatch guard short-circuits', () => {
    it('is a no-op when there is no loaded placement', () => {
      // loadState is loading → placement() is null → savePatch returns at
      // the first guard (`!p`) and fires NO PATCH.
      const { fixture, httpMock } = setup('p-nop');
      const c = fixture.componentInstance;
      expect(c.placement()).toBeNull();
      c.savePatch();
      // No PATCH issued; drain the still-pending GET.
      httpMock.expectOne(url('p-nop')).flush(backendStub({ id: 'p-nop' }));
      fixture.detectChanges();
      httpMock.verify();
    });

    it('PATCHes hours only — sends the trimmed-empty notes default unchanged', () => {
      // hours changed, notes left at the loaded '' (no `?? ''` needed but
      // the trim path runs). Confirms only the hours key goes on the wire.
      const { fixture, httpMock } = setup('p-honly');
      httpMock.expectOne(url('p-honly')).flush(backendStub({ id: 'p-honly' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.patchDraft.setValue({ hours_completed: 120, evaluator_notes: '' });
      fixture.detectChanges();
      c.savePatch();
      const patch = httpMock.expectOne(url('p-honly'));
      expect(patch.request.body).toEqual({ hours_completed: 120 });
      patch.flush(backendStub({ id: 'p-honly', hours_completed: 120 }));
      fixture.detectChanges();
      httpMock.verify();
    });

    it('coerces a null evaluator_notes via the `?? ""` fallback', () => {
      // Drive evaluator_notes to null directly (bypassing the typed form
      // value) so the `(raw.evaluator_notes ?? '')` nullish arm (line 219)
      // fires — null !== '' loaded value, so an empty-string notes patch
      // is sent (characterising the coalesce, not the typed-form happy path).
      const { fixture, httpMock } = setup('p-nullnotes');
      httpMock
        .expectOne(url('p-nullnotes'))
        .flush(backendStub({ id: 'p-nullnotes', evaluator_notes: 'prior' }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      // Loaded notes is 'prior'; set the control value to null.
      c.patchDraft.patchValue({ hours_completed: 80 });
      c.patchDraft.get('evaluator_notes')!.setValue(null);
      fixture.detectChanges();
      c.savePatch();
      const patch = httpMock.expectOne(url('p-nullnotes'));
      // null → '' (trimmed) → differs from 'prior' → sent as empty string.
      expect(patch.request.body).toEqual({ evaluator_notes: '' });
      patch.flush(backendStub({ id: 'p-nullnotes', evaluator_notes: '' }));
      fixture.detectChanges();
      httpMock.verify();
    });
  });

  describe('extractErrorMessage shape coverage (via savePatch error)', () => {
    function primeEditable(id: string): {
      c: WblDetailComponent;
      httpMock: HttpTestingController;
      fixture: ComponentFixture<WblDetailComponent>;
    } {
      const { fixture, httpMock } = setup(id);
      httpMock.expectOne(url(id)).flush(backendStub({ id }));
      fixture.detectChanges();
      const c = fixture.componentInstance;
      // Force a changed value so savePatch actually fires a PATCH.
      c.patchDraft.setValue({ hours_completed: 5000, evaluator_notes: '' });
      fixture.detectChanges();
      return { c, httpMock, fixture };
    }

    it('reads the inner envelope `{ error: { error } }` (nested string)', () => {
      const { c, httpMock, fixture } = primeEditable('p-nest-err');
      c.savePatch();
      httpMock
        .expectOne(url('p-nest-err'))
        .flush({ error: 'inner conflict message' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(c.patchError()).toBe('inner conflict message');
      httpMock.verify();
    });

    it('falls through inner.error → inner.message when inner.error absent', () => {
      const { c, httpMock, fixture } = primeEditable('p-nest-msg');
      c.savePatch();
      // Body is { message }, so HttpErrorResponse.error = { message } —
      // inner.error is undefined (branch 31 false), inner.message is taken.
      httpMock
        .expectOne(url('p-nest-msg'))
        .flush({ message: 'inner fallback message' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(c.patchError()).toBe('inner fallback message');
      httpMock.verify();
    });

    it('falls through to e.message when the inner envelope has neither field', () => {
      // Body is an object that carries NEITHER `error` nor `message` — the
      // inner-object block is entered (e.error is an object) but both inner
      // checks fail (line 340 false arm), then the top-level `e.error`
      // string check fails (e.error is an object), so the chain falls
      // through to the HttpErrorResponse.message string.
      const { c, httpMock, fixture } = primeEditable('p-nofield');
      c.savePatch();
      httpMock
        .expectOne(url('p-nofield'))
        .flush(
          { detail: 'unrecognised envelope', code: 42 },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();
      // No inner.error / inner.message / top e.error → falls to e.message.
      expect(c.patchError()).toContain('Http failure response');
      httpMock.verify();
    });

    it('reads a top-level string `e.error` when the body is a bare string', () => {
      // A non-JSON string body → HttpErrorResponse.error is the raw string
      // (not an object) → the inner-object block is skipped → the top-level
      // `typeof e.error === 'string'` arm (line 344) is taken.
      const { c, httpMock, fixture } = primeEditable('p-topstr');
      c.savePatch();
      httpMock.expectOne(url('p-topstr')).flush('plain text error body', {
        status: 409,
        statusText: 'Conflict',
      });
      fixture.detectChanges();
      // Angular preserves the raw string body on HttpErrorResponse.error.
      expect(c.patchError()).toBe('plain text error body');
      httpMock.verify();
    });
  });

  describe('errorKeyFor — status-0 network failure maps to generic', () => {
    it('an ErrorEvent (status 0) yields the generic i18n key', () => {
      // A transport-level failure (ErrorEvent) gives HttpErrorResponse
      // status 0 — a number, but neither 404 / 401 / 403 nor >= 500 — so
      // errorKeyFor falls through all the numeric branches to errorGeneric.
      const { fixture, httpMock } = setup('p-neterr');
      httpMock.expectOne(url('p-neterr')).error(new ProgressEvent('network error'));
      fixture.detectChanges();
      expect(fixture.componentInstance.isError()).toBe(true);
      expect(fixture.componentInstance.errorKey()).toBe('rplus.wblDetail.errorGeneric');
      httpMock.verify();
    });
  });
});

// ── Pure model helper coverage ─────────────────────────────────────────

import {
  completionPercent,
  isPlacement,
  isPlacementState,
  stateBadgeVariant,
} from './wbl-detail.model';

describe('wbl-detail.model helpers', () => {
  describe('stateBadgeVariant', () => {
    it('maps each state', () => {
      expect(stateBadgeVariant('SCHEDULED')).toBe('badge-info');
      expect(stateBadgeVariant('IN_PROGRESS')).toBe('badge-success');
      expect(stateBadgeVariant('COMPLETED')).toBe('badge-success');
      expect(stateBadgeVariant('WITHDRAWN')).toBe('badge-neutral');
    });
  });

  describe('completionPercent', () => {
    it('rounds the percentage', () => {
      expect(completionPercent(80, 240)).toBe(33);
      expect(completionPercent(160, 240)).toBe(67);
      expect(completionPercent(120, 240)).toBe(50);
    });

    it('collapses zero / negative required hours to 0', () => {
      expect(completionPercent(40, 0)).toBe(0);
      expect(completionPercent(40, -10)).toBe(0);
    });

    it('clamps below 0 and above 100', () => {
      expect(completionPercent(-5, 100)).toBe(0);
      expect(completionPercent(500, 100)).toBe(100);
    });
  });

  describe('isPlacementState', () => {
    it('accepts valid FSM values', () => {
      expect(isPlacementState('SCHEDULED')).toBe(true);
      expect(isPlacementState('IN_PROGRESS')).toBe(true);
      expect(isPlacementState('COMPLETED')).toBe(true);
      expect(isPlacementState('WITHDRAWN')).toBe(true);
    });

    it('rejects anything else', () => {
      expect(isPlacementState('PENDING')).toBe(false);
      expect(isPlacementState(42)).toBe(false);
      expect(isPlacementState(null)).toBe(false);
    });
  });

  describe('isPlacement', () => {
    const valid = {
      id: 'p1',
      tenantId: 't1',
      gcid: 'g1',
      courseId: 'c1',
      hostOrgName: 'Acme',
      supervisorName: 'Jane',
      supervisorEmail: 'jane@acme.example',
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-08-31T00:00:00Z',
      hoursRequired: 240,
      hoursCompleted: 80,
      state: 'IN_PROGRESS',
      evaluatorNotes: '',
      createdAt: '2026-05-26T10:00:00Z',
      updatedAt: '2026-05-26T11:00:00Z',
    };

    it('accepts a structurally-sound placement', () => {
      expect(isPlacement(valid)).toBe(true);
    });

    it('rejects null + non-object', () => {
      expect(isPlacement(null)).toBe(false);
      expect(isPlacement('nope')).toBe(false);
      expect(isPlacement(123)).toBe(false);
    });

    it('rejects a missing field', () => {
      const { gcid, ...rest } = valid;
      void gcid;
      expect(isPlacement(rest)).toBe(false);
    });

    it('rejects an invalid state value', () => {
      expect(isPlacement({ ...valid, state: 'BOGUS' })).toBe(false);
    });

    it('rejects a wrong-typed numeric field', () => {
      expect(isPlacement({ ...valid, hoursRequired: '240' })).toBe(false);
    });
  });
});
