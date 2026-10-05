import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { TenantContextService } from '../../../core/auth/tenant-context.service';
import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { RbacService } from '../../../core/services/rbac.service';
import {
  resolveActiveSurface,
} from '../../../features/surfaces/surface-nav';
import {
  canAccessSurface,
  canSeeSurfaceRail,
  SURFACE_LANDING,
} from '../../../features/surfaces/surface-access';
import {
  SURFACES,
  type SurfaceKey,
} from '../../../features/surfaces/surface-landing.component';

interface SurfaceRailEntry {
  readonly key: SurfaceKey;
  readonly letter: string;
  readonly shortName: string;
  readonly landing: string;
  readonly ariaKey: string;
}

// Brand wordmark order: the rail spells C,H,O,R,A. `isSurfaceKey` (membership
// test) and the fail-open `new Set<SurfaceKey>(RAIL_ORDER)` are order-
// independent — reordering here only changes the rendered `entries` sequence.
const RAIL_ORDER: readonly SurfaceKey[] = [
  'cplus',
  'hplus',
  'oplus',
  'rplus',
  'aplus',
];

function isSurfaceKey(value: string): value is SurfaceKey {
  return (RAIL_ORDER as readonly string[]).includes(value);
}

@Component({
  selector: 'chora-surface-rail',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './surface-rail.component.html',
  styleUrl: './surface-rail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurfaceRailComponent {
  private readonly router = inject(Router);
  private readonly tenantContext = inject(TenantContextService);
  private readonly flags = inject(FeatureFlagService);
  private readonly rbac = inject(RbacService);
  private readonly navTick = signal(0);

  readonly activeSurface = computed<SurfaceKey>(() => {
    this.navTick();
    return resolveActiveSurface(this.router.url);
  });

  /**
   * RBAC-visible surface set (auth-hardening Phase A §4.7a, CHO-1717 /
   * ADR-181): the BE mint carries per-membership `surfaces[]` (role-driven:
   * learner→[aplus,cplus], author→[aplus], instructor→[rplus],
   * tenant_admin→[hplus], auditor→[oplus] — `membership_server.go:183`).
   *
   * - ACTIVE tenant context set → use its membership's `surfaces[]`
   *   (falling back to the matching `availableTenants` membership when the
   *   active context was seeded without surfaces, e.g. the bare-JWT seed).
   * - No active tenant context → UNION of `surfaces[]` across memberships.
   * - No usable surface data anywhere (legacy `/api/v1/tenants` round-trip
   *   shapes carry no `surfaces`; pre-mint states; unknown tokens only) →
   *   **fail CLOSED to the active surface alone** (B1, UX refactor master
   *   plan section 3.1).
   *
   * The fallback used to be all five. That published every surface to a
   * session the mint had granted nothing, which made role-driven visibility
   * a property of the payload rather than of the rule: on a legacy shape a
   * learner-only session rendered the auditor's chip. Route guards still
   * refuse entry, so it was never an access breach, but the rail is the
   * evidence a reader sees and it was showing the wrong thing.
   *
   * Closed here is not empty. The chip for the surface being rendered right
   * now cannot be a dead-end, because the route guard has demonstrably
   * already admitted this session to it, so that one chip grants no
   * navigation the session did not already hold. Falling back to it instead
   * of to nothing keeps the shell recoverable without widening anything.
   * Note the ordering: `canAccessSurface` still runs afterwards, so an
   * un-entitled active surface is filtered out even here.
   */
  /**
   * Whether this session may see the rail at all (R39). Delegates to the ONE
   * definition in `surface-access.ts`, which the shell layout also calls to
   * reclaim the left edge when this is false.
   *
   * Public so the layout can size itself off the same answer.
   */
  readonly railVisible = computed<boolean>(() => canSeeSurfaceRail(this.rbac));

  private readonly visibleSurfaceKeys = computed<ReadonlySet<SurfaceKey>>(() => {
    const active = this.tenantContext.currentTenant();
    const memberships = this.tenantContext.availableTenants();

    let candidate: readonly string[] | undefined;
    if (active) {
      candidate =
        active.surfaces ??
        memberships.find((m) => m.id === active.id)?.surfaces;
    }
    if (candidate === undefined) {
      const union = memberships.flatMap((m) => m.surfaces ?? []);
      candidate = union.length > 0 ? union : undefined;
    }

    const known = (candidate ?? []).filter(isSurfaceKey);
    if (known.length === 0) {
      // Fail CLOSED: no usable surface data, so grant only the surface this
      // session is already on. `activeSurface` reads the router URL, which is
      // a route the guard has already admitted.
      return new Set<SurfaceKey>([this.activeSurface()]);
    }
    return new Set<SurfaceKey>(known);
  });

  /**
   * Rail entries filtered to the RBAC-visible surfaces AND the unified
   * add-on access rule, in CHORA order.
   *
   * Two composing gates (nav-fe reconciliation, CHO-1717 / ADR-181 + ADR-165):
   *  1. `visibleSurfaceKeys` — role-driven membership `surfaces[]` (fail-open).
   *  2. `canAccessSurface` — an add-on-gated surface (C+ → `cplus_social`) is
   *     shown IFF the active tenant is entitled OR the user is a
   *     `platform_operator`. This is the SAME predicate the route
   *     `addOnGuard` enforces (via `canAccessAddOn`), so the rail can never
   *     surface a dead-end the guard would redirect away from — and an
   *     operator is never stranded off a surface it can enter (god-mode).
   * Un-gated surfaces (A+/H+/O+/R+) pass gate 2 unconditionally.
   */
  readonly entries = computed<readonly SurfaceRailEntry[]>(() => {
    // R39 gate first: an ineligible session gets no rail, and no fallback
    // below can put a chip back.
    if (!this.railVisible()) return [];
    const visible = this.visibleSurfaceKeys();
    return RAIL_ORDER.filter((key) => visible.has(key))
      .filter((key) => canAccessSurface(key, this.flags, this.rbac))
      .map((key) => ({
        key,
        letter: SURFACES[key].letter,
        shortName: SURFACES[key].shortName,
        landing: SURFACE_LANDING[key],
        ariaKey: `surface_rail.${key}.aria`,
      }));
  });

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.navTick.update((n) => n + 1));
  }

  isActive(key: SurfaceKey): boolean {
    return this.activeSurface() === key;
  }
}
