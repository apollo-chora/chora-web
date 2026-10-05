import { expect } from 'vitest';
import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { WalletComponent } from './wallet.component';
import { MeManaService } from '../../../../core/services/me-mana.service';
import { TranslateService } from '../../../../core/services/translate.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TransactionRealtimeService } from '../../../../shared/components/transaction-history/transaction-realtime.service';

// The inline <chora-transaction-history> child (CHO-2238) owns its own fetch;
// mock at the BffClient seam (the H+ transactions spec pattern) — synchronous
// of(...) responses keep the wallet's fakeAsync poll tests XHR-free.
const emptyTxSummary = {
  total_count: 0,
  amount_minor_by_currency: {},
  total_mana_topped_up: 0,
  total_mana_spent: 0,
  count_by_kind: {},
  count_by_status: {},
  window_from: '2026-04-01T00:00:00Z',
  window_to: '2026-06-29T00:00:00Z',
};

function fakeBff() {
  return {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.endsWith('/summary')) return of(emptyTxSummary);
      return of({ items: [], next_page_token: null, has_more: false });
    }),
    getBlob: vi.fn().mockReturnValue(of(new Blob())),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function fakeMana() {
  const loadState = signal<any>({
    status: 'success',
    mana: { balance_units: 0, lifetime_earned: 0, lifetime_spent: 0, subsidy_breakdown: [] },
  });
  const checkoutState = signal<any>({ status: 'idle' });
  const balanceUnits = signal<number>(0);
  const mana = signal<any>({
    balance_units: 0,
    lifetime_earned: 0,
    lifetime_spent: 0,
    subsidy_breakdown: [],
  });
  return {
    loadState,
    checkoutState,
    balanceUnits,
    mana,
    load: vi.fn(),
    checkoutMana: vi.fn(),
  };
}

function fakeRoute(manaTopup: string | null) {
  return {
    snapshot: {
      queryParamMap: { get: (k: string) => (k === 'mana_topup' ? manaTopup : null) },
    },
  };
}

function setup(manaTopup: string | null = null) {
  const mana = fakeMana();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: BffClientService, useValue: fakeBff() },
      {
        provide: TransactionRealtimeService,
        useValue: { stream$: of(), disconnect: vi.fn(), emit: vi.fn() },
      },
      { provide: MeManaService, useValue: mana },
      { provide: ActivatedRoute, useValue: fakeRoute(manaTopup) },
      { provide: TranslateService, useValue: { instant: (k: string) => k } },
    ],
  });
  const fixture = TestBed.createComponent(WalletComponent);
  fixture.detectChanges();
  return { fixture, mana };
}

describe('WalletComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the balance on init', () => {
    const { mana } = setup();
    expect(mana.load).toHaveBeenCalled();
  });

  it('renders the current balance + the three mana packs', () => {
    const { fixture } = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="wallet-balance"]')?.textContent).toContain('0');
    expect(el.querySelector('[data-testid="wallet-pack-mana_pack_1000"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="wallet-pack-mana_pack_5000"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="wallet-pack-mana_pack_20000"]')).toBeTruthy();
  });

  it('clicking a pack initiates checkoutMana with that sku', () => {
    const { fixture, mana } = setup();
    const btn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="wallet-pack-mana_pack_5000"]',
    )!;
    btn.click();
    expect(mana.checkoutMana).toHaveBeenCalledWith('mana_pack_5000');
  });

  it('disables the packs while a checkout is in flight', () => {
    const { fixture, mana } = setup();
    mana.checkoutState.set({ status: 'submitting' });
    fixture.detectChanges();
    const btn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="wallet-pack-mana_pack_1000"]',
    )!;
    expect(btn.disabled).toBe(true);
  });

  it('surfaces a checkout error', () => {
    const { fixture, mana } = setup();
    mana.checkoutState.set({ status: 'error', error: 'core.mana.checkout_error_unavailable' });
    fixture.detectChanges();
    const err = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="wallet-checkout-error"]',
    );
    expect(err?.textContent).toContain('checkout_error_unavailable');
  });

  it('enters the confirming state when returning from Stripe (?mana_topup=success)', () => {
    const { fixture } = setup('success');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="wallet-confirming"]')).toBeTruthy();
  });

  it('does NOT confirm-poll on a normal visit', () => {
    const { fixture } = setup(null);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="wallet-confirming"]')).toBeNull();
  });

  // ── Shell / static render ────────────────────────────────────────────
  it('creates the component and renders the title + topup headings', () => {
    const { fixture } = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance).toBeTruthy();
    // Translate pipe returns the raw i18n key in tests.
    expect(el.querySelector('#wallet-title')?.textContent).toContain('aplus.wallet.title');
    expect(el.querySelector('#wallet-topup-title')?.textContent).toContain(
      'aplus.wallet.topup_heading',
    );
  });

  it('exposes the three MANA_PACKS via the public packs field', () => {
    const { fixture } = setup();
    const skus = fixture.componentInstance.packs.map((p) => p.sku);
    expect(skus).toEqual(['mana_pack_1000', 'mana_pack_5000', 'mana_pack_20000']);
  });

  // ── priceLabel() ─────────────────────────────────────────────────────
  it('priceLabel formats a USD pack with a $ prefix and 2 decimals', () => {
    const { fixture } = setup();
    const label = fixture.componentInstance.priceLabel({
      sku: 'x',
      mana_units: 5000,
      price_cents: 799,
      currency: 'USD',
    });
    expect(label).toBe('$7.99 USD');
  });

  it('priceLabel omits the $ prefix for a non-USD currency', () => {
    const { fixture } = setup();
    const label = fixture.componentInstance.priceLabel({
      sku: 'x',
      mana_units: 1000,
      price_cents: 1200,
      currency: 'SGD',
    });
    expect(label).toBe('12.00 SGD');
  });

  it('renders the formatted price on each pack button', () => {
    const { fixture } = setup();
    const el = fixture.nativeElement as HTMLElement;
    const price = el.querySelector('[data-testid="wallet-pack-mana_pack_5000"]')?.textContent;
    // mana_pack_5000 is 799 cents USD → "$7.99 USD" and 5000 mana units.
    expect(price).toContain('$7.99 USD');
    expect(price).toContain('5000');
  });

  // ── Balance load states ──────────────────────────────────────────────
  it('renders a loading placeholder while the balance is loading', () => {
    const { fixture, mana } = setup();
    mana.loadState.set({ status: 'loading' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const balance = el.querySelector('[data-testid="wallet-balance"]');
    expect(balance?.textContent).toContain('common.loading');
    expect(balance?.querySelector('.wallet__balance-units')).toBeNull();
  });

  it('renders a balance error alert when the load fails', () => {
    const { fixture, mana } = setup();
    mana.loadState.set({ status: 'error', error: 'core.mana.error_upstream' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const err = el.querySelector('.wallet__balance-error');
    expect(err).toBeTruthy();
    expect(err?.getAttribute('role')).toBe('alert');
    expect(err?.textContent).toContain('aplus.wallet.balance_error');
  });

  it('renders the numeric balance + mana_balance label when loaded', () => {
    const { fixture, mana } = setup();
    mana.balanceUnits.set(2500);
    mana.loadState.set({
      status: 'success',
      mana: { balance_units: 2500, lifetime_earned: 0, lifetime_spent: 0, subsidy_breakdown: [] },
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.wallet__balance-units')?.textContent).toContain('2500');
    expect(el.querySelector('.wallet__balance-label')?.textContent).toContain(
      'aplus.wallet.mana_balance',
    );
  });

  // ── Subsidy breakdown ────────────────────────────────────────────────
  it('hides the subsidy section when there are no subsidy slices', () => {
    const { fixture } = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="wallet-subsidies"]')).toBeNull();
    expect(fixture.componentInstance.subsidies()).toEqual([]);
  });

  it('renders one subsidy row per breakdown slice with source + units', () => {
    const { fixture, mana } = setup();
    mana.mana.set({
      balance_units: 1500,
      lifetime_earned: 0,
      lifetime_spent: 0,
      subsidy_breakdown: [
        { source: 'personal', units: 1000 },
        { source: 'tenant_subsidy', tenant_id: 'tenant-001', units: 500 },
      ],
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // Breakdown is a collapsed accordion (CHO-1886 UX pass) — open it first.
    el.querySelector<HTMLButtonElement>('[data-testid="wallet-breakdown-toggle"]')!.click();
    fixture.detectChanges();
    const section = el.querySelector('[data-testid="wallet-subsidies"]');
    expect(section).toBeTruthy();
    const rows = section!.querySelectorAll('li');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('personal');
    expect(rows[0].textContent).toContain('1000');
    expect(rows[1].textContent).toContain('tenant_subsidy');
    expect(rows[1].textContent).toContain('500');
  });

  it('subsidies() falls back to an empty array when wallet is null', () => {
    const { fixture, mana } = setup();
    mana.mana.set(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.subsidies()).toEqual([]);
  });

  // ── isCheckingOut / redirecting ──────────────────────────────────────
  it('treats the redirecting checkout status as in-flight (disables packs, shows banner)', () => {
    const { fixture, mana } = setup();
    mana.checkoutState.set({ status: 'redirecting', checkoutUrl: 'https://stripe.test/c' });
    fixture.detectChanges();
    expect(fixture.componentInstance.isCheckingOut()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector<HTMLButtonElement>(
      '[data-testid="wallet-pack-mana_pack_1000"]',
    )!;
    expect(btn.disabled).toBe(true);
    expect(el.querySelector('.wallet__redirecting')?.textContent).toContain(
      'aplus.wallet.redirecting',
    );
  });

  it('isCheckingOut is false and packs are enabled when checkout is idle', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance.isCheckingOut()).toBe(false);
    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector<HTMLButtonElement>(
      '[data-testid="wallet-pack-mana_pack_1000"]',
    )!;
    expect(btn.disabled).toBe(false);
  });

  it('checkoutError() returns null when checkout is not in an error state', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance.checkoutError()).toBeNull();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="wallet-checkout-error"]')).toBeNull();
  });

  // ── Confirm poll — credited path ─────────────────────────────────────
  it('credits the wallet once the polled balance exceeds the pre-top-up value', fakeAsync(() => {
    sessionStorage.setItem('chora.mana.preTopup', '100');
    const mana = fakeMana();
    mana.balanceUnits.set(100);
    // The poller calls load(); simulate the webhook credit landing.
    (mana.load as any).mockImplementation(() => {
      mana.balanceUnits.set(600);
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: BffClientService, useValue: fakeBff() },
        {
          provide: TransactionRealtimeService,
          useValue: { stream$: of(), disconnect: vi.fn(), emit: vi.fn() },
        },
        { provide: MeManaService, useValue: mana },
        { provide: ActivatedRoute, useValue: fakeRoute('success') },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    });
    const fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();

    // Enters confirming immediately.
    expect(fixture.componentInstance.confirm().status).toBe('confirming');

    // Outer setTimeout(0) → load() → inner setTimeout(50) → credited.
    tick(0);
    tick(50);
    fixture.detectChanges();

    const state = fixture.componentInstance.confirm();
    expect(state.status).toBe('credited');
    expect((state as any).newUnits).toBe(600);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="wallet-credited"]')).toBeTruthy();
    // Pre-top-up marker cleared on success.
    expect(sessionStorage.getItem('chora.mana.preTopup')).toBeNull();
    flush();
    sessionStorage.removeItem('chora.mana.preTopup');
  }));

  // ── Confirm poll — processing (timeout) path ─────────────────────────
  it('reports processing after exhausting all poll attempts without a credit', fakeAsync(() => {
    sessionStorage.setItem('chora.mana.preTopup', '100');
    const mana = fakeMana();
    mana.balanceUnits.set(100); // never increases → poll always misses
    TestBed.configureTestingModule({
      providers: [
        { provide: BffClientService, useValue: fakeBff() },
        {
          provide: TransactionRealtimeService,
          useValue: { stream$: of(), disconnect: vi.fn(), emit: vi.fn() },
        },
        { provide: MeManaService, useValue: mana },
        { provide: ActivatedRoute, useValue: fakeRoute('success') },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    });
    const fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.confirm().status).toBe('confirming');

    // Advance through the recursive poll chain (10 attempts × 3s + 50ms each).
    // tick() (unlike flush) has no 20-task cap, so it drains the whole chain.
    tick(10 * (3_000 + 50) + 100);
    fixture.detectChanges();

    expect(fixture.componentInstance.confirm().status).toBe('processing');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="wallet-processing"]')).toBeTruthy();
    // load() = 1 (ngOnInit eager load) + 10 (one per poll attempt, MAX=10).
    expect((mana.load as any).mock.calls.length).toBe(11);
    // Pre-top-up marker cleared on timeout too.
    expect(sessionStorage.getItem('chora.mana.preTopup')).toBeNull();
    sessionStorage.removeItem('chora.mana.preTopup');
  }));

  it('defaults the pre-top-up baseline to 0 when no sessionStorage marker exists', fakeAsync(() => {
    sessionStorage.removeItem('chora.mana.preTopup');
    const mana = fakeMana();
    mana.balanceUnits.set(0);
    (mana.load as any).mockImplementation(() => {
      // Any positive balance beats the default baseline of 0 → credited.
      mana.balanceUnits.set(50);
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: BffClientService, useValue: fakeBff() },
        {
          provide: TransactionRealtimeService,
          useValue: { stream$: of(), disconnect: vi.fn(), emit: vi.fn() },
        },
        { provide: MeManaService, useValue: mana },
        { provide: ActivatedRoute, useValue: fakeRoute('success') },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    });
    const fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();

    tick(0);
    tick(50);
    fixture.detectChanges();

    const state = fixture.componentInstance.confirm();
    expect(state.status).toBe('credited');
    expect((state as any).newUnits).toBe(50);
    flush();
  }));

  it('stops polling after the component is destroyed (no late state mutation)', fakeAsync(() => {
    sessionStorage.setItem('chora.mana.preTopup', '100');
    const mana = fakeMana();
    mana.balanceUnits.set(100);
    TestBed.configureTestingModule({
      providers: [
        { provide: BffClientService, useValue: fakeBff() },
        {
          provide: TransactionRealtimeService,
          useValue: { stream$: of(), disconnect: vi.fn(), emit: vi.fn() },
        },
        { provide: MeManaService, useValue: mana },
        { provide: ActivatedRoute, useValue: fakeRoute('success') },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
      ],
    });
    const fixture = TestBed.createComponent(WalletComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.confirm().status).toBe('confirming');

    const loadCallsBefore = (mana.load as any).mock.calls.length;
    fixture.destroy(); // triggers destroyRef.onDestroy → destroyed=true + clearTimeout

    // Any still-pending timer must NOT mutate state once destroyed.
    flush();
    expect(fixture.componentInstance.confirm().status).toBe('confirming');
    // No further load() calls fired after destroy.
    expect((mana.load as any).mock.calls.length).toBe(loadCallsBefore);
    sessionStorage.removeItem('chora.mana.preTopup');
  }));

  // ── Transaction history — inline unified timeline (CHO-2238 one wallet) ──
  // ADR-205/CHO-1948 folded the mana ledger into the unified timeline; the
  // one-wallet ruling (2026-07-17) brings that timeline HOME: the shared
  // <chora-transaction-history> mounts inline at learner scope, and the
  // link-out to the retired /a/transactions page dies with the page.
  it('mounts the unified timeline inline at learner scope — no link-out', () => {
    const { fixture } = setup();
    const el = fixture.nativeElement as HTMLElement;
    const card = el.querySelector('[data-testid="wallet-history"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain('aplus.wallet.history_heading');
    expect(card?.querySelector('chora-transaction-history')).toBeTruthy();
    expect(
      el.querySelector('[data-testid="wallet-view-all-transactions"]'),
    ).toBeNull();
  });

  it('does NOT resurrect the hand-rolled in-wallet ledger (CHO-1883 stays dead)', () => {
    const { fixture } = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="wallet-ledger"]')).toBeNull();
    expect(el.querySelector('[data-testid="wallet-ledger-list"]')).toBeNull();
    expect(el.querySelector('[data-testid="wallet-ledger-filters"]')).toBeNull();
    expect(el.querySelector('[data-testid="wallet-ledger-export-csv"]')).toBeNull();
  });
});
