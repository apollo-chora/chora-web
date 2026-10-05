# Chora Web

> Angular 21+ tablet-first frontend for the Chora platform. Standalone,
> GCP-free: username/password auth against the chora-gateway BFF, no
> Firebase / Cloud Run / Secret Manager dependency anywhere in the build.

## UI Mandate

All official UIs target tablet+ screens (≥768px primary, ≥1280px desktop enhanced). No responsive breakpoints below tablet.

## Architecture

Consumes the [chora-gateway](https://github.com/apollo-chora/chora-gateway) BFF endpoints.

### Authentication

Username + password only (frozen gateway contract):

```
POST {bffBaseUrl}/api/v1/auth/session/mint
Request:  { "username": "...", "password": "..." }
200:      { access_token, token_type:"Bearer", expires_in:3600, gcid, memberships[] }
401:      { error: { code: "INVALID_CREDENTIALS", message } }
```

The `access_token` **is** the Chora session JWT, sent as
`Authorization: Bearer <token>` on API calls. The JWT's `tenant_id` and
`roles` claims are authoritative — the frontend never invents or overrides
a tenant. There are **no refresh tokens** in this milestone: the session
lives in memory only, and a 401 clears the local session and returns the
user to `/login`.

WebAuthn passkey login is also available where the browser supports it; it
talks to the gateway's `/api/v1/auth/webauthn/*` routes directly.

**Removed with the Firebase / Identity Platform extraction** (no server-side
equivalent exists in the frozen gateway contract): Google / Microsoft /
Singpass social sign-in (OIDC federation), self-service registration,
email-verification links, password-reset email, TOTP MFA enrolment, and
FCM web push. Tenant switching within a session is disabled for the same
reason — the gateway has no tenant-switch route — and the tenant switcher
tells the user to sign out and sign in again.

### Environments / base URL

Build-time config via `src/environments/*.ts` (angular.json
`fileReplacements`):

| File | Used by | `bffBaseUrl` |
|---|---|---|
| `environment.ts` | `ng serve` / dev build | `https://api.chora.site` |
| `environment.local.ts` | `ng serve --configuration=local` | `http://localhost:8093` |
| `environment.prod.ts` | production build | `https://api.chora.site` |
| `environment.orgb*.ts` | second-org variants | `https://api.iac.chora.site` |

There is no runtime-config injection — the compiled environment file is the
config. The seed admin account in the compose stack is `admin` / `admin`
(`CHORA_SEED_ADMIN_USERNAME` / `CHORA_SEED_ADMIN_PASSWORD`).

## Develop

```bash
npm ci
npm run build      # production bundle → dist/chora-web/browser
npm run lint
npm test           # Vitest unit suite (both projects)
```

Run against a local gateway (compose stack, host port 8093):

```bash
npm run start -- --configuration=local
# open http://localhost:4200 — sign in as admin / admin
```

## Docker

```bash
docker build -t chora-web .
docker run -p 8080:80 chora-web
```

The image is multi-stage (`node:24-alpine` build → `nginx:alpine` serve).
nginx serves the SPA and reverse-proxies `/api` to the gateway
(`gateway:8080` inside the compose network — edit `nginx.conf` if your
stack names it differently). No runtime env vars are required.

## CI/CD

- `.github/workflows/ci.yml` — lint → production build → Vitest unit suite on every push/PR.
- `.github/workflows/docker-publish.yml` — build + publish the image to Docker Hub on push to `main`.

## Related

- [chora-gateway](https://github.com/apollo-chora/chora-gateway) — BFF backend
- [chora-identity](https://github.com/apollo-chora/chora-identity) — credential verification upstream
- [chora-contracts](https://github.com/apollo-chora/chora-contracts) — API specs (OpenAPI)
