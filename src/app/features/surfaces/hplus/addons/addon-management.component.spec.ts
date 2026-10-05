/**
 * H+ Add-on Lifecycle dashboard spec (CHO-1698 STITCH-H-ADD-1).
 *
 * Wave 2 asserted purely mock-driven cost contributions + a confirm
 * modal. This iteration asserts the real-wiring behaviours:
 *   - On mount, the component calls `service.list()` and renders tiles.
 *   - Filter chips + search filter the displayed tile set.
 *   - Refresh button re-issues `service.list()`.
 *   - Visibilitychange visible re-issues `service.list()`.
 *   - Per-tile actions (Usage / Change Tier / Deactivate / Marketplace)
 *     fire the "Coming soon" toast for v1.
 *   - Loading + error + empty states render via their data-testid hooks.
 *   - Compliance-locked tile disables the Deactivate button.
 *
 * Lesson from Dale's CHO-1694 catch: every `vi.fn()` in the mock gets
 * an explicit typed signature so `mock.calls[0][0]` is the real
 * argument tuple, not `[]` (TS2493).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';

import { AddonManagementComponent } from './addon-management.component';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type {
  AdminAddonRow,
  AdminAddonsListResult,
  DeactivateAddonRequest,
  DeactivateAddonResult,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

function makeAddonsServiceMock(opts: { list?: AdminAddonsListResult } = {}) {
  return {
    list: vi.fn(
      (): Observable<AdminAddonsListResult> =>
        of(opts.list ?? ({ kind: 'success', rows: [] } as AdminAddonsListResult)),
    ),
    refresh: vi.fn(
      (): Observable<AdminAddonsListResult> =>
        of(opts.list ?? ({ kind: 'success', rows: [] } as AdminAddonsListResult)),
    ),
    // CHO-1731 PR 2 — the modal child of the dashboard injects the same
    // service, so the mock must include `deactivate` too even when the
    // dashboard-level tests don't drive a deactivation flow.
    deactivate: vi.fn(
      (_planId: string, _payload: DeactivateAddonRequest): Observable<DeactivateAddonResult> =>
        of({
          kind: 'success-immediate',
          response: {
            tenant_id: 't',
            addon_plan_id: _planId,
            status: 'DEACTIVATED',
            requested_at: '2026-06-12T00:00:00Z',
          },
        } as DeactivateAddonResult),
    ),
  };
}

function makeToastMock() {
  return { show: vi.fn() };
}

function makeRouterMock() {
  return { navigate: vi.fn((_commands: unknown[]): Promise<boolean> => Promise.resolve(true)) };
}

const familiarRow: AdminAddonRow = {
  tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  addon_plan_id: 'plan-familiar',
  addon_code: 'familiar',
  display_name: 'Familiar',
  status: 'ACTIVE',
  current_tier: 'pro',
  monthly_cost: 2400,
  seats_used: 12,
  activated_at: '2026-06-08T00:00:00Z',
  deactivated_at: null,
};

const pendingRow: AdminAddonRow = {
  tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  addon_plan_id: 'plan-tms',
  addon_code: 'tms',
  display_name: 'TMS',
  status: 'PENDING_ACTIVATION',
  current_tier: 'starter',
  seats_used: 0,
  activated_at: '2026-06-09T00:00:00Z',
};

const lockedRow: AdminAddonRow = {
  tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  addon_plan_id: 'plan-cert',
  addon_code: 'cert',
  display_name: 'Cert Programme',
  status: 'ACTIVE',
  current_tier: 'pro',
  seats_used: 3,
  activated_at: '2026-06-01T00:00:00Z',
  compliance_locked: true,
};

// CHO-1749 — the always-on `base` plan that ships with every tenant. The
// management surface must surface the Included-by-default badge + disable
// Deactivate. AdminAddonRow doesn't carry a `system` flag today (the BE
// list endpoint pre-dates CHO-1747); FE classifies via addon_code until
// a follow-up extends the schema.
const baseRow: AdminAddonRow = {
  tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  addon_plan_id: 'plan-base',
  addon_code: 'base',
  display_name: 'Chora Base',
  status: 'ACTIVE',
  current_tier: 'default',
  seats_used: 0,
  activated_at: '2026-05-01T00:00:00Z',
};

async function setup(opts: { list?: AdminAddonsListResult } = {}): Promise<{
  fixture: ComponentFixture<AddonManagementComponent>;
  component: AddonManagementComponent;
  element: HTMLElement;
  addonsMock: ReturnType<typeof makeAddonsServiceMock>;
  toastMock: ReturnType<typeof makeToastMock>;
  routerMock: ReturnType<typeof makeRouterMock>;
}> {
  const addonsMock = makeAddonsServiceMock(opts);
  const toastMock = makeToastMock();
  const routerMock = makeRouterMock();
  await TestBed.configureTestingModule({
    imports: [AddonManagementComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TenantAddonsAdminService, useValue: addonsMock },
      { provide: ToastService, useValue: toastMock },
      { provide: Router, useValue: routerMock },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AddonManagementComponent);
  const component = fixture.componentInstance;
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  return { fixture, component, element, addonsMock, toastMock, routerMock };
}

describe('AddonManagementComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('hydration on mount', () => {
    it('calls addonsSvc.list once on construction', async () => {
      const { addonsMock } = await setup();
      expect(addonsMock.list).toHaveBeenCalledTimes(1);
    });

    it('renders a tile per row returned by the service', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [familiarRow, pendingRow] },
      });
      const tiles = element.querySelectorAll('[data-testid^="addon-tile-"]');
      // 2 tile root elements + the inner badge/action buttons also have
      // data-testid prefixed `addon-tile-`. Filter to the LI root only.
      const roots = Array.from(tiles).filter(
        (el) => el.tagName.toLowerCase() === 'li',
      );
      expect(roots.length).toBe(2);
    });

    it('renders the empty-zero state when no rows are returned', async () => {
      const { element } = await setup();
      expect(element.querySelector('[data-testid="addons-empty"]')).toBeTruthy();
    });

    it('renders the load-error banner when list returns server-error', async () => {
      const { element } = await setup({ list: { kind: 'server-error' } });
      expect(
        element.querySelector('[data-testid="addons-load-error"]'),
      ).toBeTruthy();
    });

    it('renders the load-error banner when list returns unauthenticated', async () => {
      const { element } = await setup({ list: { kind: 'unauthenticated' } });
      expect(
        element.querySelector('[data-testid="addons-load-error"]'),
      ).toBeTruthy();
    });

    it('shows the loading indicator while list is in flight', async () => {
      const subject = new Subject<AdminAddonsListResult>();
      const addonsMock = {
        list: vi.fn((): Observable<AdminAddonsListResult> => subject.asObservable()),
        refresh: vi.fn((): Observable<AdminAddonsListResult> => subject.asObservable()),
      };
      await TestBed.configureTestingModule({
        imports: [AddonManagementComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: TenantAddonsAdminService, useValue: addonsMock },
          { provide: ToastService, useValue: makeToastMock() },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(AddonManagementComponent);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="addons-loading"]',
        ),
      ).toBeTruthy();
      subject.next({ kind: 'success', rows: [] });
      subject.complete();
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="addons-loading"]',
        ),
      ).toBeNull();
    });
  });

  describe('filter + search', () => {
    it('hides non-matching tiles when a status chip is selected', async () => {
      const { fixture, component, element } = await setup({
        list: { kind: 'success', rows: [familiarRow, pendingRow] },
      });
      component.setStatusFilter('pending');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-tile-plan-tms"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="addon-tile-plan-familiar"]'),
      ).toBeNull();
    });

    it('shows the empty-filtered state when filter excludes everything', async () => {
      const { fixture, component, element } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      component.setStatusFilter('suspended');
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="addons-empty"]')).toBeTruthy();
    });

    it('filters by case-insensitive substring on display_name', async () => {
      const { fixture, component, element } = await setup({
        list: { kind: 'success', rows: [familiarRow, pendingRow] },
      });
      component.searchTerm.set('fAmIl');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-tile-plan-familiar"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="addon-tile-plan-tms"]'),
      ).toBeNull();
    });
  });

  describe('refresh', () => {
    it('re-issues addonsSvc.list when the Refresh button is clicked', async () => {
      const { fixture, element, addonsMock } = await setup();
      const btn = element.querySelector(
        '[data-testid="addons-refresh"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      expect(addonsMock.list).toHaveBeenCalledTimes(2);
    });

    it('re-issues addonsSvc.list when the tab returns to visible', async () => {
      const { addonsMock } = await setup();
      // Simulate visibility flip — re-define the read-only property.
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(addonsMock.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('per-tile actions', () => {
    it('Usage button navigates to /h/addons/{planId}/usage (CHO-1732)', async () => {
      const { fixture, element, routerMock, toastMock } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="addon-tile-usage-plan-familiar"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(routerMock.navigate).toHaveBeenCalledTimes(1);
      expect(routerMock.navigate.mock.calls[0]![0]).toEqual([
        '/h/addons',
        'plan-familiar',
        'usage',
      ]);
      // The old 'Coming soon' toast must NOT fire anymore.
      expect(toastMock.show).not.toHaveBeenCalledWith(
        'hplus.addons.comingSoon',
        'info',
      );
    });

    it('Change Tier button navigates to /h/addons/{planId}/change-tier (CHO-1733)', async () => {
      const { fixture, element, routerMock, toastMock } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="addon-tile-tier-plan-familiar"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(routerMock.navigate).toHaveBeenCalledTimes(1);
      expect(routerMock.navigate.mock.calls[0]![0]).toEqual([
        '/h/addons',
        'plan-familiar',
        'change-tier',
      ]);
      expect(toastMock.show).not.toHaveBeenCalledWith(
        'hplus.addons.comingSoon',
        'info',
      );
    });

    it('View in Marketplace button navigates to /h/addons/{planId}/detail (CHO-1734 — epic close)', async () => {
      const { fixture, element, routerMock, toastMock } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="addon-tile-marketplace-plan-familiar"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(routerMock.navigate).toHaveBeenCalledTimes(1);
      expect(routerMock.navigate.mock.calls[0]![0]).toEqual([
        '/h/addons',
        'plan-familiar',
        'detail',
      ]);
      expect(toastMock.show).not.toHaveBeenCalledWith(
        'hplus.addons.comingSoon',
        'info',
      );
    });

    it('Deactivate button opens the deactivation modal for the tile (CHO-1731)', async () => {
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      // Modal NOT rendered before the click.
      expect(
        element.querySelector('[data-testid="addon-deactivate-modal"]'),
      ).toBeNull();
      const btn = element.querySelector(
        '[data-testid="addon-tile-deactivate-plan-familiar"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-deactivate-modal"]'),
      ).toBeTruthy();
    });

    it('Deactivate button does NOT fire the Coming-soon toast anymore', async () => {
      const { fixture, element, toastMock } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="addon-tile-deactivate-plan-familiar"]',
        ) as HTMLButtonElement
      ).click();
      expect(toastMock.show).not.toHaveBeenCalledWith(
        'hplus.addons.comingSoon',
        'info',
      );
    });

    it('Compliance-locked tile disables the Deactivate button', async () => {
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [lockedRow] },
      });
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="addon-tile-deactivate-plan-cert"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('Compliance-locked tile shows the lock-explanation banner', async () => {
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [lockedRow] },
      });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-tile-compliance-plan-cert"]'),
      ).toBeTruthy();
    });

    // -----------------------------------------------------------------------
    // CHO-1755 — human-friendly current-tier label on the management tile.
    //
    // AdminAddonRow.current_tier carries the raw code (e.g. "pro"); the
    // tile was rendering that as-is. Polish: capitalise + de-snake-case so
    // the user sees "Pro" / "Default" / "Tenant Admin" instead of "pro" /
    // "default" / "tenant_admin".
    // -----------------------------------------------------------------------

    it('renders the current tier with a capitalised label', async () => {
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      const tierDd = element.querySelector(
        '[data-testid="addon-tile-plan-familiar"] dl.addons__tile-meta dd',
      );
      // familiarRow.current_tier = "pro" → tile shows "Pro".
      expect(tierDd?.textContent?.trim()).toBe('Pro');
    });

    it('preserves the em-dash for rows with no current_tier', async () => {
      const noTierRow = { ...familiarRow, current_tier: undefined };
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [noTierRow] },
      });
      fixture.detectChanges();
      const tierDd = element.querySelector(
        '[data-testid="addon-tile-plan-familiar"] dl.addons__tile-meta dd',
      );
      expect(tierDd?.textContent?.trim()).toBe('–');
    });

    it('snake_case codes are split into Title Case words', async () => {
      const snakeRow = { ...familiarRow, current_tier: 'tenant_admin' };
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [snakeRow] },
      });
      fixture.detectChanges();
      const tierDd = element.querySelector(
        '[data-testid="addon-tile-plan-familiar"] dl.addons__tile-meta dd',
      );
      expect(tierDd?.textContent?.trim()).toBe('Tenant Admin');
    });

    // -----------------------------------------------------------------------
    // CHO-1749 / CHO-1745 Sub 4 — system plan (always-on baseline) on the
    // management surface. The Deactivate button must be disabled
    // independent of compliance_locked, and the tile must render the
    // `Included by default` badge so the user knows why.
    // -----------------------------------------------------------------------

    it('System tile (base) hides the Deactivate button entirely', async () => {
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [baseRow] },
      });
      fixture.detectChanges();
      // The button is removed from the DOM (not rendered-disabled) so the
      // user never sees a deceptive affordance on a plan that can't be
      // deactivated. BE 400 `cannot_unsubscribe_base` remains as
      // defense-in-depth for direct API calls.
      expect(
        element.querySelector('[data-testid="addon-tile-deactivate-plan-base"]'),
      ).toBeNull();
    });

    it('System tile renders the Included-by-default badge', async () => {
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [baseRow] },
      });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-tile-system-plan-base"]'),
      ).toBeTruthy();
    });

    it('Non-system tile (familiar) does NOT render the system badge', async () => {
      const { fixture, element } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-tile-system-plan-familiar"]'),
      ).toBeNull();
    });

    it('Deactivate handler is still a no-op for system tiles (defense-in-depth)', async () => {
      // Even though the button is hidden from the DOM, the host
      // onDeactivate handler keeps its early-return so that any
      // programmatic invocation (Angular debug bridge, e2e shim, future
      // refactor that re-renders the button) can't open the modal.
      const { fixture, component } = await setup({
        list: { kind: 'success', rows: [baseRow] },
      });
      fixture.detectChanges();
      const baseTile = component.tiles().find((t) => t.addonCode === 'base');
      expect(baseTile).toBeTruthy();
      component.onDeactivate(baseTile!);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '[data-testid="addon-deactivate-modal"]',
        ),
      ).toBeNull();
    });
  });

  describe('deactivation modal wiring (CHO-1731)', () => {
    it('modal `deactivated` emit triggers reload() + success toast', async () => {
      const { fixture, element, addonsMock, toastMock } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="addon-tile-deactivate-plan-familiar"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const initialListCalls = addonsMock.list.mock.calls.length;
      // Walk into the embedded modal + emit `deactivated`.
      const modalRoot = element.querySelector(
        '[data-testid="addon-deactivate-modal"]',
      );
      expect(modalRoot).toBeTruthy();
      // Simpler than navigating the modal: call the host's handler directly.
      fixture.componentInstance.onDeactivated({
        kind: 'success-immediate',
        response: {
          tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
          addon_plan_id: 'plan-familiar',
          status: 'DEACTIVATED',
          requested_at: '2026-06-12T00:00:00Z',
        },
      });
      fixture.detectChanges();
      expect(addonsMock.list.mock.calls.length).toBe(initialListCalls + 1);
      expect(toastMock.show).toHaveBeenCalledWith(
        'hplus.addons.deactivate.successImmediate',
        'success',
      );
      // Modal closes on success.
      expect(
        element.querySelector('[data-testid="addon-deactivate-modal"]'),
      ).toBeNull();
    });

    it('modal `dismissed` emit closes the modal without reloading', async () => {
      const { fixture, element, addonsMock } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="addon-tile-deactivate-plan-familiar"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const initialListCalls = addonsMock.list.mock.calls.length;
      fixture.componentInstance.onDeactivateDismissed();
      fixture.detectChanges();
      expect(addonsMock.list.mock.calls.length).toBe(initialListCalls);
      expect(
        element.querySelector('[data-testid="addon-deactivate-modal"]'),
      ).toBeNull();
    });
  });

  describe('accessibility', () => {
    it('status badges have a translated text label, not just colour', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      const badge = element.querySelector(
        '[data-testid="addon-tile-status-plan-familiar"]',
      );
      expect((badge?.textContent ?? '').trim().length).toBeGreaterThan(0);
    });

    it('addons grid uses role="list"', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      const grid = element.querySelector('[data-testid="addons-grid"]');
      expect(grid?.getAttribute('role')).toBe('list');
    });

    it('filter chips use role="tablist" / role="tab"', async () => {
      const { element } = await setup();
      const list = element.querySelector('[data-testid="addons-filters"]');
      expect(list?.getAttribute('role')).toBe('tablist');
      const chip = element.querySelector('[data-testid="addons-filter-active"]');
      expect(chip?.getAttribute('role')).toBe('tab');
    });
  });

  // CHO-1798 — billing-cycle-end date renders as YYYY-MM-DD only, no
  // trailing "T13:13:03.285282Z" timestamp. The Stripe-derived
  // next_renewal_at field arrives as a full ISO 8601 string; the tile
  // surface uses it as a human-friendly date label.
  describe('billing cycle end date format (CHO-1798)', () => {
    it('renders the date YYYY-MM-DD without the time portion', async () => {
      const renewalRow: AdminAddonRow = {
        ...familiarRow,
        next_renewal_at: '2026-07-18T13:13:03.285282Z',
      };
      const { element } = await setup({
        list: { kind: 'success', rows: [renewalRow] },
      });
      const dd = element.querySelector(
        '[data-testid="addon-tile-billing-cycle-end-' + renewalRow.addon_plan_id + '"]',
      ) as HTMLElement | null;
      expect(dd).toBeTruthy();
      const txt = dd?.textContent ?? '';
      expect(txt).toContain('2026-07-18');
      // Time component must NOT leak into the rendered string.
      expect(txt).not.toMatch(/T\d{2}:\d{2}/);
    });
  });

  // CHO-1782 — destructive parallel to the scheduled-tier badge: when the
  // admin picks end-of-cycle deactivation, the tile shows the amber
  // "Deactivating <date>" pill until the cycle anchor fires.
  describe('deactivating badge (CHO-1782)', () => {
    const deactivatingRow: AdminAddonRow = {
      ...familiarRow,
      status: 'PENDING_DEACTIVATION',
      deactivation_effective_at: '2026-07-17T00:00:00Z',
      deactivation_reason: 'cost',
    };

    it('renders the badge when status is PENDING_DEACTIVATION + date is populated', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [deactivatingRow] },
      });
      const badge = element.querySelector(
        '[data-testid="addon-tile-deactivating-' + deactivatingRow.addon_plan_id + '"]',
      ) as HTMLElement | null;
      expect(badge).toBeTruthy();
      expect(badge?.textContent ?? '').toContain('2026-07-17');
    });

    it('does NOT render the badge when status is ACTIVE even if date is set', async () => {
      const partial: AdminAddonRow = {
        ...familiarRow,
        deactivation_effective_at: '2026-07-17T00:00:00Z',
      };
      const { element } = await setup({
        list: { kind: 'success', rows: [partial] },
      });
      expect(
        element.querySelector(
          '[data-testid="addon-tile-deactivating-' + partial.addon_plan_id + '"]',
        ),
      ).toBeFalsy();
    });

    it('does NOT render the badge when status is PENDING_DEACTIVATION but date is missing', async () => {
      const partial: AdminAddonRow = {
        ...familiarRow,
        status: 'PENDING_DEACTIVATION',
      };
      const { element } = await setup({
        list: { kind: 'success', rows: [partial] },
      });
      expect(
        element.querySelector(
          '[data-testid="addon-tile-deactivating-' + partial.addon_plan_id + '"]',
        ),
      ).toBeFalsy();
    });
  });

  // CHO-1785 — (undo) affordance next to the amber pill. Lets the admin
  // reverse a pending end-of-cycle deactivation without waiting for the
  // Stripe anchor or re-subscribing.
  describe('cancel-deactivation undo (CHO-1785)', () => {
    const deactivatingRow: AdminAddonRow = {
      ...familiarRow,
      status: 'PENDING_DEACTIVATION',
      deactivation_effective_at: '2026-07-17T00:00:00Z',
      deactivation_reason: 'cost',
    };

    it('renders the undo button next to the deactivating badge', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [deactivatingRow] },
      });
      const undoBtn = element.querySelector(
        '[data-testid="addon-tile-cancel-deactivation-' + deactivatingRow.addon_plan_id + '"]',
      ) as HTMLButtonElement | null;
      expect(undoBtn).toBeTruthy();
      expect(undoBtn?.disabled).toBe(false);
    });

    it('does NOT render the undo button when the tile is ACTIVE', async () => {
      const { element } = await setup({
        list: { kind: 'success', rows: [familiarRow] },
      });
      expect(
        element.querySelector(
          '[data-testid="addon-tile-cancel-deactivation-' + familiarRow.addon_plan_id + '"]',
        ),
      ).toBeFalsy();
    });

    it('clicking undo calls cancelScheduledDeactivation with the planId', async () => {
      const addonsMock = makeAddonsServiceMock({
        list: { kind: 'success', rows: [deactivatingRow] },
      }) as ReturnType<typeof makeAddonsServiceMock> & {
        cancelScheduledDeactivation?: ReturnType<typeof vi.fn>;
      };
      addonsMock.cancelScheduledDeactivation = vi.fn(() =>
        of({ kind: 'success', snapshot: {} } as unknown as never),
      );
      await TestBed.configureTestingModule({
        imports: [AddonManagementComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: TenantAddonsAdminService, useValue: addonsMock },
          { provide: ToastService, useValue: makeToastMock() },
          { provide: Router, useValue: makeRouterMock() },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(AddonManagementComponent);
      fixture.detectChanges();
      const undoBtn = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="addon-tile-cancel-deactivation-' + deactivatingRow.addon_plan_id + '"]',
      ) as HTMLButtonElement;
      undoBtn.click();
      fixture.detectChanges();
      expect(addonsMock.cancelScheduledDeactivation).toHaveBeenCalledTimes(1);
      expect(addonsMock.cancelScheduledDeactivation).toHaveBeenCalledWith(
        deactivatingRow.addon_plan_id,
      );
    });
  });
});
