/**
 * TenantEntitlementsReadbackService, the setup wizard's step 2 read of the
 * DURABLE add-on grant (E5 slice 2).
 *
 * ⚠ Read the model file header before changing the path this calls. There are
 * two add-on endpoints and only one of them is the organisation's plan; this
 * service exists precisely so step 2 can never render the other.
 *
 * Per chora-web/CLAUDE.md section 3 (BFF-only): goes through
 * BffClientService, never HttpClient directly, never fetch.
 *
 * Fault contract: the Observable NEVER errors. Every failure resolves to a
 * discriminated `kind` the component renders, mirroring the shape the sibling
 * wizard services use.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  errorCodeOf,
  httpErrorView,
  NO_ACTIVE_TENANT_CODE,
} from '../../../../core/interceptors/api-error.model';
import {
  ENTITLEMENTS_READBACK_PATH,
  EntitlementsReadbackResult,
  EntitlementsReadbackWire,
  TENANT_NOT_RESOLVED_CODE,
} from '../models/tenant-entitlements-readback.model';

/** The only entitlement lifecycle state chora-web treats as granted. */
const ACTIVE_STATUS = 'active';

@Injectable({ providedIn: 'root' })
export class TenantEntitlementsReadbackService {
  private readonly bff = inject(BffClientService);

  /**
   * Read the add-ons this organisation actually holds.
   *
   * Rows are kept in server order and their codes are passed through
   * verbatim: mapping them against a client-side catalogue here would hide
   * any grant the catalogue has not caught up with, and the catalogue is a
   * hardcoded list in the wizard component.
   */
  readGrantedAddOns(): Observable<EntitlementsReadbackResult> {
    return this.bff
      .get<EntitlementsReadbackWire>(ENTITLEMENTS_READBACK_PATH)
      .pipe(
        map((wire): EntitlementsReadbackResult => {
          const active = (wire.items ?? []).filter(
            (row) => row.status === ACTIVE_STATUS,
          );
          const codes: string[] = [];
          let uncodedCount = 0;
          for (const row of active) {
            const code = row.addon_code?.trim() ?? '';
            if (code.length === 0) {
              // A granted row we cannot name. Counted, never dropped: an
              // operator told "3 add-ons" when 4 are granted has been told
              // something false about their own organisation.
              uncodedCount++;
              continue;
            }
            codes.push(code);
          }
          return { kind: 'success', readback: { codes, uncodedCount } };
        }),
        catchError((err: unknown) => of(this.classify(err))),
      );
  }

  private classify(err: unknown): EntitlementsReadbackResult {
    // httpErrorView, not `instanceof HttpErrorResponse`: the app-wide
    // errorInterceptor rethrows every failure as ApiError, so an instanceof
    // switch matches in specs and never in the running app.
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'network-error' };
    }
    const code = errorCodeOf(view);
    // Two codes, two statuses, one meaning: this session has no organisation.
    // The gateway sends 400 GATEWAY_TENANT_NOT_RESOLVED for this read while
    // the sibling wizard writes get 409 GATEWAY_NO_ACTIVE_TENANT. Both are
    // matched on the CODE, so a plain 400 stays a server error rather than
    // sending an operator to fix an organisation that is not the problem.
    if (code === TENANT_NOT_RESOLVED_CODE || code === NO_ACTIVE_TENANT_CODE) {
      return { kind: 'no-active-tenant' };
    }
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      default:
        return { kind: 'server-error' };
    }
  }
}
