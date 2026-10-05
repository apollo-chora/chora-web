/**
 * OwnershipService, the reads and writes behind H+ `/h/ownership` (screens S7a
 * to S7c).
 *
 * Six BFF routes, and the service is a pipe over them: it does not decide who
 * may hand over, who may accept, or whether an offer is still live. Every one
 * of those is a server decision made against rows this client cannot see, and
 * a client-side copy of any of them would eventually disagree with the server
 * about the same organisation with nothing to say which was right.
 *
 * Two things it DOES own.
 *
 * First, `from_gcid` is never sent. A GCID alone never proves ownership
 * (first-launch spec 13.6), so the outgoing owner is resolved server-side, and
 * a field of that name in a request body would be ignored anyway. Not sending
 * it keeps the contract honest at both ends.
 *
 * Second, error classification. Every refusal the server names gets its own
 * reason, and anything unrecognised stays `failed`. There is deliberately no
 * default arm folding an unknown status into a named refusal: that is how a
 * 409 came to read as "duplicate" in E1, and how a real outage reads as the
 * caller's mistake.
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, take } from 'rxjs';

import {
  errorCodeOf,
  httpErrorView,
} from '../../../../core/interceptors/api-error.model';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  OwnershipOffer,
  OwnershipOfferState,
  OwnershipRefusal,
  OwnershipVerb,
  OwnershipWriteResult,
} from './ownership.model';

const OFFER_PATH = '/api/v1/tenants/me/ownership/offer';
const OFFERS_PATH = '/api/v1/tenants/me/ownership/offers';

/**
 * Server code to refusal. Read as a TOTAL map of what the two services can
 * say: chora-tenancy's OWNERSHIP_* set plus the two gateway codes that can
 * reach these routes. A code missing here is not silently a refusal, it falls
 * through to `failed`, which is the honest answer for something this build has
 * never seen.
 */
const REFUSAL_BY_CODE: Readonly<Record<string, OwnershipRefusal>> = {
  OWNERSHIP_OWNER_REQUIRED: 'owner_required',
  OWNERSHIP_NO_LIVE_OWNER: 'no_live_owner',
  OWNERSHIP_OFFER_ALREADY_PENDING: 'offer_already_pending',
  OWNERSHIP_OFFER_NOT_FOUND: 'offer_not_found',
  OWNERSHIP_OFFER_NOT_PENDING: 'offer_not_pending',
  OWNERSHIP_OFFER_EXPIRED: 'offer_expired',
  OWNERSHIP_NOT_THE_NOMINEE: 'not_the_nominee',
  OWNERSHIP_NOT_THE_INITIATOR: 'not_the_initiator',
  OWNERSHIP_NOMINEE_NOT_A_MEMBER: 'nominee_not_a_member',
  OWNERSHIP_NOMINEE_SUSPENDED: 'nominee_suspended',
  OWNERSHIP_OUTGOING_OWNER_GONE: 'outgoing_owner_gone',
  OWNERSHIP_NO_OWNER_EVER: 'no_owner_ever',
  AUTH_PLATFORM_OPERATOR_REQUIRED: 'operator_required',
  GATEWAY_OPERATOR_REQUIRED: 'operator_required',
  GATEWAY_NO_ACTIVE_TENANT: 'no_active_tenant',
  GATEWAY_INVALID_REQUEST: 'invalid_request',
};

@Injectable({ providedIn: 'root' })
export class OwnershipService {
  private readonly bff = inject(BffClientService);

  private readonly _offerState = signal<OwnershipOfferState>({ status: 'loading' });
  readonly offerState = this._offerState.asReadonly();

  /**
   * Fetch the tenant's open offer.
   *
   * A 404 is `none`, not an error. Most organisations have no handover in
   * flight, so the refusal that says so is the ordinary case; rendering it as a
   * fault would put a red banner on every healthy screen.
   */
  loadOffer(): void {
    this._offerState.set({ status: 'loading' });
    this.bff
      .get<OwnershipOffer>(OFFER_PATH)
      .pipe(
        take(1),
        map((offer): OwnershipOfferState => ({ status: 'open', offer })),
        catchError((err: unknown) => of(this.readFailure(err))),
      )
      .subscribe((s) => this._offerState.set(s));
  }

  /** S7a. Offer ownership to a member of this organisation. */
  offer(toGcid: string, note?: string): Observable<OwnershipWriteResult> {
    const body: { to_gcid: string; note?: string } = { to_gcid: toGcid };
    const trimmed = (note ?? '').trim();
    // An empty note is absent, not blank: sending "" would store a note the
    // nominee is then shown as if the owner had written one.
    if (trimmed !== '') body.note = trimmed;
    return this.write(this.bff.post<OwnershipOffer>(OFFERS_PATH, body));
  }

  /**
   * S7a and S7b. Answer one offer BY ID, never "whatever is pending": between
   * the screen rendering an offer and the person answering it, that offer can
   * be withdrawn and another opened.
   */
  settle(offerId: string, verb: OwnershipVerb): Observable<OwnershipWriteResult> {
    return this.write(
      this.bff.post<unknown>(`${OFFERS_PATH}/${encodeURIComponent(offerId)}/${verb}`, {}),
    );
  }

  /**
   * S7c. The operator override, for an owner who has left, closed their
   * account or is unreachable. The reason is mandatory and is kept with the
   * record; acceptance is still required from the nominee.
   */
  assignOwner(
    tenantId: string,
    toGcid: string,
    reason: string,
  ): Observable<OwnershipWriteResult> {
    return this.write(
      this.bff.post<OwnershipOffer>(
        `/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/ownership/offers`,
        { to_gcid: toGcid, reason },
      ),
    );
  }

  /** Shared write tail: success carries the offer, a named code carries a reason. */
  private write(source: Observable<unknown>): Observable<OwnershipWriteResult> {
    return source.pipe(
      take(1),
      map(
        (offer): OwnershipWriteResult => ({
          kind: 'success',
          offer: (offer ?? undefined) as OwnershipOffer | undefined,
        }),
      ),
      catchError((err: unknown) => of(this.writeFailure(err))),
    );
  }

  /**
   * Classify a read failure. The tenant-less session is named separately
   * because its remedy is to switch organisation, not to retry or to sign in
   * again, which is what a generic message would send an operator to do.
   */
  private readFailure(err: unknown): OwnershipOfferState {
    const view = httpErrorView(err);
    if (view?.status === 404) return { status: 'none' };
    if (errorCodeOf(view) === 'GATEWAY_NO_ACTIVE_TENANT') {
      return { status: 'error', error: 'hplus.ownership.error_no_active_tenant' };
    }
    if (view?.status === 403) {
      return { status: 'error', error: 'hplus.ownership.error_forbidden' };
    }
    return { status: 'error', error: 'hplus.ownership.error_generic' };
  }

  /**
   * Classify a write failure. Keyed on the envelope CODE, not the status: the
   * same 409 carries five different situations here, and the status alone
   * cannot tell a pending offer from a suspended nominee.
   */
  private writeFailure(err: unknown): OwnershipWriteResult {
    const view = httpErrorView(err);
    const code = errorCodeOf(view);
    const reason = code ? REFUSAL_BY_CODE[code] : undefined;
    if (reason) return { kind: 'refused', reason };
    return { kind: 'failed', error: 'hplus.ownership.error_generic' };
  }
}
