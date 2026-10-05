import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AdmissionAdminService } from './admission-admin.service';

describe('AdmissionAdminService', () => {
  let service: AdmissionAdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdmissionAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadTemplate', () => {
    it('should set loading then success state', () => {
      const mockTemplate = {
        id: 'tpl-1',
        name: 'CS Admission 2026',
        description: 'Computer Science admission pipeline',
        programme_id: 'prog-1',
        programme_name: 'Computer Science',
        stages: [],
        status: 'draft',
        open_date: null,
        close_date: null,
        max_concurrent_applications: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      service.loadTemplate('tpl-1').subscribe();
      expect(service.templateState().status).toBe('loading');

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/admissions/templates/tpl-1'));
      expect(req.request.method).toBe('GET');
      req.flush(mockTemplate);

      expect(service.templateState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadTemplate('tpl-1').subscribe();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/admissions/templates/tpl-1'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.templateState().status).toBe('error');
    });
  });

  describe('createTemplate', () => {
    it('should POST and set success state', () => {
      const newTemplate = {
        name: 'New Pipeline',
        description: 'Test',
        programme_id: null,
        programme_name: null,
        stages: [],
        open_date: null,
        close_date: null,
        max_concurrent_applications: 1,
      };

      service.createTemplate(newTemplate).subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/admissions/templates') && r.method === 'POST',
      );
      req.flush({
        id: 'tpl-2',
        ...newTemplate,
        status: 'draft',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });

      expect(service.templateState().status).toBe('success');
    });
  });

  describe('getApplications', () => {
    it('should set loading then success state', () => {
      const mockApps = [
        {
          id: 'app-1',
          pipeline_id: 'tpl-1',
          pipeline_name: 'CS Admission',
          learner_gcid: 'gcid-1',
          learner_name: 'Test Learner',
          programme_name: 'CS',
          status: 'in_progress',
          current_stage_id: 'stg-1',
          current_stage_name: 'Documents',
          completed_stages: 1,
          total_stages: 4,
          submitted_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      service.getApplications().subscribe();
      expect(service.applicationListState().status).toBe('loading');

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/admissions/applications'));
      expect(req.request.method).toBe('GET');
      req.flush(mockApps);

      expect(service.applicationListState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.getApplications().subscribe();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/admissions/applications'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.applicationListState().status).toBe('error');
    });
  });

  describe('recordDecision', () => {
    it('should POST decision for an application', () => {
      service.recordDecision('app-1', 'approved', null, null).subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/admissions/applications/app-1/decision') && r.method === 'POST',
      );
      expect(req.request.body).toEqual({
        decision: 'approved',
        reason_code: null,
        reason_detail: null,
      });
      req.flush({
        id: 'dec-1',
        application_id: 'app-1',
        decision: 'approved',
        reason_code: null,
        reason_detail: null,
        reviewer_gcid: 'gcid-admin',
        reviewer_name: 'Admin',
        decided_at: '2026-01-01T00:00:00Z',
        next_intake_date: null,
      });
    });
  });

  describe('bulkDecision', () => {
    it('should POST bulk decision', () => {
      const request = {
        application_ids: ['app-1', 'app-2'],
        decision: 'rejected' as const,
        reason_code: 'capacity_reached' as const,
        reason_detail: 'No more slots available',
      };

      service.bulkDecision(request).subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/admissions/applications/bulk-decision') && r.method === 'POST',
      );
      expect(req.request.body).toEqual(request);
      req.flush([]);
    });
  });
});
