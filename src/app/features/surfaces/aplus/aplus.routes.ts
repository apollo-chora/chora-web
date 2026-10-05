import { Routes } from '@angular/router';

import { roleGuard } from '../../../core/auth/role.guard';
import { featureReadyGuard } from '../../../core/guards/feature-ready.guard';

/**
 * A+ (A-plus) surface route module — Stage 3 wave 3.
 *
 * A+ owns Content Creation + Content Consumption: learner journey
 * (Phyllis 8-step Steps 1, 3-8) + author flows.
 *
 * Wave 1 shipped `/a/login` (passkey sign-in).
 * Wave 2 added catalog / atomic-session / daily-dose.
 * Wave 3 adds:
 *   - `/a/atoms/new`           — Step 3+4: unified authoring canvas (new)
 *   - `/a/atoms/:atomId/edit`  — Step 3+4: legacy single-mode authoring (edit)
 *   - `/a/courses/:courseId`   — Step 6: course detail bridge to enrol
 *   - `/a/dashboard`           — Step 6: multi-role dashboard (Learner/Instructor)
 *   - `/a/companion`            : Eira the Curious profile
 *
 * `/a/dashboard` is surface-owned; the legacy `dashboard` `loadChildren`
 * entry is retained so deep links from older flows don't break.
 */
export const APLUS_ROUTES: Routes = [
  // ── A+ default landing → login (Phyllis Step 1) ─────────────────────
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // ── Step 1: passkey login ───────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./login/aplus-login.component').then((m) => m.AplusLoginComponent),
    data: { title: 'A+ Sign In', surface: 'aplus' },
  },

  // ── Step 5: public courses catalog ──────────────────────────────────
  {
    path: 'catalog',
    loadComponent: () =>
      import('./catalog/catalog.component').then((m) => m.CatalogComponent),
    data: { title: 'A+ | Course Catalog', surface: 'aplus' },
  },

  // ── A+ federated search hub (WS-8) ──────────────────────────────────
  // Federates atom + course + collection search via chora-gateway BFF;
  // 250ms debounce; tabs (All / Atoms / Courses / Collections); recent
  // searches in localStorage `chora.aplus.search.recent`.
  {
    path: 'search',
    loadComponent: () =>
      import('./search/search.component').then((m) => m.SearchComponent),
    data: { title: 'A+ | Search', surface: 'aplus' },
  },

  // ── Course authoring is NOT on A+ ───────────────────────────────────
  // A+ is where a LEARNER browses and takes a course; course create/maintain
  // is R+'s. chora_delivery owns the Course aggregate (architecture.md) and
  // ADR-232 rejected the option that would have put teaching roles on the A+
  // learner surface. No ADR ever placed course authoring here: it arrived via
  // a demo E2E directive (docs/m13/e2e-fe-coord-directive-2026-05-16.md).
  // `courses/new` + `courses/:courseId/edit` now live on R+ as guarded
  // `catalog/new` + `catalog/:courseId/edit`. Guarded there, unlike here: on
  // A+ they carried no canActivate at all, so any authenticated learner
  // reached the authoring form.
  //
  // ── "My Courses" (CHO-2321): the enrolled learner's course list, a Learn
  //    sub-nav destination. Reuses the dashboard aggregator's learnerCourses;
  //    each row opens the existing courses/:courseId/learn content view.
  //    pathMatch 'full' so this bare `courses` never prefix-swallows the
  //    courses/:courseId/* routes below.
  {
    path: 'courses',
    pathMatch: 'full',
    loadComponent: () =>
      import('./my-courses/my-courses.component').then(
        (m) => m.MyCoursesComponent,
      ),
    data: { title: 'A+ | My Courses', surface: 'aplus' },
  },
  // ── CJ#2: Post-Stripe-Checkout success landing — MUST come before
  //    `courses/:courseId` so the static `enrolled` segment matches.
  //    Reads ?session_id query param from Stripe's success_url redirect.
  {
    path: 'courses/:courseId/enrolled',
    loadComponent: () =>
      import('./course-enrolment-success/course-enrolment-success.component').then(
        (m) => m.CourseEnrolmentSuccessComponent,
      ),
    data: { title: 'A+ | Enrolment Confirmed', surface: 'aplus' },
  },
  // ── Open-course shell (Phyllis Step 6→7 bridge) — MUST come before
  //    `courses/:courseId` so the static `learn` segment matches before
  //    the parameterised detail route. Polls
  //    GET /api/v1/me/learning-paths?course_id={id} until the
  //    chora-consumption bootstrap subscriber materialises the path.
  {
    path: 'courses/:courseId/learn',
    loadComponent: () =>
      import('./course-learn/course-learn.component').then(
        (m) => m.CourseLearnComponent,
      ),
    data: { title: 'A+ | Open Course', surface: 'aplus' },
  },

  // ── Step 6: course detail — bridge from catalog to enrol ────────────
  {
    path: 'courses/:courseId',
    loadComponent: () =>
      import('./course-detail/course-detail.component').then(
        (m) => m.CourseDetailComponent,
      ),
    data: { title: 'A+ | Course Detail', surface: 'aplus' },
  },

  // ── Step 7: atomic-session MCQ player ───────────────────────────────
  {
    path: 'atoms/play',
    loadComponent: () =>
      import('./atomic-session/atomic-session.component').then(
        (m) => m.AtomAttemptComponent,
      ),
    data: { title: 'A+ | Atomic Session', surface: 'aplus' },
  },
  {
    path: 'atoms/:atomId/play',
    loadComponent: () =>
      import('./atomic-session/atomic-session.component').then(
        (m) => m.AtomAttemptComponent,
      ),
    data: { title: 'A+ | Atomic Session', surface: 'aplus' },
  },

  // ══ STUDIO (CHO-2215 / CHO-2216) ════════════════════════════════════
  //
  // The A+ authoring surface. It exists because authoring had no INVENTORY and
  // the inventory sat on the learner's dashboard: the sidebar entry labelled
  // "Authoring" pointed at `/a/atoms/new`, a create-a-new-thing FORM. Test sets
  // therefore lived at `/a/atoms/new/test-sets`, and a test set was EDITED at
  // `/a/atoms/new/test-sets/:id/edit` — an edit nested under "new". The atom
  // list was bolted to the compose canvas's footer, capped at 20, unsearchable.
  //
  // Studio is the step 1 the canvas never had. The canvas is a good step 2 and
  // is mounted here UNCHANGED (`studio/atoms/new`); the only thing taken from it
  // is the footer list, which is now `studio/atoms`.
  //
  // Every route is gated on `assessment:author` — the capability the `author`
  // role actually holds. NOT `course:author`, which is admin-only by owner
  // ruling and would lock authors out of their own workspace.
  //
  // Ordering: `studio/atoms/new` MUST precede `studio/atoms/:atomId/...` were
  // one ever added, and the static `studio/test-sets/new` precedes its
  // `:testSetId` sibling, so a param match cannot swallow a literal segment.
  {
    path: 'studio',
    loadComponent: () =>
      import('./studio/studio-home.component').then((m) => m.StudioHomeComponent),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'A+ | Create', surface: 'aplus' },
  },
  {
    path: 'studio/atoms',
    loadComponent: () =>
      import('./studio/studio-atoms.component').then((m) => m.StudioAtomsComponent),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'A+ | Create | Atoms', surface: 'aplus' },
  },
  {
    path: 'studio/atoms/new',
    loadComponent: () =>
      import('./atom-authoring/unified/unified-atom-authoring.component').then(
        (m) => m.UnifiedAtomAuthoringComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'A+ | New Atom', surface: 'aplus' },
  },
  {
    path: 'studio/test-sets',
    loadComponent: () =>
      import('./test-set-editor/test-set-editor.component').then(
        (m) => m.TestSetEditorComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'A+ | Test Sets', surface: 'aplus' },
  },
  {
    path: 'studio/test-sets/new',
    loadComponent: () =>
      import('./test-set-editor/test-set-editor.component').then(
        (m) => m.TestSetEditorComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'A+ | New Test Set', surface: 'aplus' },
  },
  {
    path: 'studio/test-sets/:testSetId/edit',
    loadComponent: () =>
      import('./test-set-editor/test-set-editor.component').then(
        (m) => m.TestSetEditorComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'A+ | Edit Test Set', surface: 'aplus' },
  },
  {
    path: 'studio/question-banks',
    loadComponent: () =>
      import('./question-banks/question-bank-workbench-list.component').then(
        (m) => m.QuestionBankWorkbenchListComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'A+ | Question Banks', surface: 'aplus' },
  },
  {
    path: 'studio/question-banks/:id',
    loadComponent: () =>
      import('./question-banks/question-bank-workbench-detail.component').then(
        (m) => m.QuestionBankWorkbenchDetailComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'A+ | Question Bank', surface: 'aplus' },
  },

  // ── Pre-Studio paths → Studio ───────────────────────────────────────
  // Every old authoring deep-link resolves; none dead-ends. These interpolate
  // their params (the `test-sets/:testSetId/edit` precedent) rather than using
  // the `**`-subtree form the /a/map → /a/knowledge fold uses: a subtree
  // redirect collapses to ONE target, so a bookmark to a specific test set or
  // question bank would silently land on the list having dropped its id. A fold
  // of many surfaces into one can afford that; a rename cannot.
  { path: 'atoms/new', redirectTo: 'studio/atoms/new', pathMatch: 'full' },
  { path: 'atoms/compose', redirectTo: 'studio/atoms/new', pathMatch: 'full' },
  { path: 'atoms/new/test-sets', redirectTo: 'studio/test-sets', pathMatch: 'full' },
  {
    path: 'atoms/new/test-sets/new',
    redirectTo: 'studio/test-sets/new',
    pathMatch: 'full',
  },
  {
    path: 'atoms/new/test-sets/:testSetId/edit',
    redirectTo: 'studio/test-sets/:testSetId/edit',
    pathMatch: 'full',
  },
  { path: 'question-banks', redirectTo: 'studio/question-banks', pathMatch: 'full' },
  {
    path: 'question-banks/:id',
    redirectTo: 'studio/question-banks/:id',
    pathMatch: 'full',
  },

  // ── Step 3 + Step 4: atom authoring (edit) ──────────────────────────
  // The legacy single-mode `AtomAuthoringComponent` survives on the edit route.
  {
    path: 'atoms/:atomId/edit',
    loadComponent: () =>
      import('./atom-authoring/atom-authoring.component').then(
        (m) => m.AtomAuthoringComponent,
      ),
    data: { title: 'A+ | Edit Atom', surface: 'aplus' },
  },

  // ── AtomRevisions timeline (WS-7) — append-only revision history per
  //    ADR-149 + ddd-enforcement §"AtomRevision is append-only". Renders
  //    timeline with per-revision diff. Pending BFF proxy WS-7-BE-A1
  //    (gatewayproxy.go ListAtomRevisions) — currently fails-loud.
  {
    path: 'atoms/:atomId/revisions',
    loadComponent: () =>
      import('./atom-revisions/atom-revisions.component').then(
        (m) => m.AtomRevisionsComponent,
      ),
    data: { title: 'A+ | Atom Revisions', surface: 'aplus' },
  },

  // ── Study hub (CHO-2217) — WS-4 study lists + their source Collections ──
  // `POST /collections/{id}/convert-to-study-list` was live and prod-proven,
  // and its result was unreachable: nothing listed study lists and
  // /a/collections was in no navigation. /a/study is that surface, with a
  // two-tab sub-nav (Study Lists · Collections). Delegates to study.routes.
  {
    path: 'study',
    loadChildren: () => import('./study/study.routes').then((m) => m.STUDY_ROUTES),
    data: { surface: 'aplus' },
  },

  // ── Personal Collections (WS-6b) — MOVED under the Study hub (CHO-2217).
  //    Collections are the SOURCE a study list is derived from, so they live
  //    beside it: the mounts are now /a/study/collections/* (study.routes.ts)
  //    and these paths redirect. Kept so existing bookmarks + deep-links don't
  //    404.
  //
  //    These preserve `:collectionId` (the in-file precedent is
  //    `test-sets/:testSetId/edit`). The /a/map + /a/growth-edges precedent
  //    (`children: [{ path: '**', redirectTo }]`) is deliberately NOT used
  //    here: it drops the param, and those are subtree COLLAPSES onto one
  //    unified surface, whereas this is a lossless MOVE — a bookmark to one
  //    collection must still open that collection, not the list.
  //
  //    Order still matters: the static `new` + the `/edit` suffix must precede
  //    the bare `:collectionId` or the param match swallows them.
  { path: 'collections', redirectTo: 'study/collections', pathMatch: 'full' },
  { path: 'collections/new', redirectTo: 'study/collections/new', pathMatch: 'full' },
  {
    path: 'collections/:collectionId/edit',
    redirectTo: 'study/collections/:collectionId/edit',
    pathMatch: 'full',
  },
  {
    path: 'collections/:collectionId',
    redirectTo: 'study/collections/:collectionId',
    pathMatch: 'full',
  },

  // ── Step 8: daily dose ──────────────────────────────────────────────
  {
    path: 'daily-dose',
    loadComponent: () =>
      import('./daily-dose/daily-dose.component').then(
        (m) => m.DailyDoseComponent,
      ),
    data: { title: 'A+ | Daily Dose', surface: 'aplus' },
  },
  {
    // P5 Far Sight (CHO-2113): the Seeker surface — fact_check / web_research
    // grounded web egress with cited results + the Google Search-Suggestions chip.
    path: 'far-sight',
    loadComponent: () =>
      import('./far-sight/far-sight.component').then((m) => m.FarSightComponent),
    data: { title: 'A+ | Far Sight', surface: 'aplus' },
  },
  // CHO-2045 / ADR-224 — per-KG dose preferences roster (which maps feed the dose).
  {
    path: 'daily-dose/preferences',
    loadComponent: () =>
      import('./daily-dose/preferences/dose-preferences.component').then(
        (m) => m.DosePreferencesComponent,
      ),
    data: { title: 'A+ | Dose Preferences', surface: 'aplus' },
  },

  // ── Growth Edges (Epic-1b W8) — learner-facing weakness view + the
  //    upload entry for a marked-up past test (async multimodal analysis →
  //    chora.consumption.weakness.* → upserted Growth Edges). "Grown" = mastered.
  // ── WS-F unification: Growth Edges folds into My Knowledge (/a/knowledge)
  //    as the "Growth" lens + the Familiar "Diagnose" action. The former
  //    standalone weakness list and the dark graduated diagnose/review doors
  //    all redirect there — every /a/growth-edges deep-link resolves to the
  //    unified surface.
  // ── ADR-205 D4 (CHO-2301): the bounded HITL review panel. Folded away with
  //    the rest of /a/growth-edges in WS-F, but restored because the graduated
  //    (graph-mode) crew has no other door: a run parks at an unconditional
  //    interrupt in AWAITING_REVIEW and `synthesize_edges` runs only AFTER the
  //    learner resumes it, so without this route every graph-mode upload
  //    strands with zero edges written, after charging mana.
  //    This is ONLY the per-upload panel, NOT the retired browsable edge list.
  //    MUST precede the `growth-edges` fold below: Angular resolves first-match,
  //    so the wildcard redirect would otherwise swallow it (a spec pins the
  //    ordering). `:uploadId` binds via withComponentInputBinding.
  {
    path: 'growth-edges/review/:uploadId',
    canMatch: [featureReadyGuard('growth-edge-review')],
    loadComponent: () =>
      import('./growth-edge-review/growth-edge-review.component').then(
        (m) => m.GrowthEdgeReviewComponent,
      ),
    data: { title: 'A+ | Review growth spots', surface: 'aplus' },
  },
  {
    path: 'growth-edges',
    children: [{ path: '**', redirectTo: '/a/knowledge' }],
  },

  // ── WS-F unification: the former ADR-143 atom-KG "Map" folds into My
  //    Knowledge (/a/knowledge). Every /a/map deep-link (+ /manage,
  //    /clusters/:c/explorations/:e, and the app.routes.ts
  //    /me/knowledge-graph → /a/map back-compat) redirects to the unified
  //    surface. Old MapCluster data is lazy-projected as Goals (follow-up).
  {
    path: 'map',
    children: [{ path: '**', redirectTo: '/a/knowledge' }],
  },

  // ── ONE learner wallet (CHO-2238, owner ruling 2026-07-17) — balance +
  //    subsidy breakdown + proactive Stripe top-up (MeManaService.checkoutMana
  //    → POST /api/v1/checkout/user-mana) + the unified transaction timeline
  //    mounted INLINE (shared <chora-transaction-history> at learner scope,
  //    ADR-205). Also the post-Stripe success landing (?mana_topup=success)
  //    which polls /api/v1/me/mana until the async webhook → CreditMana credit
  //    lands. The 402 upsell modal in authoring / familiar-chat stays the
  //    secondary in-context affordance (ADR-142). Star credits (Choraverse,
  //    build-gated) converge HERE when they ship — C+ never re-grows a wallet.
  {
    path: 'wallet',
    loadComponent: () =>
      import('./wallet/wallet.component').then((m) => m.WalletComponent),
    data: { title: 'A+ | Wallet', surface: 'aplus' },
  },
  // Reverses CHO-1886 (wallet → mana-pool): the dir/selector/i18n keys never
  // stopped saying `wallet`, and the page is no longer mana-only. A string
  // redirect preserves query params — an in-flight post-Stripe return through
  // /a/mana-pool?mana_topup=success still lands on the confirming banner
  // (the exact mechanism CHO-1886's own back-compat redirect relied on).
  { path: 'mana-pool', redirectTo: 'wallet', pathMatch: 'full' },
  // The standalone timeline page (ADR-205 / CHO-1944) folded INTO the wallet;
  // bookmarks keep working.
  { path: 'transactions', redirectTo: 'wallet', pathMatch: 'full' },

  // ── The learner's home (UX Track U, plan section 3.2) ────────────────
  //
  // Mounts the SAME component the shell route `/home` mounts. Two mounts, one
  // screen, deliberately, and this is the orchestrator's Q1 ruling rather than
  // a drift:
  //
  //  - `/a/home` is the learner's home. It sits inside the A+ surface, so it
  //    carries `surfaceGuard('aplus')` from the parent group and wears the A+
  //    shell (compass, HUD, dock) like every other A+ screen. The landing
  //    resolver sends any session that HOLDS A+ here.
  //  - `/home` stays exactly as ADR-240 D1 built it: a Group-4 shell sibling
  //    with NO surfaceGuard, which is the property that lets it never strand a
  //    session. The resolver sends a session with no usable surface THERE, and
  //    the launcher offers whatever that session can still reach.
  //
  // So this is not a redirect in either direction, and `/home` is not retired.
  // ADR-240 D1's safety property is intact and needs no amendment; what changes
  // is only which door a session holding A+ is shown.
  //
  // The component is C1b's (`features/home/**`) and is not edited from here.
  {
    path: 'home',
    loadComponent: () =>
      import('../../home/home.component').then((m) => m.HomeComponent),
    data: { title: 'A+ | Home', surface: 'aplus' },
  },

  // ── Step 6 follow-up: surface-owned multi-role dashboard ────────────
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
    // "Learning", not "My Courses": this route is the learner HUB (goals,
    // companions, the dose, courses AND study lists). Calling it My Courses
    // made "courses" the name of three different things on one page — the h1,
    // the Continue-learning feed, and the Teaching signpost. It used to match
    // the A+ sidebar entry that landed here; that sidebar, its config and its
    // label key were all retired in C2 slice 3, and the compass reaches this
    // hub through Home and Courses instead.
    data: { title: 'A+ | Learn', surface: 'aplus' },
  },

  // ── Companion profile (ADR-149 growth-state view) ────────────────────
  // /a/companion/marketplace → Pod marketplace (IMDA D2 odds disclosure)
  // /a/companion → active Companion (ActiveFamiliarService).
  // /a/companion/:familiarId → specific Companion.
  // Stripe Checkout return legs (CHO-2028): chora-tenancy's
  // STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL redirect here after Pod
  // checkout, and without these routes both legs 404 to /not-found.
  //
  // C0: ADR-254 renamed the Familiar to the Companion, so the letters a
  // learner types follow. The PARAMETER stays `:familiarId` on purpose:
  // withComponentInputBinding binds it to `familiarId` inputs on six
  // components, and renaming the segment alone would break every binding.
  // Component, file and API names keep the word familiar; only routes,
  // links and learner-facing copy move. Every old path is left behind as a
  // parameter-preserving redirect, declared in the same order, just below.
  {
    path: 'companion/marketplace/checkout/success',
    loadComponent: () =>
      import(
        './familiar-checkout-result/familiar-checkout-result.component'
      ).then((m) => m.FamiliarCheckoutResultComponent),
    data: {
      title: 'A+ | Pod Checkout Complete',
      surface: 'aplus',
      outcome: 'success',
    },
  },
  {
    path: 'companion/marketplace/checkout/cancel',
    loadComponent: () =>
      import(
        './familiar-checkout-result/familiar-checkout-result.component'
      ).then((m) => m.FamiliarCheckoutResultComponent),
    data: {
      title: 'A+ | Pod Checkout Cancelled',
      surface: 'aplus',
      outcome: 'cancel',
    },
  },
  {
    path: 'companion/marketplace',
    loadComponent: () =>
      import('./familiar-marketplace/familiar-marketplace.component').then(
        (m) => m.FamiliarMarketplaceComponent,
      ),
    data: { title: 'A+ | Companion Marketplace', surface: 'aplus' },
  },
  {
    path: 'companion/egg/:familiarId',
    loadComponent: () =>
      import('./familiar-egg/familiar-egg.component').then(
        (m) => m.FamiliarEggComponent,
      ),
    data: { title: 'A+ | Your Pod', surface: 'aplus' },
  },
  {
    path: 'companion/hatching/:familiarId',
    loadComponent: () =>
      import('./familiar-hatching/familiar-hatching.component').then(
        (m) => m.FamiliarHatchingComponent,
      ),
    data: { title: 'A+ | Hatching Ceremony', surface: 'aplus' },
  },
  {
    path: 'companion',
    loadComponent: () =>
      import('./familiar/familiar.component').then(
        (m) => m.FamiliarComponent,
      ),
    data: { title: 'A+ | Companion', surface: 'aplus' },
  },
  {
    path: 'companion/:familiarId',
    loadComponent: () =>
      import('./familiar/familiar.component').then(
        (m) => m.FamiliarComponent,
      ),
    data: { title: 'A+ | Companion', surface: 'aplus' },
  },
  {
    path: 'companion/:familiarId/chat',
    loadComponent: () =>
      import('./familiar-chat/familiar-chat.component').then(
        (m) => m.FamiliarChatComponent,
      ),
    data: { title: 'A+ | Companion Chat', surface: 'aplus' },
  },
  {
    path: 'companion/:familiarId/growth-log',
    loadComponent: () =>
      import('./familiar-growth-log/familiar-growth-log.component').then(
        (m) => m.FamiliarGrowthLogComponent,
      ),
    data: { title: 'A+ | Companion Growth Log', surface: 'aplus' },
  },
  // ── The Grimoire — learner Familiar-design surface (CHO-2016 / ADR-219) ──
  // 3-tab builder (Persona · Loadout · Rituals) with progressive unlock. The
  // `:familiarId` binds to the component's signal input via
  // withComponentInputBinding. Persona tab lands with CHO-2015.
  {
    path: 'companion/:familiarId/design',
    loadComponent: () =>
      import('./familiar-design/grimoire-design.component').then(
        (m) => m.GrimoireDesignComponent,
      ),
    data: { title: 'A+ | Grimoire', surface: 'aplus' },
  },

  // ── C0 legacy /a/companion/* paths. Every one is a permanent, parameter
  //    PRESERVING redirect, in the same declaration order as the mounts
  //    above: the static and suffixed paths come before `familiar/:familiarId`
  //    or Angular's first-match would resolve `familiar/marketplace` as a
  //    companion id and serve the wrong screen. A `children: ['**']` fold
  //    would be shorter and wrong, because it drops the id and lands every
  //    bookmarked companion on the active one.
  {
    path: 'familiar/marketplace/checkout/success',
    redirectTo: 'companion/marketplace/checkout/success',
    pathMatch: 'full',
  },
  {
    path: 'familiar/marketplace/checkout/cancel',
    redirectTo: 'companion/marketplace/checkout/cancel',
    pathMatch: 'full',
  },
  { path: 'familiar/marketplace', redirectTo: 'companion/marketplace', pathMatch: 'full' },
  {
    path: 'familiar/egg/:familiarId',
    redirectTo: 'companion/egg/:familiarId',
    pathMatch: 'full',
  },
  {
    path: 'familiar/hatching/:familiarId',
    redirectTo: 'companion/hatching/:familiarId',
    pathMatch: 'full',
  },
  { path: 'familiar', redirectTo: 'companion', pathMatch: 'full' },
  {
    path: 'familiar/:familiarId',
    redirectTo: 'companion/:familiarId',
    pathMatch: 'full',
  },
  {
    path: 'familiar/:familiarId/chat',
    redirectTo: 'companion/:familiarId/chat',
    pathMatch: 'full',
  },
  {
    path: 'familiar/:familiarId/growth-log',
    redirectTo: 'companion/:familiarId/growth-log',
    pathMatch: 'full',
  },
  {
    path: 'familiar/:familiarId/design',
    redirectTo: 'companion/:familiarId/design',
    pathMatch: 'full',
  },

  // ── ADR-155 Phase X — the oldest test-set paths. These pointed at
  //    /a/atoms/new/test-sets/* (the 2026-05-16 move under the Authoring hub);
  //    they now point straight at Studio rather than redirecting to a redirect.
  { path: 'test-sets', redirectTo: 'studio/test-sets', pathMatch: 'full' },
  { path: 'test-sets/new', redirectTo: 'studio/test-sets/new', pathMatch: 'full' },
  {
    path: 'test-sets/:testSetId/edit',
    redirectTo: 'studio/test-sets/:testSetId/edit',
    pathMatch: 'full',
  },

  // ── ADR-155 Phase X — Learner submission flow (A+ dogfood path) ─────
  // Delegates to me-assessments.routes for list / detail / result mounts.
  {
    path: 'me/assessments',
    loadChildren: () =>
      import('./me-assessments/me-assessments.routes').then(
        (m) => m.ME_ASSESSMENTS_ROUTES,
      ),
    data: { surface: 'aplus' },
  },

  // ── W6 outcome spine — per-learner transcript (self, gcid-scoped) ───
  // Delegates to me-transcript.routes for the learner's own transcript list
  // (GET /api/v1/me/transcript). Auth is enforced by the parent `/a` shell
  // (authGuard + surfaceGuard('aplus') in app.routes.ts), mirroring
  // me/assessments — no additional per-route guard needed.
  {
    path: 'me/transcript',
    loadChildren: () =>
      import('./me-transcript/me-transcript.routes').then(
        (m) => m.ME_TRANSCRIPT_ROUTES,
      ),
    data: { surface: 'aplus' },
  },

  // ── Legacy delegates — kept for in-progress migration ───────────────
  {
    path: 'learning',
    loadChildren: () =>
      import('../../atomic/routes').then((m) => m.ATOMIC_ROUTES),
    data: { surface: 'aplus', title: 'A+ Learning' },
  },
  // ── "My Knowledge" unification (ADR-212 / CHO-2005, epic CHO-2004) ───
  //    L0 Atlas ("My Knowledge" home) + interim L1. DARK: reachable by URL
  //    only — NO sidebar entry yet (the nav collapse of Discovery + Map into
  //    one "My Knowledge" entry is WS-F's single cutover). The Atlas lists the
  //    learner's maps (each a Goal, ADR-214); "Continue" deep-links to the
  //    per-map canvas at `knowledge/:goalId` — the WS-C unified map canvas
  //    (`MapCanvasComponent`): a directly-manipulable hex fisheye over the
  //    map's sovereign concept sub-graph (trail/Back, overflow drawer, atom
  //    picker, provenance badges, create/connect/make-root). `:goalId` binds
  //    to the component's `goalId` signal input (withComponentInputBinding).
  //    Static `knowledge` precedes the param route. Guard/data shape mirrors
  //    `/a/discovery` (no extra guard).
  // ── The Roster (C3, plan section 3.2 row U2) ─────────────────────────
  //    The party: every companion held, where it is stationed, what it earns
  //    next, and the idle pod. Mounted here rather than left to Track C, whose
  //    coordinator session is not live: a screen with no route is not a screen.
  {
    path: 'roster',
    loadComponent: () =>
      import('./roster/roster.component').then((m) => m.RosterComponent),
    data: { title: 'A+ | Roster', surface: 'aplus' },
  },
  {
    path: 'knowledge',
    loadComponent: () =>
      import('./my-knowledge/my-knowledge.component').then(
        (m) => m.MyKnowledgeComponent,
      ),
    data: { title: 'A+ | Discover', surface: 'aplus' },
  },
  {
    path: 'knowledge/:goalId',
    loadComponent: () =>
      import('./my-knowledge/map-canvas/map-canvas.component').then(
        (m) => m.MapCanvasComponent,
      ),
    data: { title: 'A+ | Discover', surface: 'aplus' },
  },

  // ── WS-F unification: the ADR-212 sovereign concept graph was rebuilt as
  //    My Knowledge (/a/knowledge — MyKnowledgeComponent + MapCanvasComponent).
  //    The old /a/discovery mount (+ /discovery/familiar) redirects there.
  {
    path: 'discovery',
    children: [{ path: '**', redirectTo: '/a/knowledge' }],
  },
];
