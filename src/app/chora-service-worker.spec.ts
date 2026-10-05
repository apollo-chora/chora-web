import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Behavioural guard for `public/chora-service-worker.js`.
 *
 * The wrapper keeps cross-origin subresource loads working on this origin.
 * `ngsw-worker` calls `respondWith()` on EVERY request and turns any throw
 * inside its `safeFetch` into a synthetic 504, which silently killed
 * cross-origin script loads under the worker. The wrapper declines
 * cross-origin fetch events so the browser performs them natively
 * (measured 2026-09-06: a HEALTHY worker failed identically, so this was
 * never a manifest problem).
 *
 * The failure mode this pins is SILENT and very easy to reintroduce, because
 * the "obvious simplification" of the wrapper is
 * `event.respondWith(fetch(event.request))`, which reintroduces the exact
 * re-issue-inside-the-worker behaviour that breaks it. Nothing else in the
 * suite would notice.
 *
 * The file lives in `public/`, outside the TypeScript build, so it is read off
 * disk and executed here. That means this spec exercises the ARTEFACT that is
 * actually deployed rather than a copy of its logic.
 *
 * ⚠ Not asserted here: that `app.config.ts` registers this filename rather than
 * `ngsw-worker.js`. `provideServiceWorker` stores the script name on a private
 * `SCRIPT` token that `@angular/service-worker` does not export, so there is no
 * public seam to inject. That pairing is covered by the deploy checks in
 * `.handoffs/HANDOFF-PROD-FE-REVERT-2026-09-07.md` instead.
 */

interface LoadedWorker {
  readonly fetchListeners: readonly ((event: unknown) => void)[];
  readonly imported: readonly string[];
  /** How many fetch listeners were registered at the moment importScripts ran. */
  readonly listenersAtImportTime: number;
}

function loadWorker(source?: string): LoadedWorker {
  const src =
    source ??
    readFileSync(
      resolve(__dirname, '../../public/chora-service-worker.js'),
      'utf8',
    );

  const fetchListeners: ((event: unknown) => void)[] = [];
  const imported: string[] = [];
  let listenersAtImportTime = -1;

  const selfStub = {
    location: { origin: 'https://chora.site' },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (type === 'fetch') fetchListeners.push(fn);
    },
  };
  const importScriptsStub = (path: string) => {
    imported.push(path);
    listenersAtImportTime = fetchListeners.length;
  };

  new Function('self', 'importScripts', src)(selfStub, importScriptsStub);

  return { fetchListeners, imported, listenersAtImportTime };
}

function fireFetch(worker: LoadedWorker, url: string) {
  const event = {
    request: { url },
    stopImmediatePropagation: vi.fn(),
    respondWith: vi.fn(),
  };
  for (const fn of worker.fetchListeners) fn(event);
  return event;
}

describe('chora-service-worker.js', () => {
  it('declines a cross-origin request without answering it', () => {
    const worker = loadWorker();
    const event = fireFetch(worker, 'https://apis.google.com/js/api.js');

    // Declining is what hands the request back to the browser.
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    // Answering it is the bug: re-issuing from inside the worker is what
    // produced the synthetic 504 that killed sign-in.
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('leaves a same-origin request entirely to ngsw', () => {
    const worker = loadWorker();
    const event = fireFetch(worker, 'https://chora.site/main-ABCD1234.js');

    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('declines an unparseable request URL rather than claiming it', () => {
    const worker = loadWorker();
    const event = fireFetch(worker, 'not a url');

    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('loads ngsw so the shell is still precached and served offline', () => {
    const worker = loadWorker();
    expect(worker.imported).toEqual(['./ngsw-worker.js']);
  });

  it('registers its fetch listener BEFORE importing ngsw', () => {
    const worker = loadWorker();
    // Listener order is load-bearing: ours must run first for
    // stopImmediatePropagation to keep the event away from ngsw's listener.
    expect(worker.listenersAtImportTime).toBe(1);
  });

  it('fails when the wrapper is reduced to re-issuing the request', () => {
    // Negative control. Without this, every assertion above would still pass if
    // the wrapper were rewritten into the shape that breaks SSO, because a
    // passing test proves nothing until it is shown it can fail.
    const naive = `
      self.addEventListener('fetch', (event) => {
        if (new URL(event.request.url).origin !== self.location.origin) {
          event.respondWith(fetch(event.request));
        }
      });
      importScripts('./ngsw-worker.js');
    `;
    const worker = loadWorker(naive);
    const event = fireFetch(worker, 'https://apis.google.com/js/api.js');

    expect(event.respondWith).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
