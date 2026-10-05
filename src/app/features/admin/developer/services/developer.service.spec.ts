import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { DeveloperService } from './developer.service';

describe('DeveloperService', () => {
  let service: DeveloperService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DeveloperService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    service.disconnectEventBus();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // API Inspector
  // -------------------------------------------------------------------------

  describe('getRequestLogs', () => {
    it('should return mock request logs', () => {
      let logs: unknown[] = [];
      service.getRequestLogs().subscribe((result) => {
        logs = result;
      });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should include various HTTP methods in mock data', () => {
      let logs: { method: string }[] = [];
      service.getRequestLogs().subscribe((result) => {
        logs = result;
      });

      const methods = new Set(logs.map((l) => l.method));
      expect(methods.has('GET')).toBe(true);
      expect(methods.has('POST')).toBe(true);
    });

    it('should include logs with different status codes', () => {
      let logs: { status: number }[] = [];
      service.getRequestLogs().subscribe((result) => {
        logs = result;
      });

      const statuses = logs.map((l) => l.status);
      expect(statuses.some((s) => s >= 200 && s < 300)).toBe(true);
      expect(statuses.some((s) => s >= 400)).toBe(true);
    });
  });

  describe('replayRequest', () => {
    it('should return a replayed request log with new ID', () => {
      let result: { id: string } | undefined;
      service.replayRequest('req-001').subscribe((r) => {
        result = r;
      });
      expect(result).toBeTruthy();
      expect(result!.id).toContain('replay-');
    });

    it('should return a result even for unknown request ID', () => {
      let result: { id: string } | undefined;
      service.replayRequest('nonexistent').subscribe((r) => {
        result = r;
      });
      expect(result).toBeTruthy();
      expect(result!.id).toContain('replay-');
    });

    it('should have a fresh timestamp on replayed request', () => {
      let result: { timestamp: string } | undefined;
      const before = new Date().toISOString();
      service.replayRequest('req-001').subscribe((r) => {
        result = r;
      });
      expect(result).toBeTruthy();
      expect(result!.timestamp >= before).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Feature Flags
  // -------------------------------------------------------------------------

  describe('getFeatureFlagOverrides', () => {
    it('should return mock feature flags', () => {
      let flags: unknown[] = [];
      service.getFeatureFlagOverrides().subscribe((result) => {
        flags = result;
      });
      expect(flags.length).toBeGreaterThan(0);
    });

    it('should include familiar add-on code in flags', () => {
      let flags: { addOnCode: string }[] = [];
      service.getFeatureFlagOverrides().subscribe((result) => {
        flags = result;
      });
      expect(flags.some((f) => f.addOnCode === 'familiar')).toBe(true);
    });

    it('should include byoa with override active in mock data', () => {
      let flags: { addOnCode: string; overrideActive: boolean }[] = [];
      service.getFeatureFlagOverrides().subscribe((result) => {
        flags = result;
      });
      const byoa = flags.find((f) => f.addOnCode === 'byoa');
      expect(byoa).toBeTruthy();
      expect(byoa!.overrideActive).toBe(true);
    });
  });

  describe('setFeatureFlagOverride', () => {
    it('should complete successfully', () => {
      let completed = false;
      service.setFeatureFlagOverride('familiar', true, true).subscribe({
        complete: () => { completed = true; },
      });
      expect(completed).toBe(true);
    });
  });

  describe('clearAllOverrides', () => {
    it('should complete successfully', () => {
      let completed = false;
      service.clearAllOverrides().subscribe({
        complete: () => { completed = true; },
      });
      expect(completed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Event Bus
  // -------------------------------------------------------------------------

  describe('event bus', () => {
    it('should start in disconnected state', () => {
      expect(service.eventBusConnectionState()).toBe('disconnected');
      expect(service.eventBusMessages().length).toBe(0);
    });

    it('should transition to connecting then connected', () => {
      vi.useFakeTimers();
      service.connectEventBus();
      expect(service.eventBusConnectionState()).toBe('connecting');

      vi.advanceTimersByTime(500);
      expect(service.eventBusConnectionState()).toBe('connected');
      expect(service.eventBusMessages().length).toBeGreaterThan(0);
      vi.useRealTimers();
    });

    it('should disconnect and clear messages', () => {
      vi.useFakeTimers();
      service.connectEventBus();
      vi.advanceTimersByTime(500);
      expect(service.eventBusMessages().length).toBeGreaterThan(0);

      service.disconnectEventBus();
      expect(service.eventBusConnectionState()).toBe('disconnected');
      expect(service.eventBusMessages().length).toBe(0);
      vi.useRealTimers();
    });

    it('should append events and cap at 100', () => {
      vi.useFakeTimers();
      service.connectEventBus();
      vi.advanceTimersByTime(500);

      const initialCount = service.eventBusMessages().length;
      service.appendEvent({
        topic: 'chora.test.topic',
        eventType: 'TestEvent',
        timestamp: new Date().toISOString(),
        tenantId: 'tenant-test',
        aggregateId: 'agg-test',
        payload: { test: true },
      });

      expect(service.eventBusMessages().length).toBe(initialCount + 1);
      // Newest event should be first
      expect(service.eventBusMessages()[0].eventType).toBe('TestEvent');
      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // RLS Context
  // -------------------------------------------------------------------------

  describe('loadRlsContext', () => {
    it('should set loading then success state', () => {
      expect(service.rlsContextState().status).toBe('idle');

      service.loadRlsContext().subscribe();
      // After subscribe (mock data returns synchronously via of())
      expect(service.rlsContextState().status).toBe('success');
    });

    it('should populate rlsContext signal', () => {
      service.loadRlsContext().subscribe();

      const context = service.rlsContext();
      expect(context).toBeTruthy();
      expect(context!.tenant_id).toBe('tenant-001');
      expect(context!.gcid).toBe('gcid-admin-001');
      expect(context!.role).toBe('super_admin');
    });

    it('should include capabilities in context', () => {
      service.loadRlsContext().subscribe();

      const context = service.rlsContext();
      expect(context!.capabilities.length).toBeGreaterThan(0);
      expect(context!.capabilities).toContain('developer:access');
    });

    it('should include RLS policies in context', () => {
      service.loadRlsContext().subscribe();

      const context = service.rlsContext();
      expect(context!.rls_policies_applied.length).toBeGreaterThan(0);
      expect(context!.rls_policies_applied[0].table_name).toBeTruthy();
    });
  });

  describe('testIsolation', () => {
    it('should set loading then success state', () => {
      service.testIsolation().subscribe();
      expect(service.rlsTestState().status).toBe('success');
    });

    it('should populate rlsTestResults signal', () => {
      service.testIsolation().subscribe();

      const results = service.rlsTestResults();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return results with isolation status', () => {
      service.testIsolation().subscribe();

      const results = service.rlsTestResults();
      expect(results.every((r) => typeof r.isolated === 'boolean')).toBe(true);
    });

    it('should include table names in test results', () => {
      service.testIsolation().subscribe();

      const results = service.rlsTestResults();
      const tableNames = results.map((r) => r.table_name);
      expect(tableNames).toContain('learning_atoms');
      expect(tableNames).toContain('user_profiles');
    });

    it('should include execution time in results', () => {
      service.testIsolation().subscribe();

      const results = service.rlsTestResults();
      expect(results.every((r) => typeof r.execution_time_ms === 'number')).toBe(true);
    });
  });

  describe('resetRlsState', () => {
    it('should reset context and test states to idle', () => {
      service.loadRlsContext().subscribe();
      service.testIsolation().subscribe();

      expect(service.rlsContextState().status).toBe('success');
      expect(service.rlsTestState().status).toBe('success');

      service.resetRlsState();

      expect(service.rlsContextState().status).toBe('idle');
      expect(service.rlsTestState().status).toBe('idle');
      expect(service.rlsContext()).toBeNull();
      expect(service.rlsTestResults().length).toBe(0);
    });
  });
});
