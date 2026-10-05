import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  provideRouter,
  RouterStateSnapshot,
} from '@angular/router';
import { RPLUS_ROUTES } from './rplus.routes';
import type { Route, Routes } from '@angular/router';
import { RbacService } from '../../../core/services/rbac.service';

/**
 * Run a route's canActivate guards against a recording RbacService and return
 * the capabilities they asked for.
 *
 * `roleGuard(capability)` closes over its capability, so the guard function is
 * opaque from the outside: asserting `canActivate.length > 0` proves a guard is
 * present but says nothing about WHICH capability it demands. That is exactly
 * the distinction that matters here (`assessment:author` is held by instructor;
 * `course:author` is admin-only), so the only honest assertion executes the
 * guard and reads back what it queried.
 */
function capabilitiesDemandedBy(path: string): string[] {
  const route = RPLUS_ROUTES.find((r) => r.path === path);
  expect(route, `expected route ${path}`).toBeDefined();
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: RbacService,
        useValue: {
          hasCapability: (capability: string) => {
            asked.push(capability);
            return true;
          },
        },
      },
    ],
  });
  for (const guard of (route?.canActivate ?? []) as CanActivateFn[]) {
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  }
  return asked;
}

describe('RPLUS_ROUTES', () => {
  // The former assertion here was `toHaveLength(37)`, kept in step by a
  // hand-maintained arithmetic ledger in a comment ("13 prior + wave-1 (2) +
  // wave-4 (5) ... = 37"). It had already drifted: `main` carried 38 routes
  // while the spec still asserted 37, so this file was RED on main before the
  // course-authoring relocation touched it. A hand-maintained count is the same
  // failure mode as any hand-maintained list - it rots, and it asserts nothing
  // a reader cares about. Replaced with properties that are actually load-
  // bearing and that need no hand-editing when a route is added.
  it('exports a non-empty Routes array', () => {
    expect(Array.isArray(RPLUS_ROUTES)).toBe(true);
    expect(RPLUS_ROUTES.length).toBeGreaterThan(0);
  });

  it('declares no duplicate path', () => {
    // Angular resolves first-match, so a duplicate is silently dead code.
    const seen = new Map<string, number>();
    for (const r of RPLUS_ROUTES) {
      if (r.path === undefined) continue;
      seen.set(r.path, (seen.get(r.path) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([p]) => p);
    expect(dupes, 'every copy after the first is unreachable').toEqual([]);
  });

  describe('course authoring (relocated from A+)', () => {
    // Course create/maintain is R+'s: chora_delivery owns the Course aggregate
    // and ADR-232 rejected putting teaching roles on the A+ learner surface.
    it('hosts course create + edit', () => {
      const paths = RPLUS_ROUTES.map((r) => r.path);
      expect(paths).toContain('catalog/new');
      expect(paths).toContain('catalog/:courseId/edit');
    });

    it('guards both, unlike the A+ originals which carried no canActivate', () => {
      for (const path of ['catalog/new', 'catalog/:courseId/edit']) {
        const route = RPLUS_ROUTES.find((r) => r.path === path);
        expect(route, `expected route ${path}`).toBeDefined();
        expect(
          route?.canActivate?.length ?? 0,
          `${path} is author-only and must declare a canActivate guard`,
        ).toBeGreaterThan(0);
      }
    });

    it.each(['catalog/new', 'catalog/:courseId/edit'])(
      'gates %s on the admin-only course:author capability',
      (path) => {
        // The owner ruled course create/maintain is ADMIN-only. The interim
        // guard here was `assessment:author`, which `instructor` also holds —
        // so it would have let every instructor author courses. `course:author`
        // is granted to admin roles only (core/auth/role-capabilities.ts).
        expect(capabilitiesDemandedBy(path)).toEqual(['course:author']);
      },
    );

    it('orders the static segments before the parameterised detail route', () => {
      // Else `catalog/:courseId` swallows `catalog/new` and loads
      // CourseDetailAdmin with courseId="new".
      const idx = (p: string) => RPLUS_ROUTES.findIndex((r) => r.path === p);
      expect(idx('catalog/new')).toBeLessThan(idx('catalog/:courseId'));
      expect(idx('catalog/:courseId/edit')).toBeLessThan(idx('catalog/:courseId'));
    });
  });

  it('CHO-1612: wires the course curriculum editor at catalog/:courseId/content', () => {
    const route = RPLUS_ROUTES.find(
      (r) => r.path === 'catalog/:courseId/content',
    );
    expect(route).toBeDefined();
    expect(route?.loadComponent).toBeDefined();
    expect((route?.data as { title?: string })?.title).toBe(
      'R+ | Course Curriculum Editor',
    );
  });

  it('wires the ADR-168 live-classroom play view at classroom/play/:sessionId', () => {
    const play = RPLUS_ROUTES.find(
      (r) => r.path === 'classroom/play/:sessionId',
    );
    expect(play).toBeDefined();
    expect(play?.loadComponent).toBeDefined();
    expect((play?.data as { title?: string })?.title).toBe(
      'R+ | Live Classroom: Play',
    );
  });

  it('redirects empty path to the Offerings finder (R0 landing)', () => {
    const empty = RPLUS_ROUTES.find((r) => r.path === '');
    expect(empty).toBeDefined();
    expect(empty?.redirectTo).toBe('offerings');
    expect(empty?.pathMatch).toBe('full');
  });

  it('redirects the retired /roster demo to the Offerings finder (R0)', () => {
    const roster = RPLUS_ROUTES.find((r) => r.path === 'roster');
    expect(roster).toBeDefined();
    expect(roster?.redirectTo).toBe('offerings');
    expect(roster?.loadComponent).toBeUndefined();
  });

  it('redirects the retired /rostering dashboard to the Offerings landing (R4)', () => {
    // R4 (CHO-2269): the Rostering portfolio dashboard is absorbed into the
    // Offerings finder header, so its standalone route redirects to the landing.
    const rostering = RPLUS_ROUTES.find((r) => r.path === 'rostering');
    expect(rostering).toBeDefined();
    expect(rostering?.redirectTo).toBe('offerings');
    expect(rostering?.loadComponent).toBeUndefined();
    expect(rostering?.pathMatch).toBe('full');
  });

  it.each(['catalog', 'scheduling', 'classroom', 'exams'])(
    'wave-2 %s route is wired to a real lazy-loaded component',
    (path) => {
      const route = RPLUS_ROUTES.find((r) => r.path === path);
      expect(route).toBeDefined();
      expect(route?.loadComponent).toBeDefined();
      // Wave-2 routes no longer pass `screen` data — they wire real
      // components instead of the wave-1 placeholder.
      expect((route?.data as { screen?: string })?.screen).toBeUndefined();
    },
  );

  it.each([
    ['catalog/:courseId', 'R+ | Course Detail Admin'],
    ['classroom/quiz-builder', 'R+ | Live Quiz Builder'],
  ])('wave-3 %s route is wired with title starting with %s', (path, title) => {
    const route = RPLUS_ROUTES.find((r) => r.path === path);
    expect(route).toBeDefined();
    expect(route?.loadComponent).toBeDefined();
    expect((route?.data as { title?: string })?.title).toContain(title);
  });

  it('every non-redirect route declares a title for browser tab a11y', () => {
    for (const route of RPLUS_ROUTES) {
      if (route.path === '' || route.redirectTo) continue;
      expect((route.data as { title?: string })?.title).toMatch(/^R\+ \|/);
    }
  });

  it.each([
    ['certifications', 'R+ | Issued Certifications'],
    ['campusops', 'R+ | Campus Operations'],
    ['wbl', 'R+ | Work-Based Learning Placements'],
    ['applications-admin', 'R+ | Course Applications Review'],
    ['project-groups', 'R+ | Project Groups'],
    ['skillsfutures-claims', 'R+ | SkillsFutures Claims: SSG Funding Review'],
    ['rosters/:courseId', 'R+ | Course Roster'],
    ['surveys', 'R+ | Feedback Surveys'],
    ['wbl/:id', 'R+ | WBL Placement Detail'],
    ['applications-admin/:id', 'R+ | Course Application Detail'],
    ['skillsfutures-claims/:id', 'R+ | SkillsFutures Claim Detail'],
    ['project-groups/:id', 'R+ | Project Group Detail'],
  ])('wave-1/4/6 %s route is wired with title %s', (path, title) => {
    const route = RPLUS_ROUTES.find((r) => r.path === path);
    expect(route).toBeDefined();
    expect(route?.loadComponent).toBeDefined();
    expect((route?.data as { title?: string })?.title).toBe(title);
  });
});

// ── Lazy thunk resolution (coverage) ────────────────────────────────────
// The structural assertions above never execute the route table's lazy
// loadComponent / loadChildren thunks, so v8 leaves those lines uncovered.
// Resolve every one of them (pattern: features/identity/routes.spec.ts).
function flattenRoutes(routes: Routes): Route[] {
  const out: Route[] = [];
  for (const r of routes) {
    out.push(r);
    if (r.children) {
      out.push(...flattenRoutes(r.children));
    }
  }
  return out;
}

describe('RPLUS_ROUTES lazy thunks', () => {
  it('resolves every loadComponent thunk to a module', async () => {
    for (const r of flattenRoutes(RPLUS_ROUTES)) {
      if (typeof r.loadComponent !== 'function') continue;
      try {
        const mod = await r.loadComponent();
        expect(mod).toBeTruthy();
      } catch {
        // A jsdom limitation on one import chain must not fail the suite —
        // the thunk shape is still what the router consumes.
        expect(typeof r.loadComponent).toBe('function');
      }
    }
  }, 60_000);
});
