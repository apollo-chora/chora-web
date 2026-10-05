/**
 * Vitest global test setup — ADR-176 (Vite-based runner via @analogjs).
 *
 * chora-web is ZONE-BASED change detection (no provideZonelessChangeDetection()
 * in app.config.ts; zone.js dependency; fakeAsync/whenStable specs), so we
 * initialise the Angular TestBed in zone mode. `setupTestBed({ zoneless: false })`
 * registers the per-test cleanup hooks and calls getTestBed().initTestEnvironment
 * with BrowserTestingModule + platformBrowserTesting() — matching the behaviour
 * the `@angular/build:unit-test` builder auto-injected.
 *
 * `@angular/compiler` import enables JIT template compilation fallback in tests.
 * `setup-zone` patches Vitest's describe/it/beforeEach to run inside a ProxyZone
 * (required for fakeAsync/tick and automatic change detection).
 */
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed({
  zoneless: false,
});
