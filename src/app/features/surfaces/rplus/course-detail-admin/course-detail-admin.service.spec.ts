import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { CourseDetailAdminService } from './course-detail-admin.service';
import { environment } from '../../../../../environments/environment';

describe('CourseDetailAdminService', () => {
  let service: CourseDetailAdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseDetailAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs /api/v1/courses/{courseId} on the BFF', async () => {
    const promise = firstValueFrom(service.getCourse('course-1'));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/courses/course-1`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'course-1',
      title: 'Certified Scrum Product Owner',
      description: 'PO foundations',
      state: 'PUBLISHED',
      author_gcid: 'gcid-chen',
    });
    const detail = await promise;
    expect(detail.courseId).toBe('course-1');
  });

  it('url-encodes the courseId path segment', async () => {
    const promise = firstValueFrom(service.getCourse('weird id/with space'));
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/courses/weird%20id%2Fwith%20space`,
      )
      .flush({
        id: 'weird id/with space',
        title: 'X',
        state: 'DRAFT',
      });
    await promise;
  });

  it('maps backend Course to CourseDetailAdmin shape', async () => {
    const promise = firstValueFrom(service.getCourse('cspo'));
    httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/courses/cspo`).flush({
      id: 'cspo',
      title: 'Certified Scrum Product Owner',
      description: 'PO foundations',
      state: 'PUBLISHED',
      author_gcid: 'gcid-chen',
    });
    const d = await promise;
    expect(d.code).toBe('CSPO');
    expect(d.author).toBe('gcid-chen');
    expect(d.status).toBe('Published');
    expect(d.summary).toBe('PO foundations');
  });

  it('maps AWAITING_REVIEW → Awaiting Review (per-course review moved to detail)', async () => {
    const promise = firstValueFrom(service.getCourse('c2'));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/courses/c2`)
      .flush({ id: 'c2', title: 'X', state: 'AWAITING_REVIEW' });
    const d = await promise;
    expect(d.status).toBe('Awaiting Review');
  });

  it('defaults missing fields without faking fixture data', async () => {
    const promise = firstValueFrom(service.getCourse('c3'));
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/courses/c3`)
      .flush({ id: 'c3', title: 'Minimal course', state: 'DRAFT' });
    const d = await promise;
    // `atoms` and `cohorts` are GONE from the model (R1 slice 3a), not empty:
    // nothing on the wire serves either, so the screen no longer claims them.
    expect(d.enrolledLearners).toEqual([]);
    // `kpis` now carries ONLY what a read can serve. `completed` and
    // `avgScorePercent` are gone with `atoms` and `cohorts`: this assertion
    // used to pin three hardcoded zeroes and call that "not faking fixture
    // data", when printing a zero nothing can move IS the fake.
    expect(d.kpis).toEqual({ enrolled: 0 });
    expect(d.author).toBe('–');
    expect(d.summary).toBe('');
  });
});
