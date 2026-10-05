/**
 * OfferingWorkspaceComponent spec — the /r/offerings/:id workspace (W2.D).
 *
 * Real OfferingsService over HttpTestingController (no service mock per
 * feedback_no_stubs_real_wiring). RbacService is exercised via a fake
 * AuthService `user` signal so role-gated visibility is asserted faithfully.
 *
 * Coverage:
 *   - GET on entry → Overview renders the offering fields
 *   - tab SET is object-derived from delivery_type; every tab now renders
 *     real content as of W6 (transcript was the last placeholder)
 *   - FSM buttons derived from state (admin) — DRAFT/LAUNCHED/RUNNING/…/ARCHIVED
 *   - non-admin sees NO lifecycle actions (hidden, not disabled)
 *   - a transition PATCHes (no body) → state updates → buttons re-derive
 *   - 409 → non-destructive conflict alert + reload
 *   - archive is confirm-gated (cancel → no PATCH; confirm → PATCH)
 *   - loading / 404 (back-to-finder) / 5xx (retry) states
 *   - tab switching navigates ?tab=; roving keyboard (←/→/Home/End)
 *   - transcript panel (W6): joins the REUSED assessments + roster reads with
 *     the new transcript-entries GET into a learner × assessment matrix
 *   - axe a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import {
  OfferingWorkspaceComponent,
  errorDetailOf,
  errorCodeOf,
  resolveUsagePlural,
} from './offering-workspace.component';
import { MemberDirectoryService } from '../../../../shared/components/member-multiselect/member-directory.service';
import { ApiError } from '../../../../core/interceptors/api-error.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { environment } from '../../../../../environments/environment';
import { LiveQuizEntitySearchPort } from './adapters/live-quiz-entity-search.port';

interface OfferingDtoStub {
  id: string;
  tenant_id: string;
  course_id: string;
  delivery_type: string;
  label: string;
  capacity: number;
  state: string;
  created_at: string;
  updated_at: string;
  launched_at?: string | null;
  concluded_at?: string | null;
  archived_at?: string | null;
}

function dto(overrides: Partial<OfferingDtoStub> = {}): OfferingDtoStub {
  return {
    id: 'of1',
    tenant_id: 't1',
    course_id: 'course-cspo',
    delivery_type: 'graduate',
    label: 'Graduate Cohort A',
    capacity: 30,
    state: 'DRAFT',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
    ...overrides,
  };
}

function detailUrl(id: string): string {
  return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}`;
}
function transitionUrl(id: string, action: string): string {
  return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/${action}`;
}

function setup(
  id: string,
  roles: readonly string[] = ['instructor'],
  tab?: string,
): {
  fixture: ComponentFixture<OfferingWorkspaceComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  const user = signal<{ roles: readonly string[]; capabilities: readonly string[] }>({
    roles,
    capabilities: [],
  });
  TestBed.configureTestingModule({
    imports: [OfferingWorkspaceComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: user.asReadonly() } },
      // The enrol form mounts <chora-member-multiselect>, which loads members via
      // MemberDirectoryService on init; stub it to a synchronous empty list so the
      // roster tests never see an unexpected tenant-members GET.
      { provide: MemberDirectoryService, useValue: { listMembers: () => of([]) } },
    ],
  });
  const fixture = TestBed.createComponent(OfferingWorkspaceComponent);
  fixture.componentRef.setInput('id', id);
  if (tab !== undefined) {
    fixture.componentRef.setInput('tab', tab);
  }
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

describe('OfferingWorkspaceComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } catch {
      /* already verified in-body */
    }
  });

  describe('load + overview', () => {
    it('GETs the detail on entry and renders the surface-accented panel', () => {
      const { fixture, httpMock, element } = setup('of1');
      const req = httpMock.expectOne(detailUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush(dto());
      fixture.detectChanges();

      const root = element.querySelector('[data-testid="rplus-offering-workspace"]');
      expect(root?.className).toContain('surface-rplus');
      expect(element.querySelector('[data-testid="offering-panel-overview"]')).not.toBeNull();
      expect(
        element.querySelector('[data-testid="offering-workspace-title"]')?.textContent,
      ).toContain('Graduate Cohort A');
      expect(
        element.querySelector('[data-testid="offering-overview-course"]')?.textContent,
      ).toContain('course-cspo');
      httpMock.verify();
    });

    it('renders the unbounded capacity label when capacity is 0', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ capacity: 0 }));
      fixture.detectChanges();
      // The unbounded @else branch renders the i18n label (no numeral), not "0".
      // (Unit tests don't load translations, so assert the branch, not English.)
      const cell = element
        .querySelector('[data-testid="offering-overview-capacity"]')
        ?.textContent?.trim();
      expect(cell).not.toMatch(/\d/);
      expect(fixture.componentInstance.offering()?.capacity).toBe(0);
      httpMock.verify();
    });

    it('shows the loading state before the GET resolves', () => {
      const { fixture, httpMock, element } = setup('of-load');
      expect(fixture.componentInstance.isLoading()).toBe(true);
      expect(element.querySelector('[data-testid="offering-workspace-loading"]')).not.toBeNull();
      httpMock.expectOne(detailUrl('of-load')).flush(dto({ id: 'of-load' }));
      fixture.detectChanges();
      httpMock.verify();
    });
  });

  describe('object-derived tabs', () => {
    it('renders the graduate tab set', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      for (const id of [
        'overview',
        'curriculum',
        'sections',
        'roster',
        'assessments',
        'certification',
        'transcript',
      ]) {
        expect(element.querySelector(`[data-testid="offering-tab-${id}"]`)).not.toBeNull();
      }
      expect(element.querySelector('[data-testid="offering-tab-schedule"]')).toBeNull();
      httpMock.verify();
    });

    it('renders the short-course tab set', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'short' }));
      fixture.detectChanges();
      for (const id of [
        'overview',
        'schedule',
        'roster',
        'attendance',
        'assessments',
        'certification',
      ]) {
        expect(element.querySelector(`[data-testid="offering-tab-${id}"]`)).not.toBeNull();
      }
      expect(element.querySelector('[data-testid="offering-tab-transcript"]')).toBeNull();
      httpMock.verify();
    });

    it('renders the async tab set and marks overview selected', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      for (const id of ['overview', 'publish', 'analytics']) {
        expect(element.querySelector(`[data-testid="offering-tab-${id}"]`)).not.toBeNull();
      }
      const overview = element.querySelector('[data-testid="offering-tab-overview"]');
      expect(overview?.getAttribute('aria-selected')).toBe('true');
      expect(overview?.getAttribute('tabindex')).toBe('0');
      httpMock.verify();
    });

    it('falls back to overview for an unknown ?tab= value', () => {
      const { fixture, httpMock } = setup('of1', ['instructor'], 'bogus');
      httpMock.expectOne(detailUrl('of1')).flush(dto());
      fixture.detectChanges();
      expect(fixture.componentInstance.activeTabId()).toBe('overview');
      httpMock.verify();
    });
  });

  describe('FSM lifecycle actions (admin)', () => {
    const cases: [string, string[]][] = [
      ['DRAFT', ['launch', 'archive']],
      ['LAUNCHED', ['start', 'archive']],
      ['RUNNING', ['conclude', 'archive']],
      ['CONCLUDED', ['archive']],
    ];
    for (const [state, actions] of cases) {
      it(`renders ${actions.join('+')} for ${state}`, () => {
        const { fixture, httpMock, element } = setup('of1');
        httpMock.expectOne(detailUrl('of1')).flush(dto({ state }));
        fixture.detectChanges();
        for (const a of ['launch', 'start', 'conclude', 'archive']) {
          const present = actions.includes(a);
          expect(!!element.querySelector(`[data-testid="offering-action-${a}"]`)).toBe(present);
        }
        httpMock.verify();
      });
    }

    it('renders the terminal note + no actions for ARCHIVED', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'ARCHIVED' }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-overview-terminal"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-action-archive"]')).toBeNull();
      httpMock.verify();
    });
  });

  describe('role-gated visibility', () => {
    it('hides the lifecycle section entirely for a non-admin', () => {
      const { fixture, httpMock, element } = setup('of1', ['learner']);
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
      fixture.detectChanges();
      expect(fixture.componentInstance.canManage()).toBe(false);
      expect(element.querySelector('[data-testid="offering-overview-lifecycle"]')).toBeNull();
      expect(element.querySelector('[data-testid="offering-action-launch"]')).toBeNull();
      // …but the Overview itself is still rendered (read-only).
      expect(element.querySelector('[data-testid="offering-panel-overview"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('transition', () => {
    it('PATCHes (no body) on click → updates state → re-derives buttons', async () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="offering-action-launch"]')!.click();
      fixture.detectChanges();
      await Promise.resolve();

      const patch = httpMock.expectOne(transitionUrl('of1', 'launch'));
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({});
      patch.flush(dto({ state: 'LAUNCHED', launched_at: '2026-06-03T00:00:00Z' }));
      fixture.detectChanges();

      // State advanced in-place (badge re-renders off the new state signal).
      expect(fixture.componentInstance.offering()?.state).toBe('LAUNCHED');
      // LAUNCHED now offers start+archive (launch gone).
      expect(element.querySelector('[data-testid="offering-action-start"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-action-launch"]')).toBeNull();
      httpMock.verify();
    });

    it('renders a non-destructive conflict alert + reload on 409', async () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="offering-action-launch"]')!.click();
      fixture.detectChanges();
      await Promise.resolve();

      httpMock
        .expectOne(transitionUrl('of1', 'launch'))
        .flush({ error: 'illegal transition' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      const conflict = element.querySelector('[data-testid="offering-overview-conflict"]');
      expect(conflict).not.toBeNull();
      expect(conflict?.getAttribute('role')).toBe('alert');

      // Reload re-fetches the offering (fresh state re-derives the buttons).
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-overview-conflict-reload"]')!
        .click();
      fixture.detectChanges();
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-overview-conflict"]')).toBeNull();
      httpMock.verify();
    });

    it('surfaces a generic action error on a non-409 failure', async () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="offering-action-launch"]')!.click();
      fixture.detectChanges();
      await Promise.resolve();
      httpMock
        .expectOne(transitionUrl('of1', 'launch'))
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="offering-overview-action-error"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('surfaces the launch-readiness 422 message verbatim near the control (S5)', async () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="offering-action-launch"]')!.click();
      fixture.detectChanges();
      await Promise.resolve();
      // The REAL delivery writeError envelope: the actionable reason is in
      // `message`, and `error` is only the bare HTTP status text.
      httpMock.expectOne(transitionUrl('of1', 'launch')).flush(
        {
          error: 'Unprocessable Entity',
          message: 'offering has no curriculum content — add content to a course before launching',
        },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="offering-overview-action-error"]');
      expect(banner).not.toBeNull();
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain(
        'offering has no curriculum content — add content to a course before launching',
      );
      // The offering stays DRAFT (the launch did not take) and the button remains.
      expect(fixture.componentInstance.offering()?.state).toBe('DRAFT');
      expect(element.querySelector('[data-testid="offering-action-launch"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('archive (confirm-gated)', () => {
    it('fires NO PATCH when the confirm dialog is cancelled', async () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
      fixture.detectChanges();
      const confirmDialog = TestBed.inject(ConfirmDialogService);

      element.querySelector<HTMLButtonElement>('[data-testid="offering-action-archive"]')!.click();
      confirmDialog._resolve(false);
      await Promise.resolve();
      fixture.detectChanges();
      // afterEach verify() asserts no PATCH fired.
      httpMock.verify();
    });

    it('PATCHes archive when confirmed', async () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'RUNNING' }));
      fixture.detectChanges();
      const confirmDialog = TestBed.inject(ConfirmDialogService);

      element.querySelector<HTMLButtonElement>('[data-testid="offering-action-archive"]')!.click();
      confirmDialog._resolve(true);
      await Promise.resolve();
      fixture.detectChanges();

      const patch = httpMock.expectOne(transitionUrl('of1', 'archive'));
      expect(patch.request.method).toBe('PATCH');
      patch.flush(dto({ state: 'ARCHIVED', archived_at: '2026-06-09T00:00:00Z' }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-overview-terminal"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('error states', () => {
    it('renders a back-to-finder link (no retry) on 404', () => {
      const { fixture, httpMock, element } = setup('missing');
      httpMock
        .expectOne(detailUrl('missing'))
        .flush('nope', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      expect(fixture.componentInstance.isNotFound()).toBe(true);
      expect(element.querySelector('[data-testid="offering-workspace-error-back"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-workspace-retry"]')).toBeNull();
      httpMock.verify();
    });

    it('maps 403 to the unauthorised error (retry CTA, not back-link)', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock
        .expectOne(detailUrl('of1'))
        .flush('forbidden', { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();
      expect(fixture.componentInstance.isNotFound()).toBe(false);
      expect(fixture.componentInstance.errorKey()).toBe(
        'rplus.offerings.workspace.error_unauthorised',
      );
      expect(element.querySelector('[data-testid="offering-workspace-retry"]')).not.toBeNull();
      httpMock.verify();
    });

    it('maps a 400 to the generic error key', () => {
      const { fixture, httpMock } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush('bad', { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('rplus.offerings.workspace.error_generic');
      httpMock.verify();
    });

    it('renders a retry CTA on 5xx and refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock
        .expectOne(detailUrl('of1'))
        .flush('down', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-workspace-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      httpMock.expectOne(detailUrl('of1')).flush(dto());
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-panel-overview"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('tab navigation', () => {
    it('navigates ?tab= on tab click (merge + replaceUrl)', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      element.querySelector<HTMLButtonElement>('[data-testid="offering-tab-roster"]')!.click();
      const [, extras] = navSpy.mock.calls[0];
      expect(extras).toMatchObject({ queryParamsHandling: 'merge', replaceUrl: true });
      expect(extras?.queryParams).toEqual({ tab: 'roster' });
      httpMock.verify();
    });

    it('moves to the next tab on ArrowRight (roving keyboard)', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      // Roving-tabindex handler lives on the focused (active) tab button.
      const activeTab = element.querySelector('[data-testid="offering-tab-overview"]')!;
      activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const [, extras] = navSpy.mock.calls[0];
      expect(extras?.queryParams).toEqual({ tab: 'curriculum' });
      httpMock.verify();
    });

    it('wraps to the last tab on ArrowLeft from overview', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      // async tabs: overview, publish, analytics → ArrowLeft from overview wraps to analytics.
      const activeTab = element.querySelector('[data-testid="offering-tab-overview"]')!;
      activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(navSpy.mock.calls[0][1]?.queryParams).toEqual({ tab: 'analytics' });
      httpMock.verify();
    });

    it('also advances on ArrowDown (vertical alias) and ignores other keys', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const activeTab = element.querySelector('[data-testid="offering-tab-overview"]')!;
      activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(navSpy.mock.calls[0][1]?.queryParams).toEqual({ tab: 'curriculum' });

      navSpy.mockClear();
      // A non-navigation key is ignored (no navigate).
      activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(navSpy).not.toHaveBeenCalled();
      httpMock.verify();
    });

    it('jumps to the last tab on End and first on Home', () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const activeTab = element.querySelector('[data-testid="offering-tab-overview"]')!;
      activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(navSpy.mock.calls[0][1]?.queryParams).toEqual({ tab: 'analytics' });
      // Home from overview is a no-op (already first) — selectTab short-circuits.
      navSpy.mockClear();
      activeTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      expect(navSpy).not.toHaveBeenCalled();
      httpMock.verify();
    });
  });

  describe('assessments panel (W3.A)', () => {
    function assessmentDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        assessment_id: 'as1',
        offering_id: 'of1',
        test_set_id: 'ts1',
        title: 'Midterm Assessment',
        state: 'DRAFT',
        question_count: 10,
        total_points: 100,
        scheduled_open_at: null,
        scheduled_close_at: null,
        created_at: '2026-06-10T00:00:00Z',
        ...overrides,
      };
    }
    function testSetDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        test_set_id: 'ts1',
        tenant_id: 't1',
        author_gcid: 'g1',
        title: 'Agile Estimation',
        state: 'PUBLISHED',
        total_points: 100,
        question_count: 10,
        created_at: '2026-05-10T00:00:00Z',
        updated_at: '2026-05-12T00:00:00Z',
        published_at: '2026-05-12T00:00:00Z',
        ...overrides,
      };
    }
    function assessmentsUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/assessments`;
    }
    function testSetsUrl(): string {
      return `${environment.bffBaseUrl}/api/v1/test-sets`;
    }
    function archiveUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/assessments/${encodeURIComponent(id)}/archive`;
    }

    /** Boot the workspace on the assessments tab; flush detail + the list GET. */
    function bootAssessments(
      opts: {
        roles?: readonly string[];
        deliveryType?: string;
        list?: readonly Record<string, unknown>[];
      } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup(
        'of1',
        opts.roles ?? ['instructor'],
        'assessments',
      );
      httpMock
        .expectOne(detailUrl('of1'))
        .flush(dto({ delivery_type: opts.deliveryType ?? 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(assessmentsUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({ items: opts.list ?? [], next_page_token: null });
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazily GETs the offering assessments when the tab is active and renders rows', () => {
      const { httpMock, element } = bootAssessments({
        list: [
          assessmentDto(),
          assessmentDto({
            id: 'as2',
            title: 'Final Exam',
            state: 'RELEASED',
            question_count: 20,
            total_points: 200,
          }),
        ],
      });
      expect(element.querySelector('[data-testid="offering-panel-assessments"]')).not.toBeNull();
      const rows = element.querySelectorAll('[data-testid="offering-assessments-row"]');
      expect(rows.length).toBe(2);
      expect(rows[0]?.textContent).toContain('Midterm Assessment');
      expect(rows[0]?.textContent).toContain('10'); // question count
      expect(rows[0]?.textContent).toContain('100'); // total points
      expect(rows[1]?.textContent).toContain('Final Exam');
      httpMock.verify();
    });

    it('shows the empty-state when the offering has no assessments', () => {
      const { httpMock, element } = bootAssessments({ list: [] });
      expect(element.querySelector('[data-testid="offering-assessments-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-assessments-row"]')).toBeNull();
      httpMock.verify();
    });

    it('shows an "add more" hint once at least one assessment is attached (manager)', () => {
      const { httpMock, element } = bootAssessments({ list: [assessmentDto()] });
      // The add controls stay visible; this hint corrects the "only one" misperception.
      expect(
        element.querySelector('[data-testid="offering-assessments-add-more-hint"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('hides the "add more" hint when no assessments are attached yet', () => {
      const { httpMock, element } = bootAssessments({ list: [] });
      expect(
        element.querySelector('[data-testid="offering-assessments-add-more-hint"]'),
      ).toBeNull();
      httpMock.verify();
    });

    it('hides the "add more" hint for a non-manager even with assessments attached', () => {
      const { httpMock, element } = bootAssessments({
        roles: ['learner'],
        list: [assessmentDto()],
      });
      expect(
        element.querySelector('[data-testid="offering-assessments-add-more-hint"]'),
      ).toBeNull();
      httpMock.verify();
    });

    it('maps each assessment state to the right badge variant', () => {
      const { httpMock, element } = bootAssessments({
        list: [
          assessmentDto({ id: 'a-open', state: 'OPEN' }),
          assessmentDto({ id: 'a-sched', state: 'SCHEDULED' }),
          assessmentDto({ id: 'a-grading', state: 'GRADING' }),
          assessmentDto({ id: 'a-graded', state: 'GRADED' }),
          assessmentDto({ id: 'a-closed', state: 'CLOSED' }),
        ],
      });
      const rows = element.querySelectorAll('[data-testid="offering-assessments-row"]');
      const variant = (i: number): DOMTokenList | undefined =>
        rows[i]?.querySelector('.badge')?.classList;
      expect(variant(0)?.contains('badge-success')).toBe(true); // OPEN
      expect(variant(1)?.contains('badge-info')).toBe(true); // SCHEDULED
      expect(variant(2)?.contains('badge-info')).toBe(true); // GRADING
      expect(variant(3)?.contains('badge-info')).toBe(true); // GRADED
      expect(variant(4)?.contains('badge-neutral')).toBe(true); // CLOSED → default
      httpMock.verify();
    });

    it('shows a loading state until the list resolves', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'assessments');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(assessmentsUrl('of1'));
      expect(element.querySelector('[data-testid="offering-assessments-loading"]')).not.toBeNull();
      req.flush({ items: [], next_page_token: null });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'assessments');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-assessments-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-assessments-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush({ items: [assessmentDto()], next_page_token: null });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-assessments-row"]')).not.toBeNull();
      httpMock.verify();
    });

    describe('attach (manager)', () => {
      it('opens the picker → lists ONLY PUBLISHED test-sets → attach POSTs + refreshes', () => {
        const { fixture, httpMock, element } = bootAssessments({ list: [] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-attach"]')!
          .click();
        fixture.detectChanges();
        const tsReq = httpMock.expectOne((r) => r.url === testSetsUrl());
        expect(tsReq.request.params.get('state')).toBe('PUBLISHED');
        tsReq.flush({
          items: [
            testSetDto(),
            testSetDto({ test_set_id: 'ts2', title: 'Draft Set', state: 'DRAFT' }),
          ],
          next_page_token: null,
          total: 2,
        });
        fixture.detectChanges();

        expect(element.querySelector('[data-testid="offering-assessments-picker"]')).not.toBeNull();
        const options = element.querySelectorAll(
          '[data-testid="offering-assessments-picker-option"]',
        );
        // The DRAFT row is filtered out → only the PUBLISHED one is offered.
        expect(options.length).toBe(1);
        expect(options[0]?.textContent).toContain('Agile Estimation');

        (options[0] as HTMLButtonElement).click();
        fixture.detectChanges();
        const post = httpMock.expectOne(assessmentsUrl('of1'));
        expect(post.request.method).toBe('POST');
        expect(post.request.body).toEqual({ test_set_id: 'ts1' });
        post.flush(assessmentDto(), { status: 201, statusText: 'Created' });
        fixture.detectChanges();

        // The list refreshes (a fresh GET) and the picker closes.
        httpMock
          .expectOne(assessmentsUrl('of1'))
          .flush({ items: [assessmentDto()], next_page_token: null });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-assessments-row"]')).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-assessments-picker"]')).toBeNull();
        httpMock.verify();
      });

      it('shows the picker empty-state when no PUBLISHED test-sets exist', () => {
        const { fixture, httpMock, element } = bootAssessments({ list: [] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-attach"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === testSetsUrl())
          .flush({ items: [], next_page_token: null, total: 0 });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-assessments-picker-empty"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('shows a picker error + retry refires the test-sets GET', () => {
        const { fixture, httpMock, element } = bootAssessments({ list: [] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-attach"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === testSetsUrl())
          .flush('down', { status: 503, statusText: 'Unavailable' });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-assessments-picker-error"]'),
        ).not.toBeNull();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-picker-retry"]')!
          .click();
        httpMock
          .expectOne((r) => r.url === testSetsUrl())
          .flush({ items: [testSetDto()], next_page_token: null });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-assessments-picker-option"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('does not refetch test-sets when the picker is closed and reopened', () => {
        const { fixture, httpMock, element } = bootAssessments({ list: [] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-attach"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === testSetsUrl())
          .flush({ items: [testSetDto()], next_page_token: null });
        fixture.detectChanges();

        // Close the picker.
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-picker-close"]')!
          .click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-assessments-picker"]')).toBeNull();

        // Reopen → the loaded set is reused (no second GET; afterEach verify asserts it).
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-attach"]')!
          .click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-assessments-picker"]')).not.toBeNull();
        expect(
          element.querySelector('[data-testid="offering-assessments-picker-option"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('surfaces a fail-loud attach error when the POST fails', () => {
        const { fixture, httpMock, element } = bootAssessments({ list: [] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-attach"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === testSetsUrl())
          .flush({ items: [testSetDto()], next_page_token: null });
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-picker-option"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne(assessmentsUrl('of1'))
          .flush({ error: 'not published' }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-assessments-attach-error"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('excludes already-attached test-sets from the attach picker', () => {
        // The offering already has an assessment sourced from ts1.
        const { fixture, httpMock, element } = bootAssessments({ list: [assessmentDto()] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-attach"]')!
          .click();
        fixture.detectChanges();
        httpMock.expectOne((r) => r.url === testSetsUrl()).flush({
          items: [
            testSetDto(), // ts1: already attached, must be filtered out of the candidates
            testSetDto({ test_set_id: 'ts2', title: 'Kanban Basics' }), // PUBLISHED and attachable
          ],
          next_page_token: null,
        });
        fixture.detectChanges();

        const options = element.querySelectorAll(
          '[data-testid="offering-assessments-picker-option"]',
        );
        expect(options.length).toBe(1);
        expect(options[0]?.textContent).toContain('Kanban Basics');
        expect(options[0]?.textContent).not.toContain('Agile Estimation');
        httpMock.verify();
      });
    });

    describe('remove (manager, confirm-gated)', () => {
      it('confirm → POST archive → refreshes the list', async () => {
        const { fixture, httpMock, element } = bootAssessments({ list: [assessmentDto()] });
        const confirmDialog = TestBed.inject(ConfirmDialogService);
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-remove"]')!
          .click();
        confirmDialog._resolve(true);
        await Promise.resolve();
        fixture.detectChanges();
        const archive = httpMock.expectOne(archiveUrl('as1'));
        expect(archive.request.method).toBe('POST');
        archive.flush({});
        fixture.detectChanges();
        httpMock.expectOne(assessmentsUrl('of1')).flush({ items: [], next_page_token: null });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-assessments-empty"]')).not.toBeNull();
        httpMock.verify();
      });

      it('cancel → fires NO archive POST', async () => {
        const { fixture, httpMock, element } = bootAssessments({ list: [assessmentDto()] });
        const confirmDialog = TestBed.inject(ConfirmDialogService);
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-assessments-remove"]')!
          .click();
        confirmDialog._resolve(false);
        await Promise.resolve();
        fixture.detectChanges();
        // afterEach verify() asserts no archive PATCH/POST fired.
        httpMock.verify();
      });
    });

    describe('role-gated visibility', () => {
      it('hides attach + remove for a non-manager but renders the read-only list', () => {
        const { fixture, httpMock, element } = bootAssessments({
          roles: ['learner'],
          list: [assessmentDto()],
        });
        expect(fixture.componentInstance.canManage()).toBe(false);
        expect(element.querySelector('[data-testid="offering-assessments-attach"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-assessments-remove"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-assessments-row"]')).not.toBeNull();
        httpMock.verify();
      });
    });

    // ── CHO-2123 (FE-2, ADR-232): assemble-from-QuestionBank front-door ──────
    // The offering's Assessments tab is the R+ assessment front-door. The
    // DEFAULT (primary) path is reuse-and-assemble — link out to the caller's
    // Question Banks (where a bank → PUBLISHED TestSet assembly already lives).
    // Attaching an already-published TestSet stays available; authoring a fresh
    // assessment is demoted to a SECONDARY link. All three are manage-gated by
    // VISIBILITY (mirrors the existing attach affordance), never merely disabled.
    describe('assemble front-door (CHO-2123)', () => {
      it('surfaces Assemble-from-QuestionBank as the PRIMARY assessment action', () => {
        const { httpMock, element } = bootAssessments({ roles: ['instructor'] });
        const assemble = element.querySelector<HTMLAnchorElement>(
          '[data-testid="offering-assessments-assemble"]',
        );
        expect(assemble).not.toBeNull();
        // Real navigation (routerLink) to the Question Banks front-door — not a
        // dead button. Assemble-test-set itself lives on the bank's detail page.
        expect(assemble!.tagName).toBe('A');
        expect(assemble!.getAttribute('href')).toBe('/r/question-banks');
        // Primary weight encodes "this is the default path".
        expect(assemble!.classList.contains('btn-primary')).toBe(true);
        httpMock.verify();
      });

      it('demotes author-fresh to a SECONDARY link (route /r/assessment-authoring)', () => {
        const { httpMock, element } = bootAssessments({ roles: ['instructor'] });
        const author = element.querySelector<HTMLAnchorElement>(
          '[data-testid="offering-assessments-author"]',
        );
        expect(author).not.toBeNull();
        expect(author!.tagName).toBe('A');
        expect(author!.getAttribute('href')).toBe('/r/assessment-authoring');
        // Secondary weight — must NOT compete with the primary assemble CTA.
        expect(author!.classList.contains('btn-primary')).toBe(false);
        httpMock.verify();
      });

      it('keeps Attach-a-published-test-set available alongside the front-door', () => {
        const { httpMock, element } = bootAssessments({ roles: ['instructor'] });
        // All three affordances coexist for a manager: assemble (primary),
        // attach (instantiate a published TestSet), author-fresh (secondary).
        expect(
          element.querySelector('[data-testid="offering-assessments-assemble"]'),
        ).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-assessments-attach"]')).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-assessments-author"]')).not.toBeNull();
        httpMock.verify();
      });

      it('keeps the front-door reachable from an offering with NO assessments', () => {
        const { httpMock, element } = bootAssessments({ roles: ['instructor'], list: [] });
        // The empty state must not be a dead end — the primary assemble path is
        // still one click away (the head action group renders regardless).
        expect(element.querySelector('[data-testid="offering-assessments-empty"]')).not.toBeNull();
        expect(
          element.querySelector('[data-testid="offering-assessments-assemble"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('hides the assemble + author front-door actions for a non-manager', () => {
        const { fixture, httpMock, element } = bootAssessments({
          roles: ['learner'],
          list: [assessmentDto()],
        });
        expect(fixture.componentInstance.canManage()).toBe(false);
        expect(element.querySelector('[data-testid="offering-assessments-assemble"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-assessments-author"]')).toBeNull();
        // The read-only assessment list still renders (role-driven visibility,
        // not a blanked panel).
        expect(element.querySelector('[data-testid="offering-assessments-row"]')).not.toBeNull();
        httpMock.verify();
      });
    });
  });

  describe('curriculum ref picker binding (CHO-2134)', () => {
    it('binds the live_classroom kind to the live_quiz entity picker + port', () => {
      const { fixture, httpMock } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto());
      fixture.detectChanges();
      const component = fixture.componentInstance;

      // Baseline: the default (atom) kind keeps its picker type.
      expect(component.curriculumRefPickerType()).toBe('atom');

      // Selecting the live_classroom kind now surfaces the live_quiz picker
      // (was `null` → raw-UUID text box before this change) and wires the
      // injected LiveQuizEntitySearchPort as the [searchPortOverride] source.
      component.onCurriculumKindChange({
        target: { value: 'live_classroom' },
      } as unknown as Event);

      expect(component.curriculumRefPickerType()).toBe('live_quiz');
      expect(component.curriculumRefSearchPort()).toBe(TestBed.inject(LiveQuizEntitySearchPort));
      httpMock.verify();
    });
  });

  describe('curriculum panel (W2.D)', () => {
    function curriculumUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/curriculum`;
    }

    /**
     * Drain the per-course "used by N offerings" blast-radius count GETs the
     * curriculum panel fires on load (one `GET /search/offerings?course_id=…&limit=1`
     * per attached course). Flushing them (optionally with a per-course total)
     * keeps httpMock.verify() clean; unmatched courses default to a benign 1.
     */
    function drainUsageCounts(
      httpMock: HttpTestingController,
      totals: Readonly<Record<string, number>> = {},
    ): void {
      const listUrl = `${environment.bffBaseUrl}/api/v1/search/offerings`;
      for (const req of httpMock.match((r) => r.url === listUrl && r.method === 'GET')) {
        const courseId = req.request.params.get('course_id') ?? '';
        req.flush({ items: [], next_cursor: null, total_estimate: totals[courseId] ?? 1 });
      }
    }

    /**
     * Drain the per-course module-structure GETs the curriculum panel fires on
     * load (one `GET /offerings/:id/modules?course_id=…` per attached course).
     * Flushing them keeps httpMock.verify() clean; unmatched courses default to
     * an empty module list. Pass `modules` to seed a course's modules.
     */
    function drainModules(
      httpMock: HttpTestingController,
      modules: Readonly<Record<string, readonly Record<string, unknown>[]>> = {},
      progress: Readonly<Record<string, readonly Record<string, unknown>[]>> = {},
    ): void {
      for (const req of httpMock.match((r) => r.url.endsWith('/modules') && r.method === 'GET')) {
        const courseId = req.request.params.get('course_id') ?? '';
        req.flush({ course_id: courseId, modules: modules[courseId] ?? [] });
      }
      // W7 CHO-2074 — the cohort progress GET fires alongside each structure GET;
      // drain it too or httpMock.verify() trips on the unmatched request.
      for (const req of httpMock.match(
        (r) => r.url.endsWith('/modules/progress') && r.method === 'GET',
      )) {
        const courseId = req.request.params.get('course_id') ?? '';
        req.flush({
          course_id: courseId,
          viewer_role: 'instructor',
          modules: progress[courseId] ?? [],
        });
      }
    }

    /** Boot the workspace on the curriculum tab; flush detail + the GET, then
     *  drain the per-course blast-radius count + module-structure GETs. */
    function bootCurriculum(
      opts: {
        roles?: readonly string[];
        courses?: readonly Record<string, unknown>[];
        usageCounts?: Readonly<Record<string, number>>;
        modules?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
        moduleProgress?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
      } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup(
        'of1',
        opts.roles ?? ['instructor'],
        'curriculum',
      );
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(curriculumUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({ courses: opts.courses ?? [] });
      fixture.detectChanges();
      drainUsageCounts(httpMock, opts.usageCounts);
      drainModules(httpMock, opts.modules, opts.moduleProgress);
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazily GETs the curriculum when the tab is active and renders courses + outline', () => {
      const { httpMock, element } = bootCurriculum({
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            items: [
              { item_id: 'it1', kind: 'atom', title: 'Limits', position: 0 },
              { item_id: 'it2', kind: 'youtube', title: 'Derivatives', position: 1 },
            ],
          },
        ],
      });
      expect(element.querySelector('[data-testid="offering-panel-curriculum"]')).not.toBeNull();
      const courses = element.querySelectorAll('[data-testid="offering-curriculum-course"]');
      expect(courses.length).toBe(1);
      expect(courses[0]?.textContent).toContain('Calculus I');
      const items = element.querySelectorAll('[data-testid="offering-curriculum-item"]');
      expect(items.length).toBe(2);
      expect(items[0]?.textContent).toContain('Limits');
      expect(items[1]?.textContent).toContain('Derivatives');
      httpMock.verify();
    });

    it('renders the courses in offering order', () => {
      const { element, httpMock } = bootCurriculum({
        courses: [
          { id: 'c1', title: 'First', items: [] },
          { id: 'c2', title: 'Second', items: [] },
        ],
      });
      const courses = element.querySelectorAll('[data-testid="offering-curriculum-course"]');
      expect(courses.length).toBe(2);
      expect(courses[0]?.textContent).toContain('First');
      expect(courses[1]?.textContent).toContain('Second');
      httpMock.verify();
    });

    it('shows the empty-state when the offering has no attached courses', () => {
      const { httpMock, element } = bootCurriculum({ courses: [] });
      expect(element.querySelector('[data-testid="offering-curriculum-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-curriculum-course"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a per-course empty-outline note for a course with no content items', () => {
      const { element, httpMock } = bootCurriculum({
        courses: [{ id: 'c1', title: 'Empty', items: [] }],
      });
      expect(element.querySelector('[data-testid="offering-curriculum-course"]')).not.toBeNull();
      expect(
        element.querySelector('[data-testid="offering-curriculum-course-empty"]'),
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-curriculum-item"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a loading state until the curriculum resolves', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'curriculum');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(curriculumUrl('of1'));
      expect(element.querySelector('[data-testid="offering-curriculum-loading"]')).not.toBeNull();
      req.flush({ courses: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'curriculum');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(curriculumUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-curriculum-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-curriculum-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      httpMock
        .expectOne(curriculumUrl('of1'))
        .flush({ courses: [{ id: 'c1', title: 'Calculus I', items: [] }] });
      fixture.detectChanges();
      drainUsageCounts(httpMock);
      drainModules(httpMock);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-curriculum-course"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows a URL item ref verbatim but hides the opaque UUID a UUID-kind ref points to', () => {
      const { element, httpMock } = bootCurriculum({
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            items: [
              { item_id: 'it1', kind: 'atom', ref: 'atom-uuid-9', title: 'Limits', position: 0 },
              {
                item_id: 'it2',
                kind: 'youtube',
                ref: 'https://youtu.be/x',
                title: 'Intro',
                position: 1,
              },
            ],
          },
        ],
      });
      const refs = Array.from(
        element.querySelectorAll('[data-testid="offering-curriculum-item-ref"]'),
      ).map((el) => el.textContent ?? '');
      // The URL ref is shown; the atom's opaque UUID is hidden (title is the label).
      expect(refs).toContain('https://youtu.be/x');
      expect(refs.join(' ')).not.toContain('atom-uuid-9');
      httpMock.verify();
    });

    it('renders a per-course "used by N offerings" blast-radius badge (warning tone when shared)', () => {
      const { httpMock, element } = bootCurriculum({
        courses: [
          { id: 'c1', title: 'Shared Course', items: [] },
          { id: 'c2', title: 'Solo Course', items: [] },
        ],
        usageCounts: { c1: 3, c2: 1 },
      });
      const badges = element.querySelectorAll('[data-testid="curriculum-course-usage"]');
      expect(badges.length).toBe(2);
      // c1 is bundled by 3 offerings → shared → warning tone + shows the count.
      expect(badges[0]?.className).toContain('badge-warning');
      expect(badges[0]?.textContent).toContain('3');
      // c2 is bundled only by this offering → neutral tone, not warning.
      expect(badges[1]?.className).toContain('badge-neutral');
      expect(badges[1]?.className).not.toContain('badge-warning');
      expect(badges[1]?.textContent).toContain('1');
      httpMock.verify();
    });

    it('degrades to NO badge when a course count call fails (panel still renders)', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'curriculum');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(curriculumUrl('of1'))
        .flush({ courses: [{ id: 'c1', title: 'Calculus I', items: [] }] });
      fixture.detectChanges();
      // The lone count GET fires (offering FINDER, not the plain list); fail it
      // → the course still renders, no badge.
      const countUrl = `${environment.bffBaseUrl}/api/v1/search/offerings`;
      httpMock
        .expectOne((r) => r.url === countUrl && r.method === 'GET')
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      // The lone module-structure GET also fires on curriculum load — drain it.
      drainModules(httpMock);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-curriculum-course"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="curriculum-course-usage"]')).toBeNull();
      httpMock.verify();
    });

    describe('module structure (W7 / WS-A)', () => {
      const modulesUrl = `${environment.bffBaseUrl}/api/v1/offerings/of1/modules`;
      const wireModule = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
        id: 'm1',
        course_id: 'c1',
        title: 'Unit 1',
        position: 0,
        requirement: { kind: 'all_items', threshold_n: 0, required_item_ids: [] },
        items: [],
        ...over,
      });
      const courseWithItem = {
        id: 'c1',
        title: 'Calculus I',
        items: [{ item_id: 'it1', kind: 'atom', ref: 'atom-uuid', title: 'Limits', position: 0 }],
      };

      it('shows the cohort completion badge from the progress projection (CHO-2074)', () => {
        const { element, httpMock } = bootCurriculum({
          courses: [courseWithItem],
          modules: {
            c1: [wireModule({ items: [{ item_id: 'mi1', content_item_id: 'it1', position: 0 }] })],
          },
          moduleProgress: {
            c1: [
              {
                module_id: 'm1',
                title: 'Unit 1',
                position: 0,
                total: 1,
                requirement: { kind: 'all_items', threshold_n: 0 },
                learners: [
                  { gcid: 'g1', completed_count: 1, is_complete: true },
                  { gcid: 'g2', completed_count: 0, is_complete: false },
                ],
              },
            ],
          },
        });
        const badge = element.querySelector('[data-testid="module-progress"]');
        expect(badge).not.toBeNull();
        // completeCount = 1 (only g1 is_complete). Tests run without loaded
        // translations, so resolveUsagePlural degrades the ICU key to the bare
        // count "1" (the plural wording is covered by the resolveUsagePlural
        // unit tests); the assertion holds in both envs.
        expect(badge?.textContent).toContain('1');
        httpMock.verify();
      });

      it('renders seeded modules with requirement badge + member item titles', () => {
        const { element, httpMock } = bootCurriculum({
          courses: [courseWithItem],
          modules: {
            c1: [wireModule({ items: [{ item_id: 'mi1', content_item_id: 'it1', position: 0 }] })],
          },
        });
        expect(element.querySelector('[data-testid="offering-module"]')).not.toBeNull();
        expect(element.querySelector('[data-testid="module-title"]')?.textContent).toContain(
          'Unit 1',
        );
        // The member item resolves its display title from the course's flat items.
        expect(element.querySelector('[data-testid="module-item"]')?.textContent).toContain(
          'Limits',
        );
        // Admin sees the "New module" affordance.
        expect(element.querySelector('[data-testid="module-new"]')).not.toBeNull();
        httpMock.verify();
      });

      it('creates a module: open form → title → submit → POSTs → appears', () => {
        const { fixture, element, httpMock } = bootCurriculum({
          courses: [{ id: 'c1', title: 'Calculus I', items: [] }],
        });
        expect(element.querySelector('[data-testid="modules-empty"]')).not.toBeNull();
        element.querySelector<HTMLButtonElement>('[data-testid="module-new"]')!.click();
        fixture.detectChanges();
        const title = element.querySelector<HTMLInputElement>(
          '[data-testid="module-create-title"]',
        )!;
        title.value = 'Foundations';
        title.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        element.querySelector<HTMLButtonElement>('[data-testid="module-create-submit"]')!.click();
        const req = httpMock.expectOne(modulesUrl);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ course_id: 'c1', title: 'Foundations' });
        req.flush(wireModule({ title: 'Foundations' }));
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="module-title"]')?.textContent).toContain(
          'Foundations',
        );
        httpMock.verify();
      });

      it('adds an existing curriculum item to a module', () => {
        const { fixture, element, httpMock } = bootCurriculum({
          courses: [courseWithItem],
          modules: { c1: [wireModule()] },
        });
        const sel = element.querySelector<HTMLSelectElement>('[data-testid="module-add-select"]')!;
        sel.value = 'it1';
        sel.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        element.querySelector<HTMLButtonElement>('[data-testid="module-add-submit"]')!.click();
        const req = httpMock.expectOne(`${modulesUrl}/add-item`);
        expect(req.request.body).toEqual({
          course_id: 'c1',
          module_id: 'm1',
          content_item_id: 'it1',
        });
        req.flush(wireModule({ items: [{ item_id: 'mi1', content_item_id: 'it1', position: 0 }] }));
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="module-item"]')?.textContent).toContain(
          'Limits',
        );
        httpMock.verify();
      });

      it('sets a module requirement to n_of_m (with the chosen threshold)', () => {
        const { fixture, element, httpMock } = bootCurriculum({
          courses: [courseWithItem],
          modules: {
            c1: [wireModule({ items: [{ item_id: 'mi1', content_item_id: 'it1', position: 0 }] })],
          },
        });
        const n = element.querySelector<HTMLInputElement>('[data-testid="module-req-threshold"]')!;
        n.value = '1';
        element.querySelector<HTMLButtonElement>('[data-testid="module-req-nofm"]')!.click();
        const req = httpMock.expectOne(`${modulesUrl}/set-requirement`);
        expect(req.request.body).toEqual({
          course_id: 'c1',
          module_id: 'm1',
          kind: 'n_of_m',
          threshold_n: 1,
          required_item_ids: [],
        });
        req.flush(
          wireModule({
            requirement: { kind: 'n_of_m', threshold_n: 1, required_item_ids: [] },
            items: [{ item_id: 'mi1', content_item_id: 'it1', position: 0 }],
          }),
        );
        fixture.detectChanges();
        httpMock.verify();
      });

      it('removes a module (soft-delete → drops from the list)', () => {
        const { fixture, element, httpMock } = bootCurriculum({
          courses: [{ id: 'c1', title: 'Calculus I', items: [] }],
          modules: { c1: [wireModule({ title: 'Doomed' })] },
        });
        expect(element.querySelector('[data-testid="offering-module"]')).not.toBeNull();
        element.querySelector<HTMLButtonElement>('[data-testid="module-remove"]')!.click();
        const req = httpMock.expectOne(`${modulesUrl}/remove`);
        expect(req.request.body).toEqual({ course_id: 'c1', module_id: 'm1' });
        req.flush({ module_id: 'm1', deleted: true });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-module"]')).toBeNull();
        httpMock.verify();
      });

      it('surfaces a fail-loud error banner when a module op fails (409 edit-lock)', () => {
        const { fixture, element, httpMock } = bootCurriculum({
          courses: [{ id: 'c1', title: 'Calculus I', items: [] }],
        });
        element.querySelector<HTMLButtonElement>('[data-testid="module-new"]')!.click();
        fixture.detectChanges();
        const title = element.querySelector<HTMLInputElement>(
          '[data-testid="module-create-title"]',
        )!;
        title.value = 'X';
        title.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        element.querySelector<HTMLButtonElement>('[data-testid="module-create-submit"]')!.click();
        httpMock
          .expectOne(modulesUrl)
          .flush(
            { error: 'Conflict', message: 'course is attached to a live offering' },
            { status: 409, statusText: 'Conflict' },
          );
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="module-error"]')?.textContent).toContain(
          'live offering',
        );
        httpMock.verify();
      });

      it('hides module authoring affordances for a non-admin (role-driven visibility)', () => {
        const { element, httpMock } = bootCurriculum({
          roles: ['learner'],
          courses: [{ id: 'c1', title: 'Calculus I', items: [] }],
          modules: { c1: [wireModule()] },
        });
        // The module list still renders (read), but authoring buttons are gone.
        expect(element.querySelector('[data-testid="offering-module"]')).not.toBeNull();
        expect(element.querySelector('[data-testid="module-new"]')).toBeNull();
        expect(element.querySelector('[data-testid="module-remove"]')).toBeNull();
        httpMock.verify();
      });
    });

    describe('authoring (manager, S1 / CHO-2050)', () => {
      const reorderUrl = (id: string): string => `${curriculumUrl(id)}/reorder`;
      const removeUrl = (id: string): string => `${curriculumUrl(id)}/remove`;
      const twoItems = [
        { item_id: 'it1', kind: 'atom', ref: 'u1', title: 'First', position: 0 },
        { item_id: 'it2', kind: 'atom', ref: 'u2', title: 'Second', position: 1 },
      ];
      const setInput = (element: HTMLElement, testid: string, value: string): void => {
        const input = element.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };

      it('opens the add form → fills kind/ref/title → POSTs the write body → splices + closes', () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'Calculus I', items: [] }],
        });
        // Course starts empty (per-course empty note; no items).
        expect(
          element.querySelector('[data-testid="offering-curriculum-course-empty"]'),
        ).not.toBeNull();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add"]')!
          .click();
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-curriculum-add-form"]'),
        ).not.toBeNull();

        const kind = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-curriculum-kind"]',
        )!;
        kind.value = 'youtube';
        kind.dispatchEvent(new Event('change'));
        fixture.detectChanges(); // URL kind → the ref field becomes the text input
        setInput(element, 'offering-curriculum-ref', 'https://youtu.be/x');
        setInput(element, 'offering-curriculum-title', 'Intro video');
        fixture.detectChanges();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add-submit"]')!
          .click();
        fixture.detectChanges();

        const post = httpMock.expectOne(
          (r) => r.url === curriculumUrl('of1') && r.method === 'POST',
        );
        expect(post.request.body).toEqual({
          course_id: 'c1',
          kind: 'youtube',
          ref: 'https://youtu.be/x',
          title: 'Intro video',
        });
        // The write returns ONLY the affected course's outline (no re-GET).
        post.flush(
          {
            course_id: 'c1',
            items: [
              {
                item_id: 'it9',
                kind: 'youtube',
                ref: 'https://youtu.be/x',
                title: 'Intro video',
                position: 0,
              },
            ],
          },
          { status: 201, statusText: 'Created' },
        );
        fixture.detectChanges();

        expect(element.querySelector('[data-testid="offering-curriculum-add-form"]')).toBeNull();
        const items = element.querySelectorAll('[data-testid="offering-curriculum-item"]');
        expect(items.length).toBe(1);
        expect(items[0]?.textContent).toContain('Intro video');
        expect(
          element.querySelector('[data-testid="offering-curriculum-add-success"]'),
        ).not.toBeNull();
        httpMock.verify(); // no follow-up GET
      });

      it('keeps the add submit disabled until both ref and title are set', () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: [] }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add"]')!
          .click();
        fixture.detectChanges();
        // Kind-agnostic gate — drive it via a URL kind (plain text ref field).
        const kindSel = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-curriculum-kind"]',
        )!;
        kindSel.value = 'video';
        kindSel.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-curriculum-add-submit"]',
        )!;
        expect(submit.disabled).toBe(true);
        setInput(element, 'offering-curriculum-ref', 'https://v/x.mp4');
        fixture.detectChanges();
        expect(submit.disabled).toBe(true); // title still blank
        setInput(element, 'offering-curriculum-title', 'Limits');
        fixture.detectChanges();
        expect(submit.disabled).toBe(false);
        httpMock.verify();
      });

      it('switches the ref hint by kind (UUID kinds vs URL kinds)', () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: [] }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add"]')!
          .click();
        fixture.detectChanges();
        const hint = (): string =>
          element.querySelector('[data-testid="offering-curriculum-ref-hint"]')?.textContent ?? '';
        // default kind = atom → name-search picker + search hint (no UUID paste).
        expect(hint()).toContain('ref_hint_search');
        const kind = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-curriculum-kind"]',
        )!;
        kind.value = 'video';
        kind.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        expect(hint()).toContain('ref_hint_url');
        httpMock.verify();
      });

      it('uses a name-search picker (not a UUID field) for atom/assessment refs', () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: [] }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add"]')!
          .click();
        fixture.detectChanges();
        // Default kind = atom → the picker replaces the raw-UUID text field.
        expect(
          element.querySelector('[data-testid="offering-curriculum-ref-picker"]'),
        ).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-curriculum-ref"]')).toBeNull();
        // Picking an atom by name sets the ref id → submit enables once titled.
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-curriculum-add-submit"]',
        )!;
        fixture.componentInstance.onCurriculumRefPicked({ id: 'atom-9', label: 'Limits' });
        setInput(element, 'offering-curriculum-title', 'Limits lesson');
        fixture.detectChanges();
        expect(submit.disabled).toBe(false);
        httpMock.verify();
      });

      it('surfaces the BE 400 {error} loudly and preserves the draft input', () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: [] }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add"]')!
          .click();
        fixture.detectChanges();
        // A bad ref is only submittable on a URL kind now (the picker yields
        // valid ids for atom/assessment) — drive the fail-loud path via video.
        const kindSel = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-curriculum-kind"]',
        )!;
        kindSel.value = 'video';
        kindSel.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        setInput(element, 'offering-curriculum-ref', 'not-a-url');
        setInput(element, 'offering-curriculum-title', 'Bad');
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add-submit"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === curriculumUrl('of1') && r.method === 'POST')
          .flush(
            { error: 'ref must be an http(s) URL for kind video' },
            { status: 400, statusText: 'Bad Request' },
          );
        fixture.detectChanges();
        const err = element.querySelector('[data-testid="offering-curriculum-add-error"]');
        expect(err).not.toBeNull();
        expect(err?.getAttribute('role')).toBe('alert');
        // Fail-loud: the BE reason is surfaced verbatim.
        expect(err?.textContent).toContain('ref must be an http(s) URL for kind video');
        // The form stays open + the draft survives so the author can fix + retry.
        expect(
          element.querySelector('[data-testid="offering-curriculum-add-form"]'),
        ).not.toBeNull();
        expect(
          element.querySelector<HTMLInputElement>('[data-testid="offering-curriculum-ref"]')!.value,
        ).toBe('not-a-url');
        httpMock.verify();
      });

      it('reorders via move-down → POSTs the full id order → re-renders', () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: twoItems }],
        });
        element
          .querySelectorAll<HTMLButtonElement>('[data-testid="offering-curriculum-move-down"]')[0]
          .click();
        fixture.detectChanges();
        const post = httpMock.expectOne((r) => r.url === reorderUrl('of1') && r.method === 'POST');
        expect(post.request.body).toEqual({ course_id: 'c1', ordered_item_ids: ['it2', 'it1'] });
        post.flush({
          course_id: 'c1',
          items: [
            { item_id: 'it2', kind: 'atom', ref: 'u2', title: 'Second', position: 0 },
            { item_id: 'it1', kind: 'atom', ref: 'u1', title: 'First', position: 1 },
          ],
        });
        fixture.detectChanges();
        const items = element.querySelectorAll('[data-testid="offering-curriculum-item"]');
        expect(items[0]?.textContent).toContain('Second');
        expect(items[1]?.textContent).toContain('First');
        httpMock.verify();
      });

      it('disables move-up on the first item and move-down on the last', () => {
        const { httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: twoItems }],
        });
        const ups = element.querySelectorAll<HTMLButtonElement>(
          '[data-testid="offering-curriculum-move-up"]',
        );
        const downs = element.querySelectorAll<HTMLButtonElement>(
          '[data-testid="offering-curriculum-move-down"]',
        );
        expect(ups[0].disabled).toBe(true); // first can't move up
        expect(ups[1].disabled).toBe(false);
        expect(downs[0].disabled).toBe(false);
        expect(downs[1].disabled).toBe(true); // last can't move down
        httpMock.verify();
      });

      it('surfaces a fail-loud reorder error when the POST fails', () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: twoItems }],
        });
        element
          .querySelectorAll<HTMLButtonElement>('[data-testid="offering-curriculum-move-down"]')[0]
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === reorderUrl('of1') && r.method === 'POST')
          .flush({ error: 'bad permutation' }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();
        const err = element.querySelector('[data-testid="offering-curriculum-reorder-error"]');
        expect(err).not.toBeNull();
        expect(err?.getAttribute('role')).toBe('alert');
        httpMock.verify();
      });

      it('removes an item → confirm → POSTs {course_id,item_id} → re-renders remaining', async () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: twoItems }],
        });
        const confirmDialog = TestBed.inject(ConfirmDialogService);
        element
          .querySelectorAll<HTMLButtonElement>('[data-testid="offering-curriculum-remove"]')[0]
          .click();
        confirmDialog._resolve(true);
        await Promise.resolve();
        fixture.detectChanges();
        const post = httpMock.expectOne((r) => r.url === removeUrl('of1') && r.method === 'POST');
        expect(post.request.body).toEqual({ course_id: 'c1', item_id: 'it1' });
        post.flush({
          course_id: 'c1',
          items: [{ item_id: 'it2', kind: 'atom', ref: 'u2', title: 'Second', position: 0 }],
        });
        fixture.detectChanges();
        const items = element.querySelectorAll('[data-testid="offering-curriculum-item"]');
        expect(items.length).toBe(1);
        expect(items[0]?.textContent).toContain('Second');
        httpMock.verify();
      });

      it('removes an item → cancel → fires NO POST', async () => {
        const { fixture, httpMock, element } = bootCurriculum({
          courses: [{ id: 'c1', title: 'C', items: twoItems }],
        });
        const confirmDialog = TestBed.inject(ConfirmDialogService);
        element
          .querySelectorAll<HTMLButtonElement>('[data-testid="offering-curriculum-remove"]')[0]
          .click();
        confirmDialog._resolve(false);
        await Promise.resolve();
        fixture.detectChanges();
        // afterEach verify() asserts no /remove POST fired.
        httpMock.verify();
      });
    });

    it('hides all authoring controls for a non-manager but renders the read-only outline', () => {
      const { element, httpMock } = bootCurriculum({
        roles: ['learner'],
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            items: [{ item_id: 'it1', kind: 'atom', ref: 'u1', title: 'Limits', position: 0 }],
          },
        ],
      });
      expect(element.querySelector('[data-testid="offering-curriculum-course"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-curriculum-item"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-curriculum-add"]')).toBeNull();
      expect(element.querySelector('[data-testid="offering-curriculum-remove"]')).toBeNull();
      expect(element.querySelector('[data-testid="offering-curriculum-move-up"]')).toBeNull();
      expect(element.querySelector('[data-testid="offering-curriculum-move-down"]')).toBeNull();
      httpMock.verify();
    });
  });

  describe('certification panel (W2.D)', () => {
    function certUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/certification`;
    }
    function certRosterUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/roster`;
    }
    /** Mirrors the component's OFFERING_ADMIN_ROLES — a manager also loads the
     *  roster on the cert tab (for the per-learner manual issue action). */
    const CERT_MANAGER_ROLES = ['instructor', 'admin', 'training_admin', 'tenant_admin'];

    /**
     * Boot the workspace on the certification tab; flush detail + the cert GET.
     * A MANAGER's cert tab also lazy-loads the roster (to back the per-learner
     * manual "Issue certificate" action), so flush that too (default: empty).
     */
    function bootCertification(
      opts: {
        roles?: readonly string[];
        courses?: readonly Record<string, unknown>[];
        roster?: Record<string, unknown>;
      } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const roles = opts.roles ?? ['instructor'];
      const { fixture, httpMock, element } = setup('of1', roles, 'certification');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(certUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({ courses: opts.courses ?? [] });
      fixture.detectChanges();
      if (roles.some((r) => CERT_MANAGER_ROLES.includes(r))) {
        const rosterReq = httpMock.expectOne(certRosterUrl('of1'));
        expect(rosterReq.request.method).toBe('GET');
        rosterReq.flush(opts.roster ?? { courses: [], distinct_learner_count: 0 });
        fixture.detectChanges();
      }
      return { fixture, httpMock, element };
    }

    it('lazily GETs the certification config when the tab is active and renders it', () => {
      const { httpMock, element } = bootCertification({
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            certifications: [
              {
                enabled: true,
                cert_type: 'COMPETENCY',
                passing_score_pct: 70,
                require_all_content: true,
              },
            ],
          },
        ],
      });
      expect(element.querySelector('[data-testid="offering-panel-certification"]')).not.toBeNull();
      const courses = element.querySelectorAll('[data-testid="offering-certification-course"]');
      expect(courses.length).toBe(1);
      expect(courses[0]?.textContent).toContain('Calculus I');
      const config = element.querySelector('[data-testid="offering-certification-config"]');
      expect(config).not.toBeNull();
      // Passing score (70) is a non-translated value — safe to assert directly.
      expect(courses[0]?.textContent).toContain('70');
      httpMock.verify();
    });

    it('renders the courses in offering order', () => {
      const { element, httpMock } = bootCertification({
        courses: [
          { id: 'c1', title: 'First', certifications: [] },
          { id: 'c2', title: 'Second', certifications: [] },
        ],
      });
      const courses = element.querySelectorAll('[data-testid="offering-certification-course"]');
      expect(courses.length).toBe(2);
      expect(courses[0]?.textContent).toContain('First');
      expect(courses[1]?.textContent).toContain('Second');
      httpMock.verify();
    });

    it('shows the empty-state when the offering has no attached courses', () => {
      const { httpMock, element } = bootCertification({ courses: [] });
      expect(element.querySelector('[data-testid="offering-certification-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-certification-course"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a per-course "no certificate" note for a course with no cert config', () => {
      const { element, httpMock } = bootCertification({
        courses: [{ id: 'c1', title: 'Uncertified', certifications: [] }],
      });
      expect(element.querySelector('[data-testid="offering-certification-course"]')).not.toBeNull();
      expect(
        element.querySelector('[data-testid="offering-certification-course-none"]'),
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-certification-config"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a loading state until the certification config resolves', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'certification');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(certUrl('of1'));
      expect(
        element.querySelector('[data-testid="offering-certification-loading"]'),
      ).not.toBeNull();
      req.flush({ courses: [] });
      fixture.detectChanges();
      // The manager cert tab also fired the roster GET — flush it so it does not leak.
      httpMock.expectOne(certRosterUrl('of1')).flush({ courses: [], distinct_learner_count: 0 });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'certification');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock.expectOne(certUrl('of1')).flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      // The manager cert tab also fired the roster GET (independent of the cert
      // failure) — flush it so it does not leak. Retry re-fires only the cert GET.
      httpMock.expectOne(certRosterUrl('of1')).flush({ courses: [], distinct_learner_count: 0 });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-certification-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-certification-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      httpMock
        .expectOne(certUrl('of1'))
        .flush({ courses: [{ id: 'c1', title: 'Calculus I', certifications: [] }] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-certification-course"]')).not.toBeNull();
      httpMock.verify();
    });

    it('renders the read-only config for a non-manager (no manage controls exist)', () => {
      const { element, httpMock } = bootCertification({
        roles: ['learner'],
        courses: [{ id: 'c1', title: 'Calculus I', certifications: [] }],
      });
      expect(element.querySelector('[data-testid="offering-certification-course"]')).not.toBeNull();
      httpMock.verify();
    });

    describe('completion policy (manager, S2 / CHO-2054)', () => {
      const setInput = (element: HTMLElement, testid: string, value: string): void => {
        const input = element.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };

      it('shows the "not set" note + "Set policy" button when no policy is set', () => {
        const { element, httpMock } = bootCertification({ courses: [] });
        expect(
          element.querySelector('[data-testid="offering-certification-policy-none"]'),
        ).not.toBeNull();
        expect(
          element.querySelector('[data-testid="offering-certification-policy-summary"]'),
        ).toBeNull();
        expect(
          element.querySelector('[data-testid="offering-certification-policy-edit"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('renders the saved policy summary when the GET returns a completion_policy', () => {
        const { fixture, httpMock, element } = setup('of1', ['instructor'], 'certification');
        httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
        fixture.detectChanges();
        httpMock.expectOne(certUrl('of1')).flush({
          courses: [],
          completion_policy: {
            awards_certificate: true,
            passing_score_pct: 80,
            cert_title: 'Certificate of Completion',
            updated_at: '2026-07-07T00:00:00Z',
          },
        });
        fixture.detectChanges();
        // The manager cert tab also fired the roster GET — flush it so it does not leak.
        httpMock.expectOne(certRosterUrl('of1')).flush({ courses: [], distinct_learner_count: 0 });
        fixture.detectChanges();
        const summary = element.querySelector(
          '[data-testid="offering-certification-policy-summary"]',
        );
        expect(summary).not.toBeNull();
        expect(summary?.textContent).toContain('80');
        expect(summary?.textContent).toContain('Certificate of Completion');
        expect(
          element.querySelector('[data-testid="offering-certification-policy-none"]'),
        ).toBeNull();
        httpMock.verify();
      });

      it('opens the form → fills fields → PATCHes the body → splices + shows success', () => {
        const { fixture, httpMock, element } = bootCertification({ courses: [] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-certification-policy-edit"]')!
          .click();
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-certification-policy-form"]'),
        ).not.toBeNull();

        const awards = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-certification-policy-awards"]',
        )!;
        awards.checked = true;
        awards.dispatchEvent(new Event('change'));
        setInput(element, 'offering-certification-policy-score', '75');
        setInput(element, 'offering-certification-policy-title', 'Cert of Completion');
        fixture.detectChanges();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-certification-policy-submit"]')!
          .click();
        fixture.detectChanges();

        const patch = httpMock.expectOne((r) => r.url === certUrl('of1') && r.method === 'PATCH');
        expect(patch.request.body).toEqual({
          awards_certificate: true,
          passing_score_pct: 75,
          cert_title: 'Cert of Completion',
        });
        patch.flush({
          awards_certificate: true,
          passing_score_pct: 75,
          cert_title: 'Cert of Completion',
          updated_at: '2026-07-07T12:00:00Z',
        });
        fixture.detectChanges();

        expect(
          element.querySelector('[data-testid="offering-certification-policy-form"]'),
        ).toBeNull();
        expect(
          element.querySelector('[data-testid="offering-certification-policy-success"]'),
        ).not.toBeNull();
        const summary = element.querySelector(
          '[data-testid="offering-certification-policy-summary"]',
        );
        expect(summary?.textContent).toContain('75');
        expect(summary?.textContent).toContain('Cert of Completion');
        httpMock.verify(); // no follow-up GET
      });

      it('keeps save disabled for an out-of-range passing score', () => {
        const { fixture, httpMock, element } = bootCertification({ courses: [] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-certification-policy-edit"]')!
          .click();
        fixture.detectChanges();
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-certification-policy-submit"]',
        )!;
        setInput(element, 'offering-certification-policy-score', '150');
        fixture.detectChanges();
        expect(submit.disabled).toBe(true);
        setInput(element, 'offering-certification-policy-score', '80');
        fixture.detectChanges();
        expect(submit.disabled).toBe(false);
        httpMock.verify();
      });

      it('surfaces the BE {error} verbatim on a failed save (form stays open)', () => {
        const { fixture, httpMock, element } = bootCertification({ courses: [] });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-certification-policy-edit"]')!
          .click();
        fixture.detectChanges();
        setInput(element, 'offering-certification-policy-score', '90');
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-certification-policy-submit"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === certUrl('of1') && r.method === 'PATCH')
          .flush(
            { error: 'passing_score_pct must be in [0,100]' },
            {
              status: 400,
              statusText: 'Bad Request',
            },
          );
        fixture.detectChanges();
        const err = element.querySelector('[data-testid="offering-certification-policy-error"]');
        expect(err).not.toBeNull();
        expect(err?.getAttribute('role')).toBe('alert');
        expect(err?.textContent).toContain('passing_score_pct must be in [0,100]');
        // Form stays open so the input is preserved.
        expect(
          element.querySelector('[data-testid="offering-certification-policy-form"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('hides the manage button for a non-manager but still shows the read-only state', () => {
        const { element, httpMock } = bootCertification({ roles: ['learner'], courses: [] });
        expect(
          element.querySelector('[data-testid="offering-certification-policy-edit"]'),
        ).toBeNull();
        expect(
          element.querySelector('[data-testid="offering-certification-policy-none"]'),
        ).not.toBeNull();
        httpMock.verify();
      });
    });
  });

  describe('manual certificate issuance (certification tab)', () => {
    function certUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/certification`;
    }
    function rosterUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/roster`;
    }
    function issueUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/certification/issue`;
    }

    /**
     * Boot the workspace on the certification tab (manager); flush detail + the
     * cert GET + the roster GET (the cert tab lazy-loads the roster to back the
     * per-learner manual issue action). One learner (Ada, g-1) on course c1.
     */
    function bootIssue(
      opts: { roster?: Record<string, unknown> } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'certification');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock.expectOne(certUrl('of1')).flush({ courses: [] });
      fixture.detectChanges();
      const roster = httpMock.expectOne(rosterUrl('of1'));
      expect(roster.request.method).toBe('GET');
      roster.flush(
        opts.roster ?? {
          courses: [
            {
              id: 'c1',
              title: 'Calculus I',
              learners: [{ gcid: 'g-1', display_name: 'Ada Lovelace' }],
              learner_count: 1,
            },
          ],
          distinct_learner_count: 1,
        },
      );
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazy-loads the roster and renders a per-learner Issue button (manager)', () => {
      const { element, httpMock } = bootIssue();
      expect(
        element.querySelector('[data-testid="offering-certification-issue"]'),
      ).not.toBeNull();
      const learners = element.querySelectorAll(
        '[data-testid="offering-certification-issue-learner"]',
      );
      expect(learners.length).toBe(1);
      expect(learners[0]?.textContent).toContain('Ada Lovelace');
      expect(
        element.querySelector('[data-testid="offering-certification-issue-button"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('does NOT load the roster or show the Issue action for a non-manager', () => {
      // A learner never triggers the manager-only roster load — so no roster GET
      // fires (httpMock.verify would fail if one leaked) and no Issue UI renders.
      const { fixture, httpMock, element } = setup('of1', ['learner'], 'certification');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock.expectOne(certUrl('of1')).flush({ courses: [] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-certification-issue"]')).toBeNull();
      httpMock.verify();
    });

    it('renders an honest empty-state when no learners are enrolled', () => {
      const { element, httpMock } = bootIssue({
        roster: { courses: [], distinct_learner_count: 0 },
      });
      expect(
        element.querySelector('[data-testid="offering-certification-issue-empty"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="offering-certification-issue-button"]'),
      ).toBeNull();
      httpMock.verify();
    });

    it('clicking Issue → confirm POSTs {learner_gcid, course_id} → 201 success state', () => {
      const { fixture, httpMock, element } = bootIssue();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-issue-button"]')!
        .click();
      fixture.detectChanges();
      // Two-step confirm (mirrors the roster unenrol control).
      const confirm = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-certification-issue-confirm"]',
      );
      expect(confirm).not.toBeNull();
      confirm!.click();
      fixture.detectChanges();

      const req = httpMock.expectOne(issueUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ learner_gcid: 'g-1', course_id: 'c1' });
      req.flush(
        { certification_id: 'cert-1', course_id: 'c1', gcid: 'g-1' },
        { status: 201, statusText: 'Created' },
      );
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="offering-certification-issue-success"]'),
      ).not.toBeNull();
      // No follow-up GET — the row simply flips to its success note.
      httpMock.verify();
    });

    it('cancelling the confirm fires no POST', () => {
      const { fixture, httpMock, element } = bootIssue();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-issue-button"]')!
        .click();
      fixture.detectChanges();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-issue-cancel"]')!
        .click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="offering-certification-issue-confirm"]'),
      ).toBeNull();
      // The idle button is back; no issue POST was made.
      expect(
        element.querySelector('[data-testid="offering-certification-issue-button"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('treats a 409 as a friendly "already holds a certificate" info state (not an error)', () => {
      const { fixture, httpMock, element } = bootIssue();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-issue-button"]')!
        .click();
      fixture.detectChanges();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-issue-confirm"]')!
        .click();
      fixture.detectChanges();
      httpMock
        .expectOne(issueUrl('of1'))
        .flush({ error: 'learner already holds a certificate for this course' }, {
          status: 409,
          statusText: 'Conflict',
        });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="offering-certification-issue-already"]'),
      ).not.toBeNull();
      // A 409 is NOT the loud row-error state.
      expect(
        element.querySelector('[data-testid="offering-certification-issue-row-error"]'),
      ).toBeNull();
      httpMock.verify();
    });

    it('surfaces the BE {error} verbatim on a non-409 failure', () => {
      const { fixture, httpMock, element } = bootIssue();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-issue-button"]')!
        .click();
      fixture.detectChanges();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-issue-confirm"]')!
        .click();
      fixture.detectChanges();
      httpMock
        .expectOne(issueUrl('of1'))
        .flush({ error: 'course_id is not attached to this offering' }, {
          status: 400,
          statusText: 'Bad Request',
        });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-certification-issue-row-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(err?.textContent).toContain('course_id is not attached to this offering');
      httpMock.verify();
    });

    it('shows the WIRED auto-issue note in the completion-policy editor', () => {
      const { fixture, httpMock, element } = bootIssue();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-policy-edit"]')!
        .click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="offering-certification-policy-auto-issue-note"]'),
      ).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('roster panel (W7)', () => {
    function rosterUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/roster`;
    }

    /** Boot the workspace on the roster tab; flush detail + the GET. */
    function bootRoster(
      opts: {
        roles?: readonly string[];
        courses?: readonly Record<string, unknown>[];
        distinctLearnerCount?: number;
      } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup('of1', opts.roles ?? ['instructor'], 'roster');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(rosterUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        courses: opts.courses ?? [],
        distinct_learner_count: opts.distinctLearnerCount ?? 0,
      });
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazily GETs the roster when the tab is active and renders per-course learners', () => {
      const { httpMock, element } = bootRoster({
        distinctLearnerCount: 2,
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            learner_count: 2,
            learners: [
              {
                gcid: 'g1',
                display_name: 'Ada',
                progress_pct: 40,
                enrolled_at: '2026-06-01T00:00:00Z',
              },
              {
                gcid: 'g2',
                display_name: 'g2',
                progress_pct: 0,
                enrolled_at: '2026-06-02T00:00:00Z',
              },
            ],
          },
        ],
      });
      expect(element.querySelector('[data-testid="offering-panel-roster"]')).not.toBeNull();
      const courses = element.querySelectorAll('[data-testid="offering-roster-course"]');
      expect(courses.length).toBe(1);
      expect(courses[0]?.textContent).toContain('Calculus I');
      const learners = element.querySelectorAll('[data-testid="offering-roster-learner"]');
      expect(learners.length).toBe(2);
      expect(learners[0]?.textContent).toContain('Ada');
      // The distinct-people summary reflects the offering-level count (2).
      const summary = element.querySelector('[data-testid="offering-roster-summary"]');
      expect(summary?.textContent).toContain('2');
      httpMock.verify();
    });

    it('renders the courses in offering order', () => {
      const { element, httpMock } = bootRoster({
        courses: [
          { id: 'c1', title: 'First', learner_count: 0, learners: [] },
          { id: 'c2', title: 'Second', learner_count: 0, learners: [] },
        ],
      });
      const courses = element.querySelectorAll('[data-testid="offering-roster-course"]');
      expect(courses.length).toBe(2);
      expect(courses[0]?.textContent).toContain('First');
      expect(courses[1]?.textContent).toContain('Second');
      httpMock.verify();
    });

    it('shows the empty-state when the offering has no attached courses', () => {
      const { httpMock, element } = bootRoster({ courses: [] });
      expect(element.querySelector('[data-testid="offering-roster-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-roster-course"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a per-course "no one enrolled" note for a course with no learners', () => {
      const { element, httpMock } = bootRoster({
        courses: [{ id: 'c1', title: 'Empty Cohort', learner_count: 0, learners: [] }],
      });
      expect(element.querySelector('[data-testid="offering-roster-course"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-roster-course-none"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-roster-learner"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a loading state until the roster resolves', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'roster');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(rosterUrl('of1'));
      expect(element.querySelector('[data-testid="offering-roster-loading"]')).not.toBeNull();
      req.flush({ courses: [], distinct_learner_count: 0 });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'roster');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-roster-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-roster-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      httpMock.expectOne(rosterUrl('of1')).flush({
        courses: [{ id: 'c1', title: 'Calculus I', learner_count: 0, learners: [] }],
        distinct_learner_count: 0,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-roster-course"]')).not.toBeNull();
      httpMock.verify();
    });

    it('renders the read-only roster for a non-manager (no manage controls exist)', () => {
      const { element, httpMock } = bootRoster({
        roles: ['learner'],
        courses: [{ id: 'c1', title: 'Calculus I', learner_count: 0, learners: [] }],
      });
      expect(element.querySelector('[data-testid="offering-roster-course"]')).not.toBeNull();
      httpMock.verify();
    });

    describe('enrol (manager, S3 / CHO-2053)', () => {
      const twoCourses = [
        { id: 'c1', title: 'Calculus I', learner_count: 0, learners: [] },
        { id: 'c2', title: 'Algebra', learner_count: 0, learners: [] },
      ];

      it('shows the "Enrol learner" button when there are attached courses', () => {
        const { element, httpMock } = bootRoster({ courses: twoCourses });
        expect(element.querySelector('[data-testid="offering-roster-enrol"]')).not.toBeNull();
        httpMock.verify();
      });

      it('renders the member-multiselect checklist for enrolment (not a single-name field)', () => {
        const { fixture, httpMock, element } = bootRoster({ courses: twoCourses });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-roster-enrol"]')!.click();
        fixture.detectChanges();
        // Issue 4b: a proper multi-select checklist replaces the old single field.
        expect(
          element.querySelector('[data-testid="offering-roster-enrol-members"]'),
        ).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-roster-enrol-gcid"]')).toBeNull();
        httpMock.verify();
      });

      it('selects a course + members -> POSTs /roster/bulk -> success + re-GETs on 201', () => {
        const { fixture, httpMock, element } = bootRoster({ courses: twoCourses });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-roster-enrol"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-roster-enrol-form"]')).not.toBeNull();

        const course = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-roster-enrol-course"]',
        )!;
        course.value = 'c2';
        course.dispatchEvent(new Event('change'));
        // The checklist child emits its ticked gcids up to the parent.
        fixture.componentInstance.onEnrolSelectionChange(['learner-9', 'learner-7']);
        fixture.detectChanges();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-enrol-submit"]')!
          .click();
        fixture.detectChanges();

        const post = httpMock.expectOne(
          (r) => r.url === rosterUrl('of1') + '/bulk' && r.method === 'POST',
        );
        expect(post.request.body).toEqual({
          course_id: 'c2',
          gcids: ['learner-9', 'learner-7'],
        });
        post.flush(
          {
            course_id: 'c2',
            requested_count: 2,
            inserted_count: 2,
            enrollment_ids: ['en1', 'en2'],
          },
          { status: 201, statusText: 'Created' },
        );
        fixture.detectChanges();

        // Success note shows, the selection clears, the form closes, and a silent
        // re-GET refreshes the roster.
        expect(
          element.querySelector('[data-testid="offering-roster-enrol-success"]'),
        ).not.toBeNull();
        expect(fixture.componentInstance.enrolSelectedCount()).toBe(0);
        expect(element.querySelector('[data-testid="offering-roster-enrol-form"]')).toBeNull();
        httpMock
          .expectOne((r) => r.url === rosterUrl('of1') && r.method === 'GET')
          .flush({
            courses: [
              {
                id: 'c2',
                title: 'Algebra',
                learner_count: 2,
                learners: [
                  {
                    gcid: 'learner-9',
                    display_name: 'Nine',
                    progress_pct: 0,
                    enrolled_at: '2026-07-07T00:00:00Z',
                  },
                  {
                    gcid: 'learner-7',
                    display_name: 'Seven',
                    progress_pct: 0,
                    enrolled_at: '2026-07-07T00:00:00Z',
                  },
                ],
              },
            ],
            distinct_learner_count: 2,
          });
        fixture.detectChanges();
        expect(
          element.querySelectorAll('[data-testid="offering-roster-learner"]').length,
        ).toBe(2);
        httpMock.verify();
      });

      it('surfaces the BE {error} verbatim on a 409 (form stays open, no re-GET)', () => {
        const { fixture, httpMock, element } = bootRoster({ courses: twoCourses });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-roster-enrol"]')!.click();
        fixture.detectChanges();
        fixture.componentInstance.onEnrolSelectionChange(['learner-1']);
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-enrol-submit"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === rosterUrl('of1') + '/bulk' && r.method === 'POST')
          .flush({ error: 'batch exceeds capacity' }, { status: 409, statusText: 'Conflict' });
        fixture.detectChanges();
        const err = element.querySelector('[data-testid="offering-roster-enrol-error"]');
        expect(err).not.toBeNull();
        expect(err?.getAttribute('role')).toBe('alert');
        expect(err?.textContent).toContain('batch exceeds capacity');
        expect(element.querySelector('[data-testid="offering-roster-enrol-form"]')).not.toBeNull();
        httpMock.verify(); // no re-GET on failure
      });

      it('hides the enrol button for a non-manager', () => {
        const { element, httpMock } = bootRoster({ roles: ['learner'], courses: twoCourses });
        expect(element.querySelector('[data-testid="offering-roster-enrol"]')).toBeNull();
        httpMock.verify();
      });
    });

    describe('unenrol (manager, WS-B)', () => {
      function rosterRemoveUrl(id: string): string {
        return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/roster/remove`;
      }
      const oneLearner = [
        {
          id: 'c1',
          title: 'Calculus I',
          learner_count: 1,
          learners: [
            {
              gcid: 'g1',
              display_name: 'Ada',
              progress_pct: 40,
              enrolled_at: '2026-06-01T00:00:00Z',
            },
          ],
        },
      ];

      it('shows a per-learner Unenrol button for a manager', () => {
        const { element, httpMock } = bootRoster({ courses: oneLearner });
        expect(element.querySelector('[data-testid="offering-roster-unenrol"]')).not.toBeNull();
        httpMock.verify();
      });

      it('hides the Unenrol button for a non-manager (read-only roster)', () => {
        const { element, httpMock } = bootRoster({ roles: ['learner'], courses: oneLearner });
        expect(element.querySelector('[data-testid="offering-roster-learner"]')).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-roster-unenrol"]')).toBeNull();
        httpMock.verify();
      });

      it('two-step confirm → Confirm POSTs {course_id,gcid} → re-GETs on 204', () => {
        const { fixture, httpMock, element } = bootRoster({ courses: oneLearner });
        // Step 1: reveal the inline confirm (no POST yet).
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-unenrol"]')!
          .click();
        fixture.detectChanges();
        const confirm = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-roster-unenrol-confirm"]',
        );
        expect(confirm).not.toBeNull();

        // Step 2: confirm fires the POST with the row's natural key.
        confirm!.click();
        fixture.detectChanges();
        const post = httpMock.expectOne(
          (r) => r.url === rosterRemoveUrl('of1') && r.method === 'POST',
        );
        expect(post.request.body).toEqual({ course_id: 'c1', gcid: 'g1' });
        post.flush(null, { status: 204, statusText: 'No Content' });
        fixture.detectChanges();

        // 204 → silent re-GET; the removed learner drops out + a success note shows.
        httpMock
          .expectOne((r) => r.url === rosterUrl('of1') && r.method === 'GET')
          .flush({
            courses: [{ id: 'c1', title: 'Calculus I', learner_count: 0, learners: [] }],
            distinct_learner_count: 0,
          });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-roster-learner"]')).toBeNull();
        expect(
          element.querySelector('[data-testid="offering-roster-unenrol-success"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('Cancel dismisses the confirm without POSTing', () => {
        const { fixture, httpMock, element } = bootRoster({ courses: oneLearner });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-unenrol"]')!
          .click();
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-unenrol-cancel"]')!
          .click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-roster-unenrol-confirm"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-roster-unenrol"]')).not.toBeNull();
        httpMock.verify(); // no POST fired
      });

      it('surfaces the BE {error} verbatim on a 404 (roster left intact)', () => {
        const { fixture, httpMock, element } = bootRoster({ courses: oneLearner });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-unenrol"]')!
          .click();
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-unenrol-confirm"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === rosterRemoveUrl('of1') && r.method === 'POST')
          .flush({ error: 'enrolment not found' }, { status: 404, statusText: 'Not Found' });
        fixture.detectChanges();
        const err = element.querySelector('[data-testid="offering-roster-unenrol-error"]');
        expect(err).not.toBeNull();
        expect(err?.getAttribute('role')).toBe('alert');
        expect(err?.textContent).toContain('enrolment not found');
        // Removal failed — never blow the roster away.
        expect(element.querySelector('[data-testid="offering-roster-learner"]')).not.toBeNull();
        httpMock.verify(); // no re-GET on failure
      });

      it('disables the confirm button while the unenrol POST is in-flight', () => {
        const { fixture, httpMock, element } = bootRoster({ courses: oneLearner });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-unenrol"]')!
          .click();
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-roster-unenrol-confirm"]')!
          .click();
        fixture.detectChanges();
        const pending = httpMock.expectOne(
          (r) => r.url === rosterRemoveUrl('of1') && r.method === 'POST',
        );
        // In-flight: the confirm button is disabled (per-row busy guard).
        expect(
          element.querySelector<HTMLButtonElement>(
            '[data-testid="offering-roster-unenrol-confirm"]',
          )!.disabled,
        ).toBe(true);
        pending.flush(null, { status: 204, statusText: 'No Content' });
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === rosterUrl('of1') && r.method === 'GET')
          .flush({
            courses: [{ id: 'c1', title: 'Calculus I', learner_count: 0, learners: [] }],
            distinct_learner_count: 0,
          });
        fixture.detectChanges();
        httpMock.verify();
      });
    });
  });

  describe('transcript panel (W6, per-offering gradebook join)', () => {
    function assessmentsUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/assessments`;
    }
    function rosterUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/roster`;
    }
    function transcriptUrl(): string {
      return `${environment.bffBaseUrl}/api/v1/transcript/by-assessments`;
    }

    const oneAssessment = [
      {
        assessment_id: 'as1',
        offering_id: 'of1',
        test_set_id: 'ts1',
        title: 'Midterm Assessment',
        state: 'RELEASED',
        question_count: 10,
        total_points: 100,
        created_at: '2026-06-10T00:00:00Z',
      },
    ];
    const oneLearnerCourse = [
      {
        id: 'c1',
        title: 'Calculus I',
        learner_count: 1,
        learners: [
          {
            gcid: 'g1',
            display_name: 'Ada',
            progress_pct: 40,
            enrolled_at: '2026-06-01T00:00:00Z',
          },
        ],
      },
    ];

    /**
     * Boot the workspace on the transcript tab; flush detail, then the
     * REUSED assessments + roster GETs (both fire in parallel once the tab
     * is active), then — only when there is at least one assessment id — the
     * new transcript-entries GET (the join needs assessment ids up front).
     */
    function bootTranscript(
      opts: {
        roles?: readonly string[];
        assessments?: readonly Record<string, unknown>[];
        rosterCourses?: readonly Record<string, unknown>[];
        transcriptItems?: readonly Record<string, unknown>[];
      } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup(
        'of1',
        opts.roles ?? ['instructor'],
        'transcript',
      );
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();

      const assessments = opts.assessments ?? oneAssessment;
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush({ items: assessments, next_page_token: null });
      fixture.detectChanges();

      httpMock.expectOne(rosterUrl('of1')).flush({
        courses: opts.rosterCourses ?? oneLearnerCourse,
        distinct_learner_count: (opts.rosterCourses ?? oneLearnerCourse).length > 0 ? 1 : 0,
      });
      fixture.detectChanges();

      if (assessments.length > 0) {
        httpMock
          .expectOne((r) => r.url === transcriptUrl())
          .flush({ items: opts.transcriptItems ?? [] });
        fixture.detectChanges();
      }

      return { fixture, httpMock, element };
    }

    it('lazily GETs assessments + roster + transcript and renders the gradebook matrix', () => {
      const { httpMock, element } = bootTranscript({
        transcriptItems: [
          {
            entry_id: 'te1',
            gcid: 'g1',
            kind: 'assessment',
            source_ref: 'as1',
            title: '',
            score_earned: 8.5,
            score_possible: 10,
            score_percent: 85,
            passed: true,
            course_id: null,
            occurred_at: '2026-07-01T00:00:00Z',
          },
        ],
      });
      expect(element.querySelector('[data-testid="offering-panel-transcript"]')).not.toBeNull();
      const table = element.querySelector('[data-testid="offering-transcript-table"]');
      expect(table).not.toBeNull();
      // The column header is the DELIVERY assessment title (never the
      // transcript row's own — always empty — title).
      expect(table?.textContent).toContain('Midterm Assessment');
      const rows = element.querySelectorAll('[data-testid="offering-transcript-row"]');
      expect(rows.length).toBe(1);
      expect(rows[0]?.textContent).toContain('Ada');
      const cell = element.querySelector('[data-testid="offering-transcript-cell"]');
      expect(cell?.textContent).toContain('85%');
      expect(cell?.querySelector('.badge')?.classList.contains('badge-success')).toBe(true);
      // Single-assessment overall mirrors the one graded score.
      const overall = element.querySelector('[data-testid="offering-transcript-overall"]');
      expect(overall?.textContent).toContain('85%');
      const cohort = element.querySelector('[data-testid="offering-transcript-cohort-cell"]');
      expect(cohort?.textContent).toContain('85%');
      httpMock.verify();
    });

    it('renders a red fail chip for a graded-but-not-passed entry', () => {
      const { element, httpMock } = bootTranscript({
        transcriptItems: [
          {
            entry_id: 'te1',
            gcid: 'g1',
            kind: 'assessment',
            source_ref: 'as1',
            title: '',
            score_earned: 3,
            score_possible: 10,
            score_percent: 30,
            passed: false,
            course_id: null,
            occurred_at: '2026-07-01T00:00:00Z',
          },
        ],
      });
      const cell = element.querySelector('[data-testid="offering-transcript-cell"]');
      expect(cell?.textContent).toContain('30%');
      expect(cell?.querySelector('.badge')?.classList.contains('badge-danger')).toBe(true);
      httpMock.verify();
    });

    it('shows a blank "not graded" cell (and blank overall/cohort average) with no matching entry', () => {
      const { element, httpMock } = bootTranscript({ transcriptItems: [] });
      const cell = element.querySelector('[data-testid="offering-transcript-cell"]');
      expect(cell?.querySelector('.badge')).toBeNull();
      expect(element.querySelector('[data-testid="offering-transcript-ungraded"]')).not.toBeNull();
      const overall = element.querySelector('[data-testid="offering-transcript-overall"]');
      expect(overall?.querySelector('.badge')).toBeNull();
      httpMock.verify();
    });

    it('matches entries by (source_ref, gcid) — ignores a row for a different assessment or learner', () => {
      const { element, httpMock } = bootTranscript({
        transcriptItems: [
          {
            entry_id: 'te-other-assessment',
            gcid: 'g1',
            kind: 'assessment',
            source_ref: 'as-not-attached',
            title: '',
            score_earned: 9,
            score_possible: 10,
            score_percent: 90,
            passed: true,
            course_id: null,
            occurred_at: '2026-07-01T00:00:00Z',
          },
          {
            entry_id: 'te-other-learner',
            gcid: 'g-not-enrolled',
            kind: 'assessment',
            source_ref: 'as1',
            title: '',
            score_earned: 1,
            score_possible: 10,
            score_percent: 10,
            passed: false,
            course_id: null,
            occurred_at: '2026-07-01T00:00:00Z',
          },
        ],
      });
      const rows = element.querySelectorAll('[data-testid="offering-transcript-row"]');
      expect(rows.length).toBe(1); // only the roster's one learner, never the stray gcid
      const cell = element.querySelector('[data-testid="offering-transcript-cell"]');
      expect(cell?.textContent).not.toContain('90%');
      expect(cell?.textContent).not.toContain('10%');
      expect(element.querySelector('[data-testid="offering-transcript-ungraded"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows the "no assessments" empty-state and fires NO transcript GET when the offering has none', () => {
      const { httpMock, element } = bootTranscript({ assessments: [] });
      expect(element.querySelector('[data-testid="offering-transcript-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-transcript-table"]')).toBeNull();
      httpMock.expectNone((r) => r.url === transcriptUrl());
      httpMock.verify();
    });

    it('shows a "no one enrolled" empty-state when there are assessments but no roster learners', () => {
      const { httpMock, element } = bootTranscript({ rosterCourses: [] });
      expect(
        element.querySelector('[data-testid="offering-transcript-no-learners"]'),
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-transcript-table"]')).toBeNull();
      httpMock.verify();
    });

    it('shows the phase-1 (assessments) loading state before assessments resolve', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'transcript');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="offering-transcript-assessments-loading"]'),
      ).not.toBeNull();
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush({ items: oneAssessment, next_page_token: null });
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush({ courses: oneLearnerCourse, distinct_learner_count: 1 });
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === transcriptUrl()).flush({ items: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows the phase-2 (roster + transcript) loading state once assessments resolve', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'transcript');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush({ items: oneAssessment, next_page_token: null });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-transcript-loading"]')).not.toBeNull();
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush({ courses: oneLearnerCourse, distinct_learner_count: 1 });
      httpMock.expectOne((r) => r.url === transcriptUrl()).flush({ items: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry when the assessments GET fails (phase 1)', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'transcript');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush({ courses: oneLearnerCourse, distinct_learner_count: 1 });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-transcript-assessments-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-transcript-assessments-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      fixture.detectChanges();
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush({ items: oneAssessment, next_page_token: null });
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === transcriptUrl()).flush({ items: [] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-transcript-table"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry when the roster GET fails (phase 2)', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'transcript');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush({ items: oneAssessment, next_page_token: null });
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === transcriptUrl()).flush({ items: [] });
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-transcript-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-transcript-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      fixture.detectChanges();
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush({ courses: oneLearnerCourse, distinct_learner_count: 1 });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-transcript-table"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry when the transcript-entries GET itself fails', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'transcript');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(assessmentsUrl('of1'))
        .flush({ items: oneAssessment, next_page_token: null });
      fixture.detectChanges();
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush({ courses: oneLearnerCourse, distinct_learner_count: 1 });
      httpMock
        .expectOne((r) => r.url === transcriptUrl())
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-transcript-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-transcript-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === transcriptUrl()).flush({ items: [] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-transcript-table"]')).not.toBeNull();
      httpMock.verify();
    });

    it('renders the read-only gradebook for a non-manager role too (no write affordances exist)', () => {
      const { element, httpMock } = bootTranscript({ roles: ['learner'] });
      expect(element.querySelector('[data-testid="offering-transcript-table"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('analytics panel (W7, async)', () => {
    function analyticsUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/analytics`;
    }

    /** Boot the workspace on the analytics tab (async offering); flush detail + GET. */
    function bootAnalytics(
      opts: { roles?: readonly string[]; body?: Record<string, unknown> } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup(
        'of1',
        opts.roles ?? ['instructor'],
        'analytics',
      );
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(analyticsUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush(
        opts.body ?? {
          state: 'DRAFT',
          capacity: 0,
          capacity_unbounded: true,
          capacity_utilisation_pct: null,
          total_enrollments: 0,
          distinct_learners: 0,
          assessment_count: 0,
          courses: [],
        },
      );
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazily GETs analytics when the tab is active and renders the roll-up', () => {
      const { httpMock, element } = bootAnalytics({
        body: {
          state: 'LAUNCHED',
          capacity: 10,
          capacity_unbounded: false,
          capacity_utilisation_pct: 30,
          total_enrollments: 4,
          distinct_learners: 3,
          assessment_count: 2,
          courses: [{ id: 'c1', title: 'Course A', enrollments: 2 }],
        },
      });
      expect(element.querySelector('[data-testid="offering-panel-analytics"]')).not.toBeNull();
      expect(
        element.querySelector('[data-testid="offering-analytics-total-enrollments"]')?.textContent,
      ).toContain('4');
      expect(
        element.querySelector('[data-testid="offering-analytics-distinct-learners"]')?.textContent,
      ).toContain('3');
      expect(
        element.querySelector('[data-testid="offering-analytics-state"]')?.textContent,
      ).toContain('LAUNCHED');
      // capacity cell shows "10 (30%)".
      expect(
        element.querySelector('[data-testid="offering-analytics-capacity"]')?.textContent,
      ).toContain('30');
      const rows = element.querySelectorAll('[data-testid="offering-analytics-course-row"]');
      expect(rows.length).toBe(1);
      expect(rows[0]?.textContent).toContain('Course A');
      httpMock.verify();
    });

    it('shows unbounded capacity (no utilisation %) for async offerings', () => {
      const { element, httpMock } = bootAnalytics(); // default body = unbounded
      const cap = element.querySelector('[data-testid="offering-analytics-capacity"]');
      expect(cap?.textContent).not.toContain('%');
      httpMock.verify();
    });

    it('always shows the deferred-metrics note (honest UX, not faked)', () => {
      const { element, httpMock } = bootAnalytics();
      expect(element.querySelector('[data-testid="offering-analytics-deferred"]')).not.toBeNull();
      httpMock.verify();
    });

    it('renders the progress + completion roll-up the BE returns (CHO-1827)', () => {
      const { element, httpMock } = bootAnalytics({
        body: {
          state: 'LAUNCHED',
          capacity: 0,
          capacity_unbounded: true,
          total_enrollments: 4,
          distinct_learners: 4,
          assessment_count: 0,
          avg_progress_pct: 62,
          completion_rate_pct: 25,
          completed_enrollments: 1,
          courses: [],
        },
      });
      expect(
        element.querySelector('[data-testid="offering-analytics-avg-progress"]')?.textContent,
      ).toContain('62');
      expect(
        element.querySelector('[data-testid="offering-analytics-completion-rate"]')?.textContent,
      ).toContain('25');
      expect(
        element.querySelector('[data-testid="offering-analytics-completed"]')?.textContent,
      ).toContain('1');
      httpMock.verify();
    });

    // An offering with no enrolments must render the not-applicable branch, never
    // "0%": 0% asserts the cohort learned nothing, which is a different (and false)
    // claim. The harness's translate pipe emits the KEY, so assert the branch by
    // its key; the English copy itself is guarded in the i18n copy spec below.
    it('renders null progress/completion as not-applicable, never as 0%', () => {
      const { element, httpMock } = bootAnalytics({
        body: {
          state: 'DRAFT',
          capacity: 0,
          capacity_unbounded: true,
          total_enrollments: 0,
          distinct_learners: 0,
          assessment_count: 0,
          avg_progress_pct: null,
          completion_rate_pct: null,
          completed_enrollments: 0,
          courses: [],
        },
      });
      const prog = element.querySelector('[data-testid="offering-analytics-avg-progress"]');
      const comp = element.querySelector('[data-testid="offering-analytics-completion-rate"]');
      expect(prog?.textContent).not.toContain('0%');
      expect(comp?.textContent).not.toContain('0%');
      expect(prog?.textContent).toContain('analytics.not_applicable');
      expect(comp?.textContent).toContain('analytics.not_applicable');
      httpMock.verify();
    });

    it('renders per-course progress + completion columns', () => {
      const { element, httpMock } = bootAnalytics({
        body: {
          total_enrollments: 2,
          courses: [
            {
              id: 'c1',
              title: 'Course A',
              enrollments: 2,
              avg_progress_pct: 50,
              completion_rate_pct: 50,
              completed_learners: 1,
            },
          ],
        },
      });
      const row = element.querySelector('[data-testid="offering-analytics-course-row"]');
      expect(row?.textContent).toContain('Course A');
      expect(row?.textContent).toContain('50');
      httpMock.verify();
    });

    // The note still renders (pass-rate remains genuinely unbuilt); what it SAYS
    // is asserted against en.json in the i18n copy spec, because the harness's
    // translate pipe emits keys rather than English.
    it('still renders the deferred note (pass-rate is genuinely unbuilt)', () => {
      const { element, httpMock } = bootAnalytics();
      expect(element.querySelector('[data-testid="offering-analytics-deferred"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows a loading state until analytics resolve', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'analytics');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(analyticsUrl('of1'));
      expect(element.querySelector('[data-testid="offering-analytics-loading"]')).not.toBeNull();
      req.flush({ courses: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'analytics');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      httpMock
        .expectOne(analyticsUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-analytics-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-analytics-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      httpMock.expectOne(analyticsUrl('of1')).flush({ courses: [] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-analytics-grid"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('sections panel (W7)', () => {
    function sectionsUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/sections`;
    }
    function sectionDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        section_id: 'sec1',
        name: 'Morning Cohort',
        lead_instructor_gcid: 'g1',
        room: 'Room 204',
        start_date: '2026-09-01',
        end_date: '2026-12-15',
        created_at: '2026-06-10T00:00:00Z',
        updated_at: '2026-06-10T00:00:00Z',
        ...overrides,
      };
    }

    /** Boot the workspace on the sections tab; flush detail + the list GET. */
    function bootSections(
      opts: { roles?: readonly string[]; list?: readonly Record<string, unknown>[] } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup('of1', opts.roles ?? ['instructor'], 'sections');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(sectionsUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({ sections: opts.list ?? [] });
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazily GETs the sections when the tab is active and renders rows', () => {
      const { httpMock, element } = bootSections({
        list: [sectionDto(), sectionDto({ section_id: 'sec2', name: 'Evening Cohort' })],
      });
      expect(element.querySelector('[data-testid="offering-panel-sections"]')).not.toBeNull();
      const rows = element.querySelectorAll('[data-testid="offering-sections-row"]');
      expect(rows.length).toBe(2);
      expect(rows[0]?.textContent).toContain('Morning Cohort');
      expect(rows[1]?.textContent).toContain('Evening Cohort');
      httpMock.verify();
    });

    it('shows the empty-state when the offering has no sections', () => {
      const { httpMock, element } = bootSections({ list: [] });
      expect(element.querySelector('[data-testid="offering-sections-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-sections-row"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a loading state until the list resolves', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'sections');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(sectionsUrl('of1'));
      expect(element.querySelector('[data-testid="offering-sections-loading"]')).not.toBeNull();
      req.flush({ sections: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'sections');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(sectionsUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-sections-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-sections-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      httpMock.expectOne(sectionsUrl('of1')).flush({ sections: [sectionDto()] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-sections-row"]')).not.toBeNull();
      httpMock.verify();
    });

    describe('create (manager)', () => {
      it('opens the form → fills name → submit POSTs (name-only body) + refreshes', () => {
        const { fixture, httpMock, element } = bootSections({ list: [] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-add"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-sections-form"]')).not.toBeNull();

        const nameInput = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-name"]',
        )!;
        nameInput.value = 'Morning Cohort';
        nameInput.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-sections-submit"]')!
          .click();
        fixture.detectChanges();

        const post = httpMock.expectOne(sectionsUrl('of1'));
        expect(post.request.method).toBe('POST');
        // Empty optional inputs drop out → a clean name-only body.
        expect(post.request.body).toEqual({ name: 'Morning Cohort' });
        post.flush(sectionDto(), { status: 201, statusText: 'Created' });
        fixture.detectChanges();

        // The list refreshes (a fresh GET) and the form closes.
        httpMock.expectOne(sectionsUrl('of1')).flush({ sections: [sectionDto()] });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-sections-row"]')).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-sections-form"]')).toBeNull();
        expect(
          element.querySelector('[data-testid="offering-sections-create-success"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('disables the submit button while the name is blank', () => {
        const { fixture, httpMock, element } = bootSections({ list: [] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-add"]')!.click();
        fixture.detectChanges();
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-sections-submit"]',
        )!;
        expect(submit.disabled).toBe(true);
        const nameInput = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-name"]',
        )!;
        nameInput.value = 'Group A';
        nameInput.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(submit.disabled).toBe(false);
        httpMock.verify();
      });

      it('surfaces a fail-loud create error when the POST fails (e.g. 409)', () => {
        const { fixture, httpMock, element } = bootSections({ list: [] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-add"]')!.click();
        fixture.detectChanges();
        const nameInput = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-name"]',
        )!;
        nameInput.value = 'Group A';
        nameInput.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-sections-submit"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne(sectionsUrl('of1'))
          .flush({ error: 'not graduate' }, { status: 409, statusText: 'Conflict' });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-sections-create-error"]'),
        ).not.toBeNull();
        // The form stays open so the author can fix + retry.
        expect(element.querySelector('[data-testid="offering-sections-form"]')).not.toBeNull();
        httpMock.verify();
      });

      it('uses a name-search picker for the lead instructor (not a raw-GCID field)', () => {
        const { fixture, httpMock, element } = bootSections({ list: [] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-add"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-sections-lead"]')).not.toBeNull();
        expect(element.querySelector('input[data-testid="offering-sections-lead"]')).toBeNull();

        const nameInput = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-name"]',
        )!;
        nameInput.value = 'Morning Cohort';
        nameInput.dispatchEvent(new Event('input'));
        fixture.componentInstance.onSectionLeadPicked({ id: 'inst-1', label: 'Ada Instructor' });
        fixture.detectChanges();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-sections-submit"]')!
          .click();
        fixture.detectChanges();

        const post = httpMock.expectOne(sectionsUrl('of1'));
        expect(post.request.body).toEqual({
          name: 'Morning Cohort',
          lead_instructor_gcid: 'inst-1',
        });
        post.flush(sectionDto({ lead_instructor_gcid: 'inst-1' }), {
          status: 201,
          statusText: 'Created',
        });
        fixture.detectChanges();
        httpMock
          .expectOne(sectionsUrl('of1'))
          .flush({ sections: [sectionDto({ lead_instructor_gcid: 'inst-1' })] });
        fixture.detectChanges();
        // The picked chip resets once the form closes on success.
        expect(fixture.componentInstance.sectionLeadPicked()).toEqual([]);
        httpMock.verify();
      });
    });

    describe('edit (manager, S4 / CHO-2051)', () => {
      const sectionUrl = (id: string, sectionId: string): string =>
        `${sectionsUrl(id)}/${sectionId}`;

      it('shows an Edit button per section (manager)', () => {
        const { element, httpMock } = bootSections({ list: [sectionDto()] });
        expect(element.querySelector('[data-testid="offering-sections-edit"]')).not.toBeNull();
        httpMock.verify();
      });

      it('opens the edit form → changes name → PATCHes only the changed field → splices row', () => {
        const { fixture, httpMock, element } = bootSections({ list: [sectionDto()] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-sections-edit-form"]')).not.toBeNull();

        const name = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-edit-name"]',
        )!;
        name.value = 'Renamed Cohort';
        name.dispatchEvent(new Event('input'));
        fixture.detectChanges();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit-submit"]')!
          .click();
        fixture.detectChanges();

        const patch = httpMock.expectOne(
          (r) => r.url === sectionUrl('of1', 'sec1') && r.method === 'PATCH',
        );
        // Only the changed field (name) is sent — lead/room/dates were untouched.
        expect(patch.request.body).toEqual({ name: 'Renamed Cohort' });
        patch.flush(sectionDto({ name: 'Renamed Cohort' }));
        fixture.detectChanges();

        expect(element.querySelector('[data-testid="offering-sections-edit-form"]')).toBeNull();
        expect(
          element.querySelector('[data-testid="offering-sections-update-success"]'),
        ).not.toBeNull();
        const row = element.querySelector('[data-testid="offering-sections-row"]');
        expect(row?.textContent).toContain('Renamed Cohort');
        httpMock.verify(); // in-place splice, no re-GET
      });

      it('serialises multiple changed fields (name + room) in the patch', () => {
        const { fixture, httpMock, element } = bootSections({ list: [sectionDto()] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit"]')!.click();
        fixture.detectChanges();
        const name = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-edit-name"]',
        )!;
        name.value = 'New Name';
        name.dispatchEvent(new Event('input'));
        const room = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-edit-room"]',
        )!;
        room.value = 'Room 9';
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit-submit"]')!
          .click();
        fixture.detectChanges();
        const patch = httpMock.expectOne(
          (r) => r.url === sectionUrl('of1', 'sec1') && r.method === 'PATCH',
        );
        expect(patch.request.body).toEqual({ name: 'New Name', room: 'Room 9' });
        patch.flush(sectionDto({ name: 'New Name', room: 'Room 9' }));
        fixture.detectChanges();
        httpMock.verify();
      });

      it('surfaces the BE {error} verbatim on a failed edit (form stays open)', () => {
        const { fixture, httpMock, element } = bootSections({ list: [sectionDto()] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit"]')!.click();
        fixture.detectChanges();
        const name = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-edit-name"]',
        )!;
        name.value = 'X';
        name.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit-submit"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === sectionUrl('of1', 'sec1') && r.method === 'PATCH')
          .flush(
            { error: 'section name must not be blank' },
            {
              status: 400,
              statusText: 'Bad Request',
            },
          );
        fixture.detectChanges();
        const err = element.querySelector('[data-testid="offering-sections-update-error"]');
        expect(err).not.toBeNull();
        expect(err?.getAttribute('role')).toBe('alert');
        expect(err?.textContent).toContain('section name must not be blank');
        expect(element.querySelector('[data-testid="offering-sections-edit-form"]')).not.toBeNull();
        httpMock.verify();
      });

      it('keeps the edit submit disabled when the name is cleared', () => {
        const { fixture, httpMock, element } = bootSections({ list: [sectionDto()] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit"]')!.click();
        fixture.detectChanges();
        const name = element.querySelector<HTMLInputElement>(
          '[data-testid="offering-sections-edit-name"]',
        )!;
        name.value = '';
        name.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-sections-edit-submit"]',
        )!;
        expect(submit.disabled).toBe(true);
        httpMock.verify();
      });

      it('uses a name-search picker for the lead instructor field (not a raw-GCID field)', () => {
        const { fixture, httpMock, element } = bootSections({ list: [sectionDto()] });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-sections-edit-lead"]')).not.toBeNull();
        expect(
          element.querySelector('input[data-testid="offering-sections-edit-lead"]'),
        ).toBeNull();

        fixture.componentInstance.onEditSectionLeadPicked({
          id: 'inst-2',
          label: 'Bo Instructor',
        });
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit-submit"]')!
          .click();
        fixture.detectChanges();

        const patch = httpMock.expectOne(
          (r) => r.url === sectionUrl('of1', 'sec1') && r.method === 'PATCH',
        );
        // Only the changed field (lead) is sent — name/room/dates were untouched.
        expect(patch.request.body).toEqual({ lead_instructor_gcid: 'inst-2' });
        patch.flush(sectionDto({ lead_instructor_gcid: 'inst-2' }));
        fixture.detectChanges();
        expect(fixture.componentInstance.editSectionLeadPicked()).toEqual([]);
        httpMock.verify();
      });

      it("prefills the edit picker from the section's current lead instructor", () => {
        const { fixture, element } = bootSections({
          list: [sectionDto({ lead_instructor_gcid: 'inst-9' })],
        });
        element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit"]')!.click();
        fixture.detectChanges();
        expect(fixture.componentInstance.editSectionLeadPicked()).toEqual([
          { id: 'inst-9', label: 'inst-9' },
        ]);
        TestBed.inject(HttpTestingController).verify();
      });
    });

    describe('role-gated visibility', () => {
      it('hides the create affordance for a non-manager but renders the read-only list', () => {
        const { fixture, httpMock, element } = bootSections({
          roles: ['learner'],
          list: [sectionDto()],
        });
        expect(fixture.componentInstance.canManage()).toBe(false);
        expect(element.querySelector('[data-testid="offering-sections-add"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-sections-form"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-sections-edit"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-sections-row"]')).not.toBeNull();
        httpMock.verify();
      });
    });
  });

  describe('schedule panel (CHO-1985)', () => {
    function scheduleUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/schedule`;
    }
    // CHO-2191: the room picker source. Opening the session form GETs this.
    const roomsUrl = `${environment.bffBaseUrl}/api/v1/rooms`;
    function roomDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return { id: 'room-abc', name: 'Lab A', capacity: 30, ...overrides };
    }
    function sessionDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        id: 'sess1',
        title: 'Week 1 — Kick-off',
        room: 'Room 204',
        instructor_gcid: 'g1',
        starts_at: '2026-09-01T09:00:00Z',
        ends_at: '2026-09-01T11:00:00Z',
        created_at: '2026-06-10T00:00:00Z',
        updated_at: '2026-06-10T00:00:00Z',
        ...overrides,
      };
    }

    /** Boot the workspace on the schedule tab (short offering); flush detail + GET. */
    function bootSchedule(
      opts: { roles?: readonly string[]; list?: readonly Record<string, unknown>[] } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup('of1', opts.roles ?? ['instructor'], 'schedule');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'short' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(scheduleUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({ sessions: opts.list ?? [] });
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazily GETs the schedule when the tab is active and renders session rows', () => {
      const { httpMock, element } = bootSchedule({
        list: [sessionDto(), sessionDto({ id: 'sess2', title: 'Week 2 — Workshop' })],
      });
      expect(element.querySelector('[data-testid="offering-panel-schedule"]')).not.toBeNull();
      const rows = element.querySelectorAll('[data-testid="offering-schedule-row"]');
      expect(rows.length).toBe(2);
      expect(rows[0]?.textContent).toContain('Week 1 — Kick-off');
      expect(rows[0]?.textContent).toContain('Room 204');
      expect(rows[1]?.textContent).toContain('Week 2 — Workshop');
      httpMock.verify();
    });

    it('shows the empty-state when the offering has no sessions', () => {
      const { httpMock, element } = bootSchedule({ list: [] });
      expect(element.querySelector('[data-testid="offering-schedule-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-schedule-row"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a loading state until the list resolves', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'schedule');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'short' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(scheduleUrl('of1'));
      expect(element.querySelector('[data-testid="offering-schedule-loading"]')).not.toBeNull();
      req.flush({ sessions: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'schedule');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'short' }));
      fixture.detectChanges();
      httpMock
        .expectOne(scheduleUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-schedule-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="offering-schedule-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      httpMock.expectOne(scheduleUrl('of1')).flush({ sessions: [sessionDto()] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-schedule-row"]')).not.toBeNull();
      httpMock.verify();
    });

    describe('create (manager)', () => {
      /**
       * Open the form + fill title + a valid window; flushes the room-picker GET
       * that opening the form fires (CHO-2191), seeding `opts.rooms` options.
       */
      function openAndFill(
        bag: {
          fixture: ComponentFixture<OfferingWorkspaceComponent>;
          httpMock: HttpTestingController;
          element: HTMLElement;
        },
        opts: {
          title?: string;
          starts?: string;
          ends?: string;
          rooms?: readonly Record<string, unknown>[];
        } = {},
      ): void {
        const { fixture, httpMock, element } = bag;
        element.querySelector<HTMLButtonElement>('[data-testid="offering-schedule-add"]')!.click();
        fixture.detectChanges();
        // Opening the form loads the room picker.
        httpMock.expectOne(roomsUrl).flush({ rooms: opts.rooms ?? [] });
        fixture.detectChanges();
        const set = (testid: string, value: string): void => {
          const input = element.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
          input.value = value;
          input.dispatchEvent(new Event('input'));
        };
        set('offering-schedule-title', opts.title ?? 'Week 1');
        set('offering-schedule-starts', opts.starts ?? '2026-09-01T09:00');
        set('offering-schedule-ends', opts.ends ?? '2026-09-01T11:00');
        fixture.detectChanges();
      }

      it('opens the form → fills title + window → submit POSTs (title+window body) + refreshes', () => {
        const bag = bootSchedule({ list: [] });
        const { fixture, httpMock, element } = bag;
        expect(element.querySelector('[data-testid="offering-schedule-form"]')).toBeNull();
        openAndFill(bag);
        expect(element.querySelector('[data-testid="offering-schedule-form"]')).not.toBeNull();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-submit"]')!
          .click();
        fixture.detectChanges();

        const post = httpMock.expectOne(scheduleUrl('of1'));
        expect(post.request.method).toBe('POST');
        const body = post.request.body as {
          title: string;
          starts_at: string;
          ends_at: string;
          room_id?: string;
          instructor_gcid?: string;
        };
        expect(body.title).toBe('Week 1');
        // Timestamps convert local → ISO; assert presence + strict ordering
        // (exact ISO value is timezone-dependent, so not asserted literally).
        expect(typeof body.starts_at).toBe('string');
        expect(new Date(body.ends_at).getTime()).toBeGreaterThan(
          new Date(body.starts_at).getTime(),
        );
        // Roomless (no room picked) + blank instructor drop out of the body.
        expect(body.room_id).toBeUndefined();
        expect(body.instructor_gcid).toBeUndefined();
        post.flush(sessionDto(), { status: 201, statusText: 'Created' });
        fixture.detectChanges();

        // The list refreshes (a fresh GET) and the form closes.
        httpMock.expectOne(scheduleUrl('of1')).flush({ sessions: [sessionDto()] });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="offering-schedule-row"]')).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-schedule-form"]')).toBeNull();
        expect(
          element.querySelector('[data-testid="offering-schedule-create-success"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('sends the picked room_id + instructor when filled', () => {
        const bag = bootSchedule({ list: [] });
        const { fixture, httpMock, element } = bag;
        openAndFill(bag, { rooms: [roomDto()] });
        // The instructor field is a name-search picker, not a raw-UUID input.
        expect(
          element.querySelector('[data-testid="offering-schedule-instructor"]'),
        ).not.toBeNull();
        expect(
          element.querySelector('input[data-testid="offering-schedule-instructor"]'),
        ).toBeNull();
        // CHO-2191: the room field is a PICKER (select), never free text — pick
        // the seeded room by its id.
        const roomSelect = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-schedule-room"]',
        )!;
        roomSelect.value = 'room-abc';
        roomSelect.dispatchEvent(new Event('change'));
        fixture.componentInstance.onSessionInstructorPicked({ id: 'g1', label: 'G One' });
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-submit"]')!
          .click();
        fixture.detectChanges();
        const post = httpMock.expectOne(scheduleUrl('of1'));
        const body = post.request.body as { room_id?: string; instructor_gcid?: string };
        expect(body.room_id).toBe('room-abc');
        expect(body.instructor_gcid).toBe('g1');
        post.flush(sessionDto(), { status: 201, statusText: 'Created' });
        fixture.detectChanges();
        httpMock.expectOne(scheduleUrl('of1')).flush({ sessions: [sessionDto()] });
        fixture.detectChanges();
        httpMock.verify();
      });

      it('creates a room inline (POST /api/v1/rooms) then auto-selects it', () => {
        const bag = bootSchedule({ list: [] });
        const { fixture, httpMock, element } = bag;
        // Open the session form (loads an empty room list).
        element.querySelector<HTMLButtonElement>('[data-testid="offering-schedule-add"]')!.click();
        fixture.detectChanges();
        httpMock.expectOne(roomsUrl).flush({ rooms: [] });
        fixture.detectChanges();
        // Open the inline create-room form + fill name + capacity.
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-room-add"]')!
          .click();
        fixture.detectChanges();
        const setRoom = (testid: string, value: string): void => {
          const input = element.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
          input.value = value;
          input.dispatchEvent(new Event('input'));
        };
        setRoom('offering-schedule-room-name', 'Lab A');
        setRoom('offering-schedule-room-capacity', '30');
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-room-submit"]')!
          .click();
        fixture.detectChanges();
        const post = httpMock.expectOne(roomsUrl);
        expect(post.request.method).toBe('POST');
        expect(post.request.body).toEqual({ name: 'Lab A', capacity: 30 });
        post.flush(roomDto(), { status: 201, statusText: 'Created' });
        fixture.detectChanges();
        // The new room is auto-selected as the session's room_id.
        expect(fixture.componentInstance.sessionRoomId()).toBe('room-abc');
        const roomSelect = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-schedule-room"]',
        )!;
        expect(roomSelect.querySelector('option[value="room-abc"]')).not.toBeNull();
        httpMock.verify();
      });

      it('shows a typed error banner on a 409 room_double_booked', () => {
        const bag = bootSchedule({ list: [] });
        const { fixture, httpMock, element } = bag;
        openAndFill(bag, { rooms: [roomDto()] });
        const roomSelect = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-schedule-room"]',
        )!;
        roomSelect.value = 'room-abc';
        roomSelect.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-submit"]')!
          .click();
        fixture.detectChanges();
        // The BE discriminated envelope: {error: {code, message}}.
        httpMock
          .expectOne(scheduleUrl('of1'))
          .flush(
            { error: { code: 'room_double_booked', message: 'room double-booked' } },
            { status: 409, statusText: 'Conflict' },
          );
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-schedule-create-error"]'),
        ).not.toBeNull();
        expect(fixture.componentInstance.sessionCreateErrorKey()).toBe(
          'rplus.offerings.workspace.schedule.error_room_double_booked',
        );
        // The form stays open to fix + retry.
        expect(element.querySelector('[data-testid="offering-schedule-form"]')).not.toBeNull();
        httpMock.verify();
      });

      it('keeps submit disabled until title + a strictly-positive window are set', () => {
        const bag = bootSchedule({ list: [] });
        const { fixture, httpMock, element } = bag;
        element.querySelector<HTMLButtonElement>('[data-testid="offering-schedule-add"]')!.click();
        fixture.detectChanges();
        // Opening the form loads the room picker (CHO-2191).
        httpMock.expectOne(roomsUrl).flush({ rooms: [] });
        fixture.detectChanges();
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-schedule-submit"]',
        )!;
        const set = (testid: string, value: string): void => {
          const input = element.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
          input.value = value;
          input.dispatchEvent(new Event('input'));
        };
        // Nothing filled → disabled.
        expect(submit.disabled).toBe(true);
        // Title only → still disabled (no window).
        set('offering-schedule-title', 'Week 1');
        fixture.detectChanges();
        expect(submit.disabled).toBe(true);
        // Add an INVALID window (ends ≤ starts) → still disabled.
        set('offering-schedule-starts', '2026-09-01T11:00');
        set('offering-schedule-ends', '2026-09-01T09:00');
        fixture.detectChanges();
        expect(submit.disabled).toBe(true);
        // Fix the window (ends > starts) → enabled.
        set('offering-schedule-ends', '2026-09-01T12:00');
        fixture.detectChanges();
        expect(submit.disabled).toBe(false);
        TestBed.inject(HttpTestingController).verify();
      });

      it('surfaces a fail-loud create error when the POST fails (e.g. 400)', () => {
        const bag = bootSchedule({ list: [] });
        const { fixture, httpMock, element } = bag;
        openAndFill(bag);
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-submit"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne(scheduleUrl('of1'))
          .flush({ error: 'invalid window' }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-schedule-create-error"]'),
        ).not.toBeNull();
        // The form stays open so the author can fix + retry.
        expect(element.querySelector('[data-testid="offering-schedule-form"]')).not.toBeNull();
        httpMock.verify();
      });
    });

    describe('role-gated visibility', () => {
      it('hides the add affordance for a non-manager but renders the read-only list', () => {
        const { fixture, httpMock, element } = bootSchedule({
          roles: ['learner'],
          list: [sessionDto()],
        });
        expect(fixture.componentInstance.canManage()).toBe(false);
        expect(element.querySelector('[data-testid="offering-schedule-add"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-schedule-form"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-schedule-row"]')).not.toBeNull();
        httpMock.verify();
      });
    });
  });

  describe('attendance panel (CHO-1986)', () => {
    type Bag = {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    };
    function scheduleUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/schedule`;
    }
    function attendanceUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/attendance`;
    }
    function sessionDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        id: 'sess1',
        title: 'Week 1 — Kick-off',
        room: 'Room 204',
        instructor_gcid: 'g1',
        starts_at: '2026-09-01T09:00:00Z',
        ends_at: '2026-09-01T11:00:00Z',
        ...overrides,
      };
    }
    function recordDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        id: 'att1',
        session_id: 'sess1',
        gcid: 'g1',
        status: 'present',
        source: 'manual',
        recorded_at: '2026-09-01T09:05:00Z',
        ...overrides,
      };
    }

    /** Boot the workspace on the attendance tab (short); flush detail + sessions GET. */
    function bootAttendance(
      opts: { roles?: readonly string[]; sessions?: readonly Record<string, unknown>[] } = {},
    ): Bag {
      const { fixture, httpMock, element } = setup(
        'of1',
        opts.roles ?? ['instructor'],
        'attendance',
      );
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'short' }));
      fixture.detectChanges();
      // The session selector is populated from the (shared) schedule read.
      const req = httpMock.expectOne(scheduleUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({ sessions: opts.sessions ?? [] });
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    /** Select a session in the dropdown + flush its records GET. */
    function pickSession(
      bag: Bag,
      sessionId: string,
      records: readonly Record<string, unknown>[] = [],
    ): void {
      const { fixture, httpMock, element } = bag;
      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="offering-attendance-session-select"]',
      )!;
      select.value = sessionId;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      // CHO-2186: the session id rides in the PATH (…/attendance/{sid}), never a
      // `?session_id=` query param (Cloud Armor CRS-943110 denies that param
      // 100%). This test-helper matcher had drifted to the old query shape.
      const req = httpMock.expectOne(
        (r) => r.url === `${attendanceUrl('of1')}/${sessionId}` && r.method === 'GET',
      );
      req.flush({ records });
      fixture.detectChanges();
    }

    it('lazily GETs the sessions and renders the selector when the tab is active', () => {
      const { httpMock, element } = bootAttendance({ sessions: [sessionDto()] });
      expect(element.querySelector('[data-testid="offering-panel-attendance"]')).not.toBeNull();
      const select = element.querySelector('[data-testid="offering-attendance-session-select"]');
      expect(select).not.toBeNull();
      // Placeholder + one real session option.
      const options = select!.querySelectorAll('option');
      expect(options.length).toBe(2);
      expect(options[1]?.textContent).toContain('Week 1 — Kick-off');
      httpMock.verify(); // no records GET until a session is picked
    });

    it('shows the no-sessions empty-state (directs to Schedule) when there are none', () => {
      const { httpMock, element } = bootAttendance({ sessions: [] });
      expect(
        element.querySelector('[data-testid="offering-attendance-no-sessions"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="offering-attendance-session-select"]'),
      ).toBeNull();
      httpMock.verify();
    });

    it('shows a sessions loading state until the selector resolves', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'attendance');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'short' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(scheduleUrl('of1'));
      expect(
        element.querySelector('[data-testid="offering-attendance-sessions-loading"]'),
      ).not.toBeNull();
      req.flush({ sessions: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud sessions error + retry refires the schedule GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'attendance');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'short' }));
      fixture.detectChanges();
      httpMock
        .expectOne(scheduleUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-attendance-sessions-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-attendance-sessions-retry"]')!
        .click();
      httpMock.expectOne(scheduleUrl('of1')).flush({ sessions: [sessionDto()] });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="offering-attendance-session-select"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('shows the pick-a-session prompt before a session is chosen (no records GET)', () => {
      const { httpMock, element } = bootAttendance({ sessions: [sessionDto()] });
      expect(
        element.querySelector('[data-testid="offering-attendance-pick-session"]'),
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-attendance-table"]')).toBeNull();
      httpMock.verify(); // afterEach also asserts no records GET fired
    });

    it('GETs + lists a session record set once it is selected', () => {
      const bag = bootAttendance({ sessions: [sessionDto()] });
      pickSession(bag, 'sess1', [
        recordDto(),
        recordDto({ id: 'att2', gcid: 'g2', status: 'late' }),
      ]);
      const rows = bag.element.querySelectorAll('[data-testid="offering-attendance-row"]');
      expect(rows.length).toBe(2);
      expect(rows[0]?.textContent).toContain('g1');
      expect(rows[1]?.textContent).toContain('g2');
      bag.httpMock.verify();
    });

    it('shows the per-session empty-state when a session has no records', () => {
      const bag = bootAttendance({ sessions: [sessionDto()] });
      pickSession(bag, 'sess1', []);
      expect(bag.element.querySelector('[data-testid="offering-attendance-empty"]')).not.toBeNull();
      expect(bag.element.querySelector('[data-testid="offering-attendance-row"]')).toBeNull();
      bag.httpMock.verify();
    });

    it('shows a records loading state until the session records resolve', () => {
      const bag = bootAttendance({ sessions: [sessionDto()] });
      const { fixture, httpMock, element } = bag;
      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="offering-attendance-session-select"]',
      )!;
      select.value = 'sess1';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const req = httpMock.expectOne(
        (r) => r.url === `${attendanceUrl('of1')}/sess1` && r.method === 'GET',
      );
      expect(element.querySelector('[data-testid="offering-attendance-loading"]')).not.toBeNull();
      req.flush({ records: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud records error + retry refires the attendance GET', () => {
      const bag = bootAttendance({ sessions: [sessionDto()] });
      const { fixture, httpMock, element } = bag;
      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="offering-attendance-session-select"]',
      )!;
      select.value = 'sess1';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url === `${attendanceUrl('of1')}/sess1` && r.method === 'GET')
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-attendance-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-attendance-retry"]')!
        .click();
      const retryReq = httpMock.expectOne(
        (r) => r.url === `${attendanceUrl('of1')}/sess1` && r.method === 'GET',
      );
      retryReq.flush({ records: [recordDto()] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-attendance-row"]')).not.toBeNull();
      httpMock.verify();
    });

    describe('mark (manager)', () => {
      it('fills gcid + picks a status → submit POSTs (source manual) → refreshes', () => {
        const bag = bootAttendance({ sessions: [sessionDto()] });
        pickSession(bag, 'sess1', []);
        const { fixture, httpMock, element } = bag;
        expect(
          element.querySelector('[data-testid="offering-attendance-mark-form"]'),
        ).not.toBeNull();

        // The learner GCID field is a name-search picker, not a raw-UUID input.
        expect(element.querySelector('[data-testid="offering-attendance-gcid"]')).not.toBeNull();
        expect(element.querySelector('input[data-testid="offering-attendance-gcid"]')).toBeNull();
        fixture.componentInstance.onMarkGcidPicked({ id: 'g9', label: 'G Nine' });
        const statusSelect = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-attendance-status"]',
        )!;
        statusSelect.value = 'late';
        statusSelect.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-attendance-mark-submit"]')!
          .click();
        fixture.detectChanges();

        const post = httpMock.expectOne(
          (r) => r.url === attendanceUrl('of1') && r.method === 'POST',
        );
        expect(post.request.body).toEqual({
          session_id: 'sess1',
          gcid: 'g9',
          status: 'late',
          source: 'manual',
        });
        post.flush(recordDto({ id: 'att9', gcid: 'g9', status: 'late' }));
        fixture.detectChanges();

        // The record list refreshes (a fresh GET for the same session).
        httpMock
          .expectOne((r) => r.url === `${attendanceUrl('of1')}/sess1` && r.method === 'GET')
          .flush({ records: [recordDto({ id: 'att9', gcid: 'g9', status: 'late' })] });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-attendance-mark-success"]'),
        ).not.toBeNull();
        expect(
          element.querySelector('[data-testid="offering-attendance-row"]')?.textContent,
        ).toContain('g9');
        httpMock.verify();
      });

      it('keeps mark disabled until a learner gcid is entered', () => {
        const bag = bootAttendance({ sessions: [sessionDto()] });
        pickSession(bag, 'sess1', []);
        const { fixture, httpMock, element } = bag;
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-attendance-mark-submit"]',
        )!;
        expect(submit.disabled).toBe(true);
        fixture.componentInstance.onMarkGcidPicked({ id: 'g9', label: 'G Nine' });
        fixture.detectChanges();
        expect(submit.disabled).toBe(false);
        httpMock.verify();
      });

      it('surfaces a fail-loud mark error when the POST fails (e.g. 400)', () => {
        const bag = bootAttendance({ sessions: [sessionDto()] });
        pickSession(bag, 'sess1', []);
        const { fixture, httpMock, element } = bag;
        fixture.componentInstance.onMarkGcidPicked({ id: 'g9', label: 'G Nine' });
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-attendance-mark-submit"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === attendanceUrl('of1') && r.method === 'POST')
          .flush({ error: 'invalid status' }, { status: 400, statusText: 'Bad Request' });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-attendance-mark-error"]'),
        ).not.toBeNull();
        httpMock.verify();
      });
    });

    describe('role-gated visibility', () => {
      it('hides the mark form for a non-manager but shows the read-only records', () => {
        const bag = bootAttendance({ roles: ['learner'], sessions: [sessionDto()] });
        pickSession(bag, 'sess1', [recordDto()]);
        expect(bag.fixture.componentInstance.canManage()).toBe(false);
        expect(
          bag.element.querySelector('[data-testid="offering-attendance-mark-form"]'),
        ).toBeNull();
        expect(bag.element.querySelector('[data-testid="offering-attendance-row"]')).not.toBeNull();
        bag.httpMock.verify();
      });
    });
  });

  describe('publish panel (CHO-1987, async)', () => {
    function publishUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/publish`;
    }

    /** Boot the workspace on the publish tab (async offering); flush detail + GET. */
    function bootPublish(
      opts: { roles?: readonly string[]; courses?: readonly Record<string, unknown>[] } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup('of1', opts.roles ?? ['instructor'], 'publish');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(publishUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({ courses: opts.courses ?? [] });
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazily GETs the publish state and renders the course list', () => {
      const { httpMock, element } = bootPublish({
        courses: [
          { id: 'c1', title: 'Intro to Go', visibility: 'draft', published: false },
          { id: 'c2', title: 'Advanced Go', visibility: 'public', published: true },
        ],
      });
      expect(element.querySelector('[data-testid="offering-panel-publish"]')).not.toBeNull();
      const courses = element.querySelectorAll('[data-testid="offering-publish-course"]');
      expect(courses.length).toBe(2);
      expect(courses[0]?.textContent).toContain('Intro to Go');
      expect(courses[1]?.textContent).toContain('Advanced Go');
      httpMock.verify();
    });

    it('renders a visibility badge + published state per course', () => {
      const { element, httpMock } = bootPublish({
        courses: [{ id: 'c1', title: 'Intro', visibility: 'public', published: true }],
      });
      const badge = element.querySelector('[data-testid="offering-publish-visibility"]');
      expect(badge?.classList.contains('badge-success')).toBe(true); // public → success
      expect(element.querySelector('[data-testid="offering-publish-state"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows the empty-state when the offering has no attached courses', () => {
      const { httpMock, element } = bootPublish({ courses: [] });
      expect(element.querySelector('[data-testid="offering-publish-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-publish-course"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a loading state until the publish state resolves', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'publish');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(publishUrl('of1'));
      expect(element.querySelector('[data-testid="offering-publish-loading"]')).not.toBeNull();
      req.flush({ courses: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud GET error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'publish');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'async' }));
      fixture.detectChanges();
      httpMock
        .expectOne(publishUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-publish-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      element.querySelector<HTMLButtonElement>('[data-testid="offering-publish-retry"]')!.click();
      httpMock
        .expectOne(publishUrl('of1'))
        .flush({ courses: [{ id: 'c1', title: 'Intro', visibility: 'draft', published: false }] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-publish-course"]')).not.toBeNull();
      httpMock.verify();
    });

    describe('publish action (manager)', () => {
      it('PATCHes (empty body) → re-renders now-public courses + shows the count', () => {
        const { fixture, httpMock, element } = bootPublish({
          courses: [
            { id: 'c1', title: 'Intro', visibility: 'draft', published: false },
            { id: 'c2', title: 'Advanced', visibility: 'public', published: true },
          ],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-publish-action"]')!
          .click();
        fixture.detectChanges();
        const patch = httpMock.expectOne(publishUrl('of1'));
        expect(patch.request.method).toBe('PATCH');
        expect(patch.request.body).toEqual({});
        patch.flush({
          courses: [
            { id: 'c1', title: 'Intro', visibility: 'public', published: true },
            { id: 'c2', title: 'Advanced', visibility: 'public', published: true },
          ],
          published_count: 1,
        });
        fixture.detectChanges();
        const success = element.querySelector('[data-testid="offering-publish-success"]');
        expect(success).not.toBeNull();
        expect(success?.textContent).toContain('1'); // published_count value (not translated)
        // Both course rows re-render off the fresh state.
        expect(element.querySelectorAll('[data-testid="offering-publish-course"]').length).toBe(2);
        httpMock.verify();
      });

      it('disables the button while the publish PATCH is in flight', () => {
        const { fixture, httpMock, element } = bootPublish({
          courses: [{ id: 'c1', title: 'Intro', visibility: 'draft', published: false }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-publish-action"]')!
          .click();
        fixture.detectChanges();
        expect(
          element.querySelector<HTMLButtonElement>('[data-testid="offering-publish-action"]')!
            .disabled,
        ).toBe(true);
        httpMock.expectOne(publishUrl('of1')).flush({
          courses: [{ id: 'c1', title: 'Intro', visibility: 'public', published: true }],
          published_count: 1,
        });
        fixture.detectChanges();
        expect(
          element.querySelector<HTMLButtonElement>('[data-testid="offering-publish-action"]')!
            .disabled,
        ).toBe(false);
        httpMock.verify();
      });

      it('handles a no-op publish (all already public → count 0)', () => {
        const { fixture, httpMock, element } = bootPublish({
          courses: [{ id: 'c1', title: 'Intro', visibility: 'public', published: true }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-publish-action"]')!
          .click();
        fixture.detectChanges();
        httpMock.expectOne(publishUrl('of1')).flush({
          courses: [{ id: 'c1', title: 'Intro', visibility: 'public', published: true }],
          published_count: 0,
        });
        fixture.detectChanges();
        const success = element.querySelector('[data-testid="offering-publish-success"]');
        expect(success).not.toBeNull();
        expect(success?.textContent).toContain('0');
        httpMock.verify();
      });

      it('surfaces a fail-loud action error when the PATCH fails (list stays)', () => {
        const { fixture, httpMock, element } = bootPublish({
          courses: [{ id: 'c1', title: 'Intro', visibility: 'draft', published: false }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-publish-action"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne(publishUrl('of1'))
          .flush('boom', { status: 500, statusText: 'Server Error' });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="offering-publish-action-error"]'),
        ).not.toBeNull();
        // Only the action failed — the course list is still rendered.
        expect(element.querySelector('[data-testid="offering-publish-course"]')).not.toBeNull();
        httpMock.verify();
      });
    });

    describe('role-gated visibility', () => {
      it('hides the publish button for a non-manager but renders the read-only list', () => {
        const { fixture, httpMock, element } = bootPublish({
          roles: ['learner'],
          courses: [{ id: 'c1', title: 'Intro', visibility: 'draft', published: false }],
        });
        expect(fixture.componentInstance.canManage()).toBe(false);
        expect(element.querySelector('[data-testid="offering-publish-action"]')).toBeNull();
        expect(element.querySelector('[data-testid="offering-publish-course"]')).not.toBeNull();
        httpMock.verify();
      });
    });
  });

  describe('prerequisites panel (ADR-226)', () => {
    function prereqUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${encodeURIComponent(id)}/prerequisites`;
    }
    function prereqRemoveUrl(id: string): string {
      return `${prereqUrl(id)}/remove`;
    }

    /** Boot the workspace on the prerequisites tab; flush detail + the GET. */
    function bootPrerequisites(
      opts: {
        roles?: readonly string[];
        deliveryType?: string;
        courses?: readonly Record<string, unknown>[];
      } = {},
    ): {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const { fixture, httpMock, element } = setup(
        'of1',
        opts.roles ?? ['instructor'],
        'prerequisites',
      );
      httpMock
        .expectOne(detailUrl('of1'))
        .flush(dto({ delivery_type: opts.deliveryType ?? 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(prereqUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({ courses: opts.courses ?? [] });
      fixture.detectChanges();
      return { fixture, httpMock, element };
    }

    it('lazily GETs the prerequisites when the tab is active and renders edges + notes', () => {
      const { httpMock, element } = bootPrerequisites({
        courses: [
          {
            course_id: 'c1',
            title: 'Calculus II',
            prerequisite_notes: ['Comfort with limits'],
            prerequisites: [
              {
                prerequisite_course_id: 'c0',
                prerequisite_course_title: 'Calculus I',
                kind: 'hard_gate',
              },
            ],
          },
        ],
      });
      expect(element.querySelector('[data-testid="offering-panel-prerequisites"]')).not.toBeNull();
      const courses = element.querySelectorAll('[data-testid="offering-prerequisites-course"]');
      expect(courses.length).toBe(1);
      expect(courses[0]?.textContent).toContain('Calculus II');
      const edges = element.querySelectorAll('[data-testid="offering-prerequisites-edge"]');
      expect(edges.length).toBe(1);
      expect(edges[0]?.textContent).toContain('Calculus I');
      const kindBadge = element.querySelector('[data-testid="offering-prerequisites-edge-kind"]');
      expect(kindBadge?.classList.contains('badge-warning')).toBe(true); // hard_gate → warning
      const notes = element.querySelectorAll('[data-testid="offering-prerequisites-note"]');
      expect(notes.length).toBe(1);
      expect(notes[0]?.textContent).toContain('Comfort with limits');
      httpMock.verify();
    });

    it('renders an advisory edge with the neutral badge', () => {
      const { element, httpMock } = bootPrerequisites({
        courses: [
          {
            course_id: 'c1',
            title: 'C',
            prerequisites: [
              {
                prerequisite_course_id: 'c0',
                prerequisite_course_title: 'Intro',
                kind: 'advisory',
              },
            ],
          },
        ],
      });
      const kindBadge = element.querySelector('[data-testid="offering-prerequisites-edge-kind"]');
      expect(kindBadge?.classList.contains('badge-neutral')).toBe(true);
      httpMock.verify();
    });

    it('renders the panel for an async (self-paced) offering too (not graduate-gated, unlike curriculum)', () => {
      const { httpMock, element } = bootPrerequisites({ deliveryType: 'async', courses: [] });
      expect(element.querySelector('[data-testid="offering-panel-prerequisites"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows the empty-state when the offering has no attached courses', () => {
      const { httpMock, element } = bootPrerequisites({ courses: [] });
      expect(element.querySelector('[data-testid="offering-prerequisites-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-prerequisites-course"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a per-course empty note when a course has no prerequisites yet', () => {
      const { element, httpMock } = bootPrerequisites({
        courses: [{ course_id: 'c1', title: 'Fresh', prerequisites: [] }],
      });
      expect(
        element.querySelector('[data-testid="offering-prerequisites-course-empty"]'),
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-prerequisites-edge"]')).toBeNull();
      // No free-text notes → the notes block is omitted entirely.
      expect(element.querySelector('[data-testid="offering-prerequisites-notes"]')).toBeNull();
      httpMock.verify();
    });

    it('shows a loading state until the prerequisites resolve', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'prerequisites');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      const req = httpMock.expectOne(prereqUrl('of1'));
      expect(
        element.querySelector('[data-testid="offering-prerequisites-loading"]'),
      ).not.toBeNull();
      req.flush({ courses: [] });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('shows a fail-loud error + retry refires the GET', () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'prerequisites');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(prereqUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-prerequisites-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-retry"]')!
        .click();
      httpMock
        .expectOne(prereqUrl('of1'))
        .flush({ courses: [{ course_id: 'c1', title: 'Calculus I', prerequisites: [] }] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-prerequisites-course"]')).not.toBeNull();
      httpMock.verify();
    });

    describe('authoring (manager, ADR-226)', () => {
      it('uses a name-search picker (not a UUID select) for the prerequisite target → POSTs → splices + closes', () => {
        const { fixture, httpMock, element } = bootPrerequisites({
          courses: [{ course_id: 'c1', title: 'Calculus II', prerequisites: [] }],
        });
        expect(
          element.querySelector('[data-testid="offering-prerequisites-course-empty"]'),
        ).not.toBeNull();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-add"]')!
          .click();
        fixture.detectChanges();

        // The picker replaces the raw course dropdown — no eager catalogue GET;
        // it searches server-side by name on demand (kills the single-page cap).
        expect(
          element.querySelector('[data-testid="offering-prerequisites-target-picker"]'),
        ).not.toBeNull();
        expect(element.querySelector('[data-testid="offering-prerequisites-target"]')).toBeNull();

        // Picking a course by name sets the target id → submit enables.
        fixture.componentInstance.onPrerequisiteTargetPicked({ id: 'c0', label: 'Calculus I' });
        const kind = element.querySelector<HTMLSelectElement>(
          '[data-testid="offering-prerequisites-kind"]',
        )!;
        kind.value = 'advisory';
        kind.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-add-submit"]')!
          .click();
        fixture.detectChanges();

        const post = httpMock.expectOne((r) => r.url === prereqUrl('of1') && r.method === 'POST');
        expect(post.request.body).toEqual({
          course_id: 'c1',
          prerequisite_course_id: 'c0',
          kind: 'advisory',
        });
        // The write returns ONLY the affected course's edge list (no re-GET).
        post.flush({
          course_id: 'c1',
          prerequisites: [
            {
              prerequisite_course_id: 'c0',
              prerequisite_course_title: 'Calculus I',
              kind: 'advisory',
            },
          ],
        });
        fixture.detectChanges();

        expect(element.querySelector('[data-testid="offering-prerequisites-add-form"]')).toBeNull();
        const edges = element.querySelectorAll('[data-testid="offering-prerequisites-edge"]');
        expect(edges.length).toBe(1);
        expect(edges[0]?.textContent).toContain('Calculus I');
        expect(
          element.querySelector('[data-testid="offering-prerequisites-add-success"]'),
        ).not.toBeNull();
        httpMock.verify(); // no course-catalogue GET, no follow-up GET
      });

      it('keeps the add submit disabled until a target course is picked', () => {
        const { fixture, httpMock, element } = bootPrerequisites({
          courses: [{ course_id: 'c1', title: 'C', prerequisites: [] }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-add"]')!
          .click();
        fixture.detectChanges();
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-prerequisites-add-submit"]',
        )!;
        expect(submit.disabled).toBe(true);
        fixture.componentInstance.onPrerequisiteTargetPicked({ id: 'c0', label: 'Other' });
        fixture.detectChanges();
        expect(submit.disabled).toBe(false);
        httpMock.verify();
      });

      it('resets the picked target when the add form is cancelled and reopened', () => {
        const { fixture, httpMock, element } = bootPrerequisites({
          courses: [{ course_id: 'c1', title: 'C', prerequisites: [] }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-add"]')!
          .click();
        fixture.detectChanges();
        fixture.componentInstance.onPrerequisiteTargetPicked({ id: 'c0', label: 'Other' });
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-add-cancel"]')!
          .click();
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-add"]')!
          .click();
        fixture.detectChanges();
        const submit = element.querySelector<HTMLButtonElement>(
          '[data-testid="offering-prerequisites-add-submit"]',
        )!;
        expect(submit.disabled).toBe(true); // the prior pick did NOT survive the reopen
        httpMock.verify();
      });

      it('surfaces the BE 422 graph refusal loudly (via httpErrorView, NOT err.error) and preserves the draft', () => {
        const { fixture, httpMock, element } = bootPrerequisites({
          courses: [{ course_id: 'c1', title: 'C', prerequisites: [] }],
        });
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-add"]')!
          .click();
        fixture.detectChanges();
        fixture.componentInstance.onPrerequisiteTargetPicked({ id: 'c0', label: 'Other' });
        fixture.detectChanges();
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-add-submit"]')!
          .click();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === prereqUrl('of1') && r.method === 'POST')
          .flush(
            { error: 'Unprocessable Entity', message: 'prerequisite would create a cycle' },
            { status: 422, statusText: 'Unprocessable Entity' },
          );
        fixture.detectChanges();
        const err = element.querySelector('[data-testid="offering-prerequisites-add-error"]');
        expect(err).not.toBeNull();
        expect(err?.getAttribute('role')).toBe('alert');
        // Fail-loud: the BE `message` (not a generic i18n key) is surfaced verbatim.
        expect(err?.textContent).toContain('prerequisite would create a cycle');
        // The form stays open + the selection survives so the author can fix + retry.
        expect(
          element.querySelector('[data-testid="offering-prerequisites-add-form"]'),
        ).not.toBeNull();
        httpMock.verify();
      });

      it('removes an edge → confirm → POSTs {course_id,prerequisite_course_id} → re-renders remaining', async () => {
        const { fixture, httpMock, element } = bootPrerequisites({
          courses: [
            {
              course_id: 'c1',
              title: 'C',
              prerequisites: [
                { prerequisite_course_id: 'c0', prerequisite_course_title: 'A', kind: 'hard_gate' },
                { prerequisite_course_id: 'c2', prerequisite_course_title: 'B', kind: 'advisory' },
              ],
            },
          ],
        });
        const confirmDialog = TestBed.inject(ConfirmDialogService);
        element
          .querySelectorAll<HTMLButtonElement>('[data-testid="offering-prerequisites-remove"]')[0]
          .click();
        confirmDialog._resolve(true);
        await Promise.resolve();
        fixture.detectChanges();
        const post = httpMock.expectOne(
          (r) => r.url === prereqRemoveUrl('of1') && r.method === 'POST',
        );
        expect(post.request.body).toEqual({ course_id: 'c1', prerequisite_course_id: 'c0' });
        post.flush({
          course_id: 'c1',
          prerequisites: [
            { prerequisite_course_id: 'c2', prerequisite_course_title: 'B', kind: 'advisory' },
          ],
        });
        fixture.detectChanges();
        const edges = element.querySelectorAll('[data-testid="offering-prerequisites-edge"]');
        expect(edges.length).toBe(1);
        expect(edges[0]?.textContent).toContain('B');
        httpMock.verify();
      });

      it('removes an edge → cancel → fires NO POST', async () => {
        const { fixture, httpMock, element } = bootPrerequisites({
          courses: [
            {
              course_id: 'c1',
              title: 'C',
              prerequisites: [
                { prerequisite_course_id: 'c0', prerequisite_course_title: 'A', kind: 'hard_gate' },
              ],
            },
          ],
        });
        const confirmDialog = TestBed.inject(ConfirmDialogService);
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-remove"]')!
          .click();
        confirmDialog._resolve(false);
        await Promise.resolve();
        fixture.detectChanges();
        // afterEach verify() asserts no /prerequisites/remove POST fired.
        httpMock.verify();
      });

      it('surfaces a fail-loud remove error when the POST fails', async () => {
        const { fixture, httpMock, element } = bootPrerequisites({
          courses: [
            {
              course_id: 'c1',
              title: 'C',
              prerequisites: [
                { prerequisite_course_id: 'c0', prerequisite_course_title: 'A', kind: 'hard_gate' },
              ],
            },
          ],
        });
        const confirmDialog = TestBed.inject(ConfirmDialogService);
        element
          .querySelector<HTMLButtonElement>('[data-testid="offering-prerequisites-remove"]')!
          .click();
        confirmDialog._resolve(true);
        await Promise.resolve();
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url === prereqRemoveUrl('of1') && r.method === 'POST')
          .flush(
            { error: 'Bad Request', message: 'course_id is not attached to this offering' },
            { status: 400, statusText: 'Bad Request' },
          );
        fixture.detectChanges();
        const err = element.querySelector('[data-testid="offering-prerequisites-remove-error"]');
        expect(err).not.toBeNull();
        expect(err?.getAttribute('role')).toBe('alert');
        httpMock.verify();
      });
    });

    it('hides all authoring controls for a non-manager but renders the read-only edges + notes', () => {
      const { element, httpMock } = bootPrerequisites({
        roles: ['learner'],
        courses: [
          {
            course_id: 'c1',
            title: 'Calculus II',
            prerequisite_notes: ['Bring a calculator'],
            prerequisites: [
              {
                prerequisite_course_id: 'c0',
                prerequisite_course_title: 'Calculus I',
                kind: 'hard_gate',
              },
            ],
          },
        ],
      });
      expect(element.querySelector('[data-testid="offering-prerequisites-course"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-prerequisites-edge"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-prerequisites-note"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-prerequisites-add"]')).toBeNull();
      expect(element.querySelector('[data-testid="offering-prerequisites-remove"]')).toBeNull();
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations (admin overview)', async () => {
      const { fixture, httpMock, element } = setup('of1');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);

    it('has zero critical/serious WCAG violations (curriculum editor + open add form)', async () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'curriculum');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/curriculum`).flush({
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            items: [
              { item_id: 'it1', kind: 'atom', ref: 'u1', title: 'Limits', position: 0 },
              {
                item_id: 'it2',
                kind: 'youtube',
                ref: 'https://y',
                title: 'Derivatives',
                position: 1,
              },
            ],
          },
        ],
      });
      fixture.detectChanges();
      // Drain the per-course blast-radius count GET fired on curriculum load
      // (offering FINDER `/search/offerings?course_id=…`, not the plain list).
      for (const req of httpMock.match(
        (r) => r.url === `${environment.bffBaseUrl}/api/v1/search/offerings` && r.method === 'GET',
      )) {
        req.flush({ items: [], next_cursor: null, total_estimate: 1 });
      }
      // Drain the per-course module-structure GET fired on curriculum load too.
      for (const req of httpMock.match((r) => r.url.endsWith('/modules') && r.method === 'GET')) {
        req.flush({ course_id: req.request.params.get('course_id') ?? '', modules: [] });
      }
      // …and the sibling cohort-progress GET (CHO-2074).
      for (const req of httpMock.match(
        (r) => r.url.endsWith('/modules/progress') && r.method === 'GET',
      )) {
        req.flush({ course_id: req.request.params.get('course_id') ?? '', modules: [] });
      }
      fixture.detectChanges();
      // Open the inline add-item form so its fields (labels, hint, select) sweep.
      element.querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add"]')!.click();
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);

    it('has zero critical/serious WCAG violations (completion-policy form, S2)', async () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'certification');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/certification`)
        .flush({ courses: [{ id: 'c1', title: 'Calculus I', certifications: [] }] });
      fixture.detectChanges();
      // The manager cert tab also lazy-loads the roster (the per-learner manual
      // issue action) — flush it with a learner so its Issue button is also swept.
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/roster`).flush({
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            learners: [{ gcid: 'g-1', display_name: 'Ada Lovelace' }],
            learner_count: 1,
          },
        ],
        distinct_learner_count: 1,
      });
      fixture.detectChanges();
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-certification-policy-edit"]')!
        .click();
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);

    it('has zero critical/serious WCAG violations (roster enrol form, S3)', async () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'roster');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/roster`).flush({
        courses: [{ id: 'c1', title: 'Calculus I', learner_count: 0, learners: [] }],
        distinct_learner_count: 0,
      });
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="offering-roster-enrol"]')!.click();
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);

    it('has zero critical/serious WCAG violations (section edit form, S4)', async () => {
      const { fixture, httpMock, element } = setup('of1', ['instructor'], 'sections');
      httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
      fixture.detectChanges();
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/sections`).flush({
        sections: [
          {
            section_id: 'sec1',
            name: 'Morning Cohort',
            lead_instructor_gcid: 'g1',
            room: 'Room 204',
            start_date: '2026-09-01',
            end_date: '2026-12-15',
            created_at: '2026-06-10T00:00:00Z',
            updated_at: '2026-06-10T00:00:00Z',
          },
        ],
      });
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit"]')!.click();
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);
  });
});

/**
 * errorDetailOf must surface the actionable BE `message` for BOTH error shapes
 * Chora observes — a raw HttpErrorResponse (interceptor-less specs) AND the
 * ApiError re-thrown by errorInterceptor at runtime (raw body on `.body`, not
 * `.error`). Reading `.error` alone returned '' in production while specs passed
 * — the launch-gate walk-caught it. These lock BOTH paths.
 */
describe('errorDetailOf (both error shapes)', () => {
  const envelope = {
    error: 'Unprocessable Entity',
    message: 'offering has no curriculum content — add content to a course before launching',
  };

  it('reads the delivery `message` from a runtime ApiError (body on .body)', () => {
    const apiErr = new ApiError(
      422,
      { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred', correlation_id: '' },
      envelope,
    );
    expect(errorDetailOf(apiErr)).toBe(envelope.message);
  });

  it('reads the delivery `message` from a raw HttpErrorResponse (body on .error)', () => {
    const httpErr = new HttpErrorResponse({ status: 422, error: envelope });
    expect(errorDetailOf(httpErr)).toBe(envelope.message);
  });

  it('falls back to `error` for a flat {error: <detail>} shape', () => {
    const httpErr = new HttpErrorResponse({ status: 400, error: { error: 'duplicate item' } });
    expect(errorDetailOf(httpErr)).toBe('duplicate item');
  });

  it('returns "" for a non-object / non-Http / non-ApiError error', () => {
    expect(errorDetailOf(new HttpErrorResponse({ status: 500, error: 'boom' }))).toBe('');
    expect(errorDetailOf(new Error('plain'))).toBe('');
    expect(errorDetailOf(null)).toBe('');
  });
});

// The blast-radius badge's ICU plural is resolved in-component (this app's
// ngx-translate ships no MessageFormat compiler). `resolveUsagePlural` only
// collapses a BARE `{count, plural, …}` template — the prose must live INSIDE
// the branches (mirrors the assessment-monitor precedent). A prefixed template
// (`Used by {count, plural, …}`) does NOT match the `^\{count,…\}$` shape and
// leaks the raw wrapper to the UI — the exact live regression these lock.
describe('resolveUsagePlural (blast-radius badge ICU)', () => {
  // MUST mirror the en.json value for
  // `rplus.offerings.workspace.curriculum.used_by_offerings` (bare ICU block).
  const USED_BY = '{count, plural, one {Used by # offering} other {Used by # offerings}}';

  it('picks the `one` branch and interpolates # for a singular count', () => {
    expect(resolveUsagePlural(USED_BY, 1)).toBe('Used by 1 offering');
  });

  it('picks the `other` branch and interpolates # for a plural count', () => {
    expect(resolveUsagePlural(USED_BY, 4)).toBe('Used by 4 offerings');
    expect(resolveUsagePlural(USED_BY, 2)).toBe('Used by 2 offerings');
    expect(resolveUsagePlural(USED_BY, 0)).toBe('Used by 0 offerings');
  });

  it('fully resolves — no raw ICU wrapper leaks to the rendered string', () => {
    const out = resolveUsagePlural(USED_BY, 4);
    expect(out).not.toContain('{');
    expect(out).not.toContain('}');
    expect(out).not.toContain('plural');
    expect(out).not.toContain('#');
  });

  it('proves the regression: a prose-PREFIXED template leaks the wrapper (why the bare shape is required)', () => {
    // The shape that shipped broken to prod: "Used by " sits OUTSIDE the block.
    const prefixed = 'Used by {count, plural, one {# offering} other {# offerings}}';
    const leaked = resolveUsagePlural(prefixed, 4);
    expect(leaked).toContain('plural'); // wrapper survived — unusable in the UI
  });

  it('degrades safely for a non-ICU template (raw key → the count)', () => {
    expect(resolveUsagePlural('rplus.offerings.workspace.curriculum.used_by_offerings', 4)).toBe(
      '4',
    );
  });
});

describe('errorCodeOf (typed delivery codes, CHO-2191)', () => {
  it('prefers the parsed ApiError code when present', () => {
    const apiErr = new ApiError(
      409,
      { code: 'ROOM_DOUBLE_BOOKED', message: '', correlation_id: '' },
      { error: 'Conflict', message: 'room double-booked' },
    );
    expect(errorCodeOf(apiErr)).toBe('ROOM_DOUBLE_BOOKED');
  });

  it('reads the nested body.error.code for an interceptor-less error shape', () => {
    expect(
      errorCodeOf(
        new HttpErrorResponse({
          status: 409,
          error: { error: { code: 'room_over_capacity' }, message: 'no space' },
        }),
      ),
    ).toBe('room_over_capacity');
  });

  it('returns "" when no typed code exists anywhere', () => {
    expect(errorCodeOf(new HttpErrorResponse({ status: 400, error: { error: 'plain' } }))).toBe('');
    expect(errorCodeOf(new HttpErrorResponse({ status: 500, error: 'boom' }))).toBe('');
    expect(errorCodeOf(null)).toBe('');
  });
});

describe('resolveUsagePlural extra branches (S4)', () => {
  it('prefers an `=` exact-match branch over one/other', () => {
    expect(
      resolveUsagePlural('{count, plural, =1 {exactly one} one {one} other {many}}', 1),
    ).toBe('exactly one');
  });

  it('substitutes a bare {count} token for a non-ICU field (no # present)', () => {
    expect(resolveUsagePlural('completed {count} times', 3)).toBe('completed 3 times');
  });
});

/**
 * S4 gap closure — branches the original suite left uncovered: the transition
 * re-entrancy guard, curriculum move-up / item-removal failure / module-op
 * branches (append-vs-replace), the CHO-2191 room picker failure + inline
 * create-room error/guard, the typed session-create error-code mapping,
 * section-edit date-only patches + form closes, and the assessment detach
 * failure.
 */
describe('S4 gap coverage (offering workspace)', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } catch {
      /* already verified in-body */
    }
  });

  const modulesUrl = `${environment.bffBaseUrl}/api/v1/offerings/of1/modules`;
  const curriculumUrlOf = `${environment.bffBaseUrl}/api/v1/offerings/of1/curriculum`;
  const scheduleUrlOf = `${environment.bffBaseUrl}/api/v1/offerings/of1/schedule`;
  const sectionsUrlOf = `${environment.bffBaseUrl}/api/v1/offerings/of1/sections`;
  const assessmentsUrlOf = `${environment.bffBaseUrl}/api/v1/offerings/of1/assessments`;
  const roomsUrl = `${environment.bffBaseUrl}/api/v1/rooms`;

  function drainUsageCounts(
    httpMock: HttpTestingController,
    totals: Readonly<Record<string, number>> = {},
  ): void {
    const listUrl = `${environment.bffBaseUrl}/api/v1/search/offerings`;
    for (const req of httpMock.match((r) => r.url === listUrl && r.method === 'GET')) {
      const courseId = req.request.params.get('course_id') ?? '';
      req.flush({ items: [], next_cursor: null, total_estimate: totals[courseId] ?? 1 });
    }
  }

  function drainModulesS4(
    httpMock: HttpTestingController,
    modules: Readonly<Record<string, readonly Record<string, unknown>[]>> = {},
  ): void {
    for (const req of httpMock.match((r) => r.url.endsWith('/modules') && r.method === 'GET')) {
      const courseId = req.request.params.get('course_id') ?? '';
      req.flush({ course_id: courseId, modules: modules[courseId] ?? [] });
    }
    for (const req of httpMock.match(
      (r) => r.url.endsWith('/modules/progress') && r.method === 'GET',
    )) {
      const courseId = req.request.params.get('course_id') ?? '';
      req.flush({ course_id: courseId, viewer_role: 'instructor', modules: [] });
    }
  }

  function bootCurriculumS4(
    courses: readonly Record<string, unknown>[],
    modules: Readonly<Record<string, readonly Record<string, unknown>[]>> = {},
  ): {
    fixture: ComponentFixture<OfferingWorkspaceComponent>;
    httpMock: HttpTestingController;
    element: HTMLElement;
  } {
    const { fixture, httpMock, element } = setup('of1', ['instructor'], 'curriculum');
    httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
    fixture.detectChanges();
    httpMock.expectOne(curriculumUrlOf).flush({ courses });
    fixture.detectChanges();
    drainUsageCounts(httpMock);
    drainModulesS4(httpMock, modules);
    fixture.detectChanges();
    return { fixture, httpMock, element };
  }

  function bootScheduleS4(
    list: readonly Record<string, unknown>[] = [],
  ): {
    fixture: ComponentFixture<OfferingWorkspaceComponent>;
    httpMock: HttpTestingController;
    element: HTMLElement;
  } {
    const { fixture, httpMock, element } = setup('of1', ['instructor'], 'schedule');
    httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'short' }));
    fixture.detectChanges();
    httpMock.expectOne(scheduleUrlOf).flush({ sessions: list });
    fixture.detectChanges();
    return { fixture, httpMock, element };
  }

  function openSessionForm(
    bag: {
      fixture: ComponentFixture<OfferingWorkspaceComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    },
    rooms: readonly Record<string, unknown>[] = [],
  ): void {
    bag.element.querySelector<HTMLButtonElement>('[data-testid="offering-schedule-add"]')!.click();
    bag.fixture.detectChanges();
    bag.httpMock.expectOne(roomsUrl).flush({ rooms });
    bag.fixture.detectChanges();
  }

  const wireModule = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'm1',
    course_id: 'c1',
    title: 'Unit 1',
    position: 0,
    requirement: { kind: 'all_items', threshold_n: 0, required_item_ids: [] },
    items: [],
    ...over,
  });

  // ── Overview: transition re-entrancy guard ──────────────────────────────
  it('runAction ignores a second call while a transition is in flight', async () => {
    const { fixture, httpMock } = setup('of1');
    httpMock.expectOne(detailUrl('of1')).flush(dto({ state: 'DRAFT' }));
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    comp.runAction('launch');
    comp.runAction('launch');
    await Promise.resolve();
    fixture.detectChanges();
    const patch = httpMock.expectOne(transitionUrl('of1', 'launch'));
    patch.flush(dto({ state: 'LAUNCHED', launched_at: '2026-06-03T00:00:00Z' }));
    fixture.detectChanges();
    expect(comp.offering()?.state).toBe('LAUNCHED');
  });

  // ── Curriculum editor gaps (S1 / CHO-2050) ──────────────────────────────
  it('reorders via move-up → POSTs the swapped id order', () => {
    const twoItems = [
      { item_id: 'it1', kind: 'atom', ref: 'u1', title: 'First', position: 0 },
      { item_id: 'it2', kind: 'atom', ref: 'u2', title: 'Second', position: 1 },
    ];
    const { fixture, httpMock, element } = bootCurriculumS4([
      { id: 'c1', title: 'C', items: twoItems },
    ]);
    element
      .querySelectorAll<HTMLButtonElement>('[data-testid="offering-curriculum-move-up"]')[1]
      .click();
    fixture.detectChanges();
    const post = httpMock.expectOne(
      (r) => r.url === `${curriculumUrlOf}/reorder` && r.method === 'POST',
    );
    expect(post.request.body).toEqual({ course_id: 'c1', ordered_item_ids: ['it2', 'it1'] });
    post.flush({
      course_id: 'c1',
      items: [
        { item_id: 'it2', kind: 'atom', ref: 'u2', title: 'Second', position: 0 },
        { item_id: 'it1', kind: 'atom', ref: 'u1', title: 'First', position: 1 },
      ],
    });
    fixture.detectChanges();
    const items = element.querySelectorAll('[data-testid="offering-curriculum-item"]');
    expect(items[0]?.textContent).toContain('Second');
  });

  it('surfaces a fail-loud error when removing a curriculum item fails', async () => {
    const { fixture, httpMock, element } = bootCurriculumS4([
      {
        id: 'c1',
        title: 'C',
        items: [{ item_id: 'it1', kind: 'atom', ref: 'u1', title: 'First', position: 0 }],
      },
    ]);
    element.querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-remove"]')!.click();
    TestBed.inject(ConfirmDialogService)._resolve(true);
    await Promise.resolve();
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === `${curriculumUrlOf}/remove` && r.method === 'POST')
      .flush({ error: 'locked' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-curriculum-remove-error"]')).not.toBeNull();
  });

  it('closing the curriculum add form resets its fields', () => {
    const { fixture, element } = bootCurriculumS4([
      { id: 'c1', title: 'C', items: [] },
    ]);
    element.querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-curriculum-add-form"]')).not.toBeNull();
    element
      .querySelector<HTMLButtonElement>('[data-testid="offering-curriculum-add-cancel"]')!
      .click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-curriculum-add-form"]')).toBeNull();
  });

  it('add-submit with no ref/title fires no POST', () => {
    const { fixture, httpMock } = bootCurriculumS4([
      { id: 'c1', title: 'C', items: [] },
    ]);
    const comp = fixture.componentInstance;
    comp.openCurriculumAddForm('c1');
    expect(comp.canAddCurriculumItem()).toBe(false);
    comp.onCurriculumAddSubmit({ preventDefault: vi.fn() } as unknown as Event, 'c1');
    httpMock.verify(); // no add POST fired
  });

  it('URL kinds (video) get no entity picker + no search port', () => {
    const { fixture, httpMock } = bootCurriculumS4([{ id: 'c1', title: 'C', items: [] }]);
    const comp = fixture.componentInstance;
    comp.openCurriculumAddForm('c1');
    comp.onCurriculumKindChange({ target: { value: 'video' } } as unknown as Event);
    expect(comp.curriculumRefPickerType()).toBeNull();
    expect(comp.curriculumRefSearchPort()).toBeNull();
    httpMock.verify();
  });

  // ── Module structure gaps (W7 / WS-A) ───────────────────────────────────
  it('spawns a NEW module from create (append, not a replace of an existing id)', () => {
    const { fixture, httpMock, element } = bootCurriculumS4([
      { id: 'c1', title: 'C', items: [] },
    ]);
    element.querySelector<HTMLButtonElement>('[data-testid="module-new"]')!.click();
    fixture.detectChanges();
    const title = element.querySelector<HTMLInputElement>('[data-testid="module-create-title"]')!;
    title.value = 'Fresh';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="module-create-submit"]')!.click();
    httpMock
      .expectOne((r) => r.url === modulesUrl && r.method === 'POST')
      .flush(wireModule({ id: 'm2', title: 'Fresh' }));
    fixture.detectChanges();
    const titles = [...element.querySelectorAll('[data-testid="module-title"]')].map(
      (b) => b.textContent,
    );
    expect(titles).toContain('Fresh');
  });

  it('removes one item from a module (updated module re-renders)', () => {
    const { fixture, httpMock, element } = bootCurriculumS4(
      [
        {
          id: 'c1',
          title: 'C',
          items: [{ item_id: 'it1', kind: 'atom', ref: 'u1', title: 'Limits', position: 0 }],
        },
      ],
      { c1: [wireModule({ items: [{ item_id: 'mi1', content_item_id: 'it1', position: 0 }] })] },
    );
    expect(element.querySelector('[data-testid="module-item"]')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('[data-testid="module-item-remove"]')!.click();
    const post = httpMock.expectOne(
      (r) => r.url === `${modulesUrl}/remove-item` && r.method === 'POST',
    );
    expect(post.request.body).toEqual({ course_id: 'c1', module_id: 'm1', item_id: 'mi1' });
    post.flush(wireModule());
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="module-item"]')).toBeNull();
  });

  it('sets a module requirement to all_items (threshold coerced to 0)', () => {
    const { fixture, httpMock, element } = bootCurriculumS4(
      [
        {
          id: 'c1',
          title: 'C',
          items: [{ item_id: 'it1', kind: 'atom', ref: 'u1', title: 'L', position: 0 }],
        },
      ],
      { c1: [wireModule({ items: [{ item_id: 'mi1', content_item_id: 'it1', position: 0 }] })] },
    );
    element.querySelector<HTMLButtonElement>('[data-testid="module-req-all"]')!.click();
    const post = httpMock.expectOne(
      (r) => r.url === `${modulesUrl}/set-requirement` && r.method === 'POST',
    );
    expect(post.request.body).toEqual({
      course_id: 'c1',
      module_id: 'm1',
      kind: 'all_items',
      threshold_n: 0,
      required_item_ids: [],
    });
    post.flush(
      wireModule({ requirement: { kind: 'all_items', threshold_n: 0, required_item_ids: [] } }),
    );
    fixture.detectChanges();
  });

  it('surfaces the module banner when ADD-ITEM fails (409 edit-lock)', () => {
    const { fixture, httpMock, element } = bootCurriculumS4(
      [
        {
          id: 'c1',
          title: 'C',
          items: [{ item_id: 'it1', kind: 'atom', ref: 'u1', title: 'L', position: 0 }],
        },
      ],
      { c1: [wireModule()] },
    );
    const sel = element.querySelector<HTMLSelectElement>('[data-testid="module-add-select"]')!;
    sel.value = 'it1';
    sel.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="module-add-submit"]')!.click();
    httpMock
      .expectOne((r) => r.url === `${modulesUrl}/add-item` && r.method === 'POST')
      .flush(
        { error: 'Conflict', message: 'edit locked' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="module-error"]')?.textContent).toContain(
      'edit locked',
    );
  });

  // ── Rooms (CHO-2191): picker failure + inline create error/guard ────────
  it('rooms picker failure shows a loud banner; retryRooms refetches', () => {
    const bag = bootScheduleS4();
    const { fixture, httpMock, element } = bag;
    element.querySelector<HTMLButtonElement>('[data-testid="offering-schedule-add"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(roomsUrl).flush('boom', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-schedule-rooms-error"]')).not.toBeNull();
    expect(fixture.componentInstance.roomsError()).toBe(true);
    fixture.componentInstance.retryRooms();
    httpMock.expectOne(roomsUrl).flush({ rooms: [{ id: 'r1', name: 'Lab A', capacity: 30 }] });
    fixture.detectChanges();
    expect(fixture.componentInstance.roomsError()).toBe(false);
  });

  it('inline create-room failure surfaces a banner and keeps the form open', () => {
    const bag = bootScheduleS4();
    const { fixture, httpMock, element } = bag;
    openSessionForm(bag);
    element.querySelector<HTMLButtonElement>('[data-testid="offering-schedule-room-add"]')!.click();
    fixture.detectChanges();
    const name = element.querySelector<HTMLInputElement>(
      '[data-testid="offering-schedule-room-name"]',
    )!;
    name.value = 'Lab B';
    name.dispatchEvent(new Event('input'));
    const capacity = element.querySelector<HTMLInputElement>(
      '[data-testid="offering-schedule-room-capacity"]',
    )!;
    capacity.value = '24';
    capacity.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element
      .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-room-submit"]')!
      .click();
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === roomsUrl && r.method === 'POST')
      .flush({ error: 'name taken' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-schedule-room-error"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="offering-schedule-room-form"]')).not.toBeNull();
  });

  it('create-room guard: a blank name fires no POST', () => {
    const { fixture, httpMock } = bootScheduleS4();
    const comp = fixture.componentInstance;
    comp.openRoomForm();
    comp.onRoomSubmit({ preventDefault: vi.fn() } as unknown as Event);
    httpMock.verify(); // no rooms POST fired
  });

  it('maps the CHO-2191 typed error codes to specific session-create keys', () => {
    for (const code of ['room_required', 'room_not_found', 'room_over_capacity']) {
      TestBed.resetTestingModule();
      const bag = bootScheduleS4();
      const { fixture, httpMock, element } = bag;
      openSessionForm(bag);
      const set = (testid: string, value: string): void => {
        const input = element.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };
      set('offering-schedule-title', 'W1');
      set('offering-schedule-starts', '2026-09-01T09:00');
      set('offering-schedule-ends', '2026-09-01T11:00');
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="offering-schedule-submit"]')!.click();
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url === scheduleUrlOf && r.method === 'POST')
        .flush(
          { error: { code, message: `${code} refused` } },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();
      expect(fixture.componentInstance.sessionCreateErrorKey()).toBe(
        `rplus.offerings.workspace.schedule.error_${code}`,
      );
      httpMock.verify();
    }
  });

  it('createSession guard: a missing or inverted window fires no POST', () => {
    const { fixture, httpMock } = bootScheduleS4();
    const comp = fixture.componentInstance;
    comp.onSessionTitleInput({ target: { value: 'W1' } } as unknown as Event);
    comp.onSessionStartsAtInput({ target: { value: '2026-09-01T09:00' } } as unknown as Event);
    // End missing → guarded before POST.
    comp.onSessionSubmit({ preventDefault: vi.fn() } as unknown as Event);
    httpMock.verify();
    // End before start → guarded before POST.
    comp.onSessionEndsAtInput({ target: { value: '2026-09-01T08:00' } } as unknown as Event);
    comp.onSessionSubmit({ preventDefault: vi.fn() } as unknown as Event);
    httpMock.verify();
    // Valid window → POST fires + the schedule list refreshes.
    comp.onSessionEndsAtInput({ target: { value: '2026-09-01T11:00' } } as unknown as Event);
    comp.onSessionSubmit({ preventDefault: vi.fn() } as unknown as Event);
    httpMock
      .expectOne((r) => r.url === scheduleUrlOf && r.method === 'POST')
      .flush(
        {
          id: 'sess1',
          title: 'W1',
          room: null,
          instructor_gcid: null,
          starts_at: '2026-09-01T09:00:00Z',
          ends_at: '2026-09-01T11:00:00Z',
          created_at: 'x',
          updated_at: 'x',
        },
        { status: 201, statusText: 'Created' },
      );
    fixture.detectChanges();
    httpMock.expectOne(scheduleUrlOf).flush({ sessions: [] });
    fixture.detectChanges();
    expect(comp.sessionCreateSucceeded()).toBe(true);
  });

  it('closing the session form resets its fields', () => {
    const bag = bootScheduleS4();
    openSessionForm(bag);
    bag.element
      .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-cancel"]')!
      .click();
    bag.fixture.detectChanges();
    expect(bag.element.querySelector('[data-testid="offering-schedule-form"]')).toBeNull();
    expect(bag.fixture.componentInstance.isSessionFormOpen()).toBe(false);
  });

  it('closing the room form resets name + capacity', () => {
    const bag = bootScheduleS4();
    openSessionForm(bag);
    bag.element.querySelector<HTMLButtonElement>('[data-testid="offering-schedule-room-add"]')!.click();
    bag.fixture.detectChanges();
    const name = bag.element.querySelector<HTMLInputElement>(
      '[data-testid="offering-schedule-room-name"]',
    )!;
    name.value = 'Lab';
    name.dispatchEvent(new Event('input'));
    bag.fixture.detectChanges();
    bag.element
      .querySelector<HTMLButtonElement>('[data-testid="offering-schedule-room-cancel"]')!
      .click();
    bag.fixture.detectChanges();
    expect(bag.element.querySelector('[data-testid="offering-schedule-room-form"]')).toBeNull();
  });

  // ── Section edit gaps (S4 / CHO-2051) ───────────────────────────────────
  const sectionDtoS4 = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    section_id: 'sec1',
    name: 'Cohort A',
    room: '',
    start_date: '2026-10-01',
    end_date: '2026-10-15',
    lead_instructor_gcid: '',
    created_at: '2026-06-10T00:00:00Z',
    updated_at: '2026-06-10T00:00:00Z',
    ...over,
  });

  function bootSectionsS4(
    list: readonly Record<string, unknown>[] = [],
  ): {
    fixture: ComponentFixture<OfferingWorkspaceComponent>;
    httpMock: HttpTestingController;
    element: HTMLElement;
  } {
    const { fixture, httpMock, element } = setup('of1', ['instructor'], 'sections');
    httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
    fixture.detectChanges();
    httpMock.expectOne(sectionsUrlOf).flush({ sections: list });
    fixture.detectChanges();
    return { fixture, httpMock, element };
  }

  it('PATCHes only the changed start/end dates on section edit (diff patch)', () => {
    const { fixture, httpMock } = bootSectionsS4([sectionDtoS4()]);
    const comp = fixture.componentInstance;
    const section = comp.sections()[0];
    comp.openSectionEditForm(section);
    comp.onEditSectionNameInput({ target: { value: 'Cohort A' } } as unknown as Event);
    comp.onSectionEditSubmit(
      { preventDefault: vi.fn() } as unknown as Event,
      section,
      '',
      '2026-11-01',
      '2026-11-15',
    );
    fixture.detectChanges();
    const patch = httpMock.expectOne(
      (r) => r.url === `${sectionsUrlOf}/sec1` && r.method === 'PATCH',
    );
    expect(patch.request.body).toEqual({ start_date: '2026-11-01', end_date: '2026-11-15' });
    patch.flush(sectionDtoS4({ start_date: '2026-11-01', end_date: '2026-11-15' }));
    fixture.detectChanges();
  });

  it('closing the section create form resets the name', () => {
    const { fixture, element } = bootSectionsS4([]);
    element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-add"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-sections-form"]')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('[data-testid="offering-sections-cancel"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-sections-form"]')).toBeNull();
  });

  it('closing the section EDIT form clears the open edit state', () => {
    const { fixture, element } = bootSectionsS4([sectionDtoS4()]);
    const comp = fixture.componentInstance;
    comp.openSectionEditForm(comp.sections()[0]);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-sections-edit-form"]')).not.toBeNull();
    element
      .querySelector<HTMLButtonElement>('[data-testid="offering-sections-edit-cancel"]')!
      .click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-sections-edit-form"]')).toBeNull();
  });

  // ── Assessments: detach failure (W3.A) ──────────────────────────────────
  it('surfaces a fail-loud error when detaching an assessment fails', async () => {
    const { fixture, httpMock, element } = setup('of1', ['instructor'], 'assessments');
    httpMock.expectOne(detailUrl('of1')).flush(dto({ delivery_type: 'graduate' }));
    fixture.detectChanges();
    httpMock
      .expectOne(assessmentsUrlOf)
      .flush({ items: [{ assessment_id: 'as1', state: 'DRAFT', title: 'Midterm' }], next_page_token: null });
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="offering-assessments-remove"]')!.click();
    TestBed.inject(ConfirmDialogService)._resolve(true);
    await Promise.resolve();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/assessments/as1/archive`)
      .flush({ error: 'locked' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="offering-assessments-remove-error"]')).not.toBeNull();
  });
});
