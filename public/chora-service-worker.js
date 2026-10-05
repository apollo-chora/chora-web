/**
 * Chora service worker = Angular's ngsw, with cross-origin requests handed
 * back to the browser.
 *
 * WHY THIS WRAPPER EXISTS
 *
 * `ngsw-worker.js` calls `event.respondWith()` for EVERY request it sees. Read
 * its `onFetch`: the only requests it declines are `ngsw-bypass`, its own
 * `/ngsw/state` path, SAFE_MODE, passive mixed content, and an invalid
 * `only-if-cached`. Everything else, same-origin or not, is answered by the
 * worker. A request it has no manifest entry for falls through to `safeFetch`,
 * which re-issues it with `scope.fetch(req)` and, on ANY throw, substitutes a
 * synthetic `504 Gateway Timeout`.
 *
 * For a cross-origin `<script src>` that substitution is fatal and silent: the
 * browser sees a 504 for the script, fires `onerror`, and reports no CSP
 * violation, because CSP never rejected anything.
 *
 * MEASURED on chora.site 2026-09-06, same origin, same CSP, same URLs, with
 * service-worker control as the only variable:
 *
 *   SW controlling | SW state | apis.google.com/js/api.js
 *   ---------------|----------|--------------------------
 *   no             | n/a      | LOADS
 *   yes            | DEGRADED | fails
 *   yes            | NORMAL   | fails
 *
 * The third row is the important one: a HEALTHY worker fails identically, so
 * this was never repairable by fixing the manifest. Any cross-origin auth
 * script dies the same way under the worker — the browser sees a 504, fires
 * `onerror`, and the sign-in never reaches the BFF.
 *
 * WHY BYPASSING COSTS NOTHING
 *
 * Every pattern in `ngsw-config.json` is same-origin: the asset groups are
 * `/favicon.ico`, `/index.html`, `/manifest.webmanifest`, `/*.css`, `/*.js`,
 * `/assets/**` and same-origin media, and the one data group is
 * `/api/v1/atoms/**` + `/api/v1/topics/**`. The worker therefore has no
 * cross-origin entry to serve and nothing to cache there, so declining those
 * requests removes a failure mode without giving up any offline capability.
 * If a cross-origin asset group is ever added, this bypass has to be narrowed
 * to match, or it will silently stop that group from working.
 *
 * HOW IT WORKS
 *
 * Listener order is load-bearing. This file registers its `fetch` listener
 * BEFORE `importScripts` pulls in ngsw and registers its own, so ours runs
 * first. For a cross-origin request we call `stopImmediatePropagation()`,
 * which prevents ngsw's listener from ever seeing the event, and we return
 * WITHOUT calling `respondWith`. An unanswered fetch event is the browser's
 * cue to perform the request itself, exactly as it would with no service
 * worker installed. Same-origin requests are left completely untouched, so
 * ngsw keeps precaching the shell, serving it offline and handling updates.
 */

self.addEventListener('fetch', (event) => {
  let isCrossOrigin = false;
  try {
    isCrossOrigin = new URL(event.request.url).origin !== self.location.origin;
  } catch {
    // An unparseable URL is not something to hand to ngsw either, but it is
    // also not something to claim: leave it to the browser.
    isCrossOrigin = true;
  }

  if (isCrossOrigin) {
    // Not `respondWith(fetch(...))`: re-issuing the request from inside the
    // worker is what breaks it. Declining the event entirely is what lets the
    // browser fetch it natively, with its own CSP and CORS handling intact.
    event.stopImmediatePropagation();
  }
});

importScripts('./ngsw-worker.js');
