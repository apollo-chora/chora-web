import { expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AccountLifecycleService } from './account-lifecycle.service';
import type { ClosureStatusResponse } from './account-lifecycle.service';
import { environment } from '../../../../../environments/environment';
import type {
  AdminAccountListResponse,
  LifecycleEventListResponse,
} from '../models/account-lifecycle.model';

const BASE = environment.bffBaseUrl;
const ACCOUNTS = `${BASE}/api/v1/admin/accounts`;
const ME_CLOSE = `${BASE}/api/v1/me/account/close`;
const ME_CANCEL = `${BASE}/api/v1/me/account/close/cancel`;
const ME_CLOSURE = `${BASE}/api/v1/me/account/closure`;
const GCID = '00000000-0000-7000-8000-000000001999';
const SAGA_ID = '00000000-0000-7000-8000-000000002888';

const closingSaga: ClosureStatusResponse = {
  saga_id: SAGA_ID,
  gcid: GCID,
  state: 'closing',
  grace_ends_at: '2026-07-12T00:00:00Z',
  requested_at: '2026-06-12T00:00:00Z',
};

describe('AccountLifecycleService', () => {
  let service: AccountLifecycleService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AccountLifecycleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // getAccounts
  // -------------------------------------------------------------------------

  describe('getAccounts', () => {
    it('GETs the accounts path with default page/pageSize and no state/search', async () => {
      const promise = firstValueFrom(service.getAccounts());

      const req = httpMock.expectOne(
        `${ACCOUNTS}?page=1&pageSize=25`,
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('25');
      expect(req.request.params.has('state')).toBe(false);
      expect(req.request.params.has('search')).toBe(false);

      const body: AdminAccountListResponse = {
        accounts: [
          {
            gcid: GCID,
            email: 'learner@example.com',
            displayName: 'Learner One',
            state: 'active',
            roles: ['LEARNER'],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-02T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      };
      req.flush(body);

      const result = await promise;
      expect(result.total).toBe(1);
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]!.gcid).toBe(GCID);
      expect(result.accounts[0]!.state).toBe('active');
    });

    it('includes state and search query params when provided', async () => {
      const promise = firstValueFrom(
        service.getAccounts(3, 10, 'suspended', 'chen'),
      );

      const req = httpMock.expectOne(
        (r) =>
          r.url === ACCOUNTS &&
          r.params.get('page') === '3' &&
          r.params.get('pageSize') === '10' &&
          r.params.get('state') === 'suspended' &&
          r.params.get('search') === 'chen',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ accounts: [], total: 0, page: 3, pageSize: 10 });

      const result = await promise;
      expect(result.page).toBe(3);
      expect(result.accounts).toEqual([]);
    });

    it('omits state but keeps search when only search is provided', async () => {
      const promise = firstValueFrom(
        service.getAccounts(1, 25, undefined, 'foo'),
      );

      const req = httpMock.expectOne(
        (r) =>
          r.url === ACCOUNTS &&
          r.params.get('search') === 'foo' &&
          !r.params.has('state'),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ accounts: [], total: 0, page: 1, pageSize: 25 });

      await promise;
    });

    it('propagates a 500 server error', async () => {
      const promise = firstValueFrom(service.getAccounts());

      const req = httpMock.expectOne(`${ACCOUNTS}?page=1&pageSize=25`);
      req.flush('boom', {
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(promise).rejects.toMatchObject({ status: 500 });
    });
  });

  // -------------------------------------------------------------------------
  // suspendAccount
  // -------------------------------------------------------------------------

  describe('suspendAccount', () => {
    it('POSTs to the suspend path with the reason in the body', async () => {
      const promise = firstValueFrom(
        service.suspendAccount({ gcid: GCID, reason: 'policy violation' }),
      );

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/suspend`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ reason: 'policy violation' });
      req.flush(null);

      await promise;
    });

    it('URL-encodes a gcid that contains reserved characters', async () => {
      const dirty = 'gcid with/slash';
      const promise = firstValueFrom(
        service.suspendAccount({ gcid: dirty, reason: 'r' }),
      );

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(dirty)}/suspend`,
      );
      expect(req.request.method).toBe('POST');
      req.flush(null);

      await promise;
    });

    it('propagates a 409 conflict error', async () => {
      const promise = firstValueFrom(
        service.suspendAccount({ gcid: GCID, reason: 'r' }),
      );

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/suspend`,
      );
      req.flush('already suspended', {
        status: 409,
        statusText: 'Conflict',
      });

      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  // -------------------------------------------------------------------------
  // reactivateAccount
  // -------------------------------------------------------------------------

  describe('reactivateAccount', () => {
    it('POSTs to the reactivate path with an empty body', async () => {
      const promise = firstValueFrom(service.reactivateAccount(GCID));

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/reactivate`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(null);

      await promise;
    });

    it('propagates a 404 not-found error', async () => {
      const promise = firstValueFrom(service.reactivateAccount(GCID));

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/reactivate`,
      );
      req.flush('not found', { status: 404, statusText: 'Not Found' });

      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  // -------------------------------------------------------------------------
  // closeAccount (PLATFORM_OPERATOR route)
  // -------------------------------------------------------------------------

  describe('closeAccount', () => {
    it('POSTs to the ADMIN close path with the reason in the body', async () => {
      const promise = firstValueFrom(
        service.closeAccount({ gcid: GCID, reason: 'user requested' }),
      );

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/close`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ reason: 'user requested' });
      req.flush(closingSaga);

      const result = await promise;
      expect(result.saga_id).toBe(SAGA_ID);
      expect(result.state).toBe('closing');
    });

    it('includes fast_close only when explicitly requested', async () => {
      const promise = firstValueFrom(
        service.closeAccount(
          { gcid: GCID, reason: 'test account cleanup' },
          { fastClose: true },
        ),
      );

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/close`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        reason: 'test account cleanup',
        fast_close: true,
      });
      req.flush(closingSaga);

      await promise;
    });

    it('propagates a 403 forbidden error (caller lacks PLATFORM_OPERATOR)', async () => {
      const promise = firstValueFrom(
        service.closeAccount({ gcid: GCID, reason: 'r' }),
      );

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/close`,
      );
      req.flush('forbidden', { status: 403, statusText: 'Forbidden' });

      await expect(promise).rejects.toMatchObject({ status: 403 });
    });
  });

  // -------------------------------------------------------------------------
  // closeOwnAccount (self-close — me-route, CHO-1719)
  // -------------------------------------------------------------------------

  describe('closeOwnAccount', () => {
    it('POSTs to the me-route with the reason — identity comes from the session, never the body', async () => {
      const promise = firstValueFrom(service.closeOwnAccount('leaving'));

      const req = httpMock.expectOne(ME_CLOSE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ reason: 'leaving' });
      req.flush(closingSaga, { status: 202, statusText: 'Accepted' });

      const result = await promise;
      expect(result.saga_id).toBe(SAGA_ID);
      expect(result.state).toBe('closing');
      expect(result.grace_ends_at).toBe('2026-07-12T00:00:00Z');
    });

    it('sends an empty body when no reason is given', async () => {
      const promise = firstValueFrom(service.closeOwnAccount());

      const req = httpMock.expectOne(ME_CLOSE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(closingSaga, { status: 202, statusText: 'Accepted' });

      await promise;
    });

    it('propagates a 409 conflict (saga already exists)', async () => {
      const promise = firstValueFrom(service.closeOwnAccount('again'));

      const req = httpMock.expectOne(ME_CLOSE);
      req.flush(
        { error: { code: 'CLOSURE_ALREADY_EXISTS', message: 'saga exists' } },
        { status: 409, statusText: 'Conflict' },
      );

      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  // -------------------------------------------------------------------------
  // cancelOwnClosure
  // -------------------------------------------------------------------------

  describe('cancelOwnClosure', () => {
    it('POSTs the closure_id (+ reason) to the cancel me-route', async () => {
      const promise = firstValueFrom(
        service.cancelOwnClosure(SAGA_ID, 'changed my mind'),
      );

      const req = httpMock.expectOne(ME_CANCEL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        closure_id: SAGA_ID,
        reason: 'changed my mind',
      });
      req.flush({
        saga_id: SAGA_ID,
        gcid: GCID,
        state: 'active',
        cancelled_at: '2026-06-12T01:00:00Z',
      } satisfies ClosureStatusResponse);

      const result = await promise;
      expect(result.state).toBe('active');
      expect(result.cancelled_at).toBe('2026-06-12T01:00:00Z');
    });

    it('omits reason from the body when not given', async () => {
      const promise = firstValueFrom(service.cancelOwnClosure(SAGA_ID));

      const req = httpMock.expectOne(ME_CANCEL);
      expect(req.request.body).toEqual({ closure_id: SAGA_ID });
      req.flush({ saga_id: SAGA_ID, gcid: GCID, state: 'active' });

      await promise;
    });

    it('propagates a 409 (grace window passed — CLOSURE_CANCEL_TOO_LATE)', async () => {
      const promise = firstValueFrom(service.cancelOwnClosure(SAGA_ID));

      const req = httpMock.expectOne(ME_CANCEL);
      req.flush(
        { error: { code: 'CLOSURE_CANCEL_TOO_LATE', message: 'past grace' } },
        { status: 409, statusText: 'Conflict' },
      );

      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  // -------------------------------------------------------------------------
  // getOwnClosureStatus
  // -------------------------------------------------------------------------

  describe('getOwnClosureStatus', () => {
    it('GETs the closure me-route with the closure_id query param', async () => {
      const promise = firstValueFrom(service.getOwnClosureStatus(SAGA_ID));

      const req = httpMock.expectOne(
        (r) => r.url === ME_CLOSURE && r.params.get('closure_id') === SAGA_ID,
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        ...closingSaga,
        domain_acks: [{ domain: 'creation', acked_at: '2026-06-12T02:00:00Z' }],
      } satisfies ClosureStatusResponse);

      const result = await promise;
      expect(result.saga_id).toBe(SAGA_ID);
      expect(result.domain_acks).toHaveLength(1);
    });

    it('propagates a 404 (no saga / foreign saga — no existence oracle)', async () => {
      const promise = firstValueFrom(service.getOwnClosureStatus(SAGA_ID));

      const req = httpMock.expectOne(
        (r) => r.url === ME_CLOSURE && r.params.get('closure_id') === SAGA_ID,
      );
      req.flush(
        { error: { code: 'CLOSURE_NOT_FOUND', message: 'no closure saga' } },
        { status: 404, statusText: 'Not Found' },
      );

      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  // -------------------------------------------------------------------------
  // getLifecycleEvents
  // -------------------------------------------------------------------------

  describe('getLifecycleEvents', () => {
    it('GETs the lifecycle-events path with default page/pageSize', async () => {
      const promise = firstValueFrom(service.getLifecycleEvents(GCID));

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/lifecycle-events?page=1&pageSize=50`,
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('pageSize')).toBe('50');

      const body: LifecycleEventListResponse = {
        events: [
          {
            id: 'evt-1',
            gcid: GCID,
            eventType: 'account_suspended',
            actor: 'admin@example.com',
            actorType: 'admin',
            reason: 'policy violation',
            createdAt: '2026-02-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      };
      req.flush(body);

      const result = await promise;
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.eventType).toBe('account_suspended');
      expect(result.events[0]!.actorType).toBe('admin');
    });

    it('honours custom page/pageSize arguments', async () => {
      const promise = firstValueFrom(
        service.getLifecycleEvents(GCID, 2, 5),
      );

      const req = httpMock.expectOne(
        (r) =>
          r.url ===
            `${ACCOUNTS}/${encodeURIComponent(GCID)}/lifecycle-events` &&
          r.params.get('page') === '2' &&
          r.params.get('pageSize') === '5',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ events: [], total: 0, page: 2, pageSize: 5 });

      const result = await promise;
      expect(result.events).toEqual([]);
      expect(result.page).toBe(2);
    });

    it('propagates a 401 unauthorized error', async () => {
      const promise = firstValueFrom(service.getLifecycleEvents(GCID));

      const req = httpMock.expectOne(
        `${ACCOUNTS}/${encodeURIComponent(GCID)}/lifecycle-events?page=1&pageSize=50`,
      );
      req.flush('unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(promise).rejects.toMatchObject({ status: 401 });
    });
  });
});
