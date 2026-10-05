import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import type { SharedAtomFeedEntry } from '../../../models/cplus-shared-atoms.model';

/**
 * CplusPersonCard — reusable person profile card.
 *
 * Shows a person's avatar (initial) on a gradient banner, display name,
 * short GCID, share count, and their latest shared atoms. Used by feed
 * (popover), duels (profile step), and connections (click a connection →
 * see their profile).
 */
@Component({
  selector: 'chora-cplus-person-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './cplus-person-card.component.html',
  styleUrl: './cplus-person-card.component.scss',
})
export class CplusPersonCardComponent {
  readonly gcid = input.required<string>();
  readonly displayName = input.required<string>();
  readonly shareCount = input<number>(0);
  readonly recentAtoms = input<SharedAtomFeedEntry[]>([]);
  readonly showBack = input<boolean>(false);

  /** Show Follow/Block action buttons (feed profile overlay). */
  readonly showFollowBlock = input<boolean>(false);

  /** Whether the viewer is currently following this person. */
  readonly isFollowing = input<boolean>(false);

  /** Whether the viewer has blocked this person. */
  readonly isBlocked = input<boolean>(false);

  /** Whether an action (follow/unfollow/block) is in progress. */
  readonly actionPending = input<boolean>(false);

  readonly back = output<void>();
  readonly followToggle = output<void>();
  readonly blockToggle = output<void>();

  // ── Derived ──────────────────────────────────────────────────────────

  readonly avatarInitial = computed<string>(() => {
    const name = this.displayName().trim();
    if (name) return name.charAt(0).toUpperCase();
    const short = this.gcid().replace(/^gcid-/, '').replace(/-/g, '').slice(0, 1);
    return short ? short.toUpperCase() : '?';
  });

  readonly shortGcid = computed<string>(() => {
    const short = this.gcid().replace(/^gcid-/, '').replace(/-/g, '').slice(0, 8);
    return short ? `gcid-${short}` : this.gcid();
  });

  readonly visibleAtoms = computed<readonly SharedAtomFeedEntry[]>(() =>
    this.recentAtoms().slice(0, 5),
  );
}
