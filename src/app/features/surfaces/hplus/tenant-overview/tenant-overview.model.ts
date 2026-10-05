/**
 * Tenant Overview model — H+ /h/tenant page (Phyllis demo Step 2).
 *
 * Wired LIVE 2026-05-15 (A7 RESOLVED, BE round-10) to the real BFF route:
 *   GET /api/tenants/{id} → chora-gateway → chora-tenancy
 *
 * The interface mirrors the wire shape EXACTLY (snake_case, as chora-tenancy
 * serialises it). No synthesized fields: the real DTO does NOT carry
 * `members_count`, `plan`, `next_invoice`, IdP-federation status, or an
 * add-on list — those live behind dedicated H+ sub-routes (`/h/members`,
 * `/h/billing`, `/h/idp`, `/h/addons`) and the H+ tenant landing page
 * surfaces them as navigation tiles, never as inline fixture polish
 * (no-stubs / no-debts directive 2026-05-14).
 */

/** Tenant branding settings as returned by chora-tenancy. */
export interface BrandingConfig {
  /** Brand accent colour (CSS hex, e.g. `#5B7FFF`). May be empty. */
  readonly primary_color: string;
  /** Short tagline shown under the tenant name. May be empty. */
  readonly tagline: string;
}

/** Real wire DTO for `GET /api/tenants/{id}`. */
export interface TenantOverview {
  /** Tenant aggregate id (UUIDv7). */
  readonly id: string;
  /** Human display name (e.g. "Mighty Mind Tuition Agency"). */
  readonly display_name: string;
  /**
   * Lifecycle status — one of the federated closure-saga states.
   * Known: `active`. The full set lives in chora_identity; this page only
   * renders the string honestly and badges `active` / non-`active`.
   */
  readonly status: string;
  /** Whether the tenant runs in self-hosted mode. */
  readonly self_hosted: boolean;
  /** Parent tenant aggregate id when this tenant is a sub-tenant; else `""`. */
  readonly parent_tenant_id: string;
  /** Branding settings (primary_color + tagline; either may be `""`). */
  readonly branding_config: BrandingConfig;
  /** ISO-8601 UTC creation timestamp. */
  readonly created_at: string;
  /** ISO-8601 UTC last-update timestamp. */
  readonly updated_at: string;
}

/**
 * Discriminated-union state for the tenant-overview load. Mirrors the
 * `AsyncState<T>` fail-loud pattern across chora-web (see
 * `catalog.model.ts` / `course-detail.model.ts`). `error` is an i18n key —
 * never a raw BE body.
 */
export type TenantOverviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly tenant: TenantOverview }
  | { readonly status: 'error'; readonly error: string };
