import {
  Component,
  ChangeDetectionStrategy,
  computed,
  input,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { RbacService } from '../../../core/services/rbac.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import {
  resolveActiveSurface,
  SURFACE_NAV_CONFIGS,
  type NavItem,
} from '../../../features/surfaces/surface-nav';
import { isNavItemVisible } from '../../../features/surfaces/surface-access';
import type { SurfaceKey } from '../../../features/surfaces/surface-landing.component';

// Re-export NavItem so existing imports keep compiling. Surface agents should
// import directly from `features/surfaces/surface-nav` going forward.
export type { NavItem } from '../../../features/surfaces/surface-nav';

/**
 * Maps the surface-owned semantic `NavItem.icon` names to FontAwesome 6.4.0
 * (free, solid) classes. FA is loaded globally via `index.html`. The nav
 * configs stay framework-agnostic (semantic names) — this presenter owns the
 * FA coupling. Every name currently used across the 5 surface nav configs is
 * mapped explicitly; `iconClass` falls back to a neutral glyph for any
 * unmapped name rather than guessing a (possibly nonexistent) `fa-{name}`.
 */
const ICON_CLASS: Readonly<Record<string, string>> = {
  bolt: 'fa-solid fa-bolt',
  'book-open': 'fa-solid fa-book-open',
  briefcase: 'fa-solid fa-briefcase',
  broadcast: 'fa-solid fa-tower-broadcast',
  building: 'fa-solid fa-building',
  calendar: 'fa-solid fa-calendar',
  'calendar-check': 'fa-solid fa-calendar-check',
  certificate: 'fa-solid fa-certificate',
  'clipboard-check': 'fa-solid fa-clipboard-check',
  'clipboard-list': 'fa-solid fa-clipboard-list',
  'clipboard-question': 'fa-solid fa-clipboard-question',
  coins: 'fa-solid fa-coins',
  compass: 'fa-solid fa-compass',
  'wand-magic-sparkles': 'fa-solid fa-wand-magic-sparkles',
  cpu: 'fa-solid fa-microchip',
  'credit-card': 'fa-solid fa-credit-card',
  'file-lines': 'fa-solid fa-file-lines',
  fire: 'fa-solid fa-fire',
  flag: 'fa-solid fa-flag',
  // O+ agent-eval drill-down (CHO-1678). FA free has no fa-flask-conical;
  // fa-flask is the free-solid equivalent glyph.
  'flask-conical': 'fa-solid fa-flask',
  gauge: 'fa-solid fa-gauge',
  'gauge-high': 'fa-solid fa-gauge-high',
  // H+ external-egress ('globe') and O+ egress-kill-switch ('power') both
  // shipped unmapped, so each rendered the neutral dot in its own sidebar.
  globe: 'fa-solid fa-globe',
  'graduation-cap': 'fa-solid fa-graduation-cap',
  grid: 'fa-solid fa-table-cells-large',
  hexagon: 'fa-solid fa-shapes',
  inbox: 'fa-solid fa-inbox',
  // H+ ownership handover (E3). Unmapped icons render the neutral dot, which
  // is what the all-five-nav-configs spec exists to catch.
  key: 'fa-solid fa-key',
  layers: 'fa-solid fa-layer-group',
  map: 'fa-solid fa-map',
  palette: 'fa-solid fa-palette',
  paw: 'fa-solid fa-paw',
  pen: 'fa-solid fa-pen',
  'people-group': 'fa-solid fa-people-group',
  pet: 'fa-solid fa-paw',
  plug: 'fa-solid fa-plug',
  // FA Free names this glyph 'power-off', not 'power'.
  power: 'fa-solid fa-power-off',
  puzzle: 'fa-solid fa-puzzle-piece',
  receipt: 'fa-solid fa-receipt',
  shield: 'fa-solid fa-shield-halved',
  'shield-halved': 'fa-solid fa-shield-halved',
  shop: 'fa-solid fa-shop',
  trophy: 'fa-solid fa-trophy',
  user: 'fa-solid fa-user',
  users: 'fa-solid fa-users',
  wallet: 'fa-solid fa-wallet',
  // C+ nav icons — these were missing, causing 3 items (Duels, Profiler,
  // Connections) to fall back to fa-circle-dot (the same dot icon).
  // Mapped to appropriate FA 6.4.0 Free glyphs:
  swords: 'fa-solid fa-bolt', // duels — FA Free has no fa-swords; bolt evokes fast combat
  'user-gear': 'fa-solid fa-user-gear', // profiler — user + settings gear
  link: 'fa-solid fa-link', // connections — link/chain icon
};

const ICON_FALLBACK = 'fa-solid fa-circle-dot';

/**
 * Band metadata for grouped surfaces (CHO-2243, R+ nav de-shadow R1).
 *
 * The canonical render order + label + collapsibility of each nav band. A
 * `NavItem.group` value keys into this list; items with no group render flat
 * above the bands with no header (A+/C+/H+/O+). Only ADMIN is collapsible —
 * the training-admin tail folds away so the lifecycle bands stay prominent.
 * An unknown group value falls back to a headerless flat run so a mis-tagged
 * item is never silently dropped.
 *
 * R4 (CHO-2269) adds `defaultCollapsed`: ADMIN starts FOLDED, which is the
 * whole "collapse the admin tail behind one Admin door" consolidation. R1
 * shipped the band collapsible but defaulted it open, so the 7-item tail was
 * still fully visible on every load. No `/r/admin` index route is built: it
 * would list the same links the band already holds, behind an extra hop, and
 * would add a newly-guarded route to the ADR-239 proctor seam for no gain.
 * `defaultCollapsed` is deliberately per-band data (not an `admin` literal in
 * the component) so a second folding band never needs a code change here.
 */
interface NavBandMeta {
  readonly key: string;
  readonly labelKey: string;
  readonly collapsible: boolean;
  /** Folded on first render. Only meaningful when `collapsible`. */
  readonly defaultCollapsed: boolean;
}

const NAV_BANDS: readonly NavBandMeta[] = [
  { key: 'deliver', labelKey: 'rplus.nav.band.deliver', collapsible: false, defaultCollapsed: false },
  { key: 'schedule', labelKey: 'rplus.nav.band.schedule', collapsible: false, defaultCollapsed: false },
  { key: 'live', labelKey: 'rplus.nav.band.live', collapsible: false, defaultCollapsed: false },
  { key: 'assess', labelKey: 'rplus.nav.band.assess', collapsible: false, defaultCollapsed: false },
  { key: 'records', labelKey: 'rplus.nav.band.records', collapsible: false, defaultCollapsed: false },
  { key: 'admin', labelKey: 'rplus.nav.band.admin', collapsible: true, defaultCollapsed: true },
];

/** A band paired with the items that declared its key, in nav-config order. */
interface RenderedBand extends NavBandMeta {
  readonly items: readonly NavItem[];
}

@Component({
  selector: 'chora-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  collapsed = input(false);

  private readonly flags = inject(FeatureFlagService);
  // exposed `protected` (instead of private) so tests can spy on
  // `hasCapability` without needing to inject the service into the
  // TestBed providers list — the spec already constructs a real
  // RbacService via the default injector. The runtime contract is
  // unchanged.
  protected readonly rbac = inject(RbacService);
  private readonly router = inject(Router);

  // Bumped on every NavigationEnd to invalidate `activeSurface`. Tests can mock
  // `router.url` and bump this signal to force a recompute.
  private readonly navTick = signal(0);

  readonly activeSurface = computed<SurfaceKey>(() => {
    // Subscribe to navTick so the computed re-runs on each navigation event.
    this.navTick();
    return resolveActiveSurface(this.router.url);
  });

  /**
   * The active surface's nav items, or none.
   *
   * `SURFACE_NAV_CONFIGS` is deliberately partial: A+ has no sidebar config
   * because A+ has no sidebar (the compass bar replaced it, and this component
   * is not rendered at all when `usesCompass()`). An absent key yields an
   * empty nav rather than `undefined`, so a surface added to the union before
   * its config exists renders a bare rail instead of throwing.
   */
  readonly navItems = computed<readonly NavItem[]>(
    () => SURFACE_NAV_CONFIGS[this.activeSurface()] ?? [],
  );

  /**
   * Items with no `group` — rendered flat, above the bands, with no header.
   * This is every A+/C+/H+/O+ item (they carry no group) and keeps their
   * sidebars byte-identical to the pre-R1 flat render.
   */
  readonly ungroupedItems = computed<readonly NavItem[]>(() =>
    this.navItems().filter((i) => !i.group),
  );

  /**
   * The nav's items bucketed into bands in canonical order, PLUS a trailing
   * catch-all for any unknown group key (fail-loud: a mis-tagged item still
   * renders rather than vanishing). Empty bands are dropped. Membership is a
   * pure function of the nav config; per-item visibility is applied in the
   * template via `isVisible` so entitlement/role changes stay reactive.
   */
  readonly bands = computed<readonly RenderedBand[]>(() => {
    const items = this.navItems();
    const known = new Set(NAV_BANDS.map((b) => b.key));
    const out: RenderedBand[] = [];
    for (const band of NAV_BANDS) {
      const bandItems = items.filter((i) => i.group === band.key);
      if (bandItems.length > 0) {
        out.push({ ...band, items: bandItems });
      }
    }
    // Any grouped item whose band key is not canonical: surface it under its
    // own literal-keyed, non-collapsible run so nothing is silently lost.
    const orphanKeys = [...new Set(items.map((i) => i.group).filter((g): g is string => !!g && !known.has(g)))];
    for (const key of orphanKeys) {
      out.push({
        key,
        labelKey: key,
        collapsible: false,
        defaultCollapsed: false,
        items: items.filter((i) => i.group === key),
      });
    }
    return out;
  });

  /**
   * Band keys currently folded. Seeded from `NAV_BANDS.defaultCollapsed`
   * (derived, never hand-listed) so the ADMIN door starts shut on every load.
   * Toggling is session-local: the fold state is deliberately NOT persisted,
   * so a fresh load always re-presents the one-door default.
   */
  private readonly collapsedBands = signal<ReadonlySet<string>>(
    new Set(NAV_BANDS.filter((b) => b.collapsible && b.defaultCollapsed).map((b) => b.key)),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.navTick.update((n) => n + 1));
  }

  /** True when a collapsible band is currently folded (default: expanded). */
  isBandCollapsed(key: string): boolean {
    return this.collapsedBands().has(key);
  }

  /** Toggle a collapsible band's folded state (ADMIN only, per NAV_BANDS). */
  toggleBand(key: string): void {
    this.collapsedBands.update((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  /** True when at least one item in the band passes the visibility gate. */
  bandHasVisibleItems(band: RenderedBand): boolean {
    return band.items.some((i) => this.isVisible(i));
  }

  /**
   * Delegates to the shared `isNavItemVisible` so the sidebar and the A+
   * compass bar filter the same `NavItem`s through ONE fail-closed rule. The
   * rule itself moved to `surface-access.ts` with C2; this stays as the
   * template's entry point.
   */
  isVisible(item: NavItem): boolean {
    return isNavItemVisible(item, this.flags, this.rbac);
  }

  /** FontAwesome class string for a NavItem's semantic icon name. */
  iconClass(icon: string): string {
    return ICON_CLASS[icon] ?? ICON_FALLBACK;
  }
}
