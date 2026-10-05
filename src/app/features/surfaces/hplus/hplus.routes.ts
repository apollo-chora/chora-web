/**
 * H+ (Hub+) surface routes — Stage 3 wave 3.
 *
 * Mounted under `/h/*` by the main app routes module. Wave 1 shipped
 * Tenant Overview (Phyllis Step 2 landing). Wave 2 promoted three
 * placeholder redirects to real lazy-loaded components (branding /
 * addons / marketplace). Wave 3 closes out the remaining three:
 *
 *   - `/h/members` → MembersComponent (TenantMembership roster + invite)
 *   - `/h/idp`     → IdpFederationComponent (4 IdP cards — MS/Google/Singpass/SAML)
 *   - `/h/billing` → BillingComponent (plan + payment + breakdown + invoices)
 *
 * Every H+ destination now resolves to a real component — no more stubs.
 */
import type { Routes } from '@angular/router';
import { platformOperatorGuard } from '../../../core/auth/platform-operator.guard';
import { roleGuard } from '../../../core/auth/role.guard';

export const HPLUS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'tenant',
  },
  {
    path: 'tenant',
    loadComponent: () =>
      import('./tenant-overview/tenant-overview.component').then(
        (m) => m.TenantOverviewComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Tenant Overview' },
  },
  // UX refactor Phase E, package E2 part 2a. S1 instance readiness.
  //
  // Its own route rather than a section of /h/tenant: the two screens change
  // for different reasons, and folding S1 in would put the readiness work and
  // the Phase E retirement diff in one file. S6 (/h/go-live) renders the same
  // report with different framing from the same service.
  {
    path: 'ready',
    loadComponent: () =>
      import('./readiness/instance-readiness.component').then(
        (m) => m.InstanceReadinessComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Instance Readiness' },
  },
  // UX refactor Phase E, package E2 part 2b. S6 go-live check.
  //
  // The same readiness report as /h/ready, asked as a different question, from
  // the same service. It replaces /admin/tenant/settings/go-live, whose five
  // gateway paths were never claimed and could only 404, and whose payment
  // test could show a tick or a cross for a row nobody can check.
  {
    path: 'go-live',
    loadComponent: () =>
      import('./readiness/go-live-check.component').then(
        (m) => m.GoLiveCheckComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Go-Live Check' },
  },
  // UX refactor Phase E, package E5. The 4-step setup wizard, re-parented
  // from /admin/tenant/settings/wizard so the whole first-launch flow lives
  // on one surface.
  //
  // The COMPONENT deliberately stays under features/admin/tenant-admin: it has
  // eight relative imports into that tree's services and models, and moving
  // the files would trade one odd location for eight cross-surface imports.
  // What re-parents is the mount, which is what an operator experiences.
  //
  // platformOperatorGuard MOVES WITH IT. Under /admin the wizard inherited an
  // operator gate; the /h parent applies only authGuard, so dropping this
  // would silently open a whole organisation's configuration to any tenant
  // admin. A spec asserts the guard is present and refuses a tenant admin.
  //
  // Route name: /h/setup, superseding the first-launch spec's proposed
  // /h/tenants/:tenantId/setup. The wizard takes its tenant from the session,
  // never a route param, so the parametric form would carry an id nothing
  // reads, and /h/setup matches its /h/tenant, /h/ready and /h/go-live peers.
  {
    path: 'setup',
    loadComponent: () =>
      import(
        '../../admin/tenant-admin/components/setup-wizard/setup-wizard.component'
      ).then((m) => m.SetupWizardComponent),
    canActivate: [platformOperatorGuard],
    data: { surface: 'hplus', title: 'H+ | Setup' },
  },
  {
    path: 'branding',
    loadComponent: () =>
      import('./branding/branding-configuration.component').then(
        (m) => m.BrandingConfigurationComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Branding & Configuration' },
  },
  {
    path: 'addons/:addonPlanId/usage',
    loadComponent: () =>
      import('./addons/addon-usage.component').then(
        (m) => m.AddonUsageComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Add-On Usage' },
  },
  {
    path: 'addons/:addonPlanId/change-tier',
    loadComponent: () =>
      import('./addons/addon-change-tier.component').then(
        (m) => m.AddonChangeTierComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Change Tier' },
  },
  {
    path: 'addons/:addonPlanId/detail',
    loadComponent: () =>
      import('./addons/addon-marketplace-detail.component').then(
        (m) => m.AddonMarketplaceDetailComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Add-On Detail' },
  },
  {
    path: 'addons',
    loadComponent: () =>
      import('./addons/addon-management.component').then(
        (m) => m.AddonManagementComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Add-On Management' },
  },
  {
    path: 'marketplace',
    loadComponent: () =>
      import('./marketplace/addon-marketplace.component').then(
        (m) => m.AddonMarketplaceComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Add-On Marketplace' },
  },
  // ── Wave 3 — promoted from redirect to real component ───────────────
  {
    path: 'members',
    loadComponent: () =>
      import('./members/members.component').then((m) => m.MembersComponent),
    data: { surface: 'hplus', title: 'H+ | Members' },
  },
  {
    path: 'idp',
    loadComponent: () =>
      import('./idp/idp-federation.component').then(
        (m) => m.IdpFederationComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Identity Provider Federation' },
  },
  {
    path: 'billing',
    loadComponent: () =>
      import('./billing/billing.component').then((m) => m.BillingComponent),
    data: { surface: 'hplus', title: 'H+ | Billing & Invoices' },
  },
  // ── Per ADR-149 H+ admin egg catalog (IMDA D2 audit surface) ──────
  {
    path: 'marketplace/companion-eggs',
    loadComponent: () =>
      import('./familiar-eggs/familiar-eggs.component').then(
        (m) => m.FamiliarEggsComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Companion Pod Catalog' },
  },
  {
    path: 'marketplace/companion-eggs/:sku',
    loadComponent: () =>
      import('./familiar-eggs-edit/familiar-eggs-edit.component').then(
        (m) => m.FamiliarEggsEditComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Edit Pod SKU' },
  },
  // ── C0 legacy /h/marketplace/companion-eggs paths. ADR-254 renamed the
  //    Familiar to the Companion; the component and file names keep the old
  //    word, only the path moves. Parameter preserving, so a bookmarked SKU
  //    editor still opens that SKU. These MUST also sit above
  //    `:addonPlanId`, or the old path resolves as an add-on id and the
  //    redirect never runs.
  {
    path: 'marketplace/familiar-eggs',
    redirectTo: 'marketplace/companion-eggs',
    pathMatch: 'full',
  },
  {
    path: 'marketplace/familiar-eggs/:sku',
    redirectTo: 'marketplace/companion-eggs/:sku',
    pathMatch: 'full',
  },

  // ── CHO-1735 — H+ Marketplace catalog detail (tile click target) ───
  // MUST be declared AFTER the companion-eggs routes AND their legacy
  // redirects above, so the static segments win over the `:addonPlanId`
  // parametric.
  {
    path: 'marketplace/:addonPlanId',
    loadComponent: () =>
      import(
        './marketplace/addon-marketplace-catalog-detail.component'
      ).then((m) => m.AddonMarketplaceCatalogDetailComponent),
    data: { surface: 'hplus', title: 'H+ | Add-On Catalog Detail' },
  },
  // ── Per ADR-143 USR-H-KG-1 — tenant KG fog config form ─────────────
  {
    path: 'knowledge-graph',
    loadComponent: () =>
      import('./kg-config/hplus-kg-config.component').then(
        (m) => m.HplusKgConfigComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Knowledge Graph' },
  },
  {
    path: 'tenants/:tenantId/knowledge-graph',
    loadComponent: () =>
      import('./kg-config/hplus-kg-config.component').then(
        (m) => m.HplusKgConfigComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Knowledge Graph' },
  },
  // ── CHO-1709 WP-4 — tenant mana pool (ADR-142 tenant subsidy) ──────
  // Pool card + create-if-absent + monthly auto-renew quota + Stripe
  // top-up packs. Parent /h route already applies authGuard.
  {
    path: 'mana',
    loadComponent: () =>
      import('./mana/mana-pool.component').then((m) => m.ManaPoolComponent),
    data: { surface: 'hplus', title: 'H+ | Mana Pool' },
  },
  // ── Wave A3 — tenant-admin Transaction History (Payments) ─────────
  // Cross-aggregate (5 V1 Purchase aggregates) cursor-paginated view
  // with SSE in-place updates + refund + CSV/JSON export. Operator-only
  // cross-tenant column gated by role claim per integrative-UI principle.
  // Parent /h route already applies authGuard; the role gate here adds
  // the capability check (`tenant:view_payments` — coined by A5).
  {
    path: 'transactions',
    loadComponent: () =>
      import('./transactions/transactions.component').then(
        (m) => m.TransactionsComponent,
      ),
    canActivate: [roleGuard('tenant:view_payments')],
    data: { surface: 'hplus', title: 'H+ | Transactions' },
  },
  // ── UX Track U, package E1 (screen S2) — create an organisation.
  // POST /api/v1/tenancy/sub-tenants is operator-gated at the gateway and
  // that gate is the real one: chora-tenancy's CreateSubTenant does no role
  // check of its own. platformOperatorGuard is defence in depth plus an
  // honest dead-end: without it a tenant admin reaches a form whose every
  // submission can only 403.
  //
  // Ordering is not load-bearing against the `tenants/:tenantId/knowledge-graph`
  // sibling above: that route is three segments and this one is two, so
  // /h/tenants/new cannot match it whichever comes first.
  {
    path: 'tenants/new',
    loadComponent: () =>
      import('./tenants-new/create-tenant.component').then(
        (m) => m.CreateTenantComponent,
      ),
    canActivate: [platformOperatorGuard],
    data: { surface: 'hplus', title: 'H+ | Create Organisation' },
  },
  // UX Track U, package E3 (screens S7a to S7c): ownership handover.
  //
  // No route guard beyond the parent's authGuard + surfaceGuard('hplus'), and
  // that is deliberate rather than an omission. Three different people
  // legitimately open this screen: the current owner (to hand over), the
  // nominee (to accept or decline), and a platform operator (to assign an
  // owner who has gone). A role guard tight enough to exclude the wrong people
  // would exclude the nominee, who is an ordinary member until they accept.
  //
  // The gates that matter are server-side and unavoidable: chora-tenancy
  // checks the live owner row inside the write transaction, checks the offer
  // row for the answer verbs, and requires platform_operator on the override.
  // The screen shows an ordinary admin why they cannot act rather than a form
  // whose every submission can only 403.
  {
    path: 'ownership',
    loadComponent: () =>
      import('./ownership/ownership.component').then((m) => m.OwnershipComponent),
    data: { surface: 'hplus', title: 'H+ | Ownership' },
  },
  // ── CHO-2148 — tenant external web-egress entitlement (Far Sight opt-in).
  // ADR-220 D4 / ADR-231 D6 / PLAN.md §4.2.4. The Tenant Admin decides whether
  // this tenant's learners may reach the OPEN WEB via the Seeker grounded-search
  // egress. Default-deny: a tenant with no policy row is OFF, which is how
  // franchise tenants (schools, minors) stay safe with no seeding.
  //
  // No extra route guard: the parent /h route already applies authGuard +
  // surfaceGuard('hplus'), and chora-tenancy enforces the tenant-admin role on
  // the mesh header FAIL-CLOSED. The API is the gate; the nav only hides it.
  {
    path: 'external-egress',
    loadComponent: () =>
      import('./external-egress/hplus-external-egress.component').then(
        (m) => m.HplusExternalEgressComponent,
      ),
    data: { surface: 'hplus', title: 'H+ | Web Access' },
  },
];
