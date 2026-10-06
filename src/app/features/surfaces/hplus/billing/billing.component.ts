/**
 * H+ Billing & Invoices — Wave 4 (CHO-1773 + CHO-1777 + CHO-1778).
 *
 * Live data sources:
 *   - Invoices via TenantBillingService → CHO-1774 BE
 *   - Add-on breakdown + dunning state via TenantAddonsAdminService
 *     → CHO-1776/CHO-1777 BE. The `addons` signal drives BOTH the
 *     monthly breakdown panel (CHO-1778) AND the dunning banner
 *     (CHO-1777, via the past_due flag).
 *
 * The Resolve Billing CTA opens Stripe Customer Portal via
 * TenantBillingService.createCustomerPortalSession. Stripe smart-retry
 * then succeeds + emits `payment_recovered` → registry clears past_due
 * → next /h/addons fetch shows the banner gone.
 *
 * CHO-1778 closed the Stage 1 P0 audit gap: the hardcoded "Hub+ Standard
 * SGD 199/mo" label + the static $49/$39/$287 breakdown have been
 * removed. The breakdown now derives from the live /h/addons response;
 * the plan panel is gone (no real "plan" concept — tenants compose
 * add-ons). Catalogue currency is SGD per CHO-1787 (was USD per CHO-1760).
 */
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantBillingService } from '../../../admin/tenant-admin/services/tenant-billing.service';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import type {
  CreatePortalSessionResult,
  InvoiceRow,
  ListInvoicesResult,
} from '../../../admin/tenant-admin/models/tenant-billing.model';
import type { AdminAddonRow } from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

interface BreakdownLine {
  readonly code: string;
  readonly name: string;
  readonly cost_cents: number;
  readonly tier?: string;
}

/**
 * Stripe Price catalogue currency. SGD post-CHO-1787 (was USD per
 * CHO-1760). Drives the breakdown rows + total since the /h/addons
 * tile response carries no per-row currency — the catalogue is
 * platform-wide uniform.
 */
const CATALOGUE_CURRENCY = 'sgd';

@Component({
  selector: 'chora-hplus-billing',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.scss',
})
export class BillingComponent {
  private readonly billingSvc = inject(TenantBillingService);
  private readonly addonsSvc = inject(TenantAddonsAdminService);

  // ── Invoices (live) ─────────────────────────────────────────────────

  readonly invoices = signal<readonly InvoiceRow[]>([]);
  readonly invoicesLoading = signal(true);
  /** Discriminated `kind` from ListInvoicesResult on failure. */
  readonly invoicesError = signal<ListInvoicesResult['kind'] | null>(null);
  readonly hasNoInvoices = computed(
    () => !this.invoicesLoading() && this.invoices().length === 0 && this.invoicesError() === null,
  );

  // ── Portal session ──────────────────────────────────────────────────

  readonly portalLoading = signal(false);
  readonly portalError = signal<CreatePortalSessionResult['kind'] | null>(null);

  // ── Dunning (live via CHO-1776 past_due flag) ───────────────────────
  /**
   * Active addons fetched at mount. The `past_due` flag drives the
   * dunning banner — any row with past_due=true makes the banner
   * appear; all clean (or empty addons) hides it.
   */
  readonly addons = signal<readonly AdminAddonRow[]>([]);
  readonly dunning = computed(() =>
    this.addons().some((a) => a.past_due === true),
  );

  // ── Monthly cost breakdown (live via CHO-1778) ──────────────────────
  /**
   * Derived from the `addons` signal CHO-1777 already populates. Only
   * ACTIVE rows with a known `monthly_cost` count — DEACTIVATED rows
   * are inert, and pre-CHO-1776 BE responses can omit `monthly_cost`
   * (forward-compat). The hardcoded $49/$39/$287 SGD mock is gone.
   */
  readonly breakdownLines = computed<readonly BreakdownLine[]>(() =>
    this.addons()
      .filter((a) => a.status === 'ACTIVE' && a.monthly_cost != null)
      .map((a) => ({
        code: a.addon_code,
        name: a.display_name,
        cost_cents: a.monthly_cost as number,
        tier: a.current_tier,
      })),
  );
  readonly totalMonthlyCents = computed(() =>
    this.breakdownLines().reduce((s, l) => s + l.cost_cents, 0),
  );
  readonly hasBreakdown = computed(() => this.breakdownLines().length > 0);

  private readonly _showResolveModal = signal(false);
  readonly showResolveModal = this._showResolveModal.asReadonly();

  constructor() {
    this.fetchInvoices();
    this.fetchAddons();
  }

  /**
   * Fetches active addons so the dunning banner reflects the live
   * `past_due` flag. Non-blocking: a failed fetch silently leaves the
   * `addons` signal empty (banner stays hidden), avoiding a confusing
   * "something is wrong" state on the billing page when the addons
   * fetch is the unrelated failure.
   */
  fetchAddons(): void {
    this.addonsSvc.list().subscribe({
      next: (result) => {
        if (result.kind === 'success') {
          this.addons.set(result.rows);
        }
      },
    });
  }

  fetchInvoices(): void {
    this.invoicesLoading.set(true);
    this.invoicesError.set(null);
    this.billingSvc.listInvoices({ limit: 20 }).subscribe({
      next: (result) => {
        this.invoicesLoading.set(false);
        if (result.kind === 'success') {
          this.invoices.set(result.items);
        } else {
          this.invoicesError.set(result.kind);
        }
      },
      error: () => {
        this.invoicesLoading.set(false);
        this.invoicesError.set('server-error');
      },
    });
  }

  /**
   * Mint a one-shot Stripe Customer Portal session and redirect the
   * browser to it. The user manages payment methods + downloads
   * invoices + cancels add-ons on Stripe's hosted page; cancellation
   * events come back via the customer.subscription.deleted webhook
   * (deferred to CHO-1771).
   */
  manageBilling(): void {
    if (this.portalLoading()) return;
    this.portalLoading.set(true);
    this.portalError.set(null);
    const returnUrl =
      typeof window !== 'undefined'
        ? window.location.origin + '/h/billing'
        : '/h/billing';
    this.billingSvc
      .createCustomerPortalSession({ return_url: returnUrl })
      .subscribe({
        next: (result) => {
          if (result.kind === 'success') {
            // Redirect — keep `portalLoading` true so the button stays
            // disabled until navigation actually happens.
            if (typeof window !== 'undefined') {
              window.location.href = result.url;
            }
            return;
          }
          this.portalLoading.set(false);
          this.portalError.set(result.kind);
        },
        error: () => {
          this.portalLoading.set(false);
          this.portalError.set('server-error');
        },
      });
  }

  openResolve(): void {
    if (!this.dunning()) return;
    this._showResolveModal.set(true);
  }

  cancelResolve(): void {
    this._showResolveModal.set(false);
  }

  /**
   * Confirms the resolve flow: close the modal + redirect to Stripe
   * Customer Portal so the user updates their payment method. Stripe
   * smart-retry handles the actual charge; on success the
   * `payment_recovered` webhook clears the BE `past_due` flag, and the
   * next `/h/addons` fetch removes the banner.
   *
   * The local dunning state is NOT cleared here — that's the BE's
   * responsibility. The banner stays visible until the user returns
   * + the addons fetch shows past_due cleared.
   */
  confirmResolve(): void {
    this._showResolveModal.set(false);
    this.manageBilling();
  }

  // ── View helpers ────────────────────────────────────────────────────

  /** "SGD X.YY/mo" — catalogue currency per CHO-1787. */
  formatMonthly(cents: number): string {
    return `${this.formatCurrency(cents, CATALOGUE_CURRENCY)}/mo`;
  }

  /** "<CODE> X.YY" — honours the Stripe-emitted currency; falls back to
   * the SGD platform default (CHO-1787) when the BE omits the field. */
  formatCurrency(cents: number, currency: string): string {
    const abs = Math.abs(cents) / 100;
    const code = (currency || 'sgd').toUpperCase();
    return `${code} ${abs.toFixed(2)}`;
  }

  /** Renders a YYYY-MM-DD slice of an ISO timestamp for the table. */
  formatDate(iso: string): string {
    if (!iso) return '';
    const idx = iso.indexOf('T');
    return idx > 0 ? iso.slice(0, idx) : iso;
  }

  invoiceLabelKey(status: InvoiceRow['status']): string {
    return `hplus.billing.invoiceStatus.${status}`;
  }

  invoiceBadgeClass(status: InvoiceRow['status']): string {
    switch (status) {
      case 'paid':
        return 'badge badge-success';
      case 'open':
      case 'draft':
        return 'badge badge-warning';
      case 'void':
      case 'uncollectible':
        return 'badge badge-danger';
      default:
        return 'badge';
    }
  }

  trackByInvoice(_idx: number, inv: InvoiceRow): string {
    return inv.stripe_invoice_id;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this._showResolveModal()) this._showResolveModal.set(false);
  }

  handleBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) this.cancelResolve();
  }
}
