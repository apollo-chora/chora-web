/**
 * The ownership handover wire shapes (UX Track U, E3 slice 7, screens S7a to
 * S7c). Mirrors `chora-contracts/openapi/tenancy-admin.yaml` v1.6.0.
 *
 * Ownership is one row in `chora_tenancy.members` with `role='owner'`, the one
 * role no admin API can grant. So a handover is a two-party OFFER the nominee
 * must accept, never a role edit, and nothing about the organisation changes
 * until they do.
 */

/** Who started the handover. */
export type OwnershipInitiator = 'owner' | 'operator';

/** The offer lifecycle. Only `pending` is non-terminal. */
export type OwnershipStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'revoked'
  | 'expired';

/**
 * One open offer.
 *
 * `is_live` is computed by the server, not stored. No reaper writes the expired
 * status, so a row past its TTL is still `pending` in the table and not live in
 * fact; the screen has to be able to say the offer lapsed rather than claim
 * there is nothing here.
 */
export interface OwnershipOffer {
  readonly offer_id: string;
  readonly tenant_id: string;
  readonly from_gcid: string;
  readonly to_gcid: string;
  readonly initiated_by: string;
  readonly initiator: OwnershipInitiator;
  readonly reason?: string;
  readonly note?: string;
  readonly status: OwnershipStatus;
  readonly is_live: boolean;
  readonly created_at: string;
  readonly expires_at: string;
}

/**
 * What the screen knows about the tenant's open offer.
 *
 * `none` is a real answer, not an error: most organisations have no handover in
 * flight, and the 404 that says so is the normal case rather than a fault.
 */
export type OwnershipOfferState =
  | { readonly status: 'loading' }
  | { readonly status: 'none' }
  | { readonly status: 'open'; readonly offer: OwnershipOffer }
  | { readonly status: 'error'; readonly error: string };

/**
 * A write's outcome. `kind: 'refused'` carries a named reason the screen can
 * render as copy; `kind: 'failed'` is everything else and is deliberately not
 * dressed up as the caller's fault.
 */
export type OwnershipWriteResult =
  | { readonly kind: 'success'; readonly offer?: OwnershipOffer }
  | { readonly kind: 'refused'; readonly reason: OwnershipRefusal }
  | { readonly kind: 'failed'; readonly error: string };

/**
 * The refusals the server names. Each one is a situation the person in front of
 * the screen can act on, which is why none of them is folded into a generic
 * error: a default arm that collapses them is what made a 409 read as
 * "duplicate" in E1.
 */
export type OwnershipRefusal =
  | 'owner_required'
  | 'no_live_owner'
  | 'offer_already_pending'
  | 'offer_not_found'
  | 'offer_not_pending'
  | 'offer_expired'
  | 'not_the_nominee'
  | 'not_the_initiator'
  | 'nominee_not_a_member'
  | 'nominee_suspended'
  | 'outgoing_owner_gone'
  | 'no_owner_ever'
  | 'operator_required'
  | 'no_active_tenant'
  | 'invalid_request';

/** The three answers a nominee or an initiator can give. */
export type OwnershipVerb = 'accept' | 'decline' | 'revoke';
