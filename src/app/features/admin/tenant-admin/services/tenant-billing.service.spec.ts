/**
 * TenantBillingService spec — RED-phase tests for CHO-1773
 * (H+ Billing Wave 4 FE wire).
 *
 * Mirrors the [[strict-tdd-red-first]] discipline + the
 * tenant-addons-admin.service.spec.ts shape (CHO-1698 PR 2).
 *
 * Wire scenarios:
 *   listInvoices: happy / empty / pagination cursor / 401 / 5xx / network
 *   createCustomerPortalSession: happy / 422 no-stripe-customer / 401 / 5xx
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { TenantBillingService } from './tenant-billing.service';
import {
  ADMIN_TENANTS_ME_BILLING_PORTAL_PATH,
  ADMIN_TENANTS_ME_INVOICES_PATH,
  InvoiceRow,
  ListInvoicesResponse,
  PortalSessionResponse,
} from '../models/tenant-billing.model';
import { environment } from '../../../../../environments/environment';

const INVOICES_URL = `${environment.bffBaseUrl}${ADMIN_TENANTS_ME_INVOICES_PATH}`;
const PORTAL_URL = `${environment.bffBaseUrl}${ADMIN_TENANTS_ME_BILLING_PORTAL_PATH}`;

function row(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    stripe_invoice_id: 'in_test_001',
    number: 'INV-001',
    period_start: '2026-05-14T00:00:00Z',
    period_end: '2026-06-14T00:00:00Z',
    status: 'paid',
    total_cents: 4900,
    currency: 'usd',
    hosted_invoice_url: 'https://invoice.stripe.com/i/test_001',
    invoice_pdf_url: 'https://invoice.stripe.com/i/test_001/pdf',
    description: 'tms:starter',
    ...overrides,
  };
}

describe('TenantBillingService', () => {
  let svc: TenantBillingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(TenantBillingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('listInvoices', () => {
    it('GETs /api/v1/admin/tenants/me/invoices and maps success', async () => {
      const promise = firstValueFrom(svc.listInvoices({}));
      const req = httpMock.expectOne((r) =>
        r.url === INVOICES_URL && r.method === 'GET',
      );
      const body: ListInvoicesResponse = {
        items: [row(), row({ stripe_invoice_id: 'in_test_002' })],
        next_cursor: null,
      };
      req.flush(body);
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.items.length).toBe(2);
        expect(result.items[0].stripe_invoice_id).toBe('in_test_001');
        expect(result.nextCursor).toBeNull();
      }
    });

    it('treats an empty `items` array as success (NOT empty branch)', async () => {
      const promise = firstValueFrom(svc.listInvoices({}));
      const req = httpMock.expectOne(INVOICES_URL);
      const body: ListInvoicesResponse = { items: [], next_cursor: null };
      req.flush(body);
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.items.length).toBe(0);
      }
    });

    it('forwards limit + startingAfter as query params', async () => {
      const promise = firstValueFrom(
        svc.listInvoices({ limit: 25, startingAfter: 'in_test_prev' }),
      );
      const req = httpMock.expectOne(
        (r) =>
          r.url === INVOICES_URL &&
          r.params.get('limit') === '25' &&
          r.params.get('starting_after') === 'in_test_prev',
      );
      req.flush({ items: [], next_cursor: 'in_test_002' });
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.nextCursor).toBe('in_test_002');
      }
    });

    it('maps 401 → unauthenticated', async () => {
      const promise = firstValueFrom(svc.listInvoices({}));
      const req = httpMock.expectOne(INVOICES_URL);
      req.flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx → server-error', async () => {
      const promise = firstValueFrom(svc.listInvoices({}));
      const req = httpMock.expectOne(INVOICES_URL);
      req.flush('boom', { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status=0 (network failure) → network-error', async () => {
      const promise = firstValueFrom(svc.listInvoices({}));
      const req = httpMock.expectOne(INVOICES_URL);
      req.flush(null, { status: 0, statusText: 'unknown' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  describe('createCustomerPortalSession', () => {
    it('POSTs return_url and maps success → { url }', async () => {
      const promise = firstValueFrom(
        svc.createCustomerPortalSession({
          return_url: 'http://localhost:4200/h/billing',
        }),
      );
      const req = httpMock.expectOne(PORTAL_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        return_url: 'http://localhost:4200/h/billing',
      });
      const body: PortalSessionResponse = {
        url: 'https://billing.stripe.com/p/session/test_xyz',
      };
      req.flush(body);
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.url).toBe('https://billing.stripe.com/p/session/test_xyz');
      }
    });

    it('maps 422 no_stripe_customer body → no-stripe-customer', async () => {
      const promise = firstValueFrom(
        svc.createCustomerPortalSession({ return_url: 'x' }),
      );
      const req = httpMock.expectOne(PORTAL_URL);
      req.flush(
        { error: 'no_stripe_customer', message: 'subscribe first' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      const result = await promise;
      expect(result.kind).toBe('no-stripe-customer');
    });

    it('maps generic 422 → validation-error', async () => {
      const promise = firstValueFrom(
        svc.createCustomerPortalSession({ return_url: 'x' }),
      );
      const req = httpMock.expectOne(PORTAL_URL);
      req.flush(
        { error: 'validation_failed', message: 'return_url required' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('maps 401 → unauthenticated', async () => {
      const promise = firstValueFrom(
        svc.createCustomerPortalSession({ return_url: 'x' }),
      );
      const req = httpMock.expectOne(PORTAL_URL);
      req.flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx → server-error', async () => {
      const promise = firstValueFrom(
        svc.createCustomerPortalSession({ return_url: 'x' }),
      );
      const req = httpMock.expectOne(PORTAL_URL);
      req.flush('boom', { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status=0 → network-error', async () => {
      const promise = firstValueFrom(
        svc.createCustomerPortalSession({ return_url: 'x' }),
      );
      const req = httpMock.expectOne(PORTAL_URL);
      req.flush(null, { status: 0, statusText: 'unknown' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });
});
