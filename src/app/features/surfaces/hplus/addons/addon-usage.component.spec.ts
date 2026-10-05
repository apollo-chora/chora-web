/**
 * H+ Add-on Usage Analytics screen spec (CHO-1732 STITCH-H-ADD-3).
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE the component exists. Compile must fail with
 * "Cannot find module './addon-usage.component'".
 *
 * Drives the screen through TestBed against a TenantAddonsAdminService
 * mock + a router stub. Asserts:
 *   - Hydration: fetches usage on mount for the route's addonPlanId.
 *   - Period chips (7d / 30d / 90d) re-fetch with the new window.
 *   - Granularity dropdown (day / week / month) re-fetches.
 *   - Metric switcher (seats / quota / api_calls); `quota` hidden when
 *     `quota_unit` is null.
 *   - Chart renders an SVG with a polyline for the chosen metric series.
 *   - Top-consumers list renders ONLY pseudonymous IDs — every rendered
 *     ID matches `/^user_[a-z0-9]{4}$/` so a future regression that
 *     leaks raw GCID is caught.
 *   - Loading / load-error / empty-state blocks.
 *   - Back link to /h/addons.
 *
 * Lesson from Dale's CHO-1694 catch: every `vi.fn()` mock param gets
 * an explicit typed signature so `mock.calls[0][0]` is the real tuple
 * (no TS2493 risk).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';

import { AddonUsageComponent } from './addon-usage.component';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import type {
  AddOnUsage,
  AddonUsageQuery,
  AddonUsageResult,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

const PLAN_ID = '019e0000-0000-7000-8000-bbbbbbbbbbbb';

const fullUsage: AddOnUsage = {
  addon_plan_id: PLAN_ID,
  tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  period_from: '2026-05-13T00:00:00Z',
  period_to: '2026-06-12T00:00:00Z',
  granularity: 'day',
  seats_total: 50,
  seats_used: 12,
  seats_used_peak: 18,
  quota_unit: 'tokens',
  quota_limit: 1_000_000,
  quota_consumed: 320_000,
  quota_consumed_pct: 32,
  time_series: [
    { bucket_start: '2026-05-13T00:00:00Z', seats_used: 10, quota_consumed: 5_000, api_calls: 120 },
    { bucket_start: '2026-05-14T00:00:00Z', seats_used: 12, quota_consumed: 7_500, api_calls: 180 },
    { bucket_start: '2026-05-15T00:00:00Z', seats_used: 11, quota_consumed: 6_200, api_calls: 150 },
  ],
  top_consumers: [
    { user_id_pseudonymous: 'user_a1b2', share_pct: 18.5 },
    { user_id_pseudonymous: 'user_c3d4', share_pct: 14.1 },
    { user_id_pseudonymous: 'user_e5f6', share_pct: 9.7 },
  ],
};

const usageNoQuota: AddOnUsage = {
  ...fullUsage,
  quota_unit: null,
  quota_limit: null,
  quota_consumed: 0,
  quota_consumed_pct: null,
};

const emptyUsage: AddOnUsage = {
  ...fullUsage,
  seats_used: 0,
  seats_used_peak: 0,
  quota_consumed: 0,
  time_series: [],
  top_consumers: [],
};

function makeServiceMock(opts: { usage?: AddonUsageResult } = {}) {
  return {
    getUsage: vi.fn(
      (_planId: string, _query: AddonUsageQuery): Observable<AddonUsageResult> =>
        of(opts.usage ?? ({ kind: 'success', usage: fullUsage } as AddonUsageResult)),
    ),
  };
}

async function setup(
  opts: {
    usage?: AddonUsageResult;
    queryParams?: { period?: string; granularity?: string; metric?: string };
  } = {},
): Promise<{
  fixture: ComponentFixture<AddonUsageComponent>;
  component: AddonUsageComponent;
  element: HTMLElement;
  serviceMock: ReturnType<typeof makeServiceMock>;
  queryParams$: BehaviorSubject<Record<string, string>>;
}> {
  const serviceMock = makeServiceMock({ usage: opts.usage });
  const queryParams$ = new BehaviorSubject<Record<string, string>>(opts.queryParams ?? {});
  await TestBed.configureTestingModule({
    imports: [AddonUsageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TenantAddonsAdminService, useValue: serviceMock },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (k: string) => (k === 'addonPlanId' ? PLAN_ID : null) } },
          paramMap: of({ get: (k: string) => (k === 'addonPlanId' ? PLAN_ID : null) }),
          queryParams: queryParams$.asObservable(),
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AddonUsageComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, component, element, serviceMock, queryParams$ };
}

describe('AddonUsageComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('hydration on mount', () => {
    it('fetches usage exactly once on construction', async () => {
      const { serviceMock } = await setup();
      expect(serviceMock.getUsage).toHaveBeenCalledTimes(1);
    });

    it('passes the route addonPlanId to the service', async () => {
      const { serviceMock } = await setup();
      const [planId] = serviceMock.getUsage.mock.calls[0]!;
      expect(planId).toBe(PLAN_ID);
    });

    it('defaults to granularity=day and a 30d window', async () => {
      const { serviceMock } = await setup();
      const [, query] = serviceMock.getUsage.mock.calls[0]!;
      expect(query.granularity).toBe('day');
      expect(query.from).toBeTruthy();
      expect(query.to).toBeTruthy();
    });
  });

  describe('render — header + breadcrumb', () => {
    it('renders a back link to /h/addons', async () => {
      const { element } = await setup();
      const back = element.querySelector(
        '[data-testid="addon-usage-back"]',
      ) as HTMLAnchorElement;
      expect(back).toBeTruthy();
      expect(back.getAttribute('href') || back.getAttribute('routerlink') || '').toMatch(
        /\/h\/addons/i,
      );
    });
  });

  describe('render — cards', () => {
    it('renders the seats card with used / total / peak', async () => {
      const { element } = await setup();
      const card = element.querySelector('[data-testid="addon-usage-card-seats"]');
      expect(card).toBeTruthy();
      const text = card?.textContent ?? '';
      expect(text).toContain('12');
      expect(text).toContain('50');
      expect(text).toContain('18');
    });

    it('renders the quota card when quota_unit is present', async () => {
      const { element } = await setup();
      expect(
        element.querySelector('[data-testid="addon-usage-card-quota"]'),
      ).toBeTruthy();
    });

    it('hides the quota card when quota_unit is null', async () => {
      const { element } = await setup({
        usage: { kind: 'success', usage: usageNoQuota },
      });
      expect(
        element.querySelector('[data-testid="addon-usage-card-quota"]'),
      ).toBeNull();
    });
  });

  describe('render — chart', () => {
    it('renders an SVG element with a polyline for the time series', async () => {
      const { element } = await setup();
      const svg = element.querySelector(
        '[data-testid="addon-usage-chart"]',
      );
      expect(svg?.tagName.toLowerCase()).toBe('svg');
      const polyline = svg?.querySelector('polyline');
      expect(polyline).toBeTruthy();
    });

    it('omits the chart in favour of an empty-state when time_series is empty', async () => {
      const { element } = await setup({
        usage: { kind: 'success', usage: emptyUsage },
      });
      expect(
        element.querySelector('[data-testid="addon-usage-chart"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="addon-usage-empty"]'),
      ).toBeTruthy();
    });
  });

  describe('render — top consumers (pseudonymous-only)', () => {
    it('renders one row per top_consumers entry', async () => {
      const { element } = await setup();
      const rows = Array.from(
        element.querySelectorAll('[data-testid^="addon-usage-consumer-"]'),
      ).filter((el) => el.tagName.toLowerCase() === 'li');
      expect(rows.length).toBe(3);
    });

    it('renders ONLY pseudonymous IDs — every value matches /^user_[a-z0-9]{4}$/', async () => {
      const { element } = await setup();
      const rows = element.querySelectorAll(
        '[data-testid^="addon-usage-consumer-id-"]',
      );
      expect(rows.length).toBe(3);
      for (const row of Array.from(rows)) {
        const id = (row.textContent ?? '').trim();
        expect(id).toMatch(/^user_[a-z0-9]{4}$/);
      }
    });
  });

  describe('period chips', () => {
    it('re-fetches with a 7-day window when the 7d chip is clicked', async () => {
      const { fixture, element, serviceMock } = await setup();
      const initialCalls = serviceMock.getUsage.mock.calls.length;
      (
        element.querySelector(
          '[data-testid="addon-usage-period-7d"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(serviceMock.getUsage.mock.calls.length).toBe(initialCalls + 1);
      const lastQuery = serviceMock.getUsage.mock.calls.at(-1)![1];
      expect(lastQuery.from).toBeTruthy();
      expect(lastQuery.to).toBeTruthy();
      // 7 days = 7 * 86400000 ms (within tolerance).
      const from = new Date(lastQuery.from!).getTime();
      const to = new Date(lastQuery.to!).getTime();
      expect(to - from).toBe(7 * 86_400_000);
    });

    it('marks the active chip with aria-selected=true', async () => {
      const { fixture, element } = await setup();
      (
        element.querySelector(
          '[data-testid="addon-usage-period-90d"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element
          .querySelector('[data-testid="addon-usage-period-90d"]')
          ?.getAttribute('aria-selected'),
      ).toBe('true');
      expect(
        element
          .querySelector('[data-testid="addon-usage-period-30d"]')
          ?.getAttribute('aria-selected'),
      ).toBe('false');
    });
  });

  describe('granularity', () => {
    it('re-fetches with the new granularity when the dropdown changes', async () => {
      const { fixture, element, serviceMock } = await setup();
      const initialCalls = serviceMock.getUsage.mock.calls.length;
      const sel = element.querySelector(
        '[data-testid="addon-usage-granularity"]',
      ) as HTMLSelectElement;
      sel.value = 'week';
      sel.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(serviceMock.getUsage.mock.calls.length).toBe(initialCalls + 1);
      const lastQuery = serviceMock.getUsage.mock.calls.at(-1)![1];
      expect(lastQuery.granularity).toBe('week');
    });
  });

  describe('metric switcher', () => {
    it('switches the chart series to api_calls when the api_calls metric is selected', async () => {
      const { fixture, element, component } = await setup();
      (
        element.querySelector(
          '[data-testid="addon-usage-metric-api_calls"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(component.metric()).toBe('api_calls');
    });

    it('hides the quota metric option when quota_unit is null', async () => {
      const { element } = await setup({
        usage: { kind: 'success', usage: usageNoQuota },
      });
      expect(
        element.querySelector('[data-testid="addon-usage-metric-quota"]'),
      ).toBeNull();
    });
  });

  describe('async states', () => {
    it('shows the loading indicator while the request is in flight', async () => {
      const subject = new Subject<AddonUsageResult>();
      const serviceMock = {
        getUsage: vi.fn(
          (_planId: string, _query: AddonUsageQuery): Observable<AddonUsageResult> =>
            subject.asObservable(),
        ),
      };
      const queryParams$ = new BehaviorSubject<Record<string, string>>({});
      await TestBed.configureTestingModule({
        imports: [AddonUsageComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: TenantAddonsAdminService, useValue: serviceMock },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: { get: (k: string) => (k === 'addonPlanId' ? PLAN_ID : null) } },
              paramMap: of({ get: (k: string) => (k === 'addonPlanId' ? PLAN_ID : null) }),
              queryParams: queryParams$.asObservable(),
            },
          },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(AddonUsageComponent);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector('[data-testid="addon-usage-loading"]'),
      ).toBeTruthy();
      subject.next({ kind: 'success', usage: fullUsage });
      subject.complete();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-usage-loading"]'),
      ).toBeNull();
    });

    it('renders the load-error banner when the service returns server-error', async () => {
      const { element } = await setup({
        usage: { kind: 'server-error' },
      });
      expect(
        element.querySelector('[data-testid="addon-usage-load-error"]'),
      ).toBeTruthy();
    });

    it('renders the not-found banner when the service returns not-found', async () => {
      const { element } = await setup({ usage: { kind: 'not-found' } });
      expect(
        element.querySelector('[data-testid="addon-usage-not-found"]'),
      ).toBeTruthy();
    });
  });

  describe('a11y', () => {
    it('period chips use role=tablist / role=tab', async () => {
      const { element } = await setup();
      const list = element.querySelector('[data-testid="addon-usage-periods"]');
      expect(list?.getAttribute('role')).toBe('tablist');
      const chip = element.querySelector('[data-testid="addon-usage-period-30d"]');
      expect(chip?.getAttribute('role')).toBe('tab');
    });
  });
});
