/**
 * ReadinessService, the single read behind H+ S1 (`/h/ready`) and S6
 * (`/h/go-live`).
 *
 * One service, two thin components. Both screens render the SAME server
 * verdicts with different framing, and that is the whole reason the semantics
 * live in the gateway aggregator rather than here: if either screen computed
 * a status, the two could disagree about one instance and an operator would
 * have no way to tell which was lying.
 *
 * So this service is a PIPE. It fetches, it maps transport failures to i18n
 * keys, and it hands the rows through in the server's order without sorting,
 * filtering, defaulting or deriving anything. There is deliberately no
 * "computeStatus" helper in this file, and adding one is the change that
 * would break the contract.
 */
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type { ReadinessReport, ReadinessState } from './readiness.model';

/** BFF route served by the gateway readiness aggregator. */
const READINESS_PATH = '/api/v1/admin/readiness';

@Injectable({ providedIn: 'root' })
export class ReadinessService {
  private readonly bff = inject(BffClientService);

  private readonly _state = signal<ReadinessState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /**
   * Fetch the readiness report and publish to `state`. Called by each
   * component on init and by the retry CTA, so it is safe to call repeatedly
   * and always returns to `loading` first: leaving a stale error on screen
   * while a retry is in flight would make the retry look like it did nothing.
   */
  load(): void {
    this._state.set({ status: 'loading' });
    this.bff
      .get<ReadinessReport>(READINESS_PATH)
      .pipe(
        take(1),
        map((report): ReadinessState => ({ status: 'success', report })),
        catchError((err: unknown) =>
          of<ReadinessState>({ status: 'error', error: this.errorKey(err) }),
        ),
      )
      .subscribe((s) => this._state.set(s));
  }

  /**
   * Map a transport failure to its own message key. The four the aggregator
   * documents get distinct keys because they need distinct operator actions:
   * a 403 is the wrong account, a 400 is a session with no tenant, a 503 is
   * a deployment that never wired the downstream bases, and a 500 is the
   * aggregator itself. Collapsing them into one "something went wrong" would
   * send an operator hunting an outage when the real answer is that they are
   * signed in as the wrong person.
   *
   * The raw backend body never reaches the state. It can carry SQL text.
   */
  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    switch (e?.status) {
      case 403:
        return 'hplus.readiness.error_forbidden';
      case 400:
        return 'hplus.readiness.error_no_tenant';
      case 503:
        return 'hplus.readiness.error_unwired';
    }
    if (typeof e?.status === 'number' && e.status >= 500) {
      return 'hplus.readiness.error_upstream';
    }
    return 'hplus.readiness.error_generic';
  }
}
