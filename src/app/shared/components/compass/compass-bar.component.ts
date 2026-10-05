/**
 * CompassBarComponent - the A+ compass bar (UX Track U, plan section 3.1).
 *
 * Replaces the 280px sidebar on A+ ONLY; C+/H+/O+/R+ keep the sidebar. Six
 * entries, horizontal, tablet-first: Home, Map, Roster, Courses, Create
 * (author only) and Wallet.
 *
 * The visibility rule is NOT reimplemented here. It calls the shared
 * `isNavItemVisible`, the same predicate the sidebar calls, so a fail-closed
 * fix applied to one navigation cannot miss the other.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { RbacService } from '../../../core/services/rbac.service';
import { isNavItemVisible } from '../../../features/surfaces/surface-access';
import type { NavItem } from '../../../features/surfaces/surface-nav';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { APLUS_COMPASS, COMPASS_ICON_CLASS } from './compass.config';

/** A compass entry resolved for the template. */
export interface CompassEntry {
  readonly item: NavItem;
  /**
   * Semantic entry name, used for the test id: `compass-entry-roster`.
   * Taken from the LABEL key, not the route: the route's last segment is
   * `knowledge` for Map and `studio` for Create, which would name the entries
   * after their implementation rather than after what a learner sees.
   */
  readonly key: string;
  readonly iconClass: string;
}

@Component({
  selector: 'chora-compass-bar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './compass-bar.component.html',
  styleUrl: './compass-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompassBarComponent {
  private readonly rbac = inject(RbacService);
  private readonly flags = inject(FeatureFlagService);

  /**
   * The entries this session may see, in configured order.
   *
   * Filtering preserves order rather than partitioning, so Create appears in
   * its designed slot between Courses and Wallet for an author instead of
   * being appended after Wallet. A test pins that position.
   */
  readonly entries = computed<readonly CompassEntry[]>(() =>
    APLUS_COMPASS.filter((item) => isNavItemVisible(item, this.flags, this.rbac)).map(
      (item) => ({
        item,
        key: item.labelKey.split('.').pop() ?? item.labelKey,
        iconClass: COMPASS_ICON_CLASS[item.icon] ?? '',
      }),
    ),
  );
}
