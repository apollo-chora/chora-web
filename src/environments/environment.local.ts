// NOTE: `ng serve --configuration=local` replaces environment.ts with this
// file via angular.json fileReplacements — so we CANNOT import any types
// from './environment' (that would be a self-import). Keep the inline
// shapes here in sync with environment.ts + environment.prod.ts.
//
// PURPOSE: points chora-web at a LOCALLY-running chora-gateway (the BFF).
// Pairs with the root compose stack: `docker compose up` (or the chora-stack
// compose) starts Postgres + chora-identity + chora-gateway; the gateway
// binds host port 8093. The gateway's CORS allowlist permits
// http://localhost:4200, so browser → BFF works without a proxy.
//
// Auth: username/password only. The login screen posts credentials straight
// to the gateway's POST /api/v1/auth/session/mint. The seed admin account is
// `admin` / `admin` (compose CHORA_SEED_ADMIN_USERNAME / _PASSWORD).
//
// NEVER ship this file in a production build. It's gated behind the
// `local` configuration in angular.json — production / development builds
// cannot reach it.
export const environment: {
  production: boolean;
  bffBaseUrl: string;
  wsBaseUrl: string;
  // Public support mailbox for this org.
  readonly supportEmail: string;
  // Gates the learner-scoped realtime SSE channel (RealtimeChannelService,
  // ADR-183). Off until chora-realtime is part of the local stack.
  realtimeEnabled: boolean;
  // WS-10 (platform UX remediation) — STATIC build-config list of top-level
  // route AREAS gated OFF (orphaned / i18n-empty / half-built) and kept
  // NON-routable until finished + translated. Enforced by `featureReadyGuard`
  // (a CanMatch guard) on each gated route group: a gated area falls through to
  // /not-found and its lazy chunk never loads. Distinct from the entitlement-
  // based `FeatureFlagService` (per-tenant add-ons). Empty here so devs preview.
  readonly gatedAreas: readonly string[];
  // Demo-mode free top-up — see environment.ts. ON locally so the demo grant
  // is exercisable against the local gateway; the BE still gates it.
  demoManaTopup: boolean;
} = {
  production: false,
  // Local BFF — chora-gateway running on :8093 (prod-shaped path: JWT
  // validation + X-Tenant-Id stamping).
  bffBaseUrl: 'http://localhost:8093',
  wsBaseUrl: 'ws://localhost:8093',
  supportEmail: 'support@chora.site',
  realtimeEnabled: false,
  demoManaTopup: true,
  // WS-10 — EMPTY locally so devs can preview in-progress areas (campus /
  // parent / choraverse / growth-edge-review + the O+ admin tools
  // developer / investigation / economy / moderation) that are gated OFF in
  // dev + prod builds.
  gatedAreas: [],
};
