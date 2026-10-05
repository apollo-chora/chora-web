import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { OnboardingAdminService } from './onboarding-admin.service';

describe('OnboardingAdminService', () => {
  let service: OnboardingAdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OnboardingAdminService);
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
        name: 'New Learner Onboarding',
        description: 'Default checklist for new learners',
        items: [],
        target_roles: ['learner'],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      service.loadTemplate('tpl-1').subscribe();
      expect(service.templateState().status).toBe('loading');

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/onboarding/templates/tpl-1'));
      expect(req.request.method).toBe('GET');
      req.flush(mockTemplate);

      expect(service.templateState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.loadTemplate('tpl-1').subscribe();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/onboarding/templates/tpl-1'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.templateState().status).toBe('error');
    });
  });

  describe('createTemplate', () => {
    it('should POST and set success state', () => {
      const newTemplate = {
        name: 'New Onboarding',
        description: 'Test',
        items: [],
        target_roles: ['learner'],
      };

      service.createTemplate(newTemplate).subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/onboarding/templates') && r.method === 'POST',
      );
      req.flush({
        id: 'tpl-2',
        ...newTemplate,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });

      expect(service.templateState().status).toBe('success');
    });
  });

  describe('getCohortProgress', () => {
    it('should set loading then success state', () => {
      const mockProgress = {
        template_id: 'tpl-1',
        template_name: 'Onboarding',
        learners: [],
        total_learners: 0,
        average_completion: 0,
      };

      service.getCohortProgress().subscribe();
      expect(service.cohortState().status).toBe('loading');

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/onboarding/cohorts'));
      expect(req.request.method).toBe('GET');
      req.flush(mockProgress);

      expect(service.cohortState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.getCohortProgress().subscribe();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/onboarding/cohorts'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.cohortState().status).toBe('error');
    });
  });

  describe('sendReminder', () => {
    it('should POST reminder request', () => {
      service.sendReminder(['gcid-1', 'gcid-2']).subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/onboarding/cohorts/reminders') && r.method === 'POST',
      );
      expect(req.request.body).toEqual({ gcids: ['gcid-1', 'gcid-2'] });
      req.flush({ sent: 2 });
    });
  });
});
