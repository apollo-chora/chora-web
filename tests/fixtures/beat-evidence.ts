/**
 * Beat evidence recorder for `tests/assessment-lifecycle.spec.ts`.
 *
 * WHY THIS EXISTS. The lifecycle spec asserted all seven beats and produced
 * nothing durable. Its five committed frames were captured OUT OF BAND by
 * driving the browser by hand, so the CI log, the screenshots and the report
 * narration could not be reconciled against one another: the run left no
 * JUnit, no per-beat frame and no record of which calls it actually made.
 * Owner ruling 2026-08-24: "Artifacts capturing is a must and the whole point."
 *
 * WHAT A RUN NOW EMITS, all under one predictable directory:
 *   beat-N-<slug>.png    one frame per browser beat, named for the beat
 *   beat-3-publish.json  beats 3 and 7 are API and header assertions with NO
 *   beat-7-otlp.json     UI, so their evidence is the recorded response, not a
 *                        screenshot. Each also prints a BEAT EVIDENCE log line.
 *   http-calls.json      every gateway call the run made, browser and API lane
 *                        alike, with UUIDs normalised to {id}. This is what
 *                        lets the sequence diagram be reconciled against what
 *                        the run DID rather than against what it was believed
 *                        to do.
 *   beats-manifest.json  the seven beats, their artefacts and their verdicts
 *
 * The JUnit XML is NOT written here. It comes from the Playwright junit
 * reporter, whose path the lane sets through PLAYWRIGHT_JUNIT_OUTPUT_NAME
 * exactly as the `integration-journey` step already does.
 *
 * Directory: `E2E_EVIDENCE_DIR`, defaulting to a repo-relative path so a local
 * run works with no setup. The directory is created LAZILY inside the helpers
 * and never at module scope: `playwright.prod.config.ts` has testDir `./tests`,
 * so this module is loaded during collection for the `@integration-journey`
 * and `@deployed-smoke` greps too, and a module-scope mkdir would leave a
 * stray directory behind on every one of those runs.
 */
import { test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_EVIDENCE_DIR = 'playwright-evidence/assessment-lifecycle';

/** Hosts whose traffic is lifecycle evidence. Everything else is noise. */
const GATEWAY_HOST_SUFFIX = 'chora.site';
const IDENTITY_HOSTS = new Set([
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
]);

interface HttpEntry {
  /** Order the event arrived in, so a repeat can be told from a retry. */
  seq: number;
  /** Beat this call belongs to, taken from the running test's title. */
  beat: string;
  /** `browser` if the SPA issued it, `api` if the spec issued it directly. */
  lane: 'browser' | 'api';
  method: string;
  host: string;
  /** Path with UUIDs replaced by {id}, so the log reads as a contract. */
  path: string;
  status: number;
  /**
   * True when the Angular service worker's fetch handler answered the page.
   *
   * WHY THIS FIELD EXISTS, and it is the reason the first cut of this log was
   * wrong. Measured 2026-08-24 against the deployed surface: most gateway
   * calls raised the context `response` event TWICE, back to back, identical
   * status. Read naively the log says the SPA posts each atom twice, and a
   * sequence diagram drawn from it would have carried a defect that is not
   * there. It is not a double post and it is not a retry: chora-web registers
   * ngsw, so one logical call surfaces as two events, the page being answered
   * by the service worker and the service worker's own request to the network.
   * They are DIFFERENT Playwright Request objects, so deduplicating on request
   * identity drops nothing, which is exactly what the first attempt measured.
   * `wire_calls` in the artefact is therefore the events with this flag false:
   * the requests that actually reached the gateway. Nothing is discarded, both
   * views are written, and the run's own assertions corroborate the wire view,
   * because two atom creations would have put two cards in the question picker
   * and failed beat 2's exact-count assertion.
   */
  from_service_worker: boolean;
}

const httpLog: HttpEntry[] = [];

interface BeatRecord {
  beat: number;
  name: string;
  kind: 'browser' | 'api';
  artefacts: string[];
  notes: string[];
}

const beats = new Map<number, BeatRecord>();

export function evidenceDir(): string {
  return resolve(process.env['E2E_EVIDENCE_DIR'] ?? DEFAULT_EVIDENCE_DIR);
}

function ensureDir(): string {
  const dir = evidenceDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

function beatRecord(beat: number, name: string, kind: 'browser' | 'api'): BeatRecord {
  let record = beats.get(beat);
  if (!record) {
    record = { beat, name, kind, artefacts: [], notes: [] };
    beats.set(beat, record);
  }
  return record;
}

/** UUIDs, and the long numeric run tag, are per-run noise in a path. */
function normalisePath(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
    .replace(/\/\d{10,}/g, '/{n}');
}

function isEvidenceHost(host: string): boolean {
  return host === GATEWAY_HOST_SUFFIX || host.endsWith(`.${GATEWAY_HOST_SUFFIX}`) ||
    IDENTITY_HOSTS.has(host);
}

/**
 * Record every gateway call the SPA makes while this beat runs.
 *
 * Attached to the CONTEXT rather than the page, so a call made before the
 * first `page` handle exists is still seen. Static asset fetches from the SPA
 * origin are dropped: only `/api/**` and the Firebase identity endpoints are
 * lifecycle evidence.
 */
export function recordBrowserApiCalls(context: BrowserContext, beat: string): void {
  context.on('response', (response) => {
    let url: URL;
    try {
      url = new URL(response.url());
    } catch {
      return;
    }
    if (!isEvidenceHost(url.host)) return;
    if (url.host.endsWith(GATEWAY_HOST_SUFFIX) && !url.pathname.startsWith('/api/')) return;
    const request = response.request();
    httpLog.push({
      seq: httpLog.length,
      beat,
      lane: 'browser',
      method: request.method(),
      host: url.host,
      path: normalisePath(url.pathname),
      status: response.status(),
      from_service_worker: response.fromServiceWorker(),
    });
  });
}

/** Record a call the spec issued itself, over the API lane. */
export function recordApiCall(
  beat: string,
  method: string,
  url: string,
  status: number,
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  httpLog.push({
    seq: httpLog.length,
    beat,
    lane: 'api',
    method: method.toUpperCase(),
    host: parsed.host,
    path: normalisePath(parsed.pathname),
    status,
    // The spec's own APIRequestContext talks to the gateway directly. There is
    // no page and therefore no service worker in this lane.
    from_service_worker: false,
  });
}

/**
 * Screenshot the beat under a name that says what the frame proves.
 *
 * `fullPage` deliberately: a viewport crop can cut the very element the frame
 * is cited for, and an evidence frame that crops its own claim is worse than
 * no frame. The capture is also attached to the Playwright report, so the HTML
 * report and the JUnit carry the same artefact the GCS upload does.
 */
export async function captureBeat(
  beat: number,
  name: string,
  slug: string,
  page: Page,
): Promise<string> {
  const file = join(ensureDir(), `beat-${slug}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await test.info().attach(`beat-${slug}`, { path: file, contentType: 'image/png' });
  beatRecord(beat, name, 'browser').artefacts.push(file);
  console.log(`BEAT EVIDENCE  ${beat}  ${name}  screenshot  ${file}`);
  return file;
}

/**
 * Write the evidence for a beat that has no UI.
 *
 * Beats 3 PUBLISH and 7 OTLP are an API response and a response header. There
 * is no screen to photograph, so the artefact is the recorded response itself
 * plus a log line, and the manifest says so rather than leaving a silent hole
 * where a frame would be.
 */
export async function recordBeatJson(
  beat: number,
  name: string,
  slug: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const file = join(ensureDir(), `beat-${slug}.json`);
  const body = `${JSON.stringify({ beat, name, captured_at: new Date().toISOString(), ...payload }, null, 2)}\n`;
  writeFileSync(file, body, 'utf8');
  await test.info().attach(`beat-${slug}`, { path: file, contentType: 'application/json' });
  const record = beatRecord(beat, name, 'api');
  record.artefacts.push(file);
  record.notes.push('no UI: this beat is an API response assertion, evidenced as JSON plus log lines');
  console.log(`BEAT EVIDENCE  ${beat}  ${name}  json  ${file}`);
  for (const [key, value] of Object.entries(payload)) {
    console.log(`BEAT EVIDENCE  ${beat}  ${name}  ${key}=${JSON.stringify(value)}`);
  }
  return file;
}

/** Attach a free-text note to a beat, so the manifest carries the reasoning. */
export function noteBeat(beat: number, name: string, note: string): void {
  beatRecord(beat, name, 'browser').notes.push(note);
}

/**
 * Write the run-level artefacts. Called from afterAll, so it runs whether the
 * suite passed or failed: a failed run's evidence is the evidence that matters.
 */
export function writeRunArtefacts(meta: Record<string, unknown>): string[] {
  const dir = ensureDir();
  const manifest = join(dir, 'beats-manifest.json');
  const calls = join(dir, 'http-calls.json');
  writeFileSync(
    manifest,
    `${JSON.stringify(
      {
        spec: 'chora-web/tests/assessment-lifecycle.spec.ts',
        grep: '@assessment-lifecycle',
        finished_at: new Date().toISOString(),
        ...meta,
        beats: [...beats.values()].sort((a, b) => a.beat - b.beat),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  // `wire_calls` is the view a sequence diagram may be drawn from: the calls
  // that actually reached the gateway. `events` keeps everything that was
  // observed, so the narrower view can always be checked against the raw one.
  const wire = httpLog.filter((entry) => !entry.from_service_worker);
  writeFileSync(
    calls,
    `${JSON.stringify(
      {
        note:
          'events is every response event observed. wire_calls is the subset that ' +
          'reached the gateway: chora-web registers the Angular service worker, so ' +
          'one logical call surfaces as two events, the page answered by the ' +
          'service worker and the service worker request to the network. Nothing ' +
          'is discarded here, both views are written.',
        event_count: httpLog.length,
        wire_call_count: wire.length,
        service_worker_events: httpLog.length - wire.length,
        wire_calls: wire,
        events: httpLog,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`BEAT EVIDENCE  manifest  ${manifest}`);
  console.log(
    `BEAT EVIDENCE  http      ${calls}  (${wire.length} gateway calls on the wire, ` +
      `${httpLog.length - wire.length} answered by the service worker)`,
  );
  return [manifest, calls];
}
