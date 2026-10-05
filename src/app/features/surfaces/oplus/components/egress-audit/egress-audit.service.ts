/**
 * EgressAuditService — the O+ external-web egress audit read (CHO-2245).
 *
 * Real BFF calls only, one shape: a GET of the audit slice. There is no write
 * surface here — the platform override (the kill-switch) lives on its own
 * operator-only page. Read-only means the failure classification is what needs
 * care: a 403 must read as "you lack the role", never as an empty list.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../../core/services/bff-client.service';
import { httpErrorView } from '../../../../../core/interceptors/api-error.model';
import {
  EGRESS_AUDIT_ERROR_FALLBACK,
  EGRESS_AUDIT_ERROR_KEYS,
  OPLUS_EGRESS_AUDIT_PATH,
  type EgressAuditResponse,
} from './egress-audit.model';

@Injectable({ providedIn: 'root' })
export class EgressAuditService {
  private readonly bff = inject(BffClientService);

  list(): Observable<EgressAuditResponse> {
    return this.bff.get<EgressAuditResponse>(OPLUS_EGRESS_AUDIT_PATH);
  }
}

/**
 * Maps a failed read to an i18n key.
 *
 * The error code lives on the response BODY, not `.error` — the global
 * errorInterceptor rethrows HTTP failures as ApiError, so `err instanceof
 * HttpErrorResponse` never fires at runtime. `httpErrorView` normalises both
 * shapes and exposes the body.
 *
 * The status is the primary signal: 403 from the AuditorGate means the caller
 * lacks auditor/admin/owner; a 503 means chora-governance is unavailable. The
 * code map only pins the unavailable code so it still reads correctly if a
 * proxy rewrites the status.
 */
export function egressAuditErrorKey(err: unknown): string {
  const view = httpErrorView(err);
  if (!view) return EGRESS_AUDIT_ERROR_FALLBACK;

  const body = view.body as { code?: string; error?: { code?: string } } | undefined;
  const code = body?.code ?? body?.error?.code;
  if (code && EGRESS_AUDIT_ERROR_KEYS[code]) {
    return EGRESS_AUDIT_ERROR_KEYS[code];
  }

  if (view.status === 403) return 'oplus.egressAudit.error.forbidden';
  if (view.status === 503) return 'oplus.egressAudit.error.unavailable';

  return EGRESS_AUDIT_ERROR_FALLBACK;
}
