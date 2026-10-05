/**
 * The HUD party strip: one portrait per companion, and where each one takes you
 * (Track U Phase C, C2; drawn in pass 4 as `hud__party`).
 *
 * A PURE function, for the same reason `turn-action.ts` and `quest-stack.ts`
 * are pure: the rule is testable without a TestBed and cannot grow a dependency
 * on the view.
 *
 * NO SECOND READER. Both inputs are reads the shell already holds: the roster
 * arrives on the dashboard summary the yields strip loads globally and the
 * companion dock already reads, and the maps arrive from `MapsService`, which
 * the HUD already injects for its lens and Roads controls.
 *
 * ⚠ AND NO SECOND STATION RULE. "Where is this companion stationed" is already
 * answered ONCE, by `core/familiar/station.ts`, which the roster and the
 * dashboard cast card both call so that two surfaces cannot answer it
 * differently. This file delegates to it and adds only the HUD's own concern,
 * which is where a portrait NAVIGATES.
 *
 * That delegation is not tidiness. The first version of this file inverted
 * `MapCard.attachedFamiliarId` itself over a bare `MapCard[]`, and a bare array
 * cannot express "the read failed": an empty one would have meant both "this
 * learner has no maps" and "I could not find out", so every companion would
 * have linked to the roster as CONFIRMED unstationed while the read was still
 * in flight. `MapsReport.reported` is the field that distinguishes them, and
 * `stationFrom` already gets it right.
 */
import {
  stationFrom,
  type MapsReport,
  type Station,
} from '../../../core/familiar/station';
import type { FamiliarRosterItem } from '../../../features/surfaces/aplus/dashboard/dashboard.model';

/** Where a companion with no known station goes. Always live, never a guess. */
export const ROSTER_ROUTE = '/a/roster';

/** One portrait. */
export interface PartyPortrait {
  readonly familiarId: string;
  readonly name: string;
  readonly species: string;
  readonly stageLabel: string;
  /**
   * The station as the SHARED helper reports it, carried through rather than
   * flattened. The template needs all three arms: `stationed` names a map,
   * `unstationed` says so, and `unknown` says NOTHING, because the read did not
   * report and a portrait that claims "not on a map" would be inventing it.
   */
  readonly station: Station;
  /**
   * Resolved destination: the goal map when stationed, the roster otherwise.
   *
   * `unknown` goes to the roster too, and that is deliberate. It is a live
   * destination that shows the same uncertainty honestly, whereas a link built
   * from a map we are not sure exists is the confident wrong answer the
   * `unknown` arm exists to prevent.
   */
  readonly route: string;
}

/**
 * Join the roster to the maps report.
 *
 * Order follows the ROSTER, so the strip does not reshuffle when a map is
 * archived or a station changes. A map naming a companion the roster does not
 * contain contributes nothing: the party is the roster's shape, and a portrait
 * with no name to draw is not a portrait.
 */
export function resolveParty(
  roster: readonly FamiliarRosterItem[],
  maps: MapsReport,
): readonly PartyPortrait[] {
  return roster.map((member) => {
    const station = stationFrom(maps, member.familiar_id);
    return {
      familiarId: member.familiar_id,
      name: member.name,
      species: member.species,
      stageLabel: member.stage_label,
      station,
      route:
        station.kind === 'stationed'
          ? `/a/knowledge/${station.goalId}`
          : ROSTER_ROUTE,
    };
  });
}
