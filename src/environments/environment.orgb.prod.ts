// NOTE: Production-orgb build replaces environment.ts with this file via
// angular.json fileReplacements — keep the inline type shape in sync with
// environment.orgb.ts.
export const environment: {
  production: boolean;
  bffBaseUrl: string;
  wsBaseUrl: string;
  // Public support mailbox for this org.
  readonly supportEmail: string;
  // Gates the learner-scoped realtime SSE channel (RealtimeChannelService,
  // ADR-183).
  realtimeEnabled: boolean;
  // WS-10 (platform UX remediation) — STATIC build-config list of top-level
  // route AREAS gated OFF (orphaned / i18n-empty / half-built) and kept
  // NON-routable until finished + translated. Enforced by `featureReadyGuard`
  // (a CanMatch guard) on each gated route group: a gated area falls through to
  // /not-found and its lazy chunk never loads. Distinct from the entitlement-
  // based `FeatureFlagService` (per-tenant add-ons).
  readonly gatedAreas: readonly string[];
  // Demo-mode free top-up — see environment.ts. OFF in prod.
  demoManaTopup: boolean;
} = {
  production: true,
  bffBaseUrl: 'https://api.iac.chora.site',
  wsBaseUrl: 'wss://api.iac.chora.site',
  supportEmail: 'support@iac.chora.site',
  realtimeEnabled: true,
  demoManaTopup: false,
  // WS-10 gated-OFF top-level areas — kept non-routable until finished +
  // translated. See the type above; enforced by `featureReadyGuard`.
  // 'developer' / 'investigation' / 'economy' / 'moderation' = O+ admin tools
  // whose feature services still return fabricated MOCK_* data (CHO-2071 fail-
  // loud / no-stub); gated OFF until their real BFF endpoints exist.
  // 'onboarding' / 'offboard' (E2 part 3, 2026-09-02): admin onboarding
  // checklists have no backend at all (every /api/v1/onboarding/* path is
  // unclaimed), and the offboarding wizard fails through the ungranted
  // tenant:delete capability.
  gatedAreas: [
    'parent',
    'choraverse',
    'developer',
    'investigation',
    'economy',
    'moderation',
    'onboarding',
  ],
};
