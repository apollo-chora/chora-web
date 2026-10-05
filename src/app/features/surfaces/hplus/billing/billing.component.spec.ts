/**
 * BillingComponent spec — H+ Billing Wave 4 (CHO-1773 + CHO-1777 + CHO-1778).
 *
 * Live data flows asserted:
 *   - constructor fires `TenantBillingService.listInvoices()`
 *   - constructor fires `TenantAddonsAdminService.list()` — drives BOTH
 *     the dunning banner (CHO-1777, via past_due) AND the monthly
 *     breakdown (CHO-1778, via display_name + monthly_cost + current_tier).
 *   - loading / empty / error / success states render the right markers
 *   - "Manage billing" CTA fires `createCustomerPortalSession()` and
 *     redirects via `window.location.href`
 *   - Dunning CTA visibility computed from any past_due addon; Confirm
 *     opens Stripe Customer Portal.
 *
 * CHO-1778 dropped the hardcoded "Hub+ Standard SGD 199/mo" plan label
 * + the static $49/$39/$287 breakdown — both were Stage 1 P0 audit gaps.
 * The breakdown now derives from the live /h/addons response; the plan
 * panel is gone (no real "plan" concept — tenants compose add-ons).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { BillingComponent } from './billing.component';
import { TenantBillingService } from '../../../admin/tenant-admin/services/tenant-billing.service';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import type {
  CreatePortalSessionRequest,
  CreatePortalSessionResult,
  InvoiceRow,
  ListInvoicesQuery,
  ListInvoicesResult,
} from '../../../admin/tenant-admin/models/tenant-billing.model';
import type {
  AdminAddonRow,
  AdminAddonsListResult,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

function invoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    stripe_invoice_id: 'in_test_001',
    number: 'INV-001',
    period_start: '2026-05-14T00:00:00Z',
    period_end: '2026-06-14T00:00:00Z',
    status: 'paid',
    total_cents: 4900,
    currency: 'usd',
    hosted_invoice_url: 'https://invoice.stripe.com/i/test_001',
    invoice_pdf_url: 'https://invoice.stripe.com/i/test_001/pdf',
    description: 'tms:starter',
    ...overrides,
  };
}

function addonRow(overrides: Partial<AdminAddonRow> = {}): AdminAddonRow {
  return {
    tenant_id: '01970000-0000-7000-8000-000000000001',
    addon_plan_id: '019e0000-0000-7000-8000-aaaaaaaaaaaa',
    addon_code: 'tms',
    display_name: 'Training Management Suite',
    status: 'ACTIVE',
    current_tier: 'starter',
    monthly_cost: 4900,
    activated_at: '2026-06-01T00:00:00Z',
    deactivated_at: null,
    past_due: false,
    ...overrides,
  };
}

interface SetupOpts {
  listResult?: ListInvoicesResult;
  portalResult?: CreatePortalSessionResult;
  addonsResult?: AdminAddonsListResult;
}

function makeBillingMock(opts: SetupOpts = {}) {
  return {
    listInvoices: vi.fn(
      (_q: ListInvoicesQuery): Observable<ListInvoicesResult> =>
        of(
          opts.listResult ??
            ({ kind: 'success', items: [invoice()], nextCursor: null } as ListInvoicesResult),
        ),
    ),
    createCustomerPortalSession: vi.fn(
      (_r: CreatePortalSessionRequest): Observable<CreatePortalSessionResult> =>
        of(
          opts.portalResult ??
            ({
              kind: 'success',
              url: 'https://billing.stripe.com/p/session/test_xyz',
            } as CreatePortalSessionResult),
        ),
    ),
  };
}

function makeAddonsMock(opts: SetupOpts = {}) {
  return {
    list: vi.fn(
      (): Observable<AdminAddonsListResult> =>
        of(
          opts.addonsResult ??
            ({ kind: 'success', rows: [] } as AdminAddonsListResult),
        ),
    ),
    // unused-but-required surface (the service has more methods; the
    // component only calls list()).
    refresh: vi.fn(),
  };
}

async function setup(opts: SetupOpts = {}): Promise<{
  fixture: ComponentFixture<BillingComponent>;
  component: BillingComponent;
  element: HTMLElement;
  billingMock: ReturnType<typeof makeBillingMock>;
  addonsMock: ReturnType<typeof makeAddonsMock>;
}> {
  const billingMock = makeBillingMock(opts);
  const addonsMock = makeAddonsMock(opts);
  await TestBed.configureTestingModule({
    imports: [BillingComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: TenantBillingService, useValue: billingMock },
      { provide: TenantAddonsAdminService, useValue: addonsMock },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(BillingComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    billingMock,
    addonsMock,
  };
}

describe('BillingComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('render basics', () => {
    it('creates', async () => {
      const { component } = await setup();
      expect(component).toBeTruthy();
    });

    it('has data-testid="hplus-billing" on root', async () => {
      const { element } = await setup();
      expect(element.querySelector('[data-testid="hplus-billing"]')).toBeTruthy();
    });

    it('applies the surface-hplus accent class on the root', async () => {
      const { element } = await setup();
      const root = element.querySelector(
        '[data-testid="hplus-billing"]',
      ) as HTMLElement;
      expect(root.classList.contains('surface-hplus')).toBe(true);
    });

    it('renders a single <main> landmark + h1 + breadcrumb', async () => {
      const { element } = await setup();
      expect(element.querySelectorAll('main').length).toBe(1);
      expect(element.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1);
      expect(element.querySelector('nav[aria-label]')).toBeTruthy();
    });
  });

  describe('CHO-1778 — plan summary deleted (no real plan concept)', () => {
    it('no longer renders the hardcoded "Hub+ Standard SGD 199" label', async () => {
      const { element } = await setup();
      // The plan summary panel was removed entirely — tenants compose
      // add-ons, there is no tenant-level "plan" in the catalogue.
      expect(element.querySelector('[data-testid="billing-plan"]')).toBeFalsy();
      expect(element.querySelector('[data-testid="billing-plan-panel"]')).toBeFalsy();
      // Hard guard: the fictional marketing label MUST NOT appear anywhere.
      expect(element.textContent ?? '').not.toMatch(/Hub\+\s+Standard/);
      // CHO-1790 — hard guard: hardcoded USD currency MUST NOT appear
      // (catalogue is SGD post-CHO-1787).
      expect(element.textContent ?? '').not.toMatch(/USD\s+199/);
    });
  });

  describe('CHO-1778 — add-on breakdown derives from /h/addons', () => {
    it('renders one row per ACTIVE addon with display_name + SGD price', async () => {
      const { element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [
            addonRow({
              addon_code: 'tms',
              display_name: 'Training Management Suite',
              current_tier: 'starter',
              monthly_cost: 4900,
            }),
            addonRow({
              addon_code: 'kg_hexagonal',
              display_name: 'Knowledge Graph (Hexagonal)',
              current_tier: 'pro',
              monthly_cost: 9900,
            }),
          ],
        },
      });
      const tms = element.querySelector('[data-testid="billing-breakdown-tms"]');
      const kg = element.querySelector(
        '[data-testid="billing-breakdown-kg_hexagonal"]',
      );
      expect(tms?.textContent).toContain('Training Management Suite');
      expect(tms?.textContent).toMatch(/SGD\s+49\.00/);
      expect(kg?.textContent).toContain('Knowledge Graph (Hexagonal)');
      expect(kg?.textContent).toMatch(/SGD\s+99\.00/);
    });

    it('total equals sum of rendered rows in SGD (CHO-1787 platform default)', async () => {
      const { element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [
            addonRow({ addon_code: 'tms', monthly_cost: 4900 }),
            addonRow({ addon_code: 'kg_hexagonal', monthly_cost: 9900 }),
          ],
        },
      });
      const total = element.querySelector('[data-testid="billing-total"]');
      expect(total?.textContent).toMatch(/SGD\s+148\.00/);
      // Guards against the pre-CHO-1778 hardcoded 287 label coming back.
      expect(total?.textContent).not.toMatch(/287/);
      // CHO-1790 — the catalogue is SGD now; USD must not leak through.
      expect(total?.textContent).not.toMatch(/USD/);
    });

    it('skips DEACTIVATED rows (only ACTIVE counted)', async () => {
      const { element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [
            addonRow({ addon_code: 'tms', monthly_cost: 4900, status: 'ACTIVE' }),
            addonRow({
              addon_code: 'old_thing',
              monthly_cost: 9900,
              status: 'DEACTIVATED',
            }),
          ],
        },
      });
      expect(
        element.querySelector('[data-testid="billing-breakdown-tms"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="billing-breakdown-old_thing"]'),
      ).toBeFalsy();
      const total = element.querySelector('[data-testid="billing-total"]');
      expect(total?.textContent).toMatch(/SGD\s+49\.00/);
    });

    it('skips rows missing monthly_cost (pre-CHO-1776 BE rows)', async () => {
      const { element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [
            addonRow({ addon_code: 'tms', monthly_cost: 4900 }),
            addonRow({ addon_code: 'undefined_cost', monthly_cost: undefined }),
          ],
        },
      });
      expect(
        element.querySelector('[data-testid="billing-breakdown-tms"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="billing-breakdown-undefined_cost"]'),
      ).toBeFalsy();
    });

    it('renders the empty state + Marketplace link when no active addons', async () => {
      const { element } = await setup({
        addonsResult: { kind: 'success', rows: [] },
      });
      expect(
        element.querySelector('[data-testid="billing-breakdown-empty"]'),
      ).toBeTruthy();
      // Total row is hidden when empty (avoid "Total per month: SGD 0.00").
      expect(
        element.querySelector('[data-testid="billing-total"]'),
      ).toBeFalsy();
      const link = element.querySelector(
        '[data-testid="billing-breakdown-marketplace-link"]',
      ) as HTMLAnchorElement | null;
      expect(link).toBeTruthy();
      expect(link?.getAttribute('href')).toBe('/h/marketplace');
    });

    it('renders empty state when all rows are deactivated', async () => {
      const { element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [
            addonRow({ addon_code: 'a', status: 'DEACTIVATED' }),
            addonRow({ addon_code: 'b', status: 'DEACTIVATED' }),
          ],
        },
      });
      expect(
        element.querySelector('[data-testid="billing-breakdown-empty"]'),
      ).toBeTruthy();
    });

    it('renders tier badge next to the addon name when current_tier present', async () => {
      const { element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [
            addonRow({
              addon_code: 'tms',
              display_name: 'Training Management Suite',
              current_tier: 'starter',
              monthly_cost: 4900,
            }),
          ],
        },
      });
      const row = element.querySelector('[data-testid="billing-breakdown-tms"]');
      expect(row?.textContent).toMatch(/starter/i);
    });
  });

  describe('Invoice history (live)', () => {
    it('fires listInvoices on construction with default limit', async () => {
      const { billingMock } = await setup();
      expect(billingMock.listInvoices).toHaveBeenCalledTimes(1);
      expect(billingMock.listInvoices.mock.calls[0][0]).toEqual({ limit: 20 });
    });

    it('renders a row per invoice keyed by stripe_invoice_id', async () => {
      const { element } = await setup({
        listResult: {
          kind: 'success',
          items: [invoice(), invoice({ stripe_invoice_id: 'in_test_002' })],
          nextCursor: null,
        },
      });
      const rows = element.querySelectorAll(
        'tbody tr[data-testid^="invoice-row-"]',
      );
      expect(rows.length).toBe(2);
      expect(
        element.querySelector('[data-testid="invoice-row-in_test_001"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="invoice-row-in_test_002"]'),
      ).toBeTruthy();
    });

    it('marks rows with their Stripe status', async () => {
      const { element } = await setup({
        listResult: {
          kind: 'success',
          items: [
            invoice({ stripe_invoice_id: 'in_test_open', status: 'open' }),
            invoice({ stripe_invoice_id: 'in_test_void', status: 'void' }),
          ],
          nextCursor: null,
        },
      });
      expect(
        element
          .querySelector('[data-testid="invoice-row-in_test_open"]')
          ?.getAttribute('data-status'),
      ).toBe('open');
      expect(
        element
          .querySelector('[data-testid="invoice-row-in_test_void"]')
          ?.getAttribute('data-status'),
      ).toBe('void');
    });

    it('renders the description from the BE-synthesised label', async () => {
      const { element } = await setup({
        listResult: {
          kind: 'success',
          items: [invoice({ description: 'tms:pro' })],
          nextCursor: null,
        },
      });
      const row = element.querySelector(
        '[data-testid="invoice-row-in_test_001"]',
      );
      expect(row?.textContent).toContain('tms:pro');
    });

    it('formats amount with currency code (USD 49.00)', async () => {
      const { element } = await setup({
        listResult: {
          kind: 'success',
          items: [invoice({ total_cents: 4900, currency: 'usd' })],
          nextCursor: null,
        },
      });
      const row = element.querySelector(
        '[data-testid="invoice-row-in_test_001"]',
      );
      expect(row?.textContent).toMatch(/USD\s+49\.00/);
    });

    it('renders View + Download links pointing at the Stripe URLs', async () => {
      const { element } = await setup({
        listResult: {
          kind: 'success',
          items: [invoice()],
          nextCursor: null,
        },
      });
      const view = element.querySelector(
        '[data-testid="invoice-view-in_test_001"]',
      ) as HTMLAnchorElement;
      expect(view?.getAttribute('href')).toBe(
        'https://invoice.stripe.com/i/test_001',
      );
      expect(view?.getAttribute('target')).toBe('_blank');
      const download = element.querySelector(
        '[data-testid="invoice-download-in_test_001"]',
      ) as HTMLAnchorElement;
      expect(download?.getAttribute('href')).toBe(
        'https://invoice.stripe.com/i/test_001/pdf',
      );
    });

    it('renders the empty state when the BE returns no items', async () => {
      const { element } = await setup({
        listResult: { kind: 'success', items: [], nextCursor: null },
      });
      expect(element.querySelector('[data-testid="invoices-empty"]')).toBeTruthy();
      expect(
        element.querySelector('[data-testid="invoice-history-table"]'),
      ).toBeFalsy();
    });

    it('renders the error banner on unauthenticated', async () => {
      const { element } = await setup({
        listResult: { kind: 'unauthenticated' },
      });
      expect(element.querySelector('[data-testid="invoices-error"]')).toBeTruthy();
    });

    it('renders the error banner on server-error', async () => {
      const { element } = await setup({
        listResult: { kind: 'server-error' },
      });
      expect(element.querySelector('[data-testid="invoices-error"]')).toBeTruthy();
    });

    it('renders the error banner on network-error', async () => {
      const { element } = await setup({
        listResult: { kind: 'network-error' },
      });
      expect(element.querySelector('[data-testid="invoices-error"]')).toBeTruthy();
    });
  });

  describe('Manage Billing CTA', () => {
    it('renders the CTA replacing the Wave-3 Change payment button', async () => {
      const { element } = await setup();
      expect(element.querySelector('[data-testid="billing-manage-cta"]')).toBeTruthy();
      expect(
        element.querySelector('[data-testid="billing-change-payment"]'),
      ).toBeFalsy();
    });

    it('on click → createCustomerPortalSession with current origin return_url → window.location.href', async () => {
      const { element, billingMock, fixture } = await setup();
      const hrefSetter = vi.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...originalLocation,
          origin: 'http://localhost:4200',
          get href() {
            return 'http://localhost:4200/h/billing';
          },
          set href(val: string) {
            hrefSetter(val);
          },
        },
      });
      try {
        (
          element.querySelector('[data-testid="billing-manage-cta"]') as HTMLButtonElement
        ).click();
        fixture.detectChanges();
        expect(billingMock.createCustomerPortalSession).toHaveBeenCalledTimes(1);
        expect(billingMock.createCustomerPortalSession.mock.calls[0][0]).toEqual({
          return_url: 'http://localhost:4200/h/billing',
        });
        expect(hrefSetter).toHaveBeenCalledWith(
          'https://billing.stripe.com/p/session/test_xyz',
        );
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: originalLocation,
        });
      }
    });

    it('renders the no-stripe-customer banner on 422', async () => {
      const { element, fixture } = await setup({
        portalResult: { kind: 'no-stripe-customer' },
      });
      (
        element.querySelector('[data-testid="billing-manage-cta"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="billing-portal-error-no-customer"]'),
      ).toBeTruthy();
    });

    it('renders the unauthenticated banner on 401', async () => {
      const { element, fixture } = await setup({
        portalResult: { kind: 'unauthenticated' },
      });
      (
        element.querySelector('[data-testid="billing-manage-cta"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="billing-portal-error-unauthenticated"]'),
      ).toBeTruthy();
    });

    it('renders the server-error banner on 5xx', async () => {
      const { element, fixture } = await setup({
        portalResult: { kind: 'server-error' },
      });
      (
        element.querySelector('[data-testid="billing-manage-cta"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="billing-portal-error-server"]'),
      ).toBeTruthy();
    });
  });

  describe('Dunning state (live via past_due — CHO-1777)', () => {
    it('fires addonsSvc.list on construction', async () => {
      const { addonsMock } = await setup();
      expect(addonsMock.list).toHaveBeenCalledTimes(1);
    });

    it('Resolve Billing CTA hidden when no addons fetched', async () => {
      const { element } = await setup({
        addonsResult: { kind: 'success', rows: [] },
      });
      expect(element.querySelector('[data-testid="billing-resolve-cta"]')).toBeFalsy();
    });

    it('Resolve Billing CTA hidden when all addons are past_due=false', async () => {
      const { element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [addonRow({ past_due: false }), addonRow({ addon_code: 'cms', past_due: false })],
        },
      });
      expect(element.querySelector('[data-testid="billing-resolve-cta"]')).toBeFalsy();
    });

    it('Resolve Billing CTA visible when ANY active addon has past_due=true', async () => {
      const { element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [
            addonRow({ addon_code: 'tms', past_due: false }),
            addonRow({ addon_code: 'kg_hexagonal', past_due: true }),
          ],
        },
      });
      expect(element.querySelector('[data-testid="billing-resolve-cta"]')).toBeTruthy();
    });

    it('Resolve Billing CTA visible when single addon is past_due → click opens modal', async () => {
      const { fixture, element } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [addonRow({ past_due: true })],
        },
      });
      (
        element.querySelector('[data-testid="billing-resolve-cta"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const modal = element.querySelector('[data-testid="billing-resolve-modal"]');
      expect(modal).toBeTruthy();
      expect(modal?.getAttribute('role')).toBe('dialog');
      expect(modal?.getAttribute('aria-modal')).toBe('true');
    });

    it('Confirm in dunning modal opens Stripe Customer Portal (NOT local-clear)', async () => {
      const { fixture, element, billingMock } = await setup({
        addonsResult: {
          kind: 'success',
          rows: [addonRow({ past_due: true })],
        },
      });
      const hrefSetter = vi.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...originalLocation,
          origin: 'http://localhost:4200',
          get href() {
            return 'http://localhost:4200/h/billing';
          },
          set href(val: string) {
            hrefSetter(val);
          },
        },
      });
      try {
        (
          element.querySelector('[data-testid="billing-resolve-cta"]') as HTMLButtonElement
        ).click();
        fixture.detectChanges();
        (
          element.querySelector('[data-testid="billing-resolve-confirm"]') as HTMLButtonElement
        ).click();
        fixture.detectChanges();
        // Modal closes after Confirm.
        expect(
          element.querySelector('[data-testid="billing-resolve-modal"]'),
        ).toBeFalsy();
        // Stripe Customer Portal session minted.
        expect(billingMock.createCustomerPortalSession).toHaveBeenCalledTimes(1);
        expect(hrefSetter).toHaveBeenCalledWith(
          'https://billing.stripe.com/p/session/test_xyz',
        );
        // Banner stays visible — BE clears past_due via the webhook + the
        // next /h/addons fetch removes it. Local state MUST NOT clear.
        expect(
          element.querySelector('[data-testid="billing-resolve-cta"]'),
        ).toBeTruthy();
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: originalLocation,
        });
      }
    });
  });

  describe('Accessibility', () => {
    it('all buttons have an accessible name', async () => {
      const { element } = await setup();
      const buttons = Array.from(element.querySelectorAll('button'));
      for (const btn of buttons) {
        const hasText = (btn.textContent ?? '').trim().length > 0;
        const hasAria =
          btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby');
        expect(hasText || hasAria).toBe(true);
      }
    });

    it('invoice history table has a caption when rendered', async () => {
      const { element } = await setup({
        listResult: {
          kind: 'success',
          items: [invoice()],
          nextCursor: null,
        },
      });
      const caption = element.querySelector(
        'table[data-testid="invoice-history-table"] caption',
      );
      expect(caption).toBeTruthy();
    });
  });
});
