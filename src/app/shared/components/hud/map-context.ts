/**
 * Which map, if any, the learner is currently looking at.
 *
 * The HUD's world controls are lens and Roads switches while on a map, and a
 * Map jump elsewhere, so the whole bottom-left region turns on this one answer.
 * Kept pure and separate from the component for the same reason as the turn
 * action: the rule is worth testing without a TestBed.
 */

const ATLAS = '/a/knowledge';

/**
 * The goal id of the open map, or `null` when the learner is not on one.
 *
 * The atlas itself (`/a/knowledge`) is NOT a map: it is the index of them, and
 * lens controls there would switch a lens on nothing.
 */
export function activeMapGoalId(url: string): string | null {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  if (!path.startsWith(`${ATLAS}/`)) return null;
  const rest = path.slice(ATLAS.length + 1);
  const first = rest.split('/', 1)[0] ?? '';
  return first === '' ? null : first;
}
