import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ChecklistService } from './checklist.service';

describe('ChecklistService', () => {
  let service: ChecklistService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ChecklistService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getChecklist', () => {
    it('should set loading then success state', () => {
      const mockChecklist = {
        id: 'cl-1',
        template_id: 'tpl-1',
        template_name: 'New Learner Onboarding',
        items: [],
        completed_count: 0,
        total_count: 5,
      };

      service.getChecklist().subscribe();
      expect(service.checklistState().status).toBe('loading');

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/onboarding/checklist'));
      expect(req.request.method).toBe('GET');
      req.flush(mockChecklist);

      expect(service.checklistState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.getChecklist().subscribe();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/onboarding/checklist'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.checklistState().status).toBe('error');
    });
  });

  describe('markItemComplete', () => {
    it('should POST completion for an item', () => {
      service.markItemComplete('item-1').subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/onboarding/checklist/items/item-1/complete') && r.method === 'POST',
      );
      req.flush({
        id: 'cl-1',
        template_id: 'tpl-1',
        template_name: 'Onboarding',
        items: [],
        completed_count: 1,
        total_count: 5,
      });

      expect(service.checklistState().status).toBe('success');
    });
  });

  describe('getChecklistSummary', () => {
    it('should set loading then success state', () => {
      const mockSummary = {
        checklist_id: 'cl-1',
        template_name: 'Onboarding',
        completed_count: 3,
        total_count: 5,
        percentage: 60,
        has_overdue: false,
      };

      service.getChecklistSummary().subscribe();
      expect(service.summaryState().status).toBe('loading');

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/onboarding/checklist/summary'));
      expect(req.request.method).toBe('GET');
      req.flush(mockSummary);

      expect(service.summaryState().status).toBe('success');
    });
  });
});
