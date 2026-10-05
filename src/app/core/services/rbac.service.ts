import { Injectable, inject, computed } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class RbacService {
  private readonly auth = inject(AuthService);

  readonly capabilities = computed(() => this.auth.user()?.capabilities ?? []);

  /** Raw role claims from the active ChoraSession JWT (`roles[]`). */
  readonly roles = computed(() => this.auth.user()?.roles ?? []);

  hasCapability(capability: string): boolean {
    return this.capabilities().includes(capability);
  }

  hasAnyCapability(...caps: string[]): boolean {
    const current = this.capabilities();
    return caps.some((c) => current.includes(c));
  }

  hasAllCapabilities(...caps: string[]): boolean {
    const current = this.capabilities();
    return caps.every((c) => current.includes(c));
  }

  /**
   * Role-claim check against the session JWT `roles[]` (auth-hardening
   * Phase A §4.7e, CHO-1717 / ADR-181). The comparison is CASE-INSENSITIVE
   * canonical: deployed mints forward membership roles verbatim (lowercase
   * `platform_operator`-style) while ADR-141/ADR-165 canonical names are
   * uppercase (`PLATFORM_OPERATOR`) — a JWT may carry either form, so both
   * sides normalise before comparing. Empty/blank role names never match
   * (fail-closed). Reads the `user()` signal, so calls inside `computed()`
   * re-evaluate on session change.
   */
  hasRole(roleName: string): boolean {
    const target = roleName.trim().toLowerCase();
    if (!target) {
      return false;
    }
    return this.roles().some((r) => r.trim().toLowerCase() === target);
  }
}
