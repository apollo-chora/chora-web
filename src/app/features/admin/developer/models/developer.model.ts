/**
 * Developer console models for the super_admin developer experience module.
 *
 * Entities: APIRequestLog, FeatureFlagOverride, EventBusMessage,
 *           DeveloperTab, EventBusConnectionState, HttpMethod (~6)
 */

// ---------------------------------------------------------------------------
// API Inspector
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface APIRequestLog {
  id: string;
  method: HttpMethod;
  url: string;
  status: number;
  durationMs: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  timestamp: string;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// Feature Flag Overrides
// ---------------------------------------------------------------------------

export interface FeatureFlagOverride {
  addOnCode: string;
  displayName: string;
  enabled: boolean;
  overrideActive: boolean;
  overrideValue: boolean;
}

// ---------------------------------------------------------------------------
// Event Bus Monitor
// ---------------------------------------------------------------------------

export type EventBusConnectionState = 'connected' | 'disconnected' | 'connecting';

export interface EventBusMessage {
  topic: string;
  eventType: string;
  timestamp: string;
  tenantId: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// RLS Context Viewer
// ---------------------------------------------------------------------------

export interface RlsContext {
  tenant_id: string;
  tenant_name: string;
  gcid: string;
  role: string;
  capabilities: string[];
  session_start: string;
  rls_policies_applied: RlsPolicy[];
}

export interface RlsPolicy {
  table_name: string;
  policy_name: string;
  policy_type: RlsPolicyType;
  expression: string;
  enabled: boolean;
}

export type RlsPolicyType = 'permissive' | 'restrictive';

export interface RlsTestResult {
  table_name: string;
  query: string;
  row_count: number;
  isolated: boolean;
  execution_time_ms: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Developer Console
// ---------------------------------------------------------------------------

export type DeveloperTab = 'api-inspector' | 'feature-flags' | 'event-bus' | 'rls-context';

export const DEVELOPER_TABS: { value: DeveloperTab; label: string }[] = [
  { value: 'api-inspector', label: 'admin.developer.tab_api_inspector' },
  { value: 'feature-flags', label: 'admin.developer.tab_feature_flags' },
  { value: 'event-bus', label: 'admin.developer.tab_event_bus' },
  { value: 'rls-context', label: 'admin.developer.tab_rls_context' },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATUS_CLASS_MAP: Record<string, string> = {
  '2': 'developer__status--success',
  '3': 'developer__status--redirect',
  '4': 'developer__status--client-error',
  '5': 'developer__status--server-error',
};

export const MAX_PAYLOAD_PREVIEW_LENGTH = 200;

export const ALL_RLS_POLICY_TYPES: RlsPolicyType[] = ['permissive', 'restrictive'];

export const RLS_POLICY_TYPE_LABELS: Record<RlsPolicyType, string> = {
  permissive: 'admin.developer.rls_policy_permissive',
  restrictive: 'admin.developer.rls_policy_restrictive',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type RlsContextState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; context: RlsContext }
  | { status: 'error'; error: { code: string; message: string } };

export type RlsTestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; results: RlsTestResult[] }
  | { status: 'error'; error: { code: string; message: string } };
