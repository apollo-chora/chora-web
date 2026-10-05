import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PortabilityService } from './portability.service';
import { environment } from '../../../../../environments/environment';

const BASE = environment.bffBaseUrl;

describe('PortabilityService', () => {
  let service: PortabilityService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PortabilityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initiateMerge', () => {
    it('should set loading then success state', () => {
      const mockMerge = { id: 'm-1', status: 'pending', merge_preview: null };
      const request = { target_email: 'other@example.com' };

      service.initiateMerge(request).subscribe();
      expect(service.mergeState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/merge') && r.method === 'POST');
      expect(req.request.body).toEqual(request);
      req.flush(mockMerge);

      expect(service.mergeState().status).toBe('success');
      expect(service.mergeData()).toEqual(mockMerge);
    });

    it('should set error state on failure', () => {
      service.initiateMerge({ target_email: 'x@y.com' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/merge') && r.method === 'POST');
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.mergeState().status).toBe('error');
    });
  });

  describe('getMerge', () => {
    it('should GET merge by ID and set success state', () => {
      service.getMerge('m-1').subscribe();
      expect(service.mergeState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/merge/m-1'));
      req.flush({ id: 'm-1', status: 'confirmed' });

      expect(service.mergeState().status).toBe('success');
    });
  });

  describe('confirmMerge', () => {
    it('should POST confirmation and set success state', () => {
      const request = { confirmation_text: 'MERGE' };
      service.confirmMerge('m-1', request).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/merge/m-1/confirm') && r.method === 'POST');
      expect(req.request.body).toEqual(request);
      req.flush({ id: 'm-1', status: 'completed' });

      expect(service.mergeState().status).toBe('success');
    });
  });

  describe('cancelMerge', () => {
    it('should DELETE and reset merge state to idle', () => {
      service.cancelMerge('m-1').subscribe(result => {
        expect(result).toBe(true);
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/merge/m-1') && r.method === 'DELETE');
      req.flush(null);

      expect(service.mergeState().status).toBe('idle');
    });

    it('should return false on failure', () => {
      service.cancelMerge('m-1').subscribe(result => {
        expect(result).toBe(false);
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/merge/m-1'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
    });
  });

  describe('loadPortableData', () => {
    it('should set loading then success state', () => {
      const mockData = { gcid_scoped: { knowledge_graph_nodes: 10 }, tenant_scoped: [] };

      service.loadPortableData().subscribe();
      expect(service.portableDataState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/data/summary'));
      req.flush(mockData);

      expect(service.portableDataState().status).toBe('success');
      expect(service.portableData()).toEqual(mockData);
    });
  });

  describe('initiateMigration', () => {
    it('should POST and set success state', () => {
      const request = { source_tenant_id: 't-1', migration_type: 'departure' as const };
      service.initiateMigration(request).subscribe();
      expect(service.migrationState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/migration') && r.method === 'POST');
      req.flush({ id: 'mig-1', status: 'initiated' });

      expect(service.migrationState().status).toBe('success');
    });
  });

  describe('confirmMigration', () => {
    it('should POST confirmation', () => {
      const request = { consent_granted: true };
      service.confirmMigration('mig-1', request).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/migration/mig-1/confirm') && r.method === 'POST');
      expect(req.request.body).toEqual(request);
      req.flush({ id: 'mig-1', status: 'transferring' });

      expect(service.migrationState().status).toBe('success');
    });
  });

  describe('loadMemberships', () => {
    it('should set loading then success state', () => {
      const mockResponse = { data: [{ tenant_id: 't-1', role: 'learner', joined_at: '2026-01-01T00:00:00Z' }] };

      service.loadMemberships().subscribe();
      expect(service.membershipsState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/tenants/memberships'));
      req.flush(mockResponse);

      expect(service.membershipsState().status).toBe('success');
      expect(service.memberships().length).toBe(1);
    });
  });

  describe('resetAll', () => {
    it('should reset all states to idle', () => {
      service.loadPortableData().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/gcid/data/summary')).flush({ gcid_scoped: {}, tenant_scoped: [] });

      service.resetAll();

      expect(service.mergeState().status).toBe('idle');
      expect(service.portableDataState().status).toBe('idle');
      expect(service.migrationState().status).toBe('idle');
      expect(service.membershipsState().status).toBe('idle');
      expect(service.migrationListState().status).toBe('idle');
      expect(service.exportState().status).toBe('idle');
      expect(service.adminMergeRequestState().status).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // Initial / computed defaults
  // -------------------------------------------------------------------------

  describe('initial state + computed defaults', () => {
    it('exposes idle states and empty/null computed projections by default', () => {
      expect(service.mergeState().status).toBe('idle');
      expect(service.portableDataState().status).toBe('idle');
      expect(service.migrationState().status).toBe('idle');
      expect(service.membershipsState().status).toBe('idle');
      expect(service.migrationListState().status).toBe('idle');
      expect(service.exportState().status).toBe('idle');
      expect(service.adminMergeRequestState().status).toBe('idle');

      expect(service.mergeData()).toBeNull();
      expect(service.portableData()).toBeNull();
      expect(service.migrationData()).toBeNull();
      expect(service.memberships()).toEqual([]);
      expect(service.migrations()).toEqual([]);
      expect(service.exportData()).toBeNull();
      expect(service.adminMergeRequest()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Merge — exact URLs + remaining error/verb branches
  // -------------------------------------------------------------------------

  describe('initiateMerge URL', () => {
    it('POSTs to the absolute BFF merge path', () => {
      service.initiateMerge({ target_email: 'a@b.com' }).subscribe();
      const req = httpMock.expectOne(`${BASE}/api/v1/gcid/merge`);
      expect(req.request.method).toBe('POST');
      req.flush({ id: 'm-9', status: 'initiated' });
      expect(service.mergeData()).toEqual({ id: 'm-9', status: 'initiated' });
    });
  });

  describe('getMerge', () => {
    it('encodes the merge id in the URL', () => {
      service.getMerge('m id/1').subscribe();
      const req = httpMock.expectOne(`${BASE}/api/v1/gcid/merge/${encodeURIComponent('m id/1')}`);
      expect(req.request.method).toBe('GET');
      req.flush({ id: 'm id/1', status: 'confirmed' });
      expect(service.mergeState().status).toBe('success');
    });

    it('sets error state on failure', async () => {
      const result = firstValueFrom(service.getMerge('m-1'));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/merge/m-1'));
      req.flush('boom', { status: 404, statusText: 'Not Found' });
      expect(await result).toBeNull();
      const s = service.mergeState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('MERGE_GET_FAILED');
      }
    });
  });

  describe('confirmMerge error', () => {
    it('sets error state with MERGE_CONFIRM_FAILED', () => {
      service.confirmMerge('m-1', { confirmation_text: 'MERGE' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/merge/m-1/confirm'));
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      const s = service.mergeState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('MERGE_CONFIRM_FAILED');
      }
    });
  });

  describe('loadPortableData error', () => {
    it('sets error state with PORTABLE_DATA_LOAD_FAILED', () => {
      service.loadPortableData().subscribe();
      const req = httpMock.expectOne(`${BASE}/api/v1/gcid/data/summary`);
      expect(req.request.method).toBe('GET');
      req.flush('boom', { status: 503, statusText: 'Unavailable' });
      const s = service.portableDataState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('PORTABLE_DATA_LOAD_FAILED');
      }
      expect(service.portableData()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Migration — full coverage
  // -------------------------------------------------------------------------

  describe('initiateMigration error', () => {
    it('sets error state with MIGRATION_INITIATE_FAILED', () => {
      service
        .initiateMigration({ source_tenant_id: 't-1', migration_type: 'departure' })
        .subscribe();
      const req = httpMock.expectOne(`${BASE}/api/v1/gcid/migration`);
      expect(req.request.method).toBe('POST');
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      const s = service.migrationState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('MIGRATION_INITIATE_FAILED');
      }
    });
  });

  describe('getMigration', () => {
    it('GETs migration by encoded id and sets success state', () => {
      service.getMigration('mig 1').subscribe();
      expect(service.migrationState().status).toBe('loading');
      const req = httpMock.expectOne(`${BASE}/api/v1/gcid/migration/${encodeURIComponent('mig 1')}`);
      expect(req.request.method).toBe('GET');
      req.flush({ id: 'mig 1', status: 'transferring' });
      expect(service.migrationState().status).toBe('success');
      expect(service.migrationData()).toEqual({ id: 'mig 1', status: 'transferring' });
    });

    it('sets error state with MIGRATION_GET_FAILED', () => {
      service.getMigration('mig-1').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/migration/mig-1'));
      req.flush('boom', { status: 404, statusText: 'Not Found' });
      const s = service.migrationState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('MIGRATION_GET_FAILED');
      }
    });
  });

  describe('confirmMigration error', () => {
    it('sets error state with MIGRATION_CONFIRM_FAILED', () => {
      service.confirmMigration('mig-1', { consent_granted: true }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/migration/mig-1/confirm'));
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      const s = service.migrationState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('MIGRATION_CONFIRM_FAILED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Memberships — map return value + error
  // -------------------------------------------------------------------------

  describe('loadMemberships', () => {
    it('emits the data array through the map operator', async () => {
      const promise = firstValueFrom(service.loadMemberships());
      const req = httpMock.expectOne(`${BASE}/api/v1/tenants/memberships`);
      expect(req.request.method).toBe('GET');
      const rows = [
        { id: 'mem-1', gcid: 'g-1', tenant_id: 't-1', roles: ['learner'], joined_at: '2026-01-01T00:00:00Z' },
      ];
      req.flush({ data: rows, page_info: { has_next: false } });
      const result = await promise;
      expect(result).toEqual(rows);
      expect(service.memberships()).toEqual(rows);
    });

    it('sets error state and emits null on failure', async () => {
      const promise = firstValueFrom(service.loadMemberships());
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/tenants/memberships'));
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      expect(await promise).toBeNull();
      const s = service.membershipsState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('MEMBERSHIPS_LOAD_FAILED');
      }
      expect(service.memberships()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Data Export (GDPR Art. 20)
  // -------------------------------------------------------------------------

  describe('exportTenantData', () => {
    it('POSTs a tenant-scoped request and sets success state', () => {
      service.exportTenantData('t-42', 'csv').subscribe();
      expect(service.exportState().status).toBe('loading');
      const req = httpMock.expectOne(`${BASE}/api/v1/gcid/data/export`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        scope: 'tenant_scoped',
        tenant_id: 't-42',
        format: 'csv',
      });
      const resp = {
        export_id: 'exp-1',
        status: 'queued',
        download_url: null,
        created_at: '2026-06-04T00:00:00Z',
        completed_at: null,
        error_message: null,
      };
      req.flush(resp);
      expect(service.exportState().status).toBe('success');
      expect(service.exportData()).toEqual(resp);
    });

    it('sets error state with EXPORT_FAILED', () => {
      service.exportTenantData('t-1', 'json').subscribe();
      const req = httpMock.expectOne(`${BASE}/api/v1/gcid/data/export`);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      const s = service.exportState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('EXPORT_FAILED');
      }
      expect(service.exportData()).toBeNull();
    });
  });

  describe('getExportStatus', () => {
    it('GETs export status by encoded id and sets success state', () => {
      service.getExportStatus('exp id/9').subscribe();
      const req = httpMock.expectOne(
        `${BASE}/api/v1/gcid/data/export/${encodeURIComponent('exp id/9')}`,
      );
      expect(req.request.method).toBe('GET');
      const resp = {
        export_id: 'exp id/9',
        status: 'completed',
        download_url: 'https://x/y.zip',
        created_at: '2026-06-04T00:00:00Z',
        completed_at: '2026-06-04T00:05:00Z',
        error_message: null,
      };
      req.flush(resp);
      expect(service.exportState().status).toBe('success');
      expect(service.exportData()).toEqual(resp);
    });

    it('sets error state with EXPORT_STATUS_FAILED', () => {
      service.getExportStatus('exp-1').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/gcid/data/export/exp-1'));
      req.flush('boom', { status: 404, statusText: 'Not Found' });
      const s = service.exportState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('EXPORT_STATUS_FAILED');
      }
    });
  });

  describe('resetExportState', () => {
    it('resets the export state to idle', () => {
      service.exportTenantData('t-1', 'json').subscribe();
      httpMock.expectOne(`${BASE}/api/v1/gcid/data/export`).flush({
        export_id: 'exp-1',
        status: 'queued',
        download_url: null,
        created_at: '2026-06-04T00:00:00Z',
        completed_at: null,
        error_message: null,
      });
      expect(service.exportState().status).toBe('success');

      service.resetExportState();
      expect(service.exportState().status).toBe('idle');
      expect(service.exportData()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Admin-Assisted Merge Request
  // -------------------------------------------------------------------------

  describe('submitAdminMergeRequest', () => {
    it('POSTs the FormData and sets success state', () => {
      const fd = new FormData();
      fd.append('reason', 'lost access');
      service.submitAdminMergeRequest(fd).subscribe();
      expect(service.adminMergeRequestState().status).toBe('loading');

      const req = httpMock.expectOne(`${BASE}/api/v1/iam/gcid/merge/request`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBe(fd);
      const resp = {
        id: 'amr-1',
        requester_gcid: 'g-1',
        target_email: 'x@y.com',
        reason: 'lost access',
        evidence_urls: [],
        status: 'submitted',
        denial_reason: null,
        submitted_at: '2026-06-04T00:00:00Z',
        reviewed_at: null,
        resolved_at: null,
      };
      req.flush(resp);
      expect(service.adminMergeRequestState().status).toBe('success');
      expect(service.adminMergeRequest()).toEqual(resp);
    });

    it('sets error state with MERGE_REQUEST_SUBMIT_FAILED', () => {
      service.submitAdminMergeRequest(new FormData()).subscribe();
      const req = httpMock.expectOne(`${BASE}/api/v1/iam/gcid/merge/request`);
      req.flush('boom', { status: 422, statusText: 'Unprocessable' });
      const s = service.adminMergeRequestState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('MERGE_REQUEST_SUBMIT_FAILED');
      }
    });
  });

  describe('loadAdminMergeRequest', () => {
    it('sets success state when a request exists', () => {
      service.loadAdminMergeRequest().subscribe();
      expect(service.adminMergeRequestState().status).toBe('loading');
      const req = httpMock.expectOne(`${BASE}/api/v1/iam/gcid/merge/request/me`);
      expect(req.request.method).toBe('GET');
      const resp = {
        id: 'amr-1',
        requester_gcid: 'g-1',
        target_email: 'x@y.com',
        reason: 'r',
        evidence_urls: [],
        status: 'admin_review',
        denial_reason: null,
        submitted_at: '2026-06-04T00:00:00Z',
        reviewed_at: null,
        resolved_at: null,
      };
      req.flush(resp);
      expect(service.adminMergeRequestState().status).toBe('success');
      expect(service.adminMergeRequest()).toEqual(resp);
    });

    it('falls back to idle state when no request exists (null body)', () => {
      service.loadAdminMergeRequest().subscribe();
      const req = httpMock.expectOne(`${BASE}/api/v1/iam/gcid/merge/request/me`);
      req.flush(null);
      expect(service.adminMergeRequestState().status).toBe('idle');
      expect(service.adminMergeRequest()).toBeNull();
    });

    it('sets error state with MERGE_REQUEST_LOAD_FAILED', () => {
      service.loadAdminMergeRequest().subscribe();
      const req = httpMock.expectOne(`${BASE}/api/v1/iam/gcid/merge/request/me`);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      const s = service.adminMergeRequestState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('MERGE_REQUEST_LOAD_FAILED');
      }
    });
  });

  describe('resetAdminMergeRequestState', () => {
    it('resets the admin merge request state to idle', () => {
      service.submitAdminMergeRequest(new FormData()).subscribe();
      httpMock.expectOne(`${BASE}/api/v1/iam/gcid/merge/request`).flush({
        id: 'amr-1',
        requester_gcid: 'g-1',
        target_email: 'x@y.com',
        reason: 'r',
        evidence_urls: [],
        status: 'submitted',
        denial_reason: null,
        submitted_at: '2026-06-04T00:00:00Z',
        reviewed_at: null,
        resolved_at: null,
      });
      expect(service.adminMergeRequestState().status).toBe('success');

      service.resetAdminMergeRequestState();
      expect(service.adminMergeRequestState().status).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // Individual state resets
  // -------------------------------------------------------------------------

  describe('resetMergeState / resetMigrationState', () => {
    it('resetMergeState returns merge state to idle', () => {
      service.initiateMerge({ target_email: 'a@b.com' }).subscribe();
      httpMock.expectOne(`${BASE}/api/v1/gcid/merge`).flush({ id: 'm-1', status: 'initiated' });
      expect(service.mergeState().status).toBe('success');

      service.resetMergeState();
      expect(service.mergeState().status).toBe('idle');
      expect(service.mergeData()).toBeNull();
    });

    it('resetMigrationState returns migration state to idle', () => {
      service
        .initiateMigration({ source_tenant_id: 't-1', migration_type: 'transfer' })
        .subscribe();
      httpMock.expectOne(`${BASE}/api/v1/gcid/migration`).flush({ id: 'mig-1', status: 'initiated' });
      expect(service.migrationState().status).toBe('success');

      service.resetMigrationState();
      expect(service.migrationState().status).toBe('idle');
      expect(service.migrationData()).toBeNull();
    });
  });
});
