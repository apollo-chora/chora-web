# chora-web

The Chora single-page application: Angular 21 with SSR-free client routing, a service worker, and
five product surfaces (`a`, `c`, `h`, `o`, `r`) behind one shell. Served by nginx, which also
reverse-proxies the API so the browser sees a single origin.

This is the only service in the stack with an intentionally published host port — it is where a
human starts.

Every command, port, path and variable below was checked against the code in this repository and
against a running `chora-stack`.

## What it is

A static Angular bundle plus an nginx config. There is no server-side rendering and no Node
process at runtime: the Dockerfile builds with Node 24 and then copies `dist/chora-web/browser`
into `nginx:alpine`, which serves it.

Three things about the nginx layer are load-bearing and easy to miss:

| Concern | How nginx handles it |
| --- | --- |
| Single origin | `/api/` proxies to `gateway:8080` inside the compose network, so the browser never sees CORS |
| Deep links | `location /` falls back to `index.html`, so a refresh on `/a/learning` works |
| Realtime | `/api/v1/realtime/stream` is an **exact-match** block that bypasses the gateway and proxies straight to `user-event-stream:8080` with a 3600s timeout |

That third one is a deliberate exception. The gateway does not register the stream path, so
routing it through `/api/` returns `404 GATEWAY_ROUTE_NOT_FOUND` on every open. The `nginx.conf`
comment says so explicitly, and the exact-match block wins over the `/api/` prefix.

Be aware of who actually uses that block: the SPA's own realtime client builds an **absolute**
URL from `bffBaseUrl`, so it goes to the gateway on `8093` and never touches this nginx route. The
exact-match block serves callers that reach the web origin — see [Events](#events).

### The build configuration decides which backend the browser talks to

This is the single most important thing to get right, and it is baked in at build time — not
configurable at runtime.

The image takes a `BUILD_CONFIGURATION` build arg that selects an Angular configuration, which
swaps an environment file:

| `BUILD_CONFIGURATION` | Environment file | `bffBaseUrl` |
| --- | --- | --- |
| `production` (image default) | `environment.prod.ts` | `https://api.chora.site` |
| `local` (**what the stack uses**) | `environment.local.ts` | `http://localhost:8093` |
| `demo` | `environment.demo.ts` | demo host |
| `remote` | `environment.remote.ts` | remote host |
| `production-orgb` | `environment.orgb.prod.ts` | org-B host |
| `development` | (no replacement) | `https://api.chora.site` |

`chora-stack/compose.yml` passes `BUILD_CONFIGURATION: local`, which is why a stack deployment
points at the **host-published gateway on `8093`** rather than `api.chora.site`.

## Prerequisites

| Route | What you need |
| --- | --- |
| In the stack | A working `chora-stack` deployment with `gateway` started. `depends_on` uses `service_started`, not `service_healthy`, so the gateway may still be booting when web comes up. |
| Standalone (dev server) | Node **24** (the Dockerfile pins `node:24-alpine`), npm **11.6.0** (`packageManager` in `package.json`), and nothing else. |

There is **no database, no migration and no credential**. Everything the app needs at build time
resolves from npm; the Dockerfile notes the app has no monorepo dependencies.

## Credentials

**None, for the web tier itself.**

| Credential | Needed | Notes |
| --- | --- | --- |
| Gateway API key / JWT | no, at build time | the browser obtains a session from the gateway at runtime |
| Any provider key | no | no model calls from the SPA |
| Database password | no | no database |

The only secret-shaped concern is that the SPA must reach an authenticated gateway. That is a
runtime, per-user login, not something you bake into this image.

## Run it in the stack

The Compose service is `web`:

```sh
docker compose up -d web
```

It builds from this repository with `BUILD_CONFIGURATION: local`, depends on `gateway`
(`service_started`), and publishes exactly one port:

```yaml
ports:
  - "${CHORA_WEB_PORT:-4200}:80"
```

So `http://localhost:4200` is the app, and `CHORA_WEB_PORT` moves it. Nothing else about the
service is configurable — there is no runtime environment block, because the configuration was
compiled in.

**The gateway must also be reachable at `localhost:8093`.** Under the local build, `bffBaseUrl`
is `http://localhost:8093`, and while most of the app uses relative `/api/...` paths that go
through nginx, six services use the absolute URL and hit 8093 directly from the browser:

```text
src/app/core/interceptors/auth.interceptor.ts
src/app/core/realtime/realtime-channel.service.ts
src/app/core/services/bff-client.service.ts
src/app/core/services/governance.service.ts
src/app/features/surfaces/aplus/familiar-chat/familiar-chat.service.ts
src/app/shared/components/transaction-history/transaction-realtime.service.ts
```

The stack publishes the gateway on `8093` by default (`CHORA_GATEWAY_PORT`). If you remap it, the
local build breaks — rebuild with a different environment file or leave the port alone.

Logs are nginx access logs:

```sh
docker compose logs -f web
```

## Run it standalone

For development, with live reload:

```sh
npm ci
npm start                # ng serve — uses environment.ts, points at https://api.chora.site
```

`npm start` deliberately targets the **deployed** gateway, not a local one, so a dev build
exercises the production JWT and tenant-stamping path with no backend running locally.

To work against your own stack instead:

```sh
npm start -- --configuration=local     # swaps in environment.local.ts → http://localhost:8093
```

`ng serve` picks up file replacements from `angular.json`, so this is the same swap the Docker
build performs.

Build a static bundle by hand:

```sh
npm ci
npm run build -- --configuration=local
# output: dist/chora-web/browser/
```

Serve that directory with any static server that has an `index.html` fallback, and proxy `/api/`
to the gateway — nginx without the fallback will 404 every deep link.

## Configuration

There is **no runtime configuration**. Every value below is compiled into the bundle.

| Build arg / variable | Default | Effect |
| --- | --- | --- |
| `BUILD_CONFIGURATION` | `production` in the Dockerfile, `local` from compose | selects the environment file |
| `CHORA_WEB_PORT` | `4200` | host port published by compose |
| `NODE_VERSION` | `24-alpine` | builder image |
| `NGINX_VERSION` | `alpine` | runtime image |
| `GIT_SHA`, `BUILD_TIME` | `unknown` | OCI image labels only |

Settings inside the environment files that change behaviour:

| Setting | Stack (`local`) | Production | Meaning |
| --- | --- | --- | --- |
| `bffBaseUrl` | `http://localhost:8093` | `https://api.chora.site` | absolute API base for the six services that use it |
| `wsBaseUrl` | `ws://localhost:8093` | `wss://api.chora.site` | WebSocket base for `/ws/` |
| `realtimeEnabled` | **`false`** | `true` | gates the learner SSE channel |
| `demoManaTopup` | `true` | `false` | draws the "free top-up (demo)" button; the backend still decides |
| `gatedAreas` | **`[]` — nothing gated** | 7 areas | route areas kept non-routable until finished |

Two of those deserve emphasis:

- **`realtimeEnabled: false` in the local build.** The `chora-user-event-stream` service is
  running, but the SPA does not open the stream because this flag is off in
  `environment.local.ts`. The comment explains the original reason — it was gated until the ticket
  endpoint shipped — and says to flip it on when the realtime tier is live. So a stack deployment
  will not show live updates even when the stream is healthy.
- **`demoManaTopup: true` only draws a button.** The comment is emphatic: presentation logic
  only, and the backend is the sole authority, answering `404` when demo mode is off.

**`gatedAreas` is empty in the local build**, which is a common source of confusion when reading
the environment files. The seven gated areas — `parent`, `choraverse`, `developer`,
`investigation`, `economy`, `moderation`, `onboarding` — live in `environment.prod.ts` and in the
default `environment.ts` (what `ng serve` uses), **not** in `environment.local.ts`. So the stack
gates nothing and every area is routable, while a production build keeps those trees unreachable.
Where the gate is active it is a `CanMatch` guard that falls through to `/not-found` without
loading the lazy chunk. Several are gated because their feature services still returned mock data
or no backend exists for them at all.

## Verify it works

### The app is served

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4200/
```

`200`, and the document is the Angular shell:

```sh
curl -s http://localhost:4200/ | grep -o '<title>[^<]*</title>'
# <title>Chora</title>
```

### A deep link survives a refresh

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4200/a/learning
```

`200`, not `404`. That is the `try_files … /index.html` fallback proving it works — this is the
check that catches a misconfigured nginx, and it is invisible from the home page alone.

### The API proxy reaches the gateway

```sh
curl -s http://localhost:8093/readyz | head -c 120
```

```json
{"route_count":51,"routes":[{"surface":"api","path_pattern":"/api/auth/session",…
```

That is the gateway answering directly. Through nginx, `/api/` is the same upstream, so a `404`
from `http://localhost:4200/api/v1/does-not-exist` (rather than a connection error or `502`) is
the expected shape for an unclaimed path — it proves the proxy forwarded.

### The stream path is split off correctly

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4200/api/v1/realtime/stream
```

A **`503`** is the correct answer here while the realtime backplane is degraded, and it proves the
exact-match block is in effect: routed through `/api/` instead, the gateway would answer `404
GATEWAY_ROUTE_NOT_FOUND`. A `401` or a hang means the block is proxying to a live stream.

This checks nginx's routing, not the SPA's: the app's own `EventSource` targets
`http://localhost:8093/api/v1/realtime/stream` directly, so a healthy result here does not mean
live updates will appear in the browser.

### Whether the service worker is present

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4200/ngsw.json
```

In the **stack** build this returns `404`, because `BUILD_CONFIGURATION=local` sets
`production: false` in `environment.local.ts` and `app.config.ts` wires
`provideServiceWorker({enabled: environment.production})`. No service worker is generated, so
there is no `ngsw.json` to cache. That is correct behaviour for a local stack, not a fault.

In a `production` build the file exists and nginx serves it with `Cache-Control: no-cache`. If you
build production and see a `404` here, the build did not emit the worker.

### Browser check

Open `http://localhost:4200`, log in through the gateway, and confirm the shell renders. Watch the
network tab on first load: API calls should go to `localhost:4200/api/...` (through nginx) except
the six services listed above, which call `localhost:8093/api/...` directly.

## Troubleshooting

- **The page loads but every API call fails** — the gateway is not reachable at the URL the build
  baked in. Under `BUILD_CONFIGURATION=local` that is `http://localhost:8093`, from the
  **browser**, so the port must be published on the host. A `502` from nginx means the opposite
  problem: `gateway` is unreachable *inside* the compose network.
- **Deep links `404` on refresh** — the `index.html` fallback is missing. The shipped `nginx.conf`
  has it; a hand-rolled static server usually does not.
- **The SPA calls `api.chora.site` on a local stack** — the image was built without
  `BUILD_CONFIGURATION=local`, so it baked `environment.prod.ts`. Rebuild; there is no runtime
  switch.
- **No live updates, but the stream endpoint works** — `realtimeEnabled` is `false` in
  `environment.local.ts`. The SPA never opens the EventSource. Flip it and rebuild if you want the
  channel on a local stack.
- **Stream connections `404` with `GATEWAY_ROUTE_NOT_FOUND`** — the request went through `/api/`
  instead of the exact-match block. Check that
  `location = /api/v1/realtime/stream` still precedes `location /api/` and that the upstream name
  matches your compose service.
- **Uploads fail with `413`** — nginx's default body limit is 1 MB and the SPA caps authoring
  uploads at 32 MiB. The shipped config sets `client_max_body_size 40m` on `/api/`; if you change
  that block, keep the limit above the SPA's cap.
- **Users stuck on an old version after a deploy** — in a production build `index.html`,
  `ngsw.json` and the service-worker files must all be `no-cache`, or a cached manifest keeps
  serving the previous bundle. The shipped `nginx.conf` sets that; a hand-written config often
  does not.
- **`/ngsw.json` returns `404`** — expected on the stack build, where `production: false` disables
  the service worker entirely. Not a fault unless you built `production`.
- **`npm start` cannot reach a backend** — expected: the default dev configuration points at the
  deployed `https://api.chora.site`. Use `--configuration=local` for your own stack.
- **A route area silently redirects to `/not-found`** — check whether the build's `gatedAreas`
  contains it. On the stack build the list is **empty**, so a redirect there is *not* the gate and
  must be investigated on its own; on a `production` or default-dev build the list holds seven
  areas. The gate is static and build-time, distinct from a tenant entitlement problem.
- **An admin tool shows suspiciously tidy data** — several gated areas were gated precisely
  because their feature services returned `MOCK_*` data. On a stack build nothing is gated, so
  those tools are reachable and will show mocks unless the real BFF endpoint exists.

## API surface

The app exposes **no API of its own** — it is static assets plus a proxy. What it does have is a
route table, and a proxy surface.

Top-level Angular routes:

| Path | Surface |
| --- | --- |
| `/` | **redirect only** — to `/login` when unauthenticated, otherwise to `LandingService.landingRoute()` (`/a/home` for a learner, the surface they hold for an admin/auditor, `/home` for a session holding none) |
| `/login` | sign-in against the gateway |
| `/select-tenant`, `/welcome/no-tenant`, `/welcome/no-organisation`, `/suspended` | tenant selection and gating |
| `/p/:slug`, `/atoms/:id`, `/topics/:id`, `/paths/:id` | public content |
| `/verify/:certId` | public certificate verification |
| `/pricing` | plans |
| `/invite/:code`, `/ref/:code`, `/play/:code` | invite, referral and play entry points |
| `/a/...`, `/c/...`, `/h/...`, `/o/...`, `/r/...` | the five authenticated surfaces (aplus, cplus, hplus, oplus, rplus) |

Proxied paths handled by nginx:

| Path | Upstream | Notes |
| --- | --- | --- |
| `/api/` | `gateway:8080` | 40 MB body cap, WebSocket upgrade headers, 60s read timeout |
| `/api/v1/realtime/stream` | `user-event-stream:8080` | exact match, buffering off, 3600s read timeout — **not used by the SPA's own SSE client**, which calls `bffBaseUrl` directly |
| `/ws/` | `gateway:8080` | WebSocket, 3600s read timeout |
| `/assets/` | static | immutable, 1-year cache |
| `/index.html`, `/ngsw.json`, `/ngsw-worker.js`, `/chora-service-worker.js` | static | `no-cache` |
| everything else | static | `try_files` → `index.html` |

Upstreams are resolved at **request** time through Docker's embedded DNS (`resolver 127.0.0.11`)
rather than at config load. That is why nginx starts happily when the gateway is not up yet — a
load-time lookup would make the container exit instead.

## Architecture

```text
Dockerfile          node:24-alpine build → nginx:alpine runtime
nginx.conf          SPA serve + /api, /ws and the realtime split
angular.json        6 build configurations, environment file replacements
src/environments/   6 environment files; configuration is baked in here
src/app/core/       auth, interceptors, bff client, realtime channel, services
src/app/features/   the five surfaces + public pages
src/app/layouts/    shells
src/app/shared/     components
src/app/app.routes.ts  the route table and the gated-area guards
```

The app is a standard standalone Angular 21 application: `app.config.ts` provides the router,
`HttpClient` with an auth interceptor and an error interceptor, i18n via `@ngx-translate`, and the
service worker registered when `environment.production` is true — note that `local` is not
`production`, so a stack build has the service worker's registration flag **off** but the nginx
`no-cache` rules for `ngsw.json` still apply if you turn it on.

Two HTTP conventions coexist, and the split matters operationally:

| Pattern | Used by | Base URL |
| --- | --- | --- |
| Relative `/api/v1/...` | ~189 files — the dominant pattern | same origin, through nginx |
| `BffClientService` / direct `environment.bffBaseUrl` | 6 files | absolute, baked at build |

That is why a local stack needs *both* nginx and a host-published `8093`. Fixing one without the
other leaves half the app broken in a way that looks random from the browser.

## Events

The SPA is a client, so "events" means what it subscribes to, not what it publishes.

| Channel | Transport | Path |
| --- | --- | --- |
| Learner realtime | SSE (`EventSource`) | **absolute** `${bffBaseUrl}/api/v1/realtime/stream?ticket=…` — straight to the gateway, **not** through nginx |
| Realtime channel | WebSocket | `wsBaseUrl` + `/ws/` |
| Nothing outbound | — | the app publishes no events; it calls REST endpoints |

That absolute URL is the subtle part. `RealtimeChannelService` builds
`` `${environment.bffBaseUrl}${STREAM_PATH}?ticket=…` `` and opens an `EventSource` with
credentials, so on a stack build the browser connects to
`http://localhost:8093/api/v1/realtime/stream?ticket=…` — the gateway directly. The nginx
exact-match block that splits the stream off to `user-event-stream:8080` therefore only applies to
callers that actually use the web origin, not to the SPA's own client. Enabling
`realtimeEnabled` locally points the browser at `8093`, and that port must be published.

The SSE channel is gated by `realtimeEnabled`, which is `false` in the local build. The frame
topics it can receive come from `chora-user-event-stream`; see that service's README for the eight
`mana.*`, `familiar.*`, `notification.*` and `payment.state.changed` topics.

## Migrations

**None.** This repository has no database, no `migrations/` directory and no migration one-shot in
the stack — it is a static bundle.

The nearest thing to a migration is the service-worker lifecycle: a deploy changes the hashed
asset names, `ngsw.json` changes, and the browser swaps bundles on the next load because nginx
serves the manifest with `no-cache`. That is why the cache headers in `nginx.conf` are part of the
deployment contract rather than a performance tweak.
