/**
 * EgressKillSwitchService — the O+ platform egress kill-switch (CHO-2148).
 *
 * Real BFF calls only. There is no stub and no optimistic local state: this
 * switch decides whether the whole platform may reach the open web, and a
 * fabricated "not engaged" would be indistinguishable from a real answer.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../../core/services/bff-client.service';
import { httpErrorView } from '../../../../../core/interceptors/api-error.model';
import {
  ADMIN_EGRESS_KILL_SWITCH_PATH,
  KILL_SWITCH_ERROR_FALLBACK,
  KILL_SWITCH_ERROR_KEYS,
  type EgressKillSwitch,
  type EgressKillSwitchPatch,
} from './egress-kill-switch.model';

@Injectable({ providedIn: 'root' })
export class EgressKillSwitchService {
  private readonly bff = inject(BffClientService);

  get(): Observable<EgressKillSwitch> {
    return this.bff.get<EgressKillSwitch>(ADMIN_EGRESS_KILL_SWITCH_PATH);
  }

  set(patch: EgressKillSwitchPatch): Observable<EgressKillSwitch> {
    return this.bff.patch<EgressKillSwitch>(ADMIN_EGRESS_KILL_SWITCH_PATH, patch);
  }
}

/**
 * Maps a failed call to an i18n key.
 *
 * The error code lives on the response BODY, not `.error` — the global
 * errorInterceptor rethrows HTTP failures as ApiError, so `err instanceof
 * HttpErrorResponse` never fires at runtime. `httpErrorView` normalises both.
 *
 * Both hops emit a code: the gateway (GATEWAY_FORBIDDEN) and observability
 * (OBS_FORBIDDEN). Either means the same thing to the operator.
 */
export function killSwitchErrorKey(err: unknown): string {
  const view = httpErrorView(err);
  if (!view) return KILL_SWITCH_ERROR_FALLBACK;

  const body = view.body as { code?: string; error?: { code?: string } } | undefined;
  const code = body?.code ?? body?.error?.code;
  if (code && KILL_SWITCH_ERROR_KEYS[code]) {
    return KILL_SWITCH_ERROR_KEYS[code];
  }

  if (view.status === 403) return 'oplus.egressKillSwitch.error.forbidden';
  if (view.status === 503) return 'oplus.egressKillSwitch.error.unwired';

  return KILL_SWITCH_ERROR_FALLBACK;
}
