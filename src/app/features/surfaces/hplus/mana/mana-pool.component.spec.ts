/**
 * ManaPoolComponent spec — TDD RED for the L1 Tenant lane (CHO-1709
 * WP-4): the H+ `/h/mana` tenant mana-pool page wired to
 * TenantManaAdminService (mocked here with discriminated results).
 *
 * Covers the CHO-1709 AC surface: pool card (balance headline +
 * monthly quota + lifetime stats + low-balance chip), create-if-absent
 * CTA on 404, set-monthly-quota form (≥ 0 → :auto-renew with inline
 * success/error), Stripe top-up packs → checkout redirect, loading
 * skeleton, error banner with API code, and the post-Stripe
 * `?topup=success|cancelled` return notice.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';

import { ManaPoolComponent } from './mana-pool.component';
import { TenantManaAdminService } from '../../../admin/tenant-admin/services/tenant-mana-admin.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import {
  ManaTopUpCheckoutResult,
  TENANT_MANA_TOPUP_PACKS,
  TenantManaPool,
  TenantManaPoolAutoRenewResult,
  TenantManaPoolCreateResult,
  TenantManaPoolLoadResult,
} from '../../../admin/tenant-admin/models/tenant-mana-admin.model';

const mtmPool: TenantManaPool = {
  pool_id: '00000000-0000-7000-8000-00000000a001',
  tenant_id: '00000000-0000-7000-8000-0000000000t1',
  balance_units: 12500,
  monthly_topup_units: 1000,
  lifetime_topped_up_units: 40000,
  lifetime_allocated_units: 27500,
  version: 7,
  created_at: '2026-06-01T08:00:00Z',
  last_topped_up_at: '2026-06-08T03:30:00Z',
  low_balance_threshold: 500,
  is_low_balance: false,
};

interface Mocks {
  pool: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  setAutoRenew: ReturnType<typeof vi.fn>;
  checkoutTopUp: ReturnType<typeof vi.fn>;
  toastShow: ReturnType<typeof vi.fn>;
  redirectTo: Mock<(url: string) => void>;
}

function setup(
  loadResult: TenantManaPoolLoadResult = { kind: 'success', pool: mtmPool },
  queryParams: Record<string, string> = {},
): { fixture: ComponentFixture<ManaPoolComponent>; mocks: Mocks } {
  const mocks: Mocks = {
    pool: vi.fn(() => of(loadResult)),
    create: vi.fn(),
    setAutoRenew: vi.fn(),
    checkoutTopUp: vi.fn(),
    toastShow: vi.fn(),
    redirectTo: vi.fn<(url: string) => void>(),
  };
  TestBed.configureTestingModule({
    imports: [ManaPoolComponent],
    providers: [
      {
        provide: TenantManaAdminService,
        useValue: {
          pool: mocks.pool,
          create: mocks.create,
          setAutoRenew: mocks.setAutoRenew,
          checkoutTopUp: mocks.checkoutTopUp,
        },
      },
      { provide: ToastService, useValue: { show: mocks.toastShow } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(ManaPoolComponent);
  // Stub the browser seams BEFORE first change detection so the redirect
  // never actually navigates jsdom and return URLs are deterministic.
  const seams = fixture.componentInstance as unknown as {
    redirectTo(url: string): void;
    currentOrigin(): string;
  };
  vi.spyOn(seams, 'redirectTo').mockImplementation(mocks.redirectTo);
  vi.spyOn(seams, 'currentOrigin').mockReturnValue('https://hplus.chora.site');
  fixture.detectChanges();
  return { fixture, mocks };
}

function el(fixture: ComponentFixture<ManaPoolComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function query<T extends HTMLElement>(
  fixture: ComponentFixture<ManaPoolComponent>,
  testid: string,
): T | null {
  return el(fixture).querySelector<T>(`[data-testid="${testid}"]`);
}

describe('ManaPoolComponent (CHO-1709 WP-4)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('load states', () => {
    it('shows the loading skeleton while the pool fetch is in flight', () => {
      const pending = new Subject<TenantManaPoolLoadResult>();
      TestBed.configureTestingModule({
        imports: [ManaPoolComponent],
        providers: [
          {
            provide: TenantManaAdminService,
            useValue: {
              pool: vi.fn(() => pending.asObservable()),
              create: vi.fn(),
              setAutoRenew: vi.fn(),
              checkoutTopUp: vi.fn(),
            },
          },
          { provide: ToastService, useValue: { show: vi.fn() } },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
          },
        ],
      });
      const fixture = TestBed.createComponent(ManaPoolComponent);
      fixture.detectChanges();
      expect(query(fixture, 'mana-loading')).toBeTruthy();
      pending.next({ kind: 'success', pool: mtmPool });
      pending.complete();
      fixture.detectChanges();
      expect(query(fixture, 'mana-loading')).toBeFalsy();
      expect(query(fixture, 'mana-pool-card')).toBeTruthy();
    });

    it('renders the pool card with balance headline + quota + lifetime stats', () => {
      const { fixture, mocks } = setup();
      expect(mocks.pool).toHaveBeenCalledTimes(1);
      const balance = query(fixture, 'mana-balance');
      expect(balance?.textContent).toContain('12,500');
      expect(query(fixture, 'mana-stat-monthly')?.textContent).toContain('1,000');
      expect(query(fixture, 'mana-stat-topped-up')?.textContent).toContain('40,000');
      expect(query(fixture, 'mana-stat-allocated')?.textContent).toContain('27,500');
    });

    it('omits the low-balance chip when is_low_balance is false', () => {
      const { fixture } = setup();
      expect(query(fixture, 'mana-low-chip')).toBeFalsy();
    });

    it('renders the low-balance warning chip when is_low_balance is true', () => {
      const { fixture } = setup({
        kind: 'success',
        pool: { ...mtmPool, balance_units: 300, is_low_balance: true },
      });
      const chip = query(fixture, 'mana-low-chip');
      expect(chip).toBeTruthy();
      expect(chip?.getAttribute('role')).toBe('status');
    });

    it('shows the disabled label for a 0 monthly quota (auto-renew off)', () => {
      const { fixture } = setup({
        kind: 'success',
        pool: { ...mtmPool, monthly_topup_units: 0 },
      });
      expect(query(fixture, 'mana-stat-monthly')?.textContent).toContain(
        'hplus.mana.statMonthlyOff',
      );
    });

    it('shows the error banner with the API code and a retry that re-fetches', () => {
      const { fixture, mocks } = setup({ kind: 'error', code: 'GATEWAY_UPSTREAM_ERROR' });
      const banner = query(fixture, 'mana-error');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain('GATEWAY_UPSTREAM_ERROR');
      (query<HTMLButtonElement>(fixture, 'mana-retry'))?.click();
      expect(mocks.pool).toHaveBeenCalledTimes(2);
    });
  });

  describe('create-if-absent (404 → no pool yet)', () => {
    it('shows the create CTA state instead of the pool card on no-pool', () => {
      const { fixture } = setup({ kind: 'no-pool' });
      expect(query(fixture, 'mana-create-state')).toBeTruthy();
      expect(query(fixture, 'mana-create-cta')).toBeTruthy();
      expect(query(fixture, 'mana-pool-card')).toBeFalsy();
      expect(query(fixture, 'mana-error')).toBeFalsy();
    });

    it('creates the pool and hydrates the card from the response', () => {
      const { fixture, mocks } = setup({ kind: 'no-pool' });
      const created: TenantManaPoolCreateResult = {
        kind: 'success',
        pool: { ...mtmPool, balance_units: 0, monthly_topup_units: 0 },
      };
      mocks.create.mockReturnValue(of(created));

      query<HTMLButtonElement>(fixture, 'mana-create-cta')?.click();
      fixture.detectChanges();

      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(query(fixture, 'mana-create-state')).toBeFalsy();
      expect(query(fixture, 'mana-pool-card')).toBeTruthy();
      expect(query(fixture, 'mana-balance')?.textContent).toContain('0');
      expect(mocks.toastShow).toHaveBeenCalledWith('hplus.mana.toastCreated', 'success');
    });

    it('renders the inline create error (with API code) and stays on the CTA', () => {
      const { fixture, mocks } = setup({ kind: 'no-pool' });
      mocks.create.mockReturnValue(
        of({ kind: 'error', code: 'GATEWAY_UPSTREAM_ERROR' } as TenantManaPoolCreateResult),
      );

      query<HTMLButtonElement>(fixture, 'mana-create-cta')?.click();
      fixture.detectChanges();

      const err = query(fixture, 'mana-create-error');
      expect(err).toBeTruthy();
      expect(err?.textContent).toContain('GATEWAY_UPSTREAM_ERROR');
      expect(query(fixture, 'mana-create-state')).toBeTruthy();
    });
  });

  describe('monthly auto-renew quota form', () => {
    function typeQuota(fixture: ComponentFixture<ManaPoolComponent>, value: string): void {
      const input = query<HTMLInputElement>(fixture, 'mana-quota-input');
      expect(input).toBeTruthy();
      input!.value = value;
      input!.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('seeds the quota input from the loaded pool', () => {
      const { fixture } = setup();
      expect(query<HTMLInputElement>(fixture, 'mana-quota-input')?.value).toBe('1000');
    });

    it('submits the parsed quota and shows the inline success message', () => {
      const { fixture, mocks } = setup();
      const updated: TenantManaPoolAutoRenewResult = {
        kind: 'success',
        pool: { ...mtmPool, monthly_topup_units: 2500, version: 8 },
      };
      mocks.setAutoRenew.mockReturnValue(of(updated));

      typeQuota(fixture, '2500');
      query<HTMLButtonElement>(fixture, 'mana-quota-submit')?.click();
      fixture.detectChanges();

      expect(mocks.setAutoRenew).toHaveBeenCalledWith(2500);
      expect(query(fixture, 'mana-quota-success')).toBeTruthy();
      expect(query(fixture, 'mana-stat-monthly')?.textContent).toContain('2,500');
    });

    it('accepts 0 to disable auto-renew', () => {
      const { fixture, mocks } = setup();
      mocks.setAutoRenew.mockReturnValue(
        of({
          kind: 'success',
          pool: { ...mtmPool, monthly_topup_units: 0 },
        } as TenantManaPoolAutoRenewResult),
      );
      typeQuota(fixture, '0');
      const submit = query<HTMLButtonElement>(fixture, 'mana-quota-submit');
      expect(submit?.disabled).toBe(false);
      submit?.click();
      expect(mocks.setAutoRenew).toHaveBeenCalledWith(0);
    });

    it('disables submit for a negative or non-numeric input', () => {
      const { fixture, mocks } = setup();
      typeQuota(fixture, '-3');
      expect(query<HTMLButtonElement>(fixture, 'mana-quota-submit')?.disabled).toBe(true);
      typeQuota(fixture, '');
      expect(query<HTMLButtonElement>(fixture, 'mana-quota-submit')?.disabled).toBe(true);
      expect(mocks.setAutoRenew).not.toHaveBeenCalled();
    });

    it('renders the inline 422 validation error with the API code', () => {
      const { fixture, mocks } = setup();
      mocks.setAutoRenew.mockReturnValue(
        of({ kind: 'invalid', code: 'TENANCY_QUOTA_NEGATIVE' } as TenantManaPoolAutoRenewResult),
      );
      typeQuota(fixture, '7');
      query<HTMLButtonElement>(fixture, 'mana-quota-submit')?.click();
      fixture.detectChanges();
      const err = query(fixture, 'mana-quota-error');
      expect(err).toBeTruthy();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(err?.textContent).toContain('TENANCY_QUOTA_NEGATIVE');
    });

    it('flips to the create state when auto-renew 404s (pool vanished)', () => {
      const { fixture, mocks } = setup();
      mocks.setAutoRenew.mockReturnValue(
        of({ kind: 'no-pool' } as TenantManaPoolAutoRenewResult),
      );
      typeQuota(fixture, '7');
      query<HTMLButtonElement>(fixture, 'mana-quota-submit')?.click();
      fixture.detectChanges();
      expect(query(fixture, 'mana-create-state')).toBeTruthy();
      expect(query(fixture, 'mana-pool-card')).toBeFalsy();
    });
  });

  describe('top-up packs → Stripe checkout', () => {
    it('renders one pack card per fixed pack with units + SGD price', () => {
      const { fixture } = setup();
      for (const pack of TENANT_MANA_TOPUP_PACKS) {
        const card = query(fixture, `mana-pack-${pack.sku}`);
        expect(card).toBeTruthy();
      }
      const first = TENANT_MANA_TOPUP_PACKS[0];
      const firstCard = query(fixture, `mana-pack-${first.sku}`);
      expect(firstCard?.textContent).toContain('S$');
    });

    it('POSTs the pack with origin-anchored return URLs and redirects to Stripe', () => {
      const { fixture, mocks } = setup();
      const pack = TENANT_MANA_TOPUP_PACKS[0];
      mocks.checkoutTopUp.mockReturnValue(
        of({
          kind: 'success',
          checkout: {
            purchase_id: 'p1',
            stripe_session_id: 'cs_1',
            stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_1',
            state: 'CHECKOUT_PENDING',
          },
        } as ManaTopUpCheckoutResult),
      );

      query<HTMLButtonElement>(fixture, `mana-pack-buy-${pack.sku}`)?.click();
      fixture.detectChanges();

      expect(mocks.checkoutTopUp).toHaveBeenCalledWith(
        pack,
        'https://hplus.chora.site/h/mana?topup=success',
        'https://hplus.chora.site/h/mana?topup=cancelled',
      );
      expect(mocks.redirectTo).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1');
    });

    it('shows the inline top-up error (with API code) and does not redirect', () => {
      const { fixture, mocks } = setup();
      const pack = TENANT_MANA_TOPUP_PACKS[1];
      mocks.checkoutTopUp.mockReturnValue(
        of({ kind: 'error', code: 'GATEWAY_UPSTREAM_UNAVAILABLE' } as ManaTopUpCheckoutResult),
      );

      query<HTMLButtonElement>(fixture, `mana-pack-buy-${pack.sku}`)?.click();
      fixture.detectChanges();

      const err = query(fixture, 'mana-topup-error');
      expect(err).toBeTruthy();
      expect(err?.textContent).toContain('GATEWAY_UPSTREAM_UNAVAILABLE');
      expect(mocks.redirectTo).not.toHaveBeenCalled();
      // The buy button is re-enabled after the failure.
      expect(
        query<HTMLButtonElement>(fixture, `mana-pack-buy-${pack.sku}`)?.disabled,
      ).toBe(false);
    });
  });

  describe('post-Stripe return notice (?topup=…)', () => {
    it('shows the success notice when returning with ?topup=success', () => {
      const { fixture } = setup({ kind: 'success', pool: mtmPool }, { topup: 'success' });
      const notice = query(fixture, 'mana-return-notice');
      expect(notice).toBeTruthy();
      expect(notice?.getAttribute('data-variant')).toBe('success');
      expect(notice?.textContent).toContain('hplus.mana.returnSuccess');
    });

    it('shows the cancelled notice when returning with ?topup=cancelled', () => {
      const { fixture } = setup({ kind: 'success', pool: mtmPool }, { topup: 'cancelled' });
      const notice = query(fixture, 'mana-return-notice');
      expect(notice?.getAttribute('data-variant')).toBe('cancelled');
      expect(notice?.textContent).toContain('hplus.mana.returnCancelled');
    });

    it('ignores unknown topup values and dismisses on click', () => {
      const none = setup({ kind: 'success', pool: mtmPool }, { topup: 'weird' });
      expect(query(none.fixture, 'mana-return-notice')).toBeFalsy();

      TestBed.resetTestingModule();
      const { fixture } = setup({ kind: 'success', pool: mtmPool }, { topup: 'success' });
      query<HTMLButtonElement>(fixture, 'mana-return-dismiss')?.click();
      fixture.detectChanges();
      expect(query(fixture, 'mana-return-notice')).toBeFalsy();
    });
  });

  describe('browser seams (real implementations)', () => {
    function bareComponent(): ManaPoolComponent {
      TestBed.configureTestingModule({
        imports: [ManaPoolComponent],
        providers: [
          {
            provide: TenantManaAdminService,
            useValue: {
              pool: vi.fn(() => of({ kind: 'success', pool: mtmPool })),
              create: vi.fn(),
              setAutoRenew: vi.fn(),
              checkoutTopUp: vi.fn(),
            },
          },
          { provide: ToastService, useValue: { show: vi.fn() } },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
          },
        ],
      });
      return TestBed.createComponent(ManaPoolComponent).componentInstance;
    }

    it('currentOrigin() reads the real window origin when not stubbed', () => {
      const seams = bareComponent() as unknown as { currentOrigin(): string };
      expect(seams.currentOrigin()).toBe(window.location.origin);
    });

    it('redirectTo() assigns window.location.href (hash-change navigation)', () => {
      const seams = bareComponent() as unknown as { redirectTo(url: string): void };
      // A same-document hash URL is the one navigation jsdom implements.
      seams.redirectTo('#stripe-checkout');
      expect(window.location.hash).toBe('#stripe-checkout');
    });
  });

  describe('a11y + structure', () => {
    it('keeps the root testid + surface accent + single main + h1 + breadcrumb', () => {
      const { fixture } = setup();
      const root = el(fixture);
      const section = root.querySelector('[data-testid="hplus-mana"]') as HTMLElement;
      expect(section).toBeTruthy();
      expect(section.classList.contains('surface-hplus')).toBe(true);
      expect(root.querySelectorAll('main').length).toBe(1);
      expect(root.querySelectorAll('h1').length).toBe(1);
      expect(root.querySelector('nav[aria-label]')).toBeTruthy();
    });

    it('labels the quota input via a for/id pair', () => {
      const { fixture } = setup();
      const input = query<HTMLInputElement>(fixture, 'mana-quota-input');
      expect(input?.id).toBe('mana-quota-input');
      expect(el(fixture).querySelector('label[for="mana-quota-input"]')).toBeTruthy();
      expect(input?.getAttribute('min')).toBe('0');
    });

    it('gives every pack buy button an aria-label', () => {
      const { fixture } = setup();
      for (const pack of TENANT_MANA_TOPUP_PACKS) {
        const btn = query<HTMLButtonElement>(fixture, `mana-pack-buy-${pack.sku}`);
        expect(btn?.getAttribute('aria-label')).toBeTruthy();
      }
    });
  });
});
