/**
 * ExternalEgressService — the H+ tenant external web-egress entitlement
 * (CHO-2148).
 *
 * Talks to the real BFF (`/api/v1/admin/tenants/me/external-egress`, phyllis →
 * chora-tenancy). No stubs, no optimistic local state: a write here decides
 * whether a whole tenant's learners may reach the open web, and the answer must
 * come back from the service that actually persisted it.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import {
  ADMIN_TENANTS_ME_EXTERNAL_EGRESS_PATH,
  EXTERNAL_EGRESS_ERROR_FALLBACK,
  EXTERNAL_EGRESS_ERROR_KEYS,
  type ExternalEgressPatch,
  type ExternalEgressPolicy,
} from './external-egress.model';

@Injectable({ providedIn: 'root' })
export class ExternalEgressService {
  private readonly bff = inject(BffClientService);

  /** Read the tenant's policy. A never-opted-in tenant reads back the
   *  fail-closed default (egress_enabled=false, opted_in=false). */
  get(): Observable<ExternalEgressPolicy> {
    return this.bff.get<ExternalEgressPolicy>(
      ADMIN_TENANTS_ME_EXTERNAL_EGRESS_PATH,
    );
  }

  /** Change the tenant's policy. Merge semantics — an omitted field is left
   *  alone upstream, never reset to its zero value. */
  update(patch: ExternalEgressPatch): Observable<ExternalEgressPolicy> {
    return this.bff.patch<ExternalEgressPolicy>(
      ADMIN_TENANTS_ME_EXTERNAL_EGRESS_PATH,
      patch,
    );
  }
}

/**
 * Maps a failed call to an i18n key.
 *
 * The BE error code lives on the response BODY, not on `.error` — the global
 * errorInterceptor rethrows every HTTP failure as ApiError, so `err instanceof
 * HttpErrorResponse` never fires at runtime. `httpErrorView` normalises both.
 */
export function externalEgressErrorKey(err: unknown): string {
  const view = httpErrorView(err);
  if (!view) return EXTERNAL_EGRESS_ERROR_FALLBACK;

  const body = view.body as { error?: { code?: string } } | undefined;
  const code = body?.error?.code;
  if (code && EXTERNAL_EGRESS_ERROR_KEYS[code]) {
    return EXTERNAL_EGRESS_ERROR_KEYS[code];
  }

  // Fall back on status when the body carries no recognised code.
  if (view.status === 403) return EXTERNAL_EGRESS_ERROR_KEYS['forbidden'];
  if (view.status === 409) return EXTERNAL_EGRESS_ERROR_KEYS['conflict'];
  if (view.status === 422) return EXTERNAL_EGRESS_ERROR_KEYS['validation_failed'];
  if (view.status === 503) return EXTERNAL_EGRESS_ERROR_KEYS['egress_policy_unwired'];

  return EXTERNAL_EGRESS_ERROR_FALLBACK;
}
