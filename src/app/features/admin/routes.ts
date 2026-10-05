import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { featureReadyGuard } from '../../core/guards/feature-ready.guard';
import { roleGuard } from '../../core/auth/role.guard';
import { addOnGuard } from '../../core/auth/add-on.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'content/atoms',
    pathMatch: 'full',
  },
  {
    path: 'content/atoms',
    loadComponent: () =>
      import('./content-authoring/components/atom-list/atom-list.component').then(
        (m) => m.AtomListComponent,
      ),
    data: { title: 'Manage Atoms' },
  },
  {
    path: 'content/atoms/new',
    loadComponent: () =>
      import('./content-authoring/components/atom-editor/atom-editor.component').then(
        (m) => m.AtomEditorComponent,
      ),
    data: { title: 'Create Atom' },
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'content/atoms/:id/edit',
    loadComponent: () =>
      import('./content-authoring/components/atom-editor/atom-editor.component').then(
        (m) => m.AtomEditorComponent,
      ),
    data: { title: 'Edit Atom' },
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'content/topics',
    loadComponent: () =>
      import('./content-authoring/components/topic-tree/topic-tree.component').then(
        (m) => m.TopicTreeComponent,
      ),
    data: { title: 'Manage Topics' },
  },
  {
    path: 'content/assessments/new',
    loadComponent: () =>
      import('./content-authoring/components/assessment-builder/assessment-builder.component').then(
        (m) => m.AssessmentBuilderComponent,
      ),
    data: { title: 'Create Assessment' },
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'content/assessments/:id/edit',
    loadComponent: () =>
      import('./content-authoring/components/assessment-builder/assessment-builder.component').then(
        (m) => m.AssessmentBuilderComponent,
      ),
    data: { title: 'Edit Assessment' },
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'content/paths/new',
    loadComponent: () =>
      import('./content-authoring/components/path-builder/path-builder.component').then(
        (m) => m.PathBuilderComponent,
      ),
    data: { title: 'Create Path' },
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'content/paths/:id/edit',
    loadComponent: () =>
      import('./content-authoring/components/path-builder/path-builder.component').then(
        (m) => m.PathBuilderComponent,
      ),
    data: { title: 'Edit Path' },
    canDeactivate: [unsavedChangesGuard],
  },
  // -------------------------------------------------------------------------
  // Content Authoring — Phase 45 Enhancements
  // -------------------------------------------------------------------------
  {
    path: 'content/topics/density',
    loadComponent: () =>
      import('./content-authoring/components/topic-density-heatmap/topic-density-heatmap.component').then(
        (m) => m.TopicDensityHeatmapComponent,
      ),
    data: { title: 'Topic Density' },
  },
  {
    path: 'content/atoms/:id/edit-split',
    loadComponent: () =>
      import('./content-authoring/components/atom-editor-split-pane/atom-editor-split-pane.component').then(
        (m) => m.AtomEditorSplitPaneComponent,
      ),
    data: { title: 'Split Editor' },
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'content/moderation',
    loadComponent: () =>
      import('./content-authoring/components/content-approval/content-approval.component').then(
        (m) => m.ContentApprovalComponent,
      ),
    data: { title: 'Content Moderation' },
  },
  // -------------------------------------------------------------------------
  // Tenant Admin
  // -------------------------------------------------------------------------
  {
    path: 'content/transfer',
    loadComponent: () =>
      import('./tenant-admin/components/content-transfer/content-transfer.component').then(
        (m) => m.ContentTransferComponent,
      ),
    data: { title: 'Transfer Content' },
    canActivate: [roleGuard('tenant_admin')],
  },
  // -------------------------------------------------------------------------
  // RETIRED 2026-09-02, UX refactor Phase E package E2 part 3.
  //
  // tenant/users, tenant/entitlements, tenant/invitations, tenant/roles and
  // tenant/members/add are gone. Every one called a gateway path that does not
  // exist, so each was a hard 404 behind a working-looking link, and every one
  // duplicates an H+ screen that does the job for real:
  //
  //   tenant/users        -> /h/members
  //   tenant/invitations  -> /h/members pending-invites panel
  //   tenant/roles        -> /h/members (the whole /api/v1/iam/ prefix is unclaimed)
  //   tenant/members/add  -> the /h/members invite modal
  //   tenant/entitlements -> /h/addons, which phyllis_handler.go actually serves
  //
  // Their component directories are deliberately still on disk: deleting them
  // would orphan three of the six tenant-admin services that E1 item 4b is
  // mid-fix on. That sweep is sequenced after E1, not skipped.
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Governance Admin (governance_trust add-on)
  // -------------------------------------------------------------------------
  {
    path: 'governance',
    loadChildren: () =>
      import('./governance/routes').then((m) => m.GOVERNANCE_ROUTES),
    canActivate: [addOnGuard('governance_trust')],
    data: { title: 'Governance' },
  },
  // -------------------------------------------------------------------------
  // Communication Admin
  // -------------------------------------------------------------------------
  {
    path: 'communication',
    loadChildren: () =>
      import('./communication/routes').then((m) => m.COMMUNICATION_ROUTES),
    data: { title: 'Communication' },
  },
  // -------------------------------------------------------------------------
  // Investigation & Observability (super_admin only)
  // -------------------------------------------------------------------------
  {
    path: 'investigation',
    loadChildren: () =>
      import('./investigation/routes').then((m) => m.INVESTIGATION_ROUTES),
    // canActivate: [roleGuard('super_admin')],
    // WS-10 fail-loud (CHO-2071): InvestigationService renders fabricated
    // service-health / error-log / incident MOCK_* data (no real BFF) — gated
    // OFF (non-routable → /not-found) until the Cloud Logging / incident BFF
    // endpoints exist. Empty in environment.local.ts so devs can still preview.
    canMatch: [featureReadyGuard('investigation')],
    data: { title: 'Investigation Workspace' },
  },
  // -------------------------------------------------------------------------
  // Developer Console (super_admin only)
  // -------------------------------------------------------------------------
  {
    path: 'developer',
    loadChildren: () =>
      import('./developer/routes').then((m) => m.DEVELOPER_ROUTES),
    canActivate: [roleGuard('super_admin')],
    // WS-10 fail-loud (CHO-2071): DeveloperService returns fabricated request-log
    // / feature-flag / RLS-context / event-bus MOCK_* data (BffClientService
    // commented out) — gated OFF until the gateway developer APIs exist.
    canMatch: [featureReadyGuard('developer')],
    data: { title: 'Developer Console' },
  },
  // -------------------------------------------------------------------------
  // Agent Monitoring (super_admin only)
  // -------------------------------------------------------------------------
  {
    path: 'agents/monitoring',
    loadChildren: () =>
      import('./agent-monitoring/routes').then((m) => m.AGENT_MONITORING_ROUTES),
    canActivate: [roleGuard('super_admin')],
    data: { title: 'Agent Monitoring' },
  },
  // -------------------------------------------------------------------------
  // Content Translation
  // -------------------------------------------------------------------------
  {
    path: 'content/translation',
    loadChildren: () =>
      import('./content-translation/routes').then((m) => m.TRANSLATION_ROUTES),
    data: { title: 'Content Translation' },
  },
  // -------------------------------------------------------------------------
  // Analytics Insights
  // -------------------------------------------------------------------------
  {
    path: 'analytics/insights',
    loadChildren: () =>
      import('./analytics-insights/routes').then((m) => m.ANALYTICS_INSIGHTS_ROUTES),
    data: { title: 'Analytics Insights' },
  },
  // -------------------------------------------------------------------------
  // Agent Explainability (governance_trust add-on)
  // -------------------------------------------------------------------------
  {
    path: 'governance/explainability',
    loadChildren: () =>
      import('./agent-explainability/routes').then((m) => m.EXPLAINABILITY_ROUTES),
    canActivate: [addOnGuard('governance_trust')],
    data: { title: 'Agent Explainability' },
  },
  // -------------------------------------------------------------------------
  // Admissions Admin
  // -------------------------------------------------------------------------
  {
    path: 'admissions',
    loadChildren: () =>
      import('./admissions/routes').then((m) => m.ADMISSIONS_ADMIN_ROUTES),
    data: { title: 'Admissions' },
  },
  // -------------------------------------------------------------------------
  // A2A Gateway (a2a_gateway add-on, platform_ops only)
  // -------------------------------------------------------------------------
  {
    path: 'a2a',
    loadChildren: () =>
      import('./a2a/routes').then((m) => m.A2A_ROUTES),
    canActivate: [roleGuard('platform_ops')],
    data: { title: 'A2A Partners' },
  },
  // -------------------------------------------------------------------------
  // Onboarding Admin
  // -------------------------------------------------------------------------
  {
    // GATED 2026-09-02 (E2 part 3). Learner-onboarding checklists are a real
    // product idea with no backend: every /api/v1/onboarding/* path is
    // unclaimed. Gating is the honest answer and the established one (WS-10 /
    // CHO-2071 did exactly this for investigation, developer, economy and
    // moderation); deleting would throw away the design.
    path: 'onboarding',
    loadChildren: () =>
      import('./onboarding/routes').then((m) => m.ONBOARDING_ADMIN_ROUTES),
    data: { title: 'Onboarding' },
    canMatch: [featureReadyGuard('onboarding')],
  },
  // -------------------------------------------------------------------------
  // Tenant Setup Wizard — PLATFORM_OPERATOR only (auth-hardening Phase A
  // §4.7d, CHO-1717 / ADR-181 ruling #5: private tenant creation is
  // operator-only). The parent /admin mount's roleGuard('tenant:manage')
  // still applies; this guard additionally requires the platform_operator
  // role claim (case-insensitive) in the session JWT.
  // -------------------------------------------------------------------------
  {
    // MOVED 2026-09-02 (E5) to /h/setup, so the whole first-launch flow lives
    // on one surface. A redirect rather than a deletion: the path is linked
    // from the tenant-creation success state and from older docs. The operator
    // gate travels with the route to its new home, not with this redirect.
    path: 'tenant/settings/wizard',
    redirectTo: '/h/setup',
    pathMatch: 'full',
  },
  // -------------------------------------------------------------------------
  // Go-Live Readiness
  // -------------------------------------------------------------------------
  {
    // REPLACED 2026-09-02 (E2 part 3). GoLiveChecklistComponent called five
    // /api/v1/tenants/go-live/test/* paths the gateway never claimed, so every
    // check was a hard 404 rendered as a checklist. Worse, its payment test
    // could only show a tick or a cross for a row nobody can check.
    //
    // A redirect rather than a deletion: the path is linked from older docs and
    // bookmarks, and landing an admin on the real screen beats a 404.
    path: 'tenant/settings/go-live',
    redirectTo: '/h/go-live',
    pathMatch: 'full',
  },
  // -------------------------------------------------------------------------
  // Training Admin
  // -------------------------------------------------------------------------
  {
    path: 'training',
    loadChildren: () =>
      import('./training/routes').then((m) => m.TRAINING_ADMIN_ROUTES),
    data: { title: 'Training Administration' },
  },
  // -------------------------------------------------------------------------
  // Support Admin
  // -------------------------------------------------------------------------
  {
    path: 'support',
    loadChildren: () =>
      import('./support/routes').then((m) => m.SUPPORT_ADMIN_ROUTES),
    data: { title: 'Support Admin' },
  },
  // -------------------------------------------------------------------------
  // RBAC — User Access Matrix (tenant_admin only)
  // -------------------------------------------------------------------------
  {
    path: 'rbac',
    loadChildren: () =>
      import('./rbac/routes').then((m) => m.RBAC_ROUTES),
    canActivate: [roleGuard('tenant_admin')],
    data: { title: 'User Access Matrix' },
  },
  // -------------------------------------------------------------------------
  // Account Lifecycle Management (tenant_admin only)
  // -------------------------------------------------------------------------
  {
    path: 'accounts',
    loadChildren: () =>
      import('./account-lifecycle/routes').then((m) => m.ACCOUNT_LIFECYCLE_ROUTES),
    canActivate: [roleGuard('tenant_admin')],
    data: { title: 'Account Management' },
  },
  // -------------------------------------------------------------------------
  // Economy Admin (learner_engagement add-on, tenant_admin only)
  // -------------------------------------------------------------------------
  {
    path: 'economy',
    loadChildren: () =>
      import('./economy/routes').then((m) => m.ECONOMY_ROUTES),
    canActivate: [addOnGuard('learner_engagement'), roleGuard('tenant_admin')],
    // WS-10 fail-loud (CHO-2071): EconomyAdminService returns fabricated
    // MOCK_CONFIGS (fog thresholds / elo / drop-rates — no real BFF) — gated OFF
    // until the gamification economy-config BFF endpoints exist.
    canMatch: [featureReadyGuard('economy')],
    data: { title: 'Economy Configuration' },
  },
  // -------------------------------------------------------------------------
  // Content Moderation Dashboard (Phase 48.2)
  // -------------------------------------------------------------------------
  {
    path: 'moderation/dashboard',
    loadChildren: () =>
      import('./moderation/routes').then((m) => m.MODERATION_ROUTES),
    canActivate: [roleGuard('content:moderate')],
    // WS-10 fail-loud (CHO-2071): ModerationService returns fabricated flagged-
    // content / audit MOCK_* data (no BffClientService) — gated OFF until the
    // governance moderation BFF endpoints exist. NB this is the mock dashboard;
    // the real /admin/content/moderation (ContentApprovalComponent) is untouched.
    canMatch: [featureReadyGuard('moderation')],
    data: { title: 'Content Moderation' },
  },
];
