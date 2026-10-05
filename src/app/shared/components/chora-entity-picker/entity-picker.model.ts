/**
 * chora-entity-picker — entity-agnostic search/select primitive (CHO-1833 B0).
 *
 * The reusable cross-surface picker generalises the proven R+ MemberPicker
 * (`features/surfaces/rplus/.../member-picker`) into ONE component that can
 * search-and-select ANY entity type. Two inversions over the base:
 *
 *   1. Data source is decoupled — the picker depends on an entity-agnostic
 *      `EntitySearchPort` resolved by `entityType` from the
 *      `EntitySearchRegistry`, NOT a hard-injected named service. See
 *      `entity-search.registry.ts`.
 *   2. Search state is PER-INSTANCE — the component owns its own
 *      `EntitySearchState` signal so two pickers on one page (e.g. instructor
 *      + room side-by-side) never clobber each other's results.
 *
 * B0 is FE-only: no real BFF adapters (that is B2). The `MockEntitySearchAdapter`
 * (`mock-search.adapter.ts`) backs specs, Storybook and dev.
 */
import type { Observable } from 'rxjs';

/**
 * The entity kinds the picker can search. Closed union — adding a kind here
 * (and registering an `EntitySearchPort` for it) is the only way to make a new
 * entity pickable, which keeps the fail-loud registry honest.
 */
export type EntityType =
  | 'course'
  | 'testset'
  | 'atom'
  | 'live_quiz'
  | 'member'
  | 'franchisee'
  | 'cohort'
  | 'room'
  | 'instructor';

/**
 * A single selectable row — the lowest-common-denominator projection every
 * adapter returns. `id` is opaque (UUID/slug); `label` is the primary display
 * line; `sublabel` an optional secondary line; `meta` an opaque bag for
 * adapter-specific extras (e.g. a `badge` string rendered by the command
 * variant, or facet-match fields).
 */
export interface EntityRef {
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** One page of search results plus an opaque forward cursor (null = last page). */
export interface EntitySearchPage {
  readonly items: readonly EntityRef[];
  readonly nextCursor: string | null;
}

/** Free-text facet filters, serialised straight through to the adapter. */
export type EntityFacets = Readonly<Record<string, string>>;

/**
 * The port the picker talks to. Adapters self-register against an `entityType`
 * via the `ENTITY_SEARCH_PORTS` multi-provider token. `resolve` is optional —
 * when present it hydrates pre-set `value` ids into full labels.
 */
export interface EntitySearchPort {
  readonly entityType: EntityType;
  search(
    q: string,
    facets: EntityFacets,
    cursor: string | null,
  ): Observable<EntitySearchPage>;
  resolve?(ids: readonly string[]): Observable<readonly EntityRef[]>;
}

/**
 * Picker presentation modes:
 *   - `single`  — no chips; selecting sets the value + collapses; emits `picked`.
 *   - `multi`   — chip set above the input; emits `picked` on add, `removed` on ×.
 *   - `command` — overlay, autofocus, keyboard-first, state-badge rows; emits
 *                 `activated` / `activatedNewTab` (NOT `picked`).
 */
export type EntityPickerVariant = 'single' | 'multi' | 'command';

/**
 * Per-instance discriminated search state. `success` carries the accumulated
 * rows + forward cursor; `error` carries a stable machine code (the human
 * banner copy comes from the component's `errorLabel` input).
 */
export type EntitySearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly items: readonly EntityRef[];
      readonly nextCursor: string | null;
    }
  | { readonly status: 'error'; readonly error: string };

/** Predicate deciding whether a result row is non-selectable (greyed + aria-disabled). */
export type EntityDisabledPredicate = (row: EntityRef) => boolean;

/** Stable machine code stored in `EntitySearchState.error` on a failed search. */
export const ENTITY_SEARCH_ERROR_CODE = 'entity_search_failed';
