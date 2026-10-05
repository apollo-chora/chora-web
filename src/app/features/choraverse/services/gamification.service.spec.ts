import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { GamificationService } from './gamification.service';

describe('GamificationService', () => {
  let service: GamificationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GamificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadSkins', () => {
    it('should set loading then success state', () => {
      const mockSkins = [{ id: 's-1', name: 'Dragon', rarity: 'rare', theme: 'fantasy', is_equipped: false, isOwned: true }];

      service.loadSkins().subscribe();
      expect(service.skinCatalogState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gamification/skins'));
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockSkins });

      expect(service.skinCatalogState().status).toBe('success');
      expect(service.skins()).toEqual(mockSkins);
    });

    it('should set error state on failure', () => {
      service.loadSkins().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gamification/skins'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.skinCatalogState().status).toBe('error');
    });
  });

  describe('equipSkin', () => {
    it('should PUT and return true on success', () => {
      // First load skins
      service.loadSkins().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/gamification/skins')).flush({
        data: [{ id: 's-1', name: 'Dragon', rarity: 'rare', theme: 'fantasy', is_equipped: false, isOwned: true }],
      });

      service.equipSkin('s-1', 'profile_photo').subscribe(result => {
        expect(result).toBe(true);
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gamification/skins/equipment/profile_photo') && r.method === 'PUT');
      expect(req.request.body).toEqual({ skin_award_id: 's-1' });
      req.flush({});

      expect(service.equipActionState().status).toBe('success');
    });

    it('should return false on failure', () => {
      service.equipSkin('s-1', 'profile_photo').subscribe(result => {
        expect(result).toBe(false);
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gamification/skins/equipment/profile_photo'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.equipActionState().status).toBe('error');
    });
  });

  describe('loadCoinAccount', () => {
    it('should set loading then success state', () => {
      const mockAccount = { id: 'ca-1', balance: 500, currency: 'star_credits' };

      service.loadCoinAccount().subscribe();
      expect(service.coinAccountState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gamification/coins'));
      req.flush(mockAccount);

      expect(service.coinAccountState().status).toBe('success');
      expect(service.coinBalance()).toBe(500);
    });
  });

  describe('loadTransactions', () => {
    it('should set loading then success state', () => {
      const mockTxns = [{ id: 't-1', type: 'earned', amount: 100, description: 'Daily bonus', created_at: '2026-01-01T00:00:00Z' }];

      service.loadTransactions().subscribe();
      expect(service.transactionListState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gamification/coins/transactions'));
      req.flush({ data: mockTxns });

      expect(service.transactionListState().status).toBe('success');
      expect(service.transactions()).toEqual(mockTxns);
    });
  });

  describe('loadBounties', () => {
    it('should set loading then success state', () => {
      const mockBounties = [{ id: 'b-1', title: 'Quiz Master', reward_amount: 50, status: 'active' }];

      service.loadBounties().subscribe();
      expect(service.bountyListState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gamification/bounties'));
      req.flush({ data: mockBounties });

      expect(service.bountyListState().status).toBe('success');
      expect(service.bounties()).toEqual(mockBounties);
    });
  });

  describe('resetState', () => {
    it('should reset all states to idle', () => {
      service.loadCoinAccount().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/gamification/coins')).flush({ balance: 500 });

      service.resetState();

      expect(service.skinCatalogState().status).toBe('idle');
      expect(service.coinAccountState().status).toBe('idle');
      expect(service.transactionListState().status).toBe('idle');
      expect(service.bountyListState().status).toBe('idle');
      expect(service.equipActionState().status).toBe('idle');
    });
  });
});
