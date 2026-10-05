import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PendingActionService, PendingAction } from '../../core/services/pending-action.service';
import { LandingService } from '../../core/auth/landing.service';

@Component({
  selector: 'chora-invite-handler',
  template: `<div class="invite-handler"><p>Processing invitation...</p></div>`,
  styles: [
    `
      .invite-handler {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        color: var(--chora-color-text-secondary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteHandlerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly pendingAction = inject(PendingActionService);
  private readonly landing = inject(LandingService);

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code') ?? '';
    const type = this.route.snapshot.data['actionType'] as PendingAction['type'];

    if (code) {
      this.pendingAction.capture({ type, code, capturedAt: Date.now() });
    }

    if (this.auth.isAuthenticated()) {
      this.router.navigate([this.landing.landingRoute()]);
    } else {
      // Self-service registration was removed with the Firebase extraction —
      // an invitee signs in with their EXISTING account (the pending action
      // is replayed after login), so the unauth target is /login.
      this.router.navigate(['/login']);
    }
  }
}
