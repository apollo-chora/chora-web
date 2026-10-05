/**
 * RestrictedNavComponent — Tier 3 role restriction UI for navigation.
 *
 * Global shared component used by MainLayout sidebar to modify nav rendering
 * when the user has tier 3 restrictions.
 *
 * Features:
 *   - Navigation items get greyed out when capability is restricted
 *   - Lock icon overlay on restricted items
 *   - Tooltip explaining restriction reason
 *   - Reduced navigation showing only permitted routes
 *   - Capability-aware styling via CSS classes
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import type { RestrictedCapability } from '../../../features/admin/governance/models/escalation.model';

export interface NavItem {
  route: string;
  label_key: string;
  icon: string;
}

@Component({
  selector: 'chora-restricted-nav',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './restricted-nav.component.html',
  styleUrl: './restricted-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestrictedNavComponent {
  /** Full list of navigation items */
  readonly navItems = input.required<NavItem[]>();

  /** List of restricted capabilities from governance */
  readonly restrictions = input<RestrictedCapability[]>([]);

  /** Whether to show only permitted routes (hide restricted entirely) */
  readonly hideRestricted = input(false);

  /** Emits when user clicks a permitted navigation item */
  readonly navigate = output<string>();

  // --- Computed ---
  readonly restrictedRoutes = computed(() => {
    const restrictions = this.restrictions();
    return new Set(
      restrictions
        .filter((r) => r.is_restricted)
        .map((r) => r.route),
    );
  });

  readonly restrictionReasonMap = computed(() => {
    const restrictions = this.restrictions();
    const map = new Map<string, string>();
    for (const r of restrictions) {
      if (r.is_restricted) {
        map.set(r.route, r.reason);
      }
    }
    return map;
  });

  readonly visibleItems = computed(() => {
    const items = this.navItems();
    if (this.hideRestricted()) {
      const restricted = this.restrictedRoutes();
      return items.filter((item) => !restricted.has(item.route));
    }
    return items;
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  isRestricted(route: string): boolean {
    return this.restrictedRoutes().has(route);
  }

  getRestrictionReason(route: string): string {
    return this.restrictionReasonMap().get(route) ?? '';
  }

  onNavigate(route: string): void {
    if (!this.isRestricted(route)) {
      this.navigate.emit(route);
    }
  }

  itemClass(route: string): string {
    return this.isRestricted(route)
      ? 'restricted-nav__item restricted-nav__item--restricted'
      : 'restricted-nav__item';
  }
}
