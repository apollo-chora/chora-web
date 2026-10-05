/**
 * H+ (Hub+) surface nav config — Stage 3 wave 1.
 *
 * Owns: Tenancy + Billing + Identity admin + IdP + add-ons + members + marketplace.
 * Routes live under /h/* prefix. Phyllis demo Step 2 target = `/h/tenant`.
 *
 * Sidebar icons use the existing `data-icon` attribute contract consumed by
 * `chora-web/src/app/layouts/main-layout/sidebar/sidebar.component.html`.
 * Icon strings are free-form tokens (no FontAwesome class names — the sidebar
 * resolves them via a sprite map).
 */
import type { NavItem } from '../surface-nav';

export const HPLUS_NAV: readonly NavItem[] = [
  { labelKey: 'hplus.nav.tenant', icon: 'gauge', route: '/h/tenant' },
  // Setup-Tenant wizard entry — PLATFORM_OPERATOR only (auth-hardening
  // Phase A §4.7d, CHO-1717 / ADR-181 ruling #5: private tenant creation
  // is operator-only; the old tenant:manage capability gate was too
  // permissive). `role` is checked case-insensitively against the session
  // JWT roles claim via RbacService.hasRole. Route lives under /admin/*
  // (with the other tenant_admin routes) and carries the matching
  // platformOperatorGuard.
  {
    labelKey: 'hplus.nav.setupWizard',
    icon: 'wand-magic-sparkles',
    route: '/admin/tenant/settings/wizard',
    role: 'platform_operator',
  },
  { labelKey: 'hplus.nav.members', icon: 'users', route: '/h/members' },
  // UX Track U, package E3, ownership handover (S7a to S7c). No `role` here,
  // deliberately: the nominee is an ordinary member until they accept, so a
  // role filter tight enough to hide this from people who cannot act would
  // also hide it from the one person who has to.
  { labelKey: 'hplus.nav.ownership', icon: 'key', route: '/h/ownership' },
  // CHO-1709 WP-4 — tenant mana pool (ADR-142 tenant subsidy).
  { labelKey: 'hplus.nav.mana', icon: 'coins', route: '/h/mana' },
  { labelKey: 'hplus.nav.addons', icon: 'puzzle', route: '/h/addons' },
  { labelKey: 'hplus.nav.marketplace', icon: 'shop', route: '/h/marketplace' },
  { labelKey: 'hplus.nav.idp', icon: 'shield', route: '/h/idp' },
  { labelKey: 'hplus.nav.billing', icon: 'credit-card', route: '/h/billing' },
  { labelKey: 'hplus.nav.branding', icon: 'palette', route: '/h/branding' },
  // Wave A3 — tenant-admin Transaction History (Payments domain).
  // Operator (PLATFORM_OPERATOR) sees cross-tenant view via role-driven
  // column toggle per integrative-UI principle.
  { labelKey: 'hplus.nav.transactions', icon: 'receipt', route: '/h/transactions' },
  // CHO-2148 — external web-egress entitlement (Far Sight opt-in). The Tenant
  // Admin decides whether this tenant's learners may reach the OPEN WEB.
  // Default-deny, so an untouched tenant is already safe; this is where an admin
  // makes the deliberate choice to open it.
  { labelKey: 'hplus.nav.externalEgress', icon: 'globe', route: '/h/external-egress' },
];
