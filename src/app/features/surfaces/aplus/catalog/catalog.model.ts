/**
 * Course Catalog model — A+ public catalog (Phyllis demo Step 5).
 *
 * Wired LIVE 2026-05-14 to the real BFF endpoint
 *   GET /api/catalog?public=true  → chora-gateway → chora-delivery
 *
 * The interface mirrors the wire shape EXACTLY (snake_case, as the BE
 * serialises it) — per the chora-web precedent of mirroring wire shapes
 * in TS (see `cplus-feed.model.ts`). No synthesized / enriched fields:
 * `instructor_name` is often `''`, `tags` / counts are often empty/0
 * straight from the BE — that is the real data state and the UI renders
 * it honestly (fail-loud, no debts directive 2026-05-14).
 */

/** A single public course as returned by `GET /api/catalog?public=true`. */
export interface CatalogCourse {
  /** Course aggregate id (UUIDv7). */
  readonly id: string;
  readonly title: string;
  /** Publishing tenant id (UUIDv7) — public courses cross tenant by design. */
  readonly tenant_id: string;
  /** Instructor GCID — opaque, not a display field. */
  readonly instructor_gcid: string;
  /** Public-display instructor name — often `''` from BE; never faked. */
  readonly instructor_name: string;
  readonly is_free: boolean;
  /** Course fee in SGD cents (0 when free). */
  readonly price_sgd_cents: number;
  readonly public: boolean;
  readonly visibility: string;
  /** SkillsFuture-eligible flag. */
  readonly sf_eligible: boolean;
  readonly enrolled_count: number;
  readonly syllabus_outline_count: number;
  readonly tags: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
}

/** Raw response envelope from `GET /api/catalog?public=true`. */
export interface CatalogResponse {
  readonly items: readonly CatalogCourse[];
  /** Relay-cursor pagination info (CR2-C2). Present when server paginates. */
  readonly page_info?: {
    readonly has_next_page: boolean;
    readonly end_cursor: string;
  };
  readonly total?: number;
}

// ── Pagination helpers (CR2-C2) ───────────────────────────────────────

/** Allowed page-size values for the catalog. */
export type CatalogPageSize = 10 | 20 | 50 | 100;

export const CATALOG_PAGE_SIZE_OPTIONS: readonly CatalogPageSize[] = [
  10, 20, 50, 100,
] as const;

/** Default page size for the catalog. */
export const CATALOG_DEFAULT_PAGE_SIZE: CatalogPageSize = 20;

/**
 * Discriminated-union state for the catalog load. Mirrors the
 * `AsyncState<T>` fail-loud pattern used across chora-web (see
 * `daily-dose.model.ts`). `error` is an i18n key — never a raw BE body.
 */
export type CatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly courses: readonly CatalogCourse[] }
  | { readonly status: 'error'; readonly error: string };

/** Display helper: SGD-cents → `SGD 0` / `SGD 580` style label. */
export function formatPriceSgd(priceCents: number): string {
  if (priceCents === 0) {
    return 'SGD 0';
  }
  const dollars = priceCents / 100;
  return `SGD ${dollars.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
