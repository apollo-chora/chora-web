/**
 * Object-derived FSM action resolver (R+ Four-Mode refactor W2.D).
 *
 * The Overview tab's lifecycle buttons are NOT a free-form control set — they
 * are derived from `offering.state` (the W1/W2.B FSM). This module is the pure,
 * unit-testable source of truth for "which transitions are legal from this
 * state", mirroring the backend `offering.go` FSM + `offering_handler.go`
 * sub-routes:
 *
 *   DRAFT     → Launch, Archive
 *   LAUNCHED  → Start,  Archive
 *   RUNNING   → Conclude, Archive
 *   CONCLUDED → Archive
 *   ARCHIVED  → (terminal — no actions)
 *
 * `archive` is destructive (soft-delete) and is rendered last + confirm-gated
 * in the workspace. Visibility of these actions is additionally role-gated in
 * the component (admins only) per ADR-141 role-driven feature visibility.
 */
import type { OfferingState, OfferingTransition } from './offerings.model';

/** One lifecycle action: the transition id, its i18n label key, destructiveness. */
export interface OfferingAction {
  readonly id: OfferingTransition;
  readonly labelKey: string;
  /** `true` for `archive` (soft-delete) — confirm-gated + styled as danger. */
  readonly destructive: boolean;
}

/** i18n key for an action's button label. */
export function offeringActionLabelKey(id: OfferingTransition): string {
  return `rplus.offerings.workspace.action.${id}`;
}

/** i18n key for the conflict (409) message shown when an action is no longer legal. */
export function offeringConflictKey(id: OfferingTransition): string {
  return `rplus.offerings.workspace.conflict.${id}`;
}

function action(id: OfferingTransition): OfferingAction {
  return { id, labelKey: offeringActionLabelKey(id), destructive: id === 'archive' };
}

/** Archive is offered from every non-terminal state (any → ARCHIVED). */
const ARCHIVE = action('archive');

/**
 * Resolve the ordered, legal lifecycle actions for an offering state. The
 * primary (forward) transition leads; `archive` (destructive) trails. ARCHIVED
 * is terminal and yields no actions.
 */
export function offeringActions(state: OfferingState): readonly OfferingAction[] {
  switch (state) {
    case 'DRAFT':
      return [action('launch'), ARCHIVE];
    case 'LAUNCHED':
      return [action('start'), ARCHIVE];
    case 'RUNNING':
      return [action('conclude'), ARCHIVE];
    case 'CONCLUDED':
      return [ARCHIVE];
    case 'ARCHIVED':
      return [];
  }
}
