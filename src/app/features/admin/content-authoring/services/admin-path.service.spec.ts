import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminPathService } from './admin-path.service';

describe('AdminPathService', () => {
  let service: AdminPathService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminPathService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should list locked paths', () => {
    service.getPaths({ limit: 10 }).subscribe((data) => {
      expect(data.data).toHaveLength(1);
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/locked-paths') && r.method === 'GET');
    req.flush({ data: [{ id: 'p1' }], page_info: { next_cursor: null, has_next: false } });
  });

  it('should get single path', () => {
    service.getPath('p1').subscribe((data) => {
      expect(data.id).toBe('p1');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/locked-paths/p1'));
    req.flush({ id: 'p1', title: 'Test Path', steps: [] });
  });

  it('should delete path', () => {
    service.deletePath('p1').subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/locked-paths/p1') && r.method === 'DELETE');
    req.flush(null);
  });
});
