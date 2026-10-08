/**
 * Tenant lifecycle models — setup wizard, go-live readiness, and offboarding.
 *
 * Source of truth: chora-contracts/openapi/tenancy-admin.yaml
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type GoLiveTestStatus = 'pending' | 'running' | 'passed' | 'failed';

export type OffboardingReason =
  | 'cost'
  | 'switching_platform'
  | 'feature_gap'
  | 'end_of_project'
  | 'other';

export type DataExportFormat = 'json' | 'csv' | 'none';

// ---------------------------------------------------------------------------
// Setup Wizard
// ---------------------------------------------------------------------------

// CHO-1655 Phase A — BrandingConfig now matches the chora-tenancy wire
// shape: drops `secondary_color` (not in backend BrandingConfig); renames
// `primary_color` → `primary_color_hex`. The wizard component's
// `brandingPayload` computed surfaces this shape directly to
// TenantBrandingService (see tenant-branding.model.ts for the canonical
// wire types). The Phase C apply orchestrator still references this for
// the legacy /tenants/setup path until it gets reworked.
export interface BrandingConfig {
  logo_url: string | null;
  primary_color_hex: string;
}

export interface IdentityProviderConfig {
  provider_type: 'oidc' | 'singpass';
  client_id: string;
  client_secret: string;
  discovery_url: string;
  singpass_enabled: boolean;
}

export interface SetupWizardState {
  current_step: number;
  branding: BrandingConfig;
  add_ons: string[];
  identity: IdentityProviderConfig;
}

// ---------------------------------------------------------------------------
// Go-Live Readiness
// ---------------------------------------------------------------------------

export interface GoLiveTest {
  id: string;
  name: string;
  description: string;
  status: GoLiveTestStatus;
  error_detail: string | null;
  last_run_at: string | null;
}

export type GoLiveChecklistState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: GoLiveTest[] }
  | { status: 'error'; error: string };

// ---------------------------------------------------------------------------
// Offboarding
// ---------------------------------------------------------------------------

export interface OffboardingRequest {
  reason: OffboardingReason;
  reason_detail: string | null;
  export_format: DataExportFormat;
}

export interface OffboardingStatus {
  id: string;
  reason: OffboardingReason;
  reason_detail: string | null;
  export_format: DataExportFormat;
  export_progress: number;
  export_download_url: string | null;
  grace_period_ends_at: string;
  status: 'pending' | 'exporting' | 'grace_period' | 'completed' | 'cancelled';
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const OFFBOARDING_REASON_LABELS: Record<OffboardingReason, string> = {
  cost: 'admin.tenant.offboard_reason_cost',
  switching_platform: 'admin.tenant.offboard_reason_switching',
  feature_gap: 'admin.tenant.offboard_reason_feature_gap',
  end_of_project: 'admin.tenant.offboard_reason_end_of_project',
  other: 'admin.tenant.offboard_reason_other',
};

export const ALL_OFFBOARDING_REASONS: OffboardingReason[] = [
  'cost',
  'switching_platform',
  'feature_gap',
  'end_of_project',
  'other',
];

export const GRACE_PERIOD_DAYS = 90;
