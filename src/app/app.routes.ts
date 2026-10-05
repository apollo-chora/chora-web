import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { PublicLayoutComponent } from './layouts/public-layout/public-layout.component';
import { AuthService } from './core/auth/auth.service';
import { LandingService } from './core/auth/landing.service';
import { authGuard } from './core/auth/auth.guard';
import { optionalAuthGuard } from './core/auth/optional-auth.guard';
import { addOnGuard } from './core/auth/add-on.guard';
import { roleGuard } from './core/auth/role.guard';
import { rplusOpsGuard } from './core/auth/rplus-ops.guard';
import { surfaceGuard } from './core/auth/surface.guard';
import { featureReadyGuard } from './core/guards/feature-ready.guard';

export const routes: Routes = [
  // ── Root redirect: authed → wherever the landing resolver says, else /login ──
  // Must precede the path:'' groups below — otherwise the AuthLayout
  // group matches the empty path and renders an empty layout because
  // it has no child for path:''.
  //
  // This used to hard-code `/a/dashboard`, which assumed every authenticated
  // session holds A+. `LandingService` answers for the session actually in
  // hand (C2 slice 3, ADR-240): `/a/home` for a learner, the surface they do
  // hold for an admin or an auditor, `/home` for a session holding none.
  // `welcome/no-tenant` and the no-organisation retry both redirect to `/`,
  // so they inherit the same answer.
  {
    path: '',
    pathMatch: 'full',
    redirectTo: () => {
      const auth = inject(AuthService);
      const landing = inject(LandingService);
      return auth.isAuthenticated() ? landing.landingRoute() : '/login';
    },
  },

  // ── Group 1: Invite routes (pre-auth capable) ──
  {
    path: 'invite/:code',
    loadComponent: () =>
      import('./features/invite/invite-handler.component').then(
        (m) => m.InviteHandlerComponent,
      ),
    data: { actionType: 'invite' },
  },
  {
    path: 'ref/:code',
    loadComponent: () =>
      import('./features/invite/invite-handler.component').then(
        (m) => m.InviteHandlerComponent,
      ),
    data: { actionType: 'referral' },
  },

  // ── L5.2 (CHO-1704, ADR-179): the Live Classroom learner stage. CHROMELESS like
  // invite/:code (no layout shell — the stage IS the page) but auth-required
  // (tenant members only). Deliberately NOT add-on gated: the R+ live
  // classroom surface (presenter/builder) carries no addOnGuard either, and
  // the BE enforces tenant scoping on every session call. The ADR-179
  // mobile-phone exception applies to THIS route only.
  {
    path: 'play/:code',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './features/surfaces/rplus/play/play-stage.component'
      ).then((m) => m.PlayStageComponent),
    data: { title: 'Chora | Live Quiz' },
  },

  // ── Group 2: Auth routes (AuthLayout) ──
  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      {
        path: 'login',
        loadChildren: () =>
          import('./features/identity/routes').then((m) => m.LOGIN_ROUTES),
      },
      // RETIRED with the Firebase/Identity Platform extraction: /register
      // (self-service sign-up), /auth/callback (OIDC redirect target) and
      // /auth/verify (email-verification action link) had no server-side
      // equivalent in the frozen gateway contract — the mint endpoint takes
      // username/password only. Unknown paths fall through to /not-found.
      {
        path: 'suspended',
        loadComponent: () =>
          import('./features/identity/suspension/suspension-page.component').then(
            (m) => m.SuspensionPageComponent,
          ),
        data: { title: 'Account Suspended' },
      },
      // RETIRED 2026-09-02 (E2 part 3). The form here asked the user to join
      // an organisation by code and its only possible outcome was 409
      // already-member (first-launch spec 5.1). Repairing it would have
      // contradicted the operator-only ruling that gates tenant creation, so
      // it is retired rather than fixed. The path stays alive as a redirect
      // so a stale bookmark lands on the landing resolver instead of a 404.
      {
        path: 'welcome/no-tenant',
        redirectTo: '/',
        pathMatch: 'full',
      },
      // The named refusal the auth guard now routes a tenantless session to.
      // NOT behind authGuard: the guard itself redirects here, so guarding it
      // would loop. Since ADR-182 a tenantless session should not exist, so
      // this states a fault rather than onboarding out of a normal state.
      {
        path: 'welcome/no-organisation',
        loadComponent: () =>
          import('./features/onboarding/no-organisation/no-organisation.component').then(
            (m) => m.NoOrganisationComponent,
          ),
        data: { title: 'No organisation' },
      },
      // ── First-login tenant picker (Stage-2 cutover) ──
      // Reached when authGuard sees a user with >1 membership and no
      // tenant selected yet. NOT behind authGuard — the guard itself
      // redirects here, so guarding it would loop.
      {
        path: 'select-tenant',
        loadComponent: () =>
          import('./features/onboarding/select-tenant/select-tenant.component').then(
            (m) => m.SelectTenantComponent,
          ),
        data: { title: 'Choose a Tenant' },
      },
    ],
  },

  // ── Group 3: Public routes (PublicLayout, no auth required) ──
  {
    path: '',
    component: PublicLayoutComponent,
    canActivate: [optionalAuthGuard],
    children: [
      {
        path: 'p/:slug',
        loadComponent: () =>
          import(
            './features/public/public-content-preview/public-content-preview.component'
          ).then((m) => m.PublicContentPreviewComponent),
        data: { title: 'Public Content' },
      },
      {
        path: 'atoms/:id',
        loadComponent: () =>
          import(
            './features/public/public-atom-view/public-atom-view.component'
          ).then((m) => m.PublicAtomViewComponent),
        data: { title: 'Atom' },
      },
      {
        path: 'topics/:id',
        loadComponent: () =>
          import(
            './features/public/public-topic-view/public-topic-view.component'
          ).then((m) => m.PublicTopicViewComponent),
        data: { title: 'Topic' },
      },
      {
        path: 'paths/:id',
        loadComponent: () =>
          import(
            './features/public/public-path-view/public-path-view.component'
          ).then((m) => m.PublicPathViewComponent),
        data: { title: 'Path' },
      },
      {
        path: 'verify/:certId',
        loadComponent: () =>
          import(
            './features/public/certificate-verification/certificate-verification.component'
          ).then((m) => m.CertificateVerificationComponent),
        data: { title: 'Verify Certificate' },
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./features/public/pricing/pricing-page.component').then(
            (m) => m.PricingPageComponent,
          ),
        data: { title: 'Plans & Pricing' },
      },
    ],
  },

  // ── Group 4: Protected routes (MainLayout, auth required) ──
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      // The Group-4 empty-path child was DELETED here (C2 slice 3).
      //
      // It read `{ path: '', redirectTo: 'dashboard', pathMatch: 'full' }` and
      // had never run: the functional root redirect at the top of this table is
      // declared first, also binds path:'' with pathMatch:'full', and Angular is
      // first-match-wins, so `/` was resolved before this group was ever
      // consulted. Repointing it at the landing resolver would have changed
      // nothing, and leaving it would have left a second, contradictory answer
      // to the question the resolver now owns. `app.routes.spec.ts` pins that
      // this group declares no empty-path child.

      // ── CHORA surface routes (Stage 3 wave 1 wired) ──
      // Each surface fan-out agent delivered a routes module under
      // features/surfaces/{surface}/{surface}.routes.ts. Wave 1 ships
      // the canonical first screen per surface; wave 2+ populates the
      // remaining routes inside each module.
      // ── Surface-route RBAC guard (CHO-1801 / ADR-181 + ADR-165) ──
      // `surfaceGuard(surface)` activates each surface GROUP iff the active
      // membership's role-driven `surfaces[]` includes it (or platform_operator)
      // — the SAME predicate the surface rail uses, closing the URL-bar bypass
      // of role-driven surface visibility (CLAUDE.md §2). Fail-closed for the
      // sensitive surfaces; see surface.guard.ts for the A+ baseline rationale.
      {
        path: 'a',
        loadChildren: () =>
          import('./features/surfaces/aplus/aplus.routes').then((m) => m.APLUS_ROUTES),
        canActivate: [surfaceGuard('aplus')],
        data: { title: 'A+' },
      },
      {
        path: 'c',
        loadChildren: () =>
          import('./features/surfaces/cplus/cplus.routes').then((m) => m.CPLUS_ROUTES),
        // §4.7c (CHO-1717 / ADR-181): C+ carries TWO axes — the membership axis
        // (`surfaceGuard('cplus')`: the user's role unlocks C+) AND the add-on
        // entitlement axis (`addOnGuard('cplus_social')`: the tenant owns the
        // social add-on). Both must pass; `platform_operator` bypasses both.
        // This composition equals the rail's `visibleSurfaceKeys ∋ cplus` AND
        // `canAccessSurface(cplus)` rule, so rail and route never disagree.
        canActivate: [surfaceGuard('cplus'), addOnGuard('cplus_social')],
        data: { title: 'C+ Circle+' },
      },
      {
        path: 'h',
        loadChildren: () =>
          import('./features/surfaces/hplus/hplus.routes').then((m) => m.HPLUS_ROUTES),
        canActivate: [surfaceGuard('hplus')],
        data: { title: 'H+ Hub+' },
      },
      {
        path: 'o',
        loadChildren: () =>
          import('./features/surfaces/oplus/oplus.routes').then((m) => m.OPLUS_ROUTES),
        canActivate: [surfaceGuard('oplus')],
        data: { title: 'O+ Observability+' },
      },
      {
        path: 'r',
        loadChildren: () =>
          import('./features/surfaces/rplus/rplus.routes').then((m) => m.RPLUS_ROUTES),
        canActivate: [surfaceGuard('rplus')],
        // ADR-239 D3 (CHO-2234): inside R+, the exam route family stays open
        // to the surface population while every other child requires
        // delivery:ops, so an exam-ops-only PROCTOR session reaches ONLY Exam
        // Administration, by URL as well as by nav (CHO-2200 no-tab-leak).
        canActivateChild: [rplusOpsGuard],
        data: { title: 'R+ Rhythm+' },
      },

      // ── Shell /home launcher (ADR-240 D1) ──
      // A Group-4 sibling of the five surfaces, carrying authGuard (inherited)
      // but deliberately NO surfaceGuard: a cross-surface launcher gated on a
      // surface would not be surface-agnostic, and one pointing only at surfaces
      // the user cannot enter would be pointless, so it must never strand a
      // session. The post-login landing resolver + a nav entry are H4; H3 mounts
      // the route + the screen (reachable by URL until H4 makes it the home).
      {
        path: 'home',
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
        data: { title: 'Home' },
      },

      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/engagement/routes').then((m) => m.ENGAGEMENT_ROUTES),
      },
      // ── Per-user Knowledge Graph (ADR-143) moved into the A+ surface tree
      // at `/a/map` (ADR-204 §6.3 nav-collapse, 2026-06-29). The canvas routes
      // now live under APLUS_ROUTES; this is the back-compat redirect for
      // bookmarks of the old top-level `/me/knowledge-graph` (mirrors the
      // `/discovery` → KG redirect precedent below).
      {
        // Straight to the live surface. This used to redirect to `a/map`, which
        // ITSELF redirects to `a/knowledge` — a double hop through a route that
        // no longer exists except to redirect away from itself.
        path: 'me/knowledge-graph',
        redirectTo: 'a/knowledge',
        pathMatch: 'full',
      },
      // ── The ADR-143 hexagonal-fog canvas route was DELETED here (2026-07-14).
      //
      // It declared `a/discovery/:atomId` → KgCanvasComponent and had been
      // UNREACHABLE since the WS-F unification: `path: 'a'` is declared earlier
      // with the default `pathMatch: 'prefix'`, so Angular (first-match-wins)
      // sent `/a/discovery/xyz` into APLUS_ROUTES, where `discovery/**` redirects
      // to `/a/knowledge`. This route never ran again.
      //
      // It survived the cull because the comment below it asserted that
      // `features/discovery/kg-canvas` "STAYS (backs a/discovery/:atomId)" — a
      // claim that was false the moment the redirect landed, and which kept 1,276
      // lines of dead canvas compiling into the bundle. The component is gone too.
      {
        path: 'learning',
        loadChildren: () =>
          import('./features/atomic/routes').then((m) => m.ATOMIC_ROUTES),
      },
      // ── Retired `/discovery` (dead graph-discovery UI) → redirect ──────
      // The old DISCOVERY_ROUTES → KnowledgeGraphComponent issued the
      // resolver-less `topicTree` GraphQL query and is long gone. The live KG is
      // the learner-sovereign concept graph at `/a/knowledge` (ADR-212/214/223 —
      // NOT the ADR-143 hexagonal fog, which was demoted to a suggestion engine).
      // Redirect straight there: `a/map` only exists to redirect away from itself.
      // `features/discovery/` is now empty — `kg-canvas` was deleted with the
      // unreachable `a/discovery/:atomId` route it supposedly "backed".
      {
        path: 'discovery',
        redirectTo: 'a/knowledge',
        pathMatch: 'full',
      },
      {
        path: 'choraverse',
        loadChildren: () =>
          import('./features/choraverse/choraverse.routes').then(
            (m) => m.CHORAVERSE_ROUTES,
          ),
        // WS-10: gated OFF until finished + translated (non-routable → /not-found).
        canMatch: [featureReadyGuard('choraverse')],
        canActivate: [addOnGuard('choraverse')],
      },
      {
        path: 'billing',
        loadChildren: () =>
          import('./features/billing/routes').then((m) => m.BILLING_ROUTES),
        canActivate: [addOnGuard('marketplace')],
      },
      {
        path: 'admin',
        loadChildren: () =>
          import('./features/admin/routes').then((m) => m.ADMIN_ROUTES),
        canActivate: [roleGuard('tenant:manage')],
      },
      // ── Phase 29: Remaining service frontends ──
      {
        path: 'parent',
        loadChildren: () =>
          import('./features/parent/routes').then((m) => m.PARENT_ROUTES),
        // WS-10: gated OFF until finished + translated (non-routable → /not-found).
        canMatch: [featureReadyGuard('parent')],
        canActivate: [roleGuard('guardian:view')],
        data: { title: 'Parent Portal' },
      },
      {
        path: 'support',
        loadChildren: () =>
          import('./features/support/routes').then((m) => m.SUPPORT_ROUTES),
        data: { title: 'Support' },
      },
      {
        path: 'community',
        loadChildren: () =>
          import('./features/community/routes').then((m) => m.COMMUNITY_ROUTES),
        data: { title: 'Community' },
      },
      {
        path: 'survey',
        loadChildren: () =>
          import('./features/survey/routes').then((m) => m.SURVEY_ROUTES),
        data: { title: 'Surveys' },
      },
      {
        path: 'admissions',
        loadChildren: () =>
          import('./features/admissions/routes').then((m) => m.ADMISSIONS_ROUTES),
        data: { title: 'Admissions' },
      },
      {
        path: 'search',
        loadChildren: () =>
          import('./features/search/routes').then((m) => m.SEARCH_ROUTES),
        data: { title: 'Search' },
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./features/identity/routes').then((m) => m.SETTINGS_ROUTES),
      },
      {
        // GATED 2026-09-02 (E2 part 3). Same cause as the /admin/onboarding
        // mount: every /api/v1/onboarding/* path is unclaimed by the gateway,
        // so the screen renders a checklist made of 404s. Gating is the honest
        // answer and the established one (WS-10 / CHO-2071); deleting would
        // throw away a real product design that simply has no backend yet.
        path: 'onboarding/checklist',
        loadComponent: () =>
          import('./features/onboarding/components/checklist-view/checklist-view.component').then(
            (m) => m.ChecklistViewComponent,
          ),
        data: { title: 'Onboarding Checklist' },
        canMatch: [featureReadyGuard('onboarding')],
      },
    ],
  },

  // ── Cross-tenant enrollment (pre-auth with token) ──
  {
    path: 'enroll',
    loadChildren: () =>
      import('./features/onboarding/routes').then((m) => m.ENROLLMENT_ROUTES),
    data: { title: 'Join Tenant' },
  },

  // ── Group 5: Error & Not Found ──
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./shared/components/access-denied/access-denied.component').then(
        (m) => m.AccessDeniedComponent,
      ),
  },
  {
    path: 'not-found',
    loadComponent: () =>
      import('./shared/components/not-found/not-found.component').then(
        (m) => m.NotFoundComponent,
      ),
  },
  { path: '**', redirectTo: 'not-found' },
];
