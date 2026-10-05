import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ParentService } from './parent.service';

describe('ParentService', () => {
  let service: ParentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ParentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadGuardianLinks', () => {
    it('should set loading then success state', () => {
      const mockLinks = {
        data: [
          { id: 'link-1', guardian_gcid: 'g-1', learner_gcid: 'l-1', relationship: 'parent', status: 'active' },
        ],
        page_info: { next_cursor: null, has_next: false },
      };

      service.loadGuardianLinks().subscribe();
      expect(service.linkState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links'));
      expect(req.request.method).toBe('GET');
      req.flush(mockLinks);

      expect(service.linkState().status).toBe('success');
      expect(service.guardianLinks()).toEqual(mockLinks.data);
    });

    it('should set error state on failure', () => {
      service.loadGuardianLinks().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.linkState().status).toBe('error');
    });
  });

  describe('createGuardianLink', () => {
    it('should POST and append to existing links', () => {
      // First load existing links
      service.loadGuardianLinks().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links') && r.method === 'GET');
      loadReq.flush({
        data: [{ id: 'link-1', guardian_gcid: 'g-1', learner_gcid: 'l-1', relationship: 'parent', status: 'active' }],
      });

      const request = { learner_gcid: 'l-2', relationship: 'caretaker' as const };
      service.createGuardianLink(request).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links') && r.method === 'POST');
      expect(req.request.body).toEqual(request);
      req.flush({ id: 'link-2', guardian_gcid: 'g-1', learner_gcid: 'l-2', relationship: 'caretaker', status: 'pending' });

      expect(service.guardianLinks().length).toBe(2);
    });

    it('should set error state on failure', () => {
      service.createGuardianLink({ learner_gcid: 'l-1', relationship: 'parent' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links') && r.method === 'POST');
      req.flush('Error', { status: 400, statusText: 'Bad Request' });
      expect(service.linkState().status).toBe('error');
    });
  });

  describe('revokeGuardianLink', () => {
    it('should DELETE and remove from links list', () => {
      // First load existing links
      service.loadGuardianLinks().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links') && r.method === 'GET');
      loadReq.flush({
        data: [
          { id: 'link-1', guardian_gcid: 'g-1', learner_gcid: 'l-1', relationship: 'parent', status: 'active' },
          { id: 'link-2', guardian_gcid: 'g-1', learner_gcid: 'l-2', relationship: 'caretaker', status: 'active' },
        ],
      });

      service.revokeGuardianLink('link-1').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links/link-1') && r.method === 'DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(service.guardianLinks().length).toBe(1);
      expect(service.guardianLinks()[0].id).toBe('link-2');
    });

    it('should set error state on failure', () => {
      service.loadGuardianLinks().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links') && r.method === 'GET');
      loadReq.flush({ data: [{ id: 'link-1', status: 'active' }] });

      service.revokeGuardianLink('link-1').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links/link-1'));
      req.flush('Error', { status: 404, statusText: 'Not Found' });
      expect(service.linkState().status).toBe('error');
    });
  });

  describe('loadDashboard', () => {
    it('should set loading then success state', () => {
      const mockDashboard = {
        learner_gcid: 'l-1',
        guardian_gcid: 'g-1',
        learner_display_name: 'Test Learner',
        total_atoms_completed: 42,
        current_streak_days: 7,
        longest_streak_days: 14,
        total_xp: 1200,
        average_score_pct: 85.5,
        active_paths_count: 3,
        completed_paths_count: 1,
        last_activity_at: '2026-03-15T10:00:00Z',
        generated_at: '2026-03-15T10:05:00Z',
      };

      service.loadDashboard('l-1').subscribe();
      expect(service.dashboardState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/dashboard/l-1'));
      expect(req.request.method).toBe('GET');
      req.flush(mockDashboard);

      expect(service.dashboardState().status).toBe('success');
      expect(service.dashboard()).toEqual(mockDashboard);
    });

    it('should set error state on failure', () => {
      service.loadDashboard('l-1').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/dashboard/l-1'));
      req.flush('Error', { status: 403, statusText: 'Forbidden' });
      expect(service.dashboardState().status).toBe('error');
    });
  });

  describe('loadDigests', () => {
    it('should set loading then success state', () => {
      const mockDigests = {
        data: [
          {
            id: 'd-1',
            guardian_gcid: 'g-1',
            learner_gcid: 'l-1',
            period_start: '2026-03-08',
            period_end: '2026-03-14',
            atoms_completed: 15,
            xp_earned: 300,
            streak_days: 5,
            average_score_pct: 88.0,
            highlights: ['Completed Algebra path'],
          },
        ],
      };

      service.loadDigests().subscribe();
      expect(service.digestState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/digests'));
      req.flush(mockDigests);

      expect(service.digestState().status).toBe('success');
      expect(service.digests()).toEqual(mockDigests.data);
    });

    it('should set error state on failure', () => {
      service.loadDigests().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/digests'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.digestState().status).toBe('error');
    });
  });

  describe('updateDigestPreferences', () => {
    it('should PUT and set success state', () => {
      const request = { frequency: 'weekly' as const, channels: ['email' as const, 'push' as const] };
      const mockResponse = {
        id: 'pref-1',
        tenant_id: 't-1',
        guardian_gcid: 'g-1',
        frequency: 'weekly',
        channels: ['email', 'push'],
        updated_at: '2026-03-15T10:00:00Z',
      };

      service.updateDigestPreferences(request).subscribe();
      expect(service.preferenceState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/digests/preferences') && r.method === 'PUT');
      expect(req.request.body).toEqual(request);
      req.flush(mockResponse);

      expect(service.preferenceState().status).toBe('success');
      expect(service.preference()).toEqual(mockResponse);
    });

    it('should set error state on failure', () => {
      service.updateDigestPreferences({ frequency: 'daily', channels: ['email'] }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/digests/preferences'));
      req.flush('Error', { status: 400, statusText: 'Bad Request' });
      expect(service.preferenceState().status).toBe('error');
    });
  });

  describe('loadAlerts', () => {
    it('should set loading then success state', () => {
      const mockAlerts = {
        data: [
          {
            id: 'a-1',
            guardian_gcid: 'g-1',
            learner_gcid: 'l-1',
            alert_type: 'streak_broken',
            severity: 'warning',
            message: 'Streak broken after 7 days',
            details: {},
            acknowledged_at: null,
            created_at: '2026-03-15T08:00:00Z',
          },
        ],
      };

      service.loadAlerts().subscribe();
      expect(service.alertState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/alerts'));
      req.flush(mockAlerts);

      expect(service.alertState().status).toBe('success');
      expect(service.alerts()).toEqual(mockAlerts.data);
    });

    it('should set error state on failure', () => {
      service.loadAlerts().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/alerts'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.alertState().status).toBe('error');
    });
  });

  describe('resetState', () => {
    it('should reset all states to idle', () => {
      service.loadGuardianLinks().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/parent/links')).flush({ data: [] });

      service.resetState();

      expect(service.linkState().status).toBe('idle');
      expect(service.dashboardState().status).toBe('idle');
      expect(service.digestState().status).toBe('idle');
      expect(service.preferenceState().status).toBe('idle');
      expect(service.alertState().status).toBe('idle');
    });
  });

  describe('computed signals', () => {
    it('activeLinks should filter by active status', () => {
      service.loadGuardianLinks().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links'));
      req.flush({
        data: [
          { id: 'link-1', status: 'active', relationship: 'parent' },
          { id: 'link-2', status: 'pending', relationship: 'caretaker' },
          { id: 'link-3', status: 'revoked', relationship: 'legal_guardian' },
        ],
      });

      expect(service.activeLinks().length).toBe(1);
      expect(service.activeLinks()[0].id).toBe('link-1');
    });

    it('pendingLinks should filter by pending status', () => {
      service.loadGuardianLinks().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/links'));
      req.flush({
        data: [
          { id: 'link-1', status: 'active', relationship: 'parent' },
          { id: 'link-2', status: 'pending', relationship: 'caretaker' },
        ],
      });

      expect(service.pendingLinks().length).toBe(1);
      expect(service.pendingLinks()[0].id).toBe('link-2');
    });

    it('unresolvedAlerts should filter by null acknowledged_at', () => {
      service.loadAlerts().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/parent/alerts'));
      req.flush({
        data: [
          { id: 'a-1', alert_type: 'streak_broken', acknowledged_at: null },
          { id: 'a-2', alert_type: 'milestone_reached', acknowledged_at: '2026-03-15T09:00:00Z' },
        ],
      });

      expect(service.unresolvedAlerts().length).toBe(1);
      expect(service.unresolvedAlerts()[0].id).toBe('a-1');
    });
  });
});
