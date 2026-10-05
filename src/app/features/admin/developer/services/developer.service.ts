/**
 * DeveloperService — REST adapter for the developer console.
 *
 * Provides:
 *   - API request log retrieval (mock data pending backend integration)
 *   - Feature flag override CRUD
 *   - Event bus WebSocket message stream
 *
 * All HTTP calls go through BffClientService.
 */
import { Injectable, signal, computed } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
// import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  APIRequestLog,
  FeatureFlagOverride,
  EventBusMessage,
  EventBusConnectionState,
  RlsContext,
  RlsTestResult,
  RlsContextState,
  RlsTestState,
} from '../models/developer.model';

// TODO: Use these paths once real APIs are integrated
// const FLAGS_PATH = '/api/v1/admin/developer/feature-flags';
// const RLS_CONTEXT_PATH = '/api/v1/admin/developer/rls-context';
// const RLS_TEST_PATH = '/api/v1/admin/developer/rls-test';

@Injectable({ providedIn: 'root' })
export class DeveloperService {
  // TODO: Use once real APIs are integrated
  // private readonly bff = inject(BffClientService);

  // -------------------------------------------------------------------------
  // Event Bus State (signal-based for real-time updates)
  // -------------------------------------------------------------------------

  private readonly _eventBusMessages = signal<EventBusMessage[]>([]);
  private readonly _eventBusState = signal<EventBusConnectionState>('disconnected');

  readonly eventBusMessages = computed(() => this._eventBusMessages());
  readonly eventBusConnectionState = computed(() => this._eventBusState());

  // -------------------------------------------------------------------------
  // API Inspector
  // -------------------------------------------------------------------------

  /**
   * Fetch recent API request logs.
   * Returns mock data until the gateway exposes request logging.
   */
  getRequestLogs(): Observable<APIRequestLog[]> {
    // TODO: Replace with real gateway request log API
    // return this.bff.get<APIRequestLog[]>('/api/v1/admin/developer/request-logs');
    return of(MOCK_REQUEST_LOGS);
  }

  /**
   * Replay a previously recorded API request.
   * POST /api/v1/admin/developer/replay
   */
  replayRequest(requestId: string): Observable<APIRequestLog> {
    // TODO: Replace with real BFF call
    // return this.bff.post<APIRequestLog>('/api/v1/admin/developer/replay', { requestId });
    const original = MOCK_REQUEST_LOGS.find((r) => r.id === requestId);
    if (!original) {
      return of({ ...MOCK_REQUEST_LOGS[0], id: `replay-${requestId}`, timestamp: new Date().toISOString() });
    }
    return of({ ...original, id: `replay-${requestId}`, timestamp: new Date().toISOString() });
  }

  // -------------------------------------------------------------------------
  // Feature Flags
  // -------------------------------------------------------------------------

  /**
   * Get all feature flag overrides for the current tenant.
   */
  getFeatureFlagOverrides(): Observable<FeatureFlagOverride[]> {
    // TODO: Replace with real BFF call
    // return this.bff.get<FeatureFlagOverride[]>(FLAGS_PATH);
    return of(MOCK_FEATURE_FLAGS);
  }

  /**
   * Toggle a feature flag override.
   * PUT /api/v1/admin/developer/feature-flags/{addOnCode}
   */
  setFeatureFlagOverride(_addOnCode: string, _overrideActive: boolean, _overrideValue: boolean): Observable<void> {
    // TODO: Replace with real BFF call
    // return this.bff.put<void>(`${FLAGS_PATH}/${encodeURIComponent(addOnCode)}`, { overrideActive, overrideValue });
    return of(undefined);
  }

  /**
   * Clear all feature flag overrides.
   * DELETE /api/v1/admin/developer/feature-flags
   */
  clearAllOverrides(): Observable<void> {
    // TODO: Replace with real BFF call
    // return this.bff.delete<void>(FLAGS_PATH);
    return of(undefined);
  }

  // -------------------------------------------------------------------------
  // Event Bus
  // -------------------------------------------------------------------------

  /**
   * Connect to the event bus WebSocket stream.
   * In production this would open a WebSocket to chora-gateway /ws/events.
   * For now, simulates messages with mock data.
   */
  connectEventBus(): void {
    this._eventBusState.set('connecting');

    // TODO: Replace with real WebSocket connection
    // const ws = new WebSocket(`${environment.wsBaseUrl}/ws/admin/events`);
    setTimeout(() => {
      this._eventBusState.set('connected');
      this._eventBusMessages.set(MOCK_EVENT_BUS_MESSAGES);
    }, 500);
  }

  /**
   * Disconnect from the event bus WebSocket.
   */
  disconnectEventBus(): void {
    this._eventBusState.set('disconnected');
    this._eventBusMessages.set([]);
  }

  /**
   * Append a mock event (for simulation purposes).
   */
  appendEvent(event: EventBusMessage): void {
    this._eventBusMessages.update((current) => [event, ...current].slice(0, 100));
  }

  // -------------------------------------------------------------------------
  // RLS Context
  // -------------------------------------------------------------------------

  private readonly _rlsContextState = signal<RlsContextState>({ status: 'idle' });
  readonly rlsContextState = this._rlsContextState.asReadonly();

  readonly rlsContext = computed(() => {
    const s = this._rlsContextState();
    return s.status === 'success' ? s.context : null;
  });

  private readonly _rlsTestState = signal<RlsTestState>({ status: 'idle' });
  readonly rlsTestState = this._rlsTestState.asReadonly();

  readonly rlsTestResults = computed(() => {
    const s = this._rlsTestState();
    return s.status === 'success' ? s.results : [];
  });

  /**
   * Load the current RLS session context.
   * GET /api/v1/admin/developer/rls-context
   */
  loadRlsContext(): Observable<RlsContext | null> {
    this._rlsContextState.set({ status: 'loading' });

    // TODO: Replace with real BFF call
    // return this.bff.get<RlsContext>(RLS_CONTEXT_PATH).pipe(...)
    return of(MOCK_RLS_CONTEXT).pipe(
      tap((context) => {
        this._rlsContextState.set({ status: 'success', context });
      }),
      catchError((err: Error) => {
        this._rlsContextState.set({
          status: 'error',
          error: { code: 'RLS_CONTEXT_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  /**
   * Test tenant isolation by running test queries across tables.
   * POST /api/v1/admin/developer/rls-test
   */
  testIsolation(_targetTenantId?: string): Observable<RlsTestResult[] | null> {
    this._rlsTestState.set({ status: 'loading' });

    // TODO: Replace with real BFF call
    // return this.bff.post<RlsTestResult[]>(RLS_TEST_PATH, { targetTenantId }).pipe(...)
    return of(MOCK_RLS_TEST_RESULTS).pipe(
      tap((results) => {
        this._rlsTestState.set({ status: 'success', results });
      }),
      catchError((err: Error) => {
        this._rlsTestState.set({
          status: 'error',
          error: { code: 'RLS_TEST_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  /**
   * Reset RLS state.
   */
  resetRlsState(): void {
    this._rlsContextState.set({ status: 'idle' });
    this._rlsTestState.set({ status: 'idle' });
  }
}

// ---------------------------------------------------------------------------
// Mock data (removed once real APIs are integrated)
// ---------------------------------------------------------------------------

const MOCK_REQUEST_LOGS: APIRequestLog[] = [
  {
    id: 'req-001',
    method: 'GET',
    url: '/api/v1/atoms?limit=20&offset=0',
    status: 200,
    durationMs: 45,
    requestHeaders: { Authorization: 'Bearer ***', 'X-Tenant-ID': 'tenant-001' },
    responseHeaders: { 'Content-Type': 'application/json', 'X-Correlation-ID': 'corr-001' },
    responseBody: '{"data": [...], "total": 42}',
    timestamp: new Date(Date.now() - 30000).toISOString(),
    correlationId: 'corr-001',
  },
  {
    id: 'req-002',
    method: 'POST',
    url: '/api/v1/assessments/sess-123/submit',
    status: 201,
    durationMs: 120,
    requestHeaders: { Authorization: 'Bearer ***', 'Content-Type': 'application/json' },
    responseHeaders: { 'Content-Type': 'application/json' },
    requestBody: '{"answers": [{"atomId": "atom-1", "answer": "B"}]}',
    responseBody: '{"sessionId": "sess-123", "score": 85}',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    correlationId: 'corr-002',
  },
  {
    id: 'req-003',
    method: 'GET',
    url: '/api/v1/engagement/streaks/me',
    status: 200,
    durationMs: 22,
    requestHeaders: { Authorization: 'Bearer ***' },
    responseHeaders: { 'Content-Type': 'application/json' },
    responseBody: '{"currentStreak": 7, "longestStreak": 14}',
    timestamp: new Date(Date.now() - 90000).toISOString(),
    correlationId: 'corr-003',
  },
  {
    id: 'req-004',
    method: 'PUT',
    url: '/api/v1/atoms/atom-456',
    status: 403,
    durationMs: 15,
    requestHeaders: { Authorization: 'Bearer ***', 'Content-Type': 'application/json' },
    responseHeaders: { 'Content-Type': 'application/json' },
    requestBody: '{"title": "Updated atom title"}',
    responseBody: '{"error": "insufficient_permissions", "message": "atom:publish required"}',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    correlationId: 'corr-004',
  },
  {
    id: 'req-005',
    method: 'DELETE',
    url: '/api/v1/admin/users/gcid-789',
    status: 500,
    durationMs: 2300,
    requestHeaders: { Authorization: 'Bearer ***' },
    responseHeaders: { 'Content-Type': 'application/json' },
    responseBody: '{"error": "internal_error", "message": "database connection timeout"}',
    timestamp: new Date(Date.now() - 180000).toISOString(),
    correlationId: 'corr-005',
  },
];

const MOCK_FEATURE_FLAGS: FeatureFlagOverride[] = [
  { addOnCode: 'familiar', displayName: 'Familiar (RPG Companion)', enabled: true, overrideActive: false, overrideValue: false },
  { addOnCode: 'discovery_mode', displayName: 'Graph-Based Discovery', enabled: true, overrideActive: false, overrideValue: false },
  { addOnCode: 'live_quiz', displayName: 'Live Quiz & Polling', enabled: false, overrideActive: false, overrideValue: false },
  { addOnCode: 'choraverse', displayName: 'Choraverse (Trading Cards & Duels)', enabled: false, overrideActive: false, overrideValue: false },
  { addOnCode: 'advanced_analytics', displayName: 'Advanced Analytics', enabled: true, overrideActive: false, overrideValue: false },
  { addOnCode: 'byoa', displayName: 'Bring Your Own Agent', enabled: false, overrideActive: true, overrideValue: true },
  { addOnCode: 'exam_proctoring', displayName: 'Exam Proctoring', enabled: false, overrideActive: false, overrideValue: false },
  { addOnCode: 'a2a_gateway', displayName: 'A2A Gateway', enabled: false, overrideActive: false, overrideValue: false },
];

const MOCK_RLS_CONTEXT: RlsContext = {
  tenant_id: 'tenant-001',
  tenant_name: 'Acme University',
  gcid: 'gcid-admin-001',
  role: 'super_admin',
  capabilities: [
    'atom:create', 'atom:publish', 'atom:delete',
    'tenant:manage', 'tenant:delete',
    'user:manage', 'user:invite',
    'assessment:create', 'assessment:grade',
    'analytics:view', 'developer:access',
  ],
  session_start: new Date(Date.now() - 3600000).toISOString(),
  rls_policies_applied: [
    {
      table_name: 'learning_atoms',
      policy_name: 'tenant_isolation_atoms',
      policy_type: 'permissive',
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid',
      enabled: true,
    },
    {
      table_name: 'assessment_sessions',
      policy_name: 'tenant_isolation_assessments',
      policy_type: 'permissive',
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid',
      enabled: true,
    },
    {
      table_name: 'user_profiles',
      policy_name: 'tenant_isolation_users',
      policy_type: 'permissive',
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid',
      enabled: true,
    },
    {
      table_name: 'engagement_records',
      policy_name: 'tenant_isolation_engagement',
      policy_type: 'permissive',
      expression: 'tenant_id = current_setting(\'app.current_tenant_id\')::uuid',
      enabled: true,
    },
    {
      table_name: 'audit_logs',
      policy_name: 'restrict_audit_access',
      policy_type: 'restrictive',
      expression: 'role = \'super_admin\' OR gcid = current_setting(\'app.current_gcid\')::uuid',
      enabled: true,
    },
  ],
};

const MOCK_RLS_TEST_RESULTS: RlsTestResult[] = [
  {
    table_name: 'learning_atoms',
    query: 'SELECT count(*) FROM learning_atoms',
    row_count: 42,
    isolated: true,
    execution_time_ms: 3,
    error: null,
  },
  {
    table_name: 'assessment_sessions',
    query: 'SELECT count(*) FROM assessment_sessions',
    row_count: 128,
    isolated: true,
    execution_time_ms: 5,
    error: null,
  },
  {
    table_name: 'user_profiles',
    query: 'SELECT count(*) FROM user_profiles',
    row_count: 15,
    isolated: true,
    execution_time_ms: 2,
    error: null,
  },
  {
    table_name: 'engagement_records',
    query: 'SELECT count(*) FROM engagement_records',
    row_count: 1024,
    isolated: true,
    execution_time_ms: 8,
    error: null,
  },
  {
    table_name: 'audit_logs',
    query: 'SELECT count(*) FROM audit_logs',
    row_count: 256,
    isolated: true,
    execution_time_ms: 4,
    error: null,
  },
];

const MOCK_EVENT_BUS_MESSAGES: EventBusMessage[] = [
  {
    topic: 'chora.engagement.xp',
    eventType: 'XPAwarded',
    timestamp: new Date(Date.now() - 5000).toISOString(),
    tenantId: 'tenant-001',
    aggregateId: 'gcid-abc123',
    payload: { xpAmount: 50, source: 'atom_completed', atomId: 'atom-789' },
  },
  {
    topic: 'chora.atomic.lifecycle',
    eventType: 'AtomPublished',
    timestamp: new Date(Date.now() - 12000).toISOString(),
    tenantId: 'tenant-001',
    aggregateId: 'atom-456',
    payload: { revisionId: 'rev-003', publishedBy: 'gcid-admin1' },
  },
  {
    topic: 'chora.engagement.streak',
    eventType: 'StreakExtended',
    timestamp: new Date(Date.now() - 25000).toISOString(),
    tenantId: 'tenant-002',
    aggregateId: 'gcid-def456',
    payload: { newStreak: 8, previousStreak: 7 },
  },
  {
    topic: 'chora.iam.auth',
    eventType: 'LoginSucceeded',
    timestamp: new Date(Date.now() - 45000).toISOString(),
    tenantId: 'tenant-001',
    aggregateId: 'gcid-abc123',
    payload: { method: 'webauthn', ipHash: 'sha256:a1b2c3' },
  },
  {
    topic: 'chora.tenancy.entitlement',
    eventType: 'AddOnEnabled',
    timestamp: new Date(Date.now() - 80000).toISOString(),
    tenantId: 'tenant-003',
    aggregateId: 'tenant-003',
    payload: { addOnCode: 'familiar', enabledBy: 'gcid-owner1' },
  },
];
