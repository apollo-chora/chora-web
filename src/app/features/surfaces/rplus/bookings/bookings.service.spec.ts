/**
 * BookingsService spec - R+ /r/bookings (real BFF wiring).
 *
 * Verifies the service issues POST /api/bookings + PATCH
 * /api/bookings/{id}/status on the BFF with the snake_case payloads
 * chora-delivery validates, and maps the bookingDTO wire envelope into the
 * camelCase Booking model. No fixtures: HttpTestingController flushes real
 * envelopes. list() GETs /api/bookings (CHO-1622) and maps the {items,total}
 * BookingList envelope.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { BookingsService } from './bookings.service';
import { environment } from '../../../../../environments/environment';

function backendBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-001',
    class_id: 'class-dsa-101',
    course_id: 'course-dsa',
    tenant_id: 'tenant-001',
    learner_gcid: 'gcid-phyllis',
    status: 'pending',
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
    ...overrides,
  };
}

describe('BookingsService', () => {
  let service: BookingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BookingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('POSTs /api/bookings with the snake_case create payload', async () => {
    const promise = firstValueFrom(
      service.create({
        classId: 'class-dsa-101',
        learnerGcid: 'gcid-phyllis',
      }),
    );

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/bookings`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      class_id: 'class-dsa-101',
      learner_gcid: 'gcid-phyllis',
    });
    req.flush(backendBooking());

    const booking = await promise;
    expect(booking.id).toBe('booking-001');
    expect(booking.classId).toBe('class-dsa-101');
    expect(booking.courseId).toBe('course-dsa');
    expect(booking.tenantId).toBe('tenant-001');
    expect(booking.learnerGcid).toBe('gcid-phyllis');
    expect(booking.status).toBe('pending');
  });

  it('maps the bookingDTO envelope into the typed Booking model', async () => {
    const promise = firstValueFrom(
      service.create({ classId: 'c-1', learnerGcid: 'g-1' }),
    );
    httpMock.expectOne(`${environment.bffBaseUrl}/api/bookings`).flush(
      backendBooking({
        id: 'booking-xyz',
        status: 'confirmed',
        created_at: '2026-05-26T11:00:00Z',
        updated_at: '2026-05-26T11:05:00Z',
      }),
    );
    const booking = await promise;
    expect(booking.id).toBe('booking-xyz');
    expect(booking.status).toBe('confirmed');
    expect(booking.createdAt).toBe('2026-05-26T11:00:00Z');
    expect(booking.updatedAt).toBe('2026-05-26T11:05:00Z');
  });

  it('PATCHes /api/bookings/{id}/status with the new status', async () => {
    const promise = firstValueFrom(
      service.updateStatus('booking-001', 'confirmed'),
    );
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/bookings/booking-001/status`,
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'confirmed' });
    req.flush(backendBooking({ status: 'confirmed' }));

    const booking = await promise;
    expect(booking.status).toBe('confirmed');
  });

  it('URL-encodes the booking id in the status PATCH path', async () => {
    const promise = firstValueFrom(
      service.updateStatus('book ing/01', 'attended'),
    );
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/bookings/book%20ing%2F01/status`,
    );
    expect(req.request.method).toBe('PATCH');
    req.flush(backendBooking({ id: 'book ing/01', status: 'attended' }));
    await promise;
  });

  it('preserves the no-show wire status verbatim (hyphenated)', async () => {
    const promise = firstValueFrom(
      service.updateStatus('booking-001', 'no-show'),
    );
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/bookings/booking-001/status`,
    );
    expect(req.request.body).toEqual({ status: 'no-show' });
    req.flush(backendBooking({ status: 'no-show' }));
    const booking = await promise;
    expect(booking.status).toBe('no-show');
  });

  it('GETs /api/bookings and maps the {items,total} envelope (CHO-1622)', async () => {
    const promise = firstValueFrom(service.list());
    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/bookings`);
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [backendBooking(), backendBooking({ id: 'booking-002', status: 'confirmed' })],
      total: 2,
    });
    const rows = await promise;
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('booking-001');
    expect(rows[0].learnerGcid).toBe('gcid-phyllis');
    expect(rows[1].status).toBe('confirmed');
  });

  it('maps an empty BookingList to an empty array', async () => {
    const promise = firstValueFrom(service.list());
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/bookings`)
      .flush({ items: [], total: 0 });
    expect(await promise).toEqual([]);
  });

  it('treats a BookingList with no items field as an empty list', async () => {
    const promise = firstValueFrom(service.list());
    httpMock.expectOne(`${environment.bffBaseUrl}/api/bookings`).flush({ total: 0 });
    expect(await promise).toEqual([]);
  });

  describe('listBookableClasses (class picker source, CHO-2336)', () => {
    function backendClass(overrides: Record<string, unknown> = {}) {
      return {
        id: 'cls-1',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-19T09:00:00+00:00',
        ends_at: '2026-05-19T12:00:00+00:00',
        max_capacity: 25,
        ...overrides,
      };
    }

    it('GETs the durable ScheduledClass list off the scheduling endpoint', async () => {
      const promise = firstValueFrom(service.listBookableClasses());
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/v1/scheduling/classes`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({ items: [backendClass()] });
      const options = await promise;
      expect(options).toHaveLength(1);
      // The option id is the ScheduledClass id - the exact value the booking
      // POST sends as class_id (handlers.go resolves it via Scheduling.Get).
      expect(options[0]!.id).toBe('cls-1');
      expect(options[0]!.label.length).toBeGreaterThan(0);
    });

    it('maps an empty scheduling week to an empty option list', async () => {
      const promise = firstValueFrom(service.listBookableClasses());
      httpMock
        .expectOne(`${environment.bffBaseUrl}/v1/scheduling/classes`)
        .flush({ items: [] });
      expect(await promise).toEqual([]);
    });

    it('orders the options chronologically (earliest class first)', async () => {
      const promise = firstValueFrom(service.listBookableClasses());
      httpMock.expectOne(`${environment.bffBaseUrl}/v1/scheduling/classes`).flush({
        items: [
          backendClass({
            id: 'cls-late',
            starts_at: '2026-05-20T13:00:00+00:00',
            ends_at: '2026-05-20T16:00:00+00:00',
          }),
          backendClass({
            id: 'cls-early',
            starts_at: '2026-05-19T09:00:00+00:00',
            ends_at: '2026-05-19T12:00:00+00:00',
          }),
        ],
      });
      const options = await promise;
      expect(options.map((o) => o.id)).toEqual(['cls-early', 'cls-late']);
    });
  });
});
