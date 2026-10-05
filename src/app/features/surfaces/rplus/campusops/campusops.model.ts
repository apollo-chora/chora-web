/**
 * CampusOps model — R+ M15a /r/campusops route.
 *
 * Surfaces the Campus aggregate (chora-delivery domain/campusops/) to
 * the R+ Rhythm+ training-admin surface for the M15a Campus Operations
 * screen (rooms / equipment / incidents are future waves on this same
 * route; M15a ships the Campus listing as the entry point).
 *
 * Domain vocabulary anchors:
 *   - `Campus` — top-level learning location (e.g., "MTM SG — Bras Basah")
 *   - `Branch` — optional sub-location grouping inside a Campus
 *   - `Room`   — physical room inside a Campus / Branch
 *
 * Wire format matches the canonical `campusDTO` helper in
 * services/chora-delivery/internal/adapter/http/v1_handlers.go:
 *   { id, tenant_id, name, address_l1, address_l2, city, country,
 *     created_at, updated_at, deleted_at? }
 *
 * The FE model normalises the snake_case wire shape to camelCase and
 * exposes the country code as both a literal value and a display label
 * (rendered as a flag-style badge in the component template).
 */

/** ISO 3166-1 alpha-2 country code, e.g. `SG`. */
export type CampusCountryCode = string;

export interface Campus {
  /** Stable UUIDv7 from the backend (e.g. `01970000-...`). */
  readonly campusId: string;
  /** Tenant the campus belongs to (UUIDv7). */
  readonly tenantId: string;
  /** Display name (e.g. `MTM SG — Bras Basah`). */
  readonly name: string;
  /** Address line 1 — may be empty when the backend has not captured it. */
  readonly addressLine1: string;
  /** Address line 2 — optional. */
  readonly addressLine2: string;
  /** City (e.g. `Singapore`). */
  readonly city: string;
  /** ISO 3166-1 alpha-2 (e.g. `SG`). */
  readonly country: CampusCountryCode;
  /** Composed display address (`address_l1, city, country`) — derived. */
  readonly displayAddress: string;
  /** Created timestamp ISO 8601. */
  readonly createdAt: string;
  /** Updated timestamp ISO 8601. */
  readonly updatedAt: string;
}

export interface CampusList {
  /** Tenant display name from the FE tenant-context (header pill). */
  readonly tenantName: string;
  /** Total Campus count for the header badge. */
  readonly totalCampuses: number;
  /** Campus rows, newest-first. */
  readonly campuses: readonly Campus[];
}

/**
 * Compose a short display address from the granular wire fields.
 *
 * Order: `address_l1, city, country` — empties are stripped + the
 * separator collapsed so "Singapore, SG" renders cleanly when no
 * street is on file.
 */
export function composeDisplayAddress(
  addressL1: string,
  city: string,
  country: string,
): string {
  return [addressL1, city, country]
    .map((s) => (s ?? '').trim())
    .filter((s) => s.length > 0)
    .join(', ');
}
