// Demo build environment — identical to environment.prod.ts except that the
// demo free top-up affordance is DRAWN (demoManaTopup: true).
//
// This exists so the demo artifact is reproducible from the repository instead
// of hand-editing environment.prod.ts before a build. The normal `production`
// configuration keeps demoManaTopup: false, so an ordinary production build
// never renders the button.
//
// SECURITY: this flag is PRESENTATION ONLY. The real control is server-side —
// chora-identity refuses the grant with 404 unless the demo is enabled AND the
// authenticated GCID is on CHORA_DEMO_MANA_ALLOWED_GCIDS, and 403 otherwise.
// Keep the inline type shape in sync with environment.ts / environment.prod.ts.
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
  // route AREAS gated OFF. See environment.prod.ts.
  readonly gatedAreas: readonly string[];
  // Demo-mode free top-up — see environment.ts. ON for the demo build only.
  demoManaTopup: boolean;
} = {
  production: true,
  // SAME-ORIGIN API base. chora-web's nginx reverse-proxies /api/* to the
  // gateway precisely so "the browser only ever talks to one origin (no CORS,
  // no mixed content)" (nginx.conf:4-5). An absolute base here defeats that:
  // on this deployment `api.chora.site` resolves to a different, 503-ing host,
  // so login failed with a status-0 network error. An empty base makes every
  // bff-client call relative, which is what the proxy is built for.
  bffBaseUrl: '',
  // Empty → the realtime channel falls back to the location-derived ws origin
  // (see live-classroom-play.service.spec.ts). Same reasoning as above.
  wsBaseUrl: '',
  supportEmail: 'support@chora.site',
  realtimeEnabled: true,
  demoManaTopup: true,
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
