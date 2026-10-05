import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LandingService } from '../../core/auth/landing.service';

@Component({
  selector: 'chora-public-layout',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly landing = inject(LandingService);
  readonly isAuthenticated = this.auth.isAuthenticated;

  /**
   * Where the header's authenticated link points: the landing resolver's
   * answer, not a hard-coded `/dashboard` (C2 slice 3, ADR-240). Read once at
   * construction, which is when the shell renders it; the surfaces a session
   * holds do not change while it sits on a public page.
   *
   * The label moved from "Dashboard" to "Home" with it. A link named for one
   * destination and pointing at another is the shape a reader trusts and is
   * then wrong about.
   */
  readonly landingRoute = this.landing.landingRoute();
}
