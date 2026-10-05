/**
 * O+ (Observability+) AI cost / usage dashboard.
 *
 * Mirrors the `OplusDashboardComponent` Phase-D hydration pattern:
 *   - Token + LLM cost rollups come from the polled `costs()` signal
 *     exposed by `GovernanceService` (`GET /bff/oplus/costs`).
 *   - The route returns the `CostData` object DIRECTLY with HTTP 200 —
 *     the FE derives live / stale / error from the HTTP status via the
 *     shared `buildPolled` + `classifyError` machinery.
 *   - The header badge is signal-driven: LIVE / STALE / OFFLINE /
 *     LOADING based on the `GovernanceState` discriminated union.
 *   - Auditor 403 → auditor-required gate; non-cached 5xx / net → error
 *     block; otherwise the live / stale data is rendered.
 *
 * Renders the cumulative cost headline plus two breakdown tables
 * (`by_model`, `by_agent`). Per [[ai-cost-tracking]] the canonical
 * billing-grade source is the TokenUsageLedger; O+ only surfaces the
 * pre-aggregated rollup the BFF returns — it never sums tokens itself.
 *
 * Surface accent: IMDA violet (`#7b2d8e`) primary + magenta (`#c4107b`)
 * secondary via the `.surface-oplus` accent class.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  GovernanceService,
  badgeVariant,
  hasData,
  type CostBucket,
  type CostData,
  type CostRange,
  type LiveBadgeVariant,
} from '../../../../../core/services/governance.service';

@Component({
  selector: 'chora-oplus-costs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './oplus-costs.component.html',
  styleUrl: './oplus-costs.component.scss',
})
export class OplusCostsComponent {
  private readonly svc = inject(GovernanceService);

  /** Polled cost state (LIVE / STALE / OFFLINE / LOADING). */
  protected readonly state = this.svc.costs();

  /** Active time-window filter (day / week / month / all). */
  protected readonly range = this.svc.costRange();

  /** Filter buttons, in display order. `all` is the default (all-time). */
  protected readonly rangeOptions: readonly { value: CostRange; key: string }[] = [
    { value: 'day', key: 'oplus.costs.filter_day' },
    { value: 'week', key: 'oplus.costs.filter_week' },
    { value: 'month', key: 'oplus.costs.filter_month' },
    { value: 'all', key: 'oplus.costs.filter_all' },
  ];

  /** Last-good payload — keeps the UI populated during STALE / loading. */
  protected readonly data = computed<CostData | null>(() => {
    const s = this.state();
    return hasData(s) ? s.data : null;
  });

  /** Cumulative spend across the reporting window (defaults to 0). */
  protected readonly cumulativeCost = computed<number>(() => this.data()?.cumulative_cost_usd ?? 0);

  /** Presentation currency code — defaults to USD when the BFF omits it. */
  protected readonly currency = computed<string>(() => this.data()?.currency ?? 'USD');

  /** Static USD→display FX rate — defaults to 1 (identity, no conversion). */
  protected readonly fxRate = computed<number>(() => this.data()?.fx_rate ?? 1);

  /** Spend + token rollup by model. */
  protected readonly byModel = computed<readonly CostBucket[]>(() => this.data()?.by_model ?? []);

  /** Spend + token rollup by agent. */
  protected readonly byAgent = computed<readonly CostBucket[]>(() => this.data()?.by_agent ?? []);

  /** LIVE / STALE / OFFLINE / LOADING badge variant. */
  protected readonly badge = computed<LiveBadgeVariant>(() => badgeVariant(this.state()));

  /** Translation key for the badge label. */
  protected readonly badgeKey = computed<string>(() => {
    switch (this.badge()) {
      case 'live':
        return 'oplus.dashboard.badge_live';
      case 'stale':
        return 'oplus.dashboard.badge_stale';
      case 'offline':
        return 'oplus.dashboard.badge_offline';
      default:
        return 'oplus.dashboard.badge_loading';
    }
  });

  /** Whether the page should show the auditor-required gate. */
  protected readonly isAuditorGated = computed<boolean>(() => {
    const s = this.state();
    return s.state === 'error' && s.error.kind === 'forbidden';
  });

  /** Whether the page should show the generic error block. */
  protected readonly hasErrorOnly = computed<boolean>(() => {
    const s = this.state();
    return s.state === 'error' && this.data() === null;
  });

  /** Error message key (resolved off the current state). */
  protected readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.state === 'error' ? s.error.messageKey : 'oplus.errors.generic';
  });

  // ─── Template helpers ───────────────────────────────────────────────

  /** Switch the cost time-window filter (re-polls costs in the service). */
  protected setRange(r: CostRange): void {
    this.svc.setCostRange(r);
  }

  /**
   * Format a canonical-USD amount in the active display currency (4dp — costs
   * are sub-cent). Multiplies by the configured FX rate and prefixes the
   * currency symbol. Default USD @ 1 renders exactly as before (`$x.xxxx`).
   */
  protected fmtMoney(usd: number): string {
    return `${this.currencySymbol(this.currency())}${(usd * this.fxRate()).toFixed(4)}`;
  }

  /** Symbol for a currency code; falls back to the code + space. */
  private currencySymbol(code: string): string {
    switch (code) {
      case 'USD':
        return '$';
      case 'SGD':
        return 'S$';
      default:
        return `${code} `;
    }
  }

  /** Format a token count with thousands separators. */
  protected fmtTokens(v: number): string {
    return v.toLocaleString();
  }
}
