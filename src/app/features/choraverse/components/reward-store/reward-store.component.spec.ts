import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { RewardStoreComponent } from './reward-store.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SkinRarity } from '../../models/familiar.model';
import type {
  CoinAccount,
  KnowledgeBounty,
  SkinCatalogEntry,
} from '../../models/gamification.model';

const BASE = 'https://api.chora.site';
const COINS_URL = `${BASE}/api/v1/gamification/coins`;
const SKINS_URL = `${BASE}/api/v1/gamification/skins`;
const BOUNTIES_URL = `${BASE}/api/v1/gamification/bounties`;

function makeSkin(overrides: Partial<SkinCatalogEntry> = {}): SkinCatalogEntry {
  return {
    id: 'skin-1',
    name: 'Aurora',
    speciesType: 'fox' as never,
    rarity: SkinRarity.Rare,
    previewUrl: 'https://cdn/x.png',
    starCreditCost: 0,
    isOwned: true,
    category: 'avatar',
    theme: 'seasonal',
    is_equipped: false,
    is_legendary: false,
    asset_url: 'https://cdn/asset.png',
    earn_criteria: {},
    earned_via: 'streak',
    earned_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAccount(overrides: Partial<CoinAccount> = {}): CoinAccount {
  return {
    id: 'acc-1',
    gcid: 'gcid-1',
    balance: 1250,
    lifetime_earned: 5000,
    lifetime_spent: 3750,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

function makeBounty(overrides: Partial<KnowledgeBounty> = {}): KnowledgeBounty {
  return {
    id: 'bounty-1',
    poster_gcid: 'gcid-poster',
    title: 'Explain entropy',
    description: 'Write a clear atom about entropy',
    coin_reward: 500,
    reputation_requirement: 10,
    status: 'open',
    solver_gcid: null,
    created_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    expires_at: '2026-12-01T00:00:00Z',
    ...overrides,
  };
}

describe('RewardStoreComponent', () => {
  let component: RewardStoreComponent;
  let fixture: ComponentFixture<RewardStoreComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RewardStoreComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RewardStoreComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="reward-store"]');
    expect(el).toBeTruthy();
  });

  it('should default to skins tab', () => {
    expect(component.activeTab()).toBe('skins');
  });

  it('should switch tabs', () => {
    component.setActiveTab('bounties');
    expect(component.activeTab()).toBe('bounties');
    component.setActiveTab('items');
    expect(component.activeTab()).toBe('items');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ===========================================================================
  // Added coverage
  // ===========================================================================

  describe('initial load (ngOnInit fires three BFF calls)', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('renders header, title and tabs in the shell', () => {
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('[data-testid="reward-store-title"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="store-tabs"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="tab-skins"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="tab-items"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="tab-bounties"]')).toBeTruthy();
      // drain pending init requests
      httpMock.match(COINS_URL).forEach((r) => r.flush(makeAccount()));
      httpMock.match(SKINS_URL).forEach((r) => r.flush({ data: [] }));
      httpMock.match(BOUNTIES_URL).forEach((r) => r.flush({ data: [] }));
    });

    it('issues GET to coins, skins and bounties on init', () => {
      const coins = httpMock.expectOne(COINS_URL);
      const skins = httpMock.expectOne(SKINS_URL);
      const bounties = httpMock.expectOne(BOUNTIES_URL);
      expect(coins.request.method).toBe('GET');
      expect(skins.request.method).toBe('GET');
      expect(bounties.request.method).toBe('GET');
      coins.flush(makeAccount());
      skins.flush({ data: [] });
      bounties.flush({ data: [] });
    });

    it('renders the balance amount on coins success', () => {
      httpMock.expectOne(COINS_URL).flush(makeAccount({ balance: 4242 }));
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
      fixture.detectChanges();

      expect(component.coinBalance()).toBe(4242);
      const balance: HTMLElement = fixture.nativeElement.querySelector(
        '[data-testid="coin-balance"]',
      );
      expect(balance.textContent).toContain('4242');
    });

    it('shows zero balance on coins load failure (service swallows error -> no toast)', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');

      httpMock.expectOne(COINS_URL).flush('boom', { status: 500, statusText: 'Server Error' });
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
      fixture.detectChanges();

      expect(component.coinBalance()).toBe(0);
      // CHARACTERIZATION: GamificationService.loadCoinAccount catchError returns of(null),
      // so the error becomes a NEXT value -> the component's subscribe({error}) never fires.
      // The coins_load_error toast is effectively unreachable. See prodBugFlag in notes.
      expect(spy).not.toHaveBeenCalledWith('choraverse.reward_store.coins_load_error', 'error');
    });
  });

  describe('skins panel', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      // satisfy unrelated init calls
      httpMock.expectOne(COINS_URL).flush(makeAccount());
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('renders a grid of owned/locked/equipped skins on success', () => {
      const skins: SkinCatalogEntry[] = [
        makeSkin({
          id: 's-owned',
          name: 'Owned',
          isOwned: true,
          is_equipped: false,
          rarity: SkinRarity.Common,
        }),
        makeSkin({
          id: 's-equipped',
          name: 'Worn',
          isOwned: true,
          is_equipped: true,
          rarity: SkinRarity.Epic,
        }),
        makeSkin({
          id: 's-locked',
          name: 'Locked',
          isOwned: false,
          is_equipped: false,
          rarity: SkinRarity.Legendary,
        }),
      ];
      httpMock.expectOne(SKINS_URL).flush({ data: skins });
      fixture.detectChanges();

      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('[data-testid="skins-grid"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="btn-equip-s-owned"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="btn-equipped-s-equipped"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="skin-locked"]')).toBeTruthy();
      expect(component.filteredSkins().length).toBe(3);
    });

    it('shows the empty state when no skins are returned', () => {
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      fixture.detectChanges();

      expect(component.filteredSkins().length).toBe(0);
      expect(fixture.nativeElement.querySelector('[data-testid="skins-empty"]')).toBeTruthy();
    });

    it('keeps skins empty on load failure (4xx) and renders the empty state', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');

      httpMock.expectOne(SKINS_URL).flush('nope', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(component.filteredSkins().length).toBe(0);
      expect(component.skinCatalogState().status).toBe('error');
      // CHARACTERIZATION: loadSkins catchError returns of(null) -> subscribe({error}) never fires.
      expect(spy).not.toHaveBeenCalledWith('choraverse.reward_store.skins_load_error', 'error');
      expect(fixture.nativeElement.querySelector('[data-testid="skins-empty"]')).toBeTruthy();
    });

    it('filters by rarity via onRarityFilter and clears when blank', () => {
      const skins: SkinCatalogEntry[] = [
        makeSkin({ id: 'r1', rarity: SkinRarity.Common }),
        makeSkin({ id: 'r2', rarity: SkinRarity.Epic }),
        makeSkin({ id: 'r3', rarity: SkinRarity.Epic }),
      ];
      httpMock.expectOne(SKINS_URL).flush({ data: skins });
      fixture.detectChanges();

      component.onRarityFilter('epic');
      expect(component.filterRarity()).toBe('epic');
      expect(component.filteredSkins().map((s) => s.id)).toEqual(['r2', 'r3']);

      component.onRarityFilter('');
      expect(component.filterRarity()).toBeNull();
      expect(component.filteredSkins().length).toBe(3);
    });

    it('filters by theme via onThemeFilter and clears when blank', () => {
      const skins: SkinCatalogEntry[] = [
        makeSkin({ id: 't1', theme: 'seasonal' }),
        makeSkin({ id: 't2', theme: 'premium' }),
      ];
      httpMock.expectOne(SKINS_URL).flush({ data: skins });
      fixture.detectChanges();

      component.onThemeFilter('premium');
      expect(component.filterTheme()).toBe('premium');
      expect(component.filteredSkins().map((s) => s.id)).toEqual(['t2']);

      component.onThemeFilter('');
      expect(component.filterTheme()).toBeNull();
      expect(component.filteredSkins().length).toBe(2);
    });

    it('applies both rarity and theme filters together', () => {
      const skins: SkinCatalogEntry[] = [
        makeSkin({ id: 'a', rarity: SkinRarity.Epic, theme: 'seasonal' }),
        makeSkin({ id: 'b', rarity: SkinRarity.Epic, theme: 'premium' }),
        makeSkin({ id: 'c', rarity: SkinRarity.Common, theme: 'premium' }),
      ];
      httpMock.expectOne(SKINS_URL).flush({ data: skins });
      fixture.detectChanges();

      component.onRarityFilter('epic');
      component.onThemeFilter('premium');
      expect(component.filteredSkins().map((s) => s.id)).toEqual(['b']);
    });
  });

  describe('equipSkin', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(COINS_URL).flush(makeAccount());
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('does nothing for an already-equipped skin', () => {
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      const equipped = makeSkin({ id: 'eq', is_equipped: true, isOwned: true });
      component.equipSkin(equipped);
      httpMock.expectNone(`${BASE}/api/v1/gamification/skins/equipment/profile_photo`);
    });

    it('does nothing for an unowned skin', () => {
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      const locked = makeSkin({ id: 'lk', is_equipped: false, isOwned: false });
      component.equipSkin(locked);
      httpMock.expectNone(`${BASE}/api/v1/gamification/skins/equipment/profile_photo`);
    });

    it('PUTs to the equipment endpoint and toasts success on success', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');
      const skin = makeSkin({ id: 'ownit', is_equipped: false, isOwned: true });
      httpMock.expectOne(SKINS_URL).flush({ data: [skin] });
      fixture.detectChanges();

      component.equipSkin(skin);
      const req = httpMock.expectOne(`${BASE}/api/v1/gamification/skins/equipment/profile_photo`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ skin_award_id: 'ownit' });
      req.flush({ ok: true });

      expect(spy).toHaveBeenCalledWith('choraverse.reward_store.skin_equipped', 'success');
    });

    it('does not toast equip_error on equip failure (service swallows error -> emits false)', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');
      const skin = makeSkin({ id: 'fail', is_equipped: false, isOwned: true });
      httpMock.expectOne(SKINS_URL).flush({ data: [skin] });

      component.equipSkin(skin);
      const req = httpMock.expectOne(`${BASE}/api/v1/gamification/skins/equipment/profile_photo`);
      req.flush('nope', { status: 500, statusText: 'Server Error' });

      // CHARACTERIZATION: equipSkin catchError returns of(false) -> next(false) (not success),
      // so neither the success toast (false) nor the error toast (no error event) fires.
      expect(spy).not.toHaveBeenCalledWith('choraverse.reward_store.equip_error', 'error');
      expect(spy).not.toHaveBeenCalledWith('choraverse.reward_store.skin_equipped', 'success');
    });
  });

  describe('bounties panel', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(COINS_URL).flush(makeAccount());
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('renders bounty cards on the bounties tab when loaded', () => {
      const bounties = [
        makeBounty({ id: 'b1', title: 'Atom on gravity', coin_reward: 750 }),
        makeBounty({ id: 'b2', title: 'Atom on tides', status: 'in_progress' }),
      ];
      httpMock.expectOne(BOUNTIES_URL).flush({ data: bounties });
      component.setActiveTab('bounties');
      fixture.detectChanges();

      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('[data-testid="bounty-list"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="bounty-b1"]')).toBeTruthy();
      expect(host.textContent).toContain('Atom on gravity');
      expect(component.bounties().length).toBe(2);
    });

    it('renders empty state on the bounties tab when none', () => {
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
      component.setActiveTab('bounties');
      fixture.detectChanges();

      expect(component.bounties().length).toBe(0);
      expect(fixture.nativeElement.querySelector('[data-testid="bounties-empty"]')).toBeTruthy();
    });

    it('keeps bounties empty on load failure (service swallows error -> no toast)', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');
      httpMock.expectOne(BOUNTIES_URL).flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();

      expect(component.bounties().length).toBe(0);
      expect(component.bountyListState().status).toBe('error');
      // CHARACTERIZATION: loadBounties catchError returns of(null) -> subscribe({error}) never fires.
      expect(spy).not.toHaveBeenCalledWith('choraverse.reward_store.bounties_load_error', 'error');
    });
  });

  describe('items tab', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(COINS_URL).flush(makeAccount());
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('shows the items coming-soon panel', () => {
      component.setActiveTab('items');
      fixture.detectChanges();
      const panel = fixture.nativeElement.querySelector('[data-testid="panel-items"]');
      expect(panel).toBeTruthy();
      expect(panel.textContent).toContain('choraverse.reward_store.items_coming_soon');
    });
  });

  describe('helpers', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(COINS_URL).flush(makeAccount());
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('rarityBorderColor maps each rarity to its hex color', () => {
      expect(component.rarityBorderColor(SkinRarity.Common)).toBe('#9ca3af');
      expect(component.rarityBorderColor(SkinRarity.Uncommon)).toBe('#22c55e');
      expect(component.rarityBorderColor(SkinRarity.Rare)).toBe('#3b82f6');
      expect(component.rarityBorderColor(SkinRarity.Epic)).toBe('#a855f7');
      expect(component.rarityBorderColor(SkinRarity.Legendary)).toBe('#eab308');
    });

    it('formatDateTime returns a locale string for a valid ISO date', () => {
      const out = component.formatDateTime('2026-06-04T12:00:00Z');
      expect(out).toBe(new Date('2026-06-04T12:00:00Z').toLocaleString());
    });

    it('formatDateTime echoes the input for an unparseable value', () => {
      // new Date('') is Invalid Date -> toLocaleString returns 'Invalid Date'
      const out = component.formatDateTime('not-a-date');
      expect(typeof out).toBe('string');
    });

    it('isSkinsLoading and isBountiesLoading are false after a successful load', () => {
      expect(component.isSkinsLoading()).toBe(false);
      expect(component.isBountiesLoading()).toBe(false);
    });
  });

  describe('loading states', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    it('shows skeleton loaders while skins are loading', () => {
      // do not flush skins yet -> state remains 'loading'
      httpMock.expectOne(COINS_URL).flush(makeAccount());
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
      fixture.detectChanges();

      expect(component.isSkinsLoading()).toBe(true);
      expect(fixture.nativeElement.querySelector('[data-testid="skins-loading"]')).toBeTruthy();

      // now drain skins to clean up
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      httpMock.verify();
    });

    it('shows bounty skeleton rows while bounties are loading', () => {
      httpMock.expectOne(COINS_URL).flush(makeAccount());
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      component.setActiveTab('bounties');
      fixture.detectChanges();

      expect(component.isBountiesLoading()).toBe(true);
      expect(fixture.nativeElement.querySelector('[data-testid="bounties-loading"]')).toBeTruthy();

      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
      httpMock.verify();
    });
  });

  describe('lifecycle', () => {
    it('unsubscribes on destroy without error', () => {
      const httpMock = TestBed.inject(HttpTestingController);
      httpMock.expectOne(COINS_URL).flush(makeAccount());
      httpMock.expectOne(SKINS_URL).flush({ data: [] });
      httpMock.expectOne(BOUNTIES_URL).flush({ data: [] });
      expect(() => fixture.destroy()).not.toThrow();
      httpMock.verify();
    });
  });
});
