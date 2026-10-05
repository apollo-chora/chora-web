/**
 * H+ Add-on Usage Analytics screen (CHO-1732 STITCH-H-ADD-3).
 *
 * Route: /h/addons/:addonPlanId/usage
 * Reached from the dashboard tile's `Usage` action (CHO-1698 button now
 * navigates here instead of firing the `Coming soon` toast).
 *
 * Reads from the gateway alias
 *   GET /api/v1/admin/tenants/me/addons/{addonPlanId}/usage?<query>
 * via TenantAddonsAdminService.getUsage (landed CHO-1732 PR 1) and
 * renders:
 *   - Period chips (7d / 30d / 90d, default 30d).
 *   - Granularity dropdown (day / week / month, default day).
 *   - Metric switcher (seats / quota / api_calls); `quota` hidden when
 *     `quota_unit` is null.
 *   - Stat cards (seats used/total/peak; quota consumed/limit/pct;
 *     api_calls total).
 *   - SVG `<polyline>` time-series for the chosen metric (hand-rolled
 *     to keep bundle weight down — no d3 / chart.js).
 *   - Top-consumers list — pseudonymous IDs ONLY. The spec asserts every
 *     rendered ID matches `/^user_[a-z0-9]{4}$/` so a future regression
 *     that leaks raw GCID is caught.
 *
 * Out of scope (deferred sub-stories on epic CHO-1697):
 *   - Custom date-range picker (v1 ships only the 3 presets).
 *   - CSV / PNG export.
 *   - "Recommend upgrade" chip linking to STITCH-H-ADD-4.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import {
  AddOnUsage,
  AddOnUsageBucket,
  AddonUsageGranularity,
  AddonUsageQuery,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

type PeriodPreset = '7d' | '30d' | '90d';
type Metric = 'seats' | 'quota' | 'api_calls';

const PERIOD_DAYS: Record<PeriodPreset, number> = { '7d': 7, '30d': 30, '90d': 90 };
const PERIODS: ReadonlyArray<PeriodPreset> = ['7d', '30d', '90d'];

const CHART_WIDTH = 720;
const CHART_HEIGHT = 200;
const CHART_PAD = 24;

interface ChartPoint {
  readonly x: number;
  readonly y: number;
  readonly bucket: AddOnUsageBucket;
}

@Component({
  selector: 'chora-hplus-addon-usage',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addon-usage.component.html',
  styleUrl: './addon-usage.component.scss',
})
export class AddonUsageComponent {
  private readonly addonsSvc = inject(TenantAddonsAdminService);
  private readonly route = inject(ActivatedRoute);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly notFound = signal(false);
  readonly usage = signal<AddOnUsage | null>(null);

  readonly period = signal<PeriodPreset>('30d');
  readonly granularity = signal<AddonUsageGranularity>('day');
  readonly metric = signal<Metric>('seats');

  readonly addonPlanId = signal<string>('');

  // Stable "now" — we compute the window on every fetch trigger so the
  // 7d/30d/90d chips deterministically anchor to construction time. (Date
  // is captured once in the constructor and re-used.)
  private readonly now = new Date();

  // ---------------------------------------------------------------------------
  // Computed view-model
  // ---------------------------------------------------------------------------

  readonly seatsTotal = computed(() => this.usage()?.seats_total ?? 0);
  readonly seatsUsed = computed(() => this.usage()?.seats_used ?? 0);
  readonly seatsUsedPeak = computed(() => this.usage()?.seats_used_peak ?? 0);

  readonly quotaUnit = computed(() => this.usage()?.quota_unit ?? null);
  readonly quotaLimit = computed(() => this.usage()?.quota_limit ?? null);
  readonly quotaConsumed = computed(() => this.usage()?.quota_consumed ?? 0);
  readonly quotaConsumedPct = computed(() => this.usage()?.quota_consumed_pct ?? null);

  readonly hasQuota = computed(() => this.quotaUnit() !== null);

  readonly topConsumers = computed(() => this.usage()?.top_consumers ?? []);

  readonly buckets = computed<ReadonlyArray<AddOnUsageBucket>>(
    () => this.usage()?.time_series ?? [],
  );

  readonly hasBuckets = computed(() => this.buckets().length > 0);

  /** Chart projection — scale the chosen metric across the SVG canvas. */
  readonly chartPoints = computed<ReadonlyArray<ChartPoint>>(() => {
    const buckets = this.buckets();
    if (buckets.length === 0) return [];
    const m = this.metric();
    const values = buckets.map((b) => this.metricValue(b, m));
    const max = Math.max(1, ...values);
    const innerW = CHART_WIDTH - 2 * CHART_PAD;
    const innerH = CHART_HEIGHT - 2 * CHART_PAD;
    const step = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;
    return buckets.map((bucket, i) => ({
      x: CHART_PAD + i * step,
      y: CHART_PAD + innerH - (values[i]! / max) * innerH,
      bucket,
    }));
  });

  /** `<polyline>` points attribute — "x1,y1 x2,y2 ..." */
  readonly chartPolylinePoints = computed(() =>
    this.chartPoints()
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' '),
  );

  readonly chartWidth = CHART_WIDTH;
  readonly chartHeight = CHART_HEIGHT;
  readonly periods = PERIODS;

  constructor() {
    // Route param drives the addonPlanId signal.
    const planParam = this.route.snapshot.paramMap.get('addonPlanId');
    if (planParam) this.addonPlanId.set(planParam);

    // Query params hydrate period / granularity / metric on first load
    // (so deep links restore state).
    this.route.queryParams.subscribe((q) => {
      if (q['period'] && PERIODS.includes(q['period'] as PeriodPreset)) {
        this.period.set(q['period'] as PeriodPreset);
      }
      const gran = q['granularity'] as AddonUsageGranularity | undefined;
      if (gran === 'day' || gran === 'week' || gran === 'month') {
        this.granularity.set(gran);
      }
      const metric = q['metric'] as Metric | undefined;
      if (metric === 'seats' || metric === 'quota' || metric === 'api_calls') {
        this.metric.set(metric);
      }
    });

    // Effect: re-fetch whenever period or granularity changes.
    effect(() => {
      const period = this.period();
      const granularity = this.granularity();
      const planId = this.addonPlanId();
      if (!planId) return;
      this.fetch(planId, this.windowFor(period), granularity);
    });
  }

  // ---------------------------------------------------------------------------
  // Period chips + granularity + metric setters
  // ---------------------------------------------------------------------------

  setPeriod(p: PeriodPreset): void {
    this.period.set(p);
  }

  isPeriodActive(p: PeriodPreset): boolean {
    return this.period() === p;
  }

  setGranularity(g: AddonUsageGranularity): void {
    this.granularity.set(g);
  }

  setMetric(m: Metric): void {
    if (m === 'quota' && !this.hasQuota()) return;
    this.metric.set(m);
  }

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  private fetch(
    planId: string,
    win: { from: string; to: string },
    granularity: AddonUsageGranularity,
  ): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.notFound.set(false);
    const query: AddonUsageQuery = { from: win.from, to: win.to, granularity };
    this.addonsSvc.getUsage(planId, query).subscribe({
      next: (result) => {
        this.loading.set(false);
        switch (result.kind) {
          case 'success':
            this.usage.set(result.usage);
            // If quota disappeared (BE sent quota_unit=null), reset metric.
            if (this.metric() === 'quota' && result.usage.quota_unit == null) {
              this.metric.set('seats');
            }
            return;
          case 'not-found':
            this.notFound.set(true);
            return;
          case 'unauthenticated':
            this.loadError.set('hplus.addons.usage.error.unauthenticated');
            return;
          case 'server-error':
          case 'network-error':
            this.loadError.set('hplus.addons.usage.error.serverError');
            return;
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('hplus.addons.usage.error.serverError');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private windowFor(period: PeriodPreset): { from: string; to: string } {
    const days = PERIOD_DAYS[period];
    const to = this.now;
    const from = new Date(to.getTime() - days * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  private metricValue(b: AddOnUsageBucket, m: Metric): number {
    switch (m) {
      case 'seats':
        return b.seats_used ?? 0;
      case 'quota':
        return b.quota_consumed ?? 0;
      case 'api_calls':
        return b.api_calls ?? 0;
    }
  }

  trackByBucket(_idx: number, b: AddOnUsageBucket): string {
    return b.bucket_start;
  }

  trackByConsumer(_idx: number, c: { user_id_pseudonymous: string }): string {
    return c.user_id_pseudonymous;
  }
}
