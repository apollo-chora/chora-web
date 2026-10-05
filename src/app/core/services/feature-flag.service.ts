/**
 * FeatureFlagService — app-wide tenant feature-flag / add-on entitlement
 * lookup.
 *
 * Wired LIVE 2026-05-15 to `GET /api/feature-flags` (A7 RESOLVED, BE
 * round-10). Holds the tenant's typed `TenantEntitlement[]` set seeded by
 * `AuthService.loadFeatureFlags()` post-mint (or after a tenant switch).
 *
 * Two consumer surfaces:
 *   1. `hasEntitlement(addonId)` — honest UUID-based lookup against the
 *      real wire DTO. Use this when you have a real `addon_id` (e.g. from
 *      `/api/feature-flags` or the H+ marketplace catalog).
 *   2. `isEnabled(code)` — human-code API (`'knowledge_graph'`,
 *      `'cplus_social'`, …) used by `add-on.guard.ts`, the surface nav
 *      configs, and the sidebar. A8 gap CLOSED (auth-hardening Phase A
 *      §4.7b, CHO-1717): the entitlement DTO now carries `addon_code`, so
 *      `isEnabled(code)` resolves from the ACTIVE entitlement set, OR'd
 *      with the legacy code-keyed flags map (kept so tests + the developer
 *      console override keep working). Legacy rows with an empty
 *      `addon_code` never match.
 *
 * `setFlags()` is retained ONLY for tests/legacy paths — production wiring
 * should call `setEntitlements()` instead.
 */
import { Injectable, computed, signal } from '@angular/core';
import { BehaviorSubject, type Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import type { TenantEntitlement } from './feature-flags.model';

@Injectable({ providedIn: 'root' })
export class FeatureFlagService {
  private readonly _flags = signal<Record<string, boolean>>({});
  private readonly _entitlements = signal<readonly TenantEntitlement[]>([]);

  /**
   * Whether the active tenant's entitlement set has RESOLVED (success, empty,
   * or error). The post-mint `GET /api/feature-flags` is a non-blocking
   * side-effect, so a route guard can fire BEFORE it returns; without this
   * gate the guard reads an empty set and wrongly redirects an entitled user
   * (the chora-master read-seam). `BehaviorSubject` so each late subscriber
   * (every guard activation) replays the current state. Reset to `false` by
   * `beginLoad()` when a fresh fetch starts (e.g. tenant switch).
   */
  private readonly _loaded$ = new BehaviorSubject<boolean>(false);

  /**
   * Emits `true` exactly once the entitlement set has resolved, then
   * completes. Consumed by `add-on.guard.ts` to defer the (non-operator)
   * entitlement decision until the flags are actually loaded.
   */
  readonly whenLoaded$: Observable<true> = this._loaded$.pipe(
    filter((loaded): loaded is true => loaded),
    take(1),
    map(() => true as const),
  );

  /** All entitlements (any status). */
  readonly entitlements = this._entitlements.asReadonly();

  /** Only the entitlements with `status === 'active'`. */
  readonly activeEntitlements = computed<readonly TenantEntitlement[]>(() =>
    this._entitlements().filter((e) => e.status === 'active'),
  );

  /**
   * Honest UUID-based check: returns `true` iff the tenant has an
   * `active`-status entitlement for `addonId`.
   */
  hasEntitlement(addonId: string): boolean {
    return this.activeEntitlements().some((e) => e.addon_id === addonId);
  }

  /**
   * Human-code check — used by `add-on.guard.ts`, the surface nav configs
   * (`'knowledge_graph'`, `'cplus_social'`, …), and the sidebar.
   *
   * Returns `true` when EITHER:
   *   - the legacy code-keyed flags map (`setFlags`) enables `code`
   *     (kept OR'd in for tests + the developer-console override), or
   *   - an ACTIVE entitlement's `addon_code` matches `code` exactly
   *     (§4.7b bridge — BE adds `addon_code` to the entitlement DTO).
   *
   * Empty `code` queries are fail-closed so legacy entitlement rows with
   * `addon_code: ""` can never be matched.
   */
  isEnabled(code: string): boolean {
    if (this._flags()[code] ?? false) {
      return true;
    }
    if (!code) {
      return false;
    }
    return this.activeEntitlements().some((e) => e.addon_code === code);
  }

  /**
   * Replace the typed entitlements set. Called by
   * `AuthService.loadFeatureFlags()` after `GET /api/feature-flags` resolves —
   * which also marks the set loaded (unblocking any waiting guard).
   */
  setEntitlements(entitlements: readonly TenantEntitlement[]): void {
    this._entitlements.set(entitlements);
    this._loaded$.next(true);
  }

  /**
   * Replace the legacy code-keyed flag map. Retained for tests and the
   * developer console feature-flag override component until the BE catalog
   * bridge lands. Marks the set loaded — an explicit flag injection is a
   * resolved state.
   */
  setFlags(flags: Record<string, boolean>): void {
    this._flags.set(flags);
    this._loaded$.next(true);
  }

  /**
   * Mark a fresh entitlement fetch as STARTING (resets the loaded gate to
   * `false`) so guards wait for THIS tenant's flags rather than reading the
   * previous tenant's stale set across a switch. Paired with `setEntitlements`
   * / `markLoaded` on resolution.
   */
  beginLoad(): void {
    this._loaded$.next(false);
  }

  /**
   * Resolve the loaded gate WITHOUT changing the entitlement set — for the
   * no-tenant and fetch-error paths, so a guard awaiting `whenLoaded$` never
   * hangs. Non-operators then fall through to the honest (empty) decision.
   */
  markLoaded(): void {
    this._loaded$.next(true);
  }

  /**
   * Drop every entitlement and re-arm the gate. Called from
   * `AuthService.clearAuth()`, so a session that ends leaves nothing behind
   * for the next one on this browser.
   *
   * Both halves matter. Keeping the set would hand the outgoing tenant's
   * add-on gates to whoever signs in next on a shared device; leaving the gate
   * resolved would let the incoming session's `add-on.guard` decide before
   * that tenant's own `GET /api/feature-flags` has landed.
   */
  clear(): void {
    this._entitlements.set([]);
    this._flags.set({});
    this._loaded$.next(false);
  }
}
