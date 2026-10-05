/**
 * FamiliarCheckoutResultComponent — Stripe Checkout return landing for the
 * egg marketplace (CHO-2028).
 *
 * chora-tenancy's Stripe config redirects the browser back to
 *   /a/companion/marketplace/checkout/success   (payment completed)
 *   /a/companion/marketplace/checkout/cancel    (checkout abandoned)
 * (STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL). Neither route existed, so both
 * legs fell through to /not-found right after a real payment.
 *
 * Which leg to render comes from route `data.outcome` — one component, two
 * route registrations. Success copy sets the expectation that provisioning
 * is asynchronous (Stripe webhook → payments capture event → consumption
 * ProvisionEgg), though in practice it lands within seconds.
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'chora-aplus-familiar-checkout-result',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './familiar-checkout-result.component.html',
  styleUrl: './familiar-checkout-result.component.scss',
})
export class FamiliarCheckoutResultComponent {
  private readonly route = inject(ActivatedRoute);

  /** 'success' | 'cancel' — stamped by the route registration. */
  readonly outcome = signal<'success' | 'cancel'>(
    (this.route.snapshot.data['outcome'] as 'success' | 'cancel') ?? 'cancel',
  );
}
