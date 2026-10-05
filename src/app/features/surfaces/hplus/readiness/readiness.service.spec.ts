import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { ReadinessService } from './readiness.service';
import type { ReadinessReport } from './readiness.model';

/**
 * ReadinessService spec, H+ S1 and S6.
 *
 * The service is a PIPE, not a judge. These tests pin that it hands the
 * server's rows through untouched, in the server's order, and that it turns
 * each documented failure into a distinct i18n key rather than a generic
 * one. Per chora-web CLAUDE.md, `httpMock.verify()` in `afterEach`.
 */

// BffClientService wraps every path in environment.bffBaseUrl, so the specs
// match on the suffix rather than the bare path (the tenant-overview sibling
// does the same). Asserting the bare path here would fail for the wrong
// reason and look like a routing bug.
const readinessReq = (r: { url: string }): boolean =>
  r.url.endsWith('/api/v1/admin/readiness');

/** The eight rows the aggregator always returns, in its fixed order. */
function buildReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    rows: [
      { key: 'organisation', label: 'Organisation', status: 'ok', detail: '1 organisation.', count: 1 },
      { key: 'branding', label: 'Branding', status: 'ok', detail: 'Set.' },
      { key: 'features', label: 'Features', status: 'attention', detail: 'No plan confirmed.', count: 0 },
      { key: 'signIn', label: 'Sign-in', status: 'ok', detail: '1 provider.', count: 1 },
      { key: 'administrators', label: 'Administrators', status: 'ok', detail: '2 administrators.', count: 2 },
      { key: 'content', label: 'Content', status: 'attention', detail: 'No content yet.', count: 0 },
      { key: 'setup', label: 'Setup', status: 'ok', detail: 'Completed.' },
      {
        key: 'billing',
        label: 'Billing',
        status: 'unknown',
        reason:
          'Chora cannot check this yet: invoices and payment methods are held in memory, not stored, so any answer would be invented.',
      },
    ],
    next_action: 'Confirm the plan for this organisation.',
    partial: false,
    ...overrides,
  };
}

function setup(): {
  service: ReadinessService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(ReadinessService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('ReadinessService (H+ instance readiness)', () => {
  let service: ReadinessService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('starts loading before anything is flushed', () => {
    expect(service.state().status).toBe('loading');
  });

  it('reads the aggregator route and nothing else', () => {
    service.load();
    const req = httpMock.expectOne(readinessReq);
    expect(req.request.method).toBe('GET');
    req.flush(buildReport());
  });

  it('hands every row through in the server order, unmodified', () => {
    service.load();
    const report = buildReport();
    httpMock.expectOne(readinessReq).flush(report);

    const s = service.state();
    expect(s.status).toBe('success');
    if (s.status !== 'success') return;
    expect(s.report.rows.map((r) => r.key)).toEqual([
      'organisation',
      'branding',
      'features',
      'signIn',
      'administrators',
      'content',
      'setup',
      'billing',
    ]);
    expect(s.report.rows).toEqual(report.rows);
  });

  it('preserves an absent count as undefined rather than zero', () => {
    service.load();
    httpMock.expectOne(readinessReq).flush(buildReport());

    const s = service.state();
    if (s.status !== 'success') throw new Error('expected success');
    const branding = s.report.rows.find((r) => r.key === 'branding');
    const features = s.report.rows.find((r) => r.key === 'features');
    // Branding counts nothing; features counted and found none. A service
    // that defaulted the pointer to 0 would erase that distinction.
    expect(branding?.count).toBeUndefined();
    expect(features?.count).toBe(0);
  });

  it('carries partial, part_errors and known_gaps through untouched', () => {
    service.load();
    httpMock.expectOne(readinessReq).flush(
      buildReport({
        partial: true,
        part_errors: { identity: 'dial tcp: connection refused' },
        known_gaps: { content: 'Atoms created before the projection are not counted.' },
      }),
    );

    const s = service.state();
    if (s.status !== 'success') throw new Error('expected success');
    expect(s.report.partial).toBe(true);
    expect(s.report.part_errors).toEqual({ identity: 'dial tcp: connection refused' });
    expect(s.report.known_gaps).toEqual({
      content: 'Atoms created before the projection are not counted.',
    });
  });

  it('does not invent a next action when the server omits one', () => {
    service.load();
    httpMock.expectOne(readinessReq).flush(buildReport({ next_action: undefined }));

    const s = service.state();
    if (s.status !== 'success') throw new Error('expected success');
    expect(s.report.next_action).toBeUndefined();
  });

  it.each([
    [403, 'hplus.readiness.error_forbidden'],
    [400, 'hplus.readiness.error_no_tenant'],
    [503, 'hplus.readiness.error_unwired'],
    [500, 'hplus.readiness.error_upstream'],
  ])('maps %i to its own message key', (code, key) => {
    service.load();
    httpMock
      .expectOne(readinessReq)
      .flush({ error: 'x' }, { status: code, statusText: 'err' });

    const s = service.state();
    expect(s.status).toBe('error');
    if (s.status !== 'error') return;
    expect(s.error).toBe(key);
  });

  it('falls back to a generic key for an undocumented status', () => {
    service.load();
    httpMock
      .expectOne(readinessReq)
      .flush({ error: 'x' }, { status: 418, statusText: 'teapot' });

    const s = service.state();
    if (s.status !== 'error') throw new Error('expected error');
    expect(s.error).toBe('hplus.readiness.error_generic');
  });

  it('never leaks a raw backend body into the state', () => {
    service.load();
    httpMock
      .expectOne(readinessReq)
      .flush({ error: 'pq: relation add_ons does not exist' }, { status: 500, statusText: 'err' });

    const s = service.state();
    if (s.status !== 'error') throw new Error('expected error');
    expect(s.error).not.toContain('pq:');
    expect(s.error.startsWith('hplus.readiness.')).toBe(true);
  });

  it('returns to loading and then recovers when retried after a failure', () => {
    service.load();
    httpMock
      .expectOne(readinessReq)
      .flush({ error: 'x' }, { status: 500, statusText: 'err' });
    expect(service.state().status).toBe('error');

    service.load();
    expect(service.state().status).toBe('loading');
    httpMock.expectOne(readinessReq).flush(buildReport());
    expect(service.state().status).toBe('success');
  });
});
