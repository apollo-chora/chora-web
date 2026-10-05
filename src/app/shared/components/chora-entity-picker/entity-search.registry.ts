/**
 * EntitySearchRegistry — fail-loud entityType → EntitySearchPort resolver
 * for chora-entity-picker (CHO-1833 B0).
 *
 * Adapters self-register against the `ENTITY_SEARCH_PORTS` multi-provider
 * token; the picker asks the registry for the port matching its `entityType`.
 * This is inversion #1 (decoupled data source) — the picker never injects a
 * named service.
 *
 * Fail-loud invariant (no-stubs): an unregistered entityType THROWS rather
 * than yielding a silent empty dropdown that masks a wiring bug. The
 * `searchPortOverride` input on the component is the only sanctioned bypass.
 */
import { InjectionToken, Injectable, inject } from '@angular/core';

import type { EntitySearchPort, EntityType } from './entity-picker.model';

/**
 * Multi-provider token: every searchable entity contributes one
 * `EntitySearchPort`. Register with `{ provide: ENTITY_SEARCH_PORTS,
 * useValue: <adapter>, multi: true }` (or via `provideMockEntitySearchPorts`
 * for dev/Storybook).
 */
export const ENTITY_SEARCH_PORTS = new InjectionToken<readonly EntitySearchPort[]>(
  'ENTITY_SEARCH_PORTS',
);

@Injectable({ providedIn: 'root' })
export class EntitySearchRegistry {
  /** All registered ports (flattened from the multi-provider; empty when none). */
  private readonly ports: readonly EntitySearchPort[] =
    inject(ENTITY_SEARCH_PORTS, { optional: true }) ?? [];

  /**
   * Resolve the port for `entityType`. Throws fail-loud when none is
   * registered — a missing adapter is a wiring defect, never a silent
   * empty-results state.
   *
   * When more than one port registers the same entityType, the
   * last-registered wins (lets a dev/test override shadow a default adapter).
   */
  resolve(entityType: EntityType): EntitySearchPort {
    let resolved: EntitySearchPort | undefined;
    for (const port of this.ports) {
      if (port.entityType === entityType) {
        resolved = port;
      }
    }
    if (!resolved) {
      throw new Error(
        `[EntitySearchRegistry] no EntitySearchPort registered for entityType ` +
          `"${entityType}". Register an adapter via the ENTITY_SEARCH_PORTS ` +
          `multi-provider, or pass [searchPortOverride] on the picker.`,
      );
    }
    return resolved;
  }

  /** Whether an entityType has at least one registered port. */
  has(entityType: EntityType): boolean {
    return this.ports.some((port) => port.entityType === entityType);
  }
}
