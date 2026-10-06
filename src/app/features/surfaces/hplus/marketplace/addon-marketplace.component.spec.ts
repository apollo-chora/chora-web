/**
 * AddonMarketplaceComponent spec — CHO-1735 PR 2 rewire.
 *
 * The component now fetches the catalog from the BFF; this spec
 * stubs `TenantAddonsAdminService.listMarketplace` so the render
 * cases are exercised without an HTTP testing controller dance.
 * Per Dale's CHO-1694 lesson the `vi.fn()` is typed against the
 * real service method signature.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AddonMarketplaceComponent } from './addon-marketplace.component';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import type {
  AddOnDetail,
  MarketplaceListResult,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

type ListMarketplaceFn = (typeof TenantAddonsAdminService.prototype)['listMarketplace'];

const PLAN_KG = '019e0000-0000-7000-8000-aaaaaaaaaaaa';
const PLAN_FAM = '019e0000-0000-7000-8000-bbbbbbbbbbbb';

const items: readonly AddOnDetail[] = [
  {
    addon_plan_id: PLAN_KG,
    code: 'knowledge_graph',
    display_name: 'Knowledge Graph',
    category: 'learning',
    description: 'Per-user knowledge mapping',
    pricing_tiers: [
      {
        tier_code: 'pro',
        label: 'Pro',
        monthly_price_cents: 4900,
        currency: 'SGD',
      },
    ],
  },
  {
    addon_plan_id: PLAN_FAM,
    code: 'familiar',
    display_name: 'Familiar',
    category: 'engagement',
    description: 'Earn-and-care RPG learning companion',
    pricing_tiers: [
      {
        tier_code: 'starter',
        label: 'Starter',
        monthly_price_cents: 3900,
        currency: 'SGD',
      },
    ],
  },
];

function setup(result: MarketplaceListResult): {
  fixture: ComponentFixture<AddonMarketplaceComponent>;
  listMarketplace: ReturnType<typeof vi.fn<ListMarketplaceFn>>;
} {
  const listMarketplace = vi.fn<ListMarketplaceFn>(
    () => of(result),
  );
  TestBed.configureTestingModule({
    imports: [AddonMarketplaceComponent],
    providers: [
      provideRouter([]),
      { provide: TenantAddonsAdminService, useValue: { listMarketplace } },
    ],
  });
  const fixture = TestBed.createComponent(AddonMarketplaceComponent);
  fixture.detectChanges();
  return { fixture, listMarketplace };
}

describe('AddonMarketplaceComponent', () => {
  let fixture: ComponentFixture<AddonMarketplaceComponent>;
  let element: HTMLElement;

  describe('render basics', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({ kind: 'success', items, nextCursor: null }));
      element = fixture.nativeElement as HTMLElement;
    });

    it('creates', () => {
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('has data-testid="hplus-marketplace" on root', () => {
      const root = element.querySelector('[data-testid="hplus-marketplace"]');
      expect(root).toBeTruthy();
    });

    it('applies the surface-hplus accent class on the root', () => {
      const root = element.querySelector(
        '[data-testid="hplus-marketplace"]',
      ) as HTMLElement;
      expect(root.classList.contains('surface-hplus')).toBe(true);
    });

    it('renders a single <main> landmark', () => {
      expect(element.querySelectorAll('main').length).toBe(1);
    });

    it('renders a semantic h1', () => {
      expect(element.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('catalog grid (success path)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({ kind: 'success', items, nextCursor: null }));
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders one tile per BFF item', () => {
      const tiles = element.querySelectorAll(
        '[data-testid^="marketplace-tile-"]',
      );
      expect(tiles.length).toBe(items.length);
    });

    it('renders the Knowledge Graph tile by code', () => {
      const tile = element.querySelector(
        '[data-testid="marketplace-tile-knowledge_graph"]',
      );
      expect(tile).toBeTruthy();
    });

    it('renders the Familiar tile by code', () => {
      const tile = element.querySelector(
        '[data-testid="marketplace-tile-familiar"]',
      );
      expect(tile).toBeTruthy();
    });

    it('shows the display_name on the tile', () => {
      const tile = element.querySelector(
        '[data-testid="marketplace-tile-knowledge_graph"]',
      ) as HTMLElement;
      expect(tile.textContent ?? '').toContain('Knowledge Graph');
    });

    it('shows the formatted monthly price from pricing_tiers[0]', () => {
      const tile = element.querySelector(
        '[data-testid="marketplace-tile-knowledge_graph"]',
      ) as HTMLElement;
      expect(tile.textContent ?? '').toContain('SGD 49.00/mo');
    });
  });

  describe('navigation', () => {
    it('navigates to /h/marketplace/:planId when the tile body is clicked', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({ kind: 'success', items, nextCursor: null }));
      element = fixture.nativeElement as HTMLElement;
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
      const tile = element.querySelector(
        '[data-testid="marketplace-tile-knowledge_graph"]',
      ) as HTMLElement;
      tile.click();
      expect(navigateSpy).toHaveBeenCalledWith(['/h/marketplace', PLAN_KG]);
    });
  });

  describe('loading + error + empty banners', () => {
    it('shows the loading banner while the call is pending', () => {
      TestBed.resetTestingModule();
      // Never-emitting observable to keep loading=true.
      const listMarketplace = vi.fn(() => ({
        subscribe: () => ({ unsubscribe: () => undefined }),
      })) as unknown as ListMarketplaceFn;
      TestBed.configureTestingModule({
        imports: [AddonMarketplaceComponent],
        providers: [
          provideRouter([]),
          { provide: TenantAddonsAdminService, useValue: { listMarketplace } },
        ],
      });
      const local = TestBed.createComponent(AddonMarketplaceComponent);
      local.detectChanges();
      const el = local.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="marketplace-loading"]')).toBeTruthy();
    });

    it('shows the error banner with retry on server-error', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({ kind: 'server-error' }));
      element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="marketplace-error"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="marketplace-retry"]')).toBeTruthy();
    });

    it('shows the empty banner when the BFF returns zero items', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({ kind: 'success', items: [], nextCursor: null }));
      element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[data-testid="marketplace-empty"]')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({ kind: 'success', items, nextCursor: null }));
      element = fixture.nativeElement as HTMLElement;
    });

    it('all interactive buttons have accessible names', () => {
      const buttons = Array.from(element.querySelectorAll('button'));
      for (const btn of buttons) {
        const hasText = (btn.textContent ?? '').trim().length > 0;
        const hasAria =
          btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby');
        expect(hasText || hasAria).toBe(true);
      }
    });

    it('renders a breadcrumb nav with aria-label', () => {
      const nav = element.querySelector('nav[aria-label]');
      expect(nav).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1749 / CHO-1745 Sub 4 — system + installed affordances on catalog
  //
  // The marketplace BFF now ships `system` (always-on baseline plans) and
  // `installed` (calling tenant holds a live sub) on every list item. The
  // catalog tile renders an Included badge for `system === true`, an
  // Installed chip for `installed === true`, and swaps the primary CTA
  // from `View` → `Manage` (deep-link to /h/addons) on both states so we
  // never re-offer Subscribe on a plan the tenant either can't subscribe
  // to or already holds.
  // -------------------------------------------------------------------------

  describe('system + installed affordances (CHO-1749)', () => {
    const PLAN_BASE = '019e0000-0000-7000-8000-cccccccccccc';

    const systemItem: AddOnDetail = {
      addon_plan_id: PLAN_BASE,
      code: 'base',
      display_name: 'Chora Base',
      category: 'Core',
      description: 'Always-on tenant baseline',
      system: true,
      installed: true,
      pricing_tiers: [],
    };

    const installedItem: AddOnDetail = {
      ...items[1],
      installed: true,
      system: false,
    };

    const availableItem: AddOnDetail = {
      ...items[0],
      installed: false,
      system: false,
    };

    it('renders the system badge on tiles where system=true', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({
        kind: 'success',
        items: [systemItem],
        nextCursor: null,
      }));
      element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="marketplace-tile-base-system-badge"]'),
      ).toBeTruthy();
    });

    it('hides the system badge on tiles where system=false', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({
        kind: 'success',
        items: [availableItem],
        nextCursor: null,
      }));
      element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid$="-system-badge"]'),
      ).toBeNull();
    });

    it('renders the Installed chip on tiles where installed=true', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({
        kind: 'success',
        items: [installedItem],
        nextCursor: null,
      }));
      element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector(
          '[data-testid="marketplace-tile-familiar-installed-badge"]',
        ),
      ).toBeTruthy();
    });

    it('hides the Installed chip on tiles where installed=false', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({
        kind: 'success',
        items: [availableItem],
        nextCursor: null,
      }));
      element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid$="-installed-badge"]'),
      ).toBeNull();
    });

    it('swaps the primary CTA to Manage when system=true', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({
        kind: 'success',
        items: [systemItem],
        nextCursor: null,
      }));
      element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="marketplace-manage-base"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="marketplace-view-base"]'),
      ).toBeNull();
    });

    it('swaps the primary CTA to Manage when installed=true', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({
        kind: 'success',
        items: [installedItem],
        nextCursor: null,
      }));
      element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="marketplace-manage-familiar"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="marketplace-view-familiar"]'),
      ).toBeNull();
    });

    it('keeps the View CTA when neither system nor installed', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({
        kind: 'success',
        items: [availableItem],
        nextCursor: null,
      }));
      element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="marketplace-view-knowledge_graph"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="marketplace-manage-knowledge_graph"]'),
      ).toBeNull();
    });

    it('Manage button navigates to /h/addons (management surface)', () => {
      TestBed.resetTestingModule();
      ({ fixture } = setup({
        kind: 'success',
        items: [systemItem],
        nextCursor: null,
      }));
      element = fixture.nativeElement as HTMLElement;
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const manage = element.querySelector(
        '[data-testid="marketplace-manage-base"]',
      ) as HTMLButtonElement;
      manage.click();
      expect(spy).toHaveBeenCalledWith(['/h/addons']);
    });
  });
});
