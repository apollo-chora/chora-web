/**
 * AddonMarketplaceCatalogDetailComponent spec — CHO-1735 PR 2.
 *
 * Mocks `TenantAddonsAdminService.getMarketplaceDetail` + `ActivatedRoute`
 * snapshot to render the various states. Strict TDD per
 * chora/.claude/rules/development-execution.md.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AddonMarketplaceCatalogDetailComponent } from './addon-marketplace-catalog-detail.component';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type {
  ActivateAddonResult,
  MarketplaceAddonDetail,
  MarketplaceCheckoutResult,
  MarketplaceDetailResult,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

const PLAN_ID = '019e0000-0000-7000-8000-cccccccccccc';

type GetMarketplaceDetailFn =
  (typeof TenantAddonsAdminService.prototype)['getMarketplaceDetail'];
type CreateCheckoutSessionFn =
  (typeof TenantAddonsAdminService.prototype)['createCheckoutSession'];
type ActivateAddonFn =
  (typeof TenantAddonsAdminService.prototype)['activateAddon'];

function makeDetail(overrides: Partial<MarketplaceAddonDetail> = {}): MarketplaceAddonDetail {
  return {
    addon_plan_id: PLAN_ID,
    code: 'knowledge_graph',
    display_name: 'Knowledge Graph',
    category: 'learning',
    description: 'Per-user knowledge mapping',
    entitlements: [
      { feature_code: 'kg.cluster.max', label: 'Max clusters', limit: 3, limit_unit: 'clusters' },
    ],
    integrations: [
      { type: 'vertex_ai', label: 'Vertex AI Search', status: 'available' },
    ],
    compliance: { gdpr: true, pdpa: true, ccpa: false, imda: true, data_residency_regions: ['asia-southeast1'] },
    pricing_tiers: [
      { tier_code: 'pro', label: 'Pro', monthly_price_cents: 4900, currency: 'SGD' },
    ],
    ...overrides,
  };
}

interface SetupOpts {
  readonly checkoutResult?: MarketplaceCheckoutResult;
  readonly queryCheckout?: 'success' | 'cancel';
  readonly activateResult?: ActivateAddonResult;
}

function setup(
  result: MarketplaceDetailResult,
  opts: SetupOpts = {},
): {
  fixture: ComponentFixture<AddonMarketplaceCatalogDetailComponent>;
  getMarketplaceDetail: ReturnType<typeof vi.fn<GetMarketplaceDetailFn>>;
  createCheckoutSession: ReturnType<typeof vi.fn<CreateCheckoutSessionFn>>;
  activateAddon: ReturnType<typeof vi.fn<ActivateAddonFn>>;
  toastShow: ReturnType<typeof vi.fn<(key: string, kind: string, ms?: number) => string>>;
} {
  const getMarketplaceDetail = vi.fn<GetMarketplaceDetailFn>(() => of(result));
  const createCheckoutSession = vi.fn<CreateCheckoutSessionFn>(() =>
    of(
      opts.checkoutResult ?? {
        kind: 'success',
        stripeCheckoutUrl: 'https://checkout.stripe.com/c/pay/cs_default',
        purchaseId: 'pur_default',
      },
    ),
  );
  const activateAddon = vi.fn<ActivateAddonFn>(() => of(opts.activateResult ?? { kind: 'success' }));
  const toastShow = vi.fn((_key: string, _kind: string, _ms?: number): string => 'toast-1');
  const queryRecord: Record<string, string> = {};
  if (opts.queryCheckout) {
    queryRecord['checkout'] = opts.queryCheckout;
  }
  TestBed.configureTestingModule({
    imports: [AddonMarketplaceCatalogDetailComponent],
    providers: [
      provideRouter([]),
      {
        provide: TenantAddonsAdminService,
        useValue: { getMarketplaceDetail, createCheckoutSession, activateAddon },
      },
      { provide: ToastService, useValue: { show: toastShow } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ addonPlanId: PLAN_ID }),
            queryParamMap: convertToParamMap(queryRecord),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AddonMarketplaceCatalogDetailComponent);
  fixture.detectChanges();
  return { fixture, getMarketplaceDetail, createCheckoutSession, activateAddon, toastShow };
}

function makeFreeDetail(): MarketplaceAddonDetail {
  return makeDetail({
    pricing_tiers: [
      { tier_code: 'default', label: 'Default', monthly_price_cents: 0, currency: 'USD' },
    ],
  });
}

describe('AddonMarketplaceCatalogDetailComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('success path — not installed', () => {
    let fixture: ComponentFixture<AddonMarketplaceCatalogDetailComponent>;
    let element: HTMLElement;

    beforeEach(() => {
      ({ fixture } = setup({
        kind: 'success',
        detail: makeDetail({ is_installed: false }),
      }));
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the display_name + code', () => {
      const title = element.querySelector('[data-testid="catalog-detail-title"]') as HTMLElement;
      expect(title.textContent ?? '').toContain('Knowledge Graph');
      expect(title.textContent ?? '').toContain('knowledge_graph');
    });

    it('does NOT render the Installed badge when is_installed=false', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-installed-badge"]'),
      ).toBeFalsy();
    });

    it('renders the Subscribe CTA when is_installed=false', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-subscribe"]'),
      ).toBeTruthy();
    });


    it('renders the entitlement row', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-entitlement-kg.cluster.max"]'),
      ).toBeTruthy();
    });

    it('renders the integration row', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-integration-vertex_ai"]'),
      ).toBeTruthy();
    });

    it('renders the four compliance pills', () => {
      ['gdpr', 'pdpa', 'ccpa', 'imda'].forEach((k) => {
        expect(
          element.querySelector(`[data-testid="catalog-detail-compliance-${k}"]`),
        ).toBeTruthy();
      });
    });

    it('renders the residency region chips', () => {
      const regions = element.querySelector(
        '[data-testid="catalog-detail-residency-regions"]',
      );
      expect(regions?.textContent ?? '').toContain('asia-southeast1');
    });

    it('renders the pricing tier card', () => {
      const tier = element.querySelector('[data-testid="catalog-detail-tier-pro"]');
      expect(tier?.textContent ?? '').toContain('SGD 49.00/mo');
    });
  });

  describe('success path — installed', () => {
    let fixture: ComponentFixture<AddonMarketplaceCatalogDetailComponent>;
    let element: HTMLElement;

    beforeEach(() => {
      ({ fixture } = setup({
        kind: 'success',
        detail: makeDetail({ is_installed: true }),
      }));
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the Installed badge when is_installed=true', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-installed-badge"]'),
      ).toBeTruthy();
    });

    it('does NOT render the Subscribe CTA when is_installed=true', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-subscribe"]'),
      ).toBeFalsy();
    });

    it('renders the Manage CTA pointing back to /h/addons', () => {
      const manage = element.querySelector(
        '[data-testid="catalog-detail-manage"]',
      ) as HTMLAnchorElement;
      expect(manage).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1780 — pending end-of-cycle tier change badge on the marketplace
  // detail page. Mirrors the addon-management tile badge from PR #91 so
  // the user sees the same affordance everywhere the subscription shows
  // up.
  // -------------------------------------------------------------------------

  describe('scheduled-tier badge (CHO-1780)', () => {
    it('renders the badge when current_subscription has both scheduled fields', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({
          is_installed: true,
          current_subscription: {
            activated_at: '2026-06-17T12:00:00Z',
            current_tier: 'starter',
            status: 'ACTIVE',
            scheduled_tier_code: 'pro',
            scheduled_effective_at: '2026-07-17T00:00:00Z',
          },
        }),
      });
      const element = fixture.nativeElement as HTMLElement;
      const badge = element.querySelector(
        '[data-testid="catalog-detail-scheduled-badge"]',
      ) as HTMLElement | null;
      expect(badge).toBeTruthy();
      const text = badge?.textContent ?? '';
      expect(text).toContain('pro');
      expect(text).toContain('2026-07-17');
    });

    it('does NOT render the badge when current_subscription is absent', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({ is_installed: true }),
      });
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="catalog-detail-scheduled-badge"]'),
      ).toBeFalsy();
    });

    it('does NOT render the badge when only one of the two scheduled fields is populated', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({
          is_installed: true,
          current_subscription: {
            activated_at: '2026-06-17T12:00:00Z',
            current_tier: 'starter',
            status: 'ACTIVE',
            scheduled_tier_code: 'pro',
            // scheduled_effective_at omitted on purpose.
          },
        }),
      });
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="catalog-detail-scheduled-badge"]'),
      ).toBeFalsy();
    });
  });

  // CHO-1782 — destructive parallel: when the install is in PENDING_DEACTIVATION
  // the catalog detail panel renders the amber "Deactivating <date>" pill so
  // the admin sees the end-of-cycle teardown from the marketplace too.
  describe('deactivating badge (CHO-1782)', () => {
    it('renders the badge when current_subscription has status PENDING_DEACTIVATION + date', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({
          is_installed: true,
          current_subscription: {
            activated_at: '2026-06-17T12:00:00Z',
            current_tier: 'starter',
            status: 'PENDING_DEACTIVATION',
            deactivation_effective_at: '2026-07-17T00:00:00Z',
            deactivation_reason: 'cost',
          },
        }),
      });
      const element = fixture.nativeElement as HTMLElement;
      const badge = element.querySelector(
        '[data-testid="catalog-detail-deactivating-badge"]',
      ) as HTMLElement | null;
      expect(badge).toBeTruthy();
      expect(badge?.textContent ?? '').toContain('2026-07-17');
    });

    it('does NOT render the badge when current_subscription is absent', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({ is_installed: true }),
      });
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="catalog-detail-deactivating-badge"]'),
      ).toBeFalsy();
    });

    it('does NOT render the badge when status is ACTIVE even if date is populated', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({
          is_installed: true,
          current_subscription: {
            activated_at: '2026-06-17T12:00:00Z',
            current_tier: 'starter',
            status: 'ACTIVE',
            deactivation_effective_at: '2026-07-17T00:00:00Z',
          },
        }),
      });
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="catalog-detail-deactivating-badge"]'),
      ).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1749 / CHO-1745 Sub 4 — system plan affordance suppression
  //
  // Always-on baseline plans (the BE `system: true` flag — `base` today)
  // must NOT render Subscribe / Activate Free. The detail screen shows the
  // `Included for all tenants` badge + hint, and routes users to the
  // management surface via the Manage CTA. The BE 400s
  // (`cannot_unsubscribe_base`, `amount_cents > 0`) remain the
  // authorisation boundary; this is the affordance gate.
  //
  // Also: the new `installed` field (CHO-1747) is exercised alongside
  // the legacy `is_installed` so the FE works against both the canonical
  // contract and the transitional alias.
  // -------------------------------------------------------------------------

  describe('system path (CHO-1749)', () => {
    let fixture: ComponentFixture<AddonMarketplaceCatalogDetailComponent>;
    let element: HTMLElement;

    beforeEach(() => {
      ({ fixture } = setup({
        kind: 'success',
        detail: makeDetail({
          code: 'base',
          display_name: 'Chora Base',
          system: true,
          installed: true,
          // Free-tier addon shape but system=true must suppress
          // Activate Free anyway.
          pricing_tiers: [
            { tier_code: 'core', label: 'Core', monthly_price_cents: 0, currency: 'SGD' },
          ],
        }),
      }));
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the system badge when system=true', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-system-badge"]'),
      ).toBeTruthy();
    });

    it('does NOT render the Subscribe CTA when system=true', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-subscribe"]'),
      ).toBeFalsy();
    });

    it('does NOT render the Activate Free CTA when system=true (even for $0 plans)', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-activate-free"]'),
      ).toBeFalsy();
    });

    it('renders the Manage CTA when system=true', () => {
      expect(
        element.querySelector('[data-testid="catalog-detail-manage"]'),
      ).toBeTruthy();
    });
  });

  describe('installed field (CHO-1747 canonical alias)', () => {
    it('treats `installed: true` (no legacy is_installed) as installed', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({ installed: true }),
      });
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="catalog-detail-installed-badge"]'),
      ).toBeTruthy();
      expect(
        el.querySelector('[data-testid="catalog-detail-subscribe"]'),
      ).toBeFalsy();
      expect(
        el.querySelector('[data-testid="catalog-detail-manage"]'),
      ).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1755 — Tier picker on the marketplace detail screen.
  //
  // Before this story the Subscribe CTA hard-coded `pricing_tiers[0]`, so
  // every paid addon was funneled into its cheapest tier — no way for the
  // tenant admin to pick Pro / Enterprise / etc. without subscribing first
  // and then using the post-subscribe ChangeTier flow.
  //
  // Now: when more than one tier is offered, render selectable radio cards
  // keyed by `tier_code`, default to `[0]`, and have Subscribe honour the
  // current selection. Single-tier addons stay unchanged (no chrome).
  // -------------------------------------------------------------------------

  describe('tier picker (CHO-1755)', () => {
    const tmsDetail = (overrides: Partial<MarketplaceAddonDetail> = {}) =>
      makeDetail({
        code: 'tms',
        display_name: 'Training Management Suite',
        pricing_tiers: [
          { tier_code: 'starter', label: 'Starter', monthly_price_cents: 1900, currency: 'SGD' },
          { tier_code: 'pro', label: 'Pro', monthly_price_cents: 4900, currency: 'SGD' },
          { tier_code: 'enterprise', label: 'Enterprise', monthly_price_cents: 19900, currency: 'SGD' },
        ],
        ...overrides,
      });

    it('renders a radio card per tier when pricing_tiers.length > 1', () => {
      const { fixture } = setup({ kind: 'success', detail: tmsDetail() });
      const el = fixture.nativeElement as HTMLElement;
      for (const code of ['starter', 'pro', 'enterprise']) {
        expect(
          el.querySelector(`[data-testid="catalog-detail-tier-radio-${code}"]`),
          `tier radio for ${code}`,
        ).toBeTruthy();
      }
    });

    it('defaults the selected tier to pricing_tiers[0]', () => {
      const { fixture } = setup({ kind: 'success', detail: tmsDetail() });
      const el = fixture.nativeElement as HTMLElement;
      const starterCard = el.querySelector(
        '[data-testid="catalog-detail-tier-radio-starter"]',
      );
      expect(starterCard?.getAttribute('aria-checked')).toBe('true');
      const proCard = el.querySelector(
        '[data-testid="catalog-detail-tier-radio-pro"]',
      );
      expect(proCard?.getAttribute('aria-checked')).toBe('false');
    });

    it('clicking a different tier card flips aria-checked', () => {
      const { fixture } = setup({ kind: 'success', detail: tmsDetail() });
      const el = fixture.nativeElement as HTMLElement;
      const proCard = el.querySelector(
        '[data-testid="catalog-detail-tier-radio-pro"]',
      ) as HTMLElement;
      proCard.click();
      fixture.detectChanges();
      expect(proCard.getAttribute('aria-checked')).toBe('true');
      expect(
        el.querySelector('[data-testid="catalog-detail-tier-radio-starter"]')
          ?.getAttribute('aria-checked'),
      ).toBe('false');
    });

    it('Subscribe sends the SELECTED tier_code / price / currency to createCheckoutSession', () => {
      const { fixture, createCheckoutSession } = setup({
        kind: 'success',
        detail: tmsDetail(),
      });
      const el = fixture.nativeElement as HTMLElement;
      // Pick Enterprise.
      (
        el.querySelector(
          '[data-testid="catalog-detail-tier-radio-enterprise"]',
        ) as HTMLElement
      ).click();
      fixture.detectChanges();
      (
        el.querySelector('[data-testid="catalog-detail-subscribe"]') as HTMLButtonElement
      ).click();
      const arg = createCheckoutSession.mock.calls[0][0];
      expect(arg.tierCode).toBe('enterprise');
      expect(arg.amountCents).toBe(19900);
      expect(arg.currency).toBe('SGD');
    });

    it('single-tier addons render NO radio chrome', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail(), // default fixture has just one tier (`pro`)
      });
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="catalog-detail-tier-radio-pro"]'),
      ).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1757 — preserve the tenant's actual tier across the Stripe redirect.
  //
  // Stripe Checkout `?checkout=success` returns to a fresh component with
  // `selectedTier=''`; before this story the constructor effect always
  // re-defaulted to `pricing_tiers[0]`, so a tenant who paid for Pro saw
  // Starter highlighted until they navigated away. Two fixes:
  //   1. When the BFF emits `current_tier` (only when installed) the effect
  //      seeds `selectedTier` from it instead of `[0]`.
  //   2. When `installed === true` the radio chrome is suppressed entirely —
  //      the Manage CTA routes to /change-tier, so there's nothing to pick.
  // -------------------------------------------------------------------------

  describe('current_tier preservation (CHO-1757)', () => {
    const tmsDetailMultiTier = (overrides: Partial<MarketplaceAddonDetail> = {}) =>
      makeDetail({
        code: 'tms',
        display_name: 'Training Management Suite',
        pricing_tiers: [
          { tier_code: 'starter', label: 'Starter', monthly_price_cents: 1900, currency: 'SGD' },
          { tier_code: 'pro', label: 'Pro', monthly_price_cents: 4900, currency: 'SGD' },
          { tier_code: 'enterprise', label: 'Enterprise', monthly_price_cents: 19900, currency: 'SGD' },
        ],
        ...overrides,
      });

    it('hides the radio chrome when the addon is installed (multi-tier)', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: tmsDetailMultiTier({ installed: true, current_tier: 'pro' }),
      });
      const el = fixture.nativeElement as HTMLElement;
      for (const code of ['starter', 'pro', 'enterprise']) {
        expect(
          el.querySelector(`[data-testid="catalog-detail-tier-radio-${code}"]`),
          `no radio chrome for ${code} when installed`,
        ).toBeNull();
      }
      // Read-only listitem fall-through is still rendered for visibility.
      expect(
        el.querySelector('[data-testid="catalog-detail-tier-pro"]'),
      ).toBeTruthy();
    });

    it('seeds selectedTier from detail.current_tier when present and valid', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: tmsDetailMultiTier({ installed: true, current_tier: 'pro' }),
      });
      expect(fixture.componentInstance.selectedTier()).toBe('pro');
    });

    it('falls back to pricing_tiers[0] when current_tier is omitted (Subscribe golden path)', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: tmsDetailMultiTier(),
      });
      expect(fixture.componentInstance.selectedTier()).toBe('starter');
    });

    it('falls back to pricing_tiers[0] when current_tier is not in pricing_tiers (stale row)', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: tmsDetailMultiTier({ current_tier: 'legacy_gold' }),
      });
      expect(fixture.componentInstance.selectedTier()).toBe('starter');
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1758 — read-only tier cards visually mark the installed tier.
  //
  // CHO-1757 hid the radio chrome when isInstalled() but the fall-through
  // listitem cards rendered with no current-tier indicator — Starter /
  // Pro / Enterprise all looked the same after install. This story reuses
  // the existing CHO-1756 `--selected` SCSS treatment (blue border + tint
  // + ✓ checkmark) on the installed tier's read-only card.
  // -------------------------------------------------------------------------

  describe('current tier highlight (CHO-1758)', () => {
    const tmsDetailMultiTier = (overrides: Partial<MarketplaceAddonDetail> = {}) =>
      makeDetail({
        code: 'tms',
        display_name: 'Training Management Suite',
        pricing_tiers: [
          { tier_code: 'starter', label: 'Starter', monthly_price_cents: 1900, currency: 'SGD' },
          { tier_code: 'pro', label: 'Pro', monthly_price_cents: 4900, currency: 'SGD' },
          { tier_code: 'enterprise', label: 'Enterprise', monthly_price_cents: 19900, currency: 'SGD' },
        ],
        ...overrides,
      });

    it('marks the current-tier read-only card with --selected when installed', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: tmsDetailMultiTier({ installed: true, current_tier: 'pro' }),
      });
      const el = fixture.nativeElement as HTMLElement;
      const proCard = el.querySelector(
        '[data-testid="catalog-detail-tier-pro"]',
      ) as HTMLElement;
      expect(proCard.classList.contains('catalog-detail__tier--selected')).toBe(true);
      const starterCard = el.querySelector(
        '[data-testid="catalog-detail-tier-starter"]',
      ) as HTMLElement;
      expect(starterCard.classList.contains('catalog-detail__tier--selected')).toBe(false);
      const entCard = el.querySelector(
        '[data-testid="catalog-detail-tier-enterprise"]',
      ) as HTMLElement;
      expect(entCard.classList.contains('catalog-detail__tier--selected')).toBe(false);
    });

    it('does NOT apply --selected to any read-only card when not installed', () => {
      const { fixture } = setup({ kind: 'success', detail: makeDetail() });
      const el = fixture.nativeElement as HTMLElement;
      const proCard = el.querySelector(
        '[data-testid="catalog-detail-tier-pro"]',
      ) as HTMLElement;
      expect(proCard.classList.contains('catalog-detail__tier--selected')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1755 — Manage CTA targets the change-tier surface directly.
  // -------------------------------------------------------------------------

  describe('Manage CTA target (CHO-1755)', () => {
    it('routes to /h/addons/<planId>/change-tier (not /h/addons)', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({ installed: true }),
      });
      const el = fixture.nativeElement as HTMLElement;
      const manage = el.querySelector(
        '[data-testid="catalog-detail-manage"]',
      ) as HTMLAnchorElement;
      expect(manage).toBeTruthy();
      // The Angular router-link directive computes the href asynchronously
      // in tests; checking the routerLink input is the reliable assertion.
      expect(manage.getAttribute('href')).toContain(
        `/h/addons/${PLAN_ID}/change-tier`,
      );
    });
  });

  describe('error + empty states', () => {
    it('renders not-found when the BFF returns 404', () => {
      const { fixture } = setup({ kind: 'not-found' });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="catalog-detail-not-found"]')).toBeTruthy();
    });

    it('renders the unauthenticated banner on 401', () => {
      const { fixture } = setup({ kind: 'unauthenticated' });
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="catalog-detail-unauthenticated"]'),
      ).toBeTruthy();
    });

    it('renders the generic load-error banner on server-error', () => {
      const { fixture } = setup({ kind: 'server-error' });
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="catalog-detail-load-error"]'),
      ).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1741 — Subscribe → Stripe Checkout redirect + return handling.
  // -------------------------------------------------------------------------
  describe('Subscribe → checkout (CHO-1741)', () => {
    it('clicking Subscribe calls createCheckoutSession with the first pricing tier', () => {
      const { fixture, createCheckoutSession } = setup({
        kind: 'success',
        detail: makeDetail({ is_installed: false }),
      });
      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector(
        '[data-testid="catalog-detail-subscribe"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(createCheckoutSession).toHaveBeenCalledTimes(1);
      const arg = createCheckoutSession.mock.calls[0][0];
      expect(arg.addonPlanId).toBe(PLAN_ID);
      expect(arg.addonCode).toBe('knowledge_graph');
      expect(arg.tierCode).toBe('pro');
      expect(arg.amountCents).toBe(4900);
      expect(arg.currency).toBe('SGD');
    });

    it('on success, redirects window.location.href to the Stripe URL', () => {
      const { fixture } = setup(
        { kind: 'success', detail: makeDetail({ is_installed: false }) },
        {
          checkoutResult: {
            kind: 'success',
            stripeCheckoutUrl: 'https://checkout.stripe.com/c/pay/cs_xyz',
            purchaseId: 'pur_xyz',
          } as MarketplaceCheckoutResult,
        },
      );
      const el = fixture.nativeElement as HTMLElement;
      // Some test envs (happy-dom / JSDOM hardened mode) ignore raw
      // `window.location.href = ...` assignments. Stub the location
      // object with a writable plain object so the assignment is
      // observable for the assertion.
      const originalLocation = window.location;
      const stub: { href: string } = { href: '' };
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: stub,
      });
      try {
        const btn = el.querySelector(
          '[data-testid="catalog-detail-subscribe"]',
        ) as HTMLButtonElement;
        btn.click();
        expect(stub.href).toBe('https://checkout.stripe.com/c/pay/cs_xyz');
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: originalLocation,
        });
      }
    });

    it('on validation-error, shows the validation toast', () => {
      const { fixture, toastShow } = setup(
        { kind: 'success', detail: makeDetail({ is_installed: false }) },
        {
          checkoutResult: { kind: 'validation-error' } as MarketplaceCheckoutResult,
        },
      );
      const el = fixture.nativeElement as HTMLElement;
      (
        el.querySelector('[data-testid="catalog-detail-subscribe"]') as HTMLButtonElement
      ).click();
      expect(toastShow).toHaveBeenCalledWith(
        'hplus.marketplace.detail.subscribeFailed.validation',
        'error',
      );
    });

    it('on payments-down, shows the payments-down toast', () => {
      const { fixture, toastShow } = setup(
        { kind: 'success', detail: makeDetail({ is_installed: false }) },
        {
          checkoutResult: { kind: 'payments-down' } as MarketplaceCheckoutResult,
        },
      );
      const el = fixture.nativeElement as HTMLElement;
      (
        el.querySelector('[data-testid="catalog-detail-subscribe"]') as HTMLButtonElement
      ).click();
      expect(toastShow).toHaveBeenCalledWith(
        'hplus.marketplace.detail.subscribeFailed.paymentsDown',
        'error',
      );
    });

    it('disables the Subscribe button while in flight', () => {
      // Use a never-completing observable so subscribeInFlight stays true.
      const createCheckoutSession = vi.fn(() => ({
        subscribe: () => ({ unsubscribe: () => undefined }),
      })) as unknown as CreateCheckoutSessionFn;
      const toastShow = vi.fn((_key: string, _kind: string, _ms?: number): string => 'toast-1');
      const getMarketplaceDetail = vi.fn(() =>
        of({
          kind: 'success' as const,
          detail: makeDetail({ is_installed: false }),
        }),
      ) as unknown as GetMarketplaceDetailFn;
      TestBed.configureTestingModule({
        imports: [AddonMarketplaceCatalogDetailComponent],
        providers: [
          provideRouter([]),
          {
            provide: TenantAddonsAdminService,
            useValue: { getMarketplaceDetail, createCheckoutSession },
          },
          { provide: ToastService, useValue: { show: toastShow } },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                paramMap: convertToParamMap({ addonPlanId: PLAN_ID }),
                queryParamMap: convertToParamMap({}),
              },
            },
          },
        ],
      });
      const local = TestBed.createComponent(AddonMarketplaceCatalogDetailComponent);
      local.detectChanges();
      const el = local.nativeElement as HTMLElement;
      const btn = el.querySelector(
        '[data-testid="catalog-detail-subscribe"]',
      ) as HTMLButtonElement;
      btn.click();
      local.detectChanges();
      expect(btn.disabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1741 — Post-checkout return (`?checkout=success` / `?checkout=cancel`).
  // -------------------------------------------------------------------------
  describe('post-checkout return (CHO-1741)', () => {
    it('on ?checkout=cancel, shows the cancellation toast', () => {
      const { toastShow } = setup(
        { kind: 'success', detail: makeDetail({ is_installed: false }) },
        { queryCheckout: 'cancel' },
      );
      expect(toastShow).toHaveBeenCalledWith(
        'hplus.marketplace.detail.subscribeCancelled',
        'info',
      );
    });

    it('on ?checkout=success, does NOT show the cancel toast', () => {
      const { toastShow } = setup(
        { kind: 'success', detail: makeDetail({ is_installed: false }) },
        { queryCheckout: 'success' },
      );
      expect(toastShow).not.toHaveBeenCalledWith(
        'hplus.marketplace.detail.subscribeCancelled',
        'info',
      );
    });

    it('without ?checkout, does NOT trigger any subscribe toast', () => {
      const { toastShow } = setup({
        kind: 'success',
        detail: makeDetail({ is_installed: false }),
      });
      // Only the initial render — no Subscribe toasts.
      const toastCalls = toastShow.mock.calls
        .map((c) => c[0])
        .filter((k) => k.startsWith('hplus.marketplace.detail.subscribe'));
      expect(toastCalls).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1742 — Activate-Free path for $0 tiles.
  // -------------------------------------------------------------------------
  describe('Activate-Free CTA (CHO-1742)', () => {
    it('renders Activate Free button (not Subscribe) when the first tier is $0', () => {
      const { fixture } = setup({ kind: 'success', detail: makeFreeDetail() });
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="catalog-detail-activate-free"]'),
      ).toBeTruthy();
      expect(
        el.querySelector('[data-testid="catalog-detail-subscribe"]'),
      ).toBeFalsy();
    });

    it('renders Subscribe (not Activate Free) when the first tier is paid', () => {
      const { fixture } = setup({
        kind: 'success',
        detail: makeDetail({ is_installed: false }),
      });
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="catalog-detail-subscribe"]'),
      ).toBeTruthy();
      expect(
        el.querySelector('[data-testid="catalog-detail-activate-free"]'),
      ).toBeFalsy();
    });

    it('clicking Activate Free calls activateAddon with the plan id', () => {
      const { fixture, activateAddon } = setup({
        kind: 'success',
        detail: makeFreeDetail(),
      });
      const el = fixture.nativeElement as HTMLElement;
      (
        el.querySelector('[data-testid="catalog-detail-activate-free"]') as HTMLButtonElement
      ).click();
      expect(activateAddon).toHaveBeenCalledTimes(1);
      expect(activateAddon.mock.calls[0][0]).toBe(PLAN_ID);
    });

    it('on success, flips Installed badge + shows activated toast', () => {
      const { fixture, toastShow } = setup(
        { kind: 'success', detail: makeFreeDetail() },
        { activateResult: { kind: 'success' } as ActivateAddonResult },
      );
      const el = fixture.nativeElement as HTMLElement;
      (
        el.querySelector('[data-testid="catalog-detail-activate-free"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      // Installed badge now visible.
      expect(
        el.querySelector('[data-testid="catalog-detail-installed-badge"]'),
      ).toBeTruthy();
      // Activate Free button hidden (Installed branch wins).
      expect(
        el.querySelector('[data-testid="catalog-detail-activate-free"]'),
      ).toBeFalsy();
      expect(toastShow).toHaveBeenCalledWith(
        'hplus.marketplace.detail.activateFreeActivated',
        'success',
      );
    });

    it('on not-found, shows the notFound toast', () => {
      const { fixture, toastShow } = setup(
        { kind: 'success', detail: makeFreeDetail() },
        { activateResult: { kind: 'not-found' } as ActivateAddonResult },
      );
      const el = fixture.nativeElement as HTMLElement;
      (
        el.querySelector('[data-testid="catalog-detail-activate-free"]') as HTMLButtonElement
      ).click();
      expect(toastShow).toHaveBeenCalledWith(
        'hplus.marketplace.detail.activateFreeFailed.notFound',
        'error',
      );
    });

    it('on server-error, shows the serverError toast', () => {
      const { fixture, toastShow } = setup(
        { kind: 'success', detail: makeFreeDetail() },
        { activateResult: { kind: 'server-error' } as ActivateAddonResult },
      );
      const el = fixture.nativeElement as HTMLElement;
      (
        el.querySelector('[data-testid="catalog-detail-activate-free"]') as HTMLButtonElement
      ).click();
      expect(toastShow).toHaveBeenCalledWith(
        'hplus.marketplace.detail.activateFreeFailed.serverError',
        'error',
      );
    });

    it('disables the Activate Free button while in flight', () => {
      // Never-completing observable keeps activateInFlight=true.
      const activateAddon = vi.fn(() => ({
        subscribe: () => ({ unsubscribe: () => undefined }),
      })) as unknown as ActivateAddonFn;
      const toastShow = vi.fn((_key: string, _kind: string, _ms?: number): string => 'toast-1');
      const getMarketplaceDetail = vi.fn(() =>
        of({ kind: 'success' as const, detail: makeFreeDetail() }),
      ) as unknown as GetMarketplaceDetailFn;
      const createCheckoutSession = vi.fn() as unknown as CreateCheckoutSessionFn;
      TestBed.configureTestingModule({
        imports: [AddonMarketplaceCatalogDetailComponent],
        providers: [
          provideRouter([]),
          {
            provide: TenantAddonsAdminService,
            useValue: { getMarketplaceDetail, createCheckoutSession, activateAddon },
          },
          { provide: ToastService, useValue: { show: toastShow } },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                paramMap: convertToParamMap({ addonPlanId: PLAN_ID }),
                queryParamMap: convertToParamMap({}),
              },
            },
          },
        ],
      });
      const local = TestBed.createComponent(AddonMarketplaceCatalogDetailComponent);
      local.detectChanges();
      const el = local.nativeElement as HTMLElement;
      const btn = el.querySelector(
        '[data-testid="catalog-detail-activate-free"]',
      ) as HTMLButtonElement;
      btn.click();
      local.detectChanges();
      expect(btn.disabled).toBe(true);
    });
  });
});
