// Remote single-origin deployment. The SPA is served by the same nginx that
// reverse-proxies /api/ and /ws/ to the chora-gateway BFF, so bffBaseUrl and
// wsBaseUrl are RELATIVE (empty): the browser calls the same origin it loaded
// the app from, and nginx routes /api/* and /ws/* to the gateway. This works
// regardless of the host/IP the stack is reached on — no hardcoded origin.
export const environment: {
  production: boolean;
  bffBaseUrl: string;
  wsBaseUrl: string;
  readonly supportEmail: string;
  realtimeEnabled: boolean;
  readonly gatedAreas: readonly string[];
  // Demo-mode free top-up — see environment.ts. OFF: this is a prod build.
  demoManaTopup: boolean;
} = {
  production: true,
  // Relative — same origin as the served SPA; nginx proxies /api/ + /ws/.
  bffBaseUrl: '',
  wsBaseUrl: '',
  supportEmail: 'support@chora.site',
  realtimeEnabled: true,
  demoManaTopup: false,
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
