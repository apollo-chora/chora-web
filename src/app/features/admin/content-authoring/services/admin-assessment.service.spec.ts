import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminAssessmentService } from './admin-assessment.service';

describe('AdminAssessmentService', () => {
  let service: AdminAssessmentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminAssessmentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list assessments', () => {
    service.getAssessments({ limit: 10 }).subscribe((data) => {
      expect(data.data).toHaveLength(1);
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/assessments') && r.method === 'GET');
    req.flush({ data: [{ id: 'a1' }], page_info: { next_cursor: null, has_next: false } });
  });

  it('should get single assessment', () => {
    service.getAssessment('a1').subscribe((data) => {
      expect(data.id).toBe('a1');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/assessments/a1'));
    req.flush({ id: 'a1' });
  });

  it('should delete assessment', () => {
    service.deleteAssessment('a1').subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/assessments/a1') && r.method === 'DELETE');
    req.flush(null);
  });
});
