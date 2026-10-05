/**
 * InvoiceListComponent — Data table of billing invoices with status filtering.
 *
 * Route: /billing/invoices
 *
 * Features:
 *   - Tabular invoice list (number, period, amount, status, PDF)
 *   - Status filter dropdown
 *   - PDF download link
 *   - Accessible table markup
 *   - Loading skeleton and empty state
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

import { BillingService } from '../../services/billing.service';
import type { Invoice, InvoiceStatus } from '../../models/billing.model';
import {
  ALL_INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
} from '../../models/billing.model';

@Component({
  selector: 'chora-invoice-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './invoice-list.component.html',
  styleUrl: './invoice-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceListComponent implements OnInit, OnDestroy {
  private readonly billingService = inject(BillingService);
  // --- State ---
  readonly invoiceState = this.billingService.invoiceState;
  readonly invoices = this.billingService.invoices;

  // --- Filters ---
  readonly filterStatus = signal<InvoiceStatus | null>(null);

  // --- Constants ---
  readonly allStatuses = ALL_INVOICE_STATUSES;
  readonly statusLabels = INVOICE_STATUS_LABELS;

  // --- Computed ---
  readonly filteredInvoices = computed(() => {
    const status = this.filterStatus();
    const all = this.invoices();
    if (!status) return all;
    return all.filter((inv) => inv.status === status);
  });

  readonly isEmpty = computed(
    () => this.invoiceState().status === 'success' && this.filteredInvoices().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.billingService.loadInvoices().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onStatusFilter(value: string): void {
    this.filterStatus.set(value === '' ? null : value as InvoiceStatus);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  downloadPdf(invoice: Invoice): void {
    if (!invoice.pdf_url) return;
    window.open(invoice.pdf_url, '_blank', 'noopener,noreferrer');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatPrice(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount);
    } catch {
      return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
    }
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  statusClass(status: string): string {
    return `invoice-list__status--${status}`;
  }

  hasPdf(invoice: Invoice): boolean {
    return invoice.pdf_url !== null;
  }
}
