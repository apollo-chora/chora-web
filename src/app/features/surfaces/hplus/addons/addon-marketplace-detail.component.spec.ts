/**
 * H+ Add-on Marketplace Tile Detail spec (CHO-1734 STITCH-H-ADD-5 —
 * the FINAL sub-story closing epic CHO-1697).
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE the component exists. Compile must fail with
 * "Cannot find module './addon-marketplace-detail.component'".
 *
 * Drives the screen through TestBed against a TenantAddonsAdminService
 * mock + an ActivatedRoute stub. Asserts:
 *   - Hydration on mount via service.getDetail(planId from route).
 *   - Render: title (display_name + code), category badge, back link,
 *     description, entitlements list, integrations matrix, compliance
 *     pills × 4, pricing-tier cards with current-tier highlight,
 *     subscription snapshot block when subscribed.
 *   - CTA: Manage link visible when subscribed; "Install coming soon"
 *     copy when current_subscription is null/missing.
 *   - 404 → "Not currently subscribed" empty state.
 *   - Loading + server-error + unauthenticated banners.
 *
 * Lesson from Dale's CHO-1694 catch: every `vi.fn()` mock param gets
 * an explicit typed signature so `mock.calls[0][0]` is the real tuple
 * (no TS2493 risk).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';

import { AddonMarketplaceDetailComponent } from './addon-marketplace-detail.component';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import type {
  AddOnDetail,
  AddonDetailResult,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

const PLAN_ID = '019e0000-0000-7000-8000-bbbbbbbbbbbb';

const subscribedDetail: AddOnDetail = {
  addon_plan_id: PLAN_ID,
  code: 'familiar',
  display_name: 'Familiar',
  category: 'AI',
  description: 'Companion AI add-on for learning sessions.',
  entitlements: [
    { feature_code: 'gemma_lora', label: 'Per-tenant LoRA', limit: null },
    {
      feature_code: 'mcp_gateway',
      label: 'MCP Gateway',
      limit: 100,
      limit_unit: 'connections',
    },
  ],
  integrations: [
    { type: 'webhook', label: 'Webhooks', status: 'configured' },
    { type: 'oauth_app', label: 'OAuth Apps', status: 'available' },
  ],
  compliance: {
    gdpr: true,
    pdpa: true,
    ccpa: false,
    imda: true,
    data_residency_regions: ['SG', 'EU'],
  },
  pricing_tiers: [
    {
      tier_code: 'starter',
      label: 'Starter',
      monthly_price_cents: 999,
      currency: 'SGD',
      included_units: 1000,
    },
    {
      tier_code: 'pro',
      label: 'Pro',
      monthly_price_cents: 2400,
      currency: 'SGD',
      included_units: 10000,
      overage_unit_cents: 5,
    },
  ],
  current_subscription: {
    activated_at: '2026-06-08T00:00:00Z',
    current_tier: 'pro',
    status: 'ACTIVE',
    next_renewal_at: '2026-07-08T00:00:00Z',
    billing_cycle: 'MONTHLY',
  },
};

const browseDetail: AddOnDetail = {
  ...subscribedDetail,
  current_subscription: null,
};

function makeServiceMock(opts: { result?: AddonDetailResult } = {}) {
  return {
    getDetail: vi.fn(
      (_planId: string): Observable<AddonDetailResult> =>
        of(opts.result ?? ({ kind: 'success', detail: subscribedDetail } as AddonDetailResult)),
    ),
  };
}

async function setup(opts: { result?: AddonDetailResult } = {}): Promise<{
  fixture: ComponentFixture<AddonMarketplaceDetailComponent>;
  component: AddonMarketplaceDetailComponent;
  element: HTMLElement;
  serviceMock: ReturnType<typeof makeServiceMock>;
}> {
  const serviceMock = makeServiceMock(opts);
  await TestBed.configureTestingModule({
    imports: [AddonMarketplaceDetailComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TenantAddonsAdminService, useValue: serviceMock },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (k: string) => (k === 'addonPlanId' ? PLAN_ID : null) } },
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AddonMarketplaceDetailComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, component, element, serviceMock };
}

describe('AddonMarketplaceDetailComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('hydration on mount', () => {
    it('fetches detail exactly once on construction', async () => {
      const { serviceMock } = await setup();
      expect(serviceMock.getDetail).toHaveBeenCalledTimes(1);
    });

    it('passes the route addonPlanId to the service', async () => {
      const { serviceMock } = await setup();
      const [planId] = serviceMock.getDetail.mock.calls[0]!;
      expect(planId).toBe(PLAN_ID);
    });
  });

  describe('render — header + back link', () => {
    it('renders the title with display_name and code', async () => {
      const { element } = await setup();
      const title = element.querySelector('[data-testid="addon-detail-title"]');
      expect(title?.textContent ?? '').toContain('Familiar');
      expect(title?.textContent ?? '').toContain('familiar');
    });

    it('renders a back link to /h/addons', async () => {
      const { element } = await setup();
      const back = element.querySelector('[data-testid="addon-detail-back"]');
      expect(back?.getAttribute('routerlink') || back?.getAttribute('href') || '').toMatch(
        /\/h\/addons/i,
      );
    });

    it('renders the category badge', async () => {
      const { element } = await setup();
      const badge = element.querySelector('[data-testid="addon-detail-category"]');
      expect(badge?.textContent ?? '').toContain('AI');
    });

    it('renders the description block when present', async () => {
      const { element } = await setup();
      const desc = element.querySelector('[data-testid="addon-detail-description"]');
      expect(desc?.textContent ?? '').toContain('Companion AI');
    });
  });

  describe('render — entitlements list', () => {
    it('renders one entitlement row per entry', async () => {
      const { element } = await setup();
      const rows = Array.from(
        element.querySelectorAll('[data-testid^="addon-detail-entitlement-"]'),
      ).filter((el) => el.tagName.toLowerCase() === 'li');
      expect(rows.length).toBe(2);
    });

    it('renders the entitlement label + limit + unit', async () => {
      const { element } = await setup();
      const mcp = element.querySelector(
        '[data-testid="addon-detail-entitlement-mcp_gateway"]',
      );
      const text = mcp?.textContent ?? '';
      expect(text).toContain('MCP Gateway');
      expect(text).toContain('100');
      expect(text).toContain('connections');
    });
  });

  describe('render — integrations matrix', () => {
    it('renders one integration row per entry', async () => {
      const { element } = await setup();
      const rows = Array.from(
        element.querySelectorAll('[data-testid^="addon-detail-integration-"]'),
      ).filter((el) => el.tagName.toLowerCase() === 'li');
      expect(rows.length).toBe(2);
    });

    it('renders the integration type/label/status', async () => {
      const { element } = await setup();
      const row = element.querySelector(
        '[data-testid="addon-detail-integration-webhook"]',
      );
      const text = row?.textContent ?? '';
      expect(text).toContain('Webhooks');
      expect(text).toContain('configured');
    });
  });

  describe('render — compliance pills', () => {
    it('renders 4 compliance pills (GDPR / PDPA / CCPA / IMDA)', async () => {
      const { element } = await setup();
      expect(
        element.querySelector('[data-testid="addon-detail-compliance-gdpr"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="addon-detail-compliance-pdpa"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="addon-detail-compliance-ccpa"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="addon-detail-compliance-imda"]'),
      ).toBeTruthy();
    });

    it('marks each pill as compliant or not via data-compliant attr', async () => {
      const { element } = await setup();
      expect(
        element
          .querySelector('[data-testid="addon-detail-compliance-gdpr"]')
          ?.getAttribute('data-compliant'),
      ).toBe('true');
      expect(
        element
          .querySelector('[data-testid="addon-detail-compliance-ccpa"]')
          ?.getAttribute('data-compliant'),
      ).toBe('false');
    });

    it('renders data_residency_regions as a chip list', async () => {
      const { element } = await setup();
      const block = element.querySelector(
        '[data-testid="addon-detail-residency-regions"]',
      );
      const text = block?.textContent ?? '';
      expect(text).toContain('SG');
      expect(text).toContain('EU');
    });
  });

  describe('render — pricing-tier cards', () => {
    it('renders one card per pricing tier', async () => {
      const { element } = await setup();
      const cards = Array.from(
        element.querySelectorAll('[data-testid^="addon-detail-tier-"]'),
      ).filter((el) => el.tagName.toLowerCase() === 'li');
      expect(cards.length).toBe(2);
    });

    it('formats monthly_price_cents with the tier currency (CHO-1798)', async () => {
      const { element } = await setup();
      const pro = element.querySelector('[data-testid="addon-detail-tier-pro"]');
      // Previously rendered "$24.00" with a hardcoded "$" — leaked USD
      // styling onto SGD prices after CHO-1787.
      expect(pro?.textContent ?? '').toContain('SGD 24.00');
    });

    it('marks the current tier with aria-current="true"', async () => {
      const { element } = await setup();
      const pro = element.querySelector('[data-testid="addon-detail-tier-pro"]');
      const starter = element.querySelector(
        '[data-testid="addon-detail-tier-starter"]',
      );
      expect(pro?.getAttribute('aria-current')).toBe('true');
      expect(starter?.getAttribute('aria-current')).toBe('false');
    });
  });

  describe('subscription snapshot + CTA', () => {
    it('renders the subscription snapshot block when current_subscription is present', async () => {
      const { element } = await setup();
      const snap = element.querySelector(
        '[data-testid="addon-detail-subscription"]',
      );
      expect(snap).toBeTruthy();
      const text = snap?.textContent ?? '';
      expect(text).toContain('pro');
      expect(text).toContain('ACTIVE');
    });

    it('renders the Manage CTA when subscribed', async () => {
      const { element } = await setup();
      const manage = element.querySelector(
        '[data-testid="addon-detail-manage"]',
      );
      expect(manage).toBeTruthy();
      expect(
        manage?.getAttribute('routerlink') || manage?.getAttribute('href') || '',
      ).toMatch(/\/h\/addons/i);
    });

    it('hides the subscription snapshot when current_subscription is null', async () => {
      const { element } = await setup({
        result: { kind: 'success', detail: browseDetail },
      });
      expect(
        element.querySelector('[data-testid="addon-detail-subscription"]'),
      ).toBeNull();
    });

    it('renders the "Install coming soon" copy when not subscribed', async () => {
      const { element } = await setup({
        result: { kind: 'success', detail: browseDetail },
      });
      expect(
        element.querySelector('[data-testid="addon-detail-install-soon"]'),
      ).toBeTruthy();
    });
  });

  // CHO-1798 — next-renewal in the subscription panel renders as
  // YYYY-MM-DD, no trailing T13:13:03.285282Z timestamp.
  describe('next-renewal date format (CHO-1798)', () => {
    it('renders the date YYYY-MM-DD without the time portion', async () => {
      const renewalDetail: AddOnDetail = {
        ...subscribedDetail,
        current_subscription: {
          ...subscribedDetail.current_subscription!,
          next_renewal_at: '2026-07-18T13:13:03.285282Z',
        },
      };
      const { element } = await setup({
        result: { kind: 'success', detail: renewalDetail },
      });
      const dd = element.querySelector(
        '[data-testid="addon-detail-next-renewal"]',
      ) as HTMLElement | null;
      expect(dd).toBeTruthy();
      const txt = dd?.textContent ?? '';
      expect(txt).toContain('2026-07-18');
      expect(txt).not.toMatch(/T\d{2}:\d{2}/);
    });
  });

  // CHO-1780 — scheduled-tier badge inside the subscription panel.
  describe('scheduled-tier badge (CHO-1780)', () => {
    const scheduledDetail: AddOnDetail = {
      ...subscribedDetail,
      current_subscription: {
        ...subscribedDetail.current_subscription!,
        scheduled_tier_code: 'enterprise',
        scheduled_effective_at: '2026-07-17T00:00:00Z',
      },
    };

    it('renders the badge under the current tier line when both scheduled fields are set', async () => {
      const { element } = await setup({
        result: { kind: 'success', detail: scheduledDetail },
      });
      const badge = element.querySelector(
        '[data-testid="addon-detail-scheduled-badge"]',
      ) as HTMLElement | null;
      expect(badge).toBeTruthy();
      const text = badge?.textContent ?? '';
      expect(text).toContain('enterprise');
      expect(text).toContain('2026-07-17');
    });

    it('does NOT render the badge when current_subscription has no schedule', async () => {
      const { element } = await setup();
      expect(
        element.querySelector('[data-testid="addon-detail-scheduled-badge"]'),
      ).toBeFalsy();
    });

    it('does NOT render the badge when only one of the two scheduled fields is populated', async () => {
      const partial: AddOnDetail = {
        ...subscribedDetail,
        current_subscription: {
          ...subscribedDetail.current_subscription!,
          scheduled_tier_code: 'enterprise',
          // scheduled_effective_at intentionally omitted
        },
      };
      const { element } = await setup({
        result: { kind: 'success', detail: partial },
      });
      expect(
        element.querySelector('[data-testid="addon-detail-scheduled-badge"]'),
      ).toBeFalsy();
    });
  });

  // CHO-1782 — destructive parallel to the scheduled-tier badge: when the
  // admin picks end-of-cycle deactivation, the subscription panel shows
  // the amber "Deactivating <date>" pill until the cycle anchor fires.
  describe('deactivating badge (CHO-1782)', () => {
    const deactivatingDetail: AddOnDetail = {
      ...subscribedDetail,
      current_subscription: {
        ...subscribedDetail.current_subscription!,
        status: 'PENDING_DEACTIVATION',
        deactivation_effective_at: '2026-07-17T00:00:00Z',
        deactivation_reason: 'cost',
      },
    };

    it('renders the badge when status is PENDING_DEACTIVATION + date is populated', async () => {
      const { element } = await setup({
        result: { kind: 'success', detail: deactivatingDetail },
      });
      const badge = element.querySelector(
        '[data-testid="addon-detail-deactivating-badge"]',
      ) as HTMLElement | null;
      expect(badge).toBeTruthy();
      expect(badge?.textContent ?? '').toContain('2026-07-17');
    });

    it('does NOT render the badge when status is ACTIVE even if date is set', async () => {
      const partial: AddOnDetail = {
        ...subscribedDetail,
        current_subscription: {
          ...subscribedDetail.current_subscription!,
          deactivation_effective_at: '2026-07-17T00:00:00Z',
        },
      };
      const { element } = await setup({
        result: { kind: 'success', detail: partial },
      });
      expect(
        element.querySelector('[data-testid="addon-detail-deactivating-badge"]'),
      ).toBeFalsy();
    });

    it('does NOT render the badge when status is PENDING_DEACTIVATION but date is missing', async () => {
      const partial: AddOnDetail = {
        ...subscribedDetail,
        current_subscription: {
          ...subscribedDetail.current_subscription!,
          status: 'PENDING_DEACTIVATION',
        },
      };
      const { element } = await setup({
        result: { kind: 'success', detail: partial },
      });
      expect(
        element.querySelector('[data-testid="addon-detail-deactivating-badge"]'),
      ).toBeFalsy();
    });
  });

  describe('async states', () => {
    it('shows the loading indicator while the request is in flight', async () => {
      const subject = new Subject<AddonDetailResult>();
      const serviceMock = {
        getDetail: vi.fn(
          (_planId: string): Observable<AddonDetailResult> => subject.asObservable(),
        ),
      };
      await TestBed.configureTestingModule({
        imports: [AddonMarketplaceDetailComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: TenantAddonsAdminService, useValue: serviceMock },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: { get: (k: string) => (k === 'addonPlanId' ? PLAN_ID : null) } },
            },
          },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(AddonMarketplaceDetailComponent);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="addon-detail-loading"]'),
      ).toBeTruthy();
      subject.next({ kind: 'success', detail: subscribedDetail });
      subject.complete();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-detail-loading"]'),
      ).toBeNull();
    });

    it('renders the not-found banner on 404', async () => {
      const { element } = await setup({ result: { kind: 'not-found' } });
      expect(
        element.querySelector('[data-testid="addon-detail-not-found"]'),
      ).toBeTruthy();
      // Back link still shown so the user can return to the dashboard.
      expect(
        element.querySelector('[data-testid="addon-detail-back"]'),
      ).toBeTruthy();
    });

    it('renders the server-error banner', async () => {
      const { element } = await setup({ result: { kind: 'server-error' } });
      expect(
        element.querySelector('[data-testid="addon-detail-load-error"]'),
      ).toBeTruthy();
    });

    it('renders the unauthenticated banner', async () => {
      const { element } = await setup({ result: { kind: 'unauthenticated' } });
      expect(
        element.querySelector('[data-testid="addon-detail-unauthenticated"]'),
      ).toBeTruthy();
    });
  });

  describe('a11y', () => {
    it('pricing-tier cards use role=list / role=listitem', async () => {
      const { element } = await setup();
      const list = element.querySelector('[data-testid="addon-detail-tiers"]');
      expect(list?.getAttribute('role')).toBe('list');
      const card = element.querySelector('[data-testid="addon-detail-tier-pro"]');
      expect(card?.getAttribute('role')).toBe('listitem');
    });
  });
});
