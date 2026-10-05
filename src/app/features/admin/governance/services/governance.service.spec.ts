import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { GovernanceService } from './governance.service';

describe('GovernanceService', () => {
  let service: GovernanceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GovernanceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadRestrictions', () => {
    it('should set loading then success state', () => {
      const mockData = [{ id: '1', tier: 'warning', status: 'active', target_gcid: 'gcid-1', reason: 'Test', applied_by: 'admin', applied_at: '2026-01-01T00:00:00Z', lifted_at: null, tenant_id: 'tenant-1' }];

      service.loadRestrictions().subscribe();
      expect(service.restrictionState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/restrictions'));
      expect(req.request.method).toBe('GET');
      req.flush(mockData);

      expect(service.restrictionState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadRestrictions().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/restrictions'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.restrictionState().status).toBe('error');
    });
  });

  describe('applyRestriction', () => {
    it('should POST restriction data', () => {
      const body = { target_gcid: 'gcid-1', tier: 'warning' as const, reason: 'Test' };
      service.applyRestriction(body).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/restrictions') && r.method === 'POST');
      expect(req.request.body).toEqual(body);
      req.flush({ id: '2', ...body, status: 'active', applied_by: 'admin', applied_at: '2026-01-01T00:00:00Z', lifted_at: null, tenant_id: 'tenant-1' });

      // Triggers reload
      const reloadReq = httpMock.expectOne(r => r.url.includes('/api/v1/governance/restrictions') && r.method === 'GET');
      reloadReq.flush([]);
    });

    it('should return null on error', () => {
      service.applyRestriction({ target_gcid: 'gcid-1', tier: 'warning', reason: 'Test' }).subscribe(result => {
        expect(result).toBeNull();
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/restrictions') && r.method === 'POST');
      req.flush('Error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('liftRestriction', () => {
    it('should DELETE the restriction', () => {
      service.liftRestriction('r-1').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/restrictions/r-1') && r.method === 'DELETE');
      req.flush(null);

      const reloadReq = httpMock.expectOne(r => r.url.includes('/api/v1/governance/restrictions') && r.method === 'GET');
      reloadReq.flush([]);
    });
  });

  describe('loadAppeals', () => {
    it('should set loading then success state', () => {
      const mockData = [{ id: '1', restriction_id: 'r-1', appellant_gcid: 'gcid-1', status: 'pending', reason: 'Unfair', submitted_at: '2026-01-01T00:00:00Z', reviewed_at: null, reviewer_notes: null, tenant_id: 'tenant-1' }];

      service.loadAppeals().subscribe();
      expect(service.appealState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/appeals'));
      req.flush(mockData);

      expect(service.appealState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadAppeals().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/appeals'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.appealState().status).toBe('error');
    });
  });

  describe('reviewAppeal', () => {
    it('should PUT the review decision', () => {
      const decision = { status: 'approved' as const, reviewer_notes: 'Looks good' };
      service.reviewAppeal('a-1', decision).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/appeals/a-1') && r.method === 'PUT');
      expect(req.request.body).toEqual(decision);
      req.flush({ id: 'a-1', status: 'approved' });

      const reloadReq = httpMock.expectOne(r => r.url.includes('/api/v1/governance/appeals') && r.method === 'GET');
      reloadReq.flush([]);
    });
  });

  describe('loadKYCVerifications', () => {
    it('should set loading then success state', () => {
      service.loadKYCVerifications().subscribe();
      expect(service.kycState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/kyc'));
      req.flush([{ id: '1', status: 'pending' }]);

      expect(service.kycState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadKYCVerifications().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/kyc'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.kycState().status).toBe('error');
    });
  });

  describe('loadModerationLog', () => {
    it('should set loading then success state', () => {
      service.loadModerationLog().subscribe();
      expect(service.moderationState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/moderation'));
      req.flush([{ id: '1', action: 'flag', reason: 'Inappropriate' }]);

      expect(service.moderationState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadModerationLog().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/moderation'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.moderationState().status).toBe('error');
    });
  });

  describe('computed signals', () => {
    it('restrictions should return empty array when not loaded', () => {
      expect(service.restrictionState().status).toBe('idle');
    });

    it('pendingAppeals should filter by pending status', () => {
      const mockAppeals = [
        { id: '1', status: 'pending', restriction_id: 'r-1', appellant_gcid: 'gcid-1', reason: 'Test', submitted_at: '2026-01-01T00:00:00Z', reviewed_at: null, reviewer_notes: null, tenant_id: 'tenant-1' },
        { id: '2', status: 'approved', restriction_id: 'r-2', appellant_gcid: 'gcid-2', reason: 'Test2', submitted_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-02T00:00:00Z', reviewer_notes: 'OK', tenant_id: 'tenant-1' },
      ];

      service.loadAppeals().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/governance/appeals'));
      req.flush(mockAppeals);

      expect(service.pendingAppeals().length).toBe(1);
      expect(service.pendingAppeals()[0].id).toBe('1');
    });
  });
});
