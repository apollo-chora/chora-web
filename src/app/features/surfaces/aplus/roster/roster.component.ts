/**
 * The Roster (`/a/roster`, plan section 3.2, row U2).
 *
 * Every companion the learner holds, where it is stationed, and what it will
 * earn next. Two reads, joined client-side: the companion list, which is
 * already the enriched `ListRosterByOwner` projection, and the maps list, whose
 * cards carry `attachedFamiliarId` (the ADR-212 D5 goal-companion bond).
 *
 * ⚠ THE TWO READS FAIL SEPARATELY, ON PURPOSE. The station is one line on a
 * card, so losing the maps read must not lose the screen; and a failed maps
 * read must not render as "not on a map", because "I could not find out where
 * it is" and "it is resting" are different facts and only one of them is a
 * reason to go and give it something to do.
 *
 * Departures from the mockup, all ruled:
 *  - no `mind` clause. The mockup renders the LLM tier there; CHO-2047 puts
 *    model tier behind O+.
 *  - the denominator is SERVED, never derived. C1a (`e2cbd0bd7`) puts
 *    `roster_cap` and `cap_source` on the envelope, from the same call the
 *    create handler enforces with. When the server sends none the chip drops
 *    the fraction rather than falling back to the free-tier 3, which would
 *    either tell a learner they cannot hold a companion they paid for or
 *    offer one create will refuse.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, catchError, map, merge, of, startWith, switchMap } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { MapsService } from '../my-knowledge/maps.service';
import type { FamiliarSummary } from '../../../../core/familiar/familiar-growth.model';
import { stationFrom } from '../../../../core/familiar/station';
import type { MapsReport, Station } from '../../../../core/familiar/station';

export type { Station };

type RosterState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly companions: readonly FamiliarSummary[];
      readonly rosterCap?: number;
    }
  | { readonly status: 'error' };

@Component({
  selector: 'chora-roster',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './roster.component.html',
  styleUrl: './roster.component.scss',
})
export class RosterComponent {
  private readonly growth = inject(FamiliarGrowthService);
  private readonly maps = inject(MapsService);

  private readonly reload$ = new Subject<void>();

  readonly state = toSignal(
    merge(of(void 0), this.reload$).pipe(
      switchMap(() =>
        this.growth.listRoster().pipe(
          map(
            (r): RosterState => ({
              status: 'success',
              companions: r.companions,
              rosterCap: r.rosterCap,
            }),
          ),
          catchError(() => of<RosterState>({ status: 'error' })),
          startWith<RosterState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as RosterState },
  );

  /**
   * The maps read, as a REPORT.
   *
   * A bare `[]` on failure would be indistinguishable from a learner with no
   * maps, and every companion would then read "not on a map". Same principle
   * as the wired-sink report in the Grimoire: distinguish by the message,
   * never by an empty result.
   */
  readonly mapsReport = toSignal(
    merge(of(void 0), this.reload$).pipe(
      switchMap(() =>
        this.maps.listMaps().pipe(
          map((cards): MapsReport => ({ reported: true, cards })),
          catchError(() => of<MapsReport>({ reported: false, cards: [] })),
        ),
      ),
    ),
    { initialValue: { reported: false, cards: [] } },
  );

  readonly loading = computed(() => this.state().status === 'loading');
  readonly errored = computed(() => this.state().status === 'error');
  readonly companions = computed<readonly FamiliarSummary[]>(() => {
    const s = this.state();
    return s.status === 'success' ? s.companions : [];
  });
  readonly isEmpty = computed(
    () => this.state().status === 'success' && this.companions().length === 0,
  );

  /**
   * The effective roster cap, as SERVED.
   *
   * Undefined when the server sent none, and deliberately not backfilled from
   * `DefaultMaxCompanionsPerUser`: that constant is the free-tier fallback the
   * server applies, and re-deriving it here would re-invent the denominator
   * `roster_cap` exists to stop the client inventing.
   */
  readonly rosterCap = computed<number | undefined>(() => {
    const s = this.state();
    return s.status === 'success' ? s.rosterCap : undefined;
  });

  /**
   * Where one companion is stationed, or why that is unknown.
   *
   * Delegates to the SHARED helper the dashboard's party strip also calls, so
   * the two surfaces cannot answer the same question differently.
   */
  stationOf(familiarId: string): Station {
    return stationFrom(this.mapsReport(), familiarId);
  }

  /**
   * The next-stage tease rows, or an empty list.
   *
   * ⚠ ABSENT and `[]` are different and stay different. Absent means the list
   * read does not report unlocks at all, which is every response until C1a
   * widens it, and the card then says NOTHING about unlocks rather than
   * implying there are none. `[]` means reported and there are none, which is
   * what the top stage looks like.
   */
  teasesFor(c: FamiliarSummary): readonly { skillKey: string; dormant: boolean }[] {
    return (c.nextUnlocks ?? []).map((u) => ({
      skillKey: u.skillKey,
      // catalogue_active false = it arrives owned but dark. Saying so is the
      // whole point of a NAMED tease: promising a Skill the learner cannot use
      // the moment they earn it is the fake-usable failure it exists to avoid.
      dormant: !u.catalogueActive,
    }));
  }

  reload(): void {
    this.reload$.next();
  }
}
