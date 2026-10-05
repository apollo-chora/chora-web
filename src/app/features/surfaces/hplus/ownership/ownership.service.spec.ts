/**
 * OwnershipService specs (UX Track U, E3 slice 7).
 *
 * The HTTP harness installs the REAL interceptor chain. Six tenant-admin
 * services once branched on `instanceof HttpErrorResponse` and passed their
 * specs while being unreachable in production, because `errorInterceptor`
 * rethrows every failure as `ApiError` and a spec harness with no interceptors
 * never showed it (E1 item 4b). A service that classifies errors has to be
 * tested through the chain the app actually installs.
 */
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import { OwnershipService } from './ownership.service';
import type { OwnershipOffer } from './ownership.model';

const TENANT = '11111111-1111-7111-8111-111111111111';
const OWNER = '22222222-2222-7222-8222-222222222222';
const NOMINEE = '33333333-3333-7333-8333-333333333333';
const OFFER = '44444444-4444-7444-8444-444444444444';

/**
 * BffClientService wraps every path in `environment.bffBaseUrl`, so the specs
 * match on the SUFFIX. Asserting the bare path fails for the wrong reason and
 * reads as a routing bug, which is the sibling readiness spec's note too.
 */
const at =
  (path: string) =>
  (r: { url: string }): boolean =>
    r.url.endsWith(path);

const OFFER_BODY: OwnershipOffer = {
  offer_id: OFFER,
  tenant_id: TENANT,
  from_gcid: OWNER,
  to_gcid: NOMINEE,
  initiated_by: OWNER,
  initiator: 'owner',
  status: 'pending',
  is_live: true,
  created_at: '2026-09-02T00:00:00Z',
  expires_at: '2026-09-16T00:00:00Z',
};

describe('OwnershipService', () => {
  let svc: OwnershipService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        OwnershipService,
      ],
    });
    svc = TestBed.inject(OwnershipService);
    http = TestBed.inject(HttpTestingController);
  });

  describe('loadOffer', () => {
    it('publishes the open offer', () => {
      svc.loadOffer();
      http
        .expectOne(at('/api/v1/tenants/me/ownership/offer'))
        .flush(OFFER_BODY);

      const s = svc.offerState();
      expect(s.status).toBe('open');
      if (s.status === 'open') expect(s.offer.offer_id).toBe(OFFER);
    });

    it('reads a 404 as "no offer", never as an error', () => {
      svc.loadOffer();
      http
        .expectOne(at('/api/v1/tenants/me/ownership/offer'))
        .flush({ error: { code: 'OWNERSHIP_OFFER_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });

      expect(svc.offerState().status).toBe('none');
    });

    it('keeps a real failure as an error, not as "no offer"', () => {
      svc.loadOffer();
      http
        .expectOne(at('/api/v1/tenants/me/ownership/offer'))
        .flush({}, { status: 503, statusText: 'Service Unavailable' });

      expect(svc.offerState().status).toBe('error');
    });

    it('names the tenant-less session rather than reporting a generic fault', () => {
      svc.loadOffer();
      http.expectOne(at('/api/v1/tenants/me/ownership/offer')).flush(
        { error: { code: 'GATEWAY_NO_ACTIVE_TENANT' } },
        { status: 409, statusText: 'Conflict' },
      );

      const s = svc.offerState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('hplus.ownership.error_no_active_tenant');
      }
    });
  });

  describe('offer', () => {
    it('posts the nominee and never a from_gcid', () => {
      let result: unknown;
      svc.offer(NOMINEE, 'take good care of it').subscribe((r) => (result = r));

      const req = http.expectOne(at('/api/v1/tenants/me/ownership/offers'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ to_gcid: NOMINEE, note: 'take good care of it' });
      expect(Object.keys(req.request.body as object)).not.toContain('from_gcid');
      req.flush(OFFER_BODY, { status: 201, statusText: 'Created' });

      expect(result).toEqual({ kind: 'success', offer: OFFER_BODY });
    });

    it('omits an empty note rather than sending a blank one', () => {
      svc.offer(NOMINEE, '   ').subscribe();
      const req = http.expectOne(at('/api/v1/tenants/me/ownership/offers'));
      expect(req.request.body).toEqual({ to_gcid: NOMINEE });
      req.flush(OFFER_BODY, { status: 201, statusText: 'Created' });
    });

    it.each([
      ['OWNERSHIP_OWNER_REQUIRED', 403, 'owner_required'],
      ['OWNERSHIP_NO_LIVE_OWNER', 409, 'no_live_owner'],
      ['OWNERSHIP_OFFER_ALREADY_PENDING', 409, 'offer_already_pending'],
      ['OWNERSHIP_NOMINEE_NOT_A_MEMBER', 409, 'nominee_not_a_member'],
      ['OWNERSHIP_NOMINEE_SUSPENDED', 409, 'nominee_suspended'],
      ['GATEWAY_NO_ACTIVE_TENANT', 409, 'no_active_tenant'],
    ])('maps %s to its own refusal', (code, status, reason) => {
      let result: unknown;
      svc.offer(NOMINEE).subscribe((r) => (result = r));
      http
        .expectOne(at('/api/v1/tenants/me/ownership/offers'))
        .flush({ error: { code } }, { status, statusText: 'Refused' });

      expect(result).toEqual({ kind: 'refused', reason });
    });

    it('does NOT dress an unknown failure as a refusal', () => {
      let result: unknown;
      svc.offer(NOMINEE).subscribe((r) => (result = r));
      http
        .expectOne(at('/api/v1/tenants/me/ownership/offers'))
        .flush({}, { status: 500, statusText: 'Server Error' });

      expect(result).toMatchObject({ kind: 'failed' });
    });

    it('classifies through the real interceptor chain, not instanceof', () => {
      // A guard against the E1 item 4b defect: the chain rethrows failures as
      // ApiError, so a service branching on HttpErrorResponse sees nothing.
      let seen: unknown;
      svc.offer(NOMINEE).subscribe((r) => (seen = r));
      http
        .expectOne(at('/api/v1/tenants/me/ownership/offers'))
        .flush({ error: { code: 'OWNERSHIP_OWNER_REQUIRED' } }, { status: 403, statusText: 'Forbidden' });

      expect(seen).toEqual({ kind: 'refused', reason: 'owner_required' });
      expect(seen).not.toBeInstanceOf(HttpErrorResponse);
    });
  });

  describe('settle', () => {
    it.each(['accept', 'decline', 'revoke'] as const)('posts the %s verb with the offer id', (verb) => {
      svc.settle(OFFER, verb).subscribe();
      const req = http.expectOne(at(`/api/v1/tenants/me/ownership/offers/${OFFER}/${verb}`));
      expect(req.request.method).toBe('POST');
      req.flush({ offer_id: OFFER, status: 'settled' });
    });

    it.each([
      ['OWNERSHIP_NOT_THE_NOMINEE', 403, 'not_the_nominee'],
      ['OWNERSHIP_NOT_THE_INITIATOR', 403, 'not_the_initiator'],
      ['OWNERSHIP_OFFER_NOT_FOUND', 404, 'offer_not_found'],
      ['OWNERSHIP_OFFER_NOT_PENDING', 409, 'offer_not_pending'],
      ['OWNERSHIP_OFFER_EXPIRED', 409, 'offer_expired'],
      ['OWNERSHIP_OUTGOING_OWNER_GONE', 409, 'outgoing_owner_gone'],
    ])('maps %s to its own refusal', (code, status, reason) => {
      let result: unknown;
      svc.settle(OFFER, 'accept').subscribe((r) => (result = r));
      http
        .expectOne(at(`/api/v1/tenants/me/ownership/offers/${OFFER}/accept`))
        .flush({ error: { code } }, { status, statusText: 'Refused' });

      expect(result).toEqual({ kind: 'refused', reason });
    });
  });

  describe('assignOwner (the operator override)', () => {
    it('posts to the tenant path with the reason', () => {
      svc.assignOwner(TENANT, NOMINEE, 'the owner left the company').subscribe();
      const req = http.expectOne(at(`/api/v1/admin/tenants/${TENANT}/ownership/offers`));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        to_gcid: NOMINEE,
        reason: 'the owner left the company',
      });
      req.flush(OFFER_BODY, { status: 201, statusText: 'Created' });
    });

    it.each([
      ['AUTH_PLATFORM_OPERATOR_REQUIRED', 403, 'operator_required'],
      ['GATEWAY_OPERATOR_REQUIRED', 403, 'operator_required'],
      ['OWNERSHIP_NO_OWNER_EVER', 409, 'no_owner_ever'],
    ])('maps %s to its own refusal', (code, status, reason) => {
      let result: unknown;
      svc.assignOwner(TENANT, NOMINEE, 'r').subscribe((r) => (result = r));
      http
        .expectOne(at(`/api/v1/admin/tenants/${TENANT}/ownership/offers`))
        .flush({ error: { code } }, { status, statusText: 'Refused' });

      expect(result).toEqual({ kind: 'refused', reason });
    });
  });
});
