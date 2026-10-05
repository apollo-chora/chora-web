/**
 * CreateTenantService: the H+ create-organisation call (UX Track U, E1, S2).
 *
 * Talks to the real BFF. No optimistic local state: this call creates a tenant,
 * its owner membership and its durable add-on entitlements in one upstream
 * transaction, and the only honest confirmation is the 201 that transaction
 * produced.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import {
  CREATE_TENANT_ERROR_FALLBACK,
  CREATE_TENANT_ERROR_KEYS,
  CREATE_TENANT_STATUS_KEYS,
  SUB_TENANTS_PATH,
  type CreateSubTenantRequest,
  type CreatedTenant,
} from './create-tenant.model';

@Injectable({ providedIn: 'root' })
export class CreateTenantService {
  private readonly bff = inject(BffClientService);

  create(req: CreateSubTenantRequest): Observable<CreatedTenant> {
    return this.bff.post<CreatedTenant>(SUB_TENANTS_PATH, req);
  }
}

/** What the operator is told, and why. */
export interface CreateTenantFailure {
  readonly key: string;
  /**
   * The gateway's own message, when it sent one. Carried because the 400 code
   * is the same for every rejected field, so the code alone cannot say which.
   */
  readonly detail: string | null;
}

/**
 * Maps a failed create to copy.
 *
 * The BE error code lives on the response BODY: the global errorInterceptor
 * rethrows every HTTP failure as ApiError, so `err instanceof HttpErrorResponse`
 * never fires at runtime. `httpErrorView` normalises both shapes.
 */
export function createTenantFailure(err: unknown): CreateTenantFailure {
  const view = httpErrorView(err);
  if (!view) return { key: CREATE_TENANT_ERROR_FALLBACK, detail: null };

  const body = view.body as
    | { error?: { code?: string; message?: string } }
    | undefined;
  const code = body?.error?.code;
  const detail = body?.error?.message?.trim() || null;

  if (code && CREATE_TENANT_ERROR_KEYS[code]) {
    return { key: CREATE_TENANT_ERROR_KEYS[code], detail };
  }
  const byStatus = CREATE_TENANT_STATUS_KEYS[view.status];
  if (byStatus) return { key: byStatus, detail };

  return { key: CREATE_TENANT_ERROR_FALLBACK, detail };
}
