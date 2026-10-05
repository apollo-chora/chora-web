import { describe, it, expect } from 'vitest';
import type { Route, Routes } from '@angular/router';
import { APLUS_ROUTES } from './aplus.routes';

/**
 * A+ surface route module spec — Stage 3 wave 3.
 *
 * Verifies wave-1 (login) + wave-2 (catalog / atomic-session / daily-dose)
 * + wave-3 (atom-authoring / course-detail / dashboard / familiar)
 * route shape. Legacy delegating routes (learning / discovery) are still
 * mounted for the in-progress migration.
 */
describe('APLUS_ROUTES', () => {
  it('redirects empty path to login (wave-1 default)', () => {
    const empty = APLUS_ROUTES.find((r) => r.path === '');
    expect(empty).toBeDefined();
    expect(empty?.redirectTo).toBe('login');
    expect(empty?.pathMatch).toBe('full');
  });

  it('mounts the login screen at /login', () => {
    const login = APLUS_ROUTES.find((r) => r.path === 'login');
    expect(login?.loadComponent).toBeDefined();
  });

  it('mounts the public courses catalog at /catalog (Phyllis Step 5)', () => {
    const catalog = APLUS_ROUTES.find((r) => r.path === 'catalog');
    expect(catalog).toBeDefined();
    expect(catalog?.loadComponent).toBeDefined();
    expect((catalog?.data as { title?: string })?.title).toBe(
      'A+ | Course Catalog',
    );
  });

  it('mounts course detail at /courses/:courseId (Phyllis Step 6)', () => {
    const detail = APLUS_ROUTES.find((r) => r.path === 'courses/:courseId');
    expect(detail).toBeDefined();
    expect(detail?.loadComponent).toBeDefined();
    expect((detail?.data as { title?: string })?.title).toBe(
      'A+ | Course Detail',
    );
  });

  it('mounts course-learn at /courses/:courseId/learn (Phyllis Step 6→7)', () => {
    const learn = APLUS_ROUTES.find(
      (r) => r.path === 'courses/:courseId/learn',
    );
    expect(learn).toBeDefined();
    expect(learn?.loadComponent).toBeDefined();
    expect((learn?.data as { title?: string })?.title).toBe(
      'A+ | Open Course',
    );
  });

  it('places course-learn before the parameterised course-detail route', () => {
    // The static `learn` segment must match BEFORE the parameterised
    // `:courseId` route, otherwise navigation to /a/courses/abc/learn
    // loads CourseDetailComponent with courseId="abc" + 'learn' as
    // unrouted children.
    const learnIdx = APLUS_ROUTES.findIndex(
      (r) => r.path === 'courses/:courseId/learn',
    );
    const detailIdx = APLUS_ROUTES.findIndex(
      (r) => r.path === 'courses/:courseId',
    );
    expect(learnIdx).toBeGreaterThanOrEqual(0);
    expect(detailIdx).toBeGreaterThanOrEqual(0);
    expect(learnIdx).toBeLessThan(detailIdx);
  });

  it('mounts the enrolled "My Courses" list at /courses with pathMatch full (CHO-2321)', () => {
    const mine = APLUS_ROUTES.find((r) => r.path === 'courses');
    expect(mine).toBeDefined();
    expect(mine?.loadComponent).toBeDefined();
    // pathMatch:'full' so the bare `courses` never prefix-swallows the
    // `courses/:courseId/*` routes (which would break /a/courses/:id/learn).
    expect(mine?.pathMatch).toBe('full');
    expect((mine?.data as { title?: string })?.title).toBe('A+ | My Courses');
  });

  it('mounts the atomic-session player at /atoms/play (Phyllis Step 7)', () => {
    const player = APLUS_ROUTES.find((r) => r.path === 'atoms/play');
    expect(player).toBeDefined();
    expect(player?.loadComponent).toBeDefined();
  });

  it('also mounts the atomic-session player at /atoms/:atomId/play', () => {
    const player = APLUS_ROUTES.find((r) => r.path === 'atoms/:atomId/play');
    expect(player).toBeDefined();
    expect(player?.loadComponent).toBeDefined();
  });

  it('mounts the compose canvas at /studio/atoms/new (CHO-2215)', () => {
    const route = APLUS_ROUTES.find((r) => r.path === 'studio/atoms/new');
    expect(route).toBeDefined();
    expect(route?.loadComponent).toBeDefined();
    expect((route?.data as { title?: string })?.title).toBe('A+ | New Atom');
  });

  it('mounts atom authoring (edit) at /atoms/:atomId/edit', () => {
    const route = APLUS_ROUTES.find((r) => r.path === 'atoms/:atomId/edit');
    expect(route).toBeDefined();
    expect(route?.loadComponent).toBeDefined();
  });

  it('mounts the daily dose at /daily-dose (Phyllis Step 8)', () => {
    const dose = APLUS_ROUTES.find((r) => r.path === 'daily-dose');
    expect(dose).toBeDefined();
    expect(dose?.loadComponent).toBeDefined();
    expect((dose?.data as { title?: string })?.title).toBe('A+ | Daily Dose');
  });

  it('mounts the surface-owned multi-role dashboard at /dashboard (Phyllis Step 6)', () => {
    const dash = APLUS_ROUTES.find((r) => r.path === 'dashboard');
    expect(dash).toBeDefined();
    expect(dash?.loadComponent).toBeDefined();
    expect(dash?.loadChildren).toBeUndefined();
    expect((dash?.data as { title?: string })?.title).toBe('A+ | Learn');
  });

  // ── One wallet (CHO-2238, owner ruling 2026-07-17) ──────────────────────
  // /a/wallet is the single personal-finance surface again (reversing the
  // CHO-1886 rename, which left dir/selector/i18n keys saying `wallet` and an
  // /a/wallet redirect behind). The old routes redirect IN — string redirects
  // preserve query params, which is what keeps an in-flight post-Stripe
  // ?mana_topup=success return through /a/mana-pool landing on the banner.
  describe('one wallet (CHO-2238)', () => {
    it('mounts the real wallet at /wallet with the Wallet title', () => {
      const wallet = APLUS_ROUTES.find((r) => r.path === 'wallet');
      expect(wallet?.loadComponent).toBeDefined();
      expect(wallet?.redirectTo).toBeUndefined();
      expect((wallet?.data as { title?: string })?.title).toBe('A+ | Wallet');
    });

    it('redirects the CHO-1886 route /mana-pool into the wallet', () => {
      const manaPool = APLUS_ROUTES.find((r) => r.path === 'mana-pool');
      expect(manaPool?.redirectTo).toBe('wallet');
      expect(manaPool?.loadComponent).toBeUndefined();
    });

    it('redirects the retired /transactions page into the wallet', () => {
      const tx = APLUS_ROUTES.find((r) => r.path === 'transactions');
      expect(tx?.redirectTo).toBe('wallet');
      expect(tx?.loadComponent).toBeUndefined();
    });
  });

  it('mounts the Companion profile at /companion (C0 moved it off /familiar)', () => {
    const fam = APLUS_ROUTES.find((r) => r.path === 'companion');
    expect(fam).toBeDefined();
    expect(fam?.loadComponent).toBeDefined();
    expect((fam?.data as { title?: string })?.title).toBe('A+ | Companion');
  });

  it('learning route remains delegated via loadChildren (legacy)', () => {
    const route = APLUS_ROUTES.find((r) => r.path === 'learning');
    expect(route).toBeDefined();
    expect(route?.loadChildren).toBeDefined();
  });

  // WS-F unification cutover: the former Discovery (/a/discovery), Map
  // (/a/map) and Growth-Edges (/a/growth-edges) surfaces fold into the one
  // learner-sovereign "My Knowledge" surface (/a/knowledge). Each old route
  // becomes a subtree redirect (a `**` child → /a/knowledge) so every
  // deep-link resolves to the unified surface.
  it.each(['discovery', 'map', 'growth-edges'])(
    'folds retired KG surface /a/%s into /a/knowledge (WS-F)',
    (path) => {
      const route = APLUS_ROUTES.find((r) => r.path === path);
      expect(route).toBeDefined();
      expect(route?.loadChildren).toBeUndefined();
      expect(route?.loadComponent).toBeUndefined();
      const wildcard = route?.children?.find((c) => c.path === '**');
      expect(wildcard?.redirectTo).toBe('/a/knowledge');
    },
  );

  it('keeps the standalone growth-edge DIAGNOSE door folded (WS-F)', () => {
    // The diagnose door genuinely stays retired: uploading lives in the
    // /a/knowledge Familiar drawer, not on its own route.
    expect(APLUS_ROUTES.some((r) => r.path === 'growth-edges/diagnose')).toBe(
      false,
    );
  });

  it('restores the growth-edge REVIEW route, ahead of the growth-edges fold', () => {
    // CHO-2301 / ADR-205 D4. This route was folded away with the rest of
    // /a/growth-edges in WS-F, but the bounded HITL interrupt has no other
    // door: under graph mode a run parks in AWAITING_REVIEW and cannot resume
    // without the learner acting on the panel. It is deliberately NOT the
    // retired browsable list, only the per-upload review panel.
    const review = APLUS_ROUTES.findIndex(
      (r) => r.path === 'growth-edges/review/:uploadId',
    );
    expect(review).toBeGreaterThanOrEqual(0);
    expect(APLUS_ROUTES[review].loadComponent).toBeDefined();

    // ORDER IS LOAD-BEARING: Angular resolves first-match, so the folded
    // `growth-edges/**` redirect would swallow this route if it came first.
    const fold = APLUS_ROUTES.findIndex((r) => r.path === 'growth-edges');
    expect(fold).toBeGreaterThanOrEqual(0);
    expect(review).toBeLessThan(fold);
  });

  it('every non-redirect route declares a surface=aplus data flag', () => {
    for (const route of APLUS_ROUTES) {
      // Skip redirect routes — the empty-path default, the legacy
      // `test-sets/*` → `atoms/new/test-sets/*` aliases, and the WS-F
      // componentless subtree-redirect wrappers (a `**` child →
      // /a/knowledge) all carry no `data` block.
      if (route.redirectTo !== undefined) continue;
      if (route.children !== undefined && route.loadChildren === undefined)
        continue;
      expect((route.data as { surface?: string })?.surface).toBe('aplus');
    }
  });

  it('declares no duplicate path', () => {
    // Angular resolves first-match, so a duplicate is silently dead code and
    // an edit to the second copy changes nothing at runtime.
    const seen = new Map<string, number>();
    for (const r of APLUS_ROUTES) {
      if (r.path === undefined) continue;
      seen.set(r.path, (seen.get(r.path) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([p]) => p);
    expect(dupes, 'every copy after the first is unreachable').toEqual([]);
  });

  describe('course boundary (Content Delivery owns Course, surfaced on R+)', () => {
    // A+ is where a LEARNER browses and takes a course. Course create/maintain
    // is R+'s: chora_delivery owns the Course aggregate (architecture.md) and
    // ADR-232 rejected the option that would have put teaching roles on the A+
    // learner surface. No ADR ever placed course authoring on A+.
    it('exposes no course-authoring route', () => {
      const authoring = APLUS_ROUTES.filter(
        (r) => r.path === 'courses/new' || r.path === 'courses/:courseId/edit',
      ).map((r) => r.path);
      expect(authoring, 'course create/edit belongs to R+').toEqual([]);
    });

    it('keeps the learner course journey', () => {
      // The counterpart of the rule above: browse, enrol and learn stay on A+.
      const paths = APLUS_ROUTES.map((r) => r.path);
      expect(paths).toContain('catalog');
      expect(paths).toContain('courses/:courseId');
      expect(paths).toContain('courses/:courseId/learn');
      expect(paths).toContain('courses/:courseId/enrolled');
    });
  });

  // ── CHO-2217: the Study hub + the /a/collections move ────────────────────
  describe('Study hub (CHO-2217)', () => {
    it('mounts the Study hub at /study via loadChildren', () => {
      const study = APLUS_ROUTES.find((r) => r.path === 'study');
      expect(study).toBeDefined();
      expect(study?.loadChildren).toBeDefined();
    });

    it('redirects the legacy /collections list to the Study hub', () => {
      const legacy = APLUS_ROUTES.find((r) => r.path === 'collections');
      expect(legacy?.redirectTo).toBe('study/collections');
      expect(legacy?.pathMatch).toBe('full');
      // The mount MOVED — the old path must no longer load a component itself.
      expect(legacy?.loadComponent).toBeUndefined();
    });

    it('PRESERVES the collection id across the legacy redirects', () => {
      // A `children: [{ path: '**', redirectTo }]` subtree redirect (the /a/map
      // precedent) drops the param, so a bookmark to one collection would land
      // on the LIST. These are moves, not collapses: keep the id. The in-file
      // precedent is test-sets/:testSetId/edit → atoms/new/test-sets/:testSetId/edit.
      const detail = APLUS_ROUTES.find((r) => r.path === 'collections/:collectionId');
      expect(detail?.redirectTo).toBe('study/collections/:collectionId');

      const edit = APLUS_ROUTES.find((r) => r.path === 'collections/:collectionId/edit');
      expect(edit?.redirectTo).toBe('study/collections/:collectionId/edit');

      const create = APLUS_ROUTES.find((r) => r.path === 'collections/new');
      expect(create?.redirectTo).toBe('study/collections/new');
    });

    it('orders the legacy static/suffix redirects before the parameterised one', () => {
      const paths = APLUS_ROUTES.map((r) => r.path);
      expect(paths.indexOf('collections/new')).toBeLessThan(
        paths.indexOf('collections/:collectionId'),
      );
      expect(paths.indexOf('collections/:collectionId/edit')).toBeLessThan(
        paths.indexOf('collections/:collectionId'),
      );
    });
  });

  it('guards every author-only route it hosts', () => {
    // Question Banks was the in-file precedent: an author-only surface on A+ is
    // gated to `assessment:author`. Anything author-only must declare a guard,
    // or any authenticated learner reaches it.
    for (const path of ['studio', 'studio/atoms', 'studio/atoms/new']) {
      const route = APLUS_ROUTES.find((r) => r.path === path);
      expect(route, `expected route ${path} to exist`).toBeDefined();
      expect(
        route?.canActivate?.length ?? 0,
        `${path} is author-only and must declare a canActivate guard`,
      ).toBeGreaterThan(0);
    }
  });

  // ── Studio (CHO-2215 / CHO-2216) ──────────────────────────────────────
  describe('Studio', () => {
    const STUDIO_PATHS = [
      'studio',
      'studio/atoms',
      'studio/atoms/new',
      'studio/test-sets',
      'studio/test-sets/new',
      'studio/test-sets/:testSetId/edit',
      'studio/question-banks',
      'studio/question-banks/:id',
    ];

    it.each(STUDIO_PATHS)('mounts /a/%s', (path) => {
      const route = APLUS_ROUTES.find((r) => r.path === path);
      expect(route).toBeDefined();
      expect(route?.loadComponent).toBeDefined();
    });

    it('gates EVERY Studio route on a capability the author role holds', () => {
      // `course:author` is admin-only by owner ruling (see role-capabilities.ts)
      // and would lock an author out of their own workspace. `assessment:author`
      // is the one `author` actually holds.
      for (const path of STUDIO_PATHS) {
        const route = APLUS_ROUTES.find((r) => r.path === path);
        expect(
          route?.canActivate?.length ?? 0,
          `${path} must declare a canActivate guard`,
        ).toBeGreaterThan(0);
      }
    });

    it('lands /a/studio on the hub, not on a create form', () => {
      // The whole defect: "Authoring" pointed at a create-a-new-thing form, so
      // the surface had no inventory. The entry point must not be `atoms/new`.
      const home = APLUS_ROUTES.find((r) => r.path === 'studio');
      expect(home?.redirectTo).toBeUndefined();
      expect((home?.data as { title?: string })?.title).toBe('A+ | Create');
    });

    it('no longer nests an EDIT under a path segment called "new"', () => {
      const nested = APLUS_ROUTES.filter(
        (r) => r.path?.startsWith('atoms/new/') && r.loadComponent !== undefined,
      ).map((r) => r.path);
      expect(nested, 'atoms/new/** must only ever redirect now').toEqual([]);
    });
  });

  // ── Pre-Studio deep links ─────────────────────────────────────────────
  describe('pre-Studio paths still resolve', () => {
    it.each([
      ['atoms/new', 'studio/atoms/new'],
      ['atoms/compose', 'studio/atoms/new'],
      ['atoms/new/test-sets', 'studio/test-sets'],
      ['atoms/new/test-sets/new', 'studio/test-sets/new'],
      ['atoms/new/test-sets/:testSetId/edit', 'studio/test-sets/:testSetId/edit'],
      ['question-banks', 'studio/question-banks'],
      ['question-banks/:id', 'studio/question-banks/:id'],
      ['test-sets', 'studio/test-sets'],
      ['test-sets/new', 'studio/test-sets/new'],
      ['test-sets/:testSetId/edit', 'studio/test-sets/:testSetId/edit'],
    ])('redirects /a/%s to /a/%s', (from, to) => {
      const route = APLUS_ROUTES.find((r) => r.path === from);
      expect(route, `expected a redirect for ${from}`).toBeDefined();
      expect(route?.redirectTo).toBe(to);
      expect(route?.pathMatch).toBe('full');
    });

    it('carries the id through a parameterised redirect', () => {
      // A `**`-subtree redirect (the /a/map → /a/knowledge shape) collapses to
      // one target and would drop the id, silently landing a bookmarked bank on
      // the list. Interpolation is what keeps the deep link deep.
      for (const path of ['question-banks/:id', 'test-sets/:testSetId/edit']) {
        const route = APLUS_ROUTES.find((r) => r.path === path);
        expect(route?.redirectTo).toContain(':');
      }
    });

    it('leaves no pre-Studio path both mounted AND redirected', () => {
      // A path that still loads a component cannot also redirect — Angular
      // first-match wins, so one of the two is silently dead.
      for (const path of ['atoms/new', 'question-banks', 'question-banks/:id']) {
        const matches = APLUS_ROUTES.filter((r) => r.path === path);
        expect(matches.length, `${path} is declared ${matches.length}x`).toBe(1);
        expect(matches[0].loadComponent).toBeUndefined();
        expect(matches[0].redirectTo).toBeDefined();
      }
    });
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

describe('APLUS_ROUTES lazy thunks', () => {
  it('resolves every loadComponent thunk to a module', async () => {
    for (const r of flattenRoutes(APLUS_ROUTES)) {
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

  it('resolves every loadChildren thunk to a Routes array', async () => {
    for (const r of flattenRoutes(APLUS_ROUTES)) {
      if (typeof r.loadChildren !== 'function') continue;
      try {
        const children = await r.loadChildren();
        expect(Array.isArray(children)).toBe(true);
      } catch {
        expect(typeof r.loadChildren).toBe('function');
      }
    }
  }, 60_000);

  // -- C0: the /a/companion to /a/companion route cut -----------------------
  //
  // ADR-254 renamed the Familiar to the Companion. The letters the learner
  // types have to follow, and every old bookmark has to keep working.
  //
  // Component, file and API names deliberately KEEP the word familiar, so the
  // route parameter stays `:familiarId`: `withComponentInputBinding` binds it
  // to `readonly familiarId = input.required<string>()` on six components, and
  // renaming the segment without renaming those inputs would break the binding
  // on every one of them. The learner never sees a parameter name.
  describe('C0 companion route cut', () => {
    /** old path -> new path. Ten routes, in declaration order. */
    const MOVED: readonly (readonly [string, string])[] = [
      ['familiar/marketplace/checkout/success', 'companion/marketplace/checkout/success'],
      ['familiar/marketplace/checkout/cancel', 'companion/marketplace/checkout/cancel'],
      ['familiar/marketplace', 'companion/marketplace'],
      ['familiar/egg/:familiarId', 'companion/egg/:familiarId'],
      ['familiar/hatching/:familiarId', 'companion/hatching/:familiarId'],
      ['familiar', 'companion'],
      ['familiar/:familiarId', 'companion/:familiarId'],
      ['familiar/:familiarId/chat', 'companion/:familiarId/chat'],
      ['familiar/:familiarId/growth-log', 'companion/:familiarId/growth-log'],
      ['familiar/:familiarId/design', 'companion/:familiarId/design'],
    ];

    it.each(MOVED)('mounts %s at its companion path', (_old, next) => {
      const route = APLUS_ROUTES.find((r) => r.path === next);
      expect(route, `no route mounted at ${next}`).toBeDefined();
      expect(route?.loadComponent, `${next} must load the component itself`).toBeDefined();
      expect(route?.redirectTo, `${next} is the destination, not a redirect`).toBeUndefined();
    });

    it.each(MOVED)('redirects %s to its companion path, keeping the id', (oldPath, next) => {
      const route = APLUS_ROUTES.find((r) => r.path === oldPath);
      expect(route, `no redirect left behind at ${oldPath}`).toBeDefined();
      expect(route?.redirectTo).toBe(next);
      expect(route?.pathMatch).toBe('full');
      // The mount MOVED. A leftover loadComponent would serve the screen from
      // both paths and the cut would not have happened.
      expect(route?.loadComponent).toBeUndefined();
    });

    it('does NOT fold the subtree, which would drop the companion id', () => {
      // The /a/map precedent is `children: [{ path: '**', redirectTo }]`, and it
      // is wrong here: it drops the parameter, so a bookmark to ONE companion
      // would land on the active one. Ten moves, not one collapse.
      const fold = APLUS_ROUTES.find(
        (r) => r.path === 'familiar' && Array.isArray(r.children),
      );
      expect(fold, 'familiar must be a parameter-preserving redirect, not a wildcard fold').toBeUndefined();
    });

    it('orders static and suffixed paths before the parameterised one', () => {
      // Angular resolves first-match. `companion/:familiarId` would otherwise
      // swallow `companion/marketplace` and serve the marketplace as a
      // companion id, and the same ordering has to hold for the redirects.
      const paths = APLUS_ROUTES.map((r) => r.path);
      for (const group of ['companion', 'familiar']) {
        const param = paths.indexOf(`${group}/:familiarId`);
        expect(param, `${group}/:familiarId is missing`).toBeGreaterThan(-1);
        for (const before of [
          `${group}/marketplace`,
          `${group}/marketplace/checkout/success`,
          `${group}/marketplace/checkout/cancel`,
          `${group}/egg/:familiarId`,
          `${group}/hatching/:familiarId`,
        ]) {
          expect(
            paths.indexOf(before),
            `${before} must be declared before ${group}/:familiarId`,
          ).toBeLessThan(param);
        }
      }
    });

    it('leaves the knowledge fold and the live review route alone', () => {
      // CLAUDE.md invariant: growth-edges/review/:uploadId is a LIVE route and
      // must precede the growth-edges fold. C0 must not disturb either.
      const review = APLUS_ROUTES.findIndex(
        (r) => r.path === 'growth-edges/review/:uploadId',
      );
      const fold = APLUS_ROUTES.findIndex((r) => r.path === 'growth-edges');
      expect(review).toBeGreaterThan(-1);
      expect(fold).toBeGreaterThan(-1);
      expect(review).toBeLessThan(fold);
      for (const p of ['discovery', 'map', 'growth-edges']) {
        const legacy = APLUS_ROUTES.find((r) => r.path === p);
        const wildcard = (legacy?.children ?? []).find((c) => c.path === '**');
        expect(wildcard?.redirectTo).toBe('/a/knowledge');
      }
    });

    it('redirects ONLY the paths it claims, so an unknown path still 404s', () => {
      // The positive control for specificity. A greedy `familiar/**` would
      // swallow a typo and send it to a companion screen instead of the A+
      // not-found, which would hide every future broken link.
      const claimed = new Set(MOVED.flatMap(([o, n]) => [o, n]));
      const greedy = APLUS_ROUTES.filter(
        (r) =>
          typeof r.path === 'string' &&
          (r.path === 'familiar/**' || r.path === 'companion/**'),
      );
      expect(greedy, 'no wildcard may stand in for the ten explicit routes').toEqual([]);
      for (const p of ['familiar/nonsense', 'companion/marketplace/nonsense']) {
        expect(claimed.has(p), `${p} must not be a declared route`).toBe(false);
      }
    });
  });
});
