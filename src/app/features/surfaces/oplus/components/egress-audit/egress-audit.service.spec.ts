/**
 * EgressAuditService specs (CHO-2245).
 *
 * The service is a thin read wrapper over the BFF. Mocking at the
 * BffClientService seam (the house pattern) keeps these unit-fast and proves
 * the two things that matter: the canonical path is hit, and a failure is
 * classified to the RIGHT i18n key — including the house gotcha that the error
 * code lives on `err.body`, NEVER `err.error` (the global errorInterceptor
 * rethrows every HTTP failure as ApiError, so `instanceof HttpErrorResponse`
 * never fires at runtime).
 */
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { EgressAuditService, egressAuditErrorKey } from './egress-audit.service';
import {
  OPLUS_EGRESS_AUDIT_PATH,
  type EgressAuditResponse,
} from './egress-audit.model';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import { ApiError } from '../../../../../core/interceptors/api-error.model';

const RESPONSE: EgressAuditResponse = {
  fetched_at: '2026-07-17T10:05:00Z',
  count: 1,
  items: [
    {
      event_id: 'e1',
      tenant_id: 't1',
      action: 'external_egress',
      decision: 'denied',
      reason: 'external egress denied; denial_reason=model_armor_pre_block',
      subject_type: 'agent',
      subject_id: 'familiar_seeker',
      created_at: '2026-07-17T10:00:00Z',
      after: { agentId: 'familiar_seeker', denialReason: 'model_armor_pre_block' },
    },
  ],
};

/** Minimal BffClientService double — only `get` is exercised by this service. */
class BffClientStub {
  get = vi.fn();
}

function make(): { svc: EgressAuditService; bff: BffClientStub } {
  const bff = new BffClientStub();
  TestBed.configureTestingModule({
    providers: [
      EgressAuditService,
      { provide: BffClientService, useValue: bff },
    ],
  });
  return { svc: TestBed.inject(EgressAuditService), bff };
}

describe('EgressAuditService', () => {
  it('reads the egress-audit slice from the canonical BFF path', () => {
    const { svc, bff } = make();
    bff.get.mockReturnValue(of(RESPONSE));

    let received: EgressAuditResponse | undefined;
    svc.list().subscribe((r) => (received = r));

    expect(bff.get).toHaveBeenCalledTimes(1);
    expect(bff.get).toHaveBeenCalledWith(OPLUS_EGRESS_AUDIT_PATH);
    expect(received).toEqual(RESPONSE);
  });
});

describe('egressAuditErrorKey', () => {
  it('maps a 403 to the insufficient-role key', () => {
    // The AuditorGate refuses non-auditor/admin/owner callers with a 403.
    const err = new ApiError(
      403,
      { code: 'GATEWAY_FORBIDDEN', message: 'auditor role required', correlation_id: 'c1' },
      { code: 'GATEWAY_FORBIDDEN' },
    );
    expect(egressAuditErrorKey(err)).toBe('oplus.egressAudit.error.forbidden');
  });

  it('maps a 403 HttpErrorResponse too (spec-context, no interceptor)', () => {
    const err = new HttpErrorResponse({ status: 403, error: { code: 'GATEWAY_FORBIDDEN' } });
    expect(egressAuditErrorKey(err)).toBe('oplus.egressAudit.error.forbidden');
  });

  it('maps a governance-unavailable code off err.body (NOT err.error)', () => {
    // The code lives on the response BODY; ApiError.body carries it.
    const err = new ApiError(
      503,
      { code: 'GATEWAY_GOVERNANCE_UNAVAILABLE', message: 'unavailable', correlation_id: 'c2' },
      { code: 'GATEWAY_GOVERNANCE_UNAVAILABLE' },
    );
    expect(egressAuditErrorKey(err)).toBe('oplus.egressAudit.error.unavailable');
  });

  it('maps a bare 503 to the unavailable key by status', () => {
    const err = new HttpErrorResponse({ status: 503 });
    expect(egressAuditErrorKey(err)).toBe('oplus.egressAudit.error.unavailable');
  });

  it('falls back to the generic key for an unrecognised failure', () => {
    expect(egressAuditErrorKey('not-an-http-error')).toBe('oplus.egressAudit.error.generic');
  });
});
