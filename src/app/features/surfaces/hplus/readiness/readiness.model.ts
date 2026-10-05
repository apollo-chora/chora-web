/**
 * Readiness model, H+ instance readiness (S1) and go-live check (S6).
 *
 * Mirrors the wire shape of `GET /api/v1/admin/readiness` EXACTLY, as the
 * gateway readiness aggregator serialises it
 * (`services/chora-gateway/internal/aggregator/readiness/readiness.go`).
 * Snake_case field names are the server's, kept verbatim: renaming them here
 * would put a translation layer between the server's verdict and the screen,
 * which is the one thing this feature must not have.
 *
 * The contract that matters, and why these are types and not helpers:
 *
 *  1. `status` is the SERVER's verdict. There is deliberately no client-side
 *     function in this file that derives a status from `count` or `detail`.
 *     A client that recomputed could disagree with the server, and then two
 *     screens would tell an operator two different things about one instance.
 *
 *  2. There are THREE statuses. `unknown` means the check could not run. It
 *     is a first-class answer carrying a `reason`, NOT a second kind of red,
 *     and it never drives the next action.
 *
 *  3. `count` is a POINTER on the wire (`omitempty` over `*int`). Absent
 *     means the row counts nothing; zero means the row counted, and found
 *     zero. Collapsing the two would turn "we did not look" into "there are
 *     none", so `count` is optional here and must be tested with `undefined`,
 *     never with a falsy check.
 */

/** A readiness row's verdict, decided by the server. */
export type ReadinessStatus = 'ok' | 'attention' | 'unknown';

/**
 * One readiness row. Every response carries every row, so the list length is
 * fixed and a reader can always tell "checked and fine" from "not checked".
 */
export interface ReadinessRow {
  /** Stable row key, e.g. `organisation`, `billing`. */
  readonly key: string;
  /** Human label, server-supplied. */
  readonly label: string;
  /** The server's verdict. Rendered verbatim, never recomputed. */
  readonly status: ReadinessStatus;
  /** Supporting text for an `ok` or `attention` row. May be absent. */
  readonly detail?: string;
  /** Why an `unknown` row could not be checked. Present on every `unknown`. */
  readonly reason?: string;
  /**
   * What the row counted. ABSENT means the row counts nothing; `0` means it
   * counted and found none. Never conflate the two.
   */
  readonly count?: number;
}

/** The full readiness report for one instance. */
export interface ReadinessReport {
  /** Every row, in the server's fixed order. Never re-sorted client-side. */
  readonly rows: readonly ReadinessRow[];
  /**
   * The first thing to do, chosen by the server, or absent when nothing
   * needs work. The server skips `unknown` rows when choosing it.
   */
  readonly next_action?: string;
  /** True when at least one part failed and its row fell back to `unknown`. */
  readonly partial: boolean;
  /** Which parts failed, keyed by part name. Present only when partial. */
  readonly part_errors?: Readonly<Record<string, string>>;
  /** Declared limits of the answers given, keyed by row. */
  readonly known_gaps?: Readonly<Record<string, string>>;
}

/**
 * Fail-loud discriminated state for the readiness load, matching the
 * `AsyncState<T>` pattern used across chora-web. `error` is an i18n key,
 * never a raw backend body.
 */
export type ReadinessState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly report: ReadinessReport }
  | { readonly status: 'error'; readonly error: string };
