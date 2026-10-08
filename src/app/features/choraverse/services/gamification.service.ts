import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  CoinAccount,
  CoinAccountState,
  CoinTransaction,
  CoinTransactionListState,
  SkinCatalogEntry,
  SkinCatalogState,
  KnowledgeBounty,
  BountyListState,
  EquipActionState,
} from '../models/gamification.model';

/**
 * GamificationService — manages reward store, coin economy, and bounty state via BFF.
 *
 * @see chora-contracts/openapi/choraverse.yaml
 */
@Injectable({ providedIn: 'root' })
export class GamificationService {
  private readonly bff = inject(BffClientService);

  private readonly skinsPath = '/api/v1/gamification/skins';
  private readonly coinsPath = '/api/v1/gamification/coins';
  private readonly transactionsPath = '/api/v1/gamification/coins/transactions';
  private readonly bountiesPath = '/api/v1/gamification/bounties';

  // --- State ---
  private readonly _skinCatalogState = signal<SkinCatalogState>({ status: 'idle' });
  readonly skinCatalogState = this._skinCatalogState.asReadonly();

  private readonly _coinAccountState = signal<CoinAccountState>({ status: 'idle' });
  readonly coinAccountState = this._coinAccountState.asReadonly();

  private readonly _transactionListState = signal<CoinTransactionListState>({ status: 'idle' });
  readonly transactionListState = this._transactionListState.asReadonly();

  private readonly _bountyListState = signal<BountyListState>({ status: 'idle' });
  readonly bountyListState = this._bountyListState.asReadonly();

  private readonly _equipActionState = signal<EquipActionState>({ status: 'idle' });
  readonly equipActionState = this._equipActionState.asReadonly();

  // --- Computed ---
  readonly skins = computed(() => {
    const s = this._skinCatalogState();
    return s.status === 'success' ? s.skins : [];
  });

  readonly coinBalance = computed(() => {
    const s = this._coinAccountState();
    return s.status === 'success' ? s.account.balance : 0;
  });

  readonly transactions = computed(() => {
    const s = this._transactionListState();
    return s.status === 'success' ? s.transactions : [];
  });

  readonly bounties = computed(() => {
    const s = this._bountyListState();
    return s.status === 'success' ? s.bounties : [];
  });

  // ---------------------------------------------------------------------------
  // Skins catalog
  // ---------------------------------------------------------------------------

  loadSkins(): Observable<SkinCatalogEntry[] | null> {
    this._skinCatalogState.set({ status: 'loading' });

    return this.bff.get<{ data: SkinCatalogEntry[] }>(this.skinsPath).pipe(
      tap((res) => {
        this._skinCatalogState.set({ status: 'success', skins: res.data });
      }),
      map((res) => res.data),
      catchError((err: Error) => {
        this._skinCatalogState.set({
          status: 'error',
          error: { code: 'SKINS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  equipSkin(skinId: string, slot: string): Observable<boolean> {
    this._equipActionState.set({ status: 'submitting' });

    return this.bff.put<unknown>(
      `/api/v1/gamification/skins/equipment/${slot}`,
      { skin_award_id: skinId },
    ).pipe(
      tap(() => {
        this._equipActionState.set({ status: 'success' });
        // Update local skin state
        const current = this._skinCatalogState();
        if (current.status === 'success') {
          const updatedSkins = current.skins.map((s) =>
            s.id === skinId ? { ...s, is_equipped: true } : s,
          );
          this._skinCatalogState.set({ ...current, skins: updatedSkins });
        }
      }),
      map(() => true),
      catchError((err: Error) => {
        this._equipActionState.set({
          status: 'error',
          error: { code: 'EQUIP_FAILED', message: err.message },
        });
        return of(false);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Coin account
  // ---------------------------------------------------------------------------

  loadCoinAccount(): Observable<CoinAccount | null> {
    this._coinAccountState.set({ status: 'loading' });

    return this.bff.get<CoinAccount>(this.coinsPath).pipe(
      tap((account) => {
        this._coinAccountState.set({ status: 'success', account });
      }),
      catchError((err: Error) => {
        this._coinAccountState.set({
          status: 'error',
          error: { code: 'COINS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  loadTransactions(): Observable<CoinTransaction[] | null> {
    this._transactionListState.set({ status: 'loading' });

    return this.bff.get<{ data: CoinTransaction[] }>(this.transactionsPath).pipe(
      tap((res) => {
        this._transactionListState.set({ status: 'success', transactions: res.data });
      }),
      map((res) => res.data),
      catchError((err: Error) => {
        this._transactionListState.set({
          status: 'error',
          error: { code: 'TRANSACTIONS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Bounties
  // ---------------------------------------------------------------------------

  loadBounties(): Observable<KnowledgeBounty[] | null> {
    this._bountyListState.set({ status: 'loading' });

    return this.bff.get<{ data: KnowledgeBounty[] }>(this.bountiesPath).pipe(
      tap((res) => {
        this._bountyListState.set({ status: 'success', bounties: res.data });
      }),
      map((res) => res.data),
      catchError((err: Error) => {
        this._bountyListState.set({
          status: 'error',
          error: { code: 'BOUNTIES_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this._skinCatalogState.set({ status: 'idle' });
    this._coinAccountState.set({ status: 'idle' });
    this._transactionListState.set({ status: 'idle' });
    this._bountyListState.set({ status: 'idle' });
    this._equipActionState.set({ status: 'idle' });
  }
}
