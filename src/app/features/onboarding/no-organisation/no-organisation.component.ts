/**
 * NoOrganisationComponent, the named refusal for a resolved session that
 * carries no organisation. Route `/welcome/no-organisation`.
 *
 * Replaces the `/welcome/no-tenant` form, which asked the user to join an
 * organisation by code and whose only possible outcome was 409 already-member
 * (first-launch spec 5.1). Repairing that form would have contradicted the
 * operator-only ruling that gates tenant creation, so the form is retired
 * rather than fixed.
 *
 * Why this is a refusal and not an onboarding page. Since ADR-182,
 * chora-identity's resolve handler auto-enrols a zero-membership GCID into
 * chora-master and re-lists, so a tenantless session does not exist in a
 * healthy system. An empty membership list means the enrol or the tenancy
 * read failed upstream. That is a fault to report, not a state to onboard
 * out of, and the two look identical to a user unless the screen says which
 * one it is.
 *
 * So this screen states the fault, shows the identity error code when the
 * interceptor captured one (`IDENTITY_ENROL_FAILED` or
 * `IDENTITY_TENANCY_UNAVAILABLE`, both 503s from resolve_handler.go), and
 * offers a retry and a sign-out. It never redirects on its own: the guard
 * sends users here, so navigating away would loop.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService } from '../../../core/auth/auth.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'chora-no-organisation',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './no-organisation.component.html',
  styleUrl: './no-organisation.component.scss',
})
export class NoOrganisationComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: null,
  });

  /**
   * The identity error code, when one reached us. Shown verbatim so a user
   * can quote it to support and an operator can grep for it. Empty when the
   * guard sent the user here without one, which is itself informative: the
   * session resolved, it simply carried no organisation.
   */
  readonly code = computed<string>(() => this.params()?.get('code') ?? '');

  readonly hasCode = computed<boolean>(() => this.code() !== '');

  /**
   * Retry by returning to the landing resolver rather than reloading this
   * screen. A fresh resolve is the only thing that can change the answer.
   */
  retry(): void {
    void this.router.navigate(['/']);
  }

  signOut(): void {
    this.auth.logout();
  }
}
