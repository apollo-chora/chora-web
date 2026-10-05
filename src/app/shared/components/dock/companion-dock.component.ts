/**
 * CompanionDockComponent - the companion dock (plan section 3.1).
 *
 * A persistent presence on every A+ screen, sitting above the turn action: the
 * active companion, its mood, and the way into its chat.
 *
 * ⚠ THE CHAT DOES NOT OPEN IN PLACE YET, and that is a known gap rather than a
 * shortcut. The plan asks for chat in place. `FamiliarChatComponent` reads its
 * subject from `route.snapshot.paramMap.get('familiarId')`, so hosting it
 * outside its own route would hand it an empty id and it would render a chat
 * with no companion behind it. Making it take an input is a one-line change in
 * a file this package does not own, so the dock routes to the chat and the seam
 * is recorded for the companion track instead of being faked here.
 *
 * ⚠ `FamiliarGrowthState` CARRIES NO NAME. The display name lives on the
 * roster item, not on the growth state, so the dock resolves it by matching the
 * active companion's id against the roster the dashboard read already carries.
 * That read is loaded globally by the yields strip, so this costs no second
 * request and adds no second reader. When the match has not landed the dock
 * says "your companion" rather than printing a UUID, which is not a name a
 * learner can act on.
 *
 * The dock renders NOTHING when there is no active companion.
 * `ActiveFamiliarService` exposes no load state, so `null` means both "this
 * learner has none" and "not loaded yet". An absent dock claims nothing; a dock
 * reading "summon your first companion" would be confidently wrong for a
 * learner who already has six and whose read had simply not landed.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ActiveFamiliarService } from '../../../core/familiar/active-familiar.service';
import { DashboardService } from '../../../features/surfaces/aplus/dashboard/dashboard.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-companion-dock',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './companion-dock.component.html',
  styleUrl: './companion-dock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanionDockComponent {
  private readonly activeFamiliar = inject(ActiveFamiliarService);
  private readonly dashboard = inject(DashboardService);

  readonly companion = this.activeFamiliar.active;
  readonly mood = this.activeFamiliar.mood;

  /** The companion's own id, so the dock never falls back to "whoever is active". */
  readonly companionId = computed<string | null>(
    () => this.companion()?.familiarId ?? null,
  );

  /**
   * The companion's display name, or `null` when nothing has supplied one yet.
   * Never the id: a UUID is not a name, and printing one is the same class of
   * leak the character sheet's whole-profile DOM guard exists to catch.
   */
  readonly name = computed<string | null>(() => {
    const id = this.companionId();
    if (!id) return null;
    const roster = this.dashboard.summary()?.familiars ?? [];
    const match = roster.find((f) => f.familiar_id === id);
    const named = match?.name?.trim();
    return named ? named : null;
  });

  /** i18n key for the mood word, so the state is text and not colour alone. */
  readonly moodKey = computed<string>(() => `aplus.shell.dock.mood.${this.mood()}`);
}
