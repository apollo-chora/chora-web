/**
 * TransactionHistoryComponent — Chronological coin transaction ledger.
 *
 * Displays earned/spent/refunded transactions with type badges and amount prefixes.
 *
 * @see chora-contracts/openapi/gamification.yaml (CoinTransaction)
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { GamificationService } from '../../services/gamification.service';
import { TRANSACTION_TYPE_LABELS } from '../../models/gamification.model';
import type { CoinTransaction, CoinTransactionType } from '../../models/gamification.model';

@Component({
  selector: 'chora-transaction-history',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './transaction-history.component.html',
  styleUrl: './transaction-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionHistoryComponent implements OnInit, OnDestroy {
  private readonly gamificationService = inject(GamificationService);
  private readonly toast = inject(ToastService);

  // --- Constants ---
  readonly typeLabels = TRANSACTION_TYPE_LABELS;

  // --- Computed ---
  readonly transactionListState = this.gamificationService.transactionListState;
  readonly transactions = this.gamificationService.transactions;
  readonly coinBalance = this.gamificationService.coinBalance;

  readonly isLoading = computed(() => this.transactionListState().status === 'loading');
  readonly isEmpty = computed(
    () => !this.isLoading() && this.transactions().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadTransactions();
    this.loadCoinAccount();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  private loadTransactions(): void {
    this.subscriptions.add(
      this.gamificationService.loadTransactions().subscribe({
        error: () => {
          this.toast.show('choraverse.transactions.load_error', 'error');
        },
      }),
    );
  }

  private loadCoinAccount(): void {
    this.subscriptions.add(
      this.gamificationService.loadCoinAccount().subscribe(),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  amountPrefix(transaction: CoinTransaction): string {
    return transaction.amount >= 0 ? '+' : '';
  }

  typeClass(type: CoinTransactionType): string {
    return `transaction-history__type--${type}`;
  }

  amountClass(amount: number): string {
    if (amount > 0) return 'transaction-history__amount--positive';
    if (amount < 0) return 'transaction-history__amount--negative';
    return '';
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
