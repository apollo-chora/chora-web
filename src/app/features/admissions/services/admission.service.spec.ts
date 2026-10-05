import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AdmissionService } from './admission.service';

describe('AdmissionService', () => {
  let service: AdmissionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdmissionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAvailablePipelines', () => {
    it('should set loading then success state', () => {
      const mockPipelines = [
        {
          id: 'pip-1',
          name: 'CS Admission 2026',
          description: 'Apply for Computer Science programme',
          programme_name: 'Computer Science',
          open_date: '2026-01-01T00:00:00Z',
          close_date: '2026-03-01T00:00:00Z',
          total_stages: 4,
          estimated_completion_minutes: 60,
          already_applied: false,
        },
      ];

      service.getAvailablePipelines().subscribe();
      expect(service.pipelineListState().status).toBe('loading');

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/admissions/pipelines'));
      expect(req.request.method).toBe('GET');
      req.flush(mockPipelines);

      expect(service.pipelineListState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.getAvailablePipelines().subscribe();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/admissions/pipelines'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.pipelineListState().status).toBe('error');
    });
  });

  describe('startApplication', () => {
    it('should POST and set success state', () => {
      service.startApplication('pip-1').subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/admissions/my-applications') && r.method === 'POST',
      );
      expect(req.request.body).toEqual({ pipeline_id: 'pip-1' });
      req.flush({
        id: 'app-1',
        pipeline_id: 'pip-1',
        pipeline_name: 'CS Admission',
        programme_name: 'CS',
        stages: [],
        current_stage_index: 0,
        started_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });

      expect(service.applicationState().status).toBe('success');
    });
  });

  describe('getApplication', () => {
    it('should GET and set success state', () => {
      service.getApplication('app-1').subscribe();
      expect(service.applicationState().status).toBe('loading');

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/admissions/my-applications/app-1'),
      );
      req.flush({
        id: 'app-1',
        pipeline_id: 'pip-1',
        pipeline_name: 'CS Admission',
        programme_name: 'CS',
        stages: [],
        current_stage_index: 0,
        started_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });

      expect(service.applicationState().status).toBe('success');
    });
  });

  describe('submitStage', () => {
    it('should POST stage submission', () => {
      const submission = {
        stage_id: 'stg-1',
        form_responses: { name: 'Test' },
      };

      service.submitStage('app-1', submission).subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/admissions/my-applications/app-1/stages/stg-1/submit') &&
        r.method === 'POST',
      );
      expect(req.request.body).toEqual(submission);
      req.flush({
        id: 'app-1',
        pipeline_id: 'pip-1',
        pipeline_name: 'CS Admission',
        programme_name: 'CS',
        stages: [],
        current_stage_index: 1,
        started_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });
    });
  });

  describe('getDecision', () => {
    it('should GET and set success state', () => {
      service.getDecision('app-1').subscribe();
      expect(service.decisionState().status).toBe('loading');

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/admissions/my-applications/app-1/decision'),
      );
      req.flush({
        decision: 'approved',
        message: 'Congratulations!',
        decided_at: '2026-01-15T00:00:00Z',
        reason_summary: null,
        next_steps: ['Complete enrollment'],
        enrollment_action_url: '/enroll/cs-2026',
        next_intake_date: null,
        auto_carry_forward: false,
        reapplication_eligible: false,
        reapplication_earliest_date: null,
      });

      expect(service.decisionState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.getDecision('app-1').subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/admissions/my-applications/app-1/decision'),
      );
      req.flush('Error', { status: 404, statusText: 'Not Found' });
      expect(service.decisionState().status).toBe('error');
    });
  });
});
