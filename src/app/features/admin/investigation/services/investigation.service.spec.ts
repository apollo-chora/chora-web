import { expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { InvestigationService } from './investigation.service';
import { environment } from '../../../../../environments/environment';
import type { EntityType } from '../models/investigation.model';

describe('InvestigationService', () => {
  let service: InvestigationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InvestigationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Service Health (gateway /health — real HTTP via BffClient)
  // -----------------------------------------------------------------------

  it('should fetch gateway health', () => {
    service.getGatewayHealth().subscribe((data) => {
      expect(data['status']).toBe('healthy');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/health'));
    req.flush({ status: 'healthy' });
  });

  it('GETs the absolute BFF /health URL with method GET', async () => {
    const promise = firstValueFrom(service.getGatewayHealth());

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/health`);
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'healthy', uptime: 12345 });

    const data = await promise;
    expect(data['uptime']).toBe(12345);
  });

  it('propagates a 5xx error from the gateway /health endpoint', async () => {
    const promise = firstValueFrom(service.getGatewayHealth());

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/health`);
    req.flush('boom', { status: 503, statusText: 'Service Unavailable' });

    await expect(promise).rejects.toMatchObject({ status: 503 });
  });

  it('propagates a 4xx error from the gateway /health endpoint', async () => {
    const promise = firstValueFrom(service.getGatewayHealth());

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/health`);
    req.flush('forbidden', { status: 403, statusText: 'Forbidden' });

    await expect(promise).rejects.toMatchObject({ status: 403 });
  });

  // -----------------------------------------------------------------------
  // Service Health (mock adapter — synchronous of(...), no HTTP)
  // -----------------------------------------------------------------------

  it('should return mock service health', () => {
    service.getServiceHealth().subscribe((data) => {
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].serviceName).toBe('chora-gateway');
    });
  });

  it('returns mock service health with mixed states and no HTTP call', async () => {
    const data = await firstValueFrom(service.getServiceHealth());
    expect(data).toHaveLength(10);

    const statuses = data.map((s) => s.status);
    expect(statuses).toContain('healthy');
    expect(statuses).toContain('degraded');
    expect(statuses).toContain('unhealthy');

    const degraded = data.find((s) => s.serviceName === 'chora-engagement');
    expect(degraded!.status).toBe('degraded');
    expect(degraded!.responseTimeMs).toBe(450);

    const down = data.find((s) => s.serviceName === 'chora-media-processor');
    expect(down!.status).toBe('unhealthy');
    expect(down!.responseTimeMs).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Error Logs (mock adapter)
  // -----------------------------------------------------------------------

  it('returns mock recent error logs with error and warn levels', async () => {
    const logs = await firstValueFrom(service.getRecentErrors());
    expect(logs).toHaveLength(5);

    const levels = logs.map((l) => l.level);
    expect(levels).toContain('error');
    expect(levels).toContain('warn');

    // Each entry has a correlationId; some carry a tenantId.
    expect(logs.every((l) => typeof l.correlationId === 'string')).toBe(true);
    const withTenant = logs.filter((l) => l.tenantId !== undefined);
    expect(withTenant.length).toBeGreaterThan(0);
    expect(logs[0]!.service).toBe('chora-media-processor');
  });

  // -----------------------------------------------------------------------
  // Incidents (mock adapter)
  // -----------------------------------------------------------------------

  it('should return mock active incidents', () => {
    service.getActiveIncidents().subscribe((data) => {
      expect(data.length).toBeGreaterThan(0);
    });
  });

  it('returns mock active incidents with severity/status fields', async () => {
    const incidents = await firstValueFrom(service.getActiveIncidents());
    expect(incidents).toHaveLength(3);

    const first = incidents.find((i) => i.id === 'inc-001');
    expect(first!.severity).toBe('high');
    expect(first!.status).toBe('investigating');
    expect(first!.affectedServices).toContain('chora-media-processor');
    expect(first!.assignedTo).toBe('ops-team-alpha');

    // inc-003 has no assignedTo (optional field).
    const last = incidents.find((i) => i.id === 'inc-003');
    expect(last!.assignedTo).toBeUndefined();
  });

  it('transitionIncident resolves to undefined and issues no HTTP call', async () => {
    const result = await firstValueFrom(
      service.transitionIncident('inc-001', 'resolved'),
    );
    expect(result).toBeUndefined();
    httpMock.expectNone(() => true);
  });

  it('getIncidentTimeline returns mock timeline entries', async () => {
    const timeline = await firstValueFrom(
      service.getIncidentTimeline('inc-001'),
    );
    expect(timeline).toHaveLength(3);
    expect(timeline[0]!.action).toBe('Incident created');
    expect(timeline[0]!.actor).toBe('system');
    // Second entry has no note (optional field).
    expect(timeline[1]!.note).toBeUndefined();
    expect(timeline[2]!.note).toContain('Cloud Storage');
  });

  // -----------------------------------------------------------------------
  // Entity Search (mock adapter — all three EntityType branches)
  // -----------------------------------------------------------------------

  it('searchEntity maps a gcid lookup to chora-iam', async () => {
    const results = await firstValueFrom(
      service.searchEntity('gcid', 'abc-123'),
    );
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.entityType).toBe('gcid');
    expect(r.entityId).toBe('abc-123');
    expect(r.label).toBe('GCID: abc-123');
    expect(r.service).toBe('chora-iam');
  });

  it('searchEntity maps an atom lookup to chora-atomic', async () => {
    const results = await firstValueFrom(
      service.searchEntity('atom', 'atom-9'),
    );
    expect(results[0]!.service).toBe('chora-atomic');
    expect(results[0]!.label).toBe('ATOM: atom-9');
  });

  it('searchEntity maps a tenant lookup to chora-tenancy', async () => {
    const results = await firstValueFrom(
      service.searchEntity('tenant', 'tenant-7'),
    );
    expect(results[0]!.service).toBe('chora-tenancy');
    expect(results[0]!.label).toBe('TENANT: tenant-7');
  });

  it('searchEntity issues no HTTP call (mock adapter)', async () => {
    const types: EntityType[] = ['gcid', 'atom', 'tenant'];
    for (const t of types) {
      await firstValueFrom(service.searchEntity(t, 'x'));
    }
    httpMock.expectNone(() => true);
  });
});
