/**
 * H+ Add-on Lifecycle Post-Setup Management Dashboard
 * (CHO-1698 STITCH-H-ADD-1).
 *
 * Wave 2 shipped a 3-tile mock with cost-contribution per add-on; this
 * iteration rewires the component to the real BFF (`chora-tenancy`
 * via the gateway alias `GET /api/v1/admin/tenants/me/addons`,
 * landed in CHO-1698 PR 1). The tile model is now richer: status,
 * tier, seats used, billing cycle end, compliance lock.
 *
 * Out-of-scope sibling stories on epic CHO-1697:
 *   - STITCH-H-ADD-2 deactivation modal — surfaces "Coming soon" toast.
 *   - STITCH-H-ADD-3 usage analytics — same.
 *   - STITCH-H-ADD-4 change tier — same.
 *   - STITCH-H-ADD-5 marketplace detail — same.
 *   - Pub/Sub read-side projection — v1 polls on visibilitychange +
 *     manual Refresh button.
 *
 * Component keeps the existing `chora-hplus-addons` selector + the
 * `[data-testid="hplus-addons"]` root so its place in the H+ nav and
 * any Playwright fixtures that target this surface keep working.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import {
  AdminAddonRow,
  AdminAddonStatus,
  DeactivateAddonResult,
  normaliseAddonStatus,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';
import { AddonDeactivateModalComponent } from './addon-deactivate-modal.component';

/** Status filter chip values — `all` is the no-filter sentinel. */
type StatusChip = 'all' | 'active' | 'pending' | 'suspended';

/**
 * Always-on baseline addon codes (CHO-1749 / CHO-1745 Sub 4). The
 * management `/api/v1/admin/tenants/me/addons` list endpoint pre-dates
 * the marketplace `system` flag (CHO-1747) so the FE classifies the row
 * here. Extend this set if / when more system plans (`compliance_core`,
 * `audit_baseline`) arrive — and ideally drive it from a BE list-endpoint
 * extension in a follow-up.
 */
const SYSTEM_ADDON_CODES: ReadonlySet<string> = new Set(['base']);

/**
 * CHO-1755 — turn the raw `current_tier` code from `AdminAddonRow`
 * into a human-friendly label for the management tile.
 *
 * The BE list endpoint ships tier codes verbatim (`pro`, `default`,
 * `tenant_admin`, ...); the tile was rendering those raw. Pure helper
 * to keep the formatting decision out of the template + easy to unit
 * test alongside the rest of the tile view-model.
 *
 * Returns `'—'` when the input is missing — matches the pre-CHO-1755
 * fallback used by `AddonTileVm.tier`.
 */
function formatTierLabel(code: string | null | undefined): string {
  const trimmed = (code ?? '').trim();
  if (!trimmed) {
    return '–';
  }
  return trimmed
    .split(/[_-]+/)
    .map((word) =>
      word.length === 0 ? '' : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .filter((w) => w.length > 0)
    .join(' ');
}

/** Tile view-model — derived from `AdminAddonRow` for the template. */
interface AddonTileVm {
  readonly addonPlanId: string;
  readonly displayName: string;
  readonly addonCode: string;
  readonly status: AdminAddonStatus;
  readonly tier: string;
  readonly seatsUsed: number;
  readonly billingCycleEnd: string | null;
  readonly lastUsageRollupAt: string | null;
  readonly complianceLocked: boolean;
  /**
   * CHO-1772 — pending end-of-cycle tier change. When both fields
   * are populated the tile renders a "<scheduledTier> starting <date>"
   * badge underneath the current tier line.
   */
  readonly scheduledTier: string | null;
  readonly scheduledEffectiveAt: string | null;
  /**
   * CHO-1782 — pending end-of-cycle deactivation. When status is
   * `deactivating` (normalised from BE `PENDING_DEACTIVATION`) AND
   * the date is populated, the tile renders the destructive
   * "Deactivating <date>" pill underneath the current tier line.
   * Cleared by the subscription_cancelled subscriber (CHO-1783) when
   * Stripe anchors the cancellation at cycle end.
   */
  readonly deactivationEffectiveAt: string | null;
  /**
   * True when the row maps to an always-on baseline plan (CHO-1749).
   * Drives the `Included by default` badge + Deactivate-disabled gate
   * on the management tile. Independent of `complianceLocked`.
   */
  readonly system: boolean;
}

@Component({
  selector: 'chora-hplus-addons',
  standalone: true,
  imports: [FormsModule, TranslatePipe, AddonDeactivateModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addon-management.component.html',
  styleUrl: './addon-management.component.scss',
})
export class AddonManagementComponent {
  private readonly addonsSvc = inject(TenantAddonsAdminService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  /** Raw rows from the server, before filter / search applied. */
  private readonly _rows = signal<readonly AdminAddonRow[]>([]);

  /** Current status filter chip selection. */
  readonly statusFilter = signal<StatusChip>('all');

  /** Free-text search filter (case-insensitive substring on display name). */
  readonly searchTerm = signal<string>('');

  /**
   * Deactivation modal target (CHO-1731 STITCH-H-ADD-2). When non-null,
   * the modal renders + the dashboard pauses interactions on that tile.
   */
  readonly deactivateTarget = signal<AddonTileVm | null>(null);

  // ---------------------------------------------------------------------------
  // Computed view model
  // ---------------------------------------------------------------------------

  /** Mapped tile view-models in their canonical order (BE-provided). */
  readonly allTiles = computed<readonly AddonTileVm[]>(() =>
    this._rows().map((row) => this.toTile(row)),
  );

  /** Tiles after filter + search. The empty state uses this — empty
   *  here can mean "no rows at all" OR "filter excludes everything". */
  readonly tiles = computed<readonly AddonTileVm[]>(() => {
    const chip = this.statusFilter();
    const term = this.searchTerm().trim().toLowerCase();
    return this.allTiles().filter((t) => {
      if (chip !== 'all' && t.status !== chip) return false;
      if (term.length > 0 && !t.displayName.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  });

  readonly hasAnyRows = computed(() => this._rows().length > 0);
  readonly isEmpty = computed(
    () => !this.loading() && this.tiles().length === 0,
  );

  constructor() {
    this.reload();
    // Auto-refresh when the tab returns to the foreground — v1 stand-in
    // for the Pub/Sub read-side projection (separate sub-story).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        this.reload();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  // ---------------------------------------------------------------------------
  // Hydration
  // ---------------------------------------------------------------------------

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.addonsSvc.list().subscribe({
      next: (result) => {
        this.loading.set(false);
        switch (result.kind) {
          case 'success':
            this._rows.set(result.rows);
            return;
          case 'unauthenticated':
            this.loadError.set('hplus.addons.unauthenticated');
            return;
          case 'server-error':
          case 'network-error':
            this.loadError.set('hplus.addons.serverError');
            return;
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('hplus.addons.serverError');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Filter / search bindings (template uses set()/update())
  // ---------------------------------------------------------------------------

  setStatusFilter(chip: StatusChip): void {
    this.statusFilter.set(chip);
  }

  isFilterActive(chip: StatusChip): boolean {
    return this.statusFilter() === chip;
  }

  // ---------------------------------------------------------------------------
  // Per-tile actions (deferred sub-stories → toast for v1)
  // ---------------------------------------------------------------------------

  onUsage(tile: AddonTileVm): void {
    this.router.navigate(['/h/addons', tile.addonPlanId, 'usage']);
  }
  onChangeTier(tile: AddonTileVm): void {
    this.router.navigate(['/h/addons', tile.addonPlanId, 'change-tier']);
  }
  onDeactivate(tile: AddonTileVm): void {
    // CHO-1749 — system plans (`base` today) cannot be deactivated. BE
    // returns 400 `cannot_unsubscribe_base`; the FE gate prevents the
    // request from firing at all.
    if (tile.system || tile.complianceLocked) return;
    this.deactivateTarget.set(tile);
  }
  onMarketplace(tile: AddonTileVm): void {
    this.router.navigate(['/h/addons', tile.addonPlanId, 'detail']);
  }

  onDeactivated(result: DeactivateAddonResult): void {
    this.deactivateTarget.set(null);
    const key =
      result.kind === 'success-scheduled'
        ? 'hplus.addons.deactivate.successScheduled'
        : 'hplus.addons.deactivate.successImmediate';
    this.toast.show(key, 'success');
    this.reload();
  }

  onDeactivateDismissed(): void {
    this.deactivateTarget.set(null);
  }

  // ---------------------------------------------------------------------------
  // CHO-1785 — undo a pending end-of-cycle deactivation. Per-tile signal
  // so multiple in-flight tiles don't share state; cleared on
  // success/error before reload.
  // ---------------------------------------------------------------------------

  readonly cancelInFlightFor = signal<string | null>(null);

  isCancelInFlight(tile: AddonTileVm): boolean {
    return this.cancelInFlightFor() === tile.addonPlanId;
  }

  onCancelDeactivation(tile: AddonTileVm): void {
    if (this.cancelInFlightFor() !== null) return;
    this.cancelInFlightFor.set(tile.addonPlanId);
    this.addonsSvc.cancelScheduledDeactivation(tile.addonPlanId).subscribe({
      next: (result) => {
        this.cancelInFlightFor.set(null);
        switch (result.kind) {
          case 'success':
            this.toast.show('hplus.addons.cancelDeactivation.success', 'success');
            this.reload();
            return;
          case 'already-deactivated':
            this.toast.show('hplus.addons.cancelDeactivation.error.alreadyDeactivated', 'error');
            this.reload();
            return;
          case 'not-found':
            this.toast.show('hplus.addons.cancelDeactivation.error.notFound', 'error');
            return;
          case 'unauthenticated':
          case 'forbidden':
            this.toast.show('hplus.addons.cancelDeactivation.error.forbidden', 'error');
            return;
          case 'server-error':
          case 'network-error':
            this.toast.show('hplus.addons.cancelDeactivation.error.serverError', 'error');
            return;
        }
      },
      error: () => {
        this.cancelInFlightFor.set(null);
        this.toast.show('hplus.addons.cancelDeactivation.error.serverError', 'error');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------

  statusBadgeClass(status: AdminAddonStatus): string {
    switch (status) {
      case 'active':
        return 'badge badge-success';
      case 'pending':
        return 'badge badge-warning';
      case 'suspended':
      case 'deactivating':
        return 'badge badge-danger';
      default:
        return 'badge badge-muted';
    }
  }

  statusLabelKey(status: AdminAddonStatus): string {
    return `hplus.addons.status.${status}`;
  }

  trackByPlanId(_idx: number, tile: AddonTileVm): string {
    return tile.addonPlanId;
  }

  // ---------------------------------------------------------------------------
  // Esc resets search (parity with the prior modal-driven Esc handler).
  // ---------------------------------------------------------------------------

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.searchTerm().length > 0) {
      this.searchTerm.set('');
    }
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  /**
   * Format an ISO timestamp as YYYY-MM-DD for the scheduled-tier
   * badge ("Pro starting 2026-07-15"). Falls back to the raw string
   * on parse failure so the user still sees something.
   */
  formatScheduledDate(iso: string): string {
    const idx = iso.indexOf('T');
    return idx > 0 ? iso.slice(0, idx) : iso;
  }

  private toTile(row: AdminAddonRow): AddonTileVm {
    return {
      addonPlanId: row.addon_plan_id,
      displayName: row.display_name,
      addonCode: row.addon_code,
      status: normaliseAddonStatus(row.status),
      tier: formatTierLabel(row.current_tier),
      seatsUsed: row.seats_used ?? 0,
      // CHO-1784 — prefer the Stripe-derived next_renewal_at (now emitted
      // by the list endpoint) over the legacy billing_cycle_end field;
      // either populates the deactivate modal's effective_at on the
      // end_of_cycle path.
      billingCycleEnd: row.next_renewal_at ?? row.billing_cycle_end ?? null,
      lastUsageRollupAt: row.last_usage_rollup_at ?? null,
      complianceLocked: row.compliance_locked ?? false,
      system: SYSTEM_ADDON_CODES.has(row.addon_code),
      scheduledTier: row.scheduled_tier_code
        ? formatTierLabel(row.scheduled_tier_code)
        : null,
      scheduledEffectiveAt: row.scheduled_effective_at ?? null,
      deactivationEffectiveAt:
        normaliseAddonStatus(row.status) === 'deactivating'
          ? (row.deactivation_effective_at ?? null)
          : null,
    };
  }
}
