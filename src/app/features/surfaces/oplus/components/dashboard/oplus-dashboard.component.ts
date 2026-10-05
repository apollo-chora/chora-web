/**
 * O+ (Observability+) AI Governance Dashboard — consolidated governance page.
 *
 * 2026-06-22 (synthetic-tinkering-fox plan): the former `/o/dimensions` page
 * was merged in. The dashboard now renders the per-dimension IMDA panels with
 * the priority-driven traffic-light signal + expandable rubric drill-down +
 * "View evidence ↗" links (sourced from the polled `dimensions()` signal),
 * replacing the meaningless raw `%` score cards and the decorative
 * 6-safety-risk-tile block (both removed). The header keeps the
 * LIVE / STALE / OFFLINE / LOADING badge, the Compliant / Review chip, and the
 * Recent-decisions counter (sourced from the polled `dashboard()` signal).
 *
 * `/o/dimensions` now redirects here — this is the single O+ governance page.
 *
 * Surface accent: IMDA violet (`#7b2d8e`) primary + magenta (`#c4107b`)
 * secondary via the `.surface-oplus` accent class. Dimension colour utilities
 * (`.dim-d1`..`.dim-d4`) come from `_imda-accents.scss`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  GovernanceService,
  badgeVariant,
  hasData,
  type DashboardData,
  type DimensionsData,
  type LiveBadgeVariant,
  type RubricStatus,
  type RubricPriority,
} from '../../../../../core/services/governance.service';
import {
  IMDA_DIMENSIONS,
  type DimensionStatus,
  type ImdaDimension,
} from '../../imda-dimensions';

/** Per-dimension card payload — assembled from BFF + design-time catalogue. */
interface DimensionCard {
  readonly dim: ImdaDimension;
  readonly score: number;
  readonly status: DimensionStatus;
  readonly rubric: readonly {
    readonly ref: string;
    readonly requirement: string;
    readonly toolCoverage: string;
    readonly status: RubricStatus;
    readonly evidenceUrl: string | null;
    readonly priority: RubricPriority | null;
  }[];
}

@Component({
  selector: 'chora-oplus-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './oplus-dashboard.component.html',
  styleUrl: './oplus-dashboard.component.scss',
})
export class OplusDashboardComponent {
  private readonly svc = inject(GovernanceService);

  /** ADR-141 canonical IMDA dimensions (D1..D4) — design-time invariant. */
  protected readonly dimensions = signal<readonly ImdaDimension[]>(IMDA_DIMENSIONS);

  /**
   * Primary state — the per-dimension rubric posture. Drives the panels, the
   * header LIVE/STALE badge, the auditor gate, and the error block.
   */
  protected readonly state = this.svc.dimensions();

  /**
   * Secondary state — the dashboard rollup. Supplies the header
   * Compliant/Review chip (`all_baseline_achieved`) + the Recent-decisions
   * counter (`recent_decisions_24h`); rendered defensively only when present.
   */
  protected readonly dashboardState = this.svc.dashboard();

  /** Cached dimensions payload — used to keep panels populated during STALE. */
  protected readonly data = computed<DimensionsData | null>(() => {
    const s = this.state();
    return hasData(s) ? s.data : null;
  });

  /** Cached dashboard rollup payload — header extras only. */
  protected readonly dashboardData = computed<DashboardData | null>(() => {
    const s = this.dashboardState();
    return hasData(s) ? s.data : null;
  });

  /** Composite per-card view-model — design-time catalogue × live payload. */
  protected readonly cards = computed<readonly DimensionCard[]>(() => {
    const d = this.data();
    const byNum = new Map<number, DimensionsData['dimensions'][number]>();
    // Defensive: a malformed `live` payload may lack the `dimensions` array —
    // never iterate an absent field or Angular CD aborts and raw i18n keys leak.
    if (d !== null && Array.isArray(d.dimensions)) {
      for (const entry of d.dimensions) {
        byNum.set(entry.num, entry);
      }
    }
    return this.dimensions().map((dim) => {
      const live = byNum.get(dim.num);
      return {
        dim,
        score: live?.score ?? 0,
        status: (live?.status ?? 'pending') as DimensionStatus,
        rubric: (live?.rubric_items ?? []).map((r) => ({
          ref: r.ref,
          requirement: r.requirement,
          toolCoverage: r.tool_coverage,
          status: r.status,
          evidenceUrl: r.evidence_source_url,
          priority: r.priority ?? null,
        })),
      };
    });
  });

  /** Track which dimension panels have their rubric expanded. */
  private readonly expanded = signal<Readonly<Record<1 | 2 | 3 | 4, boolean>>>({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  /** Overall posture flag — only meaningful when the rollup payload is present. */
  protected readonly allBaselineAchieved = computed<boolean>(() => {
    const d = this.dashboardData();
    return d?.all_baseline_achieved ?? false;
  });

  /** LIVE / STALE / OFFLINE / LOADING badge variant — driven by the panels. */
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

  protected isExpanded(num: 1 | 2 | 3 | 4): boolean {
    return this.expanded()[num];
  }

  protected toggleRubric(num: 1 | 2 | 3 | 4): void {
    const current = this.expanded();
    this.expanded.set({ ...current, [num]: !current[num] });
  }

  /** Stable id for aria-labelledby — generated per dimension number. */
  protected dimensionTitleId(num: number): string {
    return `oplus-dim-title-${num}`;
  }

  protected rubricRegionId(num: number): string {
    return `oplus-dim-rubric-region-${num}`;
  }

  protected trafficLegendId(num: number): string {
    return `oplus-dim-traffic-legend-${num}`;
  }

  /**
   * i18n key for a dimension status label. Drives both the visible label and
   * the traffic-light signal's accessible name (role=status + aria-label),
   * since the lamps themselves are decorative (aria-hidden).
   */
  protected statusLabelKey(status: DimensionStatus): string {
    switch (status) {
      case 'achieved':
        return 'oplus.dimensions.status_achieved';
      case 'partial':
        return 'oplus.dimensions.status_partial';
      case 'attention':
        return 'oplus.dimensions.status_attention';
      default:
        return 'oplus.dimensions.status_pending';
    }
  }

  /**
   * i18n key for a rubric item's priority badge accessible name (P1/P2/P3).
   * The badge text itself is the literal token; the aria-label spells out the
   * meaning ("Priority 1 — critical", etc.).
   */
  protected priorityAriaKey(priority: RubricPriority): string {
    switch (priority) {
      case 'P1':
        return 'oplus.dimensions.priority_p1_aria';
      case 'P2':
        return 'oplus.dimensions.priority_p2_aria';
      default:
        return 'oplus.dimensions.priority_p3_aria';
    }
  }

  /** Aggregate the rubric pass/partial/fail counts for the summary line. */
  protected rubricSummary(card: DimensionCard): {
    pass: number;
    partial: number;
    fail: number;
    total: number;
  } {
    let pass = 0;
    let partial = 0;
    let fail = 0;
    for (const item of card.rubric) {
      if (item.status === 'pass') pass++;
      else if (item.status === 'partial') partial++;
      else fail++;
    }
    return { pass, partial, fail, total: card.rubric.length };
  }
}
