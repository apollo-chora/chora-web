// NOTE: Production build replaces environment.ts with this file via
// angular.json fileReplacements — keep the inline type shape in sync with
// environment.ts.
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
  // Demo-mode free top-up — see environment.ts. OFF in prod: the demo grant
  // is a non-prod affordance, and the FE flag only draws the button.
  demoManaTopup: boolean;
} = {
  production: true,
  bffBaseUrl: 'https://api.chora.site',
  wsBaseUrl: 'wss://api.chora.site',
  supportEmail: 'support@chora.site',
  realtimeEnabled: true,
  demoManaTopup: false,
  // WS-10 gated-OFF top-level areas — kept non-routable until finished +
  // translated. See the type above; enforced by `featureReadyGuard`.
  // 'developer' / 'investigation' / 'economy' / 'moderation' = O+ admin tools
  // whose feature services still return fabricated MOCK_* data (CHO-2071 fail-
  // loud / no-stub); gated OFF until their real BFF endpoints exist.
  // 'onboarding' (E2 part 3, 2026-09-02): admin onboarding checklists have
  // no backend at all (every /api/v1/onboarding/* path is unclaimed).
  // 'offboard' was gated beside it and is now RETIRED (row E7): the gate
  // recorded an ungranted tenant:delete capability, but the deeper fact is
  // that nothing serves /api/v1/tenants/offboarding* in any of the 20
  // services, so granting the capability would not have made it work.
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
